from __future__ import annotations

import asyncio
import json
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from job_manager import job_manager
from pipeline import run_pipeline
from schemas import JobStage, PipelineConfig

app = FastAPI(title="Image2Video API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TERMINAL_STAGES = {JobStage.completed, JobStage.failed, JobStage.cancelled}


@app.get("/api/jobs")
async def list_jobs():
    return [j.model_dump() for j in job_manager.list_jobs()]


@app.post("/api/jobs", status_code=201)
async def create_job(config: PipelineConfig):
    job = job_manager.create_job(config)

    async def _run():
        await run_pipeline(
            job.job_id,
            config,
            update=lambda **kw: job_manager.update(job.job_id, **kw),
            log=lambda msg: job_manager.log(job.job_id, msg),
        )

    task = asyncio.create_task(_run())
    job_manager.register_task(job.job_id, task)
    return job.model_dump()


@app.get("/api/jobs/{job_id}")
async def get_job(job_id: str):
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job.model_dump()


@app.delete("/api/jobs/{job_id}")
async def cancel_job(job_id: str):
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    await job_manager.cancel_job(job_id)
    return {"status": "cancelled"}


@app.get("/api/jobs/{job_id}/file/{stage}")
async def get_output_file(job_id: str, stage: str):
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")

    path_map = {
        "image": job.outputs.image,
        "raw_video": job.outputs.raw_video,
        "interpolated": job.outputs.interpolated,
        "upscaled": job.outputs.upscaled,
        "final": job.outputs.final,
    }
    path_str = path_map.get(stage)
    if not path_str:
        raise HTTPException(404, f"No output for stage '{stage}'")
    path = Path(path_str)
    if not path.exists():
        raise HTTPException(404, "File not found on disk")

    return FileResponse(str(path), filename=path.name)


@app.websocket("/ws/{job_id}")
async def ws_job(ws: WebSocket, job_id: str):
    job = job_manager.get_job(job_id)
    if not job:
        await ws.close(code=4004)
        return

    await ws.accept()
    await ws.send_text(json.dumps(job.model_dump()))  # Send current state immediately

    q = job_manager.subscribe(job_id)
    if not q:
        await ws.close()
        return

    try:
        while True:
            try:
                data = await asyncio.wait_for(q.get(), timeout=25)
                await ws.send_text(json.dumps(data))
                if data.get("stage") in {s.value for s in TERMINAL_STAGES}:
                    break
            except asyncio.TimeoutError:
                try:
                    await ws.send_text('{"ping":true}')
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    finally:
        job_manager.unsubscribe(job_id, q)


# Serve built frontend in production
_frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if _frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(_frontend_dist), html=True), name="static")
