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

// A trip whose STORED window was pushed to bracket "now" but whose real
// itinerary (the actual stops) all sit weeks in the past — the stale-trip-
// faking-live failure mode that opened the app on the wrong trip and flashed a
// "NOW · Match 1" rail for an event weeks gone. isTripLive must stand it down.
const STALE_DATED = {
  id: 'stale',
  dateRangeStart: '2026-05-22',
  dateRangeEnd: '2026-06-30', // pushed forward so the window brackets June 18
  days: [
    { isoDate: '2026-05-22', stops: [{ id: 'a', name: 'Match 1', time: '4:00 PM' }] },
    { isoDate: '2026-05-25', stops: [{ id: 'b', name: 'Match 2', time: '10:00 AM' }] },
  ],
}
const JUNE18 = new Date('2026-06-18T22:00:00')

test('isTripLive: a stale-dated trip (window brackets today, itinerary is weeks past) is NOT live', () => {
  assert.equal(isTripLive(STALE_DATED, JUNE18), false)
})

test('isTripLive: an archived trip is never live, even when dates + itinerary bracket today', () => {
  assert.equal(isTripLive({ ...TRIP, archivedAt: '2026-05-23T00:00:00Z' }, NOON_D2), false)
})

test('isTripLive: a trailing gap-day stays live (itinerary grace)', () => {
  // Window runs to May 26, last stop is May 24; on May 26 (2 days past the last
  // stop, well inside the itinerary grace) the trip is still live — a real gap
  // day must not read as ended.
  assert.equal(isTripLive({ ...TRIP, dateRangeEnd: '2026-05-26' }, new Date('2026-05-26T12:00:00')), true)
})

test('isTripLive: a dateless skeleton trip falls back to the stored window', () => {
  // No isoDate on any day → can't disprove staleness → defer to the window.
  const t = { dateRangeStart: '2026-05-22', dateRangeEnd: '2026-05-24', days: [{ stops: [] }] }
  assert.equal(isTripLive(t, NOON_D2), true)
})

