// worker/src/evidenceAudit.js — W7, the evidence-constitution audit
// (BUILD_PLAN_WITNESS_FLEET_2.md §R W7; the Evidence Constitution ~lines 48-136).
//
// REPORT-ONLY. Zero writes, zero engine changes, zero promotion. This module
// only ever SELECTs (directly, or via the read-only `loadAndDecide` it
// imports); its only caller (GET /diag/evidence-audit in index.js) is itself
// read-only. It is the enforcement wall named in §R: "R5 does not flip
// without W7 green... Sonnet cannot promote past it, and neither can
// enthusiasm." It audits BOTH ledgers:
//
//   - v2 half (memory_heal_decisions) — a PURE MAPPING from what a row
//     already holds to which evidence dimensions agreed on the FILED place,
//     per the constitution's rule 1(A) + rule 4. The first-draft spec
//     ("count signals.dims >= 3") was proven not implementable and RETIRED —
//     `signals.dims` is moment-FORMATION presence (which photos belong
//     TOGETHER), never filing agreement (whether they belong at the filed
//     PLACE) — do not resurrect it.
//   - v1 half (memory_stop_moves) — those ledger rows drop their match
//     evidence at WRITE time (photoHealRunner.js's appendLedgerRow INSERT
//     carries no matchType/margin/unanimous columns), so a historical row
//     literally cannot be re-graded. RECOMPUTE against the LIVE trip/
//     memories state via the existing `loadAndDecide` (imported read-only,
//     never modified) instead.
//   - a cross-ledger conflict check: a v1 would-move whose covering v2
//     decision disagrees is exactly the class of finding that blocks R5.
//
// Every dimension letter (D1, D2, D7, D8, D16, D4/D5/D6) refers to the
// Evidence Constitution's numbered table (BUILD_PLAN_WITNESS_FLEET_2.md
// ~lines 54-71) — re-derive against that table, not this comment, if the two
// ever disagree.

import { loadAndDecide } from './photoHealRunner.js'
import { marginQualifies } from './photoHeal.js'
import { SCORE_DEFAULTS } from './sessionScorer.js'

// The documented fixture trap (CLAUDE.md) — every backfill in this arc skips
// it; auditing it would just report fixture noise as if it were the family's
// archive.
const SKIP_TRIP_IDS = new Set(['volleyball-2026'])

// Reference-tier GPS provenance — real exif/scan reads only (W8 item 4's own
// definition; sessionHeal.js's REFERENCE_GPS_PROV is not exported, so this is
// a read-only mirror of that closed set, not a new decision).
const REFERENCE_GPS_PROV = new Set(['exif', 'scan'])

