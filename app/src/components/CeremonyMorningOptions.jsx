import { useState } from 'react'
import { CEREMONY_OPTIONS } from '../data/ceremonyOptions'
import { PERSON_COLORS } from '../data/themes'
import './CeremonyMorningOptions.css'

// Ceremony-morning decision aid for Sunday Apr 19. Hidden from Jonathan's
// view per CHANGE_ORDER_2026-04-18_SUNDAY_MORNING acceptance criterion 2.
// No default. No "recommended" badge. No Jonathan avatars on any option.

const PERSON_LABEL = {
  helen: 'Helen',
  aurelia: 'Aurelia',
  rafa: 'Rafa',
}

export function CeremonyMorningOptions({ activePerson }) {
  if (activePerson === 'jonathan') return null

  return (
    <section className="cmo" aria-label="Morning options while Jonathan is away">
      <header className="cmo-header">
        <span className="cmo-eyebrow">Sunday morning</span>
        <h3>Options while Jonathan is at the ceremony</h3>
        <p className="cmo-sub">
          Decide in the moment. No default.
        </p>
      </header>

      <ul className="cmo-list">
        {CEREMONY_OPTIONS.map((opt) => (
          <OptionRow key={opt.id} opt={opt} activePerson={activePerson} />
        ))}
      </ul>

      <footer className="cmo-footer">Pick in the moment. Not locked.</footer>
    </section>
  )
}

function OptionRow({ opt, activePerson }) {
  const [open, setOpen] = useState(false)
  const servesActive = opt.serves.includes(activePerson)
  // Option E (stay at cabin) is intentionally de-emphasized in Rafa's view
  // per the spec — serves him but isn't a preference driver.
  const deemphasized = activePerson === 'rafa' && opt.id === 'E'
  const classes = ['cmo-item']
  if (servesActive && !deemphasized) classes.push('cmo-item-emph')
  if (deemphasized) classes.push('cmo-item-dim')
  if (open) classes.push('cmo-item-open')

  return (
    <li className={classes.join(' ')}>
      <button
        type="button"
        className="cmo-summary"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="cmo-title-row">
          <span className="cmo-id">{opt.id}</span>
          <span className="cmo-title">{opt.title}</span>
          <span className="cmo-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
        </div>
        <div className="cmo-meta-row">
          <span className="cmo-drive">Drive {opt.driveFromCabin}</span>
          <span className="cmo-sep" aria-hidden="true">·</span>
          <span className="cmo-time">{opt.timeEstimate}</span>
        </div>
        <div className="cmo-serves">
          {opt.serves.map((p) => (
            <span
              key={p}
              className={`cmo-avatar cmo-avatar-${p}`}
              style={{ background: PERSON_COLORS[p] }}
              title={PERSON_LABEL[p]}
            >
              {PERSON_LABEL[p][0]}
            </span>
          ))}
          <span className="cmo-serves-names">
            {opt.serves.map((p) => PERSON_LABEL[p]).join(' · ')}
          </span>
        </div>
        {opt.gotcha && (
          <div className="cmo-gotcha">⚠ {opt.gotcha}</div>
        )}
      </button>

      {open && (
        <div className="cmo-detail">
          {opt.detail.split('\n').map((line, i) =>
            line.trim() ? (
              <p key={i} dangerouslySetInnerHTML={{ __html: bold(line) }} />
            ) : null
          )}
        </div>
      )}
    </li>
  )
}

// Only markdown we need: **bold**. Keep the renderer tiny.
function bold(s) {
  return s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
}
