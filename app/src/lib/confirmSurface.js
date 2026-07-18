// confirmSurface.js — the S1 confirm card's two pure client-local seams, shared
// by BOTH doors (the home-index card + the evening-settle rider) so each
// independently computes the SAME question for the same viewer on the same day,
// with no coordination code and no server round-trip for the daily gate.
//
//   • pickConfirmOfDay(decisions, localDateIso) → decision | null
//       deterministic day-of-year rotation over the ASKABLE (confirm-tier) rows
//       the projection returned. Answered moments are already excluded upstream
//       by /heal-decisions (the projection's undecided-only filter), and the
//       rows are already per-viewer masked — this adds ZERO masking.
//   • confirmBudgetSpentToday / spendConfirmBudget
//       one localStorage date key ('heal.confirm.lastHandled'), written the
//       instant either door takes a terminal action; both doors gate render on
//       !confirmBudgetSpentToday(today). One question a day, across both doors.
//
// Pure: no fetch, no React — node-testable. Storage is injectable (defaults to
// globalThis.localStorage) so it degrades to a no-op off-browser.

import { evidenceKeyOf } from './confirmCopy.js'
import { implicitBaseIdForDay, tripImplicitBase, isHomeDay, isImplicitBaseId } from './photoMatch.js'

export const CONFIRM_BUDGET_KEY = 'heal.confirm.lastHandled'

// Same deterministic rotation resurface.js uses ("Looking back"), so the confirm
// card and the resurface card rotate on the same clock — 1..366 within a year.
function dayOfYear(iso) {
  const d = new Date(iso + 'T00:00:00')
  const start = new Date(d.getFullYear(), 0, 0)
  return Math.floor((d - start) / 86400000)
}

const todayIso = () => new Date().toISOString().slice(0, 10)

// Which question variant a decision asks (ONE per moment — never compound; the
// other dimension waits for its own day). Priority:
//   B — a vision-read NAME with no real place ("we're calling this …").
//   C — the place is known but the DAY is upload-time-only (timeAnchorSuspect) →
//       "was this around {time}, {day}?". Gated on a reference-anchored place
//       (evidence gps/record) so we only ask "when" once we're sure "where".
//   D — the burst's cohesion is borderline → a grouping question.
//   A — the default place confirm.
// Thresholds are TUNABLE and validated against the real A/B/C/D distribution in
// the shadow review (Jonathan's 2026-07-13 all-four call).
export const LOW_COHESION = 0.5
export function confirmKindOf(decision) {
  const pid = String(decision?.placeId || '')
  const sig = decision?.signals || {}
  if (pid.startsWith('__vision__')) return 'B'
  if (sig.timeAnchorSuspect && (sig.evidence === 'gps' || sig.evidence === 'record')) return 'C'
  if (typeof sig.cohesion === 'number' && sig.cohesion < LOW_COHESION) return 'D'
  return 'A'
}

// Deterministic within the local day, stable regardless of the server's row
// order (so both doors agree). Askable = tier 'confirm' with a real moment
// (auto files silently; leave isn't a question). null when nothing is askable.
export function pickConfirmOfDay(decisions, localDateIso) {
  const today = localDateIso || todayIso()
  const candidates = (decisions || []).filter(
    (d) => d && d.tier === 'confirm' && Array.isArray(d.memoryIds) && d.memoryIds.length
  )
  if (!candidates.length) return null
  candidates.sort(
    (a, b) =>
      String(a.isoDate).localeCompare(String(b.isoDate)) ||
      String(a.memoryIds[0]).localeCompare(String(b.memoryIds[0]))
  )
  return candidates[dayOfYear(today) % candidates.length]
}

function resolveStorage(storage) {
  if (storage) return storage
  try {
    return typeof globalThis !== 'undefined' && globalThis.localStorage ? globalThis.localStorage : null
  } catch {
    return null
  }
}

// True once EITHER door has taken a terminal action today (confirm / correct /
// skip / set-aside). Off-browser or on a storage error → false (never blocks).
export function confirmBudgetSpentToday(localDateIso, storage) {
  const s = resolveStorage(storage)
  if (!s) return false
  try {
    return s.getItem(CONFIRM_BUDGET_KEY) === (localDateIso || todayIso())
  } catch {
    return false
  }
}

// Marks today's budget spent. Called on any terminal action in either door.
export function spendConfirmBudget(localDateIso, storage) {
  const s = resolveStorage(storage)
  if (!s) return
  try {
    s.setItem(CONFIRM_BUDGET_KEY, localDateIso || todayIso())
  } catch {
    /* private-mode / quota — the gate just doesn't persist; harmless */
  }
}

