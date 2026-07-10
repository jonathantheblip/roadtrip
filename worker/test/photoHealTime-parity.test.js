// PARITY: the three worker "time/place" mirrors Build 2's offset-inference
// engine (§14) depends on — worker/src/tzOffset.js, worker/src/sunTimes.js,
// and worker/src/stayPlaceCoords.js — vs. their client originals
// (app/src/lib/localDate.js's tzOffsetMinutes, app/src/lib/sunTimes.js's
// sunTimes, and app/src/lib/tripShape.js's stayPlaceCoords). Deliberate,
// independent duplicates (never imported across the client/worker boundary —
// separate deployables, same house rule as sceneHash.js/photoMatch.js), so a
// value the client would compute one way could otherwise drift from what the
// worker infers server-side. One shared corpus, both copies, gated here.
//
// The client imports are safe under vitest for the SAME reason
// photoMatch-parity.test.js documents: these are plain pure .js files with no
// browser-only static import chain.

import { describe, it, expect } from 'vitest'
import { tzOffsetMinutes as clientTzOffset } from '../../app/src/lib/localDate.js'
import { tzOffsetMinutes as workerTzOffset } from '../src/tzOffset.js'
import { sunTimes as clientSunTimes } from '../../app/src/lib/sunTimes.js'
import { sunTimes as workerSunTimes } from '../src/sunTimes.js'
import { stayPlaceCoords as clientStayPlaceCoords } from '../../app/src/lib/tripShape.js'
import { stayPlaceCoords as workerStayPlaceCoords } from '../src/stayPlaceCoords.js'

describe('tzOffset.js (worker) parity with localDate.js#tzOffsetMinutes (client)', () => {
  const CASES = [
    ['2026-01-15T12:00:00.000Z', 'America/New_York'], // EST
    ['2026-07-15T12:00:00.000Z', 'America/New_York'], // EDT
    ['2026-01-15T12:00:00.000Z', 'Europe/Rome'], // CET
    ['2026-07-15T12:00:00.000Z', 'Europe/Rome'], // CEST
    ['2026-03-08T06:59:00.000Z', 'America/New_York'], // one minute before spring-forward
    ['2026-03-08T07:00:00.000Z', 'America/New_York'], // at spring-forward
    ['2026-11-01T05:59:00.000Z', 'America/New_York'], // one minute before fall-back
    ['2026-11-01T06:00:00.000Z', 'America/New_York'], // at fall-back
    ['2026-01-15T12:00:00.000Z', 'UTC'],
    ['2026-05-23T23:30:00.000Z', 'Pacific/Kiritimati'], // +14
  ]
  it('every DST-sensitive instant agrees on both sides', () => {
    for (const [iso, tz] of CASES) {
      const d = new Date(iso)
      const c = clientTzOffset(d, tz)
      const w = workerTzOffset(d, tz)
      expect(w).toBe(c)
      expect(typeof w).toBe('number')
    }
  })

  it('bad input degrades to null on both sides, never throws', () => {
    expect(workerTzOffset(null, 'America/New_York')).toBe(clientTzOffset(null, 'America/New_York'))
    expect(workerTzOffset(new Date('2026-01-01T00:00:00Z'), 'Not/AZone')).toBe(
      clientTzOffset(new Date('2026-01-01T00:00:00Z'), 'Not/AZone')
    )
    expect(workerTzOffset(new Date('2026-01-01T00:00:00Z'), 'Not/AZone')).toBeNull()
  })
})

describe('sunTimes.js (worker) parity with sunTimes.js (client)', () => {
  const PLACES = [
    [51.5074, -0.1278], // London
    [40.7128, -74.006], // NYC
    [43.24, -72.87], // the Vermont cabin
    [42.0621405, -70.1633884], // Provincetown
  ]
  const DATES = ['2026-03-20T12:00:00Z', '2026-06-21T16:00:00Z', '2026-12-21T16:00:00Z']

  it('sunrise/sunset/goldenHour are byte-identical (same ms) on both sides for a real corpus', () => {
    for (const [lat, lng] of PLACES) {
      for (const iso of DATES) {
        const d = new Date(iso)
        const c = clientSunTimes(d, lat, lng)
        const w = workerSunTimes(d, lat, lng)
        expect(w.sunrise?.getTime() ?? null).toBe(c.sunrise?.getTime() ?? null)
        expect(w.sunset?.getTime() ?? null).toBe(c.sunset?.getTime() ?? null)
        expect(w.goldenHour?.getTime() ?? null).toBe(c.goldenHour?.getTime() ?? null)
      }
    }
  })

  it('bad input → all null on both sides, never throws', () => {
    expect(workerSunTimes(null, 40, -74)).toEqual(clientSunTimes(null, 40, -74))
    expect(workerSunTimes(new Date('2026-06-21T12:00:00Z'), NaN, -74)).toEqual(
      clientSunTimes(new Date('2026-06-21T12:00:00Z'), NaN, -74)
    )
  })
})

describe('stayPlaceCoords.js (worker) parity with tripShape.js#stayPlaceCoords (client)', () => {
  const TRIPS = [
    { id: 'homebase', homeBase: { lat: 41.3225, lng: -72.0943, label: 'New London, CT' } },
    { id: 'lodging', lodging: { lat: 42.0621405, lng: -70.1633884, name: 'Provincetown Airbnb' } },
    {
      id: 'stop',
      days: [{ stops: [{ kind: 'sight', lat: 1, lng: 1 }, { kind: 'lodging', lat: 43.24, lng: -72.87, name: 'The cabin' }] }],
    },
    { id: 'nothing', lodging: { name: 'no coords here' } },
    { id: 'empty' },
  ]
  it('agrees on both sides for every real trip shape', () => {
    for (const trip of TRIPS) {
      expect(workerStayPlaceCoords(trip)).toEqual(clientStayPlaceCoords(trip))
    }
  })
})
