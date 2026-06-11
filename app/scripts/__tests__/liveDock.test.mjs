// Unit tests for the LiveDock schedule selector + presence model.
// Lives at the app level so `npm test` runs it. Imports the pure lib
// (src/lib/liveDock.js). All times are constructed LOCAL (no trailing Z) so
// the asserted now/next boundary is tz-agnostic — parseStopTime also builds
// local Dates, so the two stay consistent on any machine.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  isTripLive,
  selectScheduleNowNext,
  buildLedgeModel,
} from '../../src/lib/liveDock.js'

// Three-day trip, mixed clock + vague times (mirrors the real fixtures:
// FIXTURE_TRIP has 'Evening' + '3:45 PM', the seed roadtrip has 'Sundown').
const TRIP = {
  id: 't',
  dateRangeStart: '2026-05-22',
  dateRangeEnd: '2026-05-24',
  days: [
    { isoDate: '2026-05-22', stops: [{ id: 'a', name: 'Beach Bungalow', time: 'Evening' }] },
    {
      isoDate: '2026-05-23',
      stops: [
        { id: 'b', name: 'Morning swim', time: '9:00 AM' },
        { id: 'c', name: 'vs Empire', time: '3:45 PM' },
      ],
    },
    { isoDate: '2026-05-24', stops: [{ id: 'd', name: 'Drive home', time: '10:00 AM' }] },
  ],
}

// Local noon on day 2 — after the 9 AM swim, before the 3:45 PM match.
const NOON_D2 = new Date('2026-05-23T12:00:00')

test('isTripLive: today inside the window', () => {
  assert.equal(isTripLive(TRIP, NOON_D2), true)
})

test('isTripLive: false before, after, and with missing dates', () => {
  assert.equal(isTripLive(TRIP, new Date('2026-05-21T12:00:00')), false)
  assert.equal(isTripLive(TRIP, new Date('2026-05-25T12:00:00')), false)
  assert.equal(isTripLive({ dateRangeStart: '2026-05-22' }, NOON_D2), false)
  assert.equal(isTripLive(null, NOON_D2), false)
})

test('selectScheduleNowNext: now = most-recent passed stop, next = first upcoming (spans days)', () => {
  const { nowStop, nextStop } = selectScheduleNowNext(TRIP, NOON_D2)
  assert.equal(nowStop.name, 'Morning swim') // 9 AM today, passed
  assert.equal(nextStop.name, 'vs Empire') // 3:45 PM today, upcoming
})

test('selectScheduleNowNext: mid-morning reaches back to last night (the vague "Evening" lodging)', () => {
  // 7 AM day 2 — before the 9 AM swim, so "now" is last night's bungalow.
  const early = new Date('2026-05-23T07:00:00')
  const { nowStop, nextStop } = selectScheduleNowNext(TRIP, early)
  assert.equal(nowStop.name, 'Beach Bungalow')
  assert.equal(nextStop.name, 'Morning swim')
})

test('selectScheduleNowNext: before the whole trip → no now, next is the first stop', () => {
  const before = new Date('2026-05-22T06:00:00') // before "Evening"
  const { nowStop, nextStop } = selectScheduleNowNext(TRIP, before)
  assert.equal(nowStop, null)
  assert.equal(nextStop.name, 'Beach Bungalow')
})

test('selectScheduleNowNext: after the last stop → a now, no next', () => {
  const after = new Date('2026-05-24T23:00:00')
  const { nowStop, nextStop } = selectScheduleNowNext(TRIP, after)
  assert.equal(nowStop.name, 'Drive home')
  assert.equal(nextStop, null)
})

test('buildLedgeModel: rafa never gets a ledge', () => {
  assert.deepEqual(
    buildLedgeModel({ trip: TRIP, traveler: 'rafa', now: NOON_D2 }),
    { mode: 'none' }
  )
})

test('buildLedgeModel: a draft or non-live trip → no ledge', () => {
  assert.equal(buildLedgeModel({ trip: { ...TRIP, draft: true }, traveler: 'jonathan', now: NOON_D2 }).mode, 'none')
  assert.equal(buildLedgeModel({ trip: TRIP, traveler: 'jonathan', now: new Date('2026-05-30T12:00:00') }).mode, 'none')
})

test('buildLedgeModel: jonathan/helen get a persistent live readout', () => {
  for (const who of ['jonathan', 'helen']) {
    const m = buildLedgeModel({ trip: TRIP, traveler: who, now: NOON_D2 })
    assert.equal(m.mode, 'live')
    assert.equal(m.now, 'Morning swim')
    assert.equal(m.next, 'vs Empire 3:45 PM') // raw scheduled label, never "ETA"
    assert.equal(m.cueKind, null)
  }
})

test('buildLedgeModel: aurelia is cue-only — none without a reveal, cue with one', () => {
  assert.equal(buildLedgeModel({ trip: TRIP, traveler: 'aurelia', now: NOON_D2 }).mode, 'none')
  const m = buildLedgeModel({ trip: TRIP, traveler: 'aurelia', now: NOON_D2, surpriseRevealCue: 1 })
  assert.deepEqual(m, { mode: 'cue', cueKind: 'surprise-revealed' })
})

test('buildLedgeModel: cue priority — a reveal outranks weave-ready', () => {
  const m = buildLedgeModel({ trip: TRIP, traveler: 'jonathan', now: NOON_D2, weaveReady: true, surpriseRevealCue: 2 })
  assert.equal(m.cueKind, 'surprise-revealed')
  const w = buildLedgeModel({ trip: TRIP, traveler: 'jonathan', now: NOON_D2, weaveReady: true })
  assert.equal(w.cueKind, 'weave-ready')
})
