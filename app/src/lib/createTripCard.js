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
import { PART_TYPES } from './tripParts.js'

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

// Make `baseId` unique against a set of ids already in use. The id from
// tripIdFromTitle is a deterministic slug+YYYY-MM, so two different trips with
// the same title in the same month collide — and an unchecked create would
// overwrite the first one. When the base is free (or it's the same trip being
// re-saved, see `selfId`), return it unchanged so refinement stays idempotent;
// otherwise append a short numeric suffix ("-2", "-3", …) until it's free.
// `existingIds` accepts an array or a Set.
export function uniqueTripId(baseId, existingIds, { selfId = null } = {}) {
  const taken =
    existingIds instanceof Set ? existingIds : new Set(existingIds || [])
  // A re-save of the same trip is not a collision with itself.
  if (selfId && baseId === selfId) return baseId
  if (!taken.has(baseId)) return baseId
  for (let i = 2; i < 1000; i++) {
    const candidate = `${baseId}-${i}`
    if (!taken.has(candidate)) return candidate
  }
  // Pathological fallback (1000 same-title-same-month trips) — keep it unique.
  return `${baseId}-${Date.now()}`
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

// Validate + author-stamp a part's surprise ("surprises by sentence"). SECURITY:
// the author is ALWAYS the session traveler passed in (never Claude's output) — no
// trustworthy author ⇒ NO surprise (fail-safe). hideFrom is mapped to known
// travelers (+ "everyone") and the author can never be hidden from their own
// surprise. conceal defaults to "teaser" so an un-covered surprise still ships
// safely HIDDEN. Returns null when there's no valid audience (a normal visible part).
export function sanitizePartSurprise(raw, authorTraveler) {
  if (!raw || typeof raw !== 'object') return null
  const author = travelerNameToId(authorTraveler)
  if (!author) return null
  const ids = (Array.isArray(raw.hideFrom) ? raw.hideFrom : [])
    .map((n) => (typeof n === 'string' && n.trim().toLowerCase() === 'everyone' ? 'everyone' : travelerNameToId(n)))
    .filter(Boolean)
  const hideFrom = [...new Set(ids)].filter((x) => x !== author)
  if (!hideFrom.length) return null
  const conceal = raw.conceal === 'cover' ? 'cover' : 'teaser'
  const reveal = raw.reveal && typeof raw.reveal === 'object' && raw.reveal.type ? raw.reveal : { type: 'manual' }
  const out = { author, hideFrom, conceal, reveal }
  if (raw.revealed) out.revealed = raw.revealed
  const cov = raw.cover
  if (cov && typeof cov === 'object') {
    const s = (v) => (typeof v === 'string' ? v.trim() : '')
    const cover = { title: s(cov.title), loc: s(cov.loc), icon: s(cov.icon).slice(0, 4) }
    if (cover.title || cover.loc) out.cover = cover
  }
  return out
}

// Map a create_trip card to the canonical trip record. `existingId`
// reuses a prior id (refinement re-save); otherwise the id is derived
// from title + date. `existingIds` (the ids already in the store) lets a
// brand-new create avoid colliding with — and silently overwriting — a
// different same-title-same-month trip: the derived id is uniquified
// against it. A refinement (`existingId` set) is exempt so re-saving the
// same trip stays idempotent. Skipped stops are excluded; days that end up
// empty are dropped so the saved trip has no blank days.
export function cardToTrip(card, { existingId = null, existingIds = null, authorTraveler = null } = {}) {
  const t = (card && card.trip) || {}
  const baseId = existingId || tripIdFromTitle(t.title, t.dateRangeStart)
  // Only a fresh create (no existingId) is uniquified; a refinement keeps its id.
  const id =
    existingId || !existingIds
      ? baseId
      : uniqueTripId(baseId, existingIds)
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

  // The composite "bigger trip": when Claude lays out distinct legs it emits an
  // optional `parts` array (a flight, a city, a stay, a drive). Carry it onto the
  // trip (additive — a simple trip has none, so getParts derives one part and
  // nothing changes). The legacy `days` above still render every existing surface.
  const parts =
    Array.isArray(t.parts) && t.parts.length
      ? t.parts.map((p, pi) => {
          const surprise = sanitizePartSurprise(p.surprise, authorTraveler)
          return {
            id: p.id || `${id}-part-${pi + 1}`,
            type: PART_TYPES.includes(p.type) ? p.type : 'stay',
            title: p.title || '',
            place: p.place || null,
            dateStart: p.dateStart || null,
            dateEnd: p.dateEnd || null,
            // "Surprises by sentence": a Claude-suggested (or author-edited) surprise
            // rides on the part, AUTHOR-STAMPED FROM THE SESSION (never from Claude),
            // hideFrom validated to known travelers. The worker boundary masks it; a
            // teaser default means an un-covered surprise still ships safely hidden.
            ...(surprise ? { surprise } : {}),
          }
        })
      : null

  // Trip SHAPE stamped by the concierge (it reads loose intent — "chill", "lazy
  // weekend", "hangout" → a stay — and categorizes precisely). Only the two known
  // values are honored; anything else (or omitted, when Claude can't tell) is dropped
  // so inferTripShape's heuristic decides — keeping a real road trip from ever being
  // mislabeled a stay and losing its drive scaffolding (G5).
  const shape = t.shape === 'stay' || t.shape === 'route' ? t.shape : null

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
    ...(shape ? { shape } : {}),
    ...(parts ? { parts } : {}),
    source: 'claude',
  }
}
