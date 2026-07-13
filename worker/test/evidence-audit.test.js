// W7 — the evidence-constitution audit (BUILD_PLAN_WITNESS_FLEET_2.md §R W7).
// REPORT-ONLY: this file proves the audit's mapping/recompute/cross-check
// LOGIC (pure, synthetic-fixture mutation tests — no D1 needed for most of
// it) and then wires it against REAL D1 (migrations 017/019 already in
// applySchema) to prove the read-only recompute + the diag route work end to
// end on real rows. Nothing here writes to memory_heal_decisions or
// memory_stop_moves outside of the fixture setup itself.

import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import { applySchema } from './helpers/schema.js'
import worker from '../src/index.js'
import { recordHealDecisions } from '../src/photoHealRunner.js'
import {
  auditDecisionRow,
  auditV2ForTrip,
  evaluateV1Move,
  auditV1ForTrip,
  crossLedgerConflicts,
  runEvidenceAudit,
} from '../src/evidenceAudit.js'

const NOW = 1_700_000_000_000

// ── a minimal memory_heal_decisions row builder (matches the D1 column set —
// migration 019) so the pure-mapping tests read like the real table. ───────
function row({
  tripId = 't1',
  isoDate = '2026-07-01',
  memoryIds = ['m1'],
  placeId = 's-a',
  placeName = 'The museum',
  tier = 'auto',
  evidence,
  signals = {},
} = {}) {
  const resolvedEvidence = signals.evidence ?? evidence ?? null
  return {
    trip_id: tripId,
    iso_date: isoDate,
    memory_ids: JSON.stringify(memoryIds),
    place_id: placeId,
    place_name: placeName,
    tier,
    evidence: resolvedEvidence,
    signals_json: JSON.stringify({ ...signals, evidence: resolvedEvidence }),
  }
}

