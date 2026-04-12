import { useMemo } from 'react'
import { OVERNIGHTS } from '../data/overnight'
import {
  wazeUrl,
  appleMapsUrl,
  openTikTokSearch,
} from '../utils/navLinks'
import './NextUpCard.css'

const PERSON_LABEL = {
  helen: 'Helen', aurelia: 'Aurelia', rafa: 'Rafa', jonathan: 'Jonathan',
}

export function NextUpCard({ stops, day, activePerson, visited, onSkip }) {
  const nextStop = useMemo(() => {
    return stops.find((s) => s.day === day && !visited.includes(s.id))
  }, [stops, day, visited])

  if (!day || day === 'all') return null

  if (!nextStop) {
    const overnight = OVERNIGHTS[day]
    if (!overnight) return null
    return (
      <div className="next-up-card next-up-done">
        <div className="next-up-eyebrow">All done for today</div>
        <h3 className="next-up-name">{overnight.lodging}</h3>
        <div className="next-up-meta">{overnight.address}</div>
        <div className="next-up-actions">
          <NavButton address={overnight.address} activePerson={activePerson} />
        </div>
      </div>
    )
  }

  return (
    <div className="next-up-card">
      <div className="next-up-eyebrow">Next Up</div>
      <h3 className="next-up-name">
        {nextStop.name}
        {activePerson === 'aurelia' && ' ✨'}
      </h3>
      {nextStop.persons && (
        <div className="next-up-tags">
          {nextStop.persons
            .filter((p) => p !== 'everyone')
            .map((p) => (
              <span key={p} className={`tag t-${p}`}>{PERSON_LABEL[p]}</span>
            ))}
        </div>
      )}
      {nextStop.pitch?.[activePerson] && (
        <div className="next-up-pitch">{nextStop.pitch[activePerson]}</div>
      )}
      {nextStop.hours && (
        <div className="next-up-meta">{nextStop.hours}</div>
      )}
      <div className="next-up-actions">
        <NavButton address={nextStop.address} activePerson={activePerson} stop={nextStop} />
        {activePerson === 'aurelia' && (
          <button
            type="button"
            className="next-up-btn"
            onClick={() => openTikTokSearch(nextStop.name)}
          >
            TikTok
          </button>
        )}
        <button type="button" className="next-up-skip" onClick={() => onSkip(nextStop.id)}>
          Skip →
        </button>
      </div>
    </div>
  )
}

function NavButton({ address, activePerson, stop }) {
  if (!address || address === 'N/A') return null
  if (activePerson === 'jonathan' && stop) {
    return (
      <a className="next-up-btn nav-btn" href={wazeUrl(stop)} target="_blank" rel="noopener">
        Waze
      </a>
    )
  }
  return (
    <a className="next-up-btn nav-btn" href={appleMapsUrl(address)} target="_blank" rel="noopener">
      Apple Maps
    </a>
  )
}
