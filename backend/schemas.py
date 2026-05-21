from __future__ import annotations

from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class AspectRatio(str, Enum):
    landscape = "16:9"
    portrait = "9:16"
    square = "1:1"


class ImageModel(str, Enum):
    flux = "flux"
    turbo = "turbo"
    flux_realism = "flux-realism"


class Device(str, Enum):
    cuda = "cuda"
    cpu = "cpu"


class PipelineConfig(BaseModel):
    # Image generation
    image_prompt: str = "a serene mountain lake at golden hour, cinematic, photorealistic, dramatic clouds reflecting on water"
    image_model: ImageModel = ImageModel.flux
    image_seed: Optional[int] = 42

    # Output format
    aspect: AspectRatio = AspectRatio.landscape
    base_width: int = Field(1280, ge=256, le=2560)

    # Device
    device: Device = Device.cuda

    # Video generation
    motion_prompt: Optional[str] = None
    video_length_frames: int = Field(49, ge=17, le=97)
    video_fps: int = Field(16, ge=8, le=30)
    video_steps: int = Field(30, ge=10, le=100)
    guidance_scale: float = Field(5.0, ge=1.0, le=20.0)

    # Post-processing
    interpolate_to_fps: int = Field(48, ge=16, le=120)
    upscale_video: bool = True
    upscale_factor: int = Field(2, ge=1, le=4)

    # Color grading
    contrast: float = Field(1.08, ge=0.5, le=2.0)
    saturation: float = Field(1.12, ge=0.5, le=2.0)
    brightness: float = Field(0.02, ge=-0.5, le=0.5)

    # Audio
    bgm_path: Optional[str] = None

    # API keys
    gemini_api_key: Optional[str] = None


class JobStage(str, Enum):
    pending = "pending"
    generating_image = "generating_image"
    generating_motion_prompt = "generating_motion_prompt"
    generating_video = "generating_video"
    interpolating = "interpolating"
    upscaling = "upscaling"
    grading = "grading"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class JobOutputs(BaseModel):
    image: Optional[str] = None
    motion_prompt: Optional[str] = None
    raw_video: Optional[str] = None
    interpolated: Optional[str] = None
    upscaled: Optional[str] = None
    final: Optional[str] = None


class Job(BaseModel):
    job_id: str
    stage: JobStage = JobStage.pending
    progress: int = 0
    logs: List[str] = []
    error: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None
    config: PipelineConfig
    outputs: JobOutputs = JobOutputs()
