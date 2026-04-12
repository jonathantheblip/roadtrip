import {
  wazeUrl,
  appleMapsUrl,
  openTikTokSearch,
} from '../utils/navLinks'
import { useVisitedContext } from '../hooks/VisitedContext'
import { ShareButton } from './ShareButton'
import './StopCard.css'

const PERSON_LABEL = {
  helen: 'Helen',
  aurelia: 'Aurelia',
  rafa: 'Rafa',
  jonathan: 'Jonathan',
  everyone: 'Everyone',
}

const TYPE_LABEL = {
  food: 'Food',
  energy: 'Energy',
  photo: 'Photo',
  poi: 'POI',
  gas: "Buc-ee's",
  viral: 'Viral',
}

export function StopCard({ stop, activePerson, onDismiss }) {
  const { isVisited, toggle } = useVisitedContext()
  const isBucees = stop.name.toLowerCase().includes('buc-ee')
  const isPlanned = stop.category !== 'discover'
  const isDiscover = stop.category === 'discover'
  const checked = isVisited(stop.id)
  const classes = ['card']
  if (stop.star) classes.push('star')
  if (isBucees) classes.push('bucees')
  if (checked) classes.push('visited')

  return (
    <article className={classes.join(' ')}>
      {isPlanned && (
        <button
          type="button"
          className={`visited-check ${checked ? 'checked' : ''}`}
          onClick={() => toggle(stop.id)}
          aria-label={checked ? 'Mark unvisited' : 'Mark visited'}
        >
          {checked && <span className="check-icon">✓</span>}
        </button>
      )}
      {isDiscover && onDismiss && (
        <button
          type="button"
          className="dismiss-btn"
          onClick={() => onDismiss(stop.id)}
          aria-label="Not interested"
        >
          ✕
        </button>
      )}
      <header className="card-name">
        {stop.name}
        {stop.star && <span className="star-badge">Top Pick</span>}
      </header>

      {stop.flag && <div className="card-flag">{stop.flag}</div>}

      <div className="tags">
        {stop.persons
          .filter((p) => p !== 'everyone')
          .map((p) => (
            <span key={p} className={`tag t-${p}`}>
              {PERSON_LABEL[p]}
            </span>
          ))}
        {stop.persons.includes('everyone') && (
          <span className="tag t-everyone">Everyone</span>
        )}
        {stop.types.map((t) => (
          <span key={t} className={`tag t-${t}`}>
            {TYPE_LABEL[t]}
          </span>
        ))}
      </div>

      <Pitches stop={stop} activePerson={activePerson} />

      <StopFacts stop={stop} />

      {stop.details && <div className="card-meta">{stop.details}</div>}

      {stop.vegNotes &&
        stop.vegNotes !== 'N/A' &&
        (activePerson === 'helen' || activePerson === 'everyone') && (
          <div className="card-meta veg-notes">
            <strong>Vegetarian:</strong> {stop.vegNotes}
          </div>
        )}

      {stop.bring && (
        <div className="card-bring">
          <span className="bring-label">Bring</span>
          <span className="bring-text">{stop.bring}</span>
        </div>
      )}

      <NavActions stop={stop} activePerson={activePerson} />

      <div className="card-extras">
        {stop.menuUrl && (
          <a
            className="extra-btn extra-menu"
            href={stop.menuUrl}
            target="_blank"
            rel="noopener"
          >
            Menu
          </a>
        )}
        {stop.photosUrl && (
          <a
            className="extra-btn extra-photos"
            href={stop.photosUrl}
            target="_blank"
            rel="noopener"
          >
            Photos
          </a>
        )}
        <ShareButton stop={stop} activePerson={activePerson} />
      </div>
    </article>
  )
}

function Pitches({ stop, activePerson }) {
  const p = activePerson
  const pitches = []

  if (p === 'everyone') {
    for (const k of ['helen', 'aurelia', 'rafa', 'jonathan']) {
      if (stop.pitch?.[k]) {
        pitches.push(
          <p key={k} className="pitch">
            <span className={`pitch-label pl-${k}`}>{PERSON_LABEL[k]}</span>{' '}
            {stop.pitch[k]}
          </p>
        )
      }
    }
  } else {
    if (stop.pitch?.[p]) {
      pitches.push(
        <p key="primary" className="pitch">
          {stop.pitch[p]}
        </p>
      )
    }
    // Fold in one adjacent person's pitch at reduced weight so the
    // card doesn't feel single-noted.
    for (const k of ['helen', 'aurelia', 'rafa', 'jonathan']) {
      if (k !== p && stop.pitch?.[k]) {
        pitches.push(
          <p key="secondary" className="pitch pitch-secondary">
            <span className={`pitch-label pl-${k}`}>{PERSON_LABEL[k]}</span>{' '}
            {stop.pitch[k]}
          </p>
        )
        break
      }
    }
  }

  return pitches
}

function StopFacts({ stop }) {
  const rows = []
  if (stop.address && stop.address !== 'N/A')
    rows.push(['Address', <span>{stop.address}</span>])
  if (stop.hours && stop.hours !== 'N/A')
    rows.push(['Hours', <span>{stop.hours}</span>])
  if (stop.cost && stop.cost !== 'N/A')
    rows.push(['Cost', <span>{stop.cost}</span>])
  if (stop.phone)
    rows.push([
      'Phone',
      <a href={`tel:${stop.phone.replace(/[^\d+]/g, '')}`}>{stop.phone}</a>,
    ])
  if (rows.length === 0) return null
  return (
    <dl className="card-facts">
      {rows.map(([k, v]) => (
        <div className="card-fact-row" key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

// Nav button rules (per ROADTRIP_VERIFIED_STOP_DATA.md):
//   Jonathan → Waze only
//   Helen / Aurelia / Rafa → Apple Maps only
//   Everyone (shared view) → both
// Aurelia also gets the TikTok search button alongside Apple Maps.
function NavActions({ stop, activePerson }) {
  if (!stop.address || stop.address === 'N/A') return null
  const showWaze = activePerson === 'jonathan' || activePerson === 'everyone'
  const showApple = activePerson !== 'jonathan'
  const showTikTok = activePerson === 'aurelia'

  return (
    <div className="card-actions">
      {showTikTok && (
        <button
          type="button"
          className="action-btn tiktok"
          onClick={() => openTikTokSearch(stop.name)}
        >
          TikTok
        </button>
      )}
      {showWaze && (
        <a
          className="action-btn waze"
          href={wazeUrl(stop)}
          target="_blank"
          rel="noopener"
        >
          Waze
        </a>
      )}
      {showApple && (
        <a
          className="action-btn apple"
          href={appleMapsUrl(stop.address)}
          target="_blank"
          rel="noopener"
        >
          Apple Maps
        </a>
      )}
    </div>
  )
}

