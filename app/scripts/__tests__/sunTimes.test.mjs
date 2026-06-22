import { test } from 'node:test'
import assert from 'node:assert/strict'

const { sunTimes } = await import('../../src/lib/sunTimes.js')

// Minutes-of-UTC-day for an easy tolerance compare.
const utcMin = (d) => d.getUTCHours() * 60 + d.getUTCMinutes()

test('London equinox: sunrise ~06:0x UTC, sunset ~18:1x UTC (within 8 min)', () => {
  // Greenwich (lng ≈ 0) on the equinox → ~6am/6pm UTC, the textbook reference.
  const { sunrise, sunset } = sunTimes(new Date('2026-03-20T12:00:00Z'), 51.5074, -0.1278)
  // Published: London 2026-03-20 sunrise ≈ 06:02, sunset ≈ 18:14 (GMT = UTC).
  assert.ok(Math.abs(utcMin(sunrise) - (6 * 60 + 2)) <= 8, `sunrise ${sunrise.toISOString()}`)
  assert.ok(Math.abs(utcMin(sunset) - (18 * 60 + 14)) <= 8, `sunset ${sunset.toISOString()}`)
})

test('NYC summer solstice: sunset ≈ 00:31 UTC next day (≈ 20:31 EDT, within 8 min)', () => {
  const { sunset } = sunTimes(new Date('2026-06-21T16:00:00Z'), 40.7128, -74.006)
  // Published: NYC 2026-06-21 sunset ≈ 20:31 EDT = 00:31 UTC on 2026-06-22.
  assert.equal(sunset.getUTCDate(), 22)
  assert.ok(Math.abs(utcMin(sunset) - 31) <= 8, `sunset ${sunset.toISOString()}`)
})

test('golden hour starts before sunset; sunrise is before sunset', () => {
  const { sunrise, sunset, goldenHour } = sunTimes(new Date('2026-06-21T16:00:00Z'), 43.24, -72.87) // the Vermont cabin
  assert.ok(sunrise < sunset, 'sunrise before sunset')
  assert.ok(goldenHour < sunset, 'evening golden hour starts before sunset')
  assert.ok(sunset - goldenHour < 90 * 60 * 1000, 'golden hour within ~90 min of sunset')
})

test('bad input → all null (no crash)', () => {
  assert.deepEqual(sunTimes(null, 40, -74), { sunrise: null, sunset: null, goldenHour: null })
  assert.deepEqual(sunTimes(new Date('2026-06-21T12:00:00Z'), NaN, -74), { sunrise: null, sunset: null, goldenHour: null })
})
