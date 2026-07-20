// PARITY: the six Healing-Model engine libs are byte-identical mirrors —
// worker/src/{evidenceBench,settlingEngine,worldModel,imputation,visionPlacement,
// healLoop}.js ≡ app/src/lib/*.js (O1, BUILD_PLAN_HM_WEEK.md). The worker bundles
// only worker/src at deploy; the app is client-canonical. This test runs ONE shared
// corpus through the WHOLE pipeline via BOTH copies and asserts every intermediate is
// deep-equal — so a future edit to one copy that isn't mirrored to the other fails
// here, exactly like the established sessionHeal/sceneHash parity gates.
//
// It also asserts the pipeline produced NON-TRIVIAL output (a world model, a bench, a
// full settle, a consolidated ask), so parity can never pass vacuously on empty output.

import { describe, it, expect } from 'vitest'

import * as wBench from '../src/evidenceBench.js'
import * as wSettle from '../src/settlingEngine.js'
import * as wWorld from '../src/worldModel.js'
import * as wImpute from '../src/imputation.js'
import * as wVision from '../src/visionPlacement.js'
import * as wLoop from '../src/healLoop.js'

import * as cBench from '../../app/src/lib/evidenceBench.js'
import * as cSettle from '../../app/src/lib/settlingEngine.js'
import * as cWorld from '../../app/src/lib/worldModel.js'
import * as cImpute from '../../app/src/lib/imputation.js'
import * as cVision from '../../app/src/lib/visionPlacement.js'
import * as cLoop from '../../app/src/lib/healLoop.js'

const W = { ...wBench, ...wSettle, ...wWorld, ...wImpute, ...wVision, ...wLoop }
const C = { ...cBench, ...cSettle, ...cWorld, ...cImpute, ...cVision, ...cLoop }

const at = (h, m = 0) => Date.UTC(2026, 6, 4, h, m)
const NOW = Date.UTC(2026, 6, 10)

// Two DISTINCT candidate places ~220m apart (beyond coincidentMeters, inside the GPS
// kernel) — a burst midway fits both → genuine ask material (mirrors heal-loop.test).
const PLACES = [
  { id: 'X', name: 'Herring Cove', lat: 42.052, lng: -70.18, timeMin: 14 * 60, kind: 'stop' },
  { id: 'Y', name: 'Race Point', lat: 42.05, lng: -70.18, timeMin: 15 * 60, kind: 'stop' },
]
// a,b: located GPS; c: no coordinate → reconstructed by imputation from its affine
// mates. Vision signals on `a` exercise signage/placeType/lookalike.
const POINTS = [
  { id: 'a', memoryId: 'm1', at: at(14, 0), lat: 42.051, lng: -70.18, provGps: 'exif', placeType: 'beach', signage: 'Herring Cove', labels: ['sand', 'ocean'] },
  { id: 'b', memoryId: 'm1', at: at(14, 2), lat: 42.051, lng: -70.18, provGps: 'exif' },
  { id: 'c', memoryId: 'm1', at: at(14, 4) },
]
// Already-filed points → the vision exemplar corpus (what "Herring Cove" looks like).
const FILED = [
  { id: 'f1', memoryId: 'm9', currentStopId: 'X', placeType: 'beach', signage: 'Herring Cove', labels: ['sand', 'ocean'] },
  { id: 'f2', memoryId: 'm9', currentStopId: 'X', placeType: 'beach', labels: ['sand', 'dune'] },
]
// Prior trips for the cross-trip world model (name-keyed recurrence).
const TRIPS = [
  { id: 't1', endMs: at(0), stops: [{ name: 'Herring Cove', lat: 42.052, lng: -70.18 }] },
  { id: 't2', endMs: at(0), stops: [{ name: 'Herring Cove', lat: 42.052, lng: -70.18 }] },
]

// The WHOLE ladder, parameterised by which copy's modules run it.
function pipeline(M) {
  const worldModel = M.buildWorldModel(TRIPS)
  const exemplars = M.buildVisionExemplars(FILED)
  const b0 = M.buildEvidenceBench(POINTS, PLACES)
  const pairs = [...M.combineAffinity(b0.affinity, M.SETTLE_DEFAULTS).values()]
  const imputed = M.imputeSignals(POINTS, pairs)
  const bench = M.buildEvidenceBench(imputed, PLACES, { worldModel, now: NOW, exemplars })
  const settled = M.settle(bench, PLACES)
  const asks = M.consolidateAsks(settled.photos, pairs)
  const vis = M.visionWitnesses(POINTS, PLACES)
  return { worldModel, exemplars, b0, pairs, imputed, bench, settled, asks, vis }
}

const w = pipeline(W)
const c = pipeline(C)

describe('HM engine worker↔client parity (byte-identical mirrors, behaviour-identical)', () => {
  it('world model is identical and non-empty', () => {
    expect(c.worldModel).toEqual(w.worldModel)
    expect(w.worldModel.places.length).toBeGreaterThan(0)
  })
  it('vision exemplars are identical', () => {
    expect(c.exemplars).toEqual(w.exemplars)
  })
  it('evidence bench is identical with non-empty placement', () => {
    expect(c.b0).toEqual(w.b0)
    expect(c.bench).toEqual(w.bench)
    expect(w.bench.placement.length).toBeGreaterThan(0)
  })
  it('affinity pairs are identical', () => {
    expect(c.pairs).toEqual(w.pairs)
  })
  it('imputation is identical and preserves the corpus', () => {
    expect(c.imputed).toEqual(w.imputed)
    expect(w.imputed.length).toBe(POINTS.length)
  })
  it('settle is identical and settles every photo', () => {
    expect(c.settled.photos).toEqual(w.settled.photos)
    expect(w.settled.photos.size).toBe(POINTS.length)
  })
  it('consolidated asks are identical and non-trivial', () => {
    expect(c.asks).toEqual(w.asks)
    expect(w.asks.length).toBeGreaterThanOrEqual(1)
  })
  it('vision witnesses are identical', () => {
    expect(c.vis).toEqual(w.vis)
  })
})
