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
import { detectCurrentPlace, isStayTrip, stayLabel } from './tripShape.js'
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

// Days of slack around the itinerary span. A full week — comfortably beyond the
// launch's ±4-day grace and beyond any legit just-ended / about-to-start trip
// (whose stops may cluster away from the window edges, or whose last day has no
// stops) — so those never wrongly read as "not live," while a weeks-stale
// itinerary (the failure this cross-check exists to catch) still does.
const ITIN_GRACE_DAYS = 7

// Shift a 'YYYY-MM-DD' string by n local days. Self-contained (no localDate
// dep) so this module stays a node-testable leaf.
function addDaysIso(iso, n) {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  d.setDate(d.getDate() + n)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// The trip's ACTUAL itinerary span from its day rows: { min, max } ISO dates,
// or null when no day carries a usable isoDate (a dateless/skeleton trip).
export function itinerarySpan(trip) {
  const days = Array.isArray(trip?.days) ? trip.days : []
  let min = null
  let max = null
  for (const d of days) {
    const iso = d?.isoDate
    if (typeof iso !== 'string' || !iso) continue
    if (min === null || iso < min) min = iso
    if (max === null || iso > max) max = iso
  }
  return min && max ? { min, max } : null
}

// Does the trip's real itinerary sit near `today` (± a few days of grace)?
// This is the guard that stops a trip whose stored dateRange is wrong/stale from
// faking "live now": its stops all sit weeks in the past, so the span excludes
// today and it can never light the live rail or hijack the launch landing.
// A trip with no itinerary dates returns true — we can't disprove it, so we
// defer to the stored date window rather than wrongly killing a skeleton trip.
export function itineraryNearToday(trip, todayIso, grace = ITIN_GRACE_DAYS) {
  const span = itinerarySpan(trip)
  if (!span) return true
  return addDaysIso(span.min, -grace) <= todayIso && todayIso <= addDaysIso(span.max, grace)
}

// A trip is "live" when today falls inside [dateRangeStart, dateRangeEnd]
// inclusive AND its real itinerary actually sits near today (so a stale/wrong
// stored window can't fake it), and it isn't archived. Distinct from
// tripPhase('during'), which also covers an upcoming trip — the ledge only
// shows while the trip is actually underway.
export function isTripLive(trip, now = new Date()) {
  if (!trip || trip.archivedAt) return false
  const start = trip.dateRangeStart
  const end = trip.dateRangeEnd
  if (typeof start !== 'string' || typeof end !== 'string') return false
  const today = localDateIso(now)
  if (!(start <= today && today <= end)) return false
  return itineraryNearToday(trip, today)
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
  let passedCount = 0
  for (const e of seq) {
    if (e.ms <= nowMs) {
      nowStop = e.stop
      passedCount += 1
    } else {
      nextStop = e.stop
      break
    }
  }
  // passedCount/totalCount let a surface show honest "X of N done" progress from
  // the clock (the Live Map) instead of a manual checkbox nobody taps.
  return { nowStop, nextStop, passedCount, totalCount: seq.length }
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

// A timed stop counts as "now" only WITHIN a bounded window — from its start
// until the next stop, capped at MAX_NOW_WINDOW_MS — so a passed stop stops
// reading as "now" once its moment is over. This is the fix for the cabin-stay
// mishmash where a 10am brunch still read as "now" at 3pm. Used only on a STAY;
// a route keeps the schedule's plain most-recent-passed "now" (G5).
const MAX_NOW_WINDOW_MS = 2.5 * 60 * 60 * 1000
function withinNowWindow(nowStop, nextStop, now) {
  if (!nowStop) return false
  const start = effectiveTime(nowStop, nowStop.isoDate)
  if (!start) return false
  let end = start.getTime() + MAX_NOW_WINDOW_MS
  const nextT = nextStop ? effectiveTime(nextStop, nextStop.isoDate) : null
  if (nextT && nextT.getTime() < end) end = nextT.getTime()
  const ms = now.getTime()
  return ms >= start.getTime() && ms < end
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
  position = null,
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
  // A "now" stop from a PRIOR calendar day — last night's lodging, before
  // today's first scheduled stop — reads as stuck ("now: Beach Bungalow" all
  // morning). So only a stop that's actually TODAY counts as "now"; in the
  // morning the ledge leads with today's next stop instead of pinning to last
  // night.
  const today = localDateIso(now)
  const effectiveNow = nowStop && nowStop.isoDate === today ? nowStop : null
  const cueKind = revealed ? 'surprise-revealed' : weaveReady ? 'weave-ready' : null

  // PLACE-AWARE (family-trips recenter, FAMILY_TRIPS_VISION §5). On a STAY the
  // place is the home the day hangs off — not a stale timed stop. Most-certain
  // first:
  //   1. GPS confirms we're AT the place        → "At [place]" (atPlace).
  //   2. a timed stop is genuinely happening NOW → that stop (windowed).
  //   3. otherwise the place IS the baseline: with no fix we lead with it (the
  //      best guess — the design leads with the place; refined later by the
  //      "we're here/out" tap + shared location); with a fix that puts us
  //      elsewhere we don't claim it, we lead with what's next.
  // A ROUTE trip skips all of this and keeps the exact clock readout (G5).
  const here = detectCurrentPlace(trip, position)
  if (here) {
    const upcoming = nextStop && nextStop.isoDate === today ? nextStop : null
    return {
      mode: 'live',
      now: `At ${here.name}`,
      next: upcoming ? ledgeNext({ isoDate: today }, upcoming) : '',
      cueKind,
      atPlace: true,
    }
  }

  if (isStayTrip(trip)) {
    // A timed stop counts as "now" only while it's actually happening — the fix
    // for "now: Brunch" reading all afternoon on the cabin stay.
    const inEvent = withinNowWindow(effectiveNow, nextStop, now) ? effectiveNow : null
    if (inEvent) {
      return { mode: 'live', now: ledgeNow(inEvent, nextStop), next: ledgeNext(inEvent, nextStop), cueKind }
    }
    // No active event. A fix that ISN'T at the place means we know we're out —
    // lead with what's next, don't claim the place. With no fix the place is the
    // honest default on a stay (the design leads with it).
    const knownAway = !!position
    if (!knownAway) {
      const upcoming = nextStop && nextStop.isoDate === today ? nextStop : null
      return {
        mode: 'live',
        now: `At ${stayLabel(trip)}`,
        next: upcoming ? ledgeNext({ isoDate: today }, upcoming) : '',
        cueKind,
        placeGuess: true,
      }
    }
    return { mode: 'live', now: ledgeNow(null, nextStop), next: '', cueKind }
  }

  return {
    mode: 'live',
    now: ledgeNow(effectiveNow, nextStop),
    next: ledgeNext(effectiveNow, nextStop),
    cueKind,
  }
}
