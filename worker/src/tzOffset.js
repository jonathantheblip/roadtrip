// tzOffset.js — WORKER MIRROR of app/src/lib/localDate.js's tzOffsetMinutes.
// Deliberately duplicated (never imported across the client/worker boundary —
// separate deployables, same house pattern as sceneHash.js/photoMatch.js), and
// a parity test gates the two so they can never quietly drift apart.
//
// The UTC offset (in minutes, positive = east of UTC) an IANA zone was AT a
// specific instant — DST-correct (Build 2, FAMILY_TRIPS_VISION §14 offset-
// inference engine): a US Eastern photo in January (-300) and one in July
// (-240) get different answers even though it's "the same zone". Keyless
// (Intl) — no DST table hand-rolled, the formatter already resolves the
// zone's real rules for that date. Returns null on an unknown/invalid zone or
// a bad date rather than guessing 0 (UTC).

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
