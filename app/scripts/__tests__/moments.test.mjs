// buildMoments — the multi-dimensional grouping. A moment emerges where time, GPS,
// composition (scene), and people (faces) AGREE; a missing dimension abstains (never
// breaks the group); time bounds it. Tests: time-only degradation, scene/faces BRIDGE
// across a gap, scene+faces/GPS SPLIT within the time bond, the span cap, and the
// reported provenance (dims + cohesion).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildMoments } from '../../src/lib/sessions.js'

const M = 60_000
const p = (id, min, extra = {}) => ({ id, memoryId: id, at: min * M, ...extra })
const counts = (ms) => ms.map((m) => m.count)

test('time-only (stripped archive) → degrades to a time burst: within-gap merges, beyond splits', () => {
  const ms = buildMoments([p('a', 0), p('b', 20), p('c', 70)])
  assert.deepEqual(counts(ms), [2, 1]) // a,b within 40m; c 50m after b → new moment
  assert.equal(ms[0].dims.join(','), 'time') // no other dimension present
})

test('scene BRIDGES a time gap: same background, 60m apart → one moment', () => {
  const ms = buildMoments([
    p('a', 0, { scene: 'ffffffffffffffff' }),
    p('b', 60, { scene: 'ffffffffffffffef' }), // 1 bit different → same scene
  ])
  assert.deepEqual(counts(ms), [2])
  assert.ok(ms[0].dims.includes('scene'))
})

test('scene + faces SPLIT within the time bond: two backgrounds / two crowds, 5m apart → two moments', () => {
  const ms = buildMoments([
    p('a', 0, { scene: '0000000000000000', faces: ['mom'] }),
    p('b', 5, { scene: 'ffffffffffffffff', faces: ['dog'] }),
  ])
  assert.deepEqual(counts(ms), [1, 1]) // time says "same"; scene+faces confidently say "no"
})

test('GPS SPLITS within the time bond: 5m apart but ~2km away → two moments', () => {
  const ms = buildMoments([
    p('a', 0, { lat: 42.0, lng: -71.0 }),
    p('b', 5, { lat: 42.02, lng: -71.0 }),
  ])
  assert.deepEqual(counts(ms), [1, 1])
})

test('faces BRIDGE a gap: same people, 70m apart → one moment', () => {
  const ms = buildMoments([
    p('a', 0, { faces: ['mom', 'kid'] }),
    p('b', 70, { faces: ['mom', 'kid'] }),
  ])
  assert.deepEqual(counts(ms), [2])
})

test('the hard span cap holds: a chain of merges cannot exceed maxSpanMinutes', () => {
  const ms = buildMoments([0, 30, 60, 90, 120, 150, 180, 210].map((min, i) => p(String.fromCharCode(97 + i), min)))
  assert.deepEqual(counts(ms), [7, 1]) // 0..180 spans exactly the cap; 210 starts a new moment
})

test('provenance: dims lists every present dimension; cohesion reflects agreement', () => {
  const [m] = buildMoments([
    p('a', 0, { lat: 42, lng: -71, scene: 'ffffffffffffffff', faces: ['mom'] }),
    p('b', 3, { lat: 42.0001, lng: -71.0001, scene: 'ffffffffffffffff', faces: ['mom'] }),
  ])
  assert.equal(m.count, 2)
  assert.deepEqual(m.dims, ['time', 'gps', 'scene', 'faces'])
  assert.ok(m.cohesion > 0.95, `same place+scene+people → high cohesion, got ${m.cohesion}`)
})
