import { test } from 'node:test'
import assert from 'node:assert/strict'

const { getParts, deriveTripShape, partCount, hasExplicitParts, PART_TYPES } =
  await import('../../src/lib/tripParts.js')

function legacyStay() {
  return {
    id: 'cabin1',
    shape: 'stay', // explicit so inferTripShape is deterministic in the test
    title: 'A weekend at the cabin',
    dateRangeStart: '2026-07-03',
    dateRangeEnd: '2026-07-06',
    days: [{ isoDate: '2026-07-03', title: 'Arrive', stops: [] }],
  }
}
function legacyRoute() {
  return {
    id: 'drive1',
    shape: 'route',
    title: 'The big drive',
    dateRangeStart: '2026-04-17',
    dateRangeEnd: '2026-04-24',
    days: [{ isoDate: '2026-04-17', title: 'Day 1', stops: [] }],
  }
}
function composite() {
  return {
    id: 'italy1',
    title: 'Italy, summer',
    parts: [
      { id: 'p1', type: 'flight', title: 'Fly Boston → Rome', dateStart: '2026-07-01' },
      { id: 'p2', type: 'city', title: 'Three nights in Rome', dateStart: '2026-07-01', dateEnd: '2026-07-04' },
      { id: 'p3', type: 'stay', title: 'A Tuscan villa', dateStart: '2026-07-04', dateEnd: '2026-07-11' },
    ],
  }
}

test('a legacy stay derives to ONE part wrapping the whole trip (non-breaking)', () => {
  const parts = getParts(legacyStay())
  assert.equal(parts.length, 1)
  assert.equal(parts[0].type, 'stay')
  assert.equal(parts[0].derived, true)
  assert.equal(parts[0].dateStart, '2026-07-03')
  assert.equal(parts[0].dateEnd, '2026-07-06')
  assert.equal(parts[0].days.length, 1) // the legacy days live inside the one part
})

test('a legacy route derives to one DRIVE part', () => {
  const parts = getParts(legacyRoute())
  assert.equal(parts.length, 1)
  assert.equal(parts[0].type, 'drive')
  assert.equal(parts[0].derived, true)
})

test('an explicit composite returns its real parts, untouched', () => {
  const t = composite()
  const parts = getParts(t)
  assert.equal(parts.length, 3)
  assert.equal(parts[0].type, 'flight')
  assert.equal(parts[2].type, 'stay')
  assert.equal(parts[0].derived, undefined) // real, not a synthetic wrapper
})

test('deriveTripShape: legacy → its shape; composite → bigger; single explicit part → its type', () => {
  assert.equal(deriveTripShape(legacyStay()), 'stay')
  assert.equal(deriveTripShape(legacyRoute()), 'route')
  assert.equal(deriveTripShape(composite()), 'bigger')
  assert.equal(deriveTripShape({ id: 'x', parts: [{ id: 'a', type: 'city' }] }), 'city')
})

test('an explicit trip.shape always wins', () => {
  assert.equal(deriveTripShape({ id: 'x', shape: 'route', parts: composite().parts }), 'route')
})

test('partCount: 0 for legacy, N for a composite', () => {
  assert.equal(partCount(legacyStay()), 0)
  assert.equal(partCount(composite()), 3)
})

test('hasExplicitParts + PART_TYPES', () => {
  assert.equal(hasExplicitParts(legacyStay()), false)
  assert.equal(hasExplicitParts(composite()), true)
  assert.ok(PART_TYPES.includes('stay') && PART_TYPES.includes('flight') && PART_TYPES.includes('cruise'))
})

test('never throws on null / garbage', () => {
  assert.deepEqual(getParts(null), [])
  assert.deepEqual(getParts(undefined), [])
  assert.equal(deriveTripShape(null), 'route')
  assert.equal(partCount(null), 0)
  assert.equal(hasExplicitParts(null), false)
})
