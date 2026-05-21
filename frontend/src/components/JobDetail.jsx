import React, { useEffect, useRef, useState } from 'react'
import { api } from '../api'

const STAGES = [
  { key: 'generating_image',        label: '이미지 생성' },
  { key: 'generating_motion_prompt',label: '모션 프롬프트' },
  { key: 'generating_video',        label: '영상 생성' },
  { key: 'interpolating',           label: '프레임 보간' },
  { key: 'upscaling',               label: '업스케일' },
  { key: 'grading',                 label: '색보정+오디오' },
  { key: 'completed',               label: '완료' },
]

const STAGE_ORDER = STAGES.map((s) => s.key)

function StageTracker({ stage, progress }) {
  const currentIdx = STAGE_ORDER.indexOf(stage)
  const failed = stage === 'failed'
  const cancelled = stage === 'cancelled'

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {STAGES.map((s, i) => {
        const done = currentIdx > i || stage === 'completed'
        const active = s.key === stage && !failed && !cancelled
        return (
          <React.Fragment key={s.key}>
            <div
              className={`text-xs px-2 py-0.5 rounded-full font-medium transition ${
                done
                  ? 'bg-green-800 text-green-300'
                  : active
                  ? 'bg-indigo-700 text-white animate-pulse'
                  : 'bg-gray-800 text-gray-500'
              }`}
            >
              {s.label}
            </div>
            {i < STAGES.length - 1 && <span className="text-gray-700">›</span>}
          </React.Fragment>
        )
      })}
    </div>
  )
}

export default function JobDetail({ jobId, onCancel, onRefresh }) {
  const [job, setJob] = useState(null)
  const logsEndRef = useRef(null)
  const wsRef = useRef(null)

  useEffect(() => {
    if (!jobId) return

    // Fetch initial state
    fetch(`/api/jobs/${jobId}`)
      .then((r) => r.json())
      .then(setJob)

    // WebSocket for real-time updates
    const ws = api.openWebSocket(jobId)
    wsRef.current = ws

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data)
      if (!data.ping) setJob(data)
    }
    ws.onerror = () => {}

    return () => {
      ws.close()
    }
  }, [jobId])

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [job?.logs])

  if (!job) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
        불러오는 중...
      </div>
    )
  }

  const isTerminal = ['completed', 'failed', 'cancelled'].includes(job.stage)
  const isRunning = !isTerminal

  const handleCancel = async () => {
    await onCancel(jobId)
    onRefresh()
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-white truncate">
            {job.config.image_prompt}
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            {new Date(job.created_at).toLocaleString('ko-KR')} · {job.config.aspect} · {job.config.base_width}px
          </p>
        </div>
        {isRunning && (
          <button
            onClick={handleCancel}
            className="flex-shrink-0 px-3 py-1.5 bg-red-900/50 hover:bg-red-900 text-red-400 text-xs rounded-lg transition"
          >
            취소
          </button>
        )}
      </div>

      {/* Stage tracker */}
      {job.stage !== 'pending' && <StageTracker stage={job.stage} progress={job.progress} />}

      {/* Progress bar */}
      {isRunning && (
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>전체 진행률</span>
              <span>{job.progress}%</span>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-all duration-500"
                style={{ width: `${job.progress}%` }}
              />
            </div>
          </div>

          {/* Video generation step-level progress */}
          {job.stage === 'generating_video' && (() => {
            const totalSteps = job.config.video_steps
            // Extract completed step from latest log line "스텝 N/M"
            const stepLog = [...(job.logs || [])].reverse().find((l) => l.includes('스텝 '))
            const match = stepLog?.match(/스텝 (\d+)\/(\d+)/)
            const doneStep = match ? parseInt(match[1]) : 0
            const pct = totalSteps > 0 ? Math.round((doneStep / totalSteps) * 100) : 0
            return (
              <div className="bg-gray-900 rounded-lg p-3">
                <div className="flex justify-between text-xs text-violet-400 mb-1">
                  <span>🎬 Wan 2.2 추론 스텝</span>
                  <span>{doneStep} / {totalSteps} 스텝 ({pct}%)</span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet-500 transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-xs text-gray-600 mt-1.5">
                  {job.config.device === 'cpu'
                    ? '⚠️ CPU 모드 — 완료까지 수 시간 소요될 수 있습니다'
                    : 'GPU 가속 중 — 스텝당 수 초 소요'}
                </p>
              </div>
            )
          })()}
        </div>
      )}

      {/* Error */}
      {job.error && (
        <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">
          <strong>오류:</strong> {job.error}
        </div>
      )}

      {/* Outputs */}
      <div className="grid grid-cols-2 gap-4">
        {job.outputs.image && (
          <div className="bg-gray-900 rounded-xl overflow-hidden">
            <p className="text-xs text-gray-500 px-3 py-2 border-b border-gray-800">원본 이미지</p>
            <img
              src={api.fileUrl(jobId, 'image')}
              alt="source"
              className="w-full object-cover"
            />
          </div>
        )}
        {job.outputs.final && (
          <div className="bg-gray-900 rounded-xl overflow-hidden col-span-2">
            <p className="text-xs text-gray-500 px-3 py-2 border-b border-gray-800">최종 영상</p>
            <video
              src={api.fileUrl(jobId, 'final')}
              controls
              autoPlay
              loop
              muted
              className="w-full"
            />
            <div className="p-3">
              <a
                href={api.fileUrl(jobId, 'final')}
                download
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-700 hover:bg-green-600 text-white text-xs font-medium rounded-lg transition"
              >
                ⬇ 다운로드
              </a>
            </div>
          </div>
        )}
        {!job.outputs.final && job.outputs.raw_video && (
          <div className="bg-gray-900 rounded-xl overflow-hidden col-span-2">
            <p className="text-xs text-gray-500 px-3 py-2 border-b border-gray-800">원본 영상 (처리 중)</p>
            <video
              src={api.fileUrl(jobId, 'raw_video')}
              controls
              muted
              className="w-full"
            />
          </div>
        )}
      </div>

      {/* Motion prompt badge */}
      {job.outputs.motion_prompt && (
        <div className="bg-gray-900 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-2">모션 프롬프트</p>
          <p className="text-sm text-gray-300 italic">"{job.outputs.motion_prompt}"</p>
        </div>
      )}

      {/* Logs */}
      <div className="bg-gray-900 rounded-xl overflow-hidden">
        <p className="text-xs text-gray-500 px-4 py-2 border-b border-gray-800 font-medium">실행 로그</p>
        <div className="p-4 h-64 overflow-y-auto font-mono text-xs space-y-1">
          {job.logs.length === 0 && (
            <span className="text-gray-600">파이프라인 시작 대기 중...</span>
          )}
          {job.logs.map((line, i) => (
            <div key={i} className="text-gray-400 leading-relaxed">
              {line}
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
      </div>

      {/* Intermediate outputs */}
      {(job.outputs.interpolated || job.outputs.upscaled) && (
        <div className="flex gap-3 flex-wrap">
          {[
            { key: 'interpolated', label: '보간 영상' },
            { key: 'upscaled',     label: '업스케일 영상' },
          ]
            .filter(({ key }) => job.outputs[key])
            .map(({ key, label }) => (
              <a
                key={key}
                href={api.fileUrl(jobId, key)}
                download
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition"
              >
                ⬇ {label}
              </a>
            ))}
        </div>
      )}
    </div>
  )
}
