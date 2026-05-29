// Pure logic for POST /calendar/import — the "be smart about it" layer
// from CALENDAR_PULL_SPEC. Kept free of I/O (no fetch, no env) so the
// filter + trip-match are unit-testable with `node --test`, mirroring the
// app's pure-lib convention. Geocoding (text location -> lat/lng) is I/O
// and lives in the worker; events reaching filterCalendarEvents may
// already carry lat/lng (geocoded upstream), and distance is judged from
// those when present.
//
// Two filters, applied as the AUTHORITY even though the Shortcut
// pre-filters (defense in depth):
//   1. Drop events carrying a recurrence rule — weekly standing
//      commitments (karate, volleyball practice) are never trip stops.
//   2. Drop events with no location, or a location within ~25mi of home
//      (Belmont, MA). Events away from home are kept.

// Family home — Belmont, MA (the trips' start city). Hardcoded because
// it's fixed and the filter must run before any trip is matched.
export const HOME = { lat: 42.3959, lng: -71.1787 }
export const HOME_RADIUS_METERS = 25 * 1609.344 // ~25 miles

export function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// A recurrence rule in any of the shapes a calendar source might send.
export function hasRecurrence(ev) {
  return !!(ev?.hasRecurrence || ev?.recurrence || ev?.rrule || ev?.recurrenceRule)
}

export function hasLocation(ev) {
  return typeof ev?.location === 'string' && ev.location.trim().length > 0
}

// Away-from-home judgment. Uses the event's geocoded lat/lng when
// present. If a located event couldn't be geocoded (no coords), we keep
// it — better to surface a stray on the confirmation screen than to
// silently drop a real trip event; the confirmation + reconciliation are
// the 5% safety net (per spec). A no-location event is dropped upstream
// by hasLocation, not here.
export function isAwayFromHome(ev, opts = {}) {
  const home = opts.home || HOME
  const radius = Number.isFinite(opts.radiusMeters) ? opts.radiusMeters : HOME_RADIUS_METERS
  const lat = Number(ev?.lat)
  const lng = Number(ev?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return hasLocation(ev)
  }
  return haversineMeters(home.lat, home.lng, lat, lng) > radius
}

// Does the event overlap the trip's date window? The Shortcut's "Find
// Calendar Events" can't express an overlap predicate (its Start Date
// operators are only is-exactly / is-today / is-between / is-in-next /
// is-in-last — no before/after), so it over-pulls a wide window and the
// worker does the real date scoping here.
//
// Compared at DAY granularity (YYYY-MM-DD): this sidesteps timezone
// ambiguity in the ISO strings AND iCal's exclusive-end convention, and
// pads to day boundaries so all-day events (which sit at midnight) aren't
// dropped by a strict comparison. An event with no parseable start, or
// when no window is given, is kept — the confirmation screen is the net.
//   overlap  ⇔  eventStartDay <= windowEnd  AND  eventEndDay >= windowStart
export function overlapsWindow(ev, dateRange) {
  const wStart = isoDay(dateRange?.start)
  const wEnd = isoDay(dateRange?.end)
  if (!wStart || !wEnd) return true
  const evStart = isoDay(ev?.start)
  if (!evStart) return true
  const evEnd = isoDay(ev?.end) || evStart // missing end → treat as a point event
  return evStart <= wEnd && evEnd >= wStart
}

// All the filters together: non-recurring AND located AND (when a
// dateRange is supplied) overlapping the trip window AND away-from-home.
export function filterCalendarEvents(events, opts = {}) {
  const list = Array.isArray(events) ? events : []
  return list.filter(
    (ev) =>
      !hasRecurrence(ev) &&
      hasLocation(ev) &&
      overlapsWindow(ev, opts.dateRange) &&
      isAwayFromHome(ev, opts)
  )
}

// ── Path 2 trip matching ──────────────────────────────────────────────

function isoDay(s) {
  return typeof s === 'string' ? s.slice(0, 10) : ''
}

