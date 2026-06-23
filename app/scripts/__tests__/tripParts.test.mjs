import { test } from 'node:test'
import assert from 'node:assert/strict'

const { getParts, deriveTripShape, partCount, hasExplicitParts, partsWithDays, PART_TYPES } =
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

// ── partsWithDays (real timed days, derived) ───────────────────────────────

test('partsWithDays: a legacy trip is untouched — one part holding all its days', () => {
  const t = legacyStay() // days: one day 2026-07-03
  const wd = partsWithDays(t)
  assert.equal(wd.length, 1)
  assert.equal(wd[0].derived, true)
  assert.equal(wd[0].days.length, 1)
  assert.equal(wd[0].days[0].isoDate, '2026-07-03')
  assert.equal(wd[0].dayCount, 1)
  // The day objects are the trip's own — nothing rewritten.
  assert.equal(wd[0].days[0], t.days[0])
})

test('partsWithDays: a city part enumerates its window — real days fill, the rest are loose', () => {
  const trip = {
    id: 'rome1',
    parts: [{ id: 'p', type: 'city', title: 'Rome', dateStart: '2026-07-01', dateEnd: '2026-07-04' }],
    days: [
      { isoDate: '2026-07-01', stops: [{ name: 'Colosseum' }] },
      { isoDate: '2026-07-03', stops: [{ name: 'Vatican' }] },
    ],
  }
  const [rome] = partsWithDays(trip)
  assert.equal(rome.days.length, 4) // 01,02,03,04 — every date in the window
  assert.deepEqual(rome.days.map((d) => d.isoDate), ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04'])
  assert.equal(rome.days[0].loose, undefined) // real
  assert.equal(rome.days[1].loose, true) // open space
  assert.equal(rome.days[1].stops.length, 0)
  assert.equal(rome.days[2].stops[0].name, 'Vatican')
  assert.equal(rome.days[3].loose, true)
})

test('partsWithDays: a shared travel day lands in the ARRIVING part only — never doubled or dropped', () => {
  const trip = {
    id: 'italy2',
    parts: [
      { id: 'p1', type: 'flight', title: 'Fly BOS→Rome', dateStart: '2026-07-01' }, // shares Rome's start
      { id: 'p2', type: 'city', title: 'Rome', dateStart: '2026-07-01', dateEnd: '2026-07-04' },
      { id: 'p3', type: 'stay', title: 'Tuscan villa', dateStart: '2026-07-04', dateEnd: '2026-07-06' },
    ],
    days: [
      { isoDate: '2026-07-01', stops: [{ name: 'Arrive Rome' }] },
      { isoDate: '2026-07-04', stops: [{ name: 'Drive to Tuscany' }] }, // the boundary/travel day
      { isoDate: '2026-07-05', stops: [{ name: 'Pool' }] },
    ],
  }
  const [flight, rome, villa] = partsWithDays(trip)
  // The flight shares Rome's start date → its window collapses → a pure marker.
  assert.equal(flight.days.length, 0)
  // Rome owns 07-01..07-03 (clamped to the day before the villa begins).
  assert.deepEqual(rome.days.map((d) => d.isoDate), ['2026-07-01', '2026-07-02', '2026-07-03'])
  assert.equal(rome.days[0].stops[0].name, 'Arrive Rome')
  // The 07-04 travel day belongs to the villa (the arriving part), not Rome.
  assert.deepEqual(villa.days.map((d) => d.isoDate), ['2026-07-04', '2026-07-05', '2026-07-06'])
  assert.equal(villa.days[0].stops[0].name, 'Drive to Tuscany')
  assert.equal(villa.days[1].stops[0].name, 'Pool')
  // Every real day survives exactly once across all parts.
  const realCount = [flight, rome, villa].flatMap((p) => p.days).filter((d) => !d.loose).length
  assert.equal(realCount, 3)
})

test('partsWithDays: a dateless or out-of-window day is never lost (appended)', () => {
  const trip = {
    id: 'edge1',
    parts: [{ id: 'p', type: 'city', title: 'Town', dateStart: '2026-08-01', dateEnd: '2026-08-02' }],
    days: [
      { isoDate: '2026-08-01', stops: [{ name: 'A' }] },
      { isoDate: null, stops: [{ name: 'undated' }] }, // no date → still kept
      { isoDate: '2026-08-09', stops: [{ name: 'stray' }] }, // outside the window → still kept
    ],
  }
  const [town] = partsWithDays(trip)
  const names = town.days.flatMap((d) => d.stops.map((s) => s.name))
  assert.ok(names.includes('A') && names.includes('undated') && names.includes('stray'))
})

test('partsWithDays: never throws on null / empty', () => {
  assert.deepEqual(partsWithDays(null), [])
  // No parts + no days → one derived wrapper part holding zero days (legacy path).
  const wd = partsWithDays({ id: 'x' })
  assert.equal(wd.length, 1)
  assert.equal(wd[0].derived, true)
  assert.equal(wd[0].dayCount, 0)
})
