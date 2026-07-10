// Renders the 0–100 match score plus the factor breakdown:
// matched keywords, missing keywords, skills coverage.
function scoreTone(value) {
  if (value >= 80) return 'text-emerald-400'
  if (value >= 55) return 'text-amber-400'
  return 'text-red-400'
}

function Chips({ items, tone }) {
  if (!items || items.length === 0) {
    return <p className="text-xs text-muted">None</p>
  }
  const toneClass =
    tone === 'matched'
      ? 'bg-emerald-500/15 text-emerald-300'
      : 'bg-red-500/15 text-red-300'
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((kw) => (
        <span
          key={kw}
          className={`rounded-full px-2.5 py-0.5 text-xs ${toneClass}`}
        >
          {kw}
        </span>
      ))}
    </div>
  )
}

export default function ScoreCard({ score }) {
  if (!score) return null
  const coveragePct = Math.round((score.skills_coverage ?? 0) * 100)

  return (
    <div
      data-testid="score-card"
      className="rounded-lg border border-border bg-surface p-6 shadow-sm"
    >
      <div className="flex items-center gap-6">
        <div className="text-center">
          <div
            data-testid="score-value"
            className={`text-5xl font-bold ${scoreTone(score.value)}`}
          >
            {score.value}
          </div>
          <div className="mt-1 text-xs uppercase tracking-wide text-muted">
            match
          </div>
        </div>
        <div className="flex-1">
          <div className="mb-1 flex items-center justify-between text-xs text-muted">
            <span>Skills coverage</span>
            <span>{coveragePct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-bg">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${coveragePct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Matched keywords
          </h4>
          <Chips items={score.matched_keywords} tone="matched" />
        </div>
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Missing keywords
          </h4>
          <Chips items={score.missing_keywords} tone="missing" />
        </div>
      </div>
    </div>
  )
}
