export default function Spinner({ label = 'Loading…', className = '' }) {
  return (
    <div
      className={`flex items-center gap-3 text-sm text-gray-500 ${className}`}
      role="status"
      aria-live="polite"
    >
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-accent" />
      <span>{label}</span>
    </div>
  )
}
