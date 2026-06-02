// Tests for the live-map straight-line progress math. Runs under
// `npm test` (node --test) from app/. Verifies the generalized map's
// geometry + projection on a REAL non-Jackson trip (the whole point of
// the Phase 2 generalization) plus the degrade paths.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildRouteGeometry,
  projectOntoRoute,
  traveledPolyline,
} from '../../src/lib/routeProgress.js'
import { VOLLEYBALL_TRIP, NYC_TRIP, allStops } from '../../src/data/trips.js'

// Interpolate a point a fraction `f` along segment A→B.
function lerp(a, b, f) {
  return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f }
}

test('generalizes: builds real geometry from a non-Jackson trip (volleyball)', () => {
  const geo = buildRouteGeometry(allStops(VOLLEYBALL_TRIP))
  assert.ok(geo.waypoints.length >= 2, 'has a multi-point route')
  assert.ok(geo.totalMeters > 0, 'route has positive length')
  // Cumulative distances are monotonically non-decreasing.
  for (let i = 1; i < geo.cum.length; i += 1) {
    assert.ok(geo.cum[i] >= geo.cum[i - 1], 'cum distance is non-decreasing')
  }
  // Waypoints carry their stop identity (for next-up / selection).
  assert.ok(geo.waypoints[0].id && geo.waypoints[0].name)
})

test('also generalizes to NYC (sparse coords: some stops lack lat/lng)', () => {
  const all = allStops(NYC_TRIP)
  const geo = buildRouteGeometry(all)
  // NYC has fewer geocoded stops than total — geometry uses only the ones
  // with coords, and still produces a usable route.
  assert.ok(geo.waypoints.length >= 2)
  assert.ok(geo.waypoints.length <= all.length, 'coord-less stops are skipped')
  assert.ok(geo.totalMeters > 0)
})

test('progress fractions move correctly along a real leg', () => {
  const geo = buildRouteGeometry(allStops(VOLLEYBALL_TRIP))
  const a = geo.waypoints[0]
  const b = geo.waypoints[1]

  // Start of the route → ~0% on both axes.
  const atStart = projectOntoRoute({ lat: a.lat, lng: a.lng }, geo)
  assert.ok(atStart, 'projects at start')
  assert.equal(atStart.segIndex, 0)
  assert.ok(atStart.legFraction < 0.02, `leg ~0 (got ${atStart.legFraction})`)
  assert.ok(atStart.tripFraction < 0.02, `trip ~0 (got ${atStart.tripFraction})`)

  // Halfway along the first segment → leg ~50%.
  const mid = projectOntoRoute(lerp(a, b, 0.5), geo)
  assert.ok(Math.abs(mid.legFraction - 0.5) < 0.05, `leg ~0.5 (got ${mid.legFraction})`)

  // End of the route → trip ~100%.
  const last = geo.waypoints[geo.waypoints.length - 1]
  const atEnd = projectOntoRoute({ lat: last.lat, lng: last.lng }, geo)
  assert.ok(atEnd.tripFraction > 0.97, `trip ~1 (got ${atEnd.tripFraction})`)

  // Trip fraction is monotonic along the first segment.
  let prev = -1
  for (const f of [0, 0.25, 0.5, 0.75, 1]) {
    const p = projectOntoRoute(lerp(a, b, f), geo)
    assert.ok(p.tripFraction >= prev, 'trip fraction non-decreasing forward')
    prev = p.tripFraction
  }
})

test('traveled polyline grows from start toward the position', () => {
  const geo = buildRouteGeometry(allStops(VOLLEYBALL_TRIP))
  const a = geo.waypoints[0]
  const b = geo.waypoints[1]
  const near = traveledPolyline(geo, projectOntoRoute(lerp(a, b, 0.1), geo))
  const far = traveledPolyline(geo, projectOntoRoute({ lat: geo.waypoints.at(-1).lat, lng: geo.waypoints.at(-1).lng }, geo))
  assert.ok(near.length >= 2)
  assert.ok(far.length > near.length, 'more of the route drawn as you go further')
})

test('degrades: no position → null (live % hidden, never wrong)', () => {
  const geo = buildRouteGeometry(allStops(VOLLEYBALL_TRIP))
  assert.equal(projectOntoRoute(null, geo), null)
  assert.equal(projectOntoRoute({ lat: NaN, lng: NaN }, geo), null)
})

test('degrades: a trip with < 2 geocoded stops yields no route + no %', () => {
  // Simulate a sparse/unbuilt trip: one coord-bearing stop, rest coordless.
  const sparse = [
    { id: 's1', name: 'only point', lat: 42.0, lng: -71.0 },
    { id: 's2', name: 'no coords' },
    { id: 's3', name: 'also none' },
  ]
  const geo = buildRouteGeometry(sparse)
  assert.equal(geo.waypoints.length, 1)
  assert.equal(geo.totalMeters, 0)
  // No usable route → projection null → caller hides the trip %.
  assert.equal(projectOntoRoute({ lat: 42.0, lng: -71.0 }, geo), null)
})
