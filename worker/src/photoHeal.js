// worker/src/photoHeal.js — the PURE decision engine of the self-healing-photos
// worker matcher (SPEC §5 D). Given one memory + a resolved trip context, it
// decides whether the photo should MOVE to a different stop, become a SUGGESTION
// a person can accept, or do NOTHING — honoring the provenance lock (a person's
// hand-move beats the machine) and the strict + repair-first gate.
//
// DELIBERATELY PURE. No D1, no R2, no network, no clock reads except a `now`
// passed in. That is what makes the gate truth table (test/photoHeal-gates) and
// the order-independence permutation property (test/photoHeal-permutation)
// executable without a database — SPEC §7 requires both, and §1's convergence
// invariant is only trustworthy if the core is deterministic given its inputs.
// The worker wiring (triggers, the ledger write, the guarded UPDATE, per-viewer
// projection) lives in index.js and CALLS this; nothing here touches state.
//
// THE PRIME DIRECTIVE (SPEC §1): a wrong silent move is worse than no move. Auto
// never overwrites manual. So the gate is conservative by construction — it
// downgrades to a suggestion (human-gated) on any doubt, and stays silent on a
// manual lock or a masked/surprise memory.

import { buildDayIndex, matchPhotoToStop, nearestLocatedStops } from './photoMatch.js'
import { isImplicitBaseId } from './dayStopIds.js'

// The auto-move margin gate (SPEC §5 D gate 3): the winning stop must beat the
// runner-up by ≥ max(100m, 25% of the runner-up distance). A single-candidate
// day (runnerUp == null) is unambiguous → clears. Exported for the truth table.
export const MARGIN_FLOOR_METERS = 100
export const MARGIN_FRACTION = 0.25
export function marginQualifies(winnerMeters, runnerUpMeters) {
  if (!Number.isFinite(winnerMeters)) return false
  if (runnerUpMeters == null || !Number.isFinite(runnerUpMeters)) return true
  const need = Math.max(MARGIN_FLOOR_METERS, MARGIN_FRACTION * runnerUpMeters)
  return runnerUpMeters - winnerMeters >= need
}

function photoHasGps(p) {
  return p && Number.isFinite(p.lat) && Number.isFinite(p.lng)
}

// null / undefined / '' all mean "unfiled" — compare as one filing (mirror of
// stopProvenance.sameStop; kept local so this module has no cross-dep on it).
function sameStop(a, b) {
  return (a || null) === (b || null)
}

// Normalize a stored stopProv into a parsed object or null — FAIL CLOSED. A raw
// D1 TEXT string is parsed; a parse failure, or any truthy non-object, degrades
// to a MANUAL lock (the safe direction — an ambiguous prov must never unlock the
// machine). A parsed object with no valid `source` is returned as-is (the
// eligibility logic then treats a missing source as legacy, which is correct).
const LOCK_ON_AMBIGUOUS = { source: 'manual', by: null, reason: 'unknown' }
function normalizeStoredProv(p) {
  if (p == null) return null
  if (typeof p === 'object') return p
  if (typeof p === 'string') {
    try {
      const parsed = JSON.parse(p)
      return parsed && typeof parsed === 'object' ? parsed : LOCK_ON_AMBIGUOUS
    } catch {
      return LOCK_ON_AMBIGUOUS
    }
  }
  return LOCK_ON_AMBIGUOUS
}

// Is this memory an UNREVEALED surprise on the worker's whole-truth view? The
// per-viewer projection sets `masked` on a stub, but rowToMemory (the
// authoritative deserialization) emits `hideFrom` + `revealed`, never `masked`
// — so the engine self-detects an unrevealed surprise from those, not only from
// a `masked` bool a caller might forget to set (review major). A REVEALED
// surprise is public and heals normally.
function memoryIsHidden(m) {
  if (!m) return false
  if (m.masked === true) return true
  const hidden = Array.isArray(m.hideFrom) && m.hideFrom.length > 0
  const revealed = !!(m.revealed || m.revealedAt)
  return hidden && !revealed
}

