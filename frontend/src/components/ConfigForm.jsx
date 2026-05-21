import React, { useState } from 'react'

const DEFAULT = {
  image_prompt: 'a serene mountain lake at golden hour, cinematic, photorealistic, dramatic clouds reflecting on water',
  image_model: 'flux',
  image_seed: 42,
  aspect: '16:9',
  base_width: 1280,
  device: 'cuda',
  motion_prompt: '',
  video_length_frames: 49,
  video_fps: 16,
  video_steps: 30,
  guidance_scale: 5.0,
  interpolate_to_fps: 48,
  upscale_video: true,
  upscale_factor: 2,
  contrast: 1.08,
  saturation: 1.12,
  brightness: 0.02,
  bgm_path: '',
  gemini_api_key: '',
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1">
        {label}
        {hint && <span className="ml-2 text-xs text-gray-500 font-normal">{hint}</span>}
      </label>
      {children}
    </div>
  )
}

function Input({ ...props }) {
  return (
    <input
      {...props}
      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500"
    />
  )
}

function Select({ children, ...props }) {
  return (
    <select
      {...props}
      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500"
    >
      {children}
    </select>
  )
}

function Section({ title, children }) {
  return (
    <div className="bg-gray-900 rounded-xl p-5 space-y-4">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  )
}

