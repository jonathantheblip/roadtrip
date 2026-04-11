import {
  wazeUrl,
  appleMapsUrl,
  googleMapsUrl,
  openTikTokSearch,
} from '../utils/navLinks'
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
  gas: 'Gas',
  viral: 'Viral',
}

export function StopCard({ stop, activePerson }) {
  const isBucees = stop.name.toLowerCase().includes('buc-ee')
  const classes = ['card']
  if (stop.star) classes.push('star')
  if (isBucees) classes.push('bucees')

  return (
    <article className={classes.join(' ')}>
      <header className="card-name">
        {stop.name}
        {stop.star && <span className="star-badge">Top Pick</span>}
      </header>

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

      {stop.details && <div className="card-meta">{stop.details}</div>}

      {stop.vegNotes &&
        stop.vegNotes !== 'N/A' &&
        (activePerson === 'helen' || activePerson === 'everyone') && (
          <div className="card-meta veg-notes">
            <strong>Vegetarian:</strong> {stop.vegNotes}
          </div>
        )}

      <NavActions stop={stop} activePerson={activePerson} />
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

function NavActions({ stop, activePerson }) {
  if (!stop.address || stop.address === 'N/A') return null
  const actions = []

  if (activePerson === 'jonathan') {
    actions.push(
      <a
        key="waze"
        className="action-btn waze"
        href={wazeUrl(stop)}
        target="_blank"
        rel="noopener"
      >
        Waze
      </a>
    )
  } else if (activePerson === 'helen') {
    actions.push(
      <a
        key="apple"
        className="action-btn apple"
        href={appleMapsUrl(stop.address)}
        target="_blank"
        rel="noopener"
      >
        Apple Maps
      </a>
    )
  } else if (activePerson === 'aurelia') {
    actions.push(
      <button
        key="tiktok"
        type="button"
        className="action-btn tiktok"
        onClick={() => openTikTokSearch(stop.name)}
      >
        TikTok
      </button>
    )
    actions.push(
      <a
        key="apple"
        className="action-btn apple"
        href={appleMapsUrl(stop.address)}
        target="_blank"
        rel="noopener"
      >
        Maps
      </a>
    )
  } else if (activePerson === 'rafa') {
    actions.push(
      <a
        key="apple"
        className="action-btn apple"
        href={appleMapsUrl(stop.address)}
        target="_blank"
        rel="noopener"
      >
        Maps
      </a>
    )
  } else {
    actions.push(
      <a
        key="google"
        className="action-btn google"
        href={googleMapsUrl(stop.address)}
        target="_blank"
        rel="noopener"
      >
        Maps
      </a>
    )
  }

  return <div className="card-actions">{actions}</div>
}
