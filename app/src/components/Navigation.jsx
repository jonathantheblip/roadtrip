import './Navigation.css'

const TABS = [
  { k: 'itinerary', l: 'Itinerary' },
  { k: 'media', l: 'Media' },
  { k: 'discover', l: 'Discover' },
]

export function Navigation({ active, onChange }) {
  return (
    <nav className="tab-bar" aria-label="Primary">
      {TABS.map((t) => (
        <button
          key={t.k}
          type="button"
          className={`tab-btn ${active === t.k ? 'active' : ''}`}
          onClick={() => onChange(t.k)}
          aria-pressed={active === t.k}
        >
          {t.l}
        </button>
      ))}
    </nav>
  )
}
