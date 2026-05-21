import React from 'react'

const STAGE_LABEL = {
  pending: '대기',
  generating_image: '이미지 생성',
  generating_motion_prompt: '모션 프롬프트',
  generating_video: '영상 생성',
  interpolating: '프레임 보간',
  upscaling: '업스케일',
  grading: '색보정',
  completed: '완료',
  failed: '실패',
  cancelled: '취소',
}

const STAGE_COLOR = {
  pending: 'text-gray-400',
  generating_image: 'text-blue-400',
  generating_motion_prompt: 'text-blue-400',
  generating_video: 'text-violet-400',
  interpolating: 'text-cyan-400',
  upscaling: 'text-cyan-400',
  grading: 'text-amber-400',
  completed: 'text-green-400',
  failed: 'text-red-400',
  cancelled: 'text-gray-500',
}

const DOT_COLOR = {
  pending: 'bg-gray-500',
  generating_image: 'bg-blue-500',
  generating_motion_prompt: 'bg-blue-500',
  generating_video: 'bg-violet-500 animate-pulse',
  interpolating: 'bg-cyan-500 animate-pulse',
  upscaling: 'bg-cyan-500 animate-pulse',
  grading: 'bg-amber-500 animate-pulse',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
  cancelled: 'bg-gray-600',
}

export default function JobList({ jobs, selectedId, onSelect }) {
  if (!jobs.length) {
    return (
      <p className="text-center text-gray-600 text-xs mt-8 px-4">
        작업이 없습니다.<br />새 작업을 시작하세요.
      </p>
    )
  }

  return (
    <ul className="divide-y divide-gray-800">
      {jobs.map((job) => {
        const active = job.job_id === selectedId
        const label = STAGE_LABEL[job.stage] ?? job.stage
        const color = STAGE_COLOR[job.stage] ?? 'text-gray-400'
        const dot = DOT_COLOR[job.stage] ?? 'bg-gray-500'
        const prompt = job.config.image_prompt

        return (
          <li key={job.job_id}>
            <button
              onClick={() => onSelect(job.job_id)}
              className={`w-full text-left px-4 py-3 hover:bg-gray-800 transition ${
                active ? 'bg-gray-800 border-l-2 border-indigo-500' : ''
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                <span className={`text-xs font-medium ${color}`}>{label}</span>
                {job.stage !== 'pending' && job.stage !== 'completed' &&
                 job.stage !== 'failed' && job.stage !== 'cancelled' && (
                  <span className="text-xs text-gray-500 ml-auto">{job.progress}%</span>
                )}
              </div>
              <p className="text-xs text-gray-400 truncate leading-relaxed">{prompt}</p>
              <p className="text-xs text-gray-600 mt-0.5">
                {new Date(job.created_at).toLocaleString('ko-KR')}
              </p>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
