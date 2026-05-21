"""Pipeline stages adapted from image_to_video_pipeline.ipynb for local GPU execution."""
from __future__ import annotations

import asyncio
import shutil
import time
import urllib.parse
from datetime import datetime
from pathlib import Path
from typing import Awaitable, Callable, Optional

import requests

from schemas import JobStage, PipelineConfig

OUTPUTS_DIR = Path("outputs")
RIFE_DIR = Path("tools/Practical-RIFE")
ESRGAN_BIN = Path("tools/realesrgan-ncnn-vulkan/realesrgan-ncnn-vulkan")

LogFn = Callable[[str], Awaitable[None]]
UpdateFn = Callable[..., Awaitable[None]]


def _job_dir(job_id: str) -> Path:
    d = OUTPUTS_DIR / job_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def _resolution(config: PipelineConfig) -> tuple[int, int]:
    aspect_map = {
        "16:9": (config.base_width, int(config.base_width * 9 / 16)),
        "9:16": (int(config.base_width * 9 / 16), config.base_width),
        "1:1":  (config.base_width, config.base_width),
    }
    w, h = aspect_map[config.aspect]
    return (w // 8) * 8, (h // 8) * 8


async def _run_cmd(cmd: str, cwd: Optional[Path] = None) -> tuple[int, str, str]:
    proc = await asyncio.create_subprocess_shell(
        cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=str(cwd) if cwd else None,
    )
    stdout, stderr = await proc.communicate()
    return proc.returncode, stdout.decode(errors="replace"), stderr.decode(errors="replace")


# ─── Stage 1: Image generation ───────────────────────────────────────────────

def _fetch_pollinations(prompt: str, w: int, h: int, model: str, seed: Optional[int]) -> bytes:
    enc = urllib.parse.quote(prompt)
    url = (
        f"https://image.pollinations.ai/prompt/{enc}"
        f"?width={w}&height={h}&model={model}&nologo=true&enhance=true"
    )
    if seed is not None:
        url += f"&seed={seed}"

    for attempt in range(3):
        try:
            r = requests.get(url, timeout=180)
            if r.status_code == 200 and len(r.content) > 5000:
                return r.content
        except Exception as e:
            pass
        if attempt < 2:
            time.sleep(5)
    raise RuntimeError("Pollinations image generation failed after 3 retries")


async def stage_generate_image(job_id: str, config: PipelineConfig, log: LogFn) -> Path:
    w, h = _resolution(config)
    out = _job_dir(job_id) / "01_source.png"
    await log(f"Generating image {w}x{h} via Pollinations ({config.image_model.value})...")
    content = await asyncio.to_thread(
        _fetch_pollinations, config.image_prompt, w, h,
        config.image_model.value, config.image_seed,
    )
    out.write_bytes(content)
    await log(f"✅ Image saved ({len(content) // 1024} KB)")
    return out


# ─── Stage 2: Motion prompt ───────────────────────────────────────────────────

def _gemini_motion_prompt(api_key: str, image_bytes: bytes) -> str:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)
    resp = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type="image/png"),
            (
                "Describe the most natural, cinematic motion to animate this still image "
                "as a short video. Focus on subtle, physically plausible camera movement "
                "and subject motion. Output ONLY a concise English motion prompt, no preamble."
            ),
        ],
        config=types.GenerateContentConfig(temperature=0.4),
    )
    return resp.text.strip()


async def stage_motion_prompt(
    job_id: str, config: PipelineConfig, image_path: Path, log: LogFn
) -> str:
    if config.motion_prompt:
        await log(f"Using manual motion prompt.")
        return config.motion_prompt

    if config.gemini_api_key:
        await log("Generating motion prompt via Gemini Vision...")
        try:
            prompt = await asyncio.to_thread(
                _gemini_motion_prompt, config.gemini_api_key, image_path.read_bytes()
            )
            await log(f"✅ Motion prompt: {prompt[:120]}")
            return prompt
        except Exception as e:
            await log(f"⚠️ Gemini failed ({e}). Using fallback.")

    fallback = "slow cinematic camera push-in, gentle ripples on water, soft drifting clouds"
    await log(f"Using fallback motion prompt.")
    return fallback


# ─── Stage 3: Video generation (Wan 2.2 I2V) ─────────────────────────────────

def _load_wan_pipeline(model_id: str, device: str):
    import torch
    from diffusers import WanImageToVideoPipeline

    # CPU는 float32, GPU는 bfloat16 사용 (메모리·정밀도 최적화)
    dtype = torch.float32 if device == "cpu" else torch.bfloat16
    pipe = WanImageToVideoPipeline.from_pretrained(model_id, torch_dtype=dtype)
    pipe.to(device)
    if device == "cuda":
        pipe.enable_model_cpu_offload()
    return pipe


