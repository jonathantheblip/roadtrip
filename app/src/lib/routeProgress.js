// Straight-line route geometry + live-progress projection for the map.
//
// DECIDED SCOPE: good-enough straight-line. No routing API, no road
// geometry, no geocoding — the route is the ordered stop coordinates
// joined by straight segments. A live GPS position is projected onto
// that polyline to derive two directionally-right fractions:
//   - legFraction: how far along the CURRENT segment (the "this drive" %)
//   - tripFraction: cumulative distance-along / total route length (trip %)
//
// REUSE (not re-derived): haversineMeters + distanceToSegmentMeters from
// photoMatch.js (live code — the photo-backfill matcher uses the same
// equirectangular projection). `segmentT` below mirrors that exact
// projection to recover the along-segment parameter, which
// distanceToSegmentMeters computes internally but does not return.
//
// Pure module — no DOM, no React — so it unit-tests under `node --test`.

import { haversineMeters, distanceToSegmentMeters } from './photoMatch.js'

function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

// Build straight-line route geometry from ordered stops. Only stops with
// finite coords participate; coord-less stops are skipped, so a sparse
// trip (e.g. NYC, 15/19 stops geocoded) degrades to the points it has.
// Returns { waypoints, cum, totalMeters }:
//   waypoints — [{ lat, lng, id, name }] in route order
//   cum       — cumulative meters from start to each waypoint
//   totalMeters — full straight-line route length
export function buildRouteGeometry(stops) {
  const waypoints = []
  for (const s of stops || []) {
    if (Number.isFinite(s?.lat) && Number.isFinite(s?.lng)) {
      waypoints.push({ lat: s.lat, lng: s.lng, id: s.id, name: s.name })
    }
  }
  const cum = waypoints.length ? [0] : []
  for (let i = 1; i < waypoints.length; i += 1) {
    const d = haversineMeters(
      waypoints[i - 1].lat,
      waypoints[i - 1].lng,
      waypoints[i].lat,
      waypoints[i].lng
    )
    cum[i] = cum[i - 1] + d
  }
  const totalMeters = waypoints.length ? cum[waypoints.length - 1] : 0
  return { waypoints, cum, totalMeters }
}

// Parameter t in [0,1] of point's perpendicular projection onto segment
// a→b. Same local-Cartesian projection as photoMatch.distanceToSegmentMeters
// (midpoint-latitude longitude correction), so leg-fraction and the
// nearest-segment pick stay geometrically consistent.
function segmentT(point, a, b) {
  const midLat = (a.lat + b.lat) / 2
  const mPerDegLat = 111_111
  const mPerDegLng = 111_111 * Math.cos((midLat * Math.PI) / 180)
  const ax = a.lng * mPerDegLng
  const ay = a.lat * mPerDegLat
  const bx = b.lng * mPerDegLng
  const by = b.lat * mPerDegLat
  const px = point.lng * mPerDegLng
  const py = point.lat * mPerDegLat
  const abx = bx - ax
  const aby = by - ay
  const lenSq = abx * abx + aby * aby
  if (lenSq === 0) return 0
  const t = ((px - ax) * abx + (py - ay) * aby) / lenSq
  return clamp01(t)
}

// Project a live position onto the route. Picks the nearest segment
// (straight-line, so a route that doubles back can pick the wrong side —
// accepted under the directionally-right scope) and returns the progress
// fractions + the current leg endpoints. Returns null when it can't be
// computed (no position, fewer than 2 waypoints, or zero-length route) —
// callers HIDE the live % rather than show a wrong one.
export function projectOntoRoute(position, geometry) {
  if (!position || !Number.isFinite(position.lat) || !Number.isFinite(position.lng)) {
    return null
  }
  const { waypoints, cum, totalMeters } = geometry || {}
  if (!waypoints || waypoints.length < 2 || !totalMeters) return null

  const p = { lat: position.lat, lng: position.lng }
  let bestSeg = -1
  let bestDist = Infinity
  for (let i = 0; i < waypoints.length - 1; i += 1) {
    const d = distanceToSegmentMeters(p, waypoints[i], waypoints[i + 1])
    if (d < bestDist) {
      bestDist = d
      bestSeg = i
    }
  }
  if (bestSeg < 0) return null

  const a = waypoints[bestSeg]
  const b = waypoints[bestSeg + 1]
  const t = segmentT(p, a, b)
  const segLen = cum[bestSeg + 1] - cum[bestSeg]
  const distanceAlong = cum[bestSeg] + t * segLen
  const tripFraction = totalMeters > 0 ? clamp01(distanceAlong / totalMeters) : 0

  return {
    segIndex: bestSeg,
    fromStop: a,
    toStop: b,
    legFraction: t,
    tripFraction,
    distanceAlong,
    offRouteMeters: bestDist,
  }
}

// The "traveled" polyline for drawing the done portion of the route:
// every waypoint up to the current segment, plus the interpolated
// projection point on that segment. Returns [[lat,lng], ...] (Leaflet
// order). Empty when there's nothing to draw.
export function traveledPolyline(geometry, projection) {
  const waypoints = geometry?.waypoints
  if (!waypoints?.length || !projection) return []
  const pts = []
  for (let i = 0; i <= projection.segIndex; i += 1) {
    pts.push([waypoints[i].lat, waypoints[i].lng])
  }
  const a = waypoints[projection.segIndex]
  const b = waypoints[projection.segIndex + 1]
  if (a && b) {
    pts.push([
      a.lat + (b.lat - a.lat) * projection.legFraction,
      a.lng + (b.lng - a.lng) * projection.legFraction,
    ])
  }
  return pts
}
