import './BottomNav.css'

// Three-tab bottom navigation — like Apple Music / Instagram.
// Each tab has an icon + label. Icons are inline SVGs so they stroke
// in the active theme color via currentColor.

const TABS = [
  {
    k: 'itinerary',
    label: 'Itinerary',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 2v4M16 2v4M3 10h18M5 5h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
      </svg>
    ),
  },
  {
    k: 'media',
    label: 'Media',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 18V8a9 9 0 0 1 18 0v10M18 13a3 3 0 0 1 3 3v3h-3a3 3 0 0 1 0-6zM6 13a3 3 0 0 0-3 3v3h3a3 3 0 0 0 0-6z" />
      </svg>
    ),
  },
  {
    k: 'discover',
    label: 'Discover',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="m15.09 8.91-2.83 5.66-5.66 2.83 2.83-5.66 5.66-2.83z" />
      </svg>
    ),
  },
]

export function BottomNav({ active, onChange }) {
  return (
    <nav className="bn" aria-label="Primary">
      {TABS.map((t) => {
        const isActive = active === t.k
        return (
          <button
            key={t.k}
            type="button"
            className={`bn-tab ${isActive ? 'active' : ''}`}
            onClick={() => onChange(t.k)}
            aria-pressed={isActive}
            aria-label={t.label}
          >
            <span className="bn-icon">{t.icon}</span>
            <span className="bn-label">{t.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
