// Unit tests for tripPhase — the system-driven phase that reflows each
// per-person home band (entry-points redesign). 'during' while the trip is
// ongoing OR upcoming; 'after' once today is past the trip's end date.
//
// This function had ZERO coverage before this file, yet it is the single
// switch that flips all three persona bands (Jonathan/Helen/Aurelia) into
// their after-trip keepsake layout. The boundary (end day itself) and the
// lexical date compare are the parts most likely to regress, so they're
// asserted explicitly (G7: fail for the right reason).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { tripPhase } from '../../src/lib/tripPhase.js'

// All `now` values are passed explicitly so the test never depends on the
// real wall clock. tripPhase reads now.toISOString().slice(0,10), so noon
// UTC keeps the date the same in every reasonable timezone.
const at = (iso) => new Date(`${iso}T12:00:00.000Z`)

test('after: today is strictly past the end date', () => {
  assert.equal(tripPhase({ dateRangeEnd: '2026-05-08' }, at('2026-05-09')), 'after')
  assert.equal(tripPhase({ dateRangeEnd: '2026-05-08' }, at('2026-06-13')), 'after')
})

test('during: the end day itself is still during (boundary, today === end)', () => {
  // today > end is false when equal, so the last day of the trip stays
  // 'during' — the keepsake should NOT take over until the trip is truly over.
  assert.equal(tripPhase({ dateRangeEnd: '2026-05-23' }, at('2026-05-23')), 'during')
})

test('during: today is before the end (ongoing or upcoming trip)', () => {
  assert.equal(tripPhase({ dateRangeEnd: '2026-05-25' }, at('2026-05-23')), 'during') // ongoing
  assert.equal(tripPhase({ dateRangeEnd: '2026-08-05' }, at('2026-05-23')), 'during') // upcoming
})

test('lexical compare is a real date compare across month / year boundaries', () => {
  // 'YYYY-MM-DD' strings sort lexically the same as chronologically, but only
  // if the function never accidentally does a numeric or substring compare.
  assert.equal(tripPhase({ dateRangeEnd: '2026-01-31' }, at('2026-02-01')), 'after')
  assert.equal(tripPhase({ dateRangeEnd: '2025-12-31' }, at('2026-01-01')), 'after')
  assert.equal(tripPhase({ dateRangeEnd: '2026-02-01' }, at('2026-01-31')), 'during')
})

test('after: a stale-dated trip (window says during, itinerary is weeks past) reads after', () => {
  // The real failure: the volleyball trip stored 2025-01-01 → 2027-12-31 while
  // its stops are all May 2026. The huge window says "during" forever; the
  // itinerary cross-check classes it as over.
  const stale = {
    dateRangeStart: '2025-01-01',
    dateRangeEnd: '2027-12-31',
    days: [{ isoDate: '2026-05-22' }, { isoDate: '2026-05-24' }],
  }
  assert.equal(tripPhase(stale, at('2026-06-18')), 'after')
})

test('during: an in-window trip whose itinerary matches today stays during', () => {
  const live = {
    dateRangeStart: '2026-05-22',
    dateRangeEnd: '2026-05-24',
    days: [{ isoDate: '2026-05-22' }, { isoDate: '2026-05-24' }],
  }
  assert.equal(tripPhase(live, at('2026-05-23')), 'during')
})

test('during by default when there is no usable end date (never strand a trip in keepsake mode)', () => {
  assert.equal(tripPhase({}, at('2026-06-13')), 'during')
  assert.equal(tripPhase({ dateRangeEnd: null }, at('2026-06-13')), 'during')
  assert.equal(tripPhase({ dateRangeEnd: 20260508 }, at('2026-06-13')), 'during') // non-string ignored
  assert.equal(tripPhase(null, at('2026-06-13')), 'during')
  assert.equal(tripPhase(undefined, at('2026-06-13')), 'during')
})