describe('auditDecisionRow — the v2 pure mapping', () => {
  it('evidence "gps" with a reference-tier prov set: D2 agreed, REFERENCE-anchored', () => {
    const r = auditDecisionRow(row({ evidence: 'gps', signals: { evidence: 'gps', referenceLocatedCount: 1, gpsProv: ['exif'] } }))
    expect(r.dims).toEqual([{ dim: 'D2', evidence: 'gps', agreed: true, referenceTier: true }])
    expect(r.referenceAnchored).toBe(true)
    expect(r.agreeingCount).toBe(1)
    // D1 absent — a Pass-1 GPS auto never checks time-fit against the place.
    expect(r.timeFit).toEqual({ present: false, agreed: false })
    expect(r.meetsThreeDimTarget).toBe(false)
    expect(r.barMismatch).toBe(false) // reference-anchored + no suspect time + no conflicts → bar holds
  })

  it('evidence "gps" with NO reference-tier prov: D2 agreed but NON-reference — an auto row here is a BAR MISMATCH', () => {
    // sessionScorer's canGpsAuto requires referenceAnchored, so a real 'auto'
    // row should never carry referenceLocatedCount:0 — this is exactly the
    // regression the audit exists to catch (defense-in-depth, W8's rule-1
    // leak). "do not assume" per the constitution: read the field, don't
    // infer reference-tier from the evidence string alone.
    const r = auditDecisionRow(row({ evidence: 'gps', signals: { evidence: 'gps', referenceLocatedCount: 0 } }))
    expect(r.dims[0]).toEqual({ dim: 'D2', evidence: 'gps', agreed: true, referenceTier: false })
    expect(r.referenceAnchored).toBe(false)
    expect(r.computedMeetsBar).toBe(false)
    expect(r.barMismatch).toBe(true) // tier is 'auto' (the row default) — flagged
  })

  it('evidence "record": D8 agreed, inherently reference; with a numeric time-fit, both D8+D1 climb toward the target', () => {
    const r = auditDecisionRow(
      row({ evidence: 'record', placeId: 'rec-1', signals: { evidence: 'record', timeFitMin: 10, placeKind: 'record' } })
    )
    expect(r.dims.map((d) => d.dim)).toEqual(['D8', 'D1'])
    expect(r.referenceAnchored).toBe(true)
    expect(r.agreeingCount).toBe(2)
    expect(r.barMismatch).toBe(false)
  })

  it('evidence "base": D7-adjacent agreed but NEVER counts as reference-tier location (table rule), even though it satisfies TODAY\'s bar', () => {
    const r = auditDecisionRow(row({ evidence: 'base', placeId: '__base__:2026-07-01', signals: { evidence: 'base', timeFitMin: 5 } }))
    expect(r.dims.map((d) => d.dim)).toEqual(['D7', 'D1'])
    expect(r.referenceAnchored).toBe(false) // the table's own strict counting — base never counts
    expect(r.computedMeetsBar).toBe(true) // rule 1(A)(i)'s explicit carve-out — "the code's existing posture"
    expect(r.barMismatch).toBe(false)
    expect(r.agreeingCount).toBe(2)
    expect(r.meetsThreeDimTarget).toBe(false)
  })

  it('D1 time-fit beyond autoNearMin does NOT count as agreed, and (review 2026-07-13) FAILS the bar for a Pass-2 auto — rule 1(A)(ii) proximity half', () => {
    const r = auditDecisionRow(row({ evidence: 'record', signals: { evidence: 'record', timeFitMin: 80 } }))
    expect(r.dims.map((d) => d.dim)).toEqual(['D8'])
    expect(r.timeFit).toEqual({ present: true, agreed: false, timeFitMin: 80, autoNearMin: 45 })
    // The proximity half of rule 1(A)(ii): a record/base AUTO whose time-fit
    // blew past autoNearMin must NOT silently pass the enforcement wall.
    expect(r.computedMeetsBar).toBe(false)
    expect(r.barMismatch).toBe(true) // default tier is 'auto' → this is exactly the drift W7 must catch
  })

  it('a Pass-2 record auto WITHIN autoNearMin passes the bar (the proximity check does not over-fire)', () => {
    const r = auditDecisionRow(row({ evidence: 'record', signals: { evidence: 'record', timeFitMin: 20 } }))
    expect(r.timeFit).toEqual({ present: true, agreed: true, timeFitMin: 20, autoNearMin: 45 })
    expect(r.computedMeetsBar).toBe(true)
    expect(r.barMismatch).toBe(false)
  })

  it('a Pass-1 GPS auto with NO timeFitMin is EXEMPT from the proximity half (time was the spine, never checked against the place)', () => {
    // reference-anchored GPS, no timeFitMin, not time-suspect → still meets the bar.
    const r = auditDecisionRow(row({ evidence: 'gps', signals: { evidence: 'gps', referenceLocatedCount: 1 } }))
    expect(r.timeFit.present).toBe(false)
    expect(r.computedMeetsBar).toBe(true)
    expect(r.barMismatch).toBe(false)
  })

  it('vision-family fields (landmark pin) stack as ONE extra witness alongside gps/record/base, never three', () => {
    const r = auditDecisionRow(
      row({
        evidence: 'record',
        signals: {
          evidence: 'record',
          timeFitMin: 5,
          pin: { lat: 1, lng: 2, name: 'A-House', source: 'landmark', query: 'A-House' },
        },
      })
    )
    // D8 (record) + D1 (time-fit) + D4/D5/D6 (the pin) — the pin is ONE
    // witness no matter how many vision fields technically fired.
    expect(r.dims.map((d) => d.dim)).toEqual(['D8', 'D1', 'D4/D5/D6'])
    expect(r.agreeingCount).toBe(3)
    expect(r.meetsThreeDimTarget).toBe(true)
  })

  it('evidence "vision" (the leave->confirm naming override) is its own single witness, never double-counted against its own pin', () => {
    const r = auditDecisionRow(
      row({ evidence: 'vision', tier: 'confirm', signals: { evidence: 'vision', visionName: 'At the beach' } })
    )
    expect(r.dims).toEqual([{ dim: 'D4/D5/D6', evidence: 'vision', agreed: true, referenceTier: false }])
    expect(r.agreeingCount).toBe(1)
  })

  it('D16 hand-filed evidence AGREEING with the filed place counts as a reference-tier witness', () => {
    const r = auditDecisionRow(
      row({ evidence: 'gps', placeId: 's-a', signals: { evidence: 'gps', referenceLocatedCount: 1, handFiledStop: 's-a', handFiledBy: 'jonathan' } })
    )
    expect(r.dims.map((d) => d.dim)).toEqual(['D2', 'D16'])
    expect(r.agreeingCount).toBe(2)
    expect(r.handFiledConflict).toBeNull()
  })

  it('D16 hand-filed evidence pointing at a DIFFERENT place is a conflict, not agreement — and fails an auto row\'s bar', () => {
    const r = auditDecisionRow(
      row({ evidence: 'gps', placeId: 's-a', signals: { evidence: 'gps', referenceLocatedCount: 1, handFiledStop: 's-elsewhere' } })
    )
    expect(r.dims.map((d) => d.dim)).toEqual(['D2']) // no D16 credit
    expect(r.handFiledConflict).toEqual({ handFiledStop: 's-elsewhere', filedPlaceId: 's-a' })
    expect(r.barMismatch).toBe(true)
  })

  it('a previously-DISMISSED filing riding an auto decision is a conflict (rule 1(iii) non-conflict)', () => {
    const r = auditDecisionRow(
      row({ evidence: 'gps', signals: { evidence: 'gps', referenceLocatedCount: 1, dismissedBefore: true } })
    )
    expect(r.dismissedConflict).toBe(true)
    expect(r.barMismatch).toBe(true)
  })

  it('timeAnchorSuspect on an otherwise reference-anchored auto row fails the bar (Pass-1 upload-time gate)', () => {
    const r = auditDecisionRow(
      row({ evidence: 'gps', signals: { evidence: 'gps', referenceLocatedCount: 1, timeAnchorSuspect: true } })
    )
    expect(r.timeAnchorSuspect).toBe(true)
    expect(r.computedMeetsBar).toBe(false)
    expect(r.barMismatch).toBe(true)
  })

  it('evidence "discovered" never rides an auto row in practice but maps honestly on confirm/leave', () => {
    const r = auditDecisionRow(row({ evidence: 'discovered', tier: 'confirm', signals: { evidence: 'discovered' } }))
    expect(r.dims).toEqual([{ dim: 'D7', evidence: 'discovered', agreed: true, referenceTier: false }])
    expect(r.barMismatch).toBe(false) // not an auto row — no mismatch to report
  })

  it('evidence "time-only"/"none" carry no location-bearing dimension; D1 alone can still stand on a non-auto row', () => {
    const r = auditDecisionRow(row({ evidence: 'time-only', tier: 'confirm', placeId: 's-a', signals: { evidence: 'time-only', timeFitMin: 20 } }))
    expect(r.dims).toEqual([{ dim: 'D1', evidence: 'time-fit', agreed: true, referenceTier: false }])
    expect(r.referenceAnchored).toBe(false)
  })

  it('"none" evidence (a leave, nothing fits) carries zero dims', () => {
    const r = auditDecisionRow(row({ evidence: 'none', tier: 'leave', placeId: null, signals: { evidence: 'none', nearestMin: null } }))
    expect(r.dims).toEqual([])
    expect(r.agreeingCount).toBe(0)
  })
})

