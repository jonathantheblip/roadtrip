// Tests for the pure query logic in faceIndex.js — selectPhotosWith and
// personCounts (the IndexedDB persistence is browser-only, exercised via
// e2e). These prove the join of "scanned face embeddings" × "enrolled
// people" answers "which photos is this person in", picks the most
// confident face per photo, ignores strangers, and surfaces the face box
// (best-light sizing). Synthetic vectors, seeded RNG, non-vacuous (G7).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { l2normalize, enrollPerson } from '../../src/lib/faceMatch.js'
import { selectPhotosWith, personCounts } from '../../src/lib/faceIndex.js'

function mulberry32(seed) {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function randDir(rng, dim) {
  const v = new Float32Array(dim)
  for (let i = 0; i < dim; i++) v[i] = rng() * 2 - 1
  return l2normalize(v)
}
function jitter(base, rng, scale) {
  const v = new Float32Array(base.length)
  for (let i = 0; i < base.length; i++) v[i] = base[i] + (rng() * 2 - 1) * scale
  return v
}

const DIM = 64
function scene() {
  const rng = mulberry32(21)
  const baseR = randDir(rng, DIM)
  const baseA = randDir(rng, DIM)
  const centroids = [
    enrollPerson('rafa', [jitter(baseR, rng, 0.05), jitter(baseR, rng, 0.05)]),
    enrollPerson('aurelia', [jitter(baseA, rng, 0.05), jitter(baseA, rng, 0.05)]),
  ]
  const entries = [
    { key: 'p1', isVideo: false },
    { key: 'p2', isVideo: false },
    { key: 'p3', isVideo: false },
    { key: 'p4', isVideo: false }, // stranger
    { key: 'p5', isVideo: false }, // no faces
    { key: 'p6', isVideo: false }, // not scanned at all
  ]
  const facesByKey = {
    p1: { faces: [{ embedding: jitter(baseR, rng, 0.05), box: [0, 0, 100, 100] }] }, // rafa, big
    p2: { faces: [{ embedding: jitter(baseA, rng, 0.05), box: [0, 0, 80, 80] }] }, // aurelia
    p3: {
      faces: [
        { embedding: jitter(baseR, rng, 0.05), box: [0, 0, 40, 40] }, // rafa, small
        { embedding: jitter(baseA, rng, 0.05), box: [0, 0, 90, 90] }, // aurelia
      ],
    },
    p4: { faces: [{ embedding: randDir(mulberry32(777), DIM), box: [0, 0, 70, 70] }] }, // stranger
    p5: { faces: [] },
  }
  return { centroids, entries, facesByKey }
}

test('selectPhotosWith: returns exactly the entries containing the person', () => {
  const { centroids, entries, facesByKey } = scene()
  const rafa = selectPhotosWith(entries, facesByKey, centroids, 'rafa', 0.36)
  assert.deepEqual(rafa.map((h) => h.entry.key).sort(), ['p1', 'p3'])
  const aur = selectPhotosWith(entries, facesByKey, centroids, 'aurelia', 0.36)
  assert.deepEqual(aur.map((h) => h.entry.key).sort(), ['p2', 'p3'])
})

test('selectPhotosWith: a stranger and unscanned/faceless photos are excluded', () => {
  const { centroids, entries, facesByKey } = scene()
  const all = [
    ...selectPhotosWith(entries, facesByKey, centroids, 'rafa', 0.36),
    ...selectPhotosWith(entries, facesByKey, centroids, 'aurelia', 0.36),
  ].map((h) => h.entry.key)
  assert.ok(!all.includes('p4'), 'stranger excluded')
  assert.ok(!all.includes('p5'), 'faceless excluded')
  assert.ok(!all.includes('p6'), 'unscanned excluded')
})

test('selectPhotosWith: surfaces the matching face box (best-light sizing)', () => {
  const { centroids, entries, facesByKey } = scene()
  const rafa = selectPhotosWith(entries, facesByKey, centroids, 'rafa', 0.36)
  const p1 = rafa.find((h) => h.entry.key === 'p1')
  const p3 = rafa.find((h) => h.entry.key === 'p3')
  // p3 has two faces; rafa's is the small 40×40, NOT aurelia's 90×90
  assert.deepEqual(p1.box, [0, 0, 100, 100])
  assert.deepEqual(p3.box, [0, 0, 40, 40])
  // best-light orders by face area → p1 (big) before p3 (small)
  const byArea = [...rafa].sort((a, b) => b.box[2] * b.box[3] - a.box[2] * a.box[3])
  assert.equal(byArea[0].entry.key, 'p1')
})

test('personCounts: counts each enrolled person across the entries', () => {
  const { centroids, entries, facesByKey } = scene()
  assert.deepEqual(personCounts(entries, facesByKey, centroids, 0.36), { rafa: 2, aurelia: 2 })
})

test('selectPhotosWith: a stricter threshold drops weak matches', () => {
  const { centroids, entries, facesByKey } = scene()
  // 0.999 is unreachable for jittered samples → nobody qualifies
  assert.equal(selectPhotosWith(entries, facesByKey, centroids, 'rafa', 0.999).length, 0)
})
