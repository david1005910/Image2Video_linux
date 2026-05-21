# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fullstack Image-to-Video pipeline app running locally on Linux with a GPU. The core model is **Wan 2.2 I2V** (via diffusers). A Jupyter notebook (`image_to_video_pipeline.ipynb`) covers the original Google Colab prototype; the `backend/` + `frontend/` directories are the production local app.

## Development Commands

```bash
# Start both services together
./run.sh

# Backend only (from backend/)
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Frontend only (from frontend/)
cd frontend
npm install
npm run dev        # dev server at http://localhost:5173
npm run build      # build → frontend/dist/ (served by FastAPI in prod)
npm run preview    # preview production build
```

No test suite exists yet.

## Architecture

```
frontend/ (React + Vite + Tailwind, port 5173)
    └── src/api.js              REST + WebSocket calls to backend
    └── src/components/
            ConfigForm.jsx      Pipeline config form → POST /api/jobs
            JobList.jsx         Sidebar job list
            JobDetail.jsx       Live job view (WebSocket /ws/{job_id})

backend/ (FastAPI + uvicorn, port 8000)
    ├── main.py                 Routes + WebSocket endpoint
    ├── job_manager.py          In-memory job store + pub/sub queues
    ├── pipeline.py             Six-stage async pipeline
    └── schemas.py              Pydantic models (PipelineConfig, Job, JobStage)
```

### Request lifecycle

1. Frontend POSTs `PipelineConfig` to `POST /api/jobs`.
2. `main.py` creates a `Job` in `JobManager`, then fires `run_pipeline(...)` as an `asyncio.Task`.
3. Pipeline stages update job state via `update(**kw)` and `log(msg)` callbacks.
4. `JobManager._broadcast` fans out every state change to all subscribed `asyncio.Queue`s.
5. Frontend `JobDetail` holds a WebSocket to `/ws/{job_id}` and re-renders on each message.

### Pipeline stages (`pipeline.py`)

| Stage | Progress | Output file |
|-------|----------|-------------|
| `generating_image` | 5→15% | `outputs/{job_id}/01_source.png` |
| `generating_motion_prompt` | 18→22% | (stored in config) |
| `generating_video` | 25→65% | `outputs/{job_id}/03_raw.mp4` |
| `interpolating` | 68→78% | `outputs/{job_id}/04_interpolated.mp4` |
| `upscaling` | 80→90% | `outputs/{job_id}/05_upscaled.mp4` |
| `grading` | 92→100% | `outputs/{job_id}/06_final.mp4` |

Wan 2.2 inference runs in a thread executor while the event loop drains a `queue.Queue` for per-step progress updates (mapped to 25–65%).

### External tool dependencies

These must be installed separately — their absence triggers graceful fallbacks:

- `tools/Practical-RIFE/inference_video.py` — frame interpolation; falls back to FFmpeg `minterpolate`
- `tools/realesrgan-ncnn-vulkan/realesrgan-ncnn-vulkan` — video upscaling; skipped if binary missing
- `ffmpeg` — required (must be on PATH)

### Key config fields (`schemas.py: PipelineConfig`)

| Field | Default | Notes |
|-------|---------|-------|
| `base_width` | 1280 | Reduce to 832 for T4-class GPUs |
| `video_length_frames` | 49 | Min 17; reduce for lower VRAM |
| `video_steps` | 30 | Quality vs. speed |
| `device` | `cuda` | `cpu` supported but very slow |
| `gemini_api_key` | null | Optional; enables AI motion prompt generation |

Width/height are auto-padded to 8-pixel multiples (Wan 2.2 requirement) in `pipeline._resolution`.

## Colab Notebook

`image_to_video_pipeline.ipynb` is a standalone prototype for Google Colab. It mirrors the same seven-stage pipeline but installs deps inline and writes outputs to Google Drive. It is not used by the local app.
