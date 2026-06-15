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
// the app's YYYY-MM-DD trip dates and day labels.
export function localDateIso(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Convenience: today's local calendar date as YYYY-MM-DD.
export function todayLocalIso() {
  return localDateIso(new Date())
}
