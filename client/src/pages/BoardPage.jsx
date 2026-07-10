import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '../api/client.js'
import AddJobForm from '../components/AddJobForm.jsx'
import Spinner from '../components/Spinner.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'

const COLUMNS = [
  { key: 'bookmarked', label: 'Bookmarked' },
  { key: 'applied', label: 'Applied' },
  { key: 'interviewing', label: 'Interviewing' },
  { key: 'offer', label: 'Offer' },
]
const STATUSES = COLUMNS.map((c) => c.key)

function JobCard({ job, onStatusChange, onDelete, busy }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <Link
        to={`/app/jobs/${job.id}`}
        className="block text-sm font-semibold text-ink hover:text-accent"
      >
        {job.title}
      </Link>
      <p className="mt-0.5 text-xs text-gray-500">{job.company}</p>

      <div className="mt-3 flex items-center gap-2">
        <select
          aria-label="Change status"
          data-testid={`status-select-${job.id}`}
          value={job.status}
          disabled={busy}
          onChange={(e) => onStatusChange(job, e.target.value)}
          className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs outline-none focus:border-accent disabled:opacity-50"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          onClick={() => onDelete(job)}
          disabled={busy}
          data-testid={`delete-job-${job.id}`}
          aria-label={`Delete ${job.title}`}
          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-500 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </div>
  )
}

export default function BoardPage() {
  const api = useApi()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.listJobs()
      setJobs(data || [])
    } catch (err) {
      setError(err.message || 'Could not load your jobs.')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    load()
  }, [load])

  const handleCreate = async (job) => {
    const created = await api.createJob(job)
    setJobs((prev) => [created, ...prev])
  }

  const handleStatusChange = async (job, status) => {
    if (status === job.status) return
    const previous = job.status
    setActionError('')
    setBusyId(job.id)
    // Optimistic update.
    setJobs((prev) =>
      prev.map((j) => (j.id === job.id ? { ...j, status } : j))
    )
    try {
      await api.updateJobStatus(job.id, status)
    } catch (err) {
      // Revert on failure.
      setJobs((prev) =>
        prev.map((j) => (j.id === job.id ? { ...j, status: previous } : j))
      )
      setActionError(err.message || 'Could not move the job. Card reverted.')
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (job) => {
    setActionError('')
    setBusyId(job.id)
    const snapshot = jobs
    setJobs((prev) => prev.filter((j) => j.id !== job.id))
    try {
      await api.deleteJob(job.id)
    } catch (err) {
      setJobs(snapshot)
      setActionError(err.message || 'Could not delete the job.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Your pipeline
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Track every saved job from bookmark to offer.
          </p>
        </div>
        <AddJobForm onCreate={handleCreate} />
      </div>

      <ErrorBanner message={error} className="mb-4" />
      <ErrorBanner message={actionError} className="mb-4" />

      {loading ? (
        <div className="py-24">
          <Spinner label="Loading your jobs…" className="justify-center" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white py-20 text-center">
          <p className="text-lg font-medium text-ink">No jobs yet</p>
          <p className="mt-2 text-sm text-gray-500">
            Add your first job to start tailoring and scoring.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {COLUMNS.map((col) => {
            const colJobs = jobs.filter((j) => j.status === col.key)
            return (
              <div
                key={col.key}
                data-testid={`column-${col.key}`}
                className="rounded-lg bg-gray-100/60 p-3"
              >
                <div className="mb-3 flex items-center justify-between px-1">
                  <h2 className="text-sm font-semibold text-gray-700">
                    {col.label}
                  </h2>
                  <span className="rounded-full bg-white px-2 text-xs text-gray-500">
                    {colJobs.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {colJobs.length === 0 ? (
                    <p className="px-1 py-6 text-center text-xs text-gray-400">
                      Nothing here yet
                    </p>
                  ) : (
                    colJobs.map((job) => (
                      <JobCard
                        key={job.id}
                        job={job}
                        busy={busyId === job.id}
                        onStatusChange={handleStatusChange}
                        onDelete={handleDelete}
                      />
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
