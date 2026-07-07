// sessions.js — the v2 self-healing "session": the primary filing UNIT.
//
// A session is one MOMENT — a burst of a day's photos, clustered by capture-time
// gap (single-linkage on the gap, GPS-agnostic, so a no-GPS photo joins the burst
// it was taken in). Then GPS INHERITANCE: a burst happens at ONE place, so if even
// one photo in it is geotagged, the whole session inherits that location. That
// turns the sparse GPS we actually get (indoor arenas record none; the outdoor
// shot right before does) into broad coverage — one located photo anchors the
// moment. See app/docs/design/self-healing-photos/SPEC_V2_TIME_AND_EVIDENCE.md
// (Pillar 2 + the GPS-inheritance unlock).
//
// PURE + DETERMINISTIC + self-contained (own haversine, no imports) so the worker
// referee can mirror this file byte-for-byte and a parity test can gate the two.
// `at` is a monotonic instant in ms; pass a CONSISTENT clock — local wall-clock ms
// if `medianMs` will be compared to local agenda times downstream (the scorer does).

export const SESSION_DEFAULTS = {
  gapMinutes: 40, // a burst breaks after this idle gap (tighter than evidence.js's
  // 90m presence-clustering: a "moment" is finer-grained than "a continuous stay")
  inheritRadiusMeters: 250, // located members within this of their centroid → the
  // session is ONE place and inherits it; beyond → the burst moved, don't fabricate.
}

// Great-circle metres. Self-contained (mirror-safe); matches evidence.js's formula.
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

const isNum = (x) => Number.isFinite(x)
const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length

// points: [{ id, memoryId?, at (ms), lat?, lng?, author? }]  →  [session]
// A session: {
//   photoIds, memoryIds, count, startMs, endMs, medianMs,
//   located (bool: GPS inheritance succeeded), location ({lat,lng}|null),
//   locatedCount (members that actually carried GPS), gpsSpreadMeters (|null),
//   split (bool: located members disagreed > radius → the burst moved), authors[]
// }
export function buildSessions(points, opts = {}) {
  const gapMs = (opts.gapMinutes ?? SESSION_DEFAULTS.gapMinutes) * 60_000
  const pts = (Array.isArray(points) ? points : [])
    .filter((p) => p && isNum(p.at))
    .sort((a, b) => a.at - b.at || String(a.id).localeCompare(String(b.id)))
  const sessions = []
  let cur = []
  for (const p of pts) {
    if (cur.length && p.at - cur[cur.length - 1].at > gapMs) {
      sessions.push(finalize(cur, opts))
      cur = []
    }
    cur.push(p)
  }
  if (cur.length) sessions.push(finalize(cur, opts))
  return sessions
}

function finalize(members, opts) {
  const radius = opts.inheritRadiusMeters ?? SESSION_DEFAULTS.inheritRadiusMeters
  // members are already time-sorted by buildSessions.
  const located = members.filter((p) => isNum(p.lat) && isNum(p.lng))
  let location = null
  let gpsSpreadMeters = null
  let split = false
  if (located.length) {
    const centroid = { lat: avg(located.map((p) => p.lat)), lng: avg(located.map((p) => p.lng)) }
    const spread = located.reduce(
      (mx, p) => Math.max(mx, haversineMeters(centroid.lat, centroid.lng, p.lat, p.lng)),
      0
    )
    gpsSpreadMeters = Math.round(spread)
    if (spread <= radius) location = centroid // tight → the WHOLE session inherits it
    else split = true // the burst physically moved — never fabricate one location
  }
  return {
    photoIds: members.map((p) => p.id),
    memoryIds: [...new Set(members.map((p) => p.memoryId).filter(Boolean))],
    count: members.length,
    startMs: members[0].at,
    endMs: members[members.length - 1].at,
    medianMs: members[Math.floor((members.length - 1) / 2)].at,
    located: !!location,
    location,
    locatedCount: located.length,
    gpsSpreadMeters,
    split,
    authors: [...new Set(members.map((p) => p.author).filter(Boolean))],
  }
}
