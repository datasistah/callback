export default function Spinner({ label = 'Loading…', className = '' }) {
  return (
    <div
      className={`flex items-center gap-3 text-sm text-muted ${className}`}
      role="status"
      aria-live="polite"
    >
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-border border-t-accent" />
      <span>{label}</span>
    </div>
  )
}
