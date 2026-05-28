// Tests for the photo→stop matcher. This is the core algorithm of
// the backfill flow — tests cover the four match types, the day-
// boundary logic, deviation clustering, and the route-distance
// promotion rule that distinguishes a deviation from a transit
// snapshot.

import { test } from 'node:test'
import assert from 'node:assert/strict'

const {
  haversineMeters,
  distanceToSegmentMeters,
  distanceToPolylineMeters,
  buildDayIndex,
  matchPhotoToStop,
  clusterInterstitialPhotos,
  promoteDeviationClusters,
  matchPhotosToStops,
  MATCH_THRESHOLDS,
} = await import('../../src/lib/photoMatch.js')

// ─── Geometry primitives ──────────────────────────────────────────

test('haversineMeters: same point is 0', () => {
  assert.equal(haversineMeters(42.3437, -73.6062, 42.3437, -73.6062), 0)
})

test('haversineMeters: ~111km per degree of latitude', () => {
  const d = haversineMeters(0, 0, 1, 0)
  assert.ok(Math.abs(d - 111_111) < 200, `got ${d}`)
})

test('haversineMeters: rejects non-finite inputs', () => {
  assert.equal(haversineMeters(42, -73, NaN, -73), Infinity)
  assert.equal(haversineMeters(42, -73, 42, undefined), Infinity)
})

test('distanceToSegmentMeters: point on segment is ~0', () => {
  const d = distanceToSegmentMeters(
    { lat: 42.5, lng: -73.5 },
    { lat: 42.0, lng: -73.5 },
    { lat: 43.0, lng: -73.5 }
  )
  assert.ok(d < 1, `got ${d}`)
})

test('distanceToSegmentMeters: perpendicular distance from horizontal segment', () => {
  // segment runs along latitude 42, photo is at lat 42.01 (~1.1km north)
  const d = distanceToSegmentMeters(
    { lat: 42.01, lng: -73.5 },
    { lat: 42.0, lng: -74.0 },
    { lat: 42.0, lng: -73.0 }
  )
  assert.ok(d > 1_000 && d < 1_200, `got ${d}`)
})

test('distanceToSegmentMeters: clamps to endpoint when off-segment', () => {
  // photo is east of the eastern endpoint, perpendicular foot off the segment
  const d = distanceToSegmentMeters(
    { lat: 42.0, lng: -72.0 },
    { lat: 42.0, lng: -74.0 },
    { lat: 42.0, lng: -73.0 }
  )
  // distance from (42, -72) to (42, -73) ≈ 82.6km at this latitude
  assert.ok(d > 80_000 && d < 85_000, `got ${d}`)
})

test('distanceToPolylineMeters: returns Infinity for short polylines', () => {
  assert.equal(
    distanceToPolylineMeters({ lat: 42, lng: -73 }, []),
    Infinity
  )
  assert.equal(
    distanceToPolylineMeters({ lat: 42, lng: -73 }, [{ lat: 42, lng: -73 }]),
    Infinity
  )
})

test('distanceToPolylineMeters: takes the min over segments', () => {
  // Polyline goes (42,-74) → (42,-73) → (42,-72). Photo is at
  // (42.01, -72.5) — closest to the second segment.
  const d = distanceToPolylineMeters(
    { lat: 42.01, lng: -72.5 },
    [
      { lat: 42.0, lng: -74.0 },
      { lat: 42.0, lng: -73.0 },
      { lat: 42.0, lng: -72.0 },
    ]
  )
  assert.ok(d > 1_000 && d < 1_200, `got ${d}`)
})

// ─── Day index & single-photo matching ────────────────────────────

function makeTrip(days) {
  return {
    id: 'test-trip',
    dateRangeStart: days[0].isoDate,
    dateRangeEnd: days[days.length - 1].isoDate,
    days,
  }
}

const ART_OMI = { id: 's1', time: '11:00 AM', name: 'Art Omi', lat: 42.344, lng: -73.606 }
const CABIN = {
  id: 's2',
  time: '6:00 PM',
  name: 'Postcard Cabins',
  lat: 42.229,
  lng: -73.985,
}
const STEAMTOWN = {
  id: 's3',
  time: '9:30 AM',
  name: 'Steamtown NHS',
  lat: 41.41,
  lng: -75.67,
}
const MILLWORKS = {
  id: 's4',
  time: '12:30 PM',
  name: 'Millworks',
  lat: 40.27,
  lng: -76.89,
}

