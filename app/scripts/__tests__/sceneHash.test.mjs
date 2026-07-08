// Unit tests for sceneHash.js — the perceptual COMPOSITION signature (the grouping
// dimension that survives the pipeline, recoverable from the stored pixels). Tests
// the pure hash + the Hamming compare; the grayscale is supplied by the caller.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sceneHashFromGray, sceneDistance, sceneSimilar, SCENE_DEFAULTS } from '../../src/lib/sceneHash.js'

// build a 9×8 row-major grayscale grid from a function of (x, y)
const grid = (fn) => {
  const g = []
  for (let y = 0; y < 8; y++) for (let x = 0; x < 9; x++) g.push(fn(x, y))
  return g
}

test('a left→right increasing row → all-zero dHash, 64 bits (16 hex chars)', () => {
  const h = sceneHashFromGray(grid((x) => x * 10))
  assert.equal(h, '0000000000000000')
  assert.equal(h.length, 16)
})

test('a right→left decreasing row → all-ones dHash', () => {
  assert.equal(sceneHashFromGray(grid((x) => (8 - x) * 10)), 'ffffffffffffffff')
})

test('identical scenes → distance 0; opposite → 64', () => {
  const a = sceneHashFromGray(grid((x) => x))
  const b = sceneHashFromGray(grid((x) => 8 - x))
  assert.equal(sceneDistance(a, a), 0)
  assert.equal(sceneDistance(a, b), 64)
})

test('a single spiked pixel flips one bit → similar within threshold', () => {
  const base = sceneHashFromGray(grid((x) => x * 10))
  const near = sceneHashFromGray(grid((x, y) => (y === 0 && x === 3 ? 100 : x * 10)))
  const d = sceneDistance(base, near)
  assert.ok(d > 0 && d <= 4, `expected a small distance, got ${d}`)
  assert.equal(sceneSimilar(base, near, SCENE_DEFAULTS.sameMaxBits), true)
})

test('missing / malformed / mismatched-length signatures → Infinity (never falsely "same")', () => {
  assert.equal(sceneDistance(null, 'ffffffffffffffff'), Infinity)
  assert.equal(sceneDistance('ffff', 'fff'), Infinity)
  assert.equal(sceneDistance('zzzz', 'ffff'), Infinity)
  assert.equal(sceneSimilar(null, 'ffffffffffffffff'), false)
})

test('too-small grid → null (no false signature)', () => {
  assert.equal(sceneHashFromGray([1, 2, 3]), null)
})
