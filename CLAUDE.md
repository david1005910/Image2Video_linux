# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Single Jupyter notebook (`image_to_video_pipeline.ipynb`) implementing a full image-to-video pipeline on Google Colab, using Wan 2.2 I2V as the core generation model. Purpose: validate model quality before scaling to production spec-kit.

## Running the Pipeline

This project runs on **Google Colab**, not locally. The notebook is designed for sequential cell execution.

```bash
# Open in Colab (from Google Drive)
# Runtime → Run all  OR  Ctrl+F9

# For local Jupyter (requires GPU with 16GB+ VRAM):
pip install jupyter
jupyter notebook image_to_video_pipeline.ipynb
```

Dependencies install inline via `pip install -q` cells — no separate requirements file. Models cache to Google Drive at `HF_HOME=/content/drive/MyDrive/img2video/models/hf_cache`.

## Pipeline Architecture

Seven sequential stages, each writing output to a numbered folder on Google Drive:

```
Pollinations API → (optional) Real-ESRGAN upscale → Gemini motion prompt
    → Wan 2.2 I2V (diffusers) → RIFE interpolation → Real-ESRGAN NCNN-Vulkan → FFmpeg grade+audio
```

Output folders under `/MyDrive/img2video/`:
- `01_images/` — source image from Pollinations
- `02_upscaled/` — upscaled input (optional)
- `03_videos_raw/` — raw Wan 2.2 output
- `04_interpolated/` — RIFE frame-interpolated
- `05_upscaled_video/` — ESRGAN upscaled frames
- `06_final/` — color-graded + audio-mixed final

## Configuration

All user parameters live in a single `CONFIG` dict near the top of the notebook. Key fields:

| Parameter | Default | Notes |
|-----------|---------|-------|
| `base_width` | 1280 | Reduce to 832 for T4 VRAM limits |
| `video_length_frames` | 49 | Reduce to 33 for lower VRAM |
| `num_inference_steps` | 30 | Quality vs. speed trade-off |
| `interpolation_fps` | 48 | RIFE target; 16→48 interpolation |
| `upscale_factor` | 2 | Applied to final video frames |

Width/height are auto-padded to 8-pixel multiples (Wan 2.2 requirement).

## Key Design Decisions

- **Fallback chain per stage:** diffusers OR ComfyUI for I2V; FFmpeg `minterpolate` if RIFE weights unavailable; optional Veo 3.1 API for high-quality shots.
- **Gemini API key** loaded from Colab Secrets (not hardcoded). Motion prompt generation is optional — manual prompt fallback is available.
- **Pollinations** is used for image generation because it's free with no API key.
- **Model compatibility:** `diffusers>=0.31` required; API for `WanImageToVideoPipeline` may differ across versions — check release notes if import errors occur.

## Hardware Requirements

- Minimum: T4 GPU (16 GB VRAM) → 480–640p output
- Recommended: L4 or A100 → 720–1080p output
- First run (model download): 20–40 min; subsequent runs: 5–15 min per video
