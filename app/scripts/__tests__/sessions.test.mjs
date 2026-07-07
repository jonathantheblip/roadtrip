// Unit tests for sessions.js — the v2 filing unit (a burst) + GPS inheritance.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSessions, SESSION_DEFAULTS } from '../../src/lib/sessions.js'

const MIN = 60_000
const p = (id, atMin, extra = {}) => ({ id, memoryId: id, at: atMin * MIN, ...extra })

test('buildSessions: a single burst is one session', () => {
  const s = buildSessions([p('a', 0), p('b', 5), p('c', 12)])
  assert.equal(s.length, 1)
  assert.equal(s[0].count, 3)
  assert.deepEqual(s[0].photoIds, ['a', 'b', 'c'])
})

test('buildSessions: a gap past the threshold splits the burst', () => {
  // default gap = 40 min; 0,10 then a 50-min jump to 60,65
  const s = buildSessions([p('a', 0), p('b', 10), p('c', 60), p('d', 65)])
  assert.equal(s.length, 2)
  assert.deepEqual(s.map((x) => x.count), [2, 2])
  assert.deepEqual(s[0].photoIds, ['a', 'b'])
  assert.deepEqual(s[1].photoIds, ['c', 'd'])
})

test('buildSessions: start/end/median are the burst edges + middle', () => {
  const s = buildSessions([p('a', 0), p('b', 10), p('c', 30)])[0]
  assert.equal(s.startMs, 0)
  assert.equal(s.endMs, 30 * MIN)
  assert.equal(s.medianMs, 10 * MIN) // middle of 3
})

test('GPS inheritance: a no-GPS burst is time-only (not located)', () => {
  const s = buildSessions([p('a', 0), p('b', 5)])[0]
  assert.equal(s.located, false)
  assert.equal(s.location, null)
  assert.equal(s.locatedCount, 0)
})

test('GPS inheritance: ONE geotagged photo anchors the whole session', () => {
  // the arena case: 3 no-GPS + 1 outdoor shot with GPS → the moment is located
  const s = buildSessions([
    p('a', 0),
    p('b', 5, { lat: 41.1772, lng: -73.1859 }),
    p('c', 8),
    p('d', 12),
  ])[0]
  assert.equal(s.located, true)
  assert.equal(s.locatedCount, 1)
  assert.ok(Math.abs(s.location.lat - 41.1772) < 1e-6)
  assert.ok(Math.abs(s.location.lng - -73.1859) < 1e-6)
  assert.equal(s.split, false)
  // every photo in the burst is covered, GPS or not
  assert.equal(s.photoIds.length, 4)
})

test('GPS inheritance: tight multi-GPS burst inherits the centroid', () => {
  const s = buildSessions([
    p('a', 0, { lat: 42.06210, lng: -70.16330 }),
    p('b', 3, { lat: 42.06230, lng: -70.16350 }), // ~30m away
  ])[0]
  assert.equal(s.located, true)
  assert.equal(s.split, false)
  assert.ok(s.gpsSpreadMeters <= SESSION_DEFAULTS.inheritRadiusMeters)
  assert.ok(Math.abs(s.location.lat - 42.0622) < 1e-3)
})

test('GPS inheritance: a burst whose located members are FAR apart splits — never fabricate one place', () => {
  const s = buildSessions([
    p('a', 0, { lat: 42.0621, lng: -70.1633 }), // Provincetown
    p('b', 20, { lat: 42.3554, lng: -71.0656 }), // Boston, ~90km — within the 40m gap but far
  ])[0]
  assert.equal(s.split, true)
  assert.equal(s.located, false) // did NOT inherit a bogus centroid
  assert.equal(s.location, null)
  assert.ok(s.gpsSpreadMeters > SESSION_DEFAULTS.inheritRadiusMeters)
})

test('buildSessions: deterministic — id tie-break on equal timestamps', () => {
  const a = buildSessions([p('z', 0), p('a', 0), p('m', 0)])[0]
  assert.deepEqual(a.photoIds, ['a', 'm', 'z'])
})

test('buildSessions: ignores points with no finite `at`', () => {
  const s = buildSessions([p('a', 0), { id: 'x', at: null }, p('b', 5)])
  assert.equal(s.length, 1)
  assert.equal(s[0].count, 2)
})