test('buildLedgeModel: a stale-dated trip stands the live rail down', () => {
  assert.equal(buildLedgeModel({ trip: STALE_DATED, traveler: 'jonathan', now: JUNE18 }).mode, 'none')
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

test('buildLedgeModel: morning before today’s first stop leads with today, not last night', () => {
  // 7 AM on day 2 — the most-recent past stop is last night's Beach Bungalow
  // (day 1). The ledge must lead with today's first stop, not pin a stale "now"
  // to last night's lodging all morning.
  const early = new Date('2026-05-23T07:00:00')
  const m = buildLedgeModel({ trip: TRIP, traveler: 'jonathan', now: early })
  assert.equal(m.mode, 'live')
  assert.equal(m.now, 'Morning swim') // today's first scheduled stop
  assert.equal(m.next, '') // no stale across-the-night now→next pair
})

test('selectScheduleNowNext: reports passedCount + totalCount for honest progress', () => {
  const r = selectScheduleNowNext(TRIP, NOON_D2)
  // 4 timed stops total; at noon day 2, the bungalow (last night) and the 9 AM
  // swim have passed → 2 done.
  assert.equal(r.totalCount, 4)
  assert.equal(r.passedCount, 2)
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

// ── Place-aware ledge (family-trips shift): on a STAY, the rail says "At [place]"
// when THIS device is actually there — not the clock's next timed stop. ──
const STAY = {
  id: 'stay', dateRangeStart: '2026-05-22', dateRangeEnd: '2026-05-24',
  homeBase: { lat: 41.32, lng: -72.09, label: 'Beach Bungalow' },
  lodging: { name: 'Beach Bungalow' },
  days: [
    { isoDate: '2026-05-22', lodging: 'Beach Bungalow', stops: [{ id: 'a', name: 'Beach Bungalow', kind: 'lodging', time: 'Evening' }] },
    { isoDate: '2026-05-23', lodging: 'Beach Bungalow', stops: [{ id: 'din', name: 'Dinner out', time: '7:00 PM' }] },
    { isoDate: '2026-05-24', lodging: '— (home)', stops: [{ id: 'd', name: 'Drive home', time: '10:00 AM' }] },
  ],
}
const AT_BUNGALOW = { lat: 41.3201, lng: -72.0901, accuracy: 20 }
const FAR_AWAY = { lat: 41.5, lng: -72.5, accuracy: 20 }

test('buildLedgeModel: STAY + at the place → "At [place]", next = today’s next timed event', () => {
  const m = buildLedgeModel({ trip: STAY, traveler: 'jonathan', now: NOON_D2, position: AT_BUNGALOW })
  assert.equal(m.now, 'At Beach Bungalow')
  assert.equal(m.atPlace, true)
  assert.equal(m.next, 'Dinner out 7:00 PM') // the clock event still shows as "next"
})

test('buildLedgeModel: STAY but NOT near the place → honest clock readout (unchanged), no "At"', () => {
  const m = buildLedgeModel({ trip: STAY, traveler: 'jonathan', now: NOON_D2, position: FAR_AWAY })
  assert.notEqual(m.now, 'At Beach Bungalow')
  assert.ok(!m.atPlace)
})

test('buildLedgeModel: STAY with no fix, no active event → leads with the place (recenter), not the clock', () => {
  // RECENTER (FAMILY_TRIPS_VISION §5): the place is the baseline "now" on a stay —
  // the design leads with it. Was: fell back to the clock readout. The
  // "we're here/out" tap + shared location refine this when the family is out.
  const m = buildLedgeModel({ trip: STAY, traveler: 'jonathan', now: NOON_D2, position: null })
  assert.equal(m.now, 'At Beach Bungalow')
  assert.equal(m.placeGuess, true)
  assert.ok(!m.atPlace)
  assert.equal(m.next, 'Dinner out 7:00 PM') // tonight's plan still shows as next
})

// A one-day stay with a morning + an evening plan — the cabin-stay shape that
// produced the live mishmash ("now: Brunch" all afternoon).
const STAY_DAY = {
  id: 'stayday', dateRangeStart: '2026-05-23', dateRangeEnd: '2026-05-23',
  homeBase: { lat: 41.32, lng: -72.09, label: 'The Cabin' },
  lodging: { name: 'The Cabin' },
  days: [
    { isoDate: '2026-05-23', lodging: 'The Cabin', stops: [
      { id: 'br', name: 'Brunch out', time: '10:00 AM' },
      { id: 'din', name: 'Dinner out', time: '7:00 PM' },
    ] },
  ],
}

test('buildLedgeModel: STAY, a morning plan is NOT "now" in the afternoon → leads with the place', () => {
  const afternoon = new Date('2026-05-23T15:00:00') // brunch was 5h ago, window long closed
  const m = buildLedgeModel({ trip: STAY_DAY, traveler: 'jonathan', now: afternoon, position: null })
  assert.equal(m.now, 'At The Cabin') // NOT "Brunch out"
  assert.equal(m.placeGuess, true)
  assert.equal(m.next, 'Dinner out 7:00 PM') // tonight's plan still shows as next
})

test('buildLedgeModel: STAY, DURING the event window the timed stop IS "now"', () => {
  const brunchtime = new Date('2026-05-23T10:30:00') // inside the brunch window
  const m = buildLedgeModel({ trip: STAY_DAY, traveler: 'jonathan', now: brunchtime, position: null })
  assert.equal(m.now, 'Brunch out')
  assert.ok(!m.placeGuess)
})

test('buildLedgeModel: a ROUTE trip is NEVER place-aware, even with a position at a stop', () => {
  const m = buildLedgeModel({ trip: TRIP, traveler: 'jonathan', now: NOON_D2, position: AT_BUNGALOW })
  assert.ok(!m.atPlace)
  assert.equal(m.now, 'Morning swim') // today's clock readout, exactly as before
})
