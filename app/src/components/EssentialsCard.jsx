import { useState } from 'react'
import { ESSENTIALS } from '../data/essentials'
import { STATE_NAMES } from '../data/meta'
import './EssentialsCard.css'

export function EssentialsCard({ state }) {
  const [open, setOpen] = useState(false)
  const data = ESSENTIALS[state]
  if (!data) return null

  return (
    <aside className="essentials-card" data-open={open}>
      <button
        type="button"
        className="essentials-header"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <div className="essentials-header-text">
          <div className="essentials-eyebrow">Essentials</div>
          <div className="essentials-title">
            {STATE_NAMES[state] || state}
          </div>
        </div>
        <span className="essentials-chev" aria-hidden="true">
          {open ? '\u2212' : '+'}
        </span>
      </button>

      {open && (
        <div className="essentials-body">
          <div className="essentials-section">
            <div className="essentials-label">Nearest ER</div>
            <ul className="essentials-list">
              {data.er.map((hospital, i) => (
                <li key={i}>
                  <span className="essentials-er-name">{hospital.name}</span>
                  {hospital.address && (
                    <span className="essentials-er-address">
                      {' '}
                      &middot; {hospital.address}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {data.coverage && (
            <div className="essentials-section">
              <div className="essentials-label">Cell coverage</div>
              <p className="essentials-note">{data.coverage}</p>
            </div>
          )}

          {data.rental && (
            <div className="essentials-section">
              <div className="essentials-label">Rental breakdown</div>
              <p className="essentials-note">{data.rental}</p>
            </div>
          )}

          <div className="essentials-section essentials-911">
            <div className="essentials-label">Emergency</div>
            <p className="essentials-note">
              Dial <strong>911</strong> for any life-safety emergency.
            </p>
          </div>
        </div>
      )}
    </aside>
  )
}
