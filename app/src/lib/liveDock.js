// Pure helpers for the LiveDock's live "ledge" (NowBar × FamilyDock
// reconciliation). Two honest questions, no GPS and no ETA:
//   1. is the VIEWED trip live right now? (today inside its date window)
//   2. what are the "now / next" stops from the itinerary SCHEDULE?
// Schedule-derived, so it's true for everyone regardless of location — the
// live-GPS ETA upgrade (Step B) rides on top of this, it doesn't replace it.
// Pure module (no DOM, no React) → unit-tests under `node --test`.

// "Today" comes from the ONE local-calendar helper (lib/localDate.js); this
// module used to define it inline, but trips.js + the per-view default-day
// pickers derived "today" from the UTC ISO date and drifted near midnight,
// so the helper was centralized. Re-exported here so existing importers of
// `localDateIso` from liveDock keep working.
import { localDateIso } from './localDate.js'
export { localDateIso }

// Parse a stop's free-text clock label ("3:45 PM", "9:00 AM") into a local
// Date on `isoDate`. Returns null for vague labels ("Evening", "Sundown") —
// those fall to the VAGUE_HOURS heuristic below. (Kept self-contained here
// rather than importing leaveWhen.parseStopTime, which pulls in workerSync
// and would make this leaf module un-node-testable.)
function parseClockTime(timeStr, isoDate) {
  if (typeof timeStr !== 'string' || typeof isoDate !== 'string') return null
  const m = timeStr.trim().match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)$/i)
  if (!m) return null
  let h = parseInt(m[1], 10)
  const mins = m[2] ? parseInt(m[2], 10) : 0
  const ampm = m[3].toLowerCase()
  if (ampm === 'pm' && h < 12) h += 12
  if (ampm === 'am' && h === 12) h = 0
  const d = new Date(`${isoDate}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  d.setHours(h, mins, 0, 0)
  return d
}

// A trip is "live" when today falls inside [dateRangeStart, dateRangeEnd]
// inclusive. Distinct from tripPhase('during'), which also covers an upcoming
// trip — the ledge only shows while the trip is actually underway.
export function isTripLive(trip, now = new Date()) {
  const start = trip?.dateRangeStart
  const end = trip?.dateRangeEnd
  if (typeof start !== 'string' || typeof end !== 'string') return false
  const today = localDateIso(now)
  return start <= today && today <= end
}

// Vague itinerary time words → an approximate hour, used ONLY to order stops
// for the now/next split. Never displayed (the raw label like "Evening" is
// what the ledge shows) — this just keeps a clockless stop in sequence.
const VAGUE_HOURS = {
  morning: 8, breakfast: 8, 'mid-morning': 10, brunch: 11, noon: 12,
  midday: 12, lunch: 12, afternoon: 14, dinner: 19, evening: 19, sundown: 19,
  dusk: 19, sunset: 19, night: 21, 'late night': 23, late: 22,
}

// Effective Date for a stop: the parsed clock time if the label is a clock
// ("3:45 PM"), else a vague-word hour, else day-start (keeps itinerary order
// stable). Used only for ordering and the now/next boundary.
function effectiveTime(stop, isoDate) {
  const exact = parseClockTime(stop?.time, isoDate)
  if (exact) return exact
  const base = new Date(`${isoDate}T00:00:00`)
  if (Number.isNaN(base.getTime())) return null
  const key = String(stop?.time || '').trim().toLowerCase()
  const hour = VAGUE_HOURS[key]
  if (Number.isFinite(hour)) base.setHours(hour, 0, 0, 0)
  return base
}

// Honest now/next from the itinerary schedule. Spans days, so a mid-morning
// "now" is last night's lodging and "next" is today's first scheduled stop.
// Returns { nowStop, nextStop } (either may be null); each carries the raw
// itinerary stop (name + the raw `time` label + isoDate).
export function selectScheduleNowNext(trip, now = new Date()) {
  const days = Array.isArray(trip?.days) ? trip.days : []
  const seq = []
  for (const d of days) {
    const isoDate = d?.isoDate
    if (typeof isoDate !== 'string') continue
    for (const s of d.stops || []) {
      const t = effectiveTime(s, isoDate)
      if (t) seq.push({ stop: { ...s, isoDate }, ms: t.getTime() })
    }
  }
  seq.sort((a, b) => a.ms - b.ms)
  const nowMs = now.getTime()
  let nowStop = null
  let nextStop = null
  for (const e of seq) {
    if (e.ms <= nowMs) nowStop = e.stop
    else {
      nextStop = e.stop
      break
    }
  }
  return { nowStop, nextStop }
}

// The "now" line of the readout: the current stop if we have one, else the
// upcoming stop (we're en route to it). '' when neither — degrades to a bare
// Live-Map anchor.
function ledgeNow(nowStop, nextStop) {
  if (nowStop) return nowStop.name || ''
  if (nextStop) return nextStop.name || ''
  return ''
}

// The "next" line: only when there's BOTH a current and a distinct upcoming
// stop. Shows the next stop's name + its raw scheduled time LABEL (never an
// "ETA" — that word is reserved for the live-GPS upgrade). '' otherwise.
function ledgeNext(nowStop, nextStop) {
  if (!nowStop || !nextStop) return ''
  const time =
    typeof nextStop.time === 'string' && nextStop.time.trim()
      ? ` ${nextStop.time.trim()}`
      : ''
  return `${nextStop.name || ''}${time}`.trim()
}

// The full ledge model for the dock. PURE (returns data + a `cueKind` string;
// the dock renders the cue chip). Presence is system-driven — never a setting:
//   jonathan / helen → persistent live readout during a live trip
//   aurelia          → cue-only: her ledge appears ONLY on a surprise reveal
//                      (her live edge otherwise stays the inline footnote)
//   rafa             → never (his "Our trip!" tile is his anchor)
export function buildLedgeModel({
  trip,
  traveler,
  now = new Date(),
  weaveReady,
  surpriseRevealCue,
}) {
  if (!trip || trip.draft) return { mode: 'none' }
  if (traveler === 'rafa') return { mode: 'none' }
  if (!isTripLive(trip, now)) return { mode: 'none' }

  const revealed = (surpriseRevealCue || 0) > 0

  if (traveler === 'aurelia') {
    return revealed
      ? { mode: 'cue', cueKind: 'surprise-revealed' }
      : { mode: 'none' }
  }

  // jonathan, helen — persistent live ledge
  const { nowStop, nextStop } = selectScheduleNowNext(trip, now)
  const cueKind = revealed ? 'surprise-revealed' : weaveReady ? 'weave-ready' : null
  return {
    mode: 'live',
    now: ledgeNow(nowStop, nextStop),
    next: ledgeNext(nowStop, nextStop),
    cueKind,
  }
}
