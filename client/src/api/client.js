import { useMemo } from 'react'
import { useSession } from '../auth/SessionProvider.jsx'

// API base URL. In the single-app production build this is set to a relative
// '/api' (same origin as the served client — no CORS). In local dev it's unset,
// so we default to the standalone backend on :3001 that `vite dev` talks to.
const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'

// An error that carries the parsed API error body and HTTP status, so pages can
// render a consistent message and branch on status (e.g. 503 -> AI not configured).
export class ApiError extends Error {
  constructor(message, { status, code } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

async function request(path, { method = 'GET', body, accessToken } = {}) {
  let res
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
  } catch {
    throw new ApiError(
      'Could not reach the server. Make sure the backend is running on port 3001.',
      { status: 0, code: 'network_error' }
    )
  }

  // 204 No Content (DELETE) — nothing to parse.
  if (res.status === 204) return null

  let data = null
  const text = await res.text()
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  if (!res.ok) {
    const message =
      (data && data.message) ||
      `Request failed with status ${res.status}.`
    throw new ApiError(message, {
      status: res.status,
      code: data?.error,
    })
  }

  return data
}

// Builds the full set of API functions bound to the current access token.
export function createApi(accessToken) {
  const auth = { accessToken }
  return {
    // Profile
    getProfile: () => request('/profile', { ...auth }),
    saveProfile: (content) =>
      request('/profile', { method: 'PUT', body: { content }, ...auth }),

    // Jobs
    listJobs: () => request('/jobs', { ...auth }),
    getJob: (id) => request(`/jobs/${id}`, { ...auth }),
    createJob: (job) =>
      request('/jobs', { method: 'POST', body: job, ...auth }),
    // Read a job posting from a link → { title, company, description, url }.
    // Does not persist; the caller reviews/edits, then createJob saves.
    importJobFromUrl: (url) =>
      request('/jobs/import-url', { method: 'POST', body: { url }, ...auth }),
    updateJob: (id, fields) =>
      request(`/jobs/${id}`, { method: 'PUT', body: fields, ...auth }),
    updateJobStatus: (id, status) =>
      request(`/jobs/${id}/status`, {
        method: 'PATCH',
        body: { status },
        ...auth,
      }),
    deleteJob: (id) =>
      request(`/jobs/${id}`, { method: 'DELETE', ...auth }),

    // Resume
    tailorResume: (jobId) =>
      request(`/jobs/${jobId}/resume/tailor`, { method: 'POST', ...auth }),
    getResume: (jobId) => request(`/jobs/${jobId}/resume`, { ...auth }),
    saveResume: (jobId, content) =>
      request(`/jobs/${jobId}/resume`, {
        method: 'PUT',
        body: { content },
        ...auth,
      }),

    // Cover letter
    generateCoverLetter: (jobId) =>
      request(`/jobs/${jobId}/cover-letter/generate`, {
        method: 'POST',
        ...auth,
      }),
    getCoverLetter: (jobId) =>
      request(`/jobs/${jobId}/cover-letter`, { ...auth }),

    // Score
    scoreJob: (jobId) =>
      request(`/jobs/${jobId}/score`, { method: 'POST', ...auth }),
    getScore: (jobId) => request(`/jobs/${jobId}/score`, { ...auth }),

    // Career Vault
    listVault: () => request('/vault', { ...auth }),
    createVaultItem: (item) =>
      request('/vault', { method: 'POST', body: item, ...auth }),
    updateVaultItem: (id, fields) =>
      request(`/vault/${id}`, { method: 'PUT', body: fields, ...auth }),
    deleteVaultItem: (id) =>
      request(`/vault/${id}`, { method: 'DELETE', ...auth }),
    buildVaultFromProfile: () =>
      request('/vault/build-from-profile', { method: 'POST', ...auth }),
    searchVault: (query) =>
      request('/vault/search', { method: 'POST', body: query, ...auth }),

    // Interview prep — behavioral question generation (agentic ReAct loop).
    listInterviewSessions: () =>
      request('/interview/sessions', { ...auth }),
    getInterviewSession: (id) =>
      request(`/interview/sessions/${id}`, { ...auth }),
    createInterviewSession: (jobId, count) =>
      request('/interview/sessions', {
        method: 'POST',
        body: { job_id: jobId, ...(count ? { count } : {}) },
        ...auth,
      }),
    deleteInterviewSession: (id) =>
      request(`/interview/sessions/${id}`, { method: 'DELETE', ...auth }),
    previewInterview: (job) =>
      request('/interview/preview', { method: 'POST', body: job, ...auth }),
    // Grade a transcribed answer to one of a session's questions (STAR + relevance).
    gradeInterviewAnswer: (sessionId, questionId, transcript) =>
      request(`/interview/sessions/${sessionId}/answers`, {
        method: 'POST',
        body: { question_id: questionId, transcript },
        ...auth,
      }),
  }
}

// Hook that returns the API bound to the current session token. Re-binds when
// the token changes (e.g. after refresh).
export function useApi() {
  const { accessToken } = useSession()
  return useMemo(() => createApi(accessToken), [accessToken])
}