function daySpan(aIso, bIso) {
  const a = Date.parse(`${aIso}T00:00:00Z`)
  const b = Date.parse(`${bIso}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.round((b - a) / 86_400_000) + 1
}

// ── Response builder (the whole /calendar/import logic, sans I/O) ──────

function normalizeEvent(ev) {
  return {
    title: typeof ev?.title === 'string' ? ev.title : '',
    start: ev?.start || null,
    end: ev?.end || null,
    location: typeof ev?.location === 'string' ? ev.location : '',
    hasRecurrence: hasRecurrence(ev),
  }
}

function shapeEvent(e) {
  return {
    title: e.title,
    start: e.start,
    end: e.end,
    location: e.location,
    address: e.address || e.location || '',
    lat: Number.isFinite(e.lat) ? e.lat : null,
    lng: Number.isFinite(e.lng) ? e.lng : null,
  }
}

// Build the full POST /calendar/import response from already-fetched
// inputs. Pure except for the injected async `geocode(query) ->
// {lat,lng,address}|null`, so the whole geocode→filter→match→shape path
// is unit-testable with mocks while the worker handler stays a thin
// adapter (load trips from D1, pass the real Places geocoder).
//
//   { tripId?, dateRange, events, trips, geocode, opts? }
//   ->
//   { matched, tripId, dateRange, events, reason? }
export async function buildCalendarImport({ tripId, dateRange, events, trips, geocode, opts }) {
  const list = Array.isArray(events) ? events : []
  const allTrips = Array.isArray(trips) ? trips : []

  // Geocode located, non-recurring events so away-from-home has coords to
  // judge by. Recurring / no-location events skip the geocode (dropped
  // regardless) — saves Places quota.
  const geocoded = []
  for (const ev of list) {
    const base = normalizeEvent(ev)
    // Skip the geocode for anything the filter will drop anyway —
    // recurring, no-location, or outside the trip window (the Shortcut
    // over-pulls a wide window). Saves Places quota on the noise.
    if (base.hasRecurrence || !base.location.trim() || !overlapsWindow(base, dateRange)) {
      geocoded.push(base)
      continue
    }
    let g = null
    try {
      g = geocode ? await geocode(base.location) : null
    } catch {
      g = null
    }
    geocoded.push(
      g && Number.isFinite(g.lat) && Number.isFinite(g.lng)
        ? { ...base, address: g.address || base.location, lat: g.lat, lng: g.lng }
        : base
    )
  }

  const filtered = filterCalendarEvents(geocoded, { ...(opts || {}), dateRange }).map(shapeEvent)

  // Path 1 — scope to the given trip (any existing trip; the app only
  // offers the action on confirmed trips).
  const wanted = typeof tripId === 'string' && tripId ? tripId : null
  if (wanted) {
    if (!allTrips.some((t) => t && t.id === wanted)) {
      return { matched: false, tripId: null, dateRange, events: filtered, reason: 'trip not found' }
    }
    return { matched: true, tripId: wanted, dateRange, events: filtered }
  }

  // Path 2 — match the date range to a confirmed trip.
  const matchedId = matchTripByDateRange(allTrips, dateRange)
  if (!matchedId) {
    // No confirmed trip covers the range. Return the filtered survivors
    // anyway (not []) so the app's "Create a trip from these dates" path
    // (Feature A) can scaffold a new trip from dateRange and drop these
    // geocoded events in as stops. Symmetric with the Path-1
    // trip-not-found branch above, which already returns the survivors.
    // Backward-compatible: the shipped client ignores `events` on a
    // matched:false response (it shows the no-match banner), so emitting
    // them changes nothing until the create affordance is live.
    return { matched: false, tripId: null, dateRange, events: filtered, reason: 'no matching trip' }
  }
  return { matched: true, tripId: matchedId, dateRange, events: filtered }
}

// Pick the confirmed trip whose date window best covers [start, end].
// "Confirmed" = not a draft and carrying both dates. Overlap-based: the
// trip sharing the most days with the requested range wins; ties break to
// the earliest-starting trip. Returns the trip id, or null when nothing
// overlaps. Dates compared as YYYY-MM-DD (lexical order == chronological).
export function matchTripByDateRange(trips, dateRange) {
  const start = isoDay(dateRange?.start)
  const end = isoDay(dateRange?.end)
  if (!start || !end) return null
  let best = null
  let bestOverlap = 0
  for (const t of Array.isArray(trips) ? trips : []) {
    if (!t || t.draft) continue
    const ts = isoDay(t.dateRangeStart)
    const te = isoDay(t.dateRangeEnd)
    if (!ts || !te) continue
    const oStart = ts > start ? ts : start
    const oEnd = te < end ? te : end
    if (oStart > oEnd) continue // no overlap
    const overlap = daySpan(oStart, oEnd)
    if (
      overlap > bestOverlap ||
      (overlap === bestOverlap && best && ts < isoDay(best.dateRangeStart))
    ) {
      best = t
      bestOverlap = overlap
    }
  }
  return best ? best.id : null
}
