// PARITY: the worker's photo→stop matcher mirror vs the client original.
//
// worker/src/photoMatch.js mirrors app/src/lib/photoMatch.js. The dayStopIds
// mirror already has a parity test for the shape gates; THIS one covers the rest
// of the matcher — matchPhotoToStop, buildDayIndex, the cluster/deviation pass,
// and the whole-pipeline matchPhotosToStops. BOTH copies run over one shared
// fixture corpus and their FULL match records must be deep-equal. If either side
// changes matching semantics, this file goes red before the two can drift apart
// in production (which would let the worker heal a photo somewhere the client
// would never have filed it).
//
// The client import is safe under vitest (same reasoning as dayStopIds-parity):
// photoMatch.js's static chain is plain .js (photoBackfill.js → exifRead.js,
// whose exifreader dependency is a DYNAMIC import inside a function no pure
// helper on this path calls; tripShape.js imports nothing).
//
// NON-VACUOUS: the corpus is engineered to exercise every matcher branch — a
// GPS win to the nearest stop, base-priority, base-yields-to-specific, the
// interstitial fallback, the stay no-GPS→base default, the route no-GPS→before
// binding, home-day suppression, out-of-range/unmatched, and a 3+ photo cluster
// that promotes to a deviation. Each case also pins an EXPECTED matchType
// distribution so both copies can't be identically wrong about which branch ran.
//
// EXTEND THE CORPUS: add a `{ name, trip, photos, expectTypes }` entry.
// `expectTypes` is the sorted list of matchType values the pipeline should emit
// for `photos` (order-independent) — the non-vacuous anchor.

import { describe, it, expect } from 'vitest'
import {
  matchPhotosToStops as clientMatch,
  matchPhotoToStop as clientMatchOne,
  buildDayIndex as clientBuildDayIndex,
  haversineMeters as clientHaversine,
  distanceToPolylineMeters as clientPolyline,
} from '../../app/src/lib/photoMatch.js'
import {
  matchPhotosToStops as workerMatch,
  matchPhotoToStop as workerMatchOne,
  buildDayIndex as workerBuildDayIndex,
  haversineMeters as workerHaversine,
  distanceToPolylineMeters as workerPolyline,
  nearestLocatedStops,
} from '../src/photoMatch.js'

// A GPS + capture-time photo.
const P = (id, capturedAt, lat, lng) => ({ id, capturedAt, lat, lng })
// A no-GPS photo (capture-time only).
const T = (id, capturedAt) => ({ id, capturedAt })

