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
