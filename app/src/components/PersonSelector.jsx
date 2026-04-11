import { THEMES, THEME_ORDER } from '../data/themes'
import './PersonSelector.css'

export function PersonSelector({ active, onChange }) {
  return (
    <nav className="person-bar" aria-label="Select viewer">
      {THEME_ORDER.map((key) => {
        const theme = THEMES[key]
        const label =
          theme.allowsEmoji && theme.emoji
            ? `${theme.emoji} ${theme.name}`
            : theme.name
        const isActive = active === key
        return (
          <button
            key={key}
            type="button"
            className={`person-btn ${isActive ? 'active' : ''}`}
            onClick={() => onChange(key)}
            aria-pressed={isActive}
          >
            {label}
          </button>
        )
      })}
    </nav>
  )
}
