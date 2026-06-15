// tripPhase — the system-driven phase that reflows each per-person home
// (entry-points redesign). 'during' while the trip is ongoing OR upcoming (the
// "Now" features apply); 'after' once it has ended (the keepsake takes the front
// door). Date strings are 'YYYY-MM-DD', so a lexical compare is a date compare.
import { localDateIso } from './localDate'

export function tripPhase(trip, now = new Date()) {
  const end = trip?.dateRangeEnd
  if (!end || typeof end !== 'string') return 'during'
  // LOCAL calendar date (matches effectiveStatus + the views' default-day + the
  // live dock) — a UTC "today" would flip the phase a day early for the Americas.
  const today = localDateIso(now)
  return today > end ? 'after' : 'during'
}
