import { test } from 'node:test'
import assert from 'node:assert/strict'
import { imputeSignals } from '../../src/lib/imputation.js'
import { buildEvidenceBench } from '../../src/lib/evidenceBench.js'
import { settle } from '../../src/lib/settlingEngine.js'

const at = (h, m = 0) => Date.UTC(2026, 6, 4, h, m)

test('never clobbers a real reading — an observed coordinate passes through untouched', () => {
  const out = imputeSignals(
    [{ id: 'A', at: at(14), lat: 42, lng: -70, provGps: 'exif' }, { id: 'B', at: at(14) }],
    [{ aId: 'A', bId: 'B', affinity: 0.9 }],
  )
  const A = out.find((p) => p.id === 'A')
  assert.equal(A.lat, 42)
  assert.equal(A.provGps, 'exif')
  assert.ok(!A.imputed, 'a real read is never overwritten')
})

test('reconstructs a missing coordinate from affine donors — DERIVED, with provenance', () => {
  const B = imputeSignals(
    [{ id: 'A', at: at(14), lat: 42, lng: -70, provGps: 'exif' }, { id: 'B', at: at(14) }],
    [{ aId: 'A', bId: 'B', affinity: 0.9 }],
  ).find((p) => p.id === 'B')
  assert.ok(Math.abs(B.lat - 42) < 1e-9 && Math.abs(B.lng + 70) < 1e-9, 'borrowed A’s coordinate')
  assert.equal(B.provGps, 'propagated', 'tagged derived, never observed')
  assert.equal(B.imputed, true)
  assert.deepEqual(B.derivedFrom, ['A'], 'carries its provenance')
})

test('never fabricates from nothing — no affine donor with a coord → stays abstaining', () => {
  const out = imputeSignals([{ id: 'B', at: at(14) }], [])
  assert.ok(!Number.isFinite(out[0].lat), 'B still has no coordinate — reconstruct, never invent')
})

test('affinity-weighted centroid: the more-affine donor pulls harder', () => {
  const B = imputeSignals(
    [
      { id: 'near', at: at(14), lat: 40, lng: -70, provGps: 'exif' },
      { id: 'far', at: at(14), lat: 50, lng: -70, provGps: 'exif' },
      { id: 'B', at: at(14) },
    ],
    [{ aId: 'B', bId: 'near', affinity: 0.9 }, { aId: 'B', bId: 'far', affinity: 0.1 }],
  ).find((p) => p.id === 'B')
  assert.ok(B.lat < 42, `weighted toward the more-affine donor (got ${B.lat.toFixed(2)}, not the midpoint 45)`)
})

test('lifts a thin cluster through the whole step — but only SOFTLY (derived), never files', () => {
  const points = [{ id: 'A', at: at(14), lat: 42, lng: -70, provGps: 'exif' }, { id: 'B', at: at(14) }]
  const places = [{ id: 'X', name: 'x', lat: 42, lng: -70 }]
  const imputed = imputeSignals(points, [{ aId: 'A', bId: 'B', affinity: 0.9 }])
  const B = settle(buildEvidenceBench(imputed, places), places).photos.get('B')
  assert.equal(B.top, 'X', 'B is lifted to the place via its reconstructed coordinate')
  assert.equal(B.tier, 'derived', 'but its evidence is derived')
  assert.notEqual(B.destination, 'file', 'so it heals softly — an imputed read never files silently')
})

test('an imputed (derived) coordinate speaks SOFTER than a real one at the same spot', () => {
  const places = [{ id: 'X', name: 'x', lat: 42, lng: -70 }]
  const obs = buildEvidenceBench([{ id: 'p', at: at(14), lat: 42, lng: -70, provGps: 'exif' }], places).placement.find((e) => e.witness === 'gps')
  const der = buildEvidenceBench([{ id: 'p', at: at(14), lat: 42, lng: -70, provGps: 'propagated' }], places).placement.find((e) => e.witness === 'gps')
  assert.ok(der.support.X < obs.support.X, 'wider doubt: the derived read carries less membership')
})
