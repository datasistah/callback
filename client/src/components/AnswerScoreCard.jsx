// Renders the grade for one interview answer: the 0–100 overall, the four STAR
// components (each 0–25) as labelled meters, a relevance meter, and coaching
// feedback. Mirrors ScoreCard's visual language (score tone + accent meters).
function scoreTone(value) {
  if (value >= 75) return 'text-emerald-400'
  if (value >= 50) return 'text-amber-400'
  return 'text-red-400'
}

// STAR components are scored 0–25; render each as a proportion of that.
const STAR_LABELS = {
  situation: 'Situation',
  task: 'Task',
  action: 'Action',
  result: 'Result',
}

function StarMeter({ label, value }) {
  const pct = Math.round((Math.max(0, Math.min(25, value)) / 25) * 100)
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-muted">
        <span>{label}</span>
        <span>{value}/25</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-bg">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function AnswerScoreCard({ grade }) {
  if (!grade) return null
  const star = grade.star || {}

  return (
    <div
      data-testid="answer-score-card"
      className="mt-4 rounded-lg border border-border bg-surface p-5 shadow-sm"
    >
      <div className="flex items-center gap-5">
        <div className="text-center">
          <div
            data-testid="answer-score-value"
            className={`text-4xl font-bold ${scoreTone(grade.overall)}`}
          >
            {grade.overall}
          </div>
          <div className="mt-0.5 text-xs uppercase tracking-wide text-muted">answer</div>
        </div>
        <div className="flex-1">
          <div className="mb-1 flex items-center justify-between text-xs text-muted">
            <span>Relevance to the question</span>
            <span>{grade.relevance}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-bg">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${Math.max(0, Math.min(100, grade.relevance))}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted">
            {grade.grade_mode === 'llm' ? 'AI-graded' : 'Rubric-graded (no AI key)'}
          </p>
        </div>
      </div>

      <div className="mt-5">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          STAR structure
        </h4>
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.keys(STAR_LABELS).map((k) => (
            <StarMeter key={k} label={STAR_LABELS[k]} value={star[k] ?? 0} />
          ))}
        </div>
      </div>

      {grade.feedback && (
        <p className="mt-4 rounded-md bg-bg/60 px-3 py-2 text-sm leading-relaxed text-ink">
          {grade.feedback}
        </p>
      )}
    </div>
  )
}
