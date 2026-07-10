import { useMemo } from 'react'
import { useSession } from '../auth/SessionProvider.jsx'

const BASE_URL = 'http://localhost:3001/api'

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
  }
}

// Hook that returns the API bound to the current session token. Re-binds when
// the token changes (e.g. after refresh).
export function useApi() {
  const { accessToken } = useSession()
  return useMemo(() => createApi(accessToken), [accessToken])
}
