// Per-visit rotating trip hero. A matched trip shows a RANDOM one of its hero
// candidates each visit — its current resolved hero (the TripIndex cascade
// result) rotated WITH the extra images here.
//
// Matched by a TITLE substring, not a trip id, on purpose: the trips this targets
// are created in the app and live in the production DB (not the seed data), so
// there is no stable id in the code to key on. "juneteenth" in the title is
// distinctive enough to mean the Vermont Juneteenth Weekend trip. If the title
// changes the rotation simply stops (the trip falls back to its single hero) —
// never a broken render. Pure module (no DOM/React) → unit-tests under node --test.

// Deck photos committed to public/images, referenced like the other heroes
// (relative `./images/…`, resolved against the client base).
const VERMONT_DECK = ['./images/vermont-deck-1.jpg', './images/vermont-deck-2.jpg']

// Extra hero images to rotate WITH a trip's current hero. [] for most trips.
export function heroRotationExtras(trip) {
  const title = trip && typeof trip.title === 'string' ? trip.title.toLowerCase() : ''
  if (title.includes('juneteenth')) return VERMONT_DECK
  return []
}

// Pick one candidate hero URL using `seed` ∈ [0,1) so the choice is STABLE for a
// visit (the caller fixes one seed per mount) and re-rolls on the next visit.
// Falsy candidates are dropped; returns null only when there are none. An
// out-of-range/absent seed falls back to Math.random() (real runtime use).
export function pickRotatingHero(candidates, seed) {
  const list = (candidates || []).filter(Boolean)
  if (list.length === 0) return null
  const s = typeof seed === 'number' && seed >= 0 && seed < 1 ? seed : Math.random()
  return list[Math.min(list.length - 1, Math.floor(s * list.length))]
}
