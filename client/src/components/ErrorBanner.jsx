// Consistent rendering for any non-2xx API response or inline form error.
export default function ErrorBanner({ message, tone = 'error', className = '' }) {
  if (!message) return null

  const tones = {
    error: 'bg-red-500/10 text-red-300 border-red-500/30',
    warning: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    info: 'bg-accent/10 text-accent-hover border-accent/30',
  }

  return (
    <div
      role="alert"
      data-testid="error-banner"
      className={`rounded-md border px-4 py-3 text-sm ${tones[tone]} ${className}`}
    >
      {message}
    </div>
  )
}