describe('evaluateV1Move — the v1 recompute grading (pure, mutation-tested)', () => {
  it('passes: gps+time, unanimous, a clear margin', () => {
    const r = evaluateV1Move({ memoryId: 'm1', toStopId: 's-b', matchType: 'gps+time', unanimous: true, winnerMeters: 20, runnerUpMeters: 5000 })
    expect(r.pass).toBe(true)
    expect(r.failedGates).toEqual([])
  })

  it('fails: matchType is not gps+time (a time-only would-move must never pass)', () => {
    const r = evaluateV1Move({ memoryId: 'm1', toStopId: 's-b', matchType: 'time', unanimous: true, winnerMeters: null, runnerUpMeters: null })
    expect(r.pass).toBe(false)
    expect(r.failedGates).toContain('matchType!==gps+time')
  })

  it('fails: not unanimous (located photos disagreed — a plurality guess)', () => {
    const r = evaluateV1Move({ memoryId: 'm1', toStopId: 's-b', matchType: 'gps+time', unanimous: false, winnerMeters: 20, runnerUpMeters: 5000 })
    expect(r.pass).toBe(false)
    expect(r.failedGates).toContain('not-unanimous')
  })

  it('fails: margin too close (runner-up not beaten by max(100m, 25%))', () => {
    const r = evaluateV1Move({ memoryId: 'm1', toStopId: 's-b', matchType: 'gps+time', unanimous: true, winnerMeters: 190, runnerUpMeters: 200 })
    expect(r.pass).toBe(false)
    expect(r.failedGates).toContain('margin-not-ok')
  })

  it('reports every failing gate at once, not just the first', () => {
    const r = evaluateV1Move({ memoryId: 'm1', toStopId: 's-b', matchType: 'time', unanimous: false, winnerMeters: 190, runnerUpMeters: 200 })
    expect(r.failedGates.sort()).toEqual(['margin-not-ok', 'matchType!==gps+time', 'not-unanimous'].sort())
  })
})

