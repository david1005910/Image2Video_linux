const BASE = ''  // Vite proxy handles /api and /ws routing

export const api = {
  async listJobs() {
    const r = await fetch(`${BASE}/api/jobs`)
    if (!r.ok) throw new Error(await r.text())
    return r.json()
  },

  async createJob(config) {
    const r = await fetch(`${BASE}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    if (!r.ok) throw new Error(await r.text())
    return r.json()
  },

  async cancelJob(jobId) {
    await fetch(`${BASE}/api/jobs/${jobId}`, { method: 'DELETE' })
  },

  fileUrl(jobId, stage) {
    return `${BASE}/api/jobs/${jobId}/file/${stage}`
  },

  openWebSocket(jobId) {
    return new WebSocket(`ws://localhost:8000/ws/${jobId}`)
  },
}