function safeParseArray(raw) {
  if (Array.isArray(raw)) return raw
  if (typeof raw !== 'string' || !raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function safeParseObject(raw) {
  if (raw && typeof raw === 'object') return raw
  if (typeof raw !== 'string' || !raw) return {}
  try {
    const v = JSON.parse(raw)
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

// ── v2 half ──────────────────────────────────────────────────────────────
//
// Map ONE memory_heal_decisions row to its agreeing evidence dimensions.
// Pure — no D1, no clock — so it is directly mutation-testable against
// synthetic rows (the plan's own instruction: "you have no D1 access [to the
// real archive]... mutation-test the mapping").
//
//   evidence 'gps'       -> D2 agreed. REFERENCE-anchored ONLY if the row's
//                           OWN W8 signals say so (referenceLocatedCount>0 or
//                           a reference-tier entry in gpsProv) — never
//                           assumed from the evidence string alone (the
//                           constitution's explicit instruction: "read those;
//                           do not assume").
//   evidence 'record'    -> D8 agreed. Inherently reference (human-affirmed
//                           place) — the table's own tier for D8.
//   evidence 'base'      -> D7-adjacent agreed. NEVER reference-tier location
//                           for the table's own counting (the base is
//                           intrinsic evidence, not a witnessed one) — even
//                           though rule 1(A)(i)'s literal text carves base
//                           out as satisfying TODAY's bar ("the code's
//                           existing posture"). Both facts are reported
//                           separately below (`referenceAnchored` vs
//                           `barReferenceOk`) so neither silently masks the
//                           other.
//   evidence 'discovered'-> never AUTO-eligible (sessionScorer's canAuto
//                           explicitly excludes kind==='discovered'); mapped
//                           anyway so confirm/leave rows read honestly too.
//   evidence 'vision'    -> the leave->confirm naming override
//                           (sessionHeal.js) — D4/D6, one witness, always
//                           tier 'confirm' by construction, never an auto row.
//   D1 (time-fit)         -> agreed ONLY when signals.timeFitMin is present
//                           AND <= autoNearMin. A GPS-PASS decision
//                           (sessionScorer.js Pass 1) never sets timeFitMin —
//                           time was the clustering spine, never checked
//                           against the place — so its absence is reported
//                           HONESTLY ABSENT, never fabricated or derived.
//   vision-family         -> D4 placeType / D5 signage-pin / D6 name-labels-
//                           setting are ONE Claude reading of one photo, ONE
//                           witness (rule 4), however many of the three
//                           fired. The only field that can co-occur with a
//                           non-vision evidence row is signals.pin
//                           (landmarkSearch.js) — checked for visionName too
//                           so the mapping stays honest if that ever changes.
//                           Skipped when evidence is already 'vision' (rule
//                           4's corollary: a derived dimension never stacks
//                           with its own inputs on the same decision).
//   D16 (hand-filed)      -> left to "W7's call" per the code's own comment
//                           (sessionHeal.js's manualStopEvidence threading).
//                           Counts as agreeing ONLY when it names the SAME
//                           place this decision filed to; pointing elsewhere
//                           is a genuine internal conflict — surfaced, never
//                           silently folded into the count OR a false
//                           agreement.
//   dismissedBefore       -> a human "Not now" (W9 item 3) riding this exact
//                           (memory, place) pair is a negative human label
//                           present on the decision — a conflict under rule
//                           1(iii)'s "affirmative non-conflict from every
//                           other dimension present", surfaced the same way.
export function auditDecisionRow(row) {
  const memoryIds = safeParseArray(row.memory_ids)
  const signals = safeParseObject(row.signals_json)
  const evidence = signals.evidence ?? row.evidence ?? null
  const tier = row.tier
  const placeId = row.place_id ?? null

  const dims = []

  // tableReferenceAnchored: the constitution TABLE's own strict counting
  // (base never counts) — used for `referenceAnchored` and the >=3 target.
  // barReferenceOk: rule 1(A)(i)'s bar, which explicitly carves record/base
  // in as satisfying TODAY's 2-standard bar ("the code's existing posture").
  let tableReferenceAnchored = false
  let barReferenceOk = false
  if (evidence === 'gps') {
    const refCount = Number.isFinite(signals.referenceLocatedCount) ? signals.referenceLocatedCount : 0
    const gpsProv = Array.isArray(signals.gpsProv) ? signals.gpsProv : []
    const referenceAnchored = refCount > 0 || gpsProv.some((p) => REFERENCE_GPS_PROV.has(p))
    dims.push({ dim: 'D2', evidence: 'gps', agreed: true, referenceTier: referenceAnchored })
    tableReferenceAnchored = referenceAnchored
    barReferenceOk = referenceAnchored
  } else if (evidence === 'record') {
    dims.push({ dim: 'D8', evidence: 'record', agreed: true, referenceTier: true })
    tableReferenceAnchored = true
    barReferenceOk = true
  } else if (evidence === 'base') {
    dims.push({ dim: 'D7', evidence: 'base', agreed: true, referenceTier: false })
    tableReferenceAnchored = false
    barReferenceOk = true
  } else if (evidence === 'discovered') {
    dims.push({ dim: 'D7', evidence: 'discovered', agreed: true, referenceTier: false })
  } else if (evidence === 'vision') {
    dims.push({ dim: 'D4/D5/D6', evidence: 'vision', agreed: true, referenceTier: false })
  }
  // 'time-only' | 'none' | null -> no location-bearing dimension agreed.

  const timeFitMin = Number.isFinite(signals.timeFitMin) ? signals.timeFitMin : null
  const timeFit = timeFitMin == null
    ? { present: false, agreed: false }
    : {
        present: true,
        agreed: timeFitMin <= SCORE_DEFAULTS.autoNearMin,
        timeFitMin,
        autoNearMin: SCORE_DEFAULTS.autoNearMin,
      }
  if (timeFit.agreed) dims.push({ dim: 'D1', evidence: 'time-fit', agreed: true, referenceTier: false })

  const hasPin = !!(signals.pin && typeof signals.pin === 'object')
  const hasVisionName = typeof signals.visionName === 'string' && !!signals.visionName
  if (evidence !== 'vision' && (hasPin || hasVisionName)) {
    dims.push({
      dim: 'D4/D5/D6',
      evidence: hasPin ? 'landmark-pin' : 'vision-name',
      agreed: true,
      referenceTier: false,
    })
  }

  let handFiledConflict = null
  if (signals.handFiledStop) {
    if (placeId && signals.handFiledStop === placeId) {
      dims.push({ dim: 'D16', evidence: 'hand-filed', agreed: true, referenceTier: true })
    } else {
      handFiledConflict = { handFiledStop: signals.handFiledStop, filedPlaceId: placeId }
    }
  }

  const dismissedConflict = signals.dismissedBefore === true
  const timeAnchorSuspect = signals.timeAnchorSuspect === true
  const agreeingCount = dims.length

  // The BAR (rule 1(A)) independently RE-DERIVED from the row's own signals —
  // a defense-in-depth check, not a re-read of `tier`. If this disagrees with
  // `tier === 'auto'`, that IS the enforcement-wall finding W7 exists to
  // catch (a live engine bug), reported as `barMismatch`.
  //
  // Rule 1(A)(ii) is BOTH halves of "time-fit at non-suggestion tier": the
  // TRUST half (!timeAnchorSuspect — the anchor isn't file-mtime/created-at
  // grade) AND the PROXIMITY half (a Pass-2 auto's timeFitMin must land within
  // autoNearMin). A Pass-1 GPS auto carries NO timeFitMin (time was the
  // clustering spine, never checked against the place), so `!timeFit.present`
  // exempts it — its time trust is covered by !timeAnchorSuspect + the
  // reference GPS anchor. Omitting the proximity half (review, 2026-07-13)
  // would let a record/base auto whose time-fit blew past autoNearMin pass the
  // wall silently — no wrong number on today's healthy data (the scorer's
  // canAuto already gates best.d <= autoNearMin), but exactly the future
  // scorer-drift W7 exists to backstop.
  const computedMeetsBar =
    barReferenceOk && !timeAnchorSuspect && (!timeFit.present || timeFit.agreed) && !handFiledConflict && !dismissedConflict

  return {
    tripId: row.trip_id,
    isoDate: row.iso_date,
    memoryIds,
    place: { id: placeId, name: row.place_name ?? null },
    tier,
    evidence,
    dims,
    agreeingCount,
    meetsThreeDimTarget: agreeingCount >= 3,
    referenceAnchored: tableReferenceAnchored,
    timeFit,
    timeAnchorSuspect,
    handFiledConflict,
    dismissedConflict,
    computedMeetsBar,
    barMismatch: tier === 'auto' && !computedMeetsBar,
  }
}

// Audit every memory_heal_decisions row for one trip. Read-only SELECT.
export async function auditV2ForTrip(env, tripId) {
  const { results } = await env.DB.prepare(
    'SELECT trip_id, iso_date, memory_ids, place_id, place_name, tier, evidence, signals_json FROM memory_heal_decisions WHERE trip_id = ? ORDER BY id'
  ).bind(tripId).all()
  const decisions = (results || []).map(auditDecisionRow)
  const tiers = { auto: 0, confirm: 0, leave: 0 }
  const autos = []
  const barMismatches = []
  for (const d of decisions) {
    tiers[d.tier] = (tiers[d.tier] || 0) + 1
    if (d.tier === 'auto') {
      autos.push(d)
      if (d.barMismatch) barMismatches.push(d)
    }
  }
  return { tripId, totalDecisions: decisions.length, tiers, decisions, autos, barMismatches }
}

// ── v1 half ──────────────────────────────────────────────────────────────
//
// Grade ONE recomputed would-move (the shape `photoHeal.js`'s decideMemoryHeal
// returns for action==='move' — matchType/unanimous/winnerMeters/runnerUpMeters
// already ride the object via its `common` spread). Pure — mutation-testable
// directly against a synthetic move object, no D1/engine required.
export function evaluateV1Move(mv) {
  const gate1 = mv?.matchType === 'gps+time'
  const gate3 = marginQualifies(mv?.winnerMeters, mv?.runnerUpMeters)
  const gate4 = mv?.unanimous === true
  const pass = gate1 && gate3 && gate4
  return {
    memoryId: mv?.memoryId ?? null,
    fromStopId: mv?.fromStopId ?? null,
    toStopId: mv?.toStopId ?? null,
    matchType: mv?.matchType ?? null,
    unanimous: !!mv?.unanimous,
    winnerMeters: Number.isFinite(mv?.winnerMeters) ? mv.winnerMeters : null,
    runnerUpMeters: Number.isFinite(mv?.runnerUpMeters) ? mv.runnerUpMeters : null,
    pass,
    failedGates: [
      !gate1 ? 'matchType!==gps+time' : null,
      !gate3 ? 'margin-not-ok' : null,
      !gate4 ? 'not-unanimous' : null,
    ].filter(Boolean),
  }
}

// RECOMPUTE v1's would-moves for one trip against the LIVE trip/memories
// state (the historical memory_stop_moves ledger rows dropped this evidence
// at write time — see the module header). `loadAndDecide` is imported
// read-only and never modified; this never writes anything (evidenceFreshIds
// is unset and cooldownEnabled is false, matching photoSuggest.js's own
// read-only preview call of the same function).
export async function auditV1ForTrip(env, tripId, { now = Date.now() } = {}) {
  const bundle = await loadAndDecide(env, tripId, { evidenceFreshIds: undefined, now, cooldownEnabled: false })
  if (!bundle) return { tripId, noTrip: true, moves: [], passed: 0, failed: 0, failures: [] }
  const moves = (bundle.moves || []).map(evaluateV1Move)
  const failures = moves.filter((m) => !m.pass)
  return { tripId, moves, passed: moves.length - failures.length, failed: failures.length, failures }
}

// ── cross-ledger conflict check ─────────────────────────────────────────
//
// A v1 would-move on a memory whose COVERING v2 decision is 'leave', or
// targets a DIFFERENT place, is a conflict finding — exactly the class §R
// says blocks R5. Pure — takes the already-computed v1 moves + v2 decisions,
// no D1 access of its own, directly mutation-testable.
export function crossLedgerConflicts(v1Moves, v2Decisions) {
  const coveringByMemoryId = new Map()
  for (const dec of v2Decisions || []) {
    for (const mid of dec.memoryIds || []) coveringByMemoryId.set(mid, dec)
  }
  const conflicts = []
  for (const mv of v1Moves || []) {
    const covering = coveringByMemoryId.get(mv.memoryId)
    if (!covering) continue // v2 has no decision covering this memory yet — nothing to cross-check
    if (covering.tier === 'leave') {
      conflicts.push({
        memoryId: mv.memoryId,
        v1ToStopId: mv.toStopId,
        v2Tier: 'leave',
        v2PlaceId: null,
        reason: 'v1 would-move; covering v2 decision says leave',
      })
    } else if ((covering.place?.id ?? null) !== (mv.toStopId ?? null)) {
      conflicts.push({
        memoryId: mv.memoryId,
        v1ToStopId: mv.toStopId,
        v2Tier: covering.tier,
        v2PlaceId: covering.place?.id ?? null,
        reason: 'v1 and v2 target different places',
      })
    }
  }
  return conflicts
}

// ── the whole-audit report — the deliverable ────────────────────────────
//
// Per trip: both ledgers' verdicts + the cross-ledger conflicts. `tripId`
// scopes to one trip (the orchestrator's live-verification step); omitted,
// every non-deleted, non-fixture trip is audited. REPORT-ONLY — no write
// anywhere in this function or anything it calls.
export async function runEvidenceAudit(env, { tripId, now = Date.now() } = {}) {
  let tripIds
  if (tripId) {
    tripIds = SKIP_TRIP_IDS.has(tripId) ? [] : [tripId]
  } else {
    const { results } = await env.DB.prepare('SELECT id FROM trips WHERE deleted_at IS NULL').all()
    tripIds = (results || []).map((r) => r.id).filter((id) => !SKIP_TRIP_IDS.has(id))
  }

  const trips = []
  for (const id of tripIds) {
    let v2
    try {
      v2 = await auditV2ForTrip(env, id)
    } catch (e) {
      v2 = { tripId: id, error: String(e?.message || e) }
    }
    let v1
    try {
      v1 = await auditV1ForTrip(env, id, { now })
    } catch (e) {
      v1 = { tripId: id, error: String(e?.message || e) }
    }
    const conflicts = v2?.decisions && v1?.moves ? crossLedgerConflicts(v1.moves, v2.decisions) : []
    trips.push({ tripId: id, v2, v1, crossLedgerConflicts: conflicts })
  }

  const summary = trips.reduce(
    (acc, t) => {
      acc.trips++
      acc.v2AutoTotal += t.v2?.autos?.length || 0
      acc.v2AutoBarMismatches += t.v2?.barMismatches?.length || 0
      acc.v2AutoMeetingThreeDimTarget += (t.v2?.autos || []).filter((a) => a.meetsThreeDimTarget).length
      acc.v1MovesTotal += t.v1?.moves?.length || 0
      acc.v1Failures += t.v1?.failed || 0
      acc.crossLedgerConflictsTotal += t.crossLedgerConflicts.length
      return acc
    },
    {
      trips: 0,
      v2AutoTotal: 0,
      v2AutoBarMismatches: 0,
      v2AutoMeetingThreeDimTarget: 0,
      v1MovesTotal: 0,
      v1Failures: 0,
      crossLedgerConflictsTotal: 0,
    }
  )

  // The R5 gate this whole module exists to enforce (§R): green only when
  // every auto row re-derives its own bar, every v1 would-move clears
  // gps+time/margin/unanimous, and no cross-ledger conflict exists.
  const green = summary.v2AutoBarMismatches === 0 && summary.v1Failures === 0 && summary.crossLedgerConflictsTotal === 0

  return { generatedAt: new Date(now).toISOString(), green, summary, trips }
}
