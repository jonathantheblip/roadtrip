// Cumulative trip mileage by end-of-day.
// Haversine distance between consecutive overnights × 1.25 road-winding
// factor (same multiplier driveTime.js uses for leg estimates). Precomputed
// once at module load because these numbers never change during the trip.

import { LOCATIONS } from '../utils/driveTime'
import { DAYS_ORDER } from './meta'

// The primary driving chain. Stationary days (tue21/wed22 at Aunt Donna's)
// add zero miles; fri24 is a flight home so road miles stop at Houston.
const CHAIN = [
  { day: null,    at: 'belmont' },       // trip start
  { day: 'fri17', at: 'postcard' },      // Catskills overnight
  { day: 'sat18', at: 'elizabethton' },  // Elizabethton overnight
  { day: 'sun19', at: 'meridian' },      // Meridian overnight
  { day: 'mon20', at: 'arlington' },     // Arlington first night
  // tue21, wed22: stationary — mileage frozen
  { day: 'thu23', at: 'houston' },       // Houston overnight
  // fri24: flight home — no additional road miles
]

const WINDING = 1.25

function haversineMiles(a, b) {
  if (!a || !b) return 0
  const R = 3958.8
  const toRad = (x) => (x * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const la1 = toRad(a.lat)
  const la2 = toRad(b.lat)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}

// Build a { dayKey → cumulative miles by end of that day } map, inclusive
// of that day's drive.
function buildMilesByDayEnd() {
  const map = {}
  let cum = 0
  for (let i = 1; i < CHAIN.length; i += 1) {
    const from = LOCATIONS[CHAIN[i - 1].at]
    const to = LOCATIONS[CHAIN[i].at]
    const leg = Math.round(haversineMiles(from, to) * WINDING)
    cum += leg
    map[CHAIN[i].day] = cum
  }
  // Fill stationary + post-drive days with the prior cumulative total so
  // the banner never shows a drop-back on days with no driving.
  let last = 0
  for (const dayKey of DAYS_ORDER) {
    if (map[dayKey] != null) {
      last = map[dayKey]
    } else {
      map[dayKey] = last
    }
  }
  return map
}

export const MILES_BY_DAY_END = buildMilesByDayEnd()

export const TOTAL_MILES = MILES_BY_DAY_END[CHAIN[CHAIN.length - 1].day] || 0

export function milesAtEndOfDay(dayKey) {
  return MILES_BY_DAY_END[dayKey] ?? 0
}

export function percentOfTrip(dayKey) {
  if (!TOTAL_MILES) return 0
  return Math.round((milesAtEndOfDay(dayKey) / TOTAL_MILES) * 100)
}

// Thin-space formatted mileage e.g. "1,530 mi"
export function fmtMiles(n) {
  return `${Math.round(n).toLocaleString('en-US')} mi`
}
