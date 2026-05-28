// create_trip card → trip record mapping. Pure JS (no React / I/O) so
// the slug + shape logic is unit-testable and reused by both the card
// renderer (preview) and the save handler (commit).
//
// The worker emits a `create_trip` card whose `trip` block uses
// display-facing shapes (traveler NAMES, category enums, dayNumber).
// This module maps that to the canonical trip record the themed views
// + TripEditor already read (traveler IDS, lowercase kind, n/isoDate/
// date). Skipped stops (flagged by the renderer) are dropped here.

import { TRAVELER_ORDER } from '../data/travelers.js'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// "Helen" → "helen", dropping anything not a known traveler.
export function travelerNameToId(name) {
  if (typeof name !== 'string') return null
  const lower = name.trim().toLowerCase()
  return TRAVELER_ORDER.includes(lower) ? lower : null
}

// Map a list of traveler names to ids. Empty / all-unknown input falls
// back to the full family — a stop or trip with no valid travelers
// defaults to "everyone" rather than nobody.
export function travelerIdsFrom(names) {
  if (!Array.isArray(names)) return [...TRAVELER_ORDER]
  const ids = names.map(travelerNameToId).filter(Boolean)
  return ids.length ? ids : [...TRAVELER_ORDER]
}

// Stable, readable trip id from title + start date.
// "Asheville Long Weekend" + "2026-10-09" → "asheville-long-weekend-2026-10"
// Matches the hand-authored seed-id convention (jackson-2026,
// nyc-rafa-2026) rather than the uuid `trip_…` form, so create-via-Claude
// trips read cleanly in D1 and logs. Deterministic, so a refinement that
// keeps the same title + month re-saves to the same row (idempotent).
export function tripIdFromTitle(title, dateRangeStart) {
  const base = (title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  const ym =
    typeof dateRangeStart === 'string' && /^\d{4}-\d{2}/.test(dateRangeStart)
      ? dateRangeStart.slice(0, 7)
      : ''
  return [base || 'untitled-trip', ym].filter(Boolean).join('-')
}

// LODGING/ACTIVITY/FOOD/LOGISTICS/TRANSIT → lowercase kind the themed
// views render. Unknown categories pass through lowercased.
export function categoryToKind(category) {
  if (typeof category !== 'string') return 'activity'
  return category.trim().toLowerCase() || 'activity'
}

export function humanDayLabel(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return ''
  const d = new Date(`${iso}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return ''
  return `${WEEKDAYS[d.getUTCDay()]} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`
}

// "October 9 – 12, 2026" (same month) or "October 9 – November 2, 2026".
export function humanDateRange(start, end) {
  const valid = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
  if (!valid(start)) return 'TBD'
  const s = new Date(`${start}T12:00:00Z`)
  if (Number.isNaN(s.getTime())) return 'TBD'
  if (!valid(end)) {
    return `${MONTHS_FULL[s.getUTCMonth()]} ${s.getUTCDate()}, ${s.getUTCFullYear()}`
  }
  const e = new Date(`${end}T12:00:00Z`)
  if (Number.isNaN(e.getTime())) {
    return `${MONTHS_FULL[s.getUTCMonth()]} ${s.getUTCDate()}, ${s.getUTCFullYear()}`
  }
  const sameMonth =
    s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear()
  if (sameMonth) {
    return `${MONTHS_FULL[s.getUTCMonth()]} ${s.getUTCDate()} – ${e.getUTCDate()}, ${e.getUTCFullYear()}`
  }
  return `${MONTHS_FULL[s.getUTCMonth()]} ${s.getUTCDate()} – ${MONTHS_FULL[e.getUTCMonth()]} ${e.getUTCDate()}, ${e.getUTCFullYear()}`
}

// Map a create_trip card to the canonical trip record. `existingId`
// reuses a prior id (refinement re-save); otherwise the id is derived
// from title + date. Skipped stops are excluded; days that end up
// empty are dropped so the saved trip has no blank days.
export function cardToTrip(card, { existingId = null } = {}) {
  const t = (card && card.trip) || {}
  const id = existingId || tripIdFromTitle(t.title, t.dateRangeStart)
  const travelers = travelerIdsFrom(t.travelers)

  const days = (Array.isArray(t.days) ? t.days : [])
    .map((d, di) => {
      const n = Number.isFinite(d.dayNumber) ? d.dayNumber : di + 1
      const stops = (Array.isArray(d.stops) ? d.stops : [])
        .filter((s) => s && !s.skipped)
        .map((s, si) => ({
          id: s.id || `${id}-${n}-${si + 1}`,
          time: s.time || '',
          name: s.name || 'Stop',
          kind: categoryToKind(s.category),
          for: travelerIdsFrom(s.who),
          note: s.description || '',
          address: s.address || '',
          lat: null,
          lng: null,
          driveFromPrevious: s.driveFromPrevious || null,
          source: 'claude',
        }))
      return {
        n,
        isoDate: typeof d.date === 'string' ? d.date : null,
        date: humanDayLabel(d.date),
        title: d.title || `Day ${n}`,
        stops,
      }
    })
    .filter((d) => d.stops.length > 0)

  return {
    id,
    draft: false,
    status: 'planning',
    title: t.title || 'Untitled trip',
    subtitle: t.subtitle || '',
    epigraph: '',
    dateRange: humanDateRange(t.dateRangeStart, t.dateRangeEnd),
    dateRangeStart: t.dateRangeStart || null,
    dateRangeEnd: t.dateRangeEnd || null,
    startCity: t.startCity || '',
    endCity: t.endCity || '',
    miles: 0,
    travelers,
    overview: t.subtitle || '',
    sharedAlbumURL: '',
    days,
    source: 'claude',
  }
}
