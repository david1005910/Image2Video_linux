import React, { useState, useEffect, useCallback } from 'react'
import { api } from './api'
import JobList from './components/JobList'
import ConfigForm from './components/ConfigForm'
import JobDetail from './components/JobDetail'

export default function App() {
  const [jobs, setJobs] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [view, setView] = useState('new') // 'new' | 'detail'
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)

  const loadJobs = useCallback(async () => {
    try {
      const data = await api.listJobs()
      setJobs(data)
    } catch (e) {
      setError('백엔드에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요.')
    }
  }, [])

  useEffect(() => {
    loadJobs()
    const interval = setInterval(loadJobs, 5000)
    return () => clearInterval(interval)
  }, [loadJobs])

  const handleSelect = (jobId) => {
    setSelectedId(jobId)
    setView('detail')
    setError(null)
  }

  const handleNew = () => {
    setView('new')
    setSelectedId(null)
    setError(null)
  }

  const handleSubmit = async (config) => {
    setCreating(true)
    setError(null)
    try {
      const job = await api.createJob(config)
      await loadJobs()
      setSelectedId(job.job_id)
      setView('detail')
    } catch (e) {
      setError(`작업 생성 실패: ${e.message}`)
    } finally {
      setCreating(false)
    }
  }

  const handleCancel = async (jobId) => {
    await api.cancelJob(jobId)
    await loadJobs()
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-72 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-lg font-bold text-white">🎬 Image2Video</h1>
          <p className="text-xs text-gray-500 mt-0.5">Wan 2.2 I2V Pipeline</p>
        </div>
        <div className="p-3">
          <button
            onClick={handleNew}
            className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition"
          >
            + 새 작업
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <JobList jobs={jobs} selectedId={selectedId} onSelect={handleSelect} />
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {error && (
          <div className="m-4 p-3 bg-red-900/40 border border-red-700 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        {view === 'new' && (
          <ConfigForm onSubmit={handleSubmit} submitting={creating} />
        )}

        {view === 'detail' && selectedId && (
          <JobDetail
            jobId={selectedId}
            onCancel={handleCancel}
            onRefresh={loadJobs}
          />
        )}
      </main>
    </div>
  )
}
