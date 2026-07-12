// worker/src/photoHealRunner.js — the WORKER-SIDE orchestration that runs the
// pure heal engine (photoHeal.js) against real D1 data (self-healing-photos
// SPEC §5 D). Deliberately thin: every DECISION is the pure engine's; this is
// the I/O shell — load a trip + its memories, project the engine context, and —
// gated by the PHOTO_HEAL_MODE knob — persist the outcome.
//
// THE KNOB: env.PHOTO_HEAL_MODE ∈ off | shadow | on (WEAVE_MODEL precedent —
// changeable without a code deploy). Default OFF when unset. NEVER auto-flipped
// to `on`: the matcher computes and, in shadow, writes a would-move ledger for
// Jonathan to review; flipping to actually-move-photos is his call after that
// review (SPEC §5 D enable order).
//   • off    → no-op (the triggers early-return).
//   • shadow → compute; write the memory_stop_moves would-move ledger only
//              (deduped); apply NOTHING (memories.stop_id untouched).
//   • on     → apply each accepted move with a guarded UPDATE + the ledger,
//              looping to DB quiescence. Dormant until enabled.
//
// SCOPE NOTE (D2b): the target set is agenda stops + the trip's implicit base +
// NAMED settle-sheet moments (the RECORD BRIDGE, SPEC §5 D — now LIVE). Those
// moments join buildDayIndex's allStops via dayStopIds.recordEntryTargets, so a
// hangout day named only in the settle sheet heals a nearby photo to the NAMED
// pin, not just the base. A record target is a specific (non-base) GPS candidate
// (never a no-GPS time-only default); its id is date-scoped (`__record__:<iso>:
// <entryId>`); stopExists resolves it (it's in allStops) and labelForStop
// snapshots its name for the ledger + moved-note.

import { healMemories, buildDayIndex } from './photoHeal.js'
import { isStopSurprise } from './surprises.js'
import { isImplicitBaseId, isRecordTargetId, parseRecordTargetId } from './dayStopIds.js'
import { buildTripDecisions } from './sessionHeal.js'
import { backfillSceneSignatures } from './sceneBackfill.js'
import { backfillVisionLabels } from './visionBackfill.js'
import { backfillProvenanceTags } from './provenanceBackfill.js'
import { backfillTripTimezones, photoTzMode } from './tripTzBackfill.js'
import { backfillWeather } from './weatherBackfill.js'
import { backfillOffsetInference, photoOffsetMode } from './offsetInference.js'
import { backfillStopGeocodes, photoStopGeocodeMode } from './stopGeocodeBackfill.js'
import { nameDiscoveredPlaces, buildPlaceTypeIndex } from './discoveredPlaceNamer.js'
import { resolveLandmarkPins, buildSignageIndex } from './landmarkSearch.js'
import { propagateMomentGps, photoGpsPropagationMode } from './momentGpsPropagation.js'

const MODES = new Set(['off', 'shadow', 'on'])

// Read the knob, defaulting off. Any unrecognized value is treated as off (fail
// safe — an unset/typo'd secret must never accidentally move a family's photos).
export function photoHealMode(env) {
  const raw = typeof env?.PHOTO_HEAL_MODE === 'string' ? env.PHOTO_HEAL_MODE.trim() : ''
  return MODES.has(raw) ? raw : 'off'
}

// Direction-flip cooldown: a memory moved within this window of `now` is not
// re-moved, so a lodging clear-then-retype (or an oscillating agenda edit) can't
// mass-scatter filings in the gap (SPEC §5 D convergence, appendix critique-0 #5).
const COOLDOWN_MS = 10 * 60 * 1000

