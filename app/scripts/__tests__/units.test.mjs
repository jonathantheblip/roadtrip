// Unit tests for units.js — the leg-locale → metric/imperial fact + temp
// display formatting (mirrors legOrientation.js's "abroad" framing/tests).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { isMetricLocale, formatTemp, formatDistance, formatDistanceMetric, formatDistanceLocale } from '../../src/lib/units.js'

test('isMetricLocale: a leg abroad (non-US region) reads metric', () => {
  assert.equal(isMetricLocale('it-IT'), true)
  assert.equal(isMetricLocale('fr-FR'), true)
  assert.equal(isMetricLocale('en-GB'), true) // English abroad still reads metric
})

test('isMetricLocale: home (US) and no-locale both read imperial — no delta, no change', () => {
  assert.equal(isMetricLocale('en-US'), false)
  assert.equal(isMetricLocale(''), false)
  assert.equal(isMetricLocale(null), false)
  assert.equal(isMetricLocale(undefined), false)
  assert.equal(isMetricLocale('en'), false) // no region subtag at all
})

test('formatTemp: home reading is byte-identical to today ("54°F", no hint)', () => {
  assert.equal(formatTemp(54, false), '54°F')
  assert.equal(formatTemp(66.4, false), '66°F') // rounds, never fabricates a decimal
})

test('formatTemp: abroad leads with °C, keeps °F as a home hint', () => {
  assert.equal(formatTemp(75, true), '24°C · 75°F')
  assert.equal(formatTemp(32, true), '0°C · 32°F')
  assert.equal(formatTemp(-4, true), '-20°C · -4°F')
})

test('formatTemp: never fabricates a value from bad input', () => {
  assert.equal(formatTemp(null, true), '')
  assert.equal(formatTemp(undefined, false), '')
  assert.equal(formatTemp(NaN, true), '')
})

test('formatDistance (imperial): feet under 0.1mi, else miles — unchanged behavior', () => {
  assert.equal(formatDistance(100), '330 ft')
  assert.equal(formatDistance(800), '0.5 mi')
  assert.equal(formatDistance(20000), '12 mi') // >= 10mi rounds to a whole number
  assert.equal(formatDistance(NaN), '')
})

test('formatDistanceMetric: meters under 1km, else km', () => {
  assert.equal(formatDistanceMetric(100), '100 m')
  assert.equal(formatDistanceMetric(800), '800 m')
  assert.equal(formatDistanceMetric(1500), '1.5 km')
  assert.equal(formatDistanceMetric(20000), '20 km') // >= 10km rounds to a whole number
  assert.equal(formatDistanceMetric(NaN), '')
})

test('formatDistanceLocale: dispatches on the metric flag; home is byte-identical to formatDistance', () => {
  assert.equal(formatDistanceLocale(800, false), formatDistance(800))
  assert.equal(formatDistanceLocale(800, undefined), formatDistance(800))
  assert.equal(formatDistanceLocale(800, true), formatDistanceMetric(800))
})