const CORPUS = [
  {
    name: 'GPS wins to the nearest specific stop; a far shot is interstitial',
    trip: {
      id: 'r1',
      shape: 'route', // no implicit base — keep the branch set clean
      days: [
        {
          n: 1,
          isoDate: '2026-07-01',
          stops: [
            { id: 's-museum', time: '10:00 AM', lat: 29.7256, lng: -95.3906 },
            { id: 's-dinner', time: '7:00 PM', lat: 29.7411, lng: -95.4012 },
          ],
        },
      ],
    },
    photos: [
      P('p-at-museum', '2026-07-01T15:00:00.000Z', 29.7257, -95.3907), // ~15m → museum
      P('p-at-dinner', '2026-07-01T23:30:00.000Z', 29.7412, -95.4013), // → dinner
      P('p-faraway', '2026-07-01T18:00:00.000Z', 29.9, -95.7), // >1km from both → interstitial
    ],
    expectTypes: ['gps+time', 'gps+time', 'interstitial'],
  },
  {
    name: 'base-priority: a porch shot files to the cabin base, not the timed dinner',
    trip: {
      id: 'r2',
      shape: 'stay',
      lodging: { name: 'The cabin', lat: 43.24, lng: -72.9 },
      days: [
        {
          n: 1,
          isoDate: '2026-07-01',
          stops: [
            { id: 's-cabin', kind: 'lodging', lat: 43.24, lng: -72.9 },
            { id: 's-dinner', time: '7:00 PM', lat: 43.30, lng: -72.95 },
          ],
        },
      ],
    },
    photos: [
      P('p-porch', '2026-07-01T14:00:00.000Z', 43.2401, -72.9001), // at the cabin
      P('p-dinner', '2026-07-01T23:30:00.000Z', 43.3001, -72.9501), // essentially at dinner
    ],
    expectTypes: ['gps+time', 'gps+time'],
  },
  {
    name: 'stay no-GPS photo defaults to the day base (time match)',
    trip: {
      id: 'r3',
      shape: 'stay',
      lodging: { name: 'Beach house', lat: 42.05, lng: -70.18 },
      homeBase: { lat: 42.05, lng: -70.18, label: '690 Commercial St' },
      days: [
        { n: 1, isoDate: '2026-07-01', stops: [{ id: 's-swim', time: '2:00 PM', lat: 42.06, lng: -70.19 }] },
      ],
    },
    photos: [T('p-nogps', '2026-07-01T16:00:00.000Z')],
    expectTypes: ['time'],
  },
  {
    name: 'route no-GPS photo binds to the bracketing clock stop (before)',
    trip: {
      id: 'r4',
      shape: 'route',
      days: [
        {
          n: 1,
          isoDate: '2026-07-01',
          stops: [
            { id: 's-morning', time: '9:00 AM', lat: 40.0, lng: -80.0 },
            { id: 's-evening', time: '6:00 PM', lat: 41.0, lng: -81.0 },
          ],
        },
      ],
    },
    photos: [
      T('p-midday', '2026-07-01T14:00:00.000Z'), // after morning, before evening → 'time' on morning
      T('p-predawn', '2026-07-01T06:00:00.000Z'), // before first stop → interstitial
    ],
    expectTypes: ['interstitial', 'time'],
  },
  {
    name: 'home day suppresses the implicit base; out-of-range photo is unmatched',
    trip: {
      id: 'r5',
      shape: 'stay',
      lodging: { name: 'Grandmas', lat: 44.0, lng: -73.0 },
      homeBase: { lat: 44.0, lng: -73.0, label: 'Grandmas' },
      days: [
        { n: 1, isoDate: '2026-07-01', lodging: 'home', stops: [{ id: 's-x', time: '1:00 PM', lat: 44.01, lng: -73.01 }] },
      ],
    },
    photos: [
      T('p-home-nogps', '2026-07-01T20:00:00.000Z'), // home day → base suppressed → binds to before ('time')
      T('p-outside', '2025-01-01T12:00:00.000Z'), // not in any day → unmatched
      { id: 'p-nodate' }, // no capturedAt → unmatched
    ],
    expectTypes: ['time', 'unmatched', 'unmatched'],
  },
  {
    name: 'a 3+ photo cluster far off-route promotes to a deviation',
    trip: {
      id: 'r6',
      shape: 'route',
      days: [
        {
          n: 1,
          isoDate: '2026-07-01',
          stops: [
            { id: 's-a', time: '9:00 AM', lat: 30.0, lng: -90.0 },
            { id: 's-b', time: '5:00 PM', lat: 30.0, lng: -89.9 },
          ],
        },
      ],
    },
    photos: [
      // Three photos ~tens of meters apart, ~5km north of the route line.
      P('p-c1', '2026-07-01T13:00:00.000Z', 30.05, -89.95),
      P('p-c2', '2026-07-01T13:05:00.000Z', 30.0501, -89.9501),
      P('p-c3', '2026-07-01T13:10:00.000Z', 30.0502, -89.9502),
    ],
    expectTypes: ['deviation', 'deviation', 'deviation'],
  },
  {
    name: 'base YIELDS to a specific stop within baseYieldMeters (the yield branch)',
    trip: {
      id: 'r8',
      shape: 'stay',
      lodging: { name: 'The cabin', lat: 43.24, lng: -72.9 },
      days: [
        {
          n: 1,
          isoDate: '2026-07-01',
          stops: [
            { id: 's-cabin', kind: 'lodging', lat: 43.24, lng: -72.9 },
            { id: 's-dinner', time: '7:00 PM', lat: 43.241, lng: -72.9 }, // ~111m from the base
          ],
        },
      ],
    },
    // At the dinner stop: within 150m of it AND closer than the base → the base
    // yields, the photo files to the dinner (exercises specificWins).
    photos: [P('p-atdinner', '2026-07-01T23:30:00.000Z', 43.241, -72.9)],
    expectTypes: ['gps+time'],
  },
  {
    name: '3+ interstitial cluster WITHIN routeDeviationMeters stays interstitial (no promote)',
    trip: {
      id: 'r9',
      shape: 'route',
      days: [
        {
          n: 1,
          isoDate: '2026-07-01',
          stops: [
            { id: 's-a', time: '9:00 AM', lat: 30.0, lng: -90.0 },
            { id: 's-b', time: '5:00 PM', lat: 30.0, lng: -89.0 }, // ~96km east → a long route leg
          ],
        },
      ],
    },
    // A tight 3-photo cluster ~48km from either stop (→ interstitial) but only
    // ~1.2km off the route LINE (< 2km) → must NOT promote to deviation.
    photos: [
      P('n1', '2026-07-01T12:00:00.000Z', 30.010, -89.500),
      P('n2', '2026-07-01T12:05:00.000Z', 30.0105, -89.5005),
      P('n3', '2026-07-01T12:10:00.000Z', 30.011, -89.501),
    ],
    expectTypes: ['interstitial', 'interstitial', 'interstitial'],
  },
  {
    name: 'multi-night implicit base spans every non-home day',
    trip: {
      id: 'r7',
      shape: 'stay',
      lodging: { name: 'Lake cabin', lat: 45.0, lng: -93.0 },
      homeBase: { lat: 45.0, lng: -93.0, label: 'Lake cabin' },
      days: [
        { n: 1, isoDate: '2026-07-01', stops: [{ id: 's-d1', time: '12:00 PM', lat: 45.5, lng: -93.5 }] },
        { n: 2, isoDate: '2026-07-02', stops: [] },
      ],
    },
    photos: [
      P('p-atcabin-d2', '2026-07-02T15:00:00.000Z', 45.0001, -93.0001), // → implicit base day 2
      T('p-nogps-d1', '2026-07-01T18:00:00.000Z'), // stay → base default
    ],
    expectTypes: ['gps+time', 'time'],
  },
]

