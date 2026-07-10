import { useState } from 'react'
import ErrorBanner from './ErrorBanner.jsx'

// Add-job form. Field `name` attributes match the API contract (title, company,
// description, url). Calls onCreate(job) which returns a promise.
export default function AddJobForm({ onCreate }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [company, setCompany] = useState('')
  const [description, setDescription] = useState('')
  const [url, setUrl] = useState('')
  const [touched, setTouched] = useState({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const titleValid = title.trim().length > 0
  const companyValid = company.trim().length > 0
  const descriptionValid = description.trim().length > 0
  const formValid = titleValid && companyValid && descriptionValid

  const reset = () => {
    setTitle('')
    setCompany('')
    setDescription('')
    setUrl('')
    setTouched({})
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setTouched({ title: true, company: true, description: true })
    setError('')
    if (!formValid) return

    setSubmitting(true)
    try {
      await onCreate({
        title: title.trim(),
        company: company.trim(),
        description: description.trim(),
        ...(url.trim() ? { url: url.trim() } : {}),
      })
      reset()
      setOpen(false)
    } catch (err) {
      setError(err.message || 'Could not add the job.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        data-testid="add-job-button"
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover"
      >
        Add job
      </button>
    )
  }

  const inputClass =
    'mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink placeholder-muted/60 outline-none focus:border-accent focus:ring-1 focus:ring-accent'

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-lg border border-border bg-surface p-5 shadow-sm"
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-ink">Add a job</h3>
        <button
          type="button"
          onClick={() => {
            reset()
            setOpen(false)
          }}
          className="text-sm text-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>

      <ErrorBanner message={error} className="mb-4" />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-ink">
            Title
          </label>
          <input
            id="title"
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, title: true }))}
            className={inputClass}
            placeholder="Senior Machine Learning Engineer"
          />
          {touched.title && !titleValid && (
            <p className="mt-1 text-xs text-red-400">Title is required.</p>
          )}
        </div>
        <div>
          <label
            htmlFor="company"
            className="block text-sm font-medium text-ink"
          >
            Company
          </label>
          <input
            id="company"
            name="company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, company: true }))}
            className={inputClass}
            placeholder="Northwind AI"
          />
          {touched.company && !companyValid && (
            <p className="mt-1 text-xs text-red-400">Company is required.</p>
          )}
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="url" className="block text-sm font-medium text-ink">
          Job URL <span className="text-muted">(optional)</span>
        </label>
        <input
          id="url"
          name="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className={inputClass}
          placeholder="https://company.com/careers/role"
        />
      </div>

      <div className="mt-4">
        <label
          htmlFor="description"
          className="block text-sm font-medium text-ink"
        >
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, description: true }))}
          className={inputClass}
          placeholder="Paste the full job description here…"
        />
        {touched.description && !descriptionValid && (
          <p className="mt-1 text-xs text-red-400">Description is required.</p>
        )}
      </div>

      <div className="mt-5 flex justify-end">
        <button
          type="submit"
          data-testid="save-job"
          disabled={!formValid || submitting}
          className="rounded-md bg-accent px-5 py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}