// Shape a raw D1 memory row into the MINIMAL object the pure engine consumes.
// Self-contained on purpose (does not call rowToMemory, which also builds R2
// URLs + masking fields the engine has no use for). `storedUpdatedAt` is the raw
// epoch stamp the guarded apply UPDATE compares against (OCC).
export function rowToHealMemory(r) {
  let photos = []
  let stopProv = null
  let hideFrom
  if (r.photo_r2_keys_json) {
    try {
      const arr = JSON.parse(r.photo_r2_keys_json)
      photos = arr
        .filter((a) => a && a.key && a.kind !== 'note' && a.kind !== 'voice')
        .map((a) => ({
          id: a.key,
          lat: Number.isFinite(a.lat) ? a.lat : undefined,
          lng: Number.isFinite(a.lng) ? a.lng : undefined,
          capturedAt: typeof a.capturedAt === 'string' ? a.capturedAt : undefined,
          // Capture-time offset (mig-less; rides photo_r2_keys_json) so the worker
          // matcher files by LOCAL wall-clock time, matching the client import.
          offsetMinutes: Number.isFinite(a.offsetMinutes) ? a.offsetMinutes : undefined,
        }))
    } catch {}
  }
  if (r.stop_prov_json) { try { stopProv = JSON.parse(r.stop_prov_json) } catch {} }
  if (r.hide_from_json) { try { hideFrom = JSON.parse(r.hide_from_json) } catch {} }
  return {
    id: r.id,
    stopId: r.stop_id || null,
    stopProv,
    photos,
    ...(Array.isArray(hideFrom) && hideFrom.length ? { hideFrom } : {}),
    revealed: r.revealed_at || undefined,
    storedUpdatedAt: r.updated_at,
  }
}

// A stop id → human label, snapshotted at DECISION time for the ledger + the
// moved-note (an orphan move's old stop may no longer resolve later, so we can't
// look it up at render time — SPEC §4). Agenda stops carry a name/title; an
// implicit-base id labels as the day's base place.
export function labelForStop(trip, dayIndex, stopId) {
  if (!stopId) return null
  for (const day of trip?.days || []) {
    for (const s of day?.stops || []) {
      if (s.id === stopId) return (s.name || s.title || '').trim() || null
    }
  }
  if (isImplicitBaseId(stopId)) {
    const iso = stopId.split(':')[1]
    const base = dayIndex.get(iso)?.allStops?.find((s) => s.id === stopId)
    return (base?.name || '').trim() || 'the place we stayed'
  }
  // A bridged record moment (record bridge, §5 D): its human name is snapshotted
  // from the day index's synthetic target (dayStopIds.recordEntryTargets).
  if (isRecordTargetId(stopId)) {
    const parsed = parseRecordTargetId(stopId)
    const rt = parsed && dayIndex.get(parsed.isoDate)?.allStops?.find((s) => s.id === stopId)
    return (rt?.name || '').trim() || null
  }
  return null
}

// Build the engine context for a trip: dayIndex, tripRev (server row stamp),
// stopExists (any agenda stop or implicit-base id the day index knows),
// isSurpriseStop (an unrevealed-surprise stop → gate 6), inCooldown (from the
// ledger's recent moves), evidenceFresh (per-memory set from the trigger), now.
function buildHealCtx(trip, tripRev, dayIndex, { freshSet, recentMoveAt, now }) {
  const validIds = new Set()
  for (const entry of dayIndex.values()) for (const s of entry.allStops) validIds.add(s.id)
  const surpriseIds = new Set()
  for (const day of trip?.days || []) {
    for (const s of day?.stops || []) {
      if (isStopSurprise(s) && !s.surprise.revealed) surpriseIds.add(s.id)
    }
  }
  return {
    dayIndex,
    tripRev,
    now,
    stopExists: (id) => validIds.has(id),
    isSurpriseStop: (id) => surpriseIds.has(id),
    inCooldown: (memId) => {
      const at = recentMoveAt.get(memId)
      return Number.isFinite(at) && now - at < COOLDOWN_MS
    },
    evidenceFresh: freshSet ? (id) => freshSet.has(id) : false,
  }
}

// The most-recent ledger move time per memory, but ONLY within the cooldown
// window — a small, bounded query (no IN-clause over every memory id, so no D1
// parameter-limit risk), filtered to this trip's memories in JS.
async function loadRecentMoveTimes(env, memoryIds, now) {
  const out = new Map()
  const ids = new Set(memoryIds)
  const { results } = await env.DB.prepare(
    'SELECT memory_id, MAX(at) AS last_at FROM memory_stop_moves WHERE at > ? GROUP BY memory_id'
  ).bind(now - COOLDOWN_MS).all()
  for (const r of results || []) if (ids.has(r.memory_id)) out.set(r.memory_id, r.last_at)
  return out
}