// Deterministic plurality over a list of ids: the id with the highest count,
// ties broken by lexicographically-smallest id (so a split memory produces the
// SAME suggestion target regardless of photo order — order-independence).
function plurality(ids) {
  const counts = new Map()
  for (const id of ids) {
    if (id == null) continue
    counts.set(id, (counts.get(id) || 0) + 1)
  }
  let bestId = null
  let bestCount = -1
  for (const [id, n] of counts) {
    if (n > bestCount || (n === bestCount && (bestId == null || id < bestId))) {
      bestId = id
      bestCount = n
    }
  }
  return bestId
}

// Compute the memory's PROPOSED target stop from its photos, with the matcher.
//   located   — the photos carrying GPS (the only ones the strict gate trusts).
//   unanimous — every located photo matched gps+time to the SAME stop (gate 4).
//   matchType — 'gps+time' when the located photos drive it; else the time-only
//               representative's type ('time' / 'interstitial' / 'unmatched').
//   target    — the proposed stopId (the agreed id when unanimous; else the
//               deterministic plurality; else the time-only stopId).
export function computeMemoryTarget(memory, dayIndex) {
  const photos = Array.isArray(memory?.photos) ? memory.photos : []
  const matches = photos.map((p) => matchPhotoToStop(p, dayIndex))
  const locatedIdx = []
  for (let i = 0; i < photos.length; i++) if (photoHasGps(photos[i])) locatedIdx.push(i)

  if (locatedIdx.length > 0) {
    const locatedMatches = locatedIdx.map((i) => matches[i])
    const gpsTime = locatedMatches.filter((m) => m.matchType === 'gps+time')
    // Unanimity keys on DAY + stop, not stop alone — a trip that (pathologically)
    // reuses one stop id across two days at different coords must not read as
    // unanimous just because the id string matches (review minor).
    const keys = new Set(gpsTime.map((m) => `${m.dayIsoDate}|${m.stopId}`))
    const unanimous =
      gpsTime.length === locatedMatches.length &&
      keys.size === 1 &&
      !gpsTime.some((m) => m.stopId == null)
    if (unanimous) {
      return { target: gpsTime[0].stopId, matchType: 'gps+time', unanimous: true, matches, locatedIdx }
    }
    // Not unanimous → the suggestion target is the deterministic plurality of
    // the gps+time votes (may be null if none matched a stop).
    const target = plurality(gpsTime.map((m) => m.stopId))
    return {
      target,
      matchType: gpsTime.length ? 'gps+time' : (locatedMatches[0]?.matchType ?? 'unmatched'),
      unanimous: false,
      matches,
      locatedIdx,
    }
  }

  // No GPS photos → time-only. Representative = the EARLIEST-captured photo that
  // landed in a day (ties broken by photo id), NOT array order — so a no-GPS
  // memory whose photos span days resolves the same way regardless of input
  // order (review minor: array-order dependence broke determinism).
  const candidates = photos
    .map((p, i) => ({ m: matches[i], p }))
    .filter((x) => x.m.dayIsoDate)
    .sort((a, b) => {
      const ta = Date.parse(a.p.capturedAt)
      const tb = Date.parse(b.p.capturedAt)
      if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb
      return String(a.p.id ?? '') < String(b.p.id ?? '') ? -1 : 1
    })
  const rep = candidates[0]?.m || matches[0] || null
  return {
    target: rep ? rep.stopId : null,
    matchType: rep ? rep.matchType : 'unmatched',
    unanimous: true, // trivially — no located photos to disagree
    matches,
    locatedIdx,
  }
}

