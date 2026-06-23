// tripParts.js — the "a trip is a sequence of parts" foundation (new-trip redesign, Phase 1).
//
// ADDITIVE and non-breaking. A trip created by the redesigned concierge carries an explicit
// `parts: Part[]`; every EXISTING (legacy) trip has none, so `getParts` derives ONE synthetic
// part that wraps the whole trip. That lets new parts-aware surfaces treat every trip uniformly
// while the existing day/stop rendering keeps reading `trip.days` directly — untouched (G5).
//
// No D1 migration: `parts` rides inside the trip's existing `data_json` blob (the worker stores
// trips as JSON and never inspects this field). The worker's draft read-filter and masking
// boundary are unaffected.
//
//   Part = {
//     id, type,                 // type ∈ PART_TYPES
//     title?, place?,           // place: the stay/destination anchor (null for a pure drive/flight leg)
//     dateStart?, dateEnd?,     // both OPTIONAL — a loose "weekend at Grandma's" needs neither
//     days?,                    // the day/stop detail for this part (legacy days live in the one wrapper)
//     visibility?,              // surprise scoping (set by the intake; enforced by worker/src/surprises.js)
//   }
import { inferTripShape, stayPlace, stayLabel } from './tripShape.js'

// The kinds of part a trip can hold. Stay/city/drive/flight are the core four; event + the
// transport trio are the "flexible, not complex" long tail (Jonathan's pick).
export const PART_TYPES = ['stay', 'city', 'drive', 'flight', 'event', 'train', 'ferry', 'cruise']

// True when the trip explicitly carries its own parts (a redesign-created composite trip).
export function hasExplicitParts(trip) {
  return Array.isArray(trip?.parts) && trip.parts.length > 0
}

// The parts of a trip. An explicit `parts[]` wins; otherwise derive ONE part that wraps the
// whole legacy trip, typed by its derived shape, so a one-part trip renders exactly as today.
// The derived wrapper is marked `derived:true` and is NEVER persisted — it's a read-time view.
export function getParts(trip) {
  if (!trip) return []
  if (hasExplicitParts(trip)) return trip.parts
  const shape = inferTripShape(trip) // 'stay' | 'route'
  const isStay = shape !== 'route'
  return [
    {
      id: `${trip.id || 'trip'}__whole`,
      type: isStay ? 'stay' : 'drive',
      derived: true,
      title: (isStay ? stayLabel(trip) : '') || trip.title || '',
      place: isStay ? stayPlace(trip) || null : null,
      dateStart: trip.dateRangeStart || null,
      dateEnd: trip.dateRangeEnd || null,
      days: trip.days || [],
    },
  ]
}

// The overall shape of a trip, generalized for parts. An explicit `trip.shape` always wins (as
// inferTripShape honors). A legacy trip (no parts) falls back to inferTripShape ('stay'|'route'),
// so isStayTrip and the existing surfaces are unaffected. A composite (2+ explicit parts) is
// 'bigger'; a single explicit part takes that part's type. This is NEW — only parts-aware code
// calls it; nothing legacy changes.
export function deriveTripShape(trip) {
  if (!trip) return 'route'
  if (trip.shape) return trip.shape
  if (!hasExplicitParts(trip)) return inferTripShape(trip)
  if (trip.parts.length >= 2) return 'bigger'
  return trip.parts[0]?.type || 'stay'
}

// How many REAL (persisted, non-derived) parts a trip has: 0 for a legacy trip, N for a composite.
export function partCount(trip) {
  return hasExplicitParts(trip) ? trip.parts.length : 0
}

// ── Real timed days, derived ───────────────────────────────────────────────
// A composite trip stores ONE flat `trip.days[]` (the full day-by-day detail,
// each stamped with `isoDate`) plus `parts[]` (the high-level legs, each a date
// window with no days of its own — see the worker create_trip prompt). To show a
// city/stay part day-by-day we DERIVE its days at read time: assign each saved day
// to its part by date, then enumerate the part's window into one row per day —
// real days fill in, the rest stay loose ("open space"). No storage, no migration.

