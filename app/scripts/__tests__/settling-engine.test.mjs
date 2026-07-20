import { test } from 'node:test'
import assert from 'node:assert/strict'
import { settle, combineOwnPlacement, combineAffinity, SETTLE_DEFAULTS } from '../../src/lib/settlingEngine.js'

const pl = (witness, tier, photoId, support) => ({ kind: 'placement', witness, tier, photoId, support })
const af = (witness, tier, aId, bId, affinity) => ({ kind: 'affinity', witness, tier, aId, bId, affinity })
const bench = (placement = [], affinity = []) => ({ placement, affinity })
const ph = (res, id) => res.photos.get(id)

// Every test asserts a lesson is enforced by the code.

test('correlation discount: correlated witnesses count once (guard vs false confidence)', () => {
  // AFFINITY: timeGap + sequence share a group → weighted MAX; scene + faces are independent → noisy-OR.
  const same = [...combineAffinity([af('timeGap', 'observed', 'a', 'b', 0.8), af('sequence', 'observed', 'a', 'b', 0.8)], SETTLE_DEFAULTS).values()][0].affinity
  const indep = [...combineAffinity([af('scene', 'observed', 'a', 'b', 0.8), af('faces', 'observed', 'a', 'b', 0.8)], SETTLE_DEFAULTS).values()][0].affinity
  assert.ok(Math.abs(same - 0.8) < 1e-9, 'two correlated views count as one (max), not stacked')
  assert.ok(indep > 0.9, 'two independent views DO reinforce')
  assert.ok(same < indep, 'agreement between correlated witnesses is discounted vs independent ones')

  // PLACEMENT: same discipline, groups configurable (seed, fittable).
  const ev = [pl('gps', 'observed', 'p', { X: 0.9 }), pl('currentFiling', 'observed', 'p', { X: 0.9 })]
  const grouped = combineOwnPlacement(ev, { weights: {}, placementGroups: [['gps', 'currentFiling']] }).get('p').X.membership
  const ungrouped = combineOwnPlacement(ev, { weights: {}, placementGroups: [['gps'], ['currentFiling']] }).get('p').X.membership
  assert.ok(Math.abs(grouped - 0.9) < 1e-9 && ungrouped > 0.98 && grouped < ungrouped, 'grouping them discounts the redundancy')
})

test('neighbour borrowing LIFTS a weak photo (guard vs false diffidence), but only softly', () => {
  const places = [{ id: 'X', lat: 42, lng: -70 }]
  const res = settle(bench(
    [pl('gps', 'observed', 'A', { X: 0.95 })], // A has strong OWN evidence; B has none
    [af('timeGap', 'observed', 'A', 'B', 0.95)], // A and B are strongly the same moment
  ), places)
  const A = ph(res, 'A'), B = ph(res, 'B')
  assert.equal(A.destination, 'file', 'the anchor files on its own observed evidence')
  assert.equal(B.top, 'X', 'the weak photo is lifted to its moment’s place')
  assert.ok(B.topM > 0.4, `lifted from zero to ${B.topM.toFixed(2)} — under-confidence actively fought`)
  assert.equal(B.destination, 'heal', 'but its confidence is BORROWED → heal softly, never file silently')
  assert.equal(B.tier, 'derived')
  assert.ok(B.borrowedHeavy)
})

test('a witness voting elsewhere never LOWERS another place (no negative votes; possibility)', () => {
  const places = [{ id: 'X', lat: 42, lng: -70 }, { id: 'Y', lat: 42.2, lng: -70.3 }]
  const res = settle(bench([pl('gps', 'observed', 'p', { X: 0.9 }), pl('time', 'observed', 'p', { Y: 0.8 })]), places)
  assert.ok(Math.abs(ph(res, 'p').membership.X - 0.9) < 1e-6, 'X keeps its 0.9 even though time voted for Y')
})

test('conflict between DISTINCT places → ASK (not a forced pick); memberships stay unnormalised', () => {
  const places = [{ id: 'X', lat: 42.0, lng: -70.0 }, { id: 'Y', lat: 42.2, lng: -70.3 }]
  const res = settle(bench([pl('gps', 'observed', 'p', { X: 0.9, Y: 0.85 })]), places)
  const p = ph(res, 'p')
  assert.ok(p.conflict >= 0.55, 'two places genuinely fit')
  assert.equal(p.destination, 'ask')
  assert.notEqual(p.destination, 'file')
  assert.ok(p.membership.X + p.membership.Y > 1, 'possibility, not probability — memberships are NOT normalised')
})

test('conflict between COINCIDENT places → LEAVE loose, never ASK (the Provincetown case)', () => {
  const places = [{ id: 'lodging', lat: 42, lng: -70 }, { id: 'beach', lat: 42, lng: -70 }] // stacked
  const res = settle(bench([pl('gps', 'observed', 'p', { lodging: 0.9, beach: 0.9 })]), places)
  const p = ph(res, 'p')
  assert.equal(p.destination, 'leave', 'no glance can separate two places on one spot — asking buys nothing')
  assert.match(p.reason, /same spot/)
})

test('ignorance → LEAVE (distinct from conflict): nothing fits, so no question is worth asking', () => {
  const places = [{ id: 'X', lat: 42, lng: -70 }]
  const res = settle(bench([pl('gps', 'observed', 'p', { X: 0.15 })]), places) // below the floor
  const p = ph(res, 'p')
  assert.equal(p.destination, 'leave')
  assert.ok(p.ignorance > 0.7 && p.conflict < 0.25, 'this is ignorance, not conflict — they route differently')
})

test('strong, clear, OBSERVED evidence → file silently', () => {
  const places = [{ id: 'X', lat: 42, lng: -70 }]
  assert.equal(ph(settle(bench([pl('gps', 'observed', 'p', { X: 0.9 })]), places), 'p').destination, 'file')
})

test('derived (imputed) evidence NEVER files silently, even when strong', () => {
  const places = [{ id: 'X', lat: 42, lng: -70 }]
  const p = ph(settle(bench([pl('gps', 'derived', 'p', { X: 0.9 })]), places), 'p')
  assert.equal(p.tier, 'derived')
  assert.equal(p.destination, 'heal', 'a propagated coordinate can heal softly, but must not pose as an observed fact')
})

test('the decision criterion MOVES — it is a parameter, not a hard rule baked into the code', () => {
  const places = [{ id: 'X', lat: 42, lng: -70 }]
  const b = bench([pl('gps', 'observed', 'p', { X: 0.9 })])
  assert.equal(ph(settle(b, places), 'p').destination, 'file', 'default criterion: files')
  assert.equal(ph(settle(b, places, { crit: { strong: 0.95 } }), 'p').destination, 'heal', 'raise the bar and the same evidence heals instead — the line moved, nothing was recompiled')
})