// Map a projected /heal-decisions row → the card's `moment` view-model (the DISPLAY
// fields). The host supplies `thumbs` (real photo urls from the row's masked refs)
// and `alts` (the day's plan alternates, MoveSheet's targets) since those need the
// photo store + trip plan. `signal` drives the §3 evidence line; null → no line
// (fail-closed). Pure + node-testable.
//
// The {moment} descriptor (Jonathan's 2026-07-13 call: "generate a REAL label").
// The engine now computes it — `signals.momentDescriptor`, the moment's dominant
// vision name normalized to the noun-phrase slot (sessionHeal.momentDescriptorForm),
// projected through the nameHidden gate. Preference: engine descriptor → the
// vision name → a neutral 'this one' (only when vision labeled nothing).
export function momentFromDecision(decision, extra = {}) {
  if (!decision) return null
  const { thumbs = [], alts = [], descriptor = '', dayPart = '', time = '', day = '', base = '' } = extra
  const place = decision.placeName || ''
  const kind = confirmKindOf(decision)
  const sig = decision.signals || {}
  const visionName = typeof sig.visionName === 'string' ? sig.visionName : ''
  const md = typeof sig.momentDescriptor === 'string' ? sig.momentDescriptor : '' // the engine's real label (2026-07-13 call)
  return {
    kind,
    n: decision.photoCount || (Array.isArray(decision.memoryIds) ? decision.memoryIds.length : 0),
    place,
    name: kind === 'B' ? place || visionName : place, // kind B: the vision name IS the label
    moment: descriptor || md || visionName || 'this one', // the engine descriptor, then vision name, then fallback
    part: dayPart || 'day',
    time,
    day,
    base,
    signal: evidenceKeyOf(decision.signals),
    thumbs,
    alts,
    memoryIds: Array.isArray(decision.memoryIds) ? decision.memoryIds : [],
    isoDate: decision.isoDate || '',
    placeId: decision.placeId || null,
  }
}

// A stop id we can actually FILE at — a real stop / record / base id, not a
// synthetic vision/discovered MOMENT id (those confirm a NAME, not a filing).
export function isFilablePlace(placeId) {
  return typeof placeId === 'string' && !!placeId &&
    !placeId.startsWith('__vision__') && !placeId.startsWith('__discovered__')
}

// The concrete stop filings a terminal card action implies — what makes "on the
// record" TRUE. Pure: returns [{ memoryId, stopId, prov }]; the host applies each
// via updateMemoryStop (which mirrors + the worker LOCKS it against any later
// sweep, source:'confirmed' = D13). Only a place-CONFIRM or an alternate-PICK
// files a real stop; a name / time / free-text / grouping answer records feedback
// + re-heals but files no stop here (handled by the re-heal / matcher).
// The 2-3 place alternates for the "Not quite" PLACE sheet: the moment's day's
// plan stops + the base, excluding the rejected guess. The BASE alt is offered
// ONLY when the album can actually RENDER a base filing for this day — the SAME
// gate groupByStop/buildMoveTargets use (photoEntries.js): a real implicit base
// (tripImplicitBase — a geocoded stay, no planned base stop) AND not a home day.
// Offering it more loosely would file the photo to a __trip_base__ id the album
// never registers → orphaned to "Unfiled", strictly worse than not offering it
// (flip-blocker #5). Uses tripImplicitBase's own label so the name matches the
// album section. Pure; exported for a direct unit test.
export function dayAlternates(trip, isoDate, guessedPlaceId) {
  const out = []
  const day = (trip?.days || []).find((d) => d.isoDate === isoDate)
  for (const s of day?.stops || []) {
    const label = s?.name || s?.title
    if (!s?.id || s.id === guessedPlaceId || !label) continue
    out.push({ id: s.id, label, why: 'PLAN' })
    if (out.length >= 2) break
  }
  const baseTpl = tripImplicitBase(trip)
  if (baseTpl && day && !isHomeDay(day) && out.length < 3) {
    out.push({ id: implicitBaseIdForDay(isoDate), label: baseTpl.name, why: 'BASE' })
  }
  return out.slice(0, 3)
}

export function confirmFilings(moment, outcome, payload, by) {
  if (!moment || !Array.isArray(moment.memoryIds) || !moment.memoryIds.length) return []
  let stopId = null
  if (outcome === 'confirmed') stopId = moment.placeId
  else if (outcome === 'picked') stopId = payload && payload.id
  if (!isFilablePlace(stopId)) return []
  const prov = { source: 'confirmed', by: by || null }
  return moment.memoryIds.map((memoryId) => ({ memoryId, stopId, prov }))
}

// Level 2 (D13): the reference-tier coords a REAL-stop confirm propagates. A
// family CONFIRM of a real, geocoded day stop is a human-affirmed location, so
// its coords are stamped onto the photos (prov.gps 'confirmed', reference-tier —
// see PROV_GPS_VALUES / the 6 REFERENCE_GPS_PROV sets) and momentGpsPropagation
// carries them to unlocated moment-mates. Returns {lat,lng}, or null when there
// are NO reference coords to propagate: a synthetic/name id, the BASE (never a
// reference-tier location — the evidence constitution, evidenceAudit.js), a
// record target (not a geocoded day stop), or an un-geocoded stop. Pure.
export function confirmedStopCoords(trip, stopId) {
  if (!isFilablePlace(stopId) || isImplicitBaseId(stopId)) return null
  for (const day of trip?.days || []) {
    for (const s of day?.stops || []) {
      if (s?.id === stopId && Number.isFinite(s?.lat) && Number.isFinite(s?.lng)) {
        return { lat: s.lat, lng: s.lng }
      }
    }
  }
  return null // record target / un-geocoded stop → nothing to propagate
}

// The photo ref keys of a memory (single photoRef and/or a photoRefs array) —
// the units applyRefGps stamps coords onto. Pure.
export function refKeysOfMemory(m) {
  const keys = []
  if (m?.photoRef?.key) keys.push(m.photoRef.key)
  for (const r of Array.isArray(m?.photoRefs) ? m.photoRefs : []) if (r?.key) keys.push(r.key)
  return keys
}