// The worst-case (minimum) margin across the memory's located photos, measured
// against the proposed target. Gate 3 requires EVERY located photo to clear the
// margin, so we report the weakest link. Returns { winnerMeters, runnerUpMeters,
// ok } — ok=false if any located photo fails the margin, true if all clear (or
// there are no located photos, in which case the margin gate is moot — gate 1
// already blocks a time-only move).
export function memoryMargin(memory, dayIndex, target) {
  const photos = Array.isArray(memory?.photos) ? memory.photos : []
  let ok = true
  let minWinner = null
  let minRunner = null
  let sawLocated = false
  for (const p of photos) {
    if (!photoHasGps(p)) continue
    const nls = nearestLocatedStops(p, dayIndex, target)
    if (!nls) continue
    sawLocated = true
    if (!marginQualifies(nls.winnerMeters, nls.runnerUpMeters)) ok = false
    if (minWinner == null || nls.winnerMeters > minWinner) minWinner = nls.winnerMeters
    if (nls.runnerUpMeters != null && (minRunner == null || nls.runnerUpMeters < minRunner)) {
      minRunner = nls.runnerUpMeters
    }
  }
  return { winnerMeters: minWinner, runnerUpMeters: minRunner, ok: sawLocated ? ok : false }
}

// Does a stopId resolve to a real place in the trip context? A planned stop, an
// implicit-base id for a real day, or a bridged record-entry id all resolve;
// anything else is ORPHANED (its stop was deleted / the base anchor moved).
// ctx.stopExists is provided by the caller (it knows the trip + record set); the
// implicit-base short-circuit keeps a base-filed photo from reading as orphaned
// just because base ids aren't in day.stops.
function stopResolves(stopId, ctx) {
  if (!stopId) return false
  if (isImplicitBaseId(stopId)) {
    // A base id resolves iff the caller still derives that day's base AND (§5 D
    // convergence caveat) it did not resolve within the debounce window — the
    // caller folds the "recently resolved" guard into stopExists.
    return ctx.stopExists(stopId)
  }
  return ctx.stopExists(stopId)
}