def _run_wan_inference(
    pipe,
    image_path: Path,
    config: PipelineConfig,
    w: int,
    h: int,
    step_queue: "queue.Queue",
):
    """Run inference with step-level progress reporting via step_queue."""
    import queue as _queue
    from diffusers.utils import load_image

    image = load_image(str(image_path))

    def _on_step_end(pipe, step: int, timestep, kwargs):
        step_queue.put(step + 1)  # 1-indexed
        return kwargs

    result = pipe(
        image=image,
        prompt=config.motion_prompt,
        negative_prompt="blurry, distorted, low quality, artifacts, warping",
        height=h,
        width=w,
        num_frames=config.video_length_frames,
        num_inference_steps=config.video_steps,
        guidance_scale=config.guidance_scale,
        callback_on_step_end=_on_step_end,
    )
    step_queue.put(None)  # Sentinel: inference done
    return result.frames[0]


async def stage_generate_video(
    job_id: str, config: PipelineConfig, image_path: Path, log: LogFn, update: UpdateFn
) -> Path:
    import queue
    import torch
    from diffusers.utils import export_to_video

    w, h = _resolution(config)
    out = _job_dir(job_id) / "03_raw.mp4"
    device = config.device.value
    total_steps = config.video_steps

    model_id = "Wan-AI/Wan2.2-I2V-A14B-Diffusers"
    await log(f"Loading Wan 2.2 I2V model ({model_id}) on {device.upper()}...")
    await log("  첫 실행 시 모델 다운로드 ~20 GB (20~40분 소요).")
    if device == "cpu":
        await log("  ⚠️ CPU 모드: 49프레임 기준 수 시간 소요될 수 있습니다.")
        await log("  ⚠️ 빠른 테스트: video_length_frames=17, video_steps=10 권장.")

    pipe = await asyncio.to_thread(_load_wan_pipeline, model_id, device)
    await log(f"▶ 영상 생성 시작: {config.video_length_frames}프레임 / {w}x{h} / {total_steps}스텝")

    # Run inference in a thread; drain step progress from the queue on the event loop
    step_queue: queue.Queue = queue.Queue()
    inference_task = asyncio.get_event_loop().run_in_executor(
        None, _run_wan_inference, pipe, image_path, config, w, h, step_queue
    )

    # VIDEO generation occupies progress 25→65 — map steps into that range
    PROGRESS_START, PROGRESS_END = 25, 65

    while True:
        await asyncio.sleep(0.3)
        # Drain all pending step numbers
        completed_step = None
        try:
            while True:
                item = step_queue.get_nowait()
                if item is None:
                    break
                completed_step = item
        except queue.Empty:
            pass

        if completed_step is not None:
            pct = PROGRESS_START + int((completed_step / total_steps) * (PROGRESS_END - PROGRESS_START))
            await update(progress=pct)
            await log(f"  스텝 {completed_step}/{total_steps} ({pct}%)")

        if inference_task.done():
            break

    frames = await inference_task
    await asyncio.to_thread(export_to_video, frames, str(out), fps=config.video_fps)
    await log(f"✅ 원본 영상 저장 ({out.stat().st_size // 1024} KB)")

    del pipe
    if device == "cuda" and torch.cuda.is_available():
        torch.cuda.empty_cache()

    return out


# ─── Stage 4: Frame interpolation (RIFE / FFmpeg fallback) ───────────────────

async def stage_interpolate(
    job_id: str, config: PipelineConfig, video: Path, log: LogFn
) -> Path:
    out = _job_dir(job_id) / "04_interpolated.mp4"
    multiplier = max(1, round(config.interpolate_to_fps / config.video_fps))

    if RIFE_DIR.exists() and (RIFE_DIR / "inference_video.py").exists():
        await log(f"Interpolating {multiplier}x with RIFE ({config.video_fps}→{config.interpolate_to_fps} fps)...")
        rc, _, err = await _run_cmd(
            f'python inference_video.py --multi {multiplier} --video "{video.resolve()}" --output "{out.resolve()}"',
            cwd=RIFE_DIR,
        )
        if rc == 0:
            await log(f"✅ RIFE interpolation done")
            return out
        await log(f"⚠️ RIFE failed. Falling back to FFmpeg minterpolate.")

    await log(f"Interpolating with FFmpeg minterpolate ({config.interpolate_to_fps} fps)...")
    rc, _, err = await _run_cmd(
        f'ffmpeg -y -i "{video}" '
        f'-vf "minterpolate=fps={config.interpolate_to_fps}:mi_mode=mci:mc_mode=aobmc:vsbmc=1" '
        f'"{out}"'
    )
    if rc != 0:
        raise RuntimeError(f"FFmpeg interpolation failed: {err[:300]}")
    await log("✅ Interpolation done")
    return out


# ─── Stage 5: Video upscaling (Real-ESRGAN NCNN-Vulkan) ──────────────────────

