// Multi-leg flights — pure model tests. A legacy flat-field stop must keep
// rendering exactly as it always has (no fabricated departure info, no
// invented day delta); a modern multi-segment stop earns the honest "+N day"
// / layover treatment the design calls for.
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  flightSegments,
  flightLayovers,
  isMultiSegmentFlight,
  segmentDayDelta,
  overallDayDelta,
  flightSummaryLine,
  emptyFlightSegment,
} from '../../src/lib/flightSegments.js'

test('flightSegments: no flight fields at all → []', () => {
  assert.deepEqual(flightSegments({}), [])
  assert.deepEqual(flightSegments({ name: 'Dinner', kind: 'food' }), [])
})

test('flightSegments: a legacy flat-field stop synthesizes ONE segment — arrival side only, never a guessed departure', () => {
  const stop = {
    flightNumber: 'DL4961', flightOrigin: 'IND', flightDest: 'LGA',
    flightDate: '2026-05-01', scheduledArrivalLocal: '17:17', time: '5:17 PM',
  }
  const segs = flightSegments(stop)
  assert.equal(segs.length, 1)
  assert.equal(segs[0].flightNo, 'DL4961')
  assert.equal(segs[0].from.code, 'IND')
  assert.equal(segs[0].to.code, 'LGA')
  assert.equal(segs[0].arr.date, '2026-05-01')
  assert.equal(segs[0].arr.local, '17:17')
  assert.equal(segs[0].dep.date, null, 'the legacy shape never recorded a departure date — never fabricated')
  assert.equal(segs[0].dep.local, '', 'nor a departure time')
  assert.equal(isMultiSegmentFlight(stop), false)
})

test('flightSegments: scheduledArrivalLocal absent falls back to stop.time', () => {
  const stop = { flightNumber: 'AA1', flightOrigin: 'BOS', flightDest: 'JFK', time: '3:00 PM' }
  assert.equal(flightSegments(stop)[0].arr.local, '3:00 PM')
})

test('flightSegments: the modern stop.flight.segments[] shape wins over any legacy flat fields present alongside it', () => {
  const stop = {
    flightNumber: 'LEGACY1', flightOrigin: 'XXX', flightDest: 'YYY',
    flight: {
      segments: [
        { flightNo: 'DL100', from: { code: 'BOS', tz: 'America/New_York' }, to: { code: 'FRA', tz: 'Europe/Berlin' }, dep: { date: '2026-08-01', local: '9:35 PM' }, arr: { date: '2026-08-02', local: '11:05 AM' } },
        { flightNo: 'DL200', from: { code: 'FRA', tz: 'Europe/Berlin' }, to: { code: 'FCO', tz: 'Europe/Rome' }, dep: { date: '2026-08-02', local: '12:45 PM' }, arr: { date: '2026-08-02', local: '2:20 PM' } },
      ],
      layovers: [{ code: 'FRA', mins: 100 }],
    },
  }
  const segs = flightSegments(stop)
  assert.equal(segs.length, 2)
  assert.equal(segs[0].flightNo, 'DL100')
  assert.equal(segs[1].to.code, 'FCO')
  assert.equal(isMultiSegmentFlight(stop), true)
  assert.deepEqual(flightLayovers(stop), [{ code: 'FRA', mins: 100 }])
})

test('flightSegments: a malformed segment entry is defensively normalized, never throws', () => {
  const stop = { flight: { segments: [{ flightNo: 42, from: null, dep: { date: 'garbage' } }] } }
  const segs = flightSegments(stop)
  assert.equal(segs.length, 1)
  assert.equal(segs[0].flightNo, '', 'a non-string flightNo is dropped, not coerced')
  assert.deepEqual(segs[0].from, { code: '', city: '', tz: '' })
  assert.equal(segs[0].dep.date, null, 'an invalid date string is rejected, not passed through')
})

test('segmentDayDelta: null (never a fabricated "+0") when either date is missing', () => {
  assert.equal(segmentDayDelta({ dep: {}, arr: {} }), null)
  assert.equal(segmentDayDelta({ dep: { date: '2026-08-01' }, arr: {} }), null)
})