// ── THE DECISION (SPEC §5 D gate) ────────────────────────────────────────────
//
// memory: { id, stopId, stopProv (parsed object|null), tripRev (number|null),
//           photos:[{id,lat,lng,capturedAt}], masked (bool) }
// ctx: {
//   dayIndex,                 // buildDayIndex(trip)
//   tripRev,                  // the trip's CURRENT server row stamp
//   stopExists(stopId)->bool, // resolves a planned/base/record id (+ debounce guard)
//   isSurpriseStop(stopId)->bool,       // target is an unrevealed surprise stop
//   inCooldown(memoryId, from, to)->bool, // direction-flip cooldown
//   now,
// }
//
// Returns a decision object (never throws): action ∈ 'move'|'suggest'|'none'.
export function decideMemoryHeal(memory, ctx) {
  const none = (reason, extra = {}) => ({
    memoryId: memory?.id ?? null,
    action: 'none',
    fromStopId: memory?.stopId ?? null,
    toStopId: null,
    reason,
    ...extra,
  })
  if (!memory || !ctx || !ctx.dayIndex) return none('no-input')

  // FAIL CLOSED on the two safety callbacks (review: they were `&&`-guarded, so
  // a caller that omitted isSurpriseStop/inCooldown would let a move onto a
  // surprise stop or a flip-flop proceed silently). An absent callback now means
  // "assume unsafe" — the surprise/cooldown suppression fires — so a wiring
  // omission can NEVER produce a wrong auto-move, only an over-conservative
  // no-op. A caller with no surprises must pass `() => false` explicitly.
  const isSurpriseStop = typeof ctx.isSurpriseStop === 'function' ? ctx.isSurpriseStop : () => true
  const inCooldown = typeof ctx.inCooldown === 'function' ? ctx.inCooldown : () => true

  // Normalize provenance FAIL CLOSED (review: the manual lock silently failed if
  // the caller passed the raw D1 TEXT string instead of a parsed object —
  // `'{...}'.source` is undefined, so the manual arm was skipped and a hand-filed
  // photo became move-eligible). A non-object truthy stopProv is parsed if it's a
  // string; a parse failure or any other non-object degrades to a MANUAL lock —
  // the safe direction (never let an ambiguous prov unlock the machine).
  const prov = normalizeStoredProv(memory.stopProv)
  const current = memory.stopId || null

  // Gate 6 (hard-suppress half A): an unrevealed-surprise memory never surfaces
  // anything — a move or a suggestion could leak a surprise's existence by
  // arithmetic (SPEC §5 D: counts must not leak surprise shape). Silent. The
  // engine self-detects this from the memory's OWN hide state on the worker's
  // whole-truth view (hideFrom set + not yet revealed), NOT only from a
  // projection-set `masked` bool — because rowToMemory emits hideFrom, never
  // `masked`, so trusting `masked` alone would sail an unrevealed surprise past.
  if (memoryIsHidden(memory)) return none('masked')

  // Gate 2, manual arm: a stored HUMAN filing — a MANUAL hand-move OR an S1
  // 'confirmed' tap (D13) — is a lock: auto NEVER moves it, and (SPEC §5 D
  // "Fails 2 → nothing, silently") not even a suggestion. The person's decision
  // stands until THEY change it.
  if (prov && (prov.source === 'manual' || prov.source === 'confirmed')) return none('manual-lock')

  // Compute where the matcher thinks the memory belongs now.
  const { target, matchType, unanimous } = computeMemoryTarget(memory, ctx.dayIndex)

  // Already there (or nowhere to move) → nothing to do. Idempotent no-op — this
  // is what makes re-running to quiescence safe (SPEC §1: application idempotent).
  if (target == null || sameStop(current, target)) return none('already-filed', { matchType })

  // Eligibility (gate 2) as a tri-state.
  //   auto           → fully move-eligible (auto may re-move auto).
  //   legacy (null)  → repair-only: move-eligible ONLY when currently unfiled or
  //                    orphaned; a filed-valid legacy photo is suggest-only.
  const currentResolves = stopResolves(current, ctx)
  let moveEligible
  let suggestEligible
  let eligibility
  if (prov && prov.source === 'auto') {
    moveEligible = true
    suggestEligible = true
    eligibility = 'auto'
  } else {
    // prov == null → legacy, or a fresh unfiled row.
    if (current == null || !currentResolves) {
      moveEligible = true
      suggestEligible = true
      eligibility = current == null ? 'unfiled' : 'legacy-repair'
    } else {
      moveEligible = false
      suggestEligible = true
      eligibility = 'legacy-suggest'
    }
  }

  // Gate 6 (hard-suppress half B): surface NOTHING when a move/suggestion would
  // touch a surprise or flip-flop. Both the TARGET and the SOURCE are checked —
  // moving a photo OUT of an unrevealed surprise stop would snapshot movedFrom =
  // that stop's id + label into the moved-note, leaking the secret's existence
  // to a lens that must not see it (review blocker: source was unguarded). After
  // the surprise reveals (itself a heal trigger) the move proceeds normally.
  if (isSurpriseStop(target)) return none('surprise-target', { matchType })
  if (isSurpriseStop(current)) return none('surprise-source', { matchType })
  if (inCooldown(memory.id, current, target)) return none('cooldown', { matchType })

  // The strict auto gate (SPEC §5 D): gps+time (gate 1) · margin (gate 3) ·
  // unanimity (gate 4). Failing any of the three, while eligible, DOWNGRADES to
  // a suggestion (§5 D: "Fails 1/3/4 but passes 2 → suggestion").
  const gate1 = matchType === 'gps+time'
  const margin = memoryMargin(memory, ctx.dayIndex, target)
  const gate3 = margin.ok
  const gate4 = unanimous
  const strict = gate1 && gate3 && gate4

  // Gate 5 (fresher, pulled-clean agenda): an auto-move fires in RESPONSE to an
  // agenda the memory hasn't reflected — trip server stamp strictly newer than
  // the memory's recorded stamp. THE STAMP LIVES IN stopProv.tripRev — the
  // durable field buildAutoProv writes and rowToMemory deserializes — NOT a
  // top-level memory.tripRev, which NO DB row ever carries (review blocker: the
  // wrong-field read made memRev always null, so gate 5 was inert and a filed
  // auto memory silently re-moved on a non-fresher agenda — the exact wrong
  // silent move the prime directive forbids). A top-level memory.tripRev is a
  // test/legacy convenience fallback only. EXEMPTIONS, each a property of the
  // CURRENT state/trigger (never of history — so gate 5 stays order-independent):
  //   (a) a memory the worker never AUTO-matched (no auto stamp — legacy / fresh
  //       import); an already-auto-filed memory is NOT exempt — it must show a
  //       strictly-fresher agenda or a fresh-evidence trigger;
  //   (b) a REPAIR of an unfiled/orphaned filing — repair is triggered by the
  //       stop VANISHING, not a stamp advance, so it must not wait for one;
  //   (c) an explicit fresh-EVIDENCE trigger — an import / GPS-backfill /
  //       capturedAt-edit re-match (SPEC §5 D trigger 3) does NOT bump the trip
  //       stamp, yet the new evidence warrants a re-file. ctx.evidenceFresh may
  //       be a boolean (whole run) or a per-memory predicate (id → bool), so a
  //       trigger can scope freshness to exactly the memories whose evidence
  //       changed without freeing the rest.
  const memRev = Number.isFinite(prov?.tripRev) ? prov.tripRev
    : Number.isFinite(memory.tripRev) ? memory.tripRev
    : null
  const isRepair = current == null || !currentResolves
  const neverAutoMatched = memRev == null && prov?.source !== 'auto'
  const agendaFresher = memRev != null && Number.isFinite(ctx.tripRev) && ctx.tripRev > memRev
  const evidenceFresh =
    typeof ctx.evidenceFresh === 'function' ? !!ctx.evidenceFresh(memory.id) : ctx.evidenceFresh === true
  const gate5 = isRepair || neverAutoMatched || evidenceFresh || agendaFresher

  const common = {
    matchType,
    unanimous,
    eligibility,
    marginMeters:
      margin.winnerMeters != null && margin.runnerUpMeters != null
        ? margin.runnerUpMeters - margin.winnerMeters
        : null,
    winnerMeters: margin.winnerMeters,
    runnerUpMeters: margin.runnerUpMeters,
  }

  // ONE predicate for the move reason — used for BOTH the surfaced decision and
  // the persisted prov, so the shadow-ledger label and the lightbox note can
  // never disagree (review: they diverged for auto-off-orphan). A move off an
  // unfiled/orphaned stop is a repair; off a resolving stop, an agenda change.
  const moveReason = isRepair ? 'orphan-repair' : 'agenda-change'
  if (moveEligible && strict && gate5) {
    return {
      memoryId: memory.id,
      action: 'move',
      fromStopId: current,
      toStopId: target,
      reason: moveReason,
      prov: buildAutoProv(ctx, target, current, matchType, margin, moveReason),
      ...common,
    }
  }
  if (suggestEligible) {
    // Reason reflects the FIRST meaningful failing gate. Unanimity is checked
    // before margin: when the located photos disagree (gate 4) the target is a
    // plurality guess and the per-photo margin against it is not meaningful, so
    // "split" is the honest label, not "ambiguous".
    return {
      memoryId: memory.id,
      action: 'suggest',
      fromStopId: current,
      toStopId: target,
      reason: !gate4 ? 'split' : !gate1 ? 'weak-match' : !gate3 ? 'ambiguous' : !gate5 ? 'stale-agenda' : 'suggest',
      ...common,
    }
  }
  return none('ineligible', { matchType })
}

