import { useState } from 'react'
import './PrepCard.css'

// Human-readable labels for each audience key. Per-person media
// sections include the person name; utility sections get plain labels.
const AUDIENCE_LABELS = {
  helen: 'For Helen',
  aurelia: 'For Aurelia',
  rafa: 'For Rafa',
  jonathan: 'For Jonathan',
  pack: 'Pack',
  note: 'Note',
  warning: 'Heads up',
}

const UTILITY_AUDIENCES = new Set(['pack', 'note', 'warning'])

export function PrepCard({ prep, activePerson, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  // Non-persistent tap state per the addendum — survives tab switches
  // within the same session but resets on a hard refresh.
  const [checked, setChecked] = useState({})

  const visibleSections = prep.sections.filter((section) => {
    if (UTILITY_AUDIENCES.has(section.audience)) return true
    if (activePerson === 'jonathan' || activePerson === 'everyone') return true
    return section.audience === activePerson
  })

  if (visibleSections.length === 0) return null

  const toggleItem = (key) =>
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }))

  return (
    <aside className="prep-card" data-open={open}>
      <button
        type="button"
        className="prep-header"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <div className="prep-header-text">
          <div className="prep-eyebrow">{prep.title}</div>
          <div className="prep-forday">{prep.forLabel}</div>
        </div>
        <span className="prep-chev" aria-hidden="true">
          {open ? '\u2212' : '+'}
        </span>
      </button>

      {open && (
        <div className="prep-body">
          {visibleSections.map((section, i) => (
            <div key={i} className={`prep-section prep-audience-${section.audience}`}>
              <div className="prep-audience">
                {AUDIENCE_LABELS[section.audience] || section.audience}
              </div>
              <ul className="prep-items">
                {section.items.map((item, j) => {
                  const key = `${i}-${j}`
                  const isChecked = !!checked[key]
                  return (
                    <li key={j}>
                      <label
                        className={`prep-item ${isChecked ? 'checked' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleItem(key)}
                        />
                        <span className="prep-item-text">{item}</span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </aside>
  )
}
