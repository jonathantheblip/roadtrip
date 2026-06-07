// Tests for the pure face-matching math (faceMatch.js). The model that
// produces embeddings is browser-only and proven on-device; this suite
// proves the arithmetic that turns embeddings into "who is this":
// normalization, centroid enrollment, nearest-person matching, and the
// accept/reject threshold. Vectors are synthetic but the assertions are
// non-vacuous — they verify same-"person" samples cluster and a
// stranger is rejected (G7). A seeded RNG keeps it reproducible.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  l2normalize,
  dot,
  cosineSimilarity,
  cosineDistance,
  meanEmbedding,
  enrollPerson,
  rankMatches,
  matchToEnrolled,
  DEFAULT_MATCH_THRESHOLD,
} from '../../src/lib/faceMatch.js'

// Deterministic PRNG (mulberry32) so "noise" is reproducible.
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

// ─── normalization ────────────────────────────────────────────────

test('l2normalize: result is unit length', () => {
  const n = l2normalize([3, 0, 4, 0])
  assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-6)
  assert.ok(Math.abs(n[0] - 0.6) < 1e-6 && Math.abs(n[2] - 0.8) < 1e-6)
})

test('l2normalize: zero vector stays zero (no divide-by-zero)', () => {
  const n = l2normalize([0, 0, 0])
  assert.deepEqual(Array.from(n), [0, 0, 0])
})

// ─── similarity ───────────────────────────────────────────────────

test('cosineSimilarity: identical direction is 1, opposite is -1', () => {
  assert.ok(Math.abs(cosineSimilarity([1, 2, 3], [2, 4, 6]) - 1) < 1e-6)
  assert.ok(Math.abs(cosineSimilarity([1, 0], [-1, 0]) + 1) < 1e-6)
})

test('cosineSimilarity: orthogonal is ~0; cosineDistance of identical is ~0', () => {
  assert.ok(Math.abs(cosineSimilarity([1, 0], [0, 1])) < 1e-6)
  assert.ok(cosineDistance([1, 2, 3], [1, 2, 3]) < 1e-6)
})

test('dot: length mismatch throws', () => {
  assert.throws(() => dot([1, 2], [1, 2, 3]), /length mismatch/)
})

// ─── enrollment ───────────────────────────────────────────────────

test('meanEmbedding: empty list throws', () => {
  assert.throws(() => meanEmbedding([]), /at least one/)
})

test('meanEmbedding: centroid of jittered samples points at the true direction', () => {
  const rng = mulberry32(7)
  const base = randDir(rng, DIM)
  const samples = Array.from({ length: 6 }, () => jitter(base, rng, 0.05))
  const centroid = meanEmbedding(samples)
  // averaging cancels noise → centroid very close to base
  assert.ok(cosineSimilarity(centroid, base) > 0.99)
})

test('enrollPerson: records id and exemplar count', () => {
  const rng = mulberry32(3)
  const base = randDir(rng, DIM)
  const p = enrollPerson('rafa', [jitter(base, rng, 0.03), jitter(base, rng, 0.03)])
  assert.equal(p.personId, 'rafa')
  assert.equal(p.count, 2)
  assert.equal(p.centroid.length, DIM)
})

// ─── matching: the real job ───────────────────────────────────────

// Two well-separated "people", each enrolled from a few jittered shots.
function buildFamily(seed = 11) {
  const rng = mulberry32(seed)
  const baseRafa = randDir(rng, DIM)
  const baseAur = randDir(rng, DIM)
  const enrolled = [
    enrollPerson('rafa', Array.from({ length: 4 }, () => jitter(baseRafa, rng, 0.06))),
    enrollPerson('aurelia', Array.from({ length: 4 }, () => jitter(baseAur, rng, 0.06))),
  ]
  return { rng, baseRafa, baseAur, enrolled }
}

test('same-person samples score far higher than different-person', () => {
  const { rng, baseRafa, baseAur, enrolled } = buildFamily()
  const rafaShot = jitter(baseRafa, rng, 0.06)
  const simSelf = rankMatches(rafaShot, enrolled).find((m) => m.personId === 'rafa').similarity
  const simOther = rankMatches(rafaShot, enrolled).find((m) => m.personId === 'aurelia').similarity
  assert.ok(simSelf > 0.9, `expected self-sim high, got ${simSelf}`)
  assert.ok(simOther < 0.4, `expected cross-sim low, got ${simOther}`)
  assert.ok(simSelf - simOther > 0.5)
})

test('matchToEnrolled: a held-out shot lands on the right person', () => {
  const { rng, baseRafa, baseAur, enrolled } = buildFamily()
  const m1 = matchToEnrolled(jitter(baseRafa, rng, 0.06), enrolled)
  assert.equal(m1?.personId, 'rafa')
  const m2 = matchToEnrolled(jitter(baseAur, rng, 0.06), enrolled)
  assert.equal(m2?.personId, 'aurelia')
})

test('matchToEnrolled: a stranger (unrelated face) is rejected as null', () => {
  const { rng, enrolled } = buildFamily()
  // a fresh random direction is ~orthogonal to both → below threshold
  const stranger = randDir(mulberry32(999), DIM)
  assert.equal(matchToEnrolled(stranger, enrolled), null)
})

test('matchToEnrolled: empty enrollment returns null', () => {
  assert.equal(matchToEnrolled(randDir(mulberry32(1), DIM), []), null)
})

test('matchToEnrolled: threshold is honored (raise it → same shot rejected)', () => {
  const { rng, baseRafa, enrolled } = buildFamily()
  const shot = jitter(baseRafa, rng, 0.06)
  assert.equal(matchToEnrolled(shot, enrolled)?.personId, 'rafa') // default accepts
  assert.equal(matchToEnrolled(shot, enrolled, { threshold: 0.999 }), null) // strict rejects
})

test('matchToEnrolled: reports a positive margin over the runner-up', () => {
  const { rng, baseRafa, enrolled } = buildFamily()
  const m = matchToEnrolled(jitter(baseRafa, rng, 0.06), enrolled)
  assert.ok(m.margin > 0)
  assert.ok(m.similarity >= DEFAULT_MATCH_THRESHOLD)
})