export default function ConfigForm({ onSubmit, submitting }) {
  const [cfg, setCfg] = useState(DEFAULT)

  const set = (key, val) => setCfg((c) => ({ ...c, [key]: val }))

  const handleSubmit = (e) => {
    e.preventDefault()
    const payload = {
      ...cfg,
      image_seed: cfg.image_seed === '' ? null : Number(cfg.image_seed),
      motion_prompt: cfg.motion_prompt || null,
      bgm_path: cfg.bgm_path || null,
      gemini_api_key: cfg.gemini_api_key || null,
    }
    onSubmit(payload)
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto p-6 space-y-5">
      <div>
        <h2 className="text-xl font-bold text-white">새 작업 설정</h2>
        <p className="text-sm text-gray-500 mt-1">파라미터를 설정하고 파이프라인을 시작하세요.</p>
      </div>

      <Section title="이미지 생성">
        <Field label="이미지 프롬프트">
          <textarea
            value={cfg.image_prompt}
            onChange={(e) => set('image_prompt', e.target.value)}
            rows={3}
            required
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500 resize-none"
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="모델">
            <Select value={cfg.image_model} onChange={(e) => set('image_model', e.target.value)}>
              <option value="flux">flux</option>
              <option value="turbo">turbo</option>
              <option value="flux-realism">flux-realism</option>
            </Select>
          </Field>
          <Field label="시드" hint="빈 칸 = 랜덤">
            <Input
              type="number"
              value={cfg.image_seed}
              onChange={(e) => set('image_seed', e.target.value)}
              placeholder="42"
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="종횡비">
            <Select value={cfg.aspect} onChange={(e) => set('aspect', e.target.value)}>
              <option value="16:9">16:9 (가로)</option>
              <option value="9:16">9:16 (세로/숏폼)</option>
              <option value="1:1">1:1 (정사각)</option>
            </Select>
          </Field>
          <Field label="기준 너비 (px)" hint="T4→832, L4/A100→1280">
            <Input
              type="number"
              value={cfg.base_width}
              onChange={(e) => set('base_width', Number(e.target.value))}
              min={256}
              max={2560}
              step={64}
            />
          </Field>
        </div>
      </Section>

      <Section title="영상 생성 (Wan 2.2 I2V)">
        <Field label="실행 디바이스">
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: 'cuda', label: '🎮 GPU (CUDA)', desc: 'VRAM 16GB+ 필요. 5~15분 소요.' },
              { value: 'cpu',  label: '🖥️ CPU',        desc: 'GPU 불필요. 수 시간 소요. 테스트용.' },
            ].map(({ value, label, desc }) => (
              <label
                key={value}
                className={`flex flex-col gap-1 p-3 rounded-lg border cursor-pointer transition ${
                  cfg.device === value
                    ? 'border-indigo-500 bg-indigo-950'
                    : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                }`}
              >
                <input
                  type="radio"
                  name="device"
                  value={value}
                  checked={cfg.device === value}
                  onChange={() => set('device', value)}
                  className="sr-only"
                />
                <span className="text-sm font-medium text-gray-200">{label}</span>
                <span className="text-xs text-gray-500">{desc}</span>
              </label>
            ))}
          </div>
          {cfg.device === 'cpu' && (
            <p className="text-xs text-amber-400 bg-amber-900/20 border border-amber-800 rounded-lg px-3 py-2 mt-2">
              ⚠️ CPU 모드는 매우 느립니다. 빠른 테스트를 위해 아래 프레임 수를 17, 추론 스텝을 10으로 줄이세요.
            </p>
          )}
        </Field>
        <Field label="모션 프롬프트" hint="비워두면 Gemini 또는 기본값 사용">
          <textarea
            value={cfg.motion_prompt}
            onChange={(e) => set('motion_prompt', e.target.value)}
            rows={2}
            placeholder="slow cinematic camera push-in, gentle ripples..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500 resize-none"
          />
        </Field>
        <Field label="Gemini API 키" hint="모션 프롬프트 자동 생성용 (선택)">
          <Input
            type="password"
            value={cfg.gemini_api_key}
            onChange={(e) => set('gemini_api_key', e.target.value)}
            placeholder="AIza..."
          />
        </Field>
        <div className="grid grid-cols-3 gap-4">
          <Field label="프레임 수" hint="49 ≈ 3초">
            <Input
              type="number"
              value={cfg.video_length_frames}
              onChange={(e) => set('video_length_frames', Number(e.target.value))}
              min={17}
              max={97}
              step={8}
            />
          </Field>
          <Field label="추론 스텝" hint="품질↑ 속도↓">
            <Input
              type="number"
              value={cfg.video_steps}
              onChange={(e) => set('video_steps', Number(e.target.value))}
              min={10}
              max={100}
            />
          </Field>
          <Field label="Guidance Scale">
            <Input
              type="number"
              value={cfg.guidance_scale}
              onChange={(e) => set('guidance_scale', Number(e.target.value))}
              min={1}
              max={20}
              step={0.5}
            />
          </Field>
        </div>
      </Section>

      <Section title="후처리">
        <div className="grid grid-cols-2 gap-4">
          <Field label="보간 목표 FPS" hint="16→48 = 3배 보간">
            <Input
              type="number"
              value={cfg.interpolate_to_fps}
              onChange={(e) => set('interpolate_to_fps', Number(e.target.value))}
              min={16}
              max={120}
            />
          </Field>
          <Field label="업스케일 배수">
            <Select
              value={cfg.upscale_factor}
              onChange={(e) => set('upscale_factor', Number(e.target.value))}
              disabled={!cfg.upscale_video}
            >
              <option value={1}>1x (없음)</option>
              <option value={2}>2x</option>
              <option value={4}>4x</option>
            </Select>
          </Field>
        </div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={cfg.upscale_video}
            onChange={(e) => set('upscale_video', e.target.checked)}
            className="w-4 h-4 accent-indigo-500"
          />
          <span className="text-sm text-gray-300">Real-ESRGAN 업스케일 사용</span>
        </label>
      </Section>

      <Section title="색보정 (FFmpeg)">
        <div className="grid grid-cols-3 gap-4">
          {[
            { key: 'contrast', label: '대비', step: 0.01 },
            { key: 'saturation', label: '채도', step: 0.01 },
            { key: 'brightness', label: '밝기', step: 0.01 },
          ].map(({ key, label, step }) => (
            <Field key={key} label={label}>
              <Input
                type="number"
                value={cfg[key]}
                onChange={(e) => set(key, Number(e.target.value))}
                step={step}
              />
            </Field>
          ))}
        </div>
      </Section>

      <Section title="오디오 (선택)">
        <Field label="BGM 파일 경로" hint="없으면 무음">
          <Input
            type="text"
            value={cfg.bgm_path}
            onChange={(e) => set('bgm_path', e.target.value)}
            placeholder="/path/to/bgm.mp3"
          />
        </Field>
      </Section>

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition text-sm"
      >
        {submitting ? '작업 생성 중...' : '🚀 파이프라인 시작'}
      </button>
    </form>
  )
}
