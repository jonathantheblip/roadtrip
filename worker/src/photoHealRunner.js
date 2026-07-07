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
// SCOPE NOTE (D2a): the target set is agenda stops + the trip's implicit base
// (buildDayIndex). The RECORD BRIDGE (kept settle-sheet moments as extra
// targets, SPEC §5 D) is DEFERRED — the worker has no record-entry awareness
// yet and the kept-entry id-space/precedence needs its own design pass; tracked
// for a follow-up. Nothing here files to a record moment; a hangout day named
// only in the settle sheet heals to its base, not the named pin, for now.

import { healMemories, buildDayIndex } from './photoHeal.js'
import { isStopSurprise } from './surprises.js'
import { isImplicitBaseId } from './dayStopIds.js'

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
function labelForStop(trip, dayIndex, stopId) {
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
async function loadAndDecide(env, tripId, { evidenceFreshIds, now, cooldownEnabled }) {
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

// The DAILY CRON backstop (SPEC §5 D trigger 5): heal every active trip. No
// evidenceFresh + no stamp bump — pure repair + agenda-freshness convergence,
// the net that catches anything an event trigger missed. Per-trip failures are
// logged and skipped so one bad trip never stops the sweep.
export async function healSweep(env, { now = Date.now() } = {}) {
  const mode = photoHealMode(env)
  if (mode === 'off') return { skipped: 'off' }
  const { results: trips } = await env.DB.prepare(
    'SELECT id FROM trips WHERE deleted_at IS NULL'
  ).all()
  let tripsWithMoves = 0
  let totalMoves = 0
  for (const t of trips || []) {
    try {
      const r = await runHealForTrip(env, t.id, { mode, now })
      const n = r?.moves ?? r?.applied ?? 0
      if (n) { tripsWithMoves++; totalMoves += n }
    } catch (e) {
      console.error('[photo-heal-sweep] trip failed', t.id, e?.stack || e)
    }
  }
  return { mode, trips: trips?.length || 0, tripsWithMoves, totalMoves }
}