const TRIP = makeTrip([
  {
    n: 1,
    isoDate: '2026-04-17',
    title: 'Up the Hudson',
    stops: [ART_OMI, CABIN],
  },
  {
    n: 2,
    isoDate: '2026-04-18',
    title: 'The Long Drive',
    stops: [STEAMTOWN, MILLWORKS],
  },
])

test('buildDayIndex indexes each day by isoDate', () => {
  const idx = buildDayIndex(TRIP)
  assert.equal(idx.size, 2)
  assert.ok(idx.has('2026-04-17'))
  assert.ok(idx.has('2026-04-18'))
})

test('buildDayIndex sorts clock stops by parsed time', () => {
  const trip = makeTrip([
    {
      n: 1,
      isoDate: '2026-04-17',
      stops: [
        { id: 'a', time: '6:00 PM' },
        { id: 'b', time: '9:00 AM' },
        { id: 'c', time: '1:00 PM' },
      ],
    },
  ])
  const idx = buildDayIndex(trip)
  const day = idx.get('2026-04-17')
  assert.deepEqual(
    day.sortedClockStops.map((s) => s.id),
    ['b', 'c', 'a']
  )
})

test('buildDayIndex splits clock vs loose-time stops', () => {
  const trip = makeTrip([
    {
      n: 1,
      isoDate: '2026-04-17',
      stops: [
        { id: 'a', time: '9:00 AM' },
        { id: 'b', time: 'Evening' },
      ],
    },
  ])
  const idx = buildDayIndex(trip)
  const day = idx.get('2026-04-17')
  assert.equal(day.sortedClockStops.length, 1)
  assert.equal(day.looseStops.length, 1)
  assert.equal(day.sortedClockStops[0].id, 'a')
  assert.equal(day.looseStops[0].id, 'b')
})

test('matchPhotoToStop: GPS+time match when photo is at the stop during its window', () => {
  const dayIndex = buildDayIndex(TRIP)
  const photo = {
    id: 'p1',
    capturedAt: '2026-04-17T11:30:00Z',
    lat: 42.344,
    lng: -73.606,
  }
  const match = matchPhotoToStop(photo, dayIndex)
  assert.equal(match.matchType, 'gps+time')
  assert.equal(match.stopId, 's1')
  assert.equal(match.dayN, 1)
})

test('matchPhotoToStop: time-only match when photo has no GPS', () => {
  const dayIndex = buildDayIndex(TRIP)
  const photo = {
    id: 'p1',
    capturedAt: '2026-04-17T11:30:00Z',
    lat: null,
    lng: null,
  }
  const match = matchPhotoToStop(photo, dayIndex)
  assert.equal(match.matchType, 'time')
  assert.equal(match.stopId, 's1')
})

test('matchPhotoToStop: interstitial when photo has GPS but is far from the stop in the window', () => {
  const dayIndex = buildDayIndex(TRIP)
  // Photo is at 11:30 AM (Art Omi's window), but at coordinates 100km away.
  const photo = {
    id: 'p1',
    capturedAt: '2026-04-17T11:30:00Z',
    lat: 41.5,
    lng: -72.0,
  }
  const match = matchPhotoToStop(photo, dayIndex)
  assert.equal(match.matchType, 'interstitial')
  assert.equal(match.interstitialBefore, 's1')
  assert.equal(match.interstitialAfter, 's2')
})

test('matchPhotoToStop: photo before first clock stop is interstitial with no before', () => {
  const dayIndex = buildDayIndex(TRIP)
  const photo = {
    id: 'p1',
    capturedAt: '2026-04-17T08:00:00Z',
    lat: 41.5,
    lng: -72.0,
  }
  const match = matchPhotoToStop(photo, dayIndex)
  assert.equal(match.matchType, 'interstitial')
  assert.equal(match.interstitialBefore, null)
  assert.equal(match.interstitialAfter, 's1')
})

test('matchPhotoToStop: photo after last clock stop falls in last stop window', () => {
  const dayIndex = buildDayIndex(TRIP)
  // 11:00 PM on day 1 — past the 6:00 PM cabin stop, but still in
  // its window (last clock stop's window runs to end-of-day). With
  // GPS far from the cabin → interstitial after last stop.
  const photo = {
    id: 'p1',
    capturedAt: '2026-04-17T23:00:00Z',
    lat: 41.5,
    lng: -72.0,
  }
  const match = matchPhotoToStop(photo, dayIndex)
  assert.equal(match.matchType, 'interstitial')
  assert.equal(match.interstitialBefore, 's2')
  assert.equal(match.interstitialAfter, null)
})

