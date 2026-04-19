import { useEffect, useMemo, useState } from 'react'
import { DAYS_ORDER } from '../data/meta'
import { OVERNIGHTS } from '../data/overnight'
import {
  TRIP_DATES, DAY_TZ, DAY_TZ_CROSSOVER, DEST_CITY, DOW_SHORT, DOW_LONG,
} from '../data/tripCalendar'
import {
  milesAtEndOfDay, percentOfTrip, TOTAL_MILES, fmtMiles,
} from '../data/mileage'
import { prevDayKey } from '../utils/tripDay'
import './DayOrientationBanner.css'

// Feature 5 — Day Orientation Banner.
// Persistent banner above tab content. Four glanceable elements:
//   Day+date · TZ (crossover arrow if changed today) · → destination · Day N/8
//
// Day boundary rolls at 3 AM local time, not midnight — late arrivals like
// Sat→Sun 12:25 AM should still read as "Saturday" until morning.

function todayDayKey(now = new Date()) {
  // 3 AM boundary: if hour < 3, treat as yesterday for trip-day purposes.
  const adjusted = new Date(now.getTime())
  if (adjusted.getHours() < 3) adjusted.setDate(adjusted.getDate() - 1)
  const y = adjusted.getFullYear()
  const m = adjusted.getMonth()
  const d = adjusted.getDate()
  for (const [key, date] of Object.entries(TRIP_DATES)) {
    if (y === date.getFullYear() && m === date.getMonth() && d === date.getDate()) {
      return key
    }
  }
  return null
}

function truncCity(city, max = 14) {
  return city.length > max ? city.slice(0, max - 1) + '…' : city
}

function dayIdx(key) {
  const i = DAYS_ORDER.indexOf(key)
  return i >= 0 ? i + 1 : null
}

function useNowTicker(intervalMs = 60 * 1000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

export function DayOrientationBanner({ onTap }) {
  const now = useNowTicker()

  const dayKey = todayDayKey(now)

  // Arrived state — flip once the current local time is past tonight's
  // check-in time. Reads directly from OVERNIGHTS[dayKey].checkIn rather
  // than tracking a separate state machine.
  const arrived = useMemo(() => {
    if (!dayKey) return false
    const checkInStr = OVERNIGHTS[dayKey]?.checkIn || ''
    const m = checkInStr.match(/(\d{1,2}):(\d{2})\s*(PM|AM)/i)
    if (!m) return false
    let hh = parseInt(m[1], 10) % 12
    if (/pm/i.test(m[3])) hh += 12
    const mm = parseInt(m[2], 10)
    const cutoff = new Date(TRIP_DATES[dayKey].getTime())
    cutoff.setHours(hh, mm, 0, 0)
    return now >= cutoff
  }, [dayKey, now])

  const state = useMemo(() => {
    if (!dayKey) return null
    const date = TRIP_DATES[dayKey]
    // Short day name for the compact row; full name used for aria-label
    // so screen readers still hear "Sunday" rather than "Sun".
    const dow = DOW_SHORT[date.getDay()]
    const dowLong = DOW_LONG[date.getDay()]
    const month = date.toLocaleDateString('en-US', { month: 'short' })
    const day = date.getDate()
    const city = DEST_CITY[dayKey] || '—'
    const tzCross = DAY_TZ_CROSSOVER[dayKey]
    const tz = tzCross || DAY_TZ[dayKey]
    // Point-in-time progress: until we've checked into tonight's lodging,
    // show yesterday's cumulative miles (the real "so far"). Once arrived,
    // bump to today's end-of-day total. First day: pre-arrival reads 0.
    const prevKey = prevDayKey(dayKey)
    const priorMiles = prevKey ? milesAtEndOfDay(prevKey) : 0
    const miles = arrived ? milesAtEndOfDay(dayKey) : priorMiles
    const pct = TOTAL_MILES ? Math.round((miles / TOTAL_MILES) * 100) : 0
    return {
      dow, dowLong, month, day, city, tz, tzCross: !!tzCross, miles, pct, dayKey,
    }
  }, [dayKey, arrived])

  if (!state) return null

  return (
    <button
      type="button"
      className={`dob ${arrived ? 'dob-arrived' : ''} ${state.tzCross ? 'dob-tz-cross' : ''}`}
      onClick={() => onTap?.(state.dayKey)}
      aria-label={
        `${state.dowLong} ${state.month} ${state.day}, ${state.tz}, heading to ${state.city}, ` +
        `${state.miles} of ${TOTAL_MILES} miles, ${state.pct} percent`
      }
    >
      <span className="dob-date">
        <strong>{state.dow}</strong> · {state.month} {state.day}
      </span>
      <span className="dob-tz" title={state.tzCross ? 'Time zone crossover day' : ''}>
        {state.tz}
      </span>
      <span className="dob-dest">
        → {truncCity(state.city)}
        {arrived && <span className="dob-arrived-tag"> · arrived</span>}
      </span>
      <span className="dob-progress" title={`${fmtMiles(state.miles)} of ${fmtMiles(TOTAL_MILES)}`}>
        <strong>{fmtMiles(state.miles)}</strong> · {state.pct}%
      </span>
    </button>
  )
}
