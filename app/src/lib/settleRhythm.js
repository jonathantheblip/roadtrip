// The settle RHYTHM — when the evening card speaks, and about which days
// (FIX 6, 2026-07-06; Jonathan's settled pick: quiet days POOL — VISION §2.2).
//
// The ask-economy is one initiation a day, and fewer on the weeks that need
// less: a RICH day (named entries, or rich photo evidence) keeps its evening
// card exactly as shipped; a QUIET day gets NO nightly card — quiet days
// accumulate, and once two or more are pending the card offers them together
// ("the last two days — quiet ones? keep them both"). A single quiet day
// surfaces only when it's the trip's last day (the trip is about to close) or
// when a rich day's card is showing anyway (it rides that card as a quiet
// line, never its own ask).
//
// Pure functions only — no I/O, no React (dayRecord.js's discipline). The
// component computes the inputs (evening, kept, evidence) with the muscles it
// already has; the table lives here so it is unit-testable as a table.

import { buildDayEvidence, evidenceLevel } from './evidence.js'
import { namedRecordEntries, dayRecordIsKept } from './dayRecord.js'
import { localDateIso } from './localDate.js'
import { isMaskedFrom } from './surprises.js'

// ISO date + n days, in UTC (no local-TZ drift) — LivingHeartHome's isoPlus1,
// generalized. Returns null on a malformed input.
export function isoPlusDays(iso, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  if (!m) return null
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]) + n * 86400000).toISOString().slice(0, 10)
}

// How many photos a day carries AT ALL (located or not) — the same memory-level
// count the card's todayCount reads, attributed to the LEG-LOCAL day by capture
// instant (capturedAt, else createdAt). Viewer-masked like photosForDay: an
// unrevealed surprise must not make a day look full to the person it hides from.
export function dayPhotoCount(memories, isoDate, { tz, viewer } = {}) {
  if (!Array.isArray(memories) || !isoDate) return 0
  let n = 0
  for (const m of memories) {
    if (!m || m.kind !== 'photo') continue
    if (viewer && isMaskedFrom(m, viewer)) continue
    const iso = m.capturedAt || m.createdAt
    if (!iso) continue
    const at = Date.parse(iso)
    if (Number.isFinite(at) && localDateIso(new Date(at), tz) === isoDate) n++
  }
  return n
}

// Is this calendar day QUIET for the viewer? Quiet = not kept, nothing named on
// its record, and THIN evidence (the same gate the live card uses). A rich but
// un-kept past day is NOT quiet — it stays "Still loose" (the unfold's dashed
// ring) and is never swept into a pooled nothing-verdict. `day` may be null (a
// hangout date the trip never wrote): no record, so quiet iff no evidence.
export function isQuietDay(day, memories, isoDate, { tz, viewer } = {}) {
  if (day && dayRecordIsKept(day)) return false
  if (day && namedRecordEntries(day).length > 0) return false
  const ev = buildDayEvidence(memories, isoDate, { tz, viewer })
  const photoCount = Math.max(ev.locatedCount, dayPhotoCount(memories, isoDate, { tz, viewer }))
  return evidenceLevel({ pinCount: ev.pins.length, photoCount }) === 'thin'
}

// The PAST quiet days still pending a keep: every date from the trip's start up
// to (not including) today that is un-kept and quiet, ascending. These are what
// pool. Capped defensively so a corrupt date range can't spin.
export function quietPendingIsos(trip, memories, todayIso, { tz, viewer } = {}) {
  const start = (trip?.dateRangeStart || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !todayIso || start >= todayIso) return []
  const days = trip?.data?.days || trip?.days || []
  const byIso = new Map()
  for (const d of days) if (d?.isoDate) byIso.set(d.isoDate, d)
  const out = []
  let iso = start
  for (let i = 0; i < 62 && iso && iso < todayIso; i++) {
    if (isQuietDay(byIso.get(iso) || null, memories, iso, { tz, viewer })) out.push(iso)
    iso = isoPlusDays(iso, 1)
  }
  return out
}

// The state table. Inputs are booleans the component already derives; the
// output drives the card slot:
//   null                      — no card (incl. THE new silence: a lone quiet
//                               evening mid-trip no longer asks)
//   { kind:'kept', rider }    — the gold confirmation (any hour), carrying any
//                               pending quiet isos as its rider line — the
//                               card is showing anyway, and without it a keep
//                               on the trip's last evening would strand them
//   { kind:'keep', rider }    — the rich day's card; `rider` = past quiet isos
//                               that may ride it as a quiet extra line
//   { kind:'pool', isos }     — 2+ quiet days offered together, one tap
//   { kind:'nothing' }        — the single nothing-day tap, last day only
// Order matters: kept beats everything (a settled card is never crowded by a
// second ask — the rider is a line, not an ask); nothing initiates before
// evening except the kept confirmation.
export function settleRhythm({ live, todayKept, isEvening, todayRich, isLastDay, todayIso, pendingQuiet = [] } = {}) {
  if (!live) return null
  if (todayKept) return { kind: 'kept', rider: pendingQuiet }
  if (!isEvening) return null
  if (todayRich) return { kind: 'keep', rider: pendingQuiet }
  const pool = [...pendingQuiet, todayIso].filter(Boolean)
  if (pool.length >= 2) return { kind: 'pool', isos: pool }
  if (isLastDay) return { kind: 'nothing' }
  return null
}

// Are the pooled days one unbroken run ending today? Gates the warmer "the
// last two days" phrasing — copy may only claim "last" when it's literally
// true (G6); a gapped pool falls back to a count.
export function poolIsContiguous(isos = []) {
  for (let i = 1; i < isos.length; i++) {
    if (isoPlusDays(isos[i - 1], 1) !== isos[i]) return false
  }
  return isos.length > 0
}
