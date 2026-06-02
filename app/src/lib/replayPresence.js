// Replay presence normalizer. The replay engine renders "who was here"
// at every level, but presence is recorded under three different shapes
// depending on a stop's provenance:
//
//   • for[]      — the CANONICAL trip record (data/trips.js, and the
//                  cardToTrip output stored in D1). Already traveler IDS,
//                  lowercase. This is what replay actually reads today —
//                  all 69 seed stops carry it.
//   • persons[]  — the LEGACY flat-stops PWA model (data/stops.js). IDS,
//                  but with an 'everyone' sentinel the canonical model
//                  does not use. Defensive path: replay's data source
//                  (useTrips) does not surface these, but a normalizer
//                  that silently ignored them would rot the day someone
//                  points replay at legacy data.
//   • who[]      — the TRANSIENT create_trip card shape (worker dialect),
//                  traveler NAMES ("Helen"), pre-cardToTrip. A stored
//                  trip never carries it (cardToTrip rewrites who→for at
//                  save), so this too is defensive, not load-bearing now.
//
// capturedBy() reads a memory's single author. A memory cannot express
// "who is depicted IN this photo" — only who captured it — so presence
// on the memory axis is one author, not a set. (schema.sql: author_traveler.)

import { TRAVELER_ORDER } from '../data/travelers'
import { travelerNameToId } from './createTripCard'

// The legacy persons[] sentinel meaning "the whole family". The canonical
// for[] model enumerates travelers instead, so replay never wants to
// render a literal "everyone" avatar — it expands to the family.
const EVERYONE = 'everyone'

// One presence token → a canonical traveler id, the EVERYONE sentinel, or
// null. Accepts an id already ('helen') or a display name ('Helen').
function tokenToId(value) {
  if (typeof value !== 'string') return null
  const lower = value.trim().toLowerCase()
  if (!lower) return null
  if (lower === EVERYONE) return EVERYONE
  if (TRAVELER_ORDER.includes(lower)) return lower
  return travelerNameToId(value) // "Helen" → "helen", else null
}

// Collapse a list of tokens to canonical-ordered, deduped traveler ids.
// EVERYONE anywhere in the list expands to the full family.
function orderAndDedupe(tokens) {
  const set = new Set(tokens.filter(Boolean))
  if (set.has(EVERYONE)) return [...TRAVELER_ORDER]
  return TRAVELER_ORDER.filter((id) => set.has(id))
}

// presenceOf(stop) → traveler id[] (canonical order, deduped).
//
// DESIGN JUDGMENT — replay presence is LIVED, not PLANNED. When a stop
// carries no presence field, this returns [] ("we don't know who was
// here"), and the UI renders no avatars. It deliberately does NOT inherit
// travelerIdsFrom()'s "empty → whole family" default (createTripCard.js),
// which is a *planning* convenience ("nobody named yet → everyone's
// invited"). In a replay, fabricating a full-family presence onto an
// unknown stop would be a lie about who was actually there. Unknown reads
// as unknown. (With today's data this branch is unreachable — every seed
// stop has a populated for[] — so the choice is latent but correct.)
export function presenceOf(stop) {
  if (!stop || typeof stop !== 'object') return []
  const raw =
    (Array.isArray(stop.for) && stop.for) ||
    (Array.isArray(stop.persons) && stop.persons) ||
    (Array.isArray(stop.who) && stop.who) ||
    []
  return orderAndDedupe(raw.map(tokenToId))
}

// capturedBy(memory) → traveler id | null. Reads the single author,
// camelCase (client read path) or snake_case (raw D1 row), tolerating
// either. Returns null when the author is missing or unrecognized.
export function capturedBy(memory) {
  if (!memory || typeof memory !== 'object') return null
  const id = tokenToId(memory.authorTraveler ?? memory.author_traveler)
  return id && id !== EVERYONE && TRAVELER_ORDER.includes(id) ? id : null
}
