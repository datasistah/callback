import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApi } from '../api/client.js'
import Spinner from '../components/Spinner.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'
import ScoreCard from '../components/ScoreCard.jsx'
import { ACCEPT_ATTR } from '../lib/resumeFile.js'

// Start Here — the guided end-to-end flow that shows Callback's value in one
// pass: (1) upload/confirm your base resume, (2) point it at a job, (3) tailor
// and watch the fit score jump from "before" to "after". Each step reuses the
// same endpoints the rest of the app uses; nothing here is a special case.

const STEPS = ['Your resume', 'Target job', 'Tailor & compare']

function Stepper({ current }) {
  return (
    <ol className="mb-8 flex items-center gap-2 text-sm">
      {STEPS.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'active' : 'todo'
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                state === 'done'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : state === 'active'
                    ? 'bg-accent text-white'
                    : 'bg-surface text-muted'
              }`}
            >
              {state === 'done' ? '✓' : i + 1}
            </span>
            <span className={state === 'active' ? 'font-medium text-ink' : 'text-muted'}>
              {label}
            </span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-border" />}
          </li>
        )
      })}
    </ol>
  )
}

// Headline before → after comparison: two scores, an arrow, and the delta.
function BeforeAfter({ before, after, basis }) {
  const delta = after.value - before.value
  const up = delta > 0
  const deltaTone = up ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-muted'
  const beforeLabel = basis === 'profile' ? 'Base resume' : 'Previous version'
  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <div className="flex items-center justify-center gap-6 sm:gap-10">
        <div className="text-center">
          <div className="text-4xl font-bold text-muted">{before.value}</div>
          <div className="mt-1 text-xs uppercase tracking-wide text-muted">{beforeLabel}</div>
        </div>
        <div className="text-2xl text-muted">→</div>
        <div className="text-center">
          <div className={`text-5xl font-bold ${up ? 'text-emerald-400' : 'text-ink'}`}>
            {after.value}
          </div>
          <div className="mt-1 text-xs uppercase tracking-wide text-muted">Tailored</div>
        </div>
        <div className="text-center">
          <div className={`text-2xl font-bold ${deltaTone}`}>
            {delta > 0 ? '+' : ''}
            {delta}
          </div>
          <div className="mt-1 text-xs uppercase tracking-wide text-muted">change</div>
        </div>
      </div>
      <p className="mt-4 text-center text-sm text-muted">
        {up
          ? `Tailoring raised this resume's keyword fit by ${delta} points.`
          : delta === 0
            ? 'Same fit — this resume already covered the job’s keywords.'
            : 'The tailored version scored lower — review the bullets below.'}
      </p>
    </div>
  )
}