test('matchPhotoToStop: photo outside trip range is unmatched', () => {
  const dayIndex = buildDayIndex(TRIP)
  const photo = {
    id: 'p1',
    capturedAt: '2026-05-01T11:30:00Z',
    lat: 42.344,
    lng: -73.606,
  }
  const match = matchPhotoToStop(photo, dayIndex)
  assert.equal(match.matchType, 'unmatched')
  assert.equal(match.dayN, null)
})

test('matchPhotoToStop: no capturedAt is unmatched', () => {
  const dayIndex = buildDayIndex(TRIP)
  const match = matchPhotoToStop({ id: 'p1', capturedAt: null }, dayIndex)
  assert.equal(match.matchType, 'unmatched')
})

test('matchPhotoToStop: invalid capturedAt is unmatched', () => {
  const dayIndex = buildDayIndex(TRIP)
  const match = matchPhotoToStop(
    { id: 'p1', capturedAt: 'not-a-date' },
    dayIndex
  )
  assert.equal(match.matchType, 'unmatched')
})

test('matchPhotoToStop: time-only match when stop has no coordinates', () => {
  const tripNoCoords = makeTrip([
    {
      n: 1,
      isoDate: '2026-04-17',
      stops: [{ id: 's1', time: '11:00 AM', name: 'Indoor stop' }],
    },
  ])
  const dayIndex = buildDayIndex(tripNoCoords)
  const photo = {
    id: 'p1',
    capturedAt: '2026-04-17T11:30:00Z',
    lat: 42.0,
    lng: -73.0,
  }
  const match = matchPhotoToStop(photo, dayIndex)
  assert.equal(match.matchType, 'time')
  assert.equal(match.stopId, 's1')
})

test('matchPhotoToStop: GPS-only attach to a loose-time stop when no clock stops', () => {
  const trip = makeTrip([
    {
      n: 1,
      isoDate: '2026-04-17',
      stops: [
        { id: 'loose', time: 'Evening', name: 'Lodging', lat: 42.229, lng: -73.985 },
      ],
    },
  ])
  const dayIndex = buildDayIndex(trip)
  const photo = {
    id: 'p1',
    capturedAt: '2026-04-17T22:00:00Z',
    lat: 42.229,
    lng: -73.985,
  }
  const match = matchPhotoToStop(photo, dayIndex)
  assert.equal(match.matchType, 'gps+time')
  assert.equal(match.stopId, 'loose')
})

// ─── Clustering ───────────────────────────────────────────────────

test('clusterInterstitialPhotos: 3 photos within 500m form a cluster', () => {
  const photos = [
    { id: 'a', lat: 32.352, lng: -90.879 },
    { id: 'b', lat: 32.3522, lng: -90.8788 },
    { id: 'c', lat: 32.3521, lng: -90.879 },
  ]
  const matches = photos.map((p) => ({
    photoId: p.id,
    dayIsoDate: '2026-04-20',
    matchType: 'interstitial',
  }))
  const clusters = clusterInterstitialPhotos(matches, photos)
  assert.equal(clusters.length, 1)
  assert.equal(clusters[0].photoIds.length, 3)
  assert.ok(Math.abs(clusters[0].centroid.lat - 32.352) < 0.001)
})

test('clusterInterstitialPhotos: 2 photos within 500m are not a cluster (min size 3)', () => {
  const photos = [
    { id: 'a', lat: 32.352, lng: -90.879 },
    { id: 'b', lat: 32.3522, lng: -90.8788 },
  ]
  const matches = photos.map((p) => ({
    photoId: p.id,
    dayIsoDate: '2026-04-20',
    matchType: 'interstitial',
  }))
  const clusters = clusterInterstitialPhotos(matches, photos)
  assert.equal(clusters.length, 0)
})

