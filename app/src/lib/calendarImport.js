// Calendar Pull — client helpers. Pure (no React/network) so they're
// unit-testable in Node and shared between the deep-link router (App.jsx)
// and the confirmation view (CalendarImportView).
//
// The Apple Shortcut POSTs the family calendar events to the worker's
// POST /calendar/import, then opens the app at
//   <app>/?action=calendar-import&data=<base64(JSON)>
// where JSON is the worker's response: { matched, tripId, dateRange,
// events:[{title,start,end,location,address,lat,lng}] }. The app decodes
// the payload, shows the confirmation screen, and on confirm turns the
// checked events into stops via the existing stop-add path
// (claudeCardApply.applyCardToTrip) — same as Share-In's save flow.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Decode the base64 (URL-safe tolerated) UTF-8 JSON payload the Shortcut
// passes in `?data=`. Returns the parsed object, or null on any failure
// so the caller can fall to a graceful empty state.
export function decodeCalendarPayload(raw) {
  if (!raw) return null
  try {
    const b64 = String(raw).replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(b64)
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    const json = new TextDecoder().decode(bytes)
    const obj = JSON.parse(json)
    return obj && typeof obj === 'object' ? obj : null
  } catch {
    return null
  }
}

// 'YYYY-MM-DD' from an ISO date or datetime string.
export function isoDateOf(start) {
  return typeof start === 'string' ? start.slice(0, 10) : ''
}

// A calendar event's wall-clock time → a stop time string ("7:00 PM").
// Reads the clock straight out of the ISO string (no timezone math) —
// the Shortcut sends local wall-clock, and stop.time is a display string,
// so this keeps the stop time matching what Helen saw on her calendar.
// Returns '' for an all-day event: either no time component, or midnight
// (T00:00), which is how all-day events (vacation blocks, school days)
// arrive — rendering those as "12:00 AM" looked broken in the feed.
export function formatEventTime(start) {
  const m = String(start || '').match(/T(\d{2}):(\d{2})/)
  if (!m) return ''
  const h = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  if (h === 0 && min === 0) return '' // midnight → all-day, no clock time
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hr = h % 12 === 0 ? 12 : h % 12
  return `${hr}:${m[2]} ${ampm}`
}

// "Oct 10 · 7:00 PM" / "Oct 10 · all day" for the confirmation row.
export function formatEventWhen(ev) {
  const dm = isoDateOf(ev?.start).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const datePart = dm ? `${MONTHS[parseInt(dm[2], 10) - 1]} ${parseInt(dm[3], 10)}` : ''
  const time = formatEventTime(ev?.start)
  if (datePart && time) return `${datePart} · ${time}`
  if (datePart) return `${datePart} · all day`
  return time || ''
}

// Resolve an event's date to a trip day number. Exact isoDate match wins;
// otherwise the day closest in time (so an event a touch outside the
// authored days still lands sensibly). Defaults to day 1 when the trip
// has no days.
export function dayNForDate(trip, isoDate) {
  const days = trip?.days || trip?.data?.days || []
  if (days.length === 0) return 1
  for (const d of days) {
    if (d.isoDate === isoDate) return d.n
  }
  const target = Date.parse(`${isoDate}T00:00:00Z`)
  if (!Number.isFinite(target)) return days[0].n
  let best = days[0]
  let bestDiff = Infinity
  for (const d of days) {
    const dt = Date.parse(`${d.isoDate || ''}T00:00:00Z`)
    if (!Number.isFinite(dt)) continue
    const diff = Math.abs(dt - target)
    if (diff < bestDiff) {
      best = d
      bestDiff = diff
    }
  }
  return best.n
}

// Turn the checked calendar events into a `multi` confirmation card the
// existing applyCardToTrip consumes — each event an `add` edit on the day
// matching its date. Event time → stop time, geocoded address → address,
// coords carried through; `who` defaults to the full family (applyAdd's
// default), editable on the stop afterward like any other.
export function eventsToMultiCard(trip, events, opts = {}) {
  const list = Array.isArray(events) ? events : []
  const edits = list.map((ev) => ({
    action: 'add',
    title: ev.title || 'Calendar event',
    target: { dayN: dayNForDate(trip, isoDateOf(ev.start)) },
    fields: [
      { name: 'time', value: formatEventTime(ev.start) },
      { name: 'address', value: ev.address || ev.location || '' },
      { name: 'lat', value: Number.isFinite(ev.lat) ? ev.lat : null },
      { name: 'lng', value: Number.isFinite(ev.lng) ? ev.lng : null },
      { name: 'note', value: 'Added from calendar' },
    ],
  }))
  return {
    type: 'calendar_import',
    action: 'multi',
    id: opts.id || `cal-import-${isoDateOf(list[0]?.start) || 'x'}-${list.length}`,
    edits,
  }
}
