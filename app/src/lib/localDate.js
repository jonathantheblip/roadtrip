// localDate.js — ONE source of truth for "what's today?" across the app.
//
// Why this exists: the app's trip windows and day labels are LOCAL
// calendar dates (YYYY-MM-DD, no timezone). "Today" must be derived from
// the same local calendar, NOT from the UTC ISO date. The two disagree for
// up to several hours around midnight for Americas users:
//   new Date('2026-05-02T01:00:00-05:00').toISOString().slice(0,10)
//     === '2026-05-02'  // already-UTC-tomorrow → wrong day opens / wrong
//                       // live badge vs. the live dock, which already
//                       // uses the local helper.
//   localDateIso(new Date('2026-05-02T01:00:00-05:00'))
//     === '2026-05-01'  // the day it actually is, locally.
//
// liveDock.js and App.jsx already derived "today" the local way; trips.js,
// the per-view default-day pickers, and JonathanView.isLiveStop derived it
// the UTC way and drifted near midnight. Centralizing here removes the
// disagreement. The e2e clock stub pins `new Date()` to noon UTC, which is
// the same calendar date locally on the (UTC) CI runner, so this change
// resolves identically under the stub — no baseline default-day shift.
//
// Pure module (no DOM, no React, no imports) → unit-testable under
// `node --test`.

// Local YYYY-MM-DD for a Date — the local calendar date, tz-stable against
// the app's YYYY-MM-DD trip dates and day labels. With an IANA `tz`, the
// calendar date IN THAT ZONE — so a trip's "today" reflects where the TRIP is,
// not the phone (per-leg timezone honesty, hangout-first 06). Keyless (Intl).
// Without tz → DEVICE-local, byte-identical to before: every existing caller
// passes no tz, so nothing changes for them (G5).
export function localDateIso(d = new Date(), tz) {
  if (tz) {
    try {
      // en-CA formats as YYYY-MM-DD; timeZone renders the wall date in that zone.
      return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
    } catch {
      // An unknown/invalid zone falls through to device-local rather than
      // throwing — an honest degrade, never a crash.
    }
  }
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Convenience: today's calendar date as YYYY-MM-DD — device-local, or in `tz`.
export function todayLocalIso(tz) {
  return localDateIso(new Date(), tz)
}

// Minutes since midnight of the current wall clock — device-local, or in `tz`.
// Feeds "now" for countdowns / the next-timed-stop so they tick on LEG time,
// not the phone's. Keyless; degrades to device time on an unknown zone.
export function nowMinutesInZone(tz, d = new Date()) {
  if (tz) {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d)
      const h = Number(parts.find((p) => p.type === 'hour')?.value)
      const m = Number(parts.find((p) => p.type === 'minute')?.value)
      if (Number.isFinite(h) && Number.isFinite(m)) return (h % 24) * 60 + m
    } catch {
      // fall through to device-local
    }
  }
  return d.getHours() * 60 + d.getMinutes()
}

// A friendly wall-clock time ("4:20 PM") — device-local, or in `tz`. For the
// dual-clock ("4:20 PM in Florence · 10:20 AM where you are").
export function clockInZone(tz, d = new Date()) {
  try {
    return d.toLocaleTimeString([], { timeZone: tz || undefined, hour: 'numeric', minute: '2-digit' })
  } catch {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
}

// The viewer's own IANA zone, for deciding whether a leg's time differs enough
// to show a dual clock. Keyless; '' when unavailable (→ caller shows one clock).
export function viewerZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  } catch {
    return ''
  }
}

// The UTC offset (in minutes, positive = east of UTC) an IANA zone was AT a
// specific instant — DST-correct, so a US Eastern photo in January (-300) and
// one in July (-240) get different answers even though it's "the same zone".
// Build 2's offset-inference engine (§14): given a photo's real capturedAt
// instant and the trip's stay zone, this is "what would a clock on the wall
// there have read" as an offset, no DST table hand-rolled — Intl's formatter
// already resolves the zone's real rules for that date. Keyless; returns null
// on an unknown/invalid zone or a bad date rather than guessing 0 (UTC).
//
// Technique: format the SAME instant twice — once as UTC field values, once as
// the target zone's field values — and diff the two as if both were UTC
// instants. The difference IS the zone's offset at that moment.
export function tzOffsetMinutes(date, tz) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime()) || !tz) return null
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    const parts = {}
    for (const p of dtf.formatToParts(date)) {
      if (p.type !== 'literal') parts[p.type] = p.value
    }
    // formatToParts renders hour 24 for midnight under hourCycle:'h23' in some
    // engines — Date.UTC normalizes that (hour:24 rolls into the next day the
    // same way the wall clock would), so no special-case needed.
    const asUTC = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second)
    )
    if (!Number.isFinite(asUTC)) return null
    return Math.round((asUTC - date.getTime()) / 60000)
  } catch {
    return null
  }
}