test('clusterInterstitialPhotos: photos 1km apart do not cluster', () => {
  const photos = [
    { id: 'a', lat: 32.35, lng: -90.88 },
    { id: 'b', lat: 32.36, lng: -90.88 }, // ~1.1km north
    { id: 'c', lat: 32.37, lng: -90.88 }, // another ~1.1km north
  ]
  const matches = photos.map((p) => ({
    photoId: p.id,
    dayIsoDate: '2026-04-20',
    matchType: 'interstitial',
  }))
  const clusters = clusterInterstitialPhotos(matches, photos)
  assert.equal(clusters.length, 0)
})

test('clusterInterstitialPhotos: clusters do not merge across days', () => {
  const photos = [
    { id: 'a', lat: 32.352, lng: -90.879 },
    { id: 'b', lat: 32.3522, lng: -90.8788 },
    { id: 'c', lat: 32.3521, lng: -90.879 },
    { id: 'd', lat: 32.352, lng: -90.879 },
    { id: 'e', lat: 32.3522, lng: -90.8788 },
    { id: 'f', lat: 32.3521, lng: -90.879 },
  ]
  const matches = [
    ...photos.slice(0, 3).map((p) => ({
      photoId: p.id,
      dayIsoDate: '2026-04-20',
      matchType: 'interstitial',
    })),
    ...photos.slice(3).map((p) => ({
      photoId: p.id,
      dayIsoDate: '2026-04-21',
      matchType: 'interstitial',
    })),
  ]
  const clusters = clusterInterstitialPhotos(matches, photos)
  assert.equal(clusters.length, 2)
  const days = new Set(clusters.map((c) => c.dayIsoDate))
  assert.equal(days.size, 2)
})

test('clusterInterstitialPhotos: photos without GPS are ignored', () => {
  const photos = [
    { id: 'a', lat: 32.352, lng: -90.879 },
    { id: 'b', lat: null, lng: null },
    { id: 'c', lat: 32.3521, lng: -90.879 },
  ]
  const matches = photos.map((p) => ({
    photoId: p.id,
    dayIsoDate: '2026-04-20',
    matchType: 'interstitial',
  }))
  const clusters = clusterInterstitialPhotos(matches, photos)
  assert.equal(clusters.length, 0)
})

test('clusterInterstitialPhotos: only interstitial matches are considered', () => {
  const photos = [
    { id: 'a', lat: 32.352, lng: -90.879 },
    { id: 'b', lat: 32.3522, lng: -90.8788 },
    { id: 'c', lat: 32.3521, lng: -90.879 },
  ]
  const matches = photos.map((p) => ({
    photoId: p.id,
    dayIsoDate: '2026-04-20',
    matchType: 'gps+time',
  }))
  const clusters = clusterInterstitialPhotos(matches, photos)
  assert.equal(clusters.length, 0)
})

// ─── Deviation promotion ──────────────────────────────────────────

test('promoteDeviationClusters: cluster far from route promotes to deviation', () => {
  // Day with route line running through Mississippi I-20 corridor.
  // The Vicksburg murals are ~32.352, -90.879. The planned route
  // from McComb (31.244, -90.454) to Buc-ee's Terrell (32.731, -96.228)
  // passes through Vicksburg only via a major deviation north —
  // straight-line between those is closer to ~31.5, -94 — Vicksburg
  // is well off the line.
  const trip = makeTrip([
    {
      n: 1,
      isoDate: '2026-04-20',
      stops: [
        { id: 'mccomb', time: '9:00 AM', name: 'McComb', lat: 31.244, lng: -90.454 },
        {
          id: 'terrell',
          time: '8:00 PM',
          name: "Buc-ee's Terrell",
          lat: 32.731,
          lng: -96.228,
        },
      ],
    },
  ])
  const dayIndex = buildDayIndex(trip)
  const photos = [
    { id: 'a', lat: 32.352, lng: -90.879 },
    { id: 'b', lat: 32.3522, lng: -90.8788 },
    { id: 'c', lat: 32.3521, lng: -90.879 },
  ]
  const matches = photos.map((p) => ({
    photoId: p.id,
    dayIsoDate: '2026-04-20',
    matchType: 'interstitial',
  }))
  const clusters = clusterInterstitialPhotos(matches, photos)
  const promoted = promoteDeviationClusters(matches, clusters, dayIndex)
  assert.equal(promoted.deviationClusters.length, 1)
  assert.ok(promoted.deviationClusters[0].distanceToRouteMeters > 2_000)
  for (const m of promoted.matches) {
    assert.equal(m.matchType, 'deviation')
    assert.equal(m.deviationClusterId, clusters[0].id)
  }
})

