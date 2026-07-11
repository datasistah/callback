import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useApi } from '../api/client.js'
import Spinner from '../components/Spinner.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'
import { getVoiceProvider } from '../voice/index.js'

// Interview Studio — Phase 4. Run a behavioral interview against a job:
// the browser reads each generated question aloud (TTS), captures a video answer
// (getUserMedia + MediaRecorder), and streams a live transcript (STT). Voice
// goes through the swappable provider seam (webspeech by default), so the whole
// experience runs at $0 with no voice server. Recordings and transcripts live in
// memory for this session — persistence is the bridge into Phase 5 (STAR critique).

function describe(err, fallback) {
  if (err?.status === 503) return 'AI key not configured'
  return err?.message || fallback
}

// Interview questions are prep material derived from the job, so a question's
// `source` is 'jd' (drawn from the job description) or 'core' (a role-agnostic
// behavioral competency).
function sourceChip(source) {
  if (source === 'jd')
    return { label: 'From the job description', cls: 'bg-sky-500/15 text-sky-300' }
  if (source === 'core')
    return { label: 'Core competency', cls: 'bg-surface-hover text-muted' }
  return null
}

function fmtTime(secs) {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// Prefer a broadly-supported WebM/Opus container; fall back to the UA default.
function pickRecorderOptions() {
  if (typeof MediaRecorder === 'undefined') return undefined
  const types = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ]
  for (const t of types) {
    if (MediaRecorder.isTypeSupported?.(t)) return { mimeType: t }
  }
  return undefined
}

function joinTranscript(existing, chunk) {
  const base = (existing || '').trim()
  return base ? `${base} ${chunk}` : chunk
}

