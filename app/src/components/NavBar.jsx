import { useMemo, useState } from 'react'
import { STOPS } from '../data/stops'
import { DAYS_ORDER, DAY_FULL_LABELS } from '../data/meta'
import { getTodayDayKey } from '../utils/tripDay'
import { useVisitedContext } from '../hooks/VisitedContext'
import { QUICK_SEARCHES, quickSearchUrl, personNavUrl } from '../utils/quickSearch'
import './NavBar.css'

// Persistent sticky navigation bar for the Itinerary view.
// Two sections stacked above the three-tab BottomNav:
//   1. Next Stop — the next scheduled destination, with a NAVIGATE button
//      that routes Jonathan to Waze and everyone else to Apple Maps.
//   2. Quick-Search row — 5 "near me" buttons (Gas / Outside / Food /
//      Rest Stop / Emergency).
//
// The "next stop" resolver walks DAYS_ORDER starting from today's trip
// day (or the first upcoming trip day before the trip starts) and picks
// the first unvisited, scheduled stop. No GPS is required — the nav app
// handles routing once the user taps through.

function useNextStop(activePerson, visited) {
  return useMemo(() => {
    const today = getTodayDayKey()
    const startIdx = today
      ? Math.max(0, DAYS_ORDER.indexOf(today))
      : 0

    for (let i = startIdx; i < DAYS_ORDER.length; i += 1) {
      const day = DAYS_ORDER[i]
      // Match scheduled stops on this day, not discover POIs (day:null).
      const dayStops = STOPS.filter(
        (s) =>
          s.day === day &&
          s.category !== 'discover' &&
          !visited.includes(s.id)
      )
      if (dayStops.length) {
        return { stop: dayStops[0], day }
      }
    }
    return { stop: null, day: null }
  }, [activePerson, visited])
}

export function NavBar({ activePerson, visible }) {
  const { visited } = useVisitedContext()
  const { stop, day } = useNextStop(activePerson, visited)
  const [expanded, setExpanded] = useState(false)

  if (!visible) return null
  if (!stop) return null

  const dayLabel = DAY_FULL_LABELS[day] || stop.dayLabel || ''
  const clusterHint = stop.cluster ? stop.cluster.replace(/\s*★.*$/, '') : ''

  return (
    <aside className={`nav-bar ${expanded ? 'expanded' : ''}`} aria-label="Next stop and quick searches">
      <div className="nav-bar-inner">
        <button
          type="button"
          className="next-stop"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={`Next stop: ${stop.name}. Tap for details.`}
        >
          <span className="next-stop-arrow" aria-hidden="true">➤</span>
          <span className="next-stop-text">
            <span className="next-stop-name">{stop.name}</span>
            <span className="next-stop-meta">
              {dayLabel}
              {clusterHint && <> · {clusterHint}</>}
            </span>
          </span>
        </button>
        <a
          className="next-stop-go"
          href={personNavUrl(activePerson, stop)}
          target="_blank"
          rel="noopener"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Navigate to ${stop.name}`}
        >
          NAVIGATE
        </a>
      </div>

      {expanded && (
        <div className="next-stop-detail">
          {stop.address && (
            <div className="next-stop-addr">{stop.address}</div>
          )}
          {stop.hours && (
            <div className="next-stop-hours">{stop.hours}</div>
          )}
          {stop.flag && (
            <div className="next-stop-flag">{stop.flag}</div>
          )}
        </div>
      )}

      <div className="quick-row" role="group" aria-label="Quick searches">
        {QUICK_SEARCHES.map((q) => (
          <a
            key={q.key}
            className={`quick-btn${q.emergency ? ' emergency' : ''}`}
            href={quickSearchUrl(q.key, activePerson)}
            target="_blank"
            rel="noopener"
            aria-label={`Search ${q.label} near me`}
          >
            <span className="quick-icon" aria-hidden="true">{q.icon}</span>
            <span className="quick-label">{q.label}</span>
          </a>
        ))}
      </div>
    </aside>
  )
}