describe('crossLedgerConflicts — pure cross-ledger check (mutation-tested)', () => {
  const v2Decision = (memoryIds, tier, placeId) => ({ memoryIds, tier, place: { id: placeId } })

  it('a v1 would-move covered by a v2 "leave" decision is a conflict', () => {
    const v1 = [{ memoryId: 'm1', toStopId: 's-b' }]
    const v2 = [v2Decision(['m1'], 'leave', null)]
    const conflicts = crossLedgerConflicts(v1, v2)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toMatchObject({ memoryId: 'm1', v1ToStopId: 's-b', v2Tier: 'leave' })
  })

  it('a v1 would-move whose covering v2 decision targets a DIFFERENT place is a conflict', () => {
    const v1 = [{ memoryId: 'm1', toStopId: 's-b' }]
    const v2 = [v2Decision(['m1'], 'confirm', 's-c')]
    const conflicts = crossLedgerConflicts(v1, v2)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toMatchObject({ memoryId: 'm1', v1ToStopId: 's-b', v2Tier: 'confirm', v2PlaceId: 's-c' })
  })

  it('a v1 would-move whose covering v2 decision agrees on the SAME place is NOT a conflict', () => {
    const v1 = [{ memoryId: 'm1', toStopId: 's-b' }]
    const v2 = [v2Decision(['m1'], 'auto', 's-b')]
    expect(crossLedgerConflicts(v1, v2)).toEqual([])
  })

  it('a v1 would-move with no covering v2 decision at all is not a conflict (nothing to cross-check)', () => {
    const v1 = [{ memoryId: 'm1', toStopId: 's-b' }]
    expect(crossLedgerConflicts(v1, [])).toEqual([])
  })
})

// ── real D1 integration: the recompute + report wiring against real rows ──
const tripJson = (over = {}) =>
  JSON.stringify({
    id: 't1',
    shape: 'route',
    days: [
      {
        n: 1,
        isoDate: '2026-07-01',
        stops: [
          { id: 's-a', title: 'The museum', time: '10:00 AM', lat: 30.0, lng: -90.0 },
          { id: 's-b', title: 'The pier', time: '2:00 PM', lat: 31.0, lng: -91.0 },
        ],
      },
    ],
    ...over,
  })

async function seedTrip(id = 't1', dataJson = tripJson(), stamp = 200) {
  await env.DB.prepare('INSERT INTO trips (id, data_json, updated_at) VALUES (?, ?, ?)').bind(id, dataJson, stamp).run()
}

async function seedMemory({
  id = 'm1', tripId = 't1', stopId = 's-a', lat = 31.0, lng = -91.0,
  prov = { source: 'auto', by: 'matcher', tripRev: 100 }, updatedAt = 50,
  capturedAt = '2026-07-01T15:00:00.000Z', gpsProv,
}) {
  const ref = { key: `${id}/p0`, lat, lng, capturedAt }
  if (gpsProv) ref.prov = { gps: gpsProv }
  await env.DB.prepare(
    `INSERT INTO memories (id, trip_id, stop_id, author_traveler, visibility, photo_r2_keys_json, stop_prov_json, created_at, updated_at)
     VALUES (?, ?, ?, 'jonathan', 'shared', ?, ?, ?, ?)`
  ).bind(id, tripId, stopId, JSON.stringify([ref]), prov ? JSON.stringify(prov) : null, 10, updatedAt).run()
}