export default function InterviewStudioPage() {
  const { id: jobId } = useParams()
  const api = useApi()
  const provider = useMemo(() => getVoiceProvider(), [])

  const [job, setJob] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // Session + questions.
  const [session, setSession] = useState(null) // { id, mode }
  const [questions, setQuestions] = useState([])
  const [gen, setGen] = useState({ busy: false, msg: '', tone: 'error' })
  const [index, setIndex] = useState(0)

  // Media + transcript, keyed by question id (in-memory this session).
  const [camera, setCamera] = useState('idle') // idle | ready | denied | unsupported
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [recordings, setRecordings] = useState({}) // qid -> { url }
  const [transcripts, setTranscripts] = useState({}) // qid -> string
  const [interim, setInterim] = useState('')
  const [autoRead, setAutoRead] = useState(provider.ttsSupported)
  const [voiceNote, setVoiceNote] = useState('')
  const [voices, setVoices] = useState(() => provider.listVoices?.() || [])
  const [voiceURI, setVoiceURI] = useState(() => {
    try {
      return localStorage.getItem('callback.voiceURI') || ''
    } catch {
      return ''
    }
  })
  // The auto-read effect reads the latest choice without re-firing (and cutting
  // off a preview) every time the voice changes.
  const voiceURIRef = useRef(voiceURI)

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const recognizerRef = useRef(null)
  const timerRef = useRef(null)
  const recordingsRef = useRef({})

  const current = questions[index] || null
  const qid = current?.id || current?.position || index

  // ---- Load the job + reuse the latest session for it (if any) --------------
  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const [jobData, sessions] = await Promise.all([
        api.getJob(jobId),
        api.listInterviewSessions().catch(() => []),
      ])
      setJob(jobData)
      const existing = (sessions || []).find((s) => s.job_id === jobId)
      if (existing) {
        const full = await api.getInterviewSession(existing.id)
        setSession({ id: full.id, mode: full.mode })
        setQuestions(full.questions || [])
      }
    } catch (err) {
      setLoadError(describe(err, 'Could not load this interview.'))
    } finally {
      setLoading(false)
    }
  }, [api, jobId])

  useEffect(() => {
    load()
  }, [load])

  // ---- Cleanup: stop capture, transcription, speech, and revoke blobs -------
  useEffect(() => {
    return () => {
      try {
        recorderRef.current?.state === 'recording' && recorderRef.current.stop()
      } catch { /* no-op */ }
      recognizerRef.current?.stop?.()
      provider.cancelSpeech?.()
      if (timerRef.current) clearInterval(timerRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      Object.values(recordingsRef.current).forEach((r) => r?.url && URL.revokeObjectURL(r.url))
    }
  }, [provider])

  // ---- Load installed voices (populates asynchronously in most browsers) ----
  useEffect(() => {
    if (!provider.ttsSupported || !provider.subscribeVoices) return
    setVoices(provider.listVoices())
    return provider.subscribeVoices((v) => setVoices(v))
  }, [provider])

  useEffect(() => {
    voiceURIRef.current = voiceURI
  }, [voiceURI])

  // ---- Read the question aloud when it changes (if TTS is on) ---------------
  useEffect(() => {
    if (!autoRead || !provider.ttsSupported || !current) return
    provider.speak(current.text, { voiceURI: voiceURIRef.current })
    return () => provider.cancelSpeech?.()
  }, [autoRead, provider, current])

  // Pick a voice, remember it, and play a short sample so the change is audible.
  const chooseVoice = (uri) => {
    setVoiceURI(uri)
    try {
      localStorage.setItem('callback.voiceURI', uri)
    } catch {
      /* ignore storage errors (private mode) */
    }
    provider.speak('Great — this is how your interviewer will sound.', { voiceURI: uri })
  }

  // ---- Session generation ---------------------------------------------------
  const generate = async () => {
    setGen({ busy: true, msg: '', tone: 'error' })
    try {
      const created = await api.createInterviewSession(jobId)
      setSession({ id: created.id, mode: created.mode })
      setQuestions(created.questions || [])
      setIndex(0)
      setGen({
        busy: false,
        msg: `Generated ${created.questions?.length || 0} questions (${created.mode}).`,
        tone: 'info',
      })
    } catch (err) {
      const tone = err?.status === 503 ? 'warning' : 'error'
      setGen({ busy: false, msg: describe(err, 'Could not generate questions.'), tone })
    }
  }

  // ---- Camera / mic ---------------------------------------------------------
  const ensureStream = useCallback(async () => {
    if (streamRef.current) return streamRef.current
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera('unsupported')
      throw new Error('Camera capture is not supported in this browser.')
    }
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    streamRef.current = stream
    if (videoRef.current) videoRef.current.srcObject = stream
    setCamera('ready')
    return stream
  }, [])

  const enableCamera = async () => {
    try {
      await ensureStream()
    } catch {
      setCamera((c) => (c === 'unsupported' ? c : 'denied'))
    }
  }

  const saveRecording = (questionId, url) => {
    const prev = recordingsRef.current[questionId]
    if (prev?.url) URL.revokeObjectURL(prev.url)
    recordingsRef.current = { ...recordingsRef.current, [questionId]: { url } }
    setRecordings(recordingsRef.current)
  }

  const startRecognizer = (questionId) => {
    if (!provider.sttSupported) return
    setInterim('')
    const rec = provider.createRecognizer({
      onFinal: (chunk) => {
        if (!chunk) return
        setTranscripts((prev) => ({ ...prev, [questionId]: joinTranscript(prev[questionId], chunk) }))
        setInterim('')
      },
      onInterim: (text) => setInterim(text),
      onError: (kind) => {
        if (kind === 'not-allowed') setVoiceNote('Microphone access was blocked — transcription is off.')
        else if (kind !== 'no-speech') setVoiceNote(`Transcription error: ${kind}`)
      },
    })
    recognizerRef.current = rec
    rec?.start()
  }

  const startRecording = async () => {
    setGen((g) => ({ ...g, msg: '' }))
    let stream
    try {
      stream = await ensureStream()
    } catch {
      setCamera((c) => (c === 'unsupported' ? c : 'denied'))
      return
    }
    provider.cancelSpeech?.() // don't record the interviewer's voice
    chunksRef.current = []
    const mr = new MediaRecorder(stream, pickRecorderOptions())
    const questionId = qid
    mr.ondataavailable = (e) => {
      if (e.data && e.data.size) chunksRef.current.push(e.data)
    }
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'video/webm' })
      if (blob.size) saveRecording(questionId, URL.createObjectURL(blob))
    }
    recorderRef.current = mr
    mr.start()
    startRecognizer(questionId)
    setRecording(true)
    setElapsed(0)
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000)
  }

  const stopRecording = useCallback(() => {
    try {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    } catch { /* no-op */ }
    recognizerRef.current?.stop?.()
    recognizerRef.current = null
    if (timerRef.current) clearInterval(timerRef.current)
    setRecording(false)
    setInterim('')
  }, [])

  const goTo = (next) => {
    if (recording) stopRecording()
    provider.cancelSpeech?.()
    setInterim('')
    setIndex(next)
  }

  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="py-24">
        <Spinner label="Loading interview…" className="justify-center" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <ErrorBanner message={loadError} />
        <Link to="/app/board" className="mt-6 inline-block text-sm font-medium text-accent-hover hover:underline">
          ← Back to board
        </Link>
      </div>
    )
  }

  const hasQuestions = questions.length > 0
  const chip = current ? sourceChip(current.source) : null
  const recordingUrl = recordings[qid]?.url

  return (
    <div>
      <Link to={`/app/jobs/${jobId}`} className="text-sm font-medium text-muted hover:text-ink">
        ← Back to job
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Interview Studio</h1>
          <p className="mt-1 text-sm text-muted">
            {job?.title}
            {job?.company ? ` · ${job.company}` : ''}
          </p>
        </div>
        <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
          Voice: {provider.label}
        </span>
      </div>

      <ErrorBanner message={gen.msg} tone={gen.tone} className="mt-5" />

      {!hasQuestions ? (
        // ---- Empty state: generate the question set --------------------------
        <div className="mt-6 rounded-lg border border-dashed border-border bg-surface/40 py-16 text-center">
          <p className="text-lg font-medium text-ink">No questions yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            Generate a set of behavioral (STAR) questions from this job description, grounded in
            your Career Vault. The agent may take a moment on the first run.
          </p>
          <button
            onClick={generate}
            disabled={gen.busy}
            data-testid="generate-questions"
            className="mt-6 rounded-md bg-accent px-5 py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {gen.busy ? 'Generating…' : 'Generate interview questions'}
          </button>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* ---- Camera + capture ------------------------------------------ */}
          <section>
            <div className="relative overflow-hidden rounded-lg border border-border bg-black/60 aspect-video">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                data-testid="camera-preview"
                className="h-full w-full object-cover"
              />
              {camera !== 'ready' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface/80 p-6 text-center">
                  {camera === 'unsupported' ? (
                    <p className="text-sm text-muted">Camera capture isn’t supported in this browser.</p>
                  ) : camera === 'denied' ? (
                    <p className="text-sm text-amber-300">
                      Camera/mic access was blocked. Allow it in your browser, then retry.
                    </p>
                  ) : (
                    <p className="text-sm text-muted">Enable your camera and mic to record answers.</p>
                  )}
                  {camera !== 'unsupported' && (
                    <button
                      onClick={enableCamera}
                      data-testid="enable-camera"
                      className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover"
                    >
                      {camera === 'denied' ? 'Retry camera' : 'Enable camera'}
                    </button>
                  )}
                </div>
              )}
              {recording && (
                <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-red-300">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                  REC {fmtTime(elapsed)}
                </div>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              {recording ? (
                <button
                  onClick={stopRecording}
                  data-testid="stop-recording"
                  className="rounded-md bg-red-500/90 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500"
                >
                  Stop recording
                </button>
              ) : (
                <button
                  onClick={startRecording}
                  disabled={camera === 'unsupported'}
                  data-testid="start-recording"
                  className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {recordingUrl ? 'Re-record answer' : 'Record answer'}
                </button>
              )}
              {provider.ttsSupported && (
                <button
                  onClick={() => provider.speak(current.text, { voiceURI })}
                  disabled={recording}
                  className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-hover disabled:opacity-50"
                >
                  🔊 Read aloud
                </button>
              )}
            </div>

            {recordingUrl && !recording && (
              <div className="mt-3">
                <p className="mb-1 text-xs font-medium text-muted">Your recorded answer</p>
                <video
                  src={recordingUrl}
                  controls
                  data-testid="recorded-playback"
                  className="w-full rounded-lg border border-border"
                />
              </div>
            )}
          </section>

          {/* ---- Question + transcript ------------------------------------- */}
          <section>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">
                Question {index + 1} of {questions.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => goTo(index - 1)}
                  disabled={index === 0}
                  data-testid="prev-question"
                  className="rounded border border-border px-2.5 py-1 text-xs text-muted transition hover:bg-surface-hover hover:text-ink disabled:opacity-40"
                >
                  ← Prev
                </button>
                <button
                  onClick={() => goTo(index + 1)}
                  disabled={index >= questions.length - 1}
                  data-testid="next-question"
                  className="rounded border border-border px-2.5 py-1 text-xs text-muted transition hover:bg-surface-hover hover:text-ink disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            </div>

            <div className="mt-3 rounded-lg border border-border bg-surface p-5">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-medium text-accent-hover">
                  {current.competency || 'Behavioral'}
                </span>
                {chip && (
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${chip.cls}`}>
                    {chip.label}
                  </span>
                )}
              </div>
              <p data-testid="question-text" className="text-lg leading-relaxed text-ink">
                {current.text}
              </p>
            </div>

            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="transcript" className="text-sm font-medium text-ink">
                  Answer transcript
                </label>
                {provider.sttSupported ? (
                  <span className="text-xs text-muted">
                    {recording ? 'Listening…' : 'Auto-transcribed while recording'}
                  </span>
                ) : (
                  <span className="text-xs text-muted">Type your answer (no live transcription here)</span>
                )}
              </div>
              <textarea
                id="transcript"
                rows={8}
                value={transcripts[qid] || ''}
                onChange={(e) => setTranscripts((prev) => ({ ...prev, [qid]: e.target.value }))}
                data-testid="transcript"
                placeholder="Your spoken answer appears here as you record — or type notes to rehearse your STAR structure."
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm leading-relaxed text-ink placeholder-muted/60 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
              {recording && interim && (
                <p className="mt-1 text-sm italic text-muted">{interim}</p>
              )}
            </div>

            {provider.ttsSupported && voices.length > 0 && (
              <div className="mt-4">
                <label htmlFor="voice" className="block text-xs font-medium text-muted">
                  Interviewer voice
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <select
                    id="voice"
                    value={voiceURI}
                    onChange={(e) => chooseVoice(e.target.value)}
                    data-testid="voice-select"
                    className="max-w-xs flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                  >
                    <option value="">System default</option>
                    {voices.map((v) => (
                      <option key={v.voiceURI} value={v.voiceURI}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => provider.speak('Great — this is how your interviewer will sound.', { voiceURI })}
                    disabled={recording}
                    className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-ink transition hover:bg-surface-hover disabled:opacity-50"
                  >
                    Preview
                  </button>
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-4">
              {provider.ttsSupported && (
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={autoRead}
                    onChange={(e) => setAutoRead(e.target.checked)}
                    className="accent-accent"
                  />
                  Read questions aloud
                </label>
              )}
              <button
                onClick={generate}
                disabled={gen.busy}
                data-testid="regenerate-questions"
                className="text-xs font-medium text-muted transition hover:text-ink disabled:opacity-50"
              >
                {gen.busy ? 'Regenerating…' : '↻ Regenerate questions'}
              </button>
            </div>

            {voiceNote && <ErrorBanner message={voiceNote} tone="warning" className="mt-4" />}
          </section>
        </div>
      )}
    </div>
  )
}
