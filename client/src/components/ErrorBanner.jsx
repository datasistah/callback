// Consistent rendering for any non-2xx API response or inline form error.
export default function ErrorBanner({ message, tone = 'error', className = '' }) {
  if (!message) return null

  const tones = {
    error: 'bg-red-50 text-red-700 border-red-200',
    warning: 'bg-amber-50 text-amber-800 border-amber-200',
    info: 'bg-indigo-50 text-indigo-800 border-indigo-200',
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
