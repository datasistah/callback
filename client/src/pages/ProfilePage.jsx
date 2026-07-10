import { useCallback, useEffect, useState } from 'react'
import { useApi } from '../api/client.js'
import Spinner from '../components/Spinner.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'

export default function ProfilePage() {
  const api = useApi()
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const profile = await api.getProfile()
      setContent(profile?.content || '')
    } catch (err) {
      setLoadError(err.message || 'Could not load your profile.')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    load()
  }, [load])

  const contentValid = content.trim().length > 0

  const handleSave = async (e) => {
    e.preventDefault()
    setSaveError('')
    setSaved(false)
    if (!contentValid) {
      setSaveError('Your base profile cannot be empty.')
      return
    }
    setSaving(true)
    try {
      const updated = await api.saveProfile(content.trim())
      setContent(updated?.content || content.trim())
      setSaved(true)
    } catch (err) {
      setSaveError(err.message || 'Could not save your profile.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        Base profile
      </h1>
      <p className="mt-1 text-sm text-muted">
        Paste your master resume or profile once. Every tailored resume and
        cover letter draws from this — and it seeds your Career Vault.
      </p>

      <ErrorBanner message={loadError} className="mt-6" />

      {loading ? (
        <div className="py-24">
          <Spinner label="Loading your profile…" className="justify-center" />
        </div>
      ) : (
        <form onSubmit={handleSave} noValidate className="mt-6">
          <ErrorBanner message={saveError} className="mb-4" />
          {saved && (
            <ErrorBanner
              message="Base profile saved."
              tone="info"
              className="mb-4"
            />
          )}

          <label
            htmlFor="content"
            className="block text-sm font-medium text-ink"
          >
            Base resume / profile
          </label>
          <textarea
            id="content"
            name="content"
            rows={16}
            value={content}
            onChange={(e) => {
              setContent(e.target.value)
              setSaved(false)
            }}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm leading-relaxed text-ink placeholder-muted/60 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            placeholder="Paste your full resume or professional history here…"
          />
          {!contentValid && (
            <p className="mt-1 text-xs text-muted">
              Add your history so tailoring has something to work from.
            </p>
          )}

          <div className="mt-5">
            <button
              type="submit"
              data-testid="save-profile"
              disabled={!contentValid || saving}
              className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
