import { useEffect, useMemo, useState } from 'react'
import { DAYS_ORDER, DAY_FULL_LABELS } from '../data/meta'
import { OVERNIGHTS } from '../data/overnight'
import './DayOrientationBanner.css'

// Feature 5 — Day Orientation Banner.
// Persistent banner above tab content. Four glanceable elements:
//   Day+date · TZ (crossover arrow if changed today) · → destination · Day N/8
//
// Day boundary rolls at 3 AM local time, not midnight — late arrivals like
// Sat→Sun 12:25 AM should still read as "Saturday" until morning.

// Trip dates are authoritative in ET for this trip. We compute "trip day"
// from a local clock but offset the boundary to 3 AM so late arrivals read
// as the previous day until daybreak.
const TRIP_DATES = {
  fri17: new Date(2026, 3, 17),
  sat18: new Date(2026, 3, 18),
  sun19: new Date(2026, 3, 19),
  mon20: new Date(2026, 3, 20),
  tue21: new Date(2026, 3, 21),
  wed22: new Date(2026, 3, 22),
  thu23: new Date(2026, 3, 23),
  fri24: new Date(2026, 3, 24),
}

// Destination city names for each overnight. Short, not the hotel name.
const DEST_CITY = {
  fri17: 'Catskill, NY',
  sat18: 'Elizabethton, TN',
  sun19: 'Meridian, MS',
  mon20: 'Arlington, TX',
  tue21: 'Arlington, TX',
  wed22: 'Arlington, TX',
  thu23: 'Houston, TX',
  fri24: 'Home (Boston)',
}

// Day time-zone. Crossovers occur sun19 (ET→CT mid-drive) and fri24
// (CT→ET via flight). Others are stable. The banner highlights the
// crossover with an arrow when we're on that day.
const DAY_TZ = {
  fri17: 'ET', sat18: 'ET', sun19: 'CT', mon20: 'CT',
  tue21: 'CT', wed22: 'CT', thu23: 'CT', fri24: 'ET',
}
const DAY_TZ_CROSSOVER = {
  sun19: 'ET → CT',
  fri24: 'CT → ET',
}

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
  const [arrived, setArrived] = useState(false)

  const dayKey = todayDayKey(now)

  const state = useMemo(() => {
    if (!dayKey) return null
    const dowNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const date = TRIP_DATES[dayKey]
    const dow = dowNames[date.getDay()]
    const month = date.toLocaleDateString('en-US', { month: 'short' })
    const day = date.getDate()
    const city = DEST_CITY[dayKey] || '—'
    const tzCross = DAY_TZ_CROSSOVER[dayKey]
    const tz = tzCross || DAY_TZ[dayKey]
    const idx = dayIdx(dayKey)
    return {
      dow, month, day, city, tz, tzCross: !!tzCross, idx, dayKey,
    }
  }, [dayKey])

  if (!state) return null

  return (
    <button
      type="button"
      className={`dob ${arrived ? 'dob-arrived' : ''} ${state.tzCross ? 'dob-tz-cross' : ''}`}
      onClick={() => onTap?.(state.dayKey)}
      aria-label={`${state.dow} ${state.month} ${state.day}, ${state.tz}, heading to ${state.city}, day ${state.idx} of 8`}
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
      <span className="dob-idx">Day {state.idx}/8</span>
    </button>
  )
}
