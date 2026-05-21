from __future__ import annotations

import asyncio
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Set

from schemas import Job, JobOutputs, JobStage, PipelineConfig


class JobManager:
    def __init__(self) -> None:
        self._jobs: Dict[str, Job] = {}
        self._tasks: Dict[str, asyncio.Task] = {}
        self._queues: Dict[str, Set[asyncio.Queue]] = {}

    def create_job(self, config: PipelineConfig) -> Job:
        job_id = str(uuid.uuid4())
        job = Job(job_id=job_id, created_at=datetime.now().isoformat(), config=config)
        self._jobs[job_id] = job
        self._queues[job_id] = set()
        return job

    def get_job(self, job_id: str) -> Optional[Job]:
        return self._jobs.get(job_id)

    def list_jobs(self) -> List[Job]:
        return sorted(self._jobs.values(), key=lambda j: j.created_at, reverse=True)

    async def update(self, job_id: str, **kwargs) -> None:
        job = self._jobs.get(job_id)
        if not job:
            return
        for k, v in kwargs.items():
            if k == "outputs" and isinstance(v, dict):
                for ok, ov in v.items():
                    setattr(job.outputs, ok, ov)
            else:
                setattr(job, k, v)
        await self._broadcast(job_id)

    async def log(self, job_id: str, message: str) -> None:
        job = self._jobs.get(job_id)
        if job:
            job.logs.append(message)
            await self._broadcast(job_id)

    async def _broadcast(self, job_id: str) -> None:
        job = self._jobs.get(job_id)
        if not job:
            return
        payload = job.model_dump()
        dead: Set[asyncio.Queue] = set()
        for q in self._queues.get(job_id, set()):
            try:
                q.put_nowait(payload)
            except asyncio.QueueFull:
                dead.add(q)
        self._queues[job_id] -= dead

    def subscribe(self, job_id: str) -> Optional[asyncio.Queue]:
        if job_id not in self._queues:
            return None
        q: asyncio.Queue = asyncio.Queue(maxsize=200)
        self._queues[job_id].add(q)
        return q

    def unsubscribe(self, job_id: str, q: asyncio.Queue) -> None:
        self._queues.get(job_id, set()).discard(q)

    def register_task(self, job_id: str, task: asyncio.Task) -> None:
        self._tasks[job_id] = task

    async def cancel_job(self, job_id: str) -> None:
        task = self._tasks.get(job_id)
        if task and not task.done():
            task.cancel()
        await self.update(
            job_id,
            stage=JobStage.cancelled,
            completed_at=datetime.now().isoformat(),
        )


job_manager = JobManager()