test('segmentDayDelta: same-day is null (a "+0" tag would be noise, not honesty)', () => {
  assert.equal(segmentDayDelta({ dep: { date: '2026-08-01' }, arr: { date: '2026-08-01' } }), null)
})

test('segmentDayDelta: a real calendar crossing is a positive integer', () => {
  assert.equal(segmentDayDelta({ dep: { date: '2026-08-01' }, arr: { date: '2026-08-02' } }), 1)
  assert.equal(segmentDayDelta({ dep: { date: '2026-08-01' }, arr: { date: '2026-08-03' } }), 2)
})

test('overallDayDelta: a single-segment stop mirrors segmentDayDelta', () => {
  const stop = { flightNumber: 'AA1', flightDate: '2026-05-02' } // no dep.date → null
  assert.equal(overallDayDelta(stop), null)
})

test('overallDayDelta: a multi-segment connection spans FIRST departure to LAST arrival, even across a layover', () => {
  const stop = {
    flight: {
      segments: [
        { flightNo: 'DL100', from: { code: 'BOS' }, to: { code: 'FRA' }, dep: { date: '2026-08-01', local: '9:35 PM' }, arr: { date: '2026-08-02', local: '11:05 AM' } },
        { flightNo: 'DL200', from: { code: 'FRA' }, to: { code: 'FCO' }, dep: { date: '2026-08-02', local: '12:45 PM' }, arr: { date: '2026-08-02', local: '2:20 PM' } },
      ],
      layovers: [{ code: 'FRA', mins: 100 }],
    },
  }
  assert.equal(overallDayDelta(stop), 1, 'BOS 08-01 → FCO 08-02, one calendar day crossed overall')
})

test('flightSummaryLine: a legacy/single-segment stop renders the EXACT existing format ("flightNo · ORIGIN→DEST")', () => {
  const stop = { flightNumber: 'DL4961', flightOrigin: 'IND', flightDest: 'LGA', flightDate: '2026-05-01', scheduledArrivalLocal: '17:17' }
  assert.equal(flightSummaryLine(stop), 'DL4961 · IND→LGA')
})

test('flightSummaryLine: no flight at all → empty string', () => {
  assert.equal(flightSummaryLine({}), '')
})

test('flightSummaryLine: a connection reads "dep leg → arr leg +N day · N stop(s) CODE"', () => {
  const stop = {
    flight: {
      segments: [
        { flightNo: 'DL100', from: { code: 'BOS' }, to: { code: 'FRA' }, dep: { date: '2026-08-01', local: '9:35 PM' }, arr: { date: '2026-08-02', local: '11:05 AM' } },
        { flightNo: 'DL200', from: { code: 'FRA' }, to: { code: 'FCO' }, dep: { date: '2026-08-02', local: '12:45 PM' }, arr: { date: '2026-08-02', local: '2:20 PM' } },
      ],
      layovers: [{ code: 'FRA', mins: 100 }],
    },
  }
  const line = flightSummaryLine(stop)
  assert.match(line, /^9:35 PM BOS → 2:20 PM FCO \+1 Sun · 1 stop FRA$/)
})

test('flightSummaryLine: a connection with no calendar crossing omits the day tag but still shows the stop count', () => {
  const stop = {
    flight: {
      segments: [
        { flightNo: 'AA1', from: { code: 'ORD' }, to: { code: 'DFW' }, dep: { date: '2026-08-01', local: '8:00 AM' }, arr: { date: '2026-08-01', local: '10:30 AM' } },
        { flightNo: 'AA2', from: { code: 'DFW' }, to: { code: 'AUS' }, dep: { date: '2026-08-01', local: '11:30 AM' }, arr: { date: '2026-08-01', local: '12:30 PM' } },
      ],
      layovers: [{ code: 'DFW', mins: 60 }],
    },
  }
  assert.equal(flightSummaryLine(stop), '8:00 AM ORD → 12:30 PM AUS · 1 stop DFW')
})

test('emptyFlightSegment: a blank row for the editor\'s "Add a connection" action', () => {
  const e = emptyFlightSegment()
  assert.equal(e.flightNo, '')
  assert.deepEqual(e.from, { code: '', city: '', tz: '' })
  assert.deepEqual(e.dep, { date: '', local: '' })
})
