// Unit test for the shared trip-hero guard predicate (client copy).
// CARRYOVER_TRIP_HERO_PLAN.md §0 — the verification gate:
//   "Assert hasExplicitHero(VOLLEYBALL_TRIP) === true in a unit test."
// The §0 edge-case table is encoded verbatim so a change to the
// predicate that breaks the protected-path contract goes red here. The
// worker keeps a byte-identical copy with a mirror of this table
// (worker/test/trip-hero-resolve.test.js) so the two can't diverge.

import test from 'node:test'
import assert from 'node:assert/strict'
import { hasExplicitHero } from '../../src/lib/tripHero.js'
import {
  TRIPS,
  JACKSON_TRIP,
  NYC_TRIP,
  VOLLEYBALL_TRIP,
} from '../../src/data/trips.js'

test('volleyball-2026 has an explicit hero → protected (the §0 gate)', () => {
  assert.equal(hasExplicitHero(VOLLEYBALL_TRIP), true)
})

test('§0 edge-case table resolves to a definite side', () => {
  // | value                         | verdict             |
  assert.equal(hasExplicitHero({ heroImage: './images/volleyball.png' }), true) // explicit
  assert.equal(hasExplicitHero({}), false)                       // never set
  assert.equal(hasExplicitHero({ heroImage: undefined }), false) // key absent
  assert.equal(hasExplicitHero({ heroImage: '' }), false)        // explicitly cleared
  assert.equal(hasExplicitHero({ heroImage: '   ' }), false)     // whitespace only
  // stale build-time ref / points at a missing file: non-empty string =
  // PROTECTED. Never re-resolved; broken <img> is Jonathan's data-fix.
  assert.equal(hasExplicitHero({ heroImage: './images/gone.png' }), true)
  // non-string / nullish guards
  assert.equal(hasExplicitHero({ heroImage: 42 }), false)
  assert.equal(hasExplicitHero(null), false)
  assert.equal(hasExplicitHero(undefined), false)
})

// Coverage proof for the bar: EVERY seed trip carries a real, explicit
// hero after the §3 seed bake (volleyball shipped with one; jackson +
// nyc are baked in commit 1). If a future edit drops a seed hero, this
// goes red — the cold-start (pre-worker-pull) render would fall to the
// Floor for that trip, which is acceptable but should be a deliberate
// choice, not an accident.
test('every seed trip has an explicit hero (cold-start coverage)', () => {
  for (const trip of TRIPS) {
    assert.equal(
      hasExplicitHero(trip),
      true,
      `${trip.id} should carry a baked/explicit heroImage for cold-start`
    )
  }
  // and specifically the two that were baked
  assert.equal(hasExplicitHero(JACKSON_TRIP), true)
  assert.equal(hasExplicitHero(NYC_TRIP), true)
})