describe('worker photoMatch mirror — parity with the client matcher', () => {
  for (const c of CORPUS) {
    it(`whole-pipeline parity + branch coverage: ${c.name}`, () => {
      const client = clientMatch(c.photos, c.trip)
      const worker = workerMatch(c.photos, c.trip)
      // Full record deep-equality — matches AND the promoted deviation clusters.
      expect(worker).toEqual(client)
      // Non-vacuous: the matchType distribution is exactly what this case is
      // engineered to produce (catches an identically-wrong-on-both regression).
      const types = worker.matches.map((m) => m.matchType).sort()
      expect(types).toEqual([...c.expectTypes].sort())
    })

    it(`per-photo matchPhotoToStop parity: ${c.name}`, () => {
      const clientIdx = clientBuildDayIndex(c.trip)
      const workerIdx = workerBuildDayIndex(c.trip)
      for (const p of c.photos) {
        expect(workerMatchOne(p, workerIdx)).toEqual(clientMatchOne(p, clientIdx))
      }
    })
  }

  it('geometry helpers agree (haversine + polyline distance)', () => {
    expect(workerHaversine(29.72, -95.39, 29.74, -95.40)).toBeCloseTo(
      clientHaversine(29.72, -95.39, 29.74, -95.40),
      6
    )
    const line = [{ lat: 30, lng: -90 }, { lat: 30, lng: -89.9 }]
    expect(workerPolyline({ lat: 30.05, lng: -89.95 }, line)).toBeCloseTo(
      clientPolyline({ lat: 30.05, lng: -89.95 }, line),
      6
    )
    // Degenerate inputs behave identically.
    expect(workerHaversine(NaN, 0, 0, 0)).toBe(clientHaversine(NaN, 0, 0, 0))
    expect(workerPolyline({ lat: 0, lng: 0 }, [])).toBe(
      clientPolyline({ lat: 0, lng: 0 }, [])
    )
  })
})

describe('worker margin helper — nearestLocatedStops (the §5 D gate-3 addition)', () => {
  const trip = {
    id: 'm1',
    shape: 'route',
    days: [
      {
        n: 1,
        isoDate: '2026-07-01',
        stops: [
          { id: 's-near', time: '10:00 AM', lat: 29.7256, lng: -95.3906 },
          { id: 's-far', time: '7:00 PM', lat: 29.7411, lng: -95.4012 },
        ],
      },
    ],
  }
  const idx = workerBuildDayIndex(trip)

  it('reports the assigned winner + the nearest distinct runner-up', () => {
    const photo = P('p1', '2026-07-01T15:00:00.000Z', 29.7257, -95.3907)
    const m = nearestLocatedStops(photo, idx, 's-near')
    expect(m.winnerId).toBe('s-near')
    expect(m.runnerUpId).toBe('s-far')
    expect(m.winnerMeters).toBeLessThan(m.runnerUpMeters)
    // Winner is essentially at the stop; runner-up is the far dinner (~1km+).
    expect(m.winnerMeters).toBeLessThan(50)
    expect(m.runnerUpMeters).toBeGreaterThan(500)
  })

  it('a single located stop has no runner-up (null → gate treats as clearing)', () => {
    const soloTrip = {
      id: 'm2', shape: 'route',
      days: [{ n: 1, isoDate: '2026-07-01', stops: [{ id: 's-only', time: '10:00 AM', lat: 10, lng: 10 }] }],
    }
    const soloIdx = workerBuildDayIndex(soloTrip)
    const m = nearestLocatedStops(P('p', '2026-07-01T12:00:00.000Z', 10.0001, 10.0001), soloIdx, 's-only')
    expect(m.runnerUpId).toBeNull()
    expect(m.runnerUpMeters).toBeNull()
  })

  it('a no-GPS photo yields no margin (null — gate 1 stops it anyway)', () => {
    expect(nearestLocatedStops(T('p', '2026-07-01T12:00:00.000Z'), idx, 's-near')).toBeNull()
  })
})
