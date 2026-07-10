import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useApi } from '../api/client.js'
import Spinner from '../components/Spinner.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'
import ScoreCard from '../components/ScoreCard.jsx'

// Turn an ApiError into a friendly, non-blocking message. 503 = AI key missing.
function describe(err, fallback) {
  if (err?.status === 503) return 'AI key not configured'
  return err?.message || fallback
}

// Provenance panel: every tailored bullet, traced back to the Career Vault item
// it was grounded in. Bullets that failed the groundedness check are flagged so
// the user knows not to trust them blindly (RAG hallucination guardrail).
function ProvenancePanel({ provenance }) {
  if (!provenance || provenance.length === 0) return null

  const groundedCount = provenance.filter((p) => p.grounded).length
  const total = provenance.length

  return (
    <div
      data-testid="provenance-panel"
      className="mt-4 rounded-lg border border-border bg-surface/60 p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Provenance</h3>
        <span className="text-xs text-muted">
          <span className="font-medium text-emerald-300">{groundedCount}</span>
          {' / '}
          {total} bullets grounded
        </span>
      </div>

      <ul className="space-y-2">
        {provenance.map((p, i) => (
          <li
            key={p.source_id ? `${p.source_id}-${i}` : i}
            data-testid="provenance-bullet"
            className={`rounded-md border px-3 py-2 ${
              p.grounded
                ? 'border-border bg-bg/40'
                : 'border-amber-500/40 bg-amber-500/10'
            }`}
          >
            <p className="text-sm leading-relaxed text-ink">{p.text}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {p.grounded ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300">
                  <span aria-hidden>✓</span>
                  {p.source_title || 'Vault source'}
                </span>
              ) : (
                <span
                  data-testid="unverified-flag"
                  className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300"
                >
                  <span aria-hidden>⚠</span>
                  Unverified — no matching vault source
                </span>
              )}
              {typeof p.similarity === 'number' && (
                <span className="text-xs text-muted">
                  {Math.round(p.similarity * 100)}% match
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function JobDetailPage() {
  const { id } = useParams()
  const api = useApi()

  const [job, setJob] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [resumeText, setResumeText] = useState('')
  const [resumeDirty, setResumeDirty] = useState(false)

  // Per-action state.
  const [tailorState, setTailorState] = useState({ busy: false, msg: '', tone: 'error' })
  const [coverState, setCoverState] = useState({ busy: false, msg: '', tone: 'error' })
  const [scoreState, setScoreState] = useState({ busy: false, msg: '', tone: 'error' })
  const [resumeSave, setResumeSave] = useState({ busy: false, msg: '', tone: 'error' })

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const data = await api.getJob(id)
      setJob(data)
      setResumeText(data?.resume?.content || '')
      setResumeDirty(false)
    } catch (err) {
      setLoadError(describe(err, 'Could not load this job.'))
    } finally {
      setLoading(false)
    }
  }, [api, id])

  useEffect(() => {
    load()
  }, [load])

  const handleTailor = async () => {
    setTailorState({ busy: true, msg: '', tone: 'error' })
    try {
      const resume = await api.tailorResume(id)
      setJob((j) => ({ ...j, resume }))
      setResumeText(resume.content || '')
      setResumeDirty(false)
      setTailorState({ busy: false, msg: 'Resume tailored.', tone: 'info' })
    } catch (err) {
      const tone = err?.status === 503 ? 'warning' : 'error'
      setTailorState({ busy: false, msg: describe(err, 'Tailoring failed.'), tone })
    }
  }

  const handleCoverLetter = async () => {
    setCoverState({ busy: true, msg: '', tone: 'error' })
    try {
      const cover = await api.generateCoverLetter(id)
      setJob((j) => ({ ...j, cover_letter: cover }))
      setCoverState({ busy: false, msg: 'Cover letter generated.', tone: 'info' })
    } catch (err) {
      const tone = err?.status === 503 ? 'warning' : 'error'
      setCoverState({ busy: false, msg: describe(err, 'Generation failed.'), tone })
    }
  }

  const handleScore = async () => {
    setScoreState({ busy: true, msg: '', tone: 'error' })
    try {
      const score = await api.scoreJob(id)
      setJob((j) => ({ ...j, score }))
      setScoreState({ busy: false, msg: '', tone: 'info' })
    } catch (err) {
      setScoreState({ busy: false, msg: describe(err, 'Could not score.'), tone: 'error' })
    }
  }

  const handleSaveResume = async () => {
    if (!resumeText.trim()) {
      setResumeSave({ busy: false, msg: 'Resume cannot be empty.', tone: 'error' })
      return
    }
    setResumeSave({ busy: true, msg: '', tone: 'error' })
    try {
      const resume = await api.saveResume(id, resumeText.trim())
      setJob((j) => ({ ...j, resume }))
      setResumeDirty(false)
      setResumeSave({ busy: false, msg: 'Resume saved. Re-score to see the new fit.', tone: 'info' })
    } catch (err) {
      setResumeSave({ busy: false, msg: describe(err, 'Could not save the resume.'), tone: 'error' })
    }
  }

  if (loading) {
    return (
      <div className="py-24">
        <Spinner label="Loading job…" className="justify-center" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <ErrorBanner message={loadError} />
        <Link
          to="/app/board"
          className="mt-6 inline-block text-sm font-medium text-accent-hover hover:underline"
        >
          ← Back to board
        </Link>
      </div>
    )
  }

  const hasResume = Boolean(resumeText.trim())
  const provenance = job.resume?.provenance || []

  return (
    <div>
      <Link
        to="/app/board"
        className="text-sm font-medium text-muted hover:text-ink"
      >
        ← Back to board
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {job.title}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {job.company}
            {job.url && (
              <>
                {' · '}
                <a
                  href={job.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent-hover hover:underline"
                >
                  View posting
                </a>
              </>
            )}
          </p>
        </div>
        <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
          {job.status}
        </span>
      </div>

      {/* Action bar */}
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          onClick={handleTailor}
          disabled={tailorState.busy}
          data-testid="tailor-resume-button"
          className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-hover disabled:opacity-50"
        >
          {tailorState.busy ? 'Tailoring…' : 'Tailor resume'}
        </button>
        <button
          onClick={handleCoverLetter}
          disabled={coverState.busy}
          data-testid="cover-letter-button"
          className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-hover disabled:opacity-50"
        >
          {coverState.busy ? 'Generating…' : 'Generate cover letter'}
        </button>
        <button
          onClick={handleScore}
          disabled={scoreState.busy || !hasResume}
          data-testid="score-match-button"
          title={!hasResume ? 'Tailor or add a resume first' : undefined}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {scoreState.busy ? 'Scoring…' : 'Score match'}
        </button>
      </div>

      {/* Score is the centerpiece of the core loop. */}
      <div className="mt-6">
        <ErrorBanner message={scoreState.msg} tone={scoreState.tone} className="mb-4" />
        {job.score ? (
          <ScoreCard score={job.score} />
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-surface/40 p-6 text-sm text-muted">
            No score yet. Tailor or add a resume, then click{' '}
            <span className="font-medium text-ink">Score match</span> to see how
            well it fits this job.
          </div>
        )}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        {/* Editable resume */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink">Tailored resume</h2>
          </div>
          <ErrorBanner message={tailorState.msg} tone={tailorState.tone} className="mb-3" />
          <ErrorBanner message={resumeSave.msg} tone={resumeSave.tone} className="mb-3" />

          <textarea
            name="resumeContent"
            rows={16}
            value={resumeText}
            onChange={(e) => {
              setResumeText(e.target.value)
              setResumeDirty(true)
            }}
            data-testid="resume-editor"
            placeholder="Tailor a resume above, or paste one here, then save and score it."
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm leading-relaxed text-ink placeholder-muted/60 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={handleSaveResume}
              disabled={resumeSave.busy || !resumeText.trim()}
              data-testid="save-resume"
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {resumeSave.busy ? 'Saving…' : 'Save resume'}
            </button>
            {resumeDirty && (
              <span className="text-xs text-muted">Unsaved changes</span>
            )}
          </div>

          {/* Where each tailored bullet came from — vault-grounded provenance. */}
          <ProvenancePanel provenance={provenance} />
        </section>

        {/* Cover letter (read-only display) */}
        <section>
          <h2 className="mb-2 text-lg font-semibold text-ink">Cover letter</h2>
          <ErrorBanner message={coverState.msg} tone={coverState.tone} className="mb-3" />
          {job.cover_letter?.content ? (
            <div
              data-testid="cover-letter-content"
              className="whitespace-pre-wrap rounded-md border border-border bg-surface p-4 text-sm leading-relaxed text-ink/90"
            >
              {job.cover_letter.content}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border bg-surface/40 p-4 text-sm text-muted">
              No cover letter yet. Click{' '}
              <span className="font-medium text-ink">Generate cover letter</span>{' '}
              above.
            </div>
          )}
        </section>
      </div>

      {/* Job description for reference */}
      <section className="mt-8">
        <h2 className="mb-2 text-lg font-semibold text-ink">Job description</h2>
        <div className="whitespace-pre-wrap rounded-md border border-border bg-surface p-4 text-sm leading-relaxed text-muted">
          {job.description}
        </div>
      </section>
    </div>
  )
}