beforeEach(async () => {
  await applySchema(env.DB)
  for (const t of ['memories', 'trips', 'memory_stop_moves', 'memory_heal_decisions']) {
    await env.DB.prepare(`DELETE FROM ${t}`).run()
  }
})

describe('auditV2ForTrip — real D1, via recordHealDecisions', () => {
  it('a GPS reference auto decision reports D2-reference, agreeingCount 1, D1 honestly absent, no bar mismatch', async () => {
    await seedTrip()
    await seedMemory({ id: 'm1', stopId: 's-a', lat: 30.0, lng: -90.0, gpsProv: 'exif' })
    await recordHealDecisions(env, 't1', { mode: 'shadow', now: NOW })
    const report = await auditV2ForTrip(env, 't1')
    expect(report.tiers.auto).toBe(1)
    expect(report.autos).toHaveLength(1)
    const a = report.autos[0]
    expect(a.evidence).toBe('gps')
    expect(a.referenceAnchored).toBe(true)
    expect(a.timeFit.present).toBe(false) // Pass-1 GPS auto — honestly absent
    expect(a.agreeingCount).toBe(1)
    expect(a.meetsThreeDimTarget).toBe(false)
    expect(a.barMismatch).toBe(false)
    expect(report.barMismatches).toEqual([])
  })

  it('a GPS decision with NO reference-tier prov never reaches "auto" today (confirms the tier gate the audit cross-checks)', async () => {
    await seedTrip()
    await seedMemory({ id: 'm1', stopId: 's-a', lat: 30.0, lng: -90.0 }) // no prov.gps
    await recordHealDecisions(env, 't1', { mode: 'shadow', now: NOW })
    const report = await auditV2ForTrip(env, 't1')
    expect(report.tiers.auto).toBe(0)
    expect(report.tiers.confirm).toBe(1)
    expect(report.barMismatches).toEqual([]) // nothing mismatched — the engine itself demoted it correctly
  })
})

describe('auditV1ForTrip — real D1 recompute via loadAndDecide', () => {
  it('a real would-move (agenda-fresher, big margin) passes the audit', async () => {
    await seedTrip('t1', tripJson(), 200)
    await seedMemory({}) // filed s-a (tripRev 100), photo GPS at s-b's coords → fresher agenda would-move
    const report = await auditV1ForTrip(env, 't1', { now: NOW })
    expect(report.moves).toHaveLength(1)
    expect(report.moves[0]).toMatchObject({ memoryId: 'm1', toStopId: 's-b', matchType: 'gps+time', unanimous: true, pass: true })
    expect(report.passed).toBe(1)
    expect(report.failed).toBe(0)
    expect(report.failures).toEqual([])
  })

  it('no trip → noTrip, empty report', async () => {
    const report = await auditV1ForTrip(env, 'nope', { now: NOW })
    expect(report.noTrip).toBe(true)
    expect(report.moves).toEqual([])
  })

  it('already-filed correctly: no would-move, nothing to audit', async () => {
    await seedTrip('t1', tripJson(), 200)
    await seedMemory({ stopId: 's-b', lat: 31.0, lng: -91.0, prov: { source: 'auto', by: 'matcher', tripRev: 200 } })
    const report = await auditV1ForTrip(env, 't1', { now: NOW })
    expect(report.moves).toEqual([])
    expect(report.passed).toBe(0)
    expect(report.failed).toBe(0)
  })
})

