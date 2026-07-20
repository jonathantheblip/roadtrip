// Tests for the pure query logic in faceIndex.js — selectPhotosWith and
// personCounts (the IndexedDB persistence is browser-only, exercised via
// e2e). These prove the join of "scanned face embeddings" × "enrolled
// people" answers "which photos is this person in", picks the most
// confident face per photo, ignores strangers, and surfaces the face box
// (best-light sizing). Synthetic vectors, seeded RNG, non-vacuous (G7).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { l2normalize, enrollPerson } from '../../src/lib/faceMatch.js'
import { selectPhotosWith, personCounts, faceTagOf, clusterIdsFor, FACES_SYNC_MAX } from '../../src/lib/faceIndex.js'

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

test('selectPhotosWith: a "not X" correction removes that photo from X only', () => {
  const { centroids, entries, facesByKey } = scene()
  const rej = new Set(['p1::rafa']) // user said p1 is NOT rafa
  const rafa = selectPhotosWith(entries, facesByKey, centroids, 'rafa', 0.36, rej)
  assert.deepEqual(rafa.map((h) => h.entry.key).sort(), ['p3']) // p1 dropped, p3 stays
  // the same photo still counts for aurelia (the correction is per-person)
  const aur = selectPhotosWith(entries, facesByKey, centroids, 'aurelia', 0.36, rej)
  assert.deepEqual(aur.map((h) => h.entry.key).sort(), ['p2', 'p3'])
  assert.deepEqual(personCounts(entries, facesByKey, centroids, 0.36, rej), { rafa: 1, aurelia: 2 })
})

test('selectPhotosWith: a stricter threshold drops weak matches', () => {
  const { centroids, entries, facesByKey } = scene()
  // 0.999 is unreachable for jittered samples → nobody qualifies
  assert.equal(selectPhotosWith(entries, facesByKey, centroids, 'rafa', 0.999).length, 0)
})

// ── keyless cross-device face tags (Build W4 — faces; keyless 2026-07-14).
// faceTagOf is a PURE, deterministic hash of the shared family-member id, so
// every device computes byte-identical tags with no key and nothing to
// reconcile — the old per-device `fc_N` numbering + its IndexedDB store are
// gone. clusterIdsFor is the ref-facing mapper (dedup, sort, cap).

// KNOWN-ANSWER fixtures — these EXACT tags are the contract (examples ARE the
// spec). They must never drift: a change silently re-tags every already-synced
// photo and false-splits the family across app versions. Pinned from the real
// traveler ids (auth.js TRAVELER_ORDER).
const KNOWN = {
  jonathan: 'fc2-d946bc4f3a5e495c',
  helen: 'fc2-a44ef94680c3f2ad',
  aurelia: 'fc2-d1595a6e1c5c4020',
  rafa: 'fc2-6dcf0a1fd2038d9d',
}

test('faceTagOf: the four family ids hash to their exact pinned tags (cross-device + cross-version contract)', () => {
  for (const [id, tag] of Object.entries(KNOWN)) assert.equal(faceTagOf(id), tag)
})

test('faceTagOf: deterministic, shaped fc2-<16 hex>, and collision-free across the family', () => {
  for (const id of Object.keys(KNOWN)) {
    assert.equal(faceTagOf(id), faceTagOf(id)) // same id → same tag every call
    assert.match(faceTagOf(id), /^fc2-[0-9a-f]{16}$/)
  }
  const tags = Object.keys(KNOWN).map(faceTagOf)
  assert.equal(new Set(tags).size, tags.length, 'no two family members share a tag')
})

test('faceTagOf: total — any value in yields a valid tag, never throws', () => {
  for (const v of ['', 'a', 'a long id '.repeat(9), 'ünïcode-Ω', null, undefined, 42, {}]) {
    assert.match(faceTagOf(v), /^fc2-[0-9a-f]{16}$/)
  }
})

test('clusterIdsFor: maps person tags through faceTagOf, deduped, lexicographically sorted', () => {
  assert.deepEqual(clusterIdsFor(['jonathan', 'helen']), [KNOWN.jonathan, KNOWN.helen].sort())
  // dedup (rafa twice) + the sort is by TAG, not enrollment/person order
  assert.deepEqual(clusterIdsFor(['rafa', 'aurelia', 'rafa']), [KNOWN.rafa, KNOWN.aurelia].sort())
  assert.deepEqual(clusterIdsFor([]), [])
})

test('clusterIdsFor: drops empty/non-string person tags (defense in depth)', () => {
  assert.deepEqual(clusterIdsFor(['jonathan', '', null, undefined, 0, 'helen']), [KNOWN.jonathan, KNOWN.helen].sort())
  assert.deepEqual(clusterIdsFor(null), [])
})

test('clusterIdsFor: caps at FACES_SYNC_MAX, still valid + sorted', () => {
  const many = Array.from({ length: 15 }, (_, i) => `person-${i}`)
  const out = clusterIdsFor(many)
  assert.equal(out.length, FACES_SYNC_MAX)
  assert.ok(out.every((t) => /^fc2-[0-9a-f]{16}$/.test(t)))
  assert.deepEqual(out, [...out].sort())
})
