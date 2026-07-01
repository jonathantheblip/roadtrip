// Unit tests for legArrival (src/lib/legArrival.js) — the once-per-new-place
// signature. (The localStorage-backed seen-set is guarded + e2e-covered; here we
// pin the pure signature that decides when "a new place" is worth announcing.)

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { arrivalSignature, hasSeenArrival } from '../../src/lib/legArrival.js'

test('arrivalSignature: zone + money + language define "a new place"', () => {
  const rome = arrivalSignature({ legTz: 'Europe/Rome', currencyCode: 'EUR', languageName: 'Italian' })
  assert.equal(rome, 'Europe/Rome|EUR|Italian')
  // Two legs sharing zone + money + language → SAME signature (no re-announce).
  const florence = arrivalSignature({ legTz: 'Europe/Rome', currencyCode: 'EUR', languageName: 'Italian' })
  assert.equal(rome, florence)
  // A different country → a different signature (announces again).
  const tokyo = arrivalSignature({ legTz: 'Asia/Tokyo', currencyCode: 'JPY', languageName: 'Japanese' })
  assert.notEqual(rome, tokyo)
})

test('arrivalSignature: a partial delta still signs; nothing to announce → ""', () => {
  // A UK leg: money differs, language does not — still a real "new place".
  assert.equal(arrivalSignature({ legTz: 'Europe/London', currencyCode: 'GBP' }), 'Europe/London|GBP')
  // Nothing to announce (a domestic leg with no delta) → empty signature.
  assert.equal(arrivalSignature({}), '')
  assert.equal(arrivalSignature(), '')
})

test('hasSeenArrival: an empty signature never fires (reads as already seen)', () => {
  // No signature = nothing to announce → treated as seen, so the moment is skipped.
  assert.equal(hasSeenArrival('trip-1', ''), true)
  // A real signature with no localStorage (node) reads as NOT seen → would fire.
  assert.equal(hasSeenArrival('trip-1', 'Europe/Rome|EUR|Italian'), false)
})
