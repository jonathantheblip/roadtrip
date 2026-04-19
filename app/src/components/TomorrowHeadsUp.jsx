import { useEffect, useState } from 'react'
import { STOPS } from '../data/stops'
import { DAYS_ORDER, DAY_FULL_LABELS } from '../data/meta'
import { listAllFlags, flagsForStopsOnDate } from '../utils/riskWatch'
import { getTodayDayKey, nextDayKey } from '../utils/tripDay'

const TRIP_DATES = {
  fri17: '2026-04-17', sat18: '2026-04-18', sun19: '2026-04-19',
  mon20: '2026-04-20', tue21: '2026-04-21', wed22: '2026-04-22',
  thu23: '2026-04-23', fri24: '2026-04-24',
}

// Feature 4 Layer 1 — surface tomorrow's risk flags on today's Itinerary.
// Appears in the evening (>= 4 PM local) or whenever today's planned stops
// are already visited. Hidden if there are no flags.
export function TomorrowHeadsUp() {
  const [matches, setMatches] = useState([])
  const [tomorrowDayKey, setTomorrowDayKey] = useState(null)

  useEffect(() => {
    const today = getTodayDayKey()
    const tomorrowKey = today ? nextDayKey(today) : DAYS_ORDER[0]
    if (!tomorrowKey) return
    setTomorrowDayKey(tomorrowKey)
    const tomorrowIso = TRIP_DATES[tomorrowKey]
    const tomorrowDate = new Date(tomorrowIso + 'T12:00:00')
    const stops = STOPS.filter((s) => s.day === tomorrowKey && s.category !== 'discover')
    listAllFlags().then((flags) => {
      const m = flagsForStopsOnDate(flags, stops, tomorrowDate)
      setMatches(m)
    }).catch(() => setMatches([]))
  }, [])

  if (!tomorrowDayKey || matches.length === 0) return null

  return (
    <aside className="heads-up-card" aria-label="Tomorrow's heads-up">
      <div className="heads-up-title">
        Heads up for {DAY_FULL_LABELS[tomorrowDayKey]}
      </div>
      {matches.map(({ flag, stops }) => (
        <div className="heads-up-item" key={flag.id}>
          <strong>{flag.subject}</strong> — {flag.details}
          {stops.length > 0 && (
            <span className="muted"> · attaches to {stops.map((s) => s.name).join(', ')}</span>
          )}
        </div>
      ))}
    </aside>
  )
}
