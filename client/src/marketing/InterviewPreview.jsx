import { useEffect, useState } from 'react'
import { useInView } from './Reveal.jsx'

// A live-looking preview of the Interview Studio: a STAR question, a pulsing
// "recording" mic, an answer that types itself out, and STAR score bars that
// fill — all triggered when the card scrolls into view.
const QUESTION =
  'Tell me about a time you improved a model’s performance. What did you do, and what was the result?'
const ANSWER =
  'When our recommender’s click-through stalled, I owned the fix: I rebuilt the ranking model in PyTorch, ran an A/B test across 2M users, and shipped it — lifting engagement 22%.'

const STAR = [
  { label: 'Situation', pct: 84 },
  { label: 'Task', pct: 80 },
  { label: 'Action', pct: 100 },
  { label: 'Result', pct: 96 },
]

export default function InterviewPreview() {
  const [ref, inView] = useInView({ threshold: 0.4 })
  const [typed, setTyped] = useState('')
  const [done, setDone] = useState(false)

  // Typewriter: reveal the answer once, when the card first appears.
  useEffect(() => {
    if (!inView) return
    let i = 0
    const id = setInterval(() => {
      i += 2
      setTyped(ANSWER.slice(0, i))
      if (i >= ANSWER.length) {
        clearInterval(id)
        setDone(true)
      }
    }, 22)
    return () => clearInterval(id)
  }, [inView])

  return (
    <div
      ref={ref}
      className="rounded-2xl border border-border bg-surface/80 p-6 shadow-2xl shadow-black/40 backdrop-blur"
    >
      <div className="mb-4 flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-medium text-muted">
          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-accent-hover">STAR question</span>
        </span>
        <span className="flex items-center gap-2 text-xs font-medium text-red-300">
          <span className={`h-2.5 w-2.5 rounded-full bg-red-500 ${inView && !done ? 'cb-pulse-ring' : ''}`} />
          {done ? 'Transcribed' : 'Recording'}
        </span>
      </div>

      <p className="text-sm font-medium leading-relaxed text-ink">{QUESTION}</p>

      <div className="mt-3 min-h-[92px] rounded-lg border border-border bg-bg/60 p-3">
        <p className="text-xs uppercase tracking-wide text-muted">Your answer</p>
        <p className="mt-1 text-sm leading-relaxed text-ink/90">
          {typed}
          {!done && inView && <span className="cb-caret">▋</span>}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-2.5">
        {STAR.map((s) => (
          <div key={s.label}>
            <div className="mb-1 flex items-center justify-between text-xs text-muted">
              <span>{s.label}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg">
              <div
                className="cb-bar-fill h-full rounded-full bg-gradient-to-r from-accent to-emerald-400"
                style={{ width: done ? `${s.pct}%` : '0%' }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
        <span className="text-xs text-muted">Overall</span>
        <span className="text-sm font-semibold text-emerald-300">{done ? '90 / 100' : '—'}</span>
      </div>
    </div>
  )
}
