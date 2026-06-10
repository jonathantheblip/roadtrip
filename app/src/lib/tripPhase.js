// tripPhase — the system-driven phase that reflows each per-person home
// (entry-points redesign). 'during' while the trip is ongoing OR upcoming (the
// "Now" features apply); 'after' once it has ended (the keepsake takes the front
// door). Date strings are 'YYYY-MM-DD', so a lexical compare is a date compare.
export function tripPhase(trip, now = new Date()) {
  const end = trip?.dateRangeEnd
  if (!end || typeof end !== 'string') return 'during'
  const today = now.toISOString().slice(0, 10)
  return today > end ? 'after' : 'during'
}
