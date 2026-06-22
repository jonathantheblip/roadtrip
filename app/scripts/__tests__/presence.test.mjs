// "Who's around" (slice 8) — client-side rules. The privacy half here is
// non-vacuous: buildPresenceBody must NEVER put a kid's coordinates on the wire,
// even when a precise fix is in hand (remove the isAdultTraveler gate → the kid
// assertion below fails).

import { test } from 'node:test'
import assert from 'node:assert/strict'

const { buildPresenceBody, isAdultTraveler, coarseBucket, freshness, LIVE_MS } = await import(
  '../../src/lib/presenceRules.js'
)

const FIX = { lat: 41.4943, lng: -72.0916, accuracy: 12 }
const PLACE = { lat: 41.4943, lng: -72.0916, name: 'The cabin' }

test('adults are the only precise travelers', () => {
  assert.equal(isAdultTraveler('jonathan'), true)
  assert.equal(isAdultTraveler('helen'), true)
  assert.equal(isAdultTraveler('aurelia'), false)
  assert.equal(isAdultTraveler('rafa'), false)
})

test('★ a kid\'s coordinates are NEVER put on the wire (even with a real fix)', () => {
  for (const kid of ['rafa', 'aurelia']) {
    const body = buildPresenceBody({ tripId: 't1', traveler: kid, placeBucket: 'at_place', position: FIX })
    assert.equal(body.lat, undefined)
    assert.equal(body.lng, undefined)
    assert.equal(body.accuracy, undefined)
    assert.equal(body.placeBucket, 'at_place') // the coarse bucket still travels
  }
})

test('an adult\'s precise fix IS attached', () => {
  const body = buildPresenceBody({ tripId: 't1', traveler: 'jonathan', placeBucket: 'at_place', position: FIX })
  assert.equal(body.lat, 41.4943)
  assert.equal(body.lng, -72.0916)
  assert.equal(body.accuracy, 12)
})

test('an adult without a fix sends only the coarse bucket', () => {
  const body = buildPresenceBody({ tripId: 't1', traveler: 'helen', placeBucket: 'out' })
  assert.equal(body.lat, undefined)
  assert.equal(body.placeBucket, 'out')
})

test('a manual status rides as the note (trimmed); blank omitted', () => {
  const withNote = buildPresenceBody({ tripId: 't1', traveler: 'helen', placeBucket: 'out', note: '  at the beach  ' })
  assert.equal(withNote.note, 'at the beach')
  const blank = buildPresenceBody({ tripId: 't1', traveler: 'helen', placeBucket: 'out', note: '   ' })
  assert.equal(blank.note, undefined)
})

test('coarseBucket: at the place vs out vs unknown', () => {
  assert.equal(coarseBucket(PLACE, FIX), 'at_place')
  assert.equal(coarseBucket(PLACE, { lat: 42.0, lng: -73.0, accuracy: 10 }), 'out')
  assert.equal(coarseBucket(null, FIX), 'unknown')
  assert.equal(coarseBucket(PLACE, null), 'unknown')
})

test('freshness: within the window is live; older is idle with a label', () => {
  const now = 1_000_000_000_000
  assert.equal(freshness(now - 60_000, now).live, true) // 1m ago → live
  const stale = freshness(now - (LIVE_MS + 60_000), now)
  assert.equal(stale.live, false)
  assert.match(stale.ago, /ago/)
})
