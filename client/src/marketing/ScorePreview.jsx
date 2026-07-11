import { useEffect, useState } from 'react'
import { useInView } from './Reveal.jsx'

// A live-looking preview of the app's fit-score card: a circular gauge that
// sweeps and counts up to the target when scrolled into view, with matched /
// missing keyword chips. Pure SVG + CSS — no images, no data.
const TARGET = 87
const MATCHED = ['PyTorch', 'recommendation systems', 'A/B testing', 'model evaluation', 'AWS']
const MISSING = ['feature store', 'Ray']

const R = 52
const C = 2 * Math.PI * R

export default function ScorePreview() {
  const [ref, inView] = useInView({ threshold: 0.4 })
  const [value, setValue] = useState(0)

  // Count the number up when it enters view (the ring sweep is CSS-driven).
  useEffect(() => {
    if (!inView) return
    let raf
    const start = performance.now()
    const dur = 1300
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(Math.round(eased * TARGET))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [inView])

  const offset = inView ? C * (1 - TARGET / 100) : C

  return (
    <div
      ref={ref}
      className="rounded-2xl border border-border bg-surface/80 p-6 shadow-2xl shadow-black/40 backdrop-blur"
    >
      <div className="mb-4 flex items-center gap-2 text-xs font-medium text-muted">
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
        Fit score · Senior ML Engineer
      </div>

      <div className="flex items-center gap-6">
        <div className="relative h-32 w-32 shrink-0">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
            <circle cx="60" cy="60" r={R} fill="none" stroke="#26324a" strokeWidth="10" />
            <circle
              cx="60"
              cy="60"
              r={R}
              fill="none"
              stroke="url(#cb-grad)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={offset}
              className="cb-ring"
            />
            <defs>
              <linearGradient id="cb-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="100%" stopColor="#34d399" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-ink">{value}</span>
            <span className="text-[10px] uppercase tracking-wide text-muted">match</span>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-300">
            Matched
          </p>
          <div className="flex flex-wrap gap-1.5">
            {MATCHED.map((k) => (
              <span key={k} className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">
                {k}
              </span>
            ))}
          </div>
          <p className="mb-1.5 mt-3 text-xs font-semibold uppercase tracking-wide text-red-300">
            Missing
          </p>
          <div className="flex flex-wrap gap-1.5">
            {MISSING.map((k) => (
              <span key={k} className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-300">
                {k}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
