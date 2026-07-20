import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildEvidenceBench, BENCH_DEFAULTS } from '../../src/lib/evidenceBench.js'

// Two places STACKED on one spot (the Provincetown lodging + town beach) plus one far away.
const PLACES = [
  { id: 'lodging', name: 'The cottage', lat: 42.05, lng: -70.18, timeMin: null, kind: 'base' },
  { id: 'beach', name: 'Town beach', lat: 42.05, lng: -70.18, timeMin: 14 * 60, kind: 'stop' },
  { id: 'harbor', name: 'Harbor', lat: 42.06, lng: -70.24, timeMin: 18 * 60, kind: 'stop' },
]
const at = (h, m = 0) => Date.UTC(2026, 6, 4, h, m) // local wall-clock ms (offset applied upstream)
const P = (bench, w) => bench.placement.filter((e) => e.witness === w)
const A = (bench, w) => bench.affinity.filter((e) => e.witness === w)

// These tests assert the LESSONS are enforced by the code, not just written in a doc.

test('stacked places → BOTH get high membership (conflict), never a forced pick', () => {
  const bench = buildEvidenceBench([{ id: 'p1', at: at(14), lat: 42.05, lng: -70.18, provGps: 'exif' }], PLACES)
  const gps = P(bench, 'gps').find((e) => e.photoId === 'p1')
  assert.ok(gps, 'gps witness emitted')
  assert.ok(gps.support.lodging > 0.9 && gps.support.beach > 0.9, 'both stacked places supported — not one picked')
  const sum = Object.values(gps.support).reduce((a, b) => a + b, 0)
  assert.ok(sum > 1.5, 'memberships are unnormalized possibilities, NOT a distribution summing to 1')
})

test('no coordinate → gps ABSTAINS (emits nothing), never a zero vote', () => {
  const bench = buildEvidenceBench([{ id: 'p1', at: at(14) }], PLACES)
  assert.equal(P(bench, 'gps').length, 0)
})

test('far from every place → gps ABSTAINS, not a zero vote for distant places', () => {
  const bench = buildEvidenceBench([{ id: 'p1', at: at(14), lat: 40.0, lng: -74.0, provGps: 'exif' }], PLACES)
  assert.equal(P(bench, 'gps').length, 0, 'nothing within the soft kernel → no evidence at all')
})

test('current filing is ONE fallible witness (membership < 1), not an oracle; unfiled abstains', () => {
  const bench = buildEvidenceBench([
    { id: 'filed', at: at(14), currentStopId: 'beach' },
    { id: 'loose', at: at(15) },
  ], PLACES)
  const cf = P(bench, 'currentFiling')
  assert.equal(cf.length, 1, 'only the filed photo produces a filing witness (unfiled abstains)')
  assert.equal(cf[0].photoId, 'filed')
  assert.equal(cf[0].support.beach, BENCH_DEFAULTS.currentFilingWeight)
  assert.ok(cf[0].support.beach < 1, 'a filing is strong evidence but never proof')
  assert.equal(cf[0].tier, 'observed')
})

test('time-gap affinity is SOFT and continuous — no 40-minute cliff', () => {
  const a39 = A(buildEvidenceBench([{ id: 'a', at: at(12, 0) }, { id: 'b', at: at(12, 39) }], []), 'timeGap')[0].affinity
  const a41 = A(buildEvidenceBench([{ id: 'a', at: at(12, 0) }, { id: 'b', at: at(12, 41) }], []), 'timeGap')[0].affinity
  assert.ok(a39 > a41, 'monotone: a smaller gap is more same-moment')
  assert.ok(Math.abs(a39 - a41) < 0.05, 'no discontinuity across the old 40-min boundary')
  const a2 = A(buildEvidenceBench([{ id: 'a', at: at(12, 0) }, { id: 'b', at: at(12, 2) }], []), 'timeGap')[0].affinity
  assert.ok(a2 > a39 + 0.5, 'genuinely graded: a 2-min gap is far more same-moment than a 39-min one')
})

test('a propagated coordinate is DERIVED, a real read is OBSERVED — never conflated', () => {
  const bench = buildEvidenceBench([
    { id: 'real', at: at(14), lat: 42.05, lng: -70.18, provGps: 'exif' },
    { id: 'prop', at: at(14), lat: 42.05, lng: -70.18, provGps: 'propagated' },
    { id: 'bare', at: at(14), lat: 42.05, lng: -70.18 },
  ], PLACES)
  const tier = Object.fromEntries(P(bench, 'gps').map((e) => [e.photoId, e.tier]))
  assert.equal(tier.real, 'observed')
  assert.equal(tier.prop, 'derived')
  assert.equal(tier.bare, 'observed', 'an untagged coordinate is treated as a real read, not derived')
})

test('the bench emits only graded evidence — it never decides', async () => {
  const bench = buildEvidenceBench([{ id: 'p1', at: at(14), lat: 42.05, lng: -70.18, provGps: 'exif', currentStopId: 'beach' }], PLACES)
  assert.deepEqual(Object.keys(bench).sort(), ['affinity', 'placement', 'witnesses'])
  for (const e of bench.placement) {
    assert.equal(e.kind, 'placement')
    assert.ok(!('winner' in e || 'decision' in e || 'pick' in e), 'no decision leaked into evidence')
  }
  const mod = await import('../../src/lib/evidenceBench.js')
  for (const name of Object.keys(mod)) assert.ok(!/pick|decide|choose|argmax|winner/i.test(name), `no decider exported: ${name}`)
})

test('faces: shared → graded (Jaccard); disjoint → ABSTAIN (ignorance, not a boundary)', () => {
  const shared = buildEvidenceBench([
    { id: 'a', at: at(14), faces: ['fc2-aaa', 'fc2-bbb'] },
    { id: 'b', at: at(14), faces: ['fc2-bbb', 'fc2-ccc'] },
  ], [])
  const fa = A(shared, 'faces')
  assert.equal(fa.length, 1)
  assert.ok(Math.abs(fa[0].affinity - 1 / 3) < 1e-9, 'Jaccard membership over shared faces')
  const disjoint = buildEvidenceBench([
    { id: 'a', at: at(14), faces: ['fc2-aaa'] },
    { id: 'b', at: at(14), faces: ['fc2-zzz'] },
  ], [])
  assert.equal(A(disjoint, 'faces').length, 0, 'no shared face → abstain, NOT evidence of a different moment')
})

test('sequence: consecutive frames off one device are common-fate; pairs never cross devices', () => {
  const bench = buildEvidenceBench([
    { id: 'a', at: at(14), seq: 100, device: 'helen' },
    { id: 'b', at: at(14), seq: 101, device: 'helen' },
    { id: 'c', at: at(14), seq: 100, device: 'jon' },
  ], [])
  const sa = A(bench, 'sequence')
  assert.equal(sa.length, 1, 'one within-device consecutive pair only')
  assert.ok(sa[0].affinity > 0.9, 'a 1-step burst is near-certainly the same moment')
  assert.ok(!sa.some((e) => e.aId === 'c' || e.bId === 'c'), 'no cross-device pairing')
})