// ISO 'YYYY-MM-DD' date math in UTC (no Date.now / no local-TZ drift).
function isoAddDays(iso, delta) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  if (!m) return null
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]) + delta * 86400000
  return new Date(t).toISOString().slice(0, 10)
}
// Inclusive list of ISO dates from start..end (≤ a guard cap so bad data can't loop forever).
function isoRange(start, end) {
  if (!start || !end || end < start) return []
  const out = []
  let cur = start.slice(0, 10)
  for (let i = 0; i < 800 && cur && cur <= end; i++) {
    out.push(cur)
    cur = isoAddDays(cur, 1)
  }
  return out
}

// The parts of a trip, each augmented with a derived `days[]` and a per-part
// `dayCount`. A LEGACY trip returns its single derived wrapper untouched (days =
// trip.days) so nothing about its rendering changes (G5). A composite partitions
// trip.days[] into non-overlapping, date-clamped windows so a shared travel day
// (Rome's checkout = Tuscany's arrival) lands in exactly one part — never doubled,
// never dropped. A dated part's window is enumerated so empty days show as loose.
export function partsWithDays(trip) {
  const parts = getParts(trip)
  // Legacy / single derived wrapper already carries days = trip.days — leave as-is.
  if (!hasExplicitParts(trip)) {
    return parts.map((p) => ({ ...p, dayCount: (p.days || []).length }))
  }

  // Stable chronological order by dateStart (undated parts keep their position).
  const order = parts
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const ka = a.p.dateStart || '9999-99-99'
      const kb = b.p.dateStart || '9999-99-99'
      return ka === kb ? a.i - b.i : ka < kb ? -1 : 1
    })

  // Non-overlapping [winStart, winEnd] per dated part: end at the part's own
  // dateEnd, but clamp to the day BEFORE the next dated part begins so a boundary
  // day belongs to the arriving part only. A part whose window collapses (a flight
  // sharing a city's start date) simply claims no days — it's a transit marker.
  const dated = order.filter((o) => o.p.dateStart)
  const win = new Map() // original index -> { start, end } | null
  dated.forEach((o, k) => {
    const start = o.p.dateStart.slice(0, 10)
    let end = (o.p.dateEnd && o.p.dateEnd.slice(0, 10)) || start
    const next = dated[k + 1]
    if (next) {
      const cap = isoAddDays(next.p.dateStart.slice(0, 10), -1)
      if (cap && cap < end) end = cap
    }
    win.set(o.i, end >= start ? { start, end } : null)
  })

  // Claim each saved day to the part whose window contains its date. A dateless
  // day, or one outside every window, falls to the first dated part (never lost).
  const allDays = Array.isArray(trip.days) ? trip.days : []
  const firstDatedIdx = dated.length ? dated[0].i : (parts.length ? 0 : -1)
  const claimed = new Map() // index -> day[]
  for (const day of allDays) {
    const d = typeof day?.isoDate === 'string' ? day.isoDate.slice(0, 10) : null
    let owner = -1
    if (d) {
      for (const o of dated) {
        const w = win.get(o.i)
        if (w && d >= w.start && d <= w.end) { owner = o.i; break }
      }
    }
    if (owner < 0) owner = firstDatedIdx
    if (owner < 0) continue
    if (!claimed.has(owner)) claimed.set(owner, [])
    claimed.get(owner).push(day)
  }

  // Build each part's day grid: enumerate the window, fill from claimed days by
  // date, leave the rest loose; then append any claimed day not placed by date
  // (dateless / defensive) so nothing is ever dropped.
  return parts.map((p, i) => {
    const mine = claimed.get(i) || []
    const byDate = new Map()
    for (const day of mine) {
      const d = typeof day?.isoDate === 'string' ? day.isoDate.slice(0, 10) : null
      if (d && !byDate.has(d)) byDate.set(d, day)
    }
    const w = win.get(i)
    const dates = w ? isoRange(w.start, w.end) : []
    const placed = new Set() // day OBJECTS already positioned by date
    const grid = dates.map((d) => {
      const real = byDate.get(d)
      if (real) { placed.add(real); return real }
      return { isoDate: d, stops: [], loose: true }
    })
    // Append any claimed day not placed by date (dateless / out-of-window / a
    // second day sharing a date) so a real day is NEVER dropped.
    for (const day of mine) if (!placed.has(day)) grid.push(day)
    return { ...p, days: grid, dayCount: grid.length }
  })
}
