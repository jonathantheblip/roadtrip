// tripPhase — the system-driven phase that reflows each per-person home
// (entry-points redesign). 'during' while the trip is ongoing OR upcoming (the
// "Now" features apply); 'after' once it has ended (the keepsake takes the front
// door). Date strings are 'YYYY-MM-DD', so a lexical compare is a date compare.
import { localDateIso } from './localDate.js'
import { itineraryNearToday, itinerarySpan } from './liveDock.js'

export function tripPhase(trip, now = new Date()) {
  const end = trip?.dateRangeEnd
  if (!end || typeof end !== 'string') return 'during'
  // LOCAL calendar date (matches effectiveStatus + the views' default-day + the
  // live dock) — a UTC "today" would flip the phase a day early for the Americas.
  const today = localDateIso(now)
  if (today > end) return 'after'
  // Stored window says 'during' — but a stale itinerary (all stops weeks past)
  // means the trip is really over, so let the keepsake take the front door
  // rather than showing the live framing for a trip with a bad/huge date window.
  if (!itineraryNearToday(trip, today)) {
    const span = itinerarySpan(trip)
    if (span && span.max < today) return 'after'
  }
  return 'during'
}