export default function StartHerePage() {
  const api = useApi()
  const navigate = useNavigate()
  const fileRef = useRef(null)

  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(true)

  // Step 1 — resume / base profile.
  const [profile, setProfile] = useState('')
  const [profileSaved, setProfileSaved] = useState(false)
  const [uploadNote, setUploadNote] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)

  // Step 2 — job.
  const [jobs, setJobs] = useState([])
  const [jobId, setJobId] = useState('')
  const [newJob, setNewJob] = useState({ title: '', company: '', description: '' })
  const [creatingJob, setCreatingJob] = useState(false)

  // Step 3 — before/after.
  const [before, setBefore] = useState(null) // { value, ..., basis }
  const [after, setAfter] = useState(null)
  const [busy, setBusy] = useState(false)

  const [error, setError] = useState('')

  // Load the base profile + existing jobs up front.
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [prof, jobList] = await Promise.all([
        api.getProfile().catch(() => null),
        api.listJobs().catch(() => []),
      ])
      const content = prof?.content || ''
      setProfile(content)
      setProfileSaved(Boolean(content.trim()))
      setJobs(jobList || [])
    } catch (err) {
      setError(err.message || 'Could not load your data.')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    load()
  }, [load])

  // ---- Step 1: resume ------------------------------------------------------
  const handleFile = async (e) => {
    const file = e.target.files && e.target.files[0]
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    setError('')
    setUploadNote('')
    try {
      const { extractResumeText } = await import('../lib/resumeFile.js')
      const text = await extractResumeText(file)
      setProfile(text)
      setProfileSaved(false)
      setUploadNote(`Loaded “${file.name}” — review it, then save & continue.`)
    } catch (err) {
      setError(err.message || 'Could not read that file.')
    }
  }

  const saveProfileAndNext = async () => {
    if (!profile.trim()) {
      setError('Add your resume text (or upload a file) first.')
      return
    }
    setSavingProfile(true)
    setError('')
    try {
      await api.saveProfile(profile.trim())
      // Seed the vault from the profile so tailoring has grounding to draw on.
      await api.buildVaultFromProfile().catch(() => {})
      setProfileSaved(true)
      setStep(1)
    } catch (err) {
      setError(err.message || 'Could not save your resume.')
    } finally {
      setSavingProfile(false)
    }
  }

  // ---- Step 2: job ---------------------------------------------------------
  const chooseExistingAndNext = () => {
    if (!jobId) {
      setError('Pick a job, or add a new one below.')
      return
    }
    setError('')
    setStep(2)
    resetScores()
  }

  const createJobAndNext = async () => {
    if (!newJob.title.trim() || !newJob.description.trim()) {
      setError('A job needs at least a title and a description.')
      return
    }
    setCreatingJob(true)
    setError('')
    try {
      const created = await api.createJob({
        title: newJob.title.trim(),
        company: newJob.company.trim(),
        description: newJob.description.trim(),
      })
      setJobs((prev) => [created, ...prev])
      setJobId(created.id)
      setStep(2)
      resetScores()
    } catch (err) {
      setError(err.message || 'Could not create that job.')
    } finally {
      setCreatingJob(false)
    }
  }

  // ---- Step 3: tailor & compare -------------------------------------------
  const resetScores = () => {
    setBefore(null)
    setAfter(null)
  }

  const runComparison = async () => {
    setBusy(true)
    setError('')
    setAfter(null)
    try {
      // 1) Score the resume as it stands now (base profile, or the previous
      //    tailored version) — the "before".
      const baseline = await api.scoreBaseline(jobId)
      setBefore(baseline)
      // 2) Tailor the resume for this job.
      await api.tailorResume(jobId)
      // 3) Score the freshly tailored resume — the "after".
      const tailored = await api.scoreJob(jobId)
      setAfter(tailored)
    } catch (err) {
      setError(err.message || 'Could not run the comparison. Add a resume and a job description first.')
    } finally {
      setBusy(false)
    }
  }

  const selectedJob = jobs.find((j) => j.id === jobId) || null

  if (loading) {
    return (
      <div className="py-24">
        <Spinner label="Getting things ready…" className="justify-center" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Start here</h1>
      <p className="mt-1 text-sm text-muted">
        Upload your resume, point it at a job, and see the fit score climb after tailoring.
      </p>

      <div className="mt-8">
        <Stepper current={step} />
        <ErrorBanner message={error} className="mb-4" />

        {/* ---- Step 1: resume ------------------------------------------- */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">Your resume</h2>
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept={ACCEPT_ATTR}
                  onChange={handleFile}
                  data-testid="start-resume-file"
                  className="hidden"
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-hover"
                >
                  Upload PDF / Word / text
                </button>
              </div>
            </div>
            {uploadNote && <ErrorBanner message={uploadNote} tone="info" />}
            {profileSaved && !uploadNote && (
              <p className="text-sm text-muted">
                We found your saved resume — edit it if you like, then continue.
              </p>
            )}
            <textarea
              rows={14}
              value={profile}
              onChange={(e) => {
                setProfile(e.target.value)
                setProfileSaved(false)
              }}
              data-testid="start-resume-text"
              placeholder="Paste your resume here, or use “Upload” above."
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm leading-relaxed text-ink placeholder-muted/60 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
            <div className="flex justify-end">
              <button
                onClick={saveProfileAndNext}
                disabled={savingProfile || !profile.trim()}
                data-testid="start-resume-next"
                className="rounded-md bg-accent px-5 py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingProfile ? 'Saving…' : 'Save & continue'}
              </button>
            </div>
          </div>
        )}

        {/* ---- Step 2: job --------------------------------------------- */}
        {step === 1 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-ink">Target job</h2>

            {jobs.length > 0 && (
              <div className="rounded-lg border border-border bg-surface p-4">
                <label htmlFor="job-select" className="block text-sm font-medium text-ink">
                  Pick a job you already saved
                </label>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <select
                    id="job-select"
                    value={jobId}
                    onChange={(e) => setJobId(e.target.value)}
                    data-testid="start-job-select"
                    className="min-w-56 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                  >
                    <option value="">Select a job…</option>
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.title}
                        {j.company ? ` · ${j.company}` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={chooseExistingAndNext}
                    disabled={!jobId}
                    className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="text-sm font-medium text-ink">
                {jobs.length > 0 ? 'Or add a new job' : 'Add the job you’re targeting'}
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <input
                  value={newJob.title}
                  onChange={(e) => setNewJob((j) => ({ ...j, title: e.target.value }))}
                  data-testid="start-job-title"
                  placeholder="Job title (e.g. Senior ML Engineer)"
                  className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink placeholder-muted/60 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                />
                <input
                  value={newJob.company}
                  onChange={(e) => setNewJob((j) => ({ ...j, company: e.target.value }))}
                  data-testid="start-job-company"
                  placeholder="Company (optional)"
                  className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink placeholder-muted/60 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                />
              </div>
              <textarea
                rows={6}
                value={newJob.description}
                onChange={(e) => setNewJob((j) => ({ ...j, description: e.target.value }))}
                data-testid="start-job-description"
                placeholder="Paste the full job description here…"
                className="mt-3 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm leading-relaxed text-ink placeholder-muted/60 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
              <div className="mt-3 flex items-center justify-between">
                <button
                  onClick={() => setStep(0)}
                  className="text-sm font-medium text-muted transition hover:text-ink"
                >
                  ← Back
                </button>
                <button
                  onClick={createJobAndNext}
                  disabled={creatingJob || !newJob.title.trim() || !newJob.description.trim()}
                  data-testid="start-job-create"
                  className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {creatingJob ? 'Adding…' : 'Add & continue'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ---- Step 3: tailor & compare -------------------------------- */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">Tailor & compare</h2>
              {selectedJob && (
                <span className="text-sm text-muted">
                  {selectedJob.title}
                  {selectedJob.company ? ` · ${selectedJob.company}` : ''}
                </span>
              )}
            </div>

            {!after && (
              <div className="rounded-lg border border-dashed border-border bg-surface/40 p-6 text-center">
                <p className="text-sm text-muted">
                  We’ll score your resume as-is, tailor it to this job, and score it again so you
                  can see the difference.
                </p>
                <button
                  onClick={runComparison}
                  disabled={busy}
                  data-testid="start-run-comparison"
                  className="mt-4 rounded-md bg-accent px-5 py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? 'Scoring & tailoring…' : 'Tailor & compare scores'}
                </button>
                {busy && <Spinner label="Working…" className="mt-4 justify-center" />}
              </div>
            )}

            {before && after && (
              <>
                <BeforeAfter before={before} after={after} basis={before.basis} />
                <div>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
                    Tailored resume breakdown
                  </h3>
                  <ScoreCard score={after} />
                </div>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <Link
                    to={`/app/jobs/${jobId}`}
                    className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover"
                  >
                    Open the full job
                  </Link>
                  <Link
                    to={`/app/jobs/${jobId}/interview`}
                    className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-hover"
                  >
                    Practice the interview
                  </Link>
                  <button
                    onClick={runComparison}
                    disabled={busy}
                    className="text-sm font-medium text-muted transition hover:text-ink disabled:opacity-50"
                  >
                    {busy ? 'Re-running…' : '↻ Tailor again'}
                  </button>
                </div>
              </>
            )}

            {!after && (
              <button
                onClick={() => setStep(1)}
                className="text-sm font-medium text-muted transition hover:text-ink"
              >
                ← Back
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
