// Minimal, consistent line icons for the landing page — stroke-based, inherit
// currentColor, 24x24. Replaces the ad-hoc emoji/glyph set with a professional,
// uniform icon language.
const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

export function VaultIcon(props) {
  return (
    <svg {...base} {...props} aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 4v1.5M12 18.5V20M15.2 12H17M7 12H8.8" />
    </svg>
  )
}

export function TailorIcon(props) {
  return (
    <svg {...base} {...props} aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

export function TargetIcon(props) {
  return (
    <svg {...base} {...props} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function MicIcon(props) {
  return (
    <svg {...base} {...props} aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0" />
      <path d="M12 17v3M9 20h6" />
    </svg>
  )
}

export function BoardIcon(props) {
  return (
    <svg {...base} {...props} aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M9 5v14M15 5v14" />
    </svg>
  )
}

export function BoltIcon(props) {
  return (
    <svg {...base} {...props} aria-hidden="true">
      <path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13l0-8Z" />
    </svg>
  )
}