// The auto stopProv to persist on an accepted machine move (SPEC §4 shape). `by`
// is always the machine ('matcher'); labels are snapshotted by the caller (it
// resolves stop names), so this carries the machine-side evidence only. `reason`
// is passed in (the caller's single moveReason predicate) so the surfaced and
// persisted reasons never disagree.
function buildAutoProv(ctx, target, from, matchType, margin, reason) {
  return {
    source: 'auto',
    by: 'matcher',
    at: ctx.now ?? null,
    reason,
    movedFrom: from,
    matchType,
    distanceMeters: Number.isFinite(margin.winnerMeters) ? margin.winnerMeters : null,
    tripRev: Number.isFinite(ctx.tripRev) ? ctx.tripRev : null,
  }
}

// ── The idempotent apply reducer (order-independence's executable half) ───────
//
// Given a trip context + a list of memories, decide every memory, APPLY the
// accepted moves to a fresh copy of the memory list (auto prov stamped, tripRev
// advanced to the trip's current stamp so the memory now reflects this agenda),
// and return { memories, moves, suggestions }. Re-running on the output is a
// no-op (every moved memory is now `already-filed` at the current stamp) — which
// is what lets the caller loop to quiescence and what the permutation test
// leans on: applying the same event set in any order converges here.
//
// `mode`: 'off' applies + surfaces nothing; 'shadow' RECORDS the would-moves but
// applies nothing (the ledger-only posture); 'on' applies. The caller enforces
// the knob; this mirrors it so the pure simulator can prove all three.
//
// ⚠ CALLER CONTRACT (load-bearing for §1 order-independence — the D2 wiring MUST
// honor it): a stamp-stable evidence write — a GPS backfill or a capturedAt edit
// that does NOT bump the trip's server row stamp (SPEC §5 D trigger 3) — must run
// a heal for the affected memory ids with `ctx.evidenceFresh` set for EXACTLY
// those ids, ATOMICALLY with the write (same trigger). Gate 5 reads the durable
// stamp from stopProv.tripRev, so an already-auto-filed memory whose evidence
// changed at an unchanged stamp will otherwise stay put (a safe MISSED heal — a
// human can Move-to, a near-miss suggestion is offered — never a wrong move; the
// prime directive tolerates a missed heal, not a wrong silent one). Deferring or
// dropping that flag permanently strands such a memory until an agenda bump. The
// agenda-change and cron triggers pass NO evidenceFresh (they rely on the stamp).
export function healMemories(memories, ctx, mode = 'on') {
  const out = memories.map((m) => ({ ...m }))
  const byId = new Map(out.map((m) => [m.id, m]))
  const moves = []
  const suggestions = []
  for (const m of memories) {
    const d = decideMemoryHeal(m, ctx)
    if (d.action === 'move') {
      moves.push(d)
      if (mode === 'on') {
        const mem = byId.get(m.id)
        mem.stopId = d.toStopId
        mem.stopProv = d.prov
        // Deliberately DO NOT advance mem.tripRev here (review blocker): doing so
        // made a decision INPUT (gate 5's memRev) depend on whether this heal ran
        // before or after a stamp-stable evidence change, breaking §1
        // order-independence. Idempotency is preserved by the tripRev-independent
        // sameStop 'already-filed' check, so a re-run is still a no-op. The agenda
        // stamp the memory was matched against is recorded durably in
        // stopProv.tripRev (the ledger), not on the mutable memory row.
      }
    } else if (d.action === 'suggest') {
      suggestions.push(d)
    }
  }
  return { memories: out, moves, suggestions }
}

// Run healMemories to quiescence (SPEC §5 D convergence): re-run until no move
// is applied or a small cap is hit (a cap guards against a pathological
// oscillation the cooldown should already prevent). Returns the settled state.
export function healToQuiescence(memories, ctx, mode = 'on', cap = 8) {
  let state = memories
  let lastMoves = []
  for (let i = 0; i < cap; i++) {
    const r = healMemories(state, ctx, mode)
    state = r.memories
    lastMoves = r.moves
    if (mode !== 'on' || r.moves.length === 0) {
      return { memories: state, moves: r.moves, suggestions: r.suggestions, rounds: i + 1 }
    }
  }
  return { memories: state, moves: lastMoves, suggestions: [], rounds: cap }
}

// Build the day index once (re-export for the caller / tests).
export { buildDayIndex }