describe('runEvidenceAudit — the whole report, real D1', () => {
  it('is green on a clean trip with a real reference-anchored auto and no would-moves left', async () => {
    await seedTrip('t1', tripJson(), 200)
    await seedMemory({ id: 'm1', stopId: 's-b', lat: 31.0, lng: -91.0, gpsProv: 'exif', prov: { source: 'auto', by: 'matcher', tripRev: 200 } })
    await recordHealDecisions(env, 't1', { mode: 'shadow', now: NOW })
    const report = await runEvidenceAudit(env, { now: NOW })
    expect(report.trips).toHaveLength(1)
    expect(report.summary.v1Failures).toBe(0)
    expect(report.summary.crossLedgerConflictsTotal).toBe(0)
    expect(report.green).toBe(true)
  })

  it('skips the volleyball-2026 fixture trip even when present', async () => {
    await seedTrip('t1', tripJson(), 200)
    await seedTrip('volleyball-2026', tripJson({ id: 'volleyball-2026' }), 200)
    await seedMemory({ id: 'm1', stopId: 's-a', lat: 30.0, lng: -90.0, gpsProv: 'exif' })
    await recordHealDecisions(env, 't1', { mode: 'shadow', now: NOW })
    const report = await runEvidenceAudit(env, { now: NOW })
    expect(report.trips.map((t) => t.tripId)).toEqual(['t1'])
  })

  it('a `trip` filter scopes the report to one trip', async () => {
    await seedTrip('t1', tripJson(), 200)
    await seedTrip('t2', tripJson({ id: 't2' }), 200)
    const report = await runEvidenceAudit(env, { tripId: 't1', now: NOW })
    expect(report.trips.map((t) => t.tripId)).toEqual(['t1'])
  })

  it('cross-ledger conflict surfaces in the full report when v1 and v2 disagree (real v1, synthetic-comparand v2 wired through the real function)', async () => {
    await seedTrip('t1', tripJson(), 200)
    await seedMemory({}) // real would-move to s-b (see auditV1ForTrip test above)
    const v1 = await auditV1ForTrip(env, 't1', { now: NOW })
    const conflicts = crossLedgerConflicts(v1.moves, [{ memoryIds: ['m1'], tier: 'leave', place: { id: null } }])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].reason).toMatch(/leave/)
  })
})

describe('GET /diag/evidence-audit — gated diagnostic route', () => {
  const KEY = 'test-evidence-key-0123456789'

  async function getDiag({ key, withKeyOnEnv = true, query = '' } = {}) {
    const testEnv = withKeyOnEnv ? { ...env, ADMIN_DIAGNOSTIC_KEY: KEY } : { ...env }
    const headers = { Origin: 'http://localhost:5173' }
    if (key) headers.Authorization = `Bearer ${key}`
    const req = new Request(`https://worker.test/diag/evidence-audit${query}`, { method: 'GET', headers })
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, testEnv, ctx)
    await waitOnExecutionContext(ctx)
    return res
  }

  it('with the right key, returns the report JSON', async () => {
    await seedTrip('t1', tripJson(), 200)
    await seedMemory({ id: 'm1', stopId: 's-a', lat: 30.0, lng: -90.0, gpsProv: 'exif' })
    await recordHealDecisions(env, 't1', { mode: 'shadow', now: NOW })
    const res = await getDiag({ key: KEY })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.trips.some((t) => t.tripId === 't1')).toBe(true)
    expect(typeof body.green).toBe('boolean')
  })

  it('a `trip` query param scopes the route to one trip', async () => {
    await seedTrip('t1', tripJson(), 200)
    await seedTrip('t2', tripJson({ id: 't2' }), 200)
    const res = await getDiag({ key: KEY, query: '?trip=t1' })
    const body = await res.json()
    expect(body.trips.map((t) => t.tripId)).toEqual(['t1'])
  })

  it('a WRONG key is 404 (route stays invisible)', async () => {
    const res = await getDiag({ key: 'wrong-key' })
    expect(res.status).toBe(404)
  })

  it('a MISSING Authorization header is 404', async () => {
    const res = await getDiag({})
    expect(res.status).toBe(404)
  })

  it('when ADMIN_DIAGNOSTIC_KEY is UNSET on the env, the route does not exist', async () => {
    const res = await getDiag({ key: KEY, withKeyOnEnv: false })
    expect(res.status).toBe(404)
  })
})