// Append one memory_stop_moves ledger row (migration 017 shape). `entry` carries
// the snapshotted labels; the prov supplies source/by/at.
async function appendLedgerRow(env, entry, now) {
  const p = entry.prov || {}
  await env.DB.prepare(
    `INSERT INTO memory_stop_moves
       (memory_id, from_stop, to_stop, from_label, to_label, source, reason, trip_rev, by, at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    entry.memoryId, entry.from, entry.to, entry.fromLabel, entry.toLabel,
    p.source || 'auto', entry.reason, entry.tripRev, p.by || 'matcher', p.at ?? now
  ).run()
}

// Load the trip + its live memories and DECIDE every one (via healMemories in
// its 'shadow' apply-mode = "compute the moves, mutate nothing"). Returns the
// bundle { trip, tripRev, dayIndex, rows, moves, suggestions } or null (no trip).
export async function loadAndDecide(env, tripId, { evidenceFreshIds, now, cooldownEnabled }) {
  const tripRow = await env.DB.prepare(
    'SELECT data_json, updated_at FROM trips WHERE id = ? AND deleted_at IS NULL'
  ).bind(tripId).first()
  if (!tripRow) return null
  let trip
  try { trip = JSON.parse(tripRow.data_json) } catch { return null }
  const tripRev = tripRow.updated_at
  const dayIndex = buildDayIndex(trip)

  const { results: rows } = await env.DB.prepare(
    'SELECT * FROM memories WHERE trip_id = ? AND deleted_at IS NULL'
  ).bind(tripId).all()
  if (!rows || !rows.length) return { trip, tripRev, dayIndex, rows: [], moves: [], suggestions: [] }

  // The direction-flip cooldown only guards APPLIED filings from oscillating, so
  // it is ON-mode only. In shadow NOTHING is filed — applying the cooldown there
  // would suppress genuinely-different would-moves and under-report the matcher
  // during the very window whose purpose is to reveal it (review minor). So
  // shadow skips the cooldown query entirely and logs every distinct would-move.
  const recentMoveAt = cooldownEnabled
    ? await loadRecentMoveTimes(env, rows.map((r) => r.id), now)
    : new Map()
  const freshSet = Array.isArray(evidenceFreshIds) ? new Set(evidenceFreshIds)
    : evidenceFreshIds instanceof Set ? evidenceFreshIds : null
  const ctx = buildHealCtx(trip, tripRev, dayIndex, { freshSet, recentMoveAt, now })
  const memories = rows.map(rowToHealMemory)
  // 'shadow' here means DECIDE-ONLY (the pure engine computes moves without
  // mutating its copy); we persist based on the KNOB below, not this argument.
  const { moves, suggestions } = healMemories(memories, ctx, 'shadow')
  return { trip, tripRev, dayIndex, rows, moves, suggestions }
}

// SHADOW: write each would-move to the ledger, DEDUPED — skip if the latest
// ledger row for this memory already records this exact (from,to) would-move. In
// shadow the memory's stop_id never changes, so the same would-move recomputes
// on every trigger; without dedup the ledger would spam a row each time.
async function writeShadowLedger(env, bundle, now) {
  let written = 0
  for (const mv of bundle.moves) {
    const from = mv.fromStopId ?? null
    const to = mv.toStopId ?? null
    const last = await env.DB.prepare(
      'SELECT from_stop, to_stop FROM memory_stop_moves WHERE memory_id = ? ORDER BY id DESC LIMIT 1'
    ).bind(mv.memoryId).first()
    if (last && (last.from_stop ?? null) === from && (last.to_stop ?? null) === to) continue
    await appendLedgerRow(env, {
      memoryId: mv.memoryId, from, to,
      fromLabel: labelForStop(bundle.trip, bundle.dayIndex, mv.fromStopId),
      toLabel: labelForStop(bundle.trip, bundle.dayIndex, mv.toStopId),
      reason: mv.reason, tripRev: bundle.tripRev, prov: mv.prov,
    }, now)
    written++
  }
  return written
}

// ON: apply one accepted move with a GUARDED UPDATE (compares the stored
// updated_at — an OCC guard so a concurrent memory edit can't be clobbered) that
// also skips a row deleted meanwhile, then appends the ledger row. Returns
// whether it actually applied.
async function applyMove(env, bundle, mv, row, now) {
  const fromLabel = labelForStop(bundle.trip, bundle.dayIndex, mv.fromStopId)
  const toLabel = labelForStop(bundle.trip, bundle.dayIndex, mv.toStopId)
  const prov = {
    ...mv.prov,
    ...(fromLabel ? { movedFromLabel: fromLabel } : {}),
    ...(toLabel ? { targetLabel: toLabel } : {}),
  }
  // updated_at is MONOTONIC — MAX(now, stored+1), mirroring the postMemory upsert
  // invariant (index.js). A bare `= now` could REGRESS the stamp under a clock
  // skew / the MAX+1 ratchet, and because pulls are a `updated_at > since` delta,
  // a backward stamp would make the move silently never propagate cross-device
  // (SPEC §1: no move may be invisible). OCC guard (WHERE updated_at = stored)
  // unchanged.
  const upd = await env.DB.prepare(
    `UPDATE memories SET stop_id = ?, stop_prov_json = ?, updated_at = MAX(?, updated_at + 1)
     WHERE id = ? AND updated_at = ? AND deleted_at IS NULL`
  ).bind(mv.toStopId, JSON.stringify(prov), now, mv.memoryId, row.updated_at).run()
  if ((upd?.meta?.changes ?? 0) > 0) {
    await appendLedgerRow(env, {
      memoryId: mv.memoryId, from: mv.fromStopId ?? null, to: mv.toStopId ?? null,
      fromLabel, toLabel, reason: mv.reason, tripRev: bundle.tripRev, prov,
    }, now)
    return true
  }
  return false
}

// Run the heal for ONE trip. Loads, decides, and persists per the knob.
// `evidenceFreshIds` (array|Set) marks the memories whose photo evidence just
// changed (import / GPS-backfill / capturedAt edit) — passed ONLY on the first
// pass, so gate 5 lets a stamp-stable evidence re-file through for exactly those.
export async function runHealForTrip(env, tripId, { mode, evidenceFreshIds, now = Date.now() } = {}) {
  const activeMode = mode || photoHealMode(env)
  if (activeMode === 'off') return { skipped: 'off' }

  const first = await loadAndDecide(env, tripId, { evidenceFreshIds, now, cooldownEnabled: activeMode === 'on' })
  if (!first) return { skipped: 'no-trip' }
  if (!first.moves.length) {
    return { mode: activeMode, tripRev: first.tripRev, moves: 0, suggestions: first.suggestions.length }
  }

  if (activeMode === 'shadow') {
    const ledgerWritten = await writeShadowLedger(env, first, now)
    return { mode: 'shadow', tripRev: first.tripRev, moves: first.moves.length, ledgerWritten }
  }

  // mode === 'on' — DORMANT until Jonathan enables it. Apply + quiesce-loop
  // against the DB: re-load after applying, because a concurrent trip edit or
  // this round's own moves change the picture (SPEC §5 D convergence). Fresh
  // evidence only applies to the first pass; later rounds re-evaluate plainly.
  let applied = 0
  let rounds = 0
  let cur = first
  while (cur && cur.moves.length && rounds < 5) {
    rounds++
    const rowById = new Map(cur.rows.map((r) => [r.id, r]))
    for (const mv of cur.moves) {
      const row = rowById.get(mv.memoryId)
      if (!row || row.deleted_at) continue
      if (await applyMove(env, cur, mv, row, now)) applied++
    }
    cur = await loadAndDecide(env, tripId, { evidenceFreshIds: undefined, now, cooldownEnabled: true })
  }
  return { mode: 'on', tripRev: first.tripRev, applied, rounds }
}

// AGENDA-change trigger (SPEC §5 D trigger 1), QUIESCED on stability. postTrip
// bumps the trip's server stamp on every save; this schedules a heal FOR that
// stamp, waits a short beat, then BAILS if a newer edit has since landed (its
// own trigger will heal the settled state). So a rapid lodging clear-then-retype
// heals ONCE, on the final state — never mass-scattering base filings in the gap
// (SPEC §5 D convergence, appendix critique-0 #5). evidenceFresh is NOT set: an
// agenda change relies on the fresher stamp (gate 5), not fresh photo evidence.
// Runs inside ctx.waitUntil AFTER the response, so it adds no latency to the save.
// `quiesceMs` is injectable so tests don't wait the real window.
const AGENDA_QUIESCE_MS = 5000
// The quiesce window, tunable without a deploy (and settable to 0 in tests) via
// env.PHOTO_HEAL_QUIESCE_MS. Defaults to AGENDA_QUIESCE_MS.
export function agendaQuiesceMs(env) {
  const raw = env?.PHOTO_HEAL_QUIESCE_MS
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseInt(raw, 10) : NaN
  return Number.isFinite(n) && n >= 0 ? n : AGENDA_QUIESCE_MS
}
export async function scheduleAgendaHeal(env, tripId, { now = Date.now(), quiesceMs } = {}) {
  const mode = photoHealMode(env)
  if (mode === 'off') return { skipped: 'off' }
  const before = await env.DB.prepare(
    'SELECT updated_at FROM trips WHERE id = ? AND deleted_at IS NULL'
  ).bind(tripId).first()
  if (!before) return { skipped: 'no-trip' }
  const scheduledStamp = before.updated_at
  const wait = Number.isFinite(quiesceMs) ? quiesceMs : agendaQuiesceMs(env)
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  const after = await env.DB.prepare(
    'SELECT updated_at FROM trips WHERE id = ? AND deleted_at IS NULL'
  ).bind(tripId).first()
  // A newer edit (or a delete) landed during the quiesce window → its trigger
  // owns the heal; skip so we don't heal a superseded snapshot.
  if (!after || after.updated_at !== scheduledStamp) return { skipped: 'superseded' }
  return runHealForTrip(env, tripId, { mode, now })
}

// The DAILY CRON backstop (SPEC §5 D trigger 5): heal every active trip. No
// evidenceFresh + no stamp bump — pure repair + agenda-freshness convergence,
// the net that catches anything an event trigger missed. Per-trip failures are
// logged and skipped so one bad trip never stops the sweep.
// The scene-backfill batch size per sweep — tunable without a deploy (WEAVE_MODEL
// precedent). Photon WASM decode is CPU-heavy, so we bound it and let the pass RESUME
// across nights (it's idempotent); a generous default covers this family's ~270 refs
// in a run or two. 0 disables the backfill.
export function sceneBackfillLimit(env) {
  const raw = env?.PHOTO_SCENE_BACKFILL_LIMIT
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseInt(raw, 10) : NaN
  return Number.isFinite(n) && n >= 0 ? n : 120
}

export async function healSweep(env, { now = Date.now() } = {}) {
  const mode = photoHealMode(env)
  if (mode === 'off') return { skipped: 'off' }
  // Populate the COMPOSITION dimension FIRST, so THIS sweep's decisions can already
  // overlap it. Best-effort + bounded + idempotent — a backfill failure must never
  // stop the sweep, and it resumes where a bounded run left off.
  let sceneBackfill = null
  const limit = sceneBackfillLimit(env)
  if (limit > 0) {
    try {
      sceneBackfill = await backfillSceneSignatures(env, { limit })
    } catch (e) {
      console.error('[scene-backfill] sweep failed', e?.stack || e)
    }
  }
  // Populate the VISION dimension too — gated by its OWN consent/cost knob
  // (PHOTO_VISION_MODE, default off → a no-op until Jonathan enables it, since vision
  // sends photos to the cloud and costs per call). Best-effort + bounded.
  let visionBackfill = null
  try {
    visionBackfill = await backfillVisionLabels(env)
  } catch (e) {
    console.error('[vision-backfill] sweep failed', e?.stack || e)
  }
  // Build 2 (§14) — retroactively tag every existing ref's SOURCE (real EXIF
  // read vs. an inferred/manual guess) before deriving anything new, then
  // derive the STAY timezone for any trip still missing one, then run the
  // offset-inference engine (needs trip.tz, so it rides last). All three are
  // best-effort + bounded, matching the scene/vision backfills above — a
  // failure in any one must never stop the sweep. UNLIKE the scene/vision
  // backfills (which only ever feed an internal shadow ledger nothing
  // currently surfaces), trip.tz and offsetMinutes are each family-visible
  // TODAY (album day-attribution + time labels, and photoMatch/sessionHeal's
  // time reasoning respectively) — so those two, and ONLY those two, are
  // gated on `mode` below and write for real only when mode==='on'.
  // provenanceBackfill is NOT gated: it only ever labels the SOURCE of a
  // value a ref already carries — zero behavior change today (verified: the
  // only consumer of `ref.prov` is memoryStore.js's tieredWriteAllowed write
  // gate, never anything rendered) — so it stays always-on, same posture as
  // scene/vision.
  let provenanceBackfill = null
  try {
    provenanceBackfill = await backfillProvenanceTags(env)
  } catch (e) {
    console.error('[provenance-backfill] sweep failed', e?.stack || e)
  }
  // trip.tz is NOT inert either: photoEntries.js's buildDayTz/dayForCapture
  // reads it directly to decide which DAY a photo's album section falls under
  // and what its time-band label reads — a real, TODAY, family-visible
  // consequence, independent of the offset-inference engine below. So this
  // backfill gets the exact same off/shadow/on write discipline. W0
  // (BUILD_PLAN_WITNESS_FLEET_2.md) gives it ITS OWN knob (PHOTO_TZ_MODE),
  // defaulting to inherit `mode` — the per-lever promotion rule (flipping
  // this on at R1 must never also arm the offset engine or GPS propagation
  // below). Real writes only when its resolved mode is 'on'.
  let tripTzBackfill = null
  try {
    const tzMode = photoTzMode(env, mode)
    tripTzBackfill = await backfillTripTimezones(env, { mode: tzMode })
  } catch (e) {
    console.error('[trip-tz-backfill] sweep failed', e?.stack || e)
  }
  // W1 (BUILD_PLAN_WITNESS_FLEET_2.md) — cache each trip's per-day hourly
  // weather (Open-Meteo, keyless) as `trip.weatherDays` BEFORE offset
  // inference runs, so its corroborationTier can read the cache as a
  // veto-only second check alongside daylight. UNLIKE trip.tz/offsetMinutes,
  // this cache is NOT family-visible (worker-only, stripped by
  // surprises.js's WORKER_ONLY_TRIP_KEYS same as placeNames/landmarkLookups)
  // — so, like those, it needs no off/shadow/on gate of its own; it always
  // runs (best-effort, bounded) whenever the sweep itself is not off.
  let weatherBackfill = null
  try {
    weatherBackfill = await backfillWeather(env)
  } catch (e) {
    console.error('[weather-backfill] sweep failed', e?.stack || e)
  }
  // offsetMinutes is likewise family-visible (drives photoMatch.js's day
  // binning + sessionHeal.js's time reasoning) — same per-lever pattern. W0
  // gives it ITS OWN knob (PHOTO_OFFSET_MODE), defaulting to inherit `mode`
  // (see offsetInference.js's header for the full contract this closes a
  // real live bug in). W1 threads the weatherDays cache above into its
  // corroborationTier call internally (offsetInference.js's own seam) — no
  // extra wiring needed here.
  let offsetInference = null
  try {
    const offsetMode = photoOffsetMode(env, mode)
    offsetInference = await backfillOffsetInference(env, { mode: offsetMode })
  } catch (e) {
    console.error('[offset-inference] sweep failed', e?.stack || e)
  }
  // Build 4a (BUILD_PLAN_SIGNAL_FLEET.md) — addresses → coordinates for
  // agenda stops. ITS OWN knob (PHOTO_STOP_GEOCODE_MODE), defaulting to
  // inherit `mode` — the per-lever promotion rule (flipping this on must
  // never also arm v1's photo-moving or the offset engine above). Stop
  // coordinates feed FOUR-plus ungated family-visible surfaces (photoMatch
  // GPS filing, evidence pins, LeaveWhen destinations, Build 4b's own-places
  // resolver), so real writes only when ITS knob resolves to 'on'.
  let stopGeocode = null
  try {
    const stopGeocodeMode = photoStopGeocodeMode(env, mode)
    stopGeocode = await backfillStopGeocodes(env, { mode: stopGeocodeMode })
  } catch (e) {
    console.error('[stop-geocode] sweep failed', e?.stack || e)
  }
  // Build 5 (BUILD_PLAN_SIGNAL_FLEET.md) — moment-scoped GPS propagation. W0
  // gives it ITS OWN knob (PHOTO_GPS_PROPAGATION_MODE), defaulting to
  // inherit `mode` — the per-lever promotion rule (R3 promotes this
  // independently of R1/R2). Real writes only when its resolved mode is
  // 'on'. Measured reach on today's archive is ZERO (a pure standing-forward
  // mechanism); best-effort, never stops the sweep.
  let gpsPropagation = null
  try {
    const gpsMode = photoGpsPropagationMode(env, mode)
    gpsPropagation = await propagateMomentGps(env, { mode: gpsMode })
  } catch (e) {
    console.error('[gps-propagation] sweep failed', e?.stack || e)
  }
  const { results: trips } = await env.DB.prepare(
    'SELECT id FROM trips WHERE deleted_at IS NULL'
  ).all()
  let tripsWithMoves = 0
  let totalMoves = 0
  let v2Recorded = 0
  let discoveredRenamed = 0
  let landmarkPinned = 0
  for (const t of trips || []) {
    try {
      const r = await runHealForTrip(env, t.id, { mode, now })
      const n = r?.moves ?? r?.applied ?? 0
      if (n) { tripsWithMoves++; totalMoves += n }
    } catch (e) {
      console.error('[photo-heal-sweep] trip failed', t.id, e?.stack || e)
    }
    // v2 shadow learning ledger — independent of v1 (a v2 failure can't stop the
    // sweep or perturb v1's would-move accounting). Also carries Build 4b/4c's
    // per-trip discovered-place-naming + landmark-pin counts (both ledger-only,
    // computed as part of the same recordHealDecisions call).
    try {
      const v2 = await recordHealDecisions(env, t.id, { mode, now })
      v2Recorded += v2?.recorded || 0
      discoveredRenamed += v2?.discoveredRenamed || 0
      landmarkPinned += v2?.landmarkPinned || 0
    } catch (e) {
      console.error('[photo-heal-v2] trip failed', t.id, e?.stack || e)
    }
  }
  return {
    mode,
    trips: trips?.length || 0,
    tripsWithMoves,
    totalMoves,
    v2Recorded,
    discoveredRenamed,
    landmarkPinned,
    sceneBackfill,
    visionBackfill,
    provenanceBackfill,
    tripTzBackfill,
    weatherBackfill,
    offsetInference,
    stopGeocode,
    gpsPropagation,
  }
}

// ── v2 SHADOW LEARNING ledger (SPEC_V2 Phase 1) ──────────────────────────────
// Compute the v2 engine's would-decisions for a trip and REPLACE the trip's rows
// in memory_heal_decisions (migration 019) so the table always shows the CURRENT
// would-state. RECORDS ONLY — applies nothing, ever (that's a later phase). Runs
// alongside v1 whenever the knob is not off, so the existing shadow period lights
// up BOTH ledgers: v1's would-moves (near-empty on this data) and v2's rich
// tiered decisions (the learning tool, decision #1). Atomic DELETE+INSERT batch.
// defaultOffset is 0 (UTC) — offset-bearing refs (ea2296a) are exact; legacy
// offset-less archive photos are approximate in the ledger, acceptable for shadow.
export async function recordHealDecisions(env, tripId, { now = Date.now(), mode } = {}) {
  const activeMode = mode || photoHealMode(env)
  if (activeMode === 'off') return { skipped: 'off' }
  const tripRow = await env.DB.prepare(
    'SELECT data_json, updated_at FROM trips WHERE id = ? AND deleted_at IS NULL'
  ).bind(tripId).first()
  if (!tripRow) return { mode: activeMode, recorded: 0, noTrip: true }
  let trip
  try { trip = JSON.parse(tripRow.data_json) } catch { return { mode: activeMode, recorded: 0, badTrip: true } }
  const { results: rows } = await env.DB.prepare(
    'SELECT id, photo_r2_keys_json, author_traveler FROM memories WHERE trip_id = ? AND deleted_at IS NULL'
  ).bind(tripId).all()

  let days
  try {
    days = buildTripDecisions(trip, rows || [])
  } catch (e) {
    console.error('[photo-heal-v2] decide failed', tripId, e?.stack || e)
    return { mode: activeMode, recorded: 0, error: true }
  }

  // Build 4b + 4c (BUILD_PLAN_SIGNAL_FLEET.md) — name the __discovered__
  // clusters from the trip's own places (or, for the residue, a
  // cached/fresh Nominatim reverse lookup) and resolve any signage-bearing
  // decision to a real landmark pin, AFTER the pure engine decided but
  // BEFORE the ledger write below picks up dec.place.name/dec.signals.
  // Both are ledger-only + REPLACED every run, so neither needs a
  // PHOTO_HEAL_MODE gate — but both are best-effort: a resolution failure
  // must never stop the ledger record itself. Their two small worker-only
  // caches (placeNames, landmarkLookups) are merged into ONE guarded UPDATE
  // against the SAME stamp read above (no-bump, tz-write precedent) — a
  // concurrent trip edit just skips this cache write; both caches are fully
  // clobber-recomputable next run, never a data-loss risk.
  let discoveredNaming = null
  let landmarkPins = null
  const cachePatch = {}
  // Confirmed fixture/test data (CLAUDE.md's TRAP warning) — never derive or
  // spend anything (an external Nominatim/Places call) on it, matching every
  // sibling backfill in this same batch (stopGeocodeBackfill.js,
  // momentGpsPropagation.js, offsetInference.js, tripTzBackfill.js).
  if (tripId !== 'volleyball-2026') {
    // W0b (BUILD_PLAN_WITNESS_FLEET_2.md) — hoisted out of the naming try
    // block below so it's in scope for resolveLandmarkPins' type-gate too.
    // Pure + self-guarded per-row (never throws), so computing it once,
    // ahead of both try blocks, is safe and is the SAME index both
    // consumers share — never a second one built for the landmark path.
    const placeTypeByRef = buildPlaceTypeIndex(rows)
    try {
      discoveredNaming = await nameDiscoveredPlaces(trip, days, placeTypeByRef)
      if (discoveredNaming?.placeNames) cachePatch.placeNames = discoveredNaming.placeNames
    } catch (e) {
      console.error('[discovered-place-namer] failed', tripId, e?.stack || e)
    }
    try {
      const signageByRef = buildSignageIndex(rows)
      landmarkPins = await resolveLandmarkPins(env, trip, days, signageByRef, placeTypeByRef)
      if (landmarkPins?.landmarkLookups) cachePatch.landmarkLookups = landmarkPins.landmarkLookups
    } catch (e) {
      console.error('[landmark-search] failed', tripId, e?.stack || e)
    }
  }
  if (Object.keys(cachePatch).length) {
    try {
      const updatedTrip = { ...trip, ...cachePatch }
      await env.DB.prepare(
        'UPDATE trips SET data_json = ? WHERE id = ? AND updated_at = ? AND deleted_at IS NULL'
      ).bind(JSON.stringify(updatedTrip), tripId, tripRow.updated_at).run()
    } catch (e) {
      console.error('[heal-decisions-cache] write failed', tripId, e?.stack || e)
    }
  }

  const del = env.DB.prepare('DELETE FROM memory_heal_decisions WHERE trip_id = ?').bind(tripId)
  const ins = env.DB.prepare(
    `INSERT INTO memory_heal_decisions
       (trip_id, iso_date, memory_ids, photo_count, place_id, place_name, tier, confidence, evidence, signals_json, reason, mode, run_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  )
  const tiers = { auto: 0, confirm: 0, leave: 0 }
  const batch = [del]
  for (const d of days) {
    for (const dec of d.decisions) {
      tiers[dec.tier] = (tiers[dec.tier] || 0) + 1
      batch.push(
        ins.bind(
          tripId,
          d.isoDate,
          JSON.stringify(dec.memoryIds || []),
          dec.count || 0,
          dec.place?.id ?? null,
          dec.place?.name ?? null,
          dec.tier,
          Number.isFinite(dec.confidence) ? dec.confidence : null,
          dec.signals?.evidence ?? null,
          JSON.stringify(dec.signals || {}),
          dec.reason ?? null,
          activeMode,
          now
        )
      )
    }
  }
  await env.DB.batch(batch)
  return {
    mode: activeMode,
    recorded: batch.length - 1,
    tiers,
    discoveredRenamed: discoveredNaming?.renamed || 0,
    discoveredExternal: discoveredNaming?.external || 0,
    landmarkPinned: landmarkPins?.pinned || 0,
    landmarkMisses: landmarkPins?.misses || 0,
  }
}