test('promoteDeviationClusters: cluster on the route does NOT promote', () => {
  // Cluster sits right on the line between two stops; even with 3+
  // photos, no deviation.
  const trip = makeTrip([
    {
      n: 1,
      isoDate: '2026-04-20',
      stops: [
        { id: 'a', time: '9:00 AM', lat: 42.0, lng: -74.0 },
        { id: 'b', time: '6:00 PM', lat: 42.0, lng: -73.0 },
      ],
    },
  ])
  const dayIndex = buildDayIndex(trip)
  // Three photos on the route line midway — same lat, 500m apart in lng.
  const photos = [
    { id: 'p1', lat: 42.0, lng: -73.5 },
    { id: 'p2', lat: 42.0, lng: -73.5005 },
    { id: 'p3', lat: 42.0, lng: -73.501 },
  ]
  const matches = photos.map((p) => ({
    photoId: p.id,
    dayIsoDate: '2026-04-20',
    matchType: 'interstitial',
  }))
  const clusters = clusterInterstitialPhotos(matches, photos)
  assert.equal(clusters.length, 1, 'cluster should form')
  const promoted = promoteDeviationClusters(matches, clusters, dayIndex)
  assert.equal(promoted.deviationClusters.length, 0)
  for (const m of promoted.matches) assert.equal(m.matchType, 'interstitial')
})

// ─── End-to-end ───────────────────────────────────────────────────

test('matchPhotosToStops: end-to-end with the canonical Jackson scenario', () => {
  // Photos: one at Art Omi (GPS+time), one indoor at Steamtown
  // (time-only), one deviation cluster at Vicksburg.
  const trip = makeTrip([
    {
      n: 1,
      isoDate: '2026-04-17',
      stops: [ART_OMI],
    },
    {
      n: 2,
      isoDate: '2026-04-18',
      stops: [STEAMTOWN],
    },
    {
      n: 3,
      isoDate: '2026-04-20',
      stops: [
        { id: 'mccomb', time: '9:00 AM', name: 'McComb', lat: 31.244, lng: -90.454 },
        {
          id: 'terrell',
          time: '8:00 PM',
          name: "Buc-ee's Terrell",
          lat: 32.731,
          lng: -96.228,
        },
      ],
    },
  ])
  const photos = [
    {
      id: 'artomi',
      capturedAt: '2026-04-17T11:30:00Z',
      lat: 42.344,
      lng: -73.606,
    },
    {
      id: 'steamtown-indoor',
      capturedAt: '2026-04-18T10:00:00Z',
      lat: null,
      lng: null,
    },
    {
      id: 'vicksburg-1',
      capturedAt: '2026-04-20T15:30:00Z',
      lat: 32.352,
      lng: -90.879,
    },
    {
      id: 'vicksburg-2',
      capturedAt: '2026-04-20T15:35:00Z',
      lat: 32.3522,
      lng: -90.8788,
    },
    {
      id: 'vicksburg-3',
      capturedAt: '2026-04-20T15:40:00Z',
      lat: 32.3521,
      lng: -90.879,
    },
  ]
  const { matches, deviationClusters } = matchPhotosToStops(photos, trip)

  const byId = new Map(matches.map((m) => [m.photoId, m]))
  assert.equal(byId.get('artomi').matchType, 'gps+time')
  assert.equal(byId.get('artomi').stopId, 's1')
  assert.equal(byId.get('steamtown-indoor').matchType, 'time')
  assert.equal(byId.get('steamtown-indoor').stopId, 's3')
  for (const id of ['vicksburg-1', 'vicksburg-2', 'vicksburg-3']) {
    assert.equal(byId.get(id).matchType, 'deviation')
    assert.ok(byId.get(id).deviationClusterId)
  }
  assert.equal(deviationClusters.length, 1)
  assert.equal(deviationClusters[0].photoIds.length, 3)
})

test('matchPhotosToStops: thresholds are exposed for tuning', () => {
  assert.equal(MATCH_THRESHOLDS.gpsMatchMeters, 500)
  assert.equal(MATCH_THRESHOLDS.clusterDistanceMeters, 500)
  assert.equal(MATCH_THRESHOLDS.routeDeviationMeters, 2_000)
  assert.equal(MATCH_THRESHOLDS.clusterMinSize, 3)
})