async def stage_upscale(
    job_id: str, config: PipelineConfig, video: Path, log: LogFn
) -> Path:
    job_dir = _job_dir(job_id)
    out = job_dir / "05_upscaled.mp4"
    frames_in = job_dir / "_frames_in"
    frames_out = job_dir / "_frames_out"

    for d in [frames_in, frames_out]:
        if d.exists():
            shutil.rmtree(d)
        d.mkdir()

    await log("Extracting frames...")
    rc, _, err = await _run_cmd(f'ffmpeg -y -i "{video}" "{frames_in}/f_%05d.png"')
    if rc != 0:
        raise RuntimeError(f"Frame extraction failed: {err[:200]}")

    if not ESRGAN_BIN.exists():
        await log(f"⚠️ Real-ESRGAN binary not found at {ESRGAN_BIN}. Skipping upscale.")
        shutil.rmtree(frames_in, ignore_errors=True)
        shutil.rmtree(frames_out, ignore_errors=True)
        return video

    await log(f"Upscaling {config.upscale_factor}x with Real-ESRGAN...")
    rc, _, err = await _run_cmd(
        f'"{ESRGAN_BIN.resolve()}" -i "{frames_in}" -o "{frames_out}" '
        f'-n realesrgan-x4plus -s {config.upscale_factor}'
    )
    if rc != 0:
        raise RuntimeError(f"Real-ESRGAN failed: {err[:200]}")

    await log("Reassembling video from upscaled frames...")
    rc, _, err = await _run_cmd(
        f'ffmpeg -y -framerate {config.interpolate_to_fps} -i "{frames_out}/f_%05d.png" '
        f'-c:v libx264 -crf 16 -pix_fmt yuv420p "{out}"'
    )
    if rc != 0:
        raise RuntimeError(f"Video reassembly failed: {err[:200]}")

    shutil.rmtree(frames_in, ignore_errors=True)
    shutil.rmtree(frames_out, ignore_errors=True)
    await log(f"✅ Upscaling done")
    return out


# ─── Stage 6: Color grade + audio mix ────────────────────────────────────────

async def stage_grade_and_mix(
    job_id: str, config: PipelineConfig, video: Path, log: LogFn
) -> Path:
    out = _job_dir(job_id) / "06_final.mp4"
    eq = f"eq=contrast={config.contrast}:saturation={config.saturation}:brightness={config.brightness}"
    vf = f"{eq},fade=in:0:8"

    if config.bgm_path and Path(config.bgm_path).exists():
        await log("Applying color grade and mixing audio...")
        cmd = (
            f'ffmpeg -y -i "{video}" -i "{config.bgm_path}" '
            f'-vf "{vf}" -c:v libx264 -crf 17 -preset slow '
            f'-c:a aac -b:a 192k -shortest "{out}"'
        )
    else:
        await log("Applying color grade...")
        cmd = (
            f'ffmpeg -y -i "{video}" '
            f'-vf "{vf}" -c:v libx264 -crf 17 -preset slow '
            f'-pix_fmt yuv420p "{out}"'
        )

    rc, _, err = await _run_cmd(cmd)
    if rc != 0:
        raise RuntimeError(f"Color grading failed: {err[:300]}")

    await log(f"✅ Final video saved ({out.stat().st_size // 1024} KB)")
    return out


# ─── Orchestrator ─────────────────────────────────────────────────────────────

async def run_pipeline(job_id: str, config: PipelineConfig, update: UpdateFn, log: LogFn) -> None:
    try:
        # 1. Generate source image
        await update(stage=JobStage.generating_image, progress=5)
        image_path = await stage_generate_image(job_id, config, log)
        await update(outputs={"image": str(image_path)}, progress=15)

        # 2. Generate motion prompt
        await update(stage=JobStage.generating_motion_prompt, progress=18)
        motion = await stage_motion_prompt(job_id, config, image_path, log)
        config.motion_prompt = motion
        await update(outputs={"motion_prompt": motion}, progress=22)

        # 3. Generate video (heaviest step: 25 → 65%, streamed per step)
        await update(stage=JobStage.generating_video, progress=25)
        raw_video = await stage_generate_video(job_id, config, image_path, log, update)
        await update(outputs={"raw_video": str(raw_video)}, progress=65)

        # 4. Interpolate frames
        await update(stage=JobStage.interpolating, progress=68)
        interp = await stage_interpolate(job_id, config, raw_video, log)
        await update(outputs={"interpolated": str(interp)}, progress=78)

        # 5. Upscale (optional)
        current = interp
        if config.upscale_video:
            await update(stage=JobStage.upscaling, progress=80)
            current = await stage_upscale(job_id, config, interp, log)
            await update(outputs={"upscaled": str(current)}, progress=90)

        # 6. Color grade + audio
        await update(stage=JobStage.grading, progress=92)
        final = await stage_grade_and_mix(job_id, config, current, log)

        await update(
            stage=JobStage.completed,
            progress=100,
            outputs={"final": str(final)},
            completed_at=datetime.now().isoformat(),
        )
        await log("🎉 Pipeline completed!")

    except asyncio.CancelledError:
        await log("⚠️ Job cancelled.")
        raise
    except Exception as e:
        await update(
            stage=JobStage.failed,
            error=str(e),
            completed_at=datetime.now().isoformat(),
        )
        await log(f"❌ Error: {e}")
