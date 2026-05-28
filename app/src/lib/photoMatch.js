// Photo → stop matching algorithm. Core of the backfill flow.
//
// Input: photos with EXIF metadata (capturedAt + optional GPS) and
//        a trip with day-grouped stops (each carrying `time` and
//        optionally `lat`/`lng`).
// Output: a per-photo match record (day, stopId-or-null, matchType,
//        interstitialBetween, deviationClusterId) plus a list of
//        deviation clusters for downstream reverse-geocoding.
//
// Deliberately pure — no network, no DOM, no IndexedDB. Reverse-
// geocoding the cluster centroid to a human place name happens in a
// separate step (see resolveDeviationNames) so the matching itself
// stays unit-testable without mocks.

import { parseStopTime } from './photoBackfill.js'

// Distance in meters between two lat/lng pairs via the haversine
// formula. Accurate to within a few meters at trip-scale distances.
export function haversineMeters(lat1, lng1, lat2, lng2) {
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lng1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lng2)
  ) {
    return Infinity
  }
  const R = 6_371_000 // earth radius, meters
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// Perpendicular distance from a point to a line segment (in meters)
// using an equirectangular projection centered on the segment midpoint.
// Accurate within a few percent at trip-segment distances; we don't
// need sub-meter precision for the 2km route-deviation threshold.
export function distanceToSegmentMeters(point, segA, segB) {
  if (!point || !segA || !segB) return Infinity
  if (
    !Number.isFinite(point.lat) ||
    !Number.isFinite(point.lng) ||
    !Number.isFinite(segA.lat) ||
    !Number.isFinite(segA.lng) ||
    !Number.isFinite(segB.lat) ||
    !Number.isFinite(segB.lng)
  ) {
    return Infinity
  }
  // Project to local Cartesian (meters east/north) using midpoint
  // latitude for the longitude correction.
  const midLat = (segA.lat + segB.lat) / 2
  const mPerDegLat = 111_111
  const mPerDegLng = 111_111 * Math.cos((midLat * Math.PI) / 180)
  const ax = segA.lng * mPerDegLng
  const ay = segA.lat * mPerDegLat
  const bx = segB.lng * mPerDegLng
  const by = segB.lat * mPerDegLat
  const px = point.lng * mPerDegLng
  const py = point.lat * mPerDegLat
  const abx = bx - ax
  const aby = by - ay
  const lenSq = abx * abx + aby * aby
  if (lenSq === 0) {
    // Segment is a point.
    const dx = px - ax
    const dy = py - ay
    return Math.sqrt(dx * dx + dy * dy)
  }
  // Param `t` of the projection onto the segment; clamp to [0,1].
  let t = ((px - ax) * abx + (py - ay) * aby) / lenSq
  if (t < 0) t = 0
  else if (t > 1) t = 1
  const cx = ax + t * abx
  const cy = ay + t * aby
  const dx = px - cx
  const dy = py - cy
  return Math.sqrt(dx * dx + dy * dy)
}

// Minimum distance from a point to any segment of a polyline (route).
// If the route has only 0 or 1 points, returns Infinity (no line to
// measure against).
export function distanceToPolylineMeters(point, polyline) {
  if (!Array.isArray(polyline) || polyline.length < 2) return Infinity
  let min = Infinity
  for (let i = 0; i < polyline.length - 1; i++) {
    const d = distanceToSegmentMeters(point, polyline[i], polyline[i + 1])
    if (d < min) min = d
  }
  return min
}

// Tunables. Centralized so the triage UI / future config can override.
export const MATCH_THRESHOLDS = {
  gpsMatchMeters: 500, // photo within this of a stop → GPS match
  clusterDistanceMeters: 500, // 3+ photos within this of each other = cluster
  routeDeviationMeters: 2_000, // cluster >this from route line = deviation
  clusterMinSize: 3,
}

// Build the per-day stop time map. Returns a Map<dayIsoDate,
// { day, sortedClockStops, looseStops, allStops, polyline }>.
//
// `sortedClockStops` are stops with parseable clock times, sorted by
// time ascending. They define the day's time windows for photo
// matching.
//
// `looseStops` are stops with loose-time labels ('Evening', 'AM',
// etc.). They're attachment candidates for GPS-only matching but
// don't participate in time-window logic.
//
// `polyline` is the list of lat/lng pairs for stops that have
// coordinates, in stop order (clock-time first, then loose). Used
// for the deviation-cluster route-distance check.
export function buildDayIndex(trip) {
  const out = new Map()
  if (!trip || !Array.isArray(trip.days)) return out
  for (const day of trip.days) {
    if (!day || !day.isoDate) continue
    const sortedClockStops = []
    const looseStops = []
    const allStops = Array.isArray(day.stops) ? day.stops.slice() : []
    for (const stop of allStops) {
      const parsed = parseStopTime(stop?.time, day.isoDate)
      if (parsed.loose) {
        looseStops.push({ ...stop, _parsedAt: parsed.at })
      } else {
        sortedClockStops.push({ ...stop, _parsedAt: parsed.at })
      }
    }
    sortedClockStops.sort((a, b) => a._parsedAt - b._parsedAt)
    // Polyline: stops in time-order with coords. Loose stops appended
    // by their representative time so they participate in the route
    // shape without warping the window math.
    const polyline = []
    const ordered = [...sortedClockStops, ...looseStops].sort(
      (a, b) => a._parsedAt - b._parsedAt
    )
    for (const s of ordered) {
      if (Number.isFinite(s.lat) && Number.isFinite(s.lng)) {
        polyline.push({ lat: s.lat, lng: s.lng })
      }
    }
    out.set(day.isoDate, {
      day,
      sortedClockStops,
      looseStops,
      allStops,
      polyline,
    })
  }
  return out
}

// Match one photo to its day and stop, given the precomputed day index.
// Returns a record:
//   {
//     photoId, dayIsoDate, dayN, stopId, matchType,
//     interstitialBefore, interstitialAfter, distanceMeters
//   }
// `matchType` ∈ {'gps+time', 'time', 'interstitial', 'unmatched'}.
// `deviation` upgrade happens later, after the cluster pass.
export function matchPhotoToStop(photo, dayIndex) {
  if (!photo || !photo.capturedAt) {
    return {
      photoId: photo?.id ?? null,
      dayIsoDate: null,
      dayN: null,
      stopId: null,
      matchType: 'unmatched',
      interstitialBefore: null,
      interstitialAfter: null,
      distanceMeters: null,
    }
  }
  const photoMs = Date.parse(photo.capturedAt)
  if (!Number.isFinite(photoMs)) {
    return {
      photoId: photo.id,
      dayIsoDate: null,
      dayN: null,
      stopId: null,
      matchType: 'unmatched',
      interstitialBefore: null,
      interstitialAfter: null,
      distanceMeters: null,
    }
  }

  // Pick the day whose [00:00, 23:59] window contains the photo.
  let dayEntry = null
  for (const entry of dayIndex.values()) {
    const dayStartMs = Date.parse(`${entry.day.isoDate}T00:00:00.000Z`)
    const dayEndMs = Date.parse(`${entry.day.isoDate}T23:59:59.999Z`)
    if (photoMs >= dayStartMs && photoMs <= dayEndMs) {
      dayEntry = entry
      break
    }
  }
  if (!dayEntry) {
    return {
      photoId: photo.id,
      dayIsoDate: null,
      dayN: null,
      stopId: null,
      matchType: 'unmatched',
      interstitialBefore: null,
      interstitialAfter: null,
      distanceMeters: null,
    }
  }

  const { day, sortedClockStops } = dayEntry
  // Locate the stop whose time-window contains the photo. Window:
  // [stop._parsedAt, nextStop._parsedAt). The last clock stop's
  // window runs to end-of-day.
  let containingStop = null
  let containingIndex = -1
  for (let i = 0; i < sortedClockStops.length; i++) {
    const start = sortedClockStops[i]._parsedAt
    const end =
      i < sortedClockStops.length - 1
        ? sortedClockStops[i + 1]._parsedAt
        : Date.parse(`${day.isoDate}T23:59:59.999Z`)
    if (photoMs >= start && photoMs < end) {
      containingStop = sortedClockStops[i]
      containingIndex = i
      break
    }
  }
  // Catch the photo-before-first-stop edge: before the first clock
  // stop. Interstitial with stopBefore=null.
  const firstClockStop = sortedClockStops[0]
  if (!containingStop && firstClockStop && photoMs < firstClockStop._parsedAt) {
    // No matching window — photo is before any time-bound stop on
    // this day. Treat as interstitial with no `before` neighbor.
    const distanceToFirst = photoHasGps(photo)
      ? haversineMeters(photo.lat, photo.lng, firstClockStop.lat, firstClockStop.lng)
      : null
    return {
      photoId: photo.id,
      dayIsoDate: day.isoDate,
      dayN: day.n,
      stopId: null,
      matchType: 'interstitial',
      interstitialBefore: null,
      interstitialAfter: firstClockStop.id,
      distanceMeters: distanceToFirst,
    }
  }
  if (!containingStop) {
    // No clock-time stops on this day, or photo is past end-of-day
    // somehow. Try GPS-only attachment to a loose stop before giving up.
    const looseGpsMatch = findClosestStopByGps(photo, dayEntry.looseStops)
    if (looseGpsMatch && looseGpsMatch.distance <= MATCH_THRESHOLDS.gpsMatchMeters) {
      return {
        photoId: photo.id,
        dayIsoDate: day.isoDate,
        dayN: day.n,
        stopId: looseGpsMatch.stop.id,
        matchType: 'gps+time',
        interstitialBefore: null,
        interstitialAfter: null,
        distanceMeters: looseGpsMatch.distance,
      }
    }
    return {
      photoId: photo.id,
      dayIsoDate: day.isoDate,
      dayN: day.n,
      stopId: null,
      matchType: 'unmatched',
      interstitialBefore: null,
      interstitialAfter: null,
      distanceMeters: null,
    }
  }

  // Photo is inside containingStop's window. Decide via GPS.
  const stopHasGps = Number.isFinite(containingStop.lat) && Number.isFinite(containingStop.lng)
  if (photoHasGps(photo) && stopHasGps) {
    const d = haversineMeters(photo.lat, photo.lng, containingStop.lat, containingStop.lng)
    if (d <= MATCH_THRESHOLDS.gpsMatchMeters) {
      return {
        photoId: photo.id,
        dayIsoDate: day.isoDate,
        dayN: day.n,
        stopId: containingStop.id,
        matchType: 'gps+time',
        interstitialBefore: null,
        interstitialAfter: null,
        distanceMeters: d,
      }
    }
    // GPS present but doesn't match the time-window stop. Interstitial
    // between this stop and the next.
    const nextStop = sortedClockStops[containingIndex + 1] || null
    return {
      photoId: photo.id,
      dayIsoDate: day.isoDate,
      dayN: day.n,
      stopId: null,
      matchType: 'interstitial',
      interstitialBefore: containingStop.id,
      interstitialAfter: nextStop ? nextStop.id : null,
      distanceMeters: d,
    }
  }
  // No GPS on the photo → time-only.
  return {
    photoId: photo.id,
    dayIsoDate: day.isoDate,
    dayN: day.n,
    stopId: containingStop.id,
    matchType: 'time',
    interstitialBefore: null,
    interstitialAfter: null,
    distanceMeters: null,
  }
}

function photoHasGps(photo) {
  return Number.isFinite(photo.lat) && Number.isFinite(photo.lng)
}

function findClosestStopByGps(photo, stops) {
  if (!photoHasGps(photo)) return null
  let best = null
  for (const stop of stops) {
    if (!Number.isFinite(stop.lat) || !Number.isFinite(stop.lng)) continue
    const d = haversineMeters(photo.lat, photo.lng, stop.lat, stop.lng)
    if (!best || d < best.distance) best = { stop, distance: d }
  }
  return best
}

// Group interstitial-with-GPS photos into clusters via connected
// components on the "within clusterDistanceMeters" relation. Returns
// an array of clusters, each `{ id, photoIds: [...], centroid: { lat, lng } }`.
// Photos without GPS or already assigned to a stop are skipped.
export function clusterInterstitialPhotos(matches, photos) {
  const photoMap = new Map(photos.map((p) => [p.id, p]))
  // Group candidate photos by day so we don't cluster across days.
  const byDay = new Map()
  for (const m of matches) {
    if (m.matchType !== 'interstitial') continue
    const p = photoMap.get(m.photoId)
    if (!p || !photoHasGps(p)) continue
    if (!byDay.has(m.dayIsoDate)) byDay.set(m.dayIsoDate, [])
    byDay.get(m.dayIsoDate).push({ match: m, photo: p })
  }

  const clusters = []
  let nextClusterId = 1

  for (const [dayIsoDate, entries] of byDay) {
    if (entries.length < MATCH_THRESHOLDS.clusterMinSize) continue
    // Union-find over the entries.
    const parent = entries.map((_, i) => i)
    const find = (i) => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]]
        i = parent[i]
      }
      return i
    }
    const union = (i, j) => {
      const ri = find(i)
      const rj = find(j)
      if (ri !== rj) parent[ri] = rj
    }
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const d = haversineMeters(
          entries[i].photo.lat,
          entries[i].photo.lng,
          entries[j].photo.lat,
          entries[j].photo.lng
        )
        if (d <= MATCH_THRESHOLDS.clusterDistanceMeters) union(i, j)
      }
    }
    // Bucket by root.
    const buckets = new Map()
    for (let i = 0; i < entries.length; i++) {
      const root = find(i)
      if (!buckets.has(root)) buckets.set(root, [])
      buckets.get(root).push(entries[i])
    }
    for (const members of buckets.values()) {
      if (members.length < MATCH_THRESHOLDS.clusterMinSize) continue
      let sumLat = 0
      let sumLng = 0
      for (const m of members) {
        sumLat += m.photo.lat
        sumLng += m.photo.lng
      }
      const centroid = {
        lat: sumLat / members.length,
        lng: sumLng / members.length,
      }
      clusters.push({
        id: `cluster-${dayIsoDate}-${nextClusterId++}`,
        dayIsoDate,
        photoIds: members.map((m) => m.photo.id),
        centroid,
      })
    }
  }

  return clusters
}

// Promote qualifying clusters to deviation matches and return the
// updated matches array + the qualifying clusters (only the ones
// whose centroid is >routeDeviationMeters from the day's route line).
// Clusters that don't clear that bar are dropped and their photos
// stay 'interstitial'.
export function promoteDeviationClusters(matches, clusters, dayIndex) {
  const qualifying = []
  const updated = matches.map((m) => ({ ...m }))
  const byId = new Map(updated.map((m) => [m.photoId, m]))

  for (const cluster of clusters) {
    const entry = dayIndex.get(cluster.dayIsoDate)
    if (!entry) continue
    const distToRoute = distanceToPolylineMeters(cluster.centroid, entry.polyline)
    if (distToRoute < MATCH_THRESHOLDS.routeDeviationMeters) continue
    qualifying.push({ ...cluster, distanceToRouteMeters: distToRoute })
    for (const pid of cluster.photoIds) {
      const m = byId.get(pid)
      if (m) {
        m.matchType = 'deviation'
        m.deviationClusterId = cluster.id
      }
    }
  }
  return { matches: updated, deviationClusters: qualifying }
}

// One-shot: match every photo, then promote clusters. Returns
// `{ matches, deviationClusters }`. Deviation cluster records still
// need a name; that's the job of resolveDeviationNames (separate
// module / step) to keep this function pure.
export function matchPhotosToStops(photos, trip) {
  const dayIndex = buildDayIndex(trip)
  const initial = photos.map((p) => matchPhotoToStop(p, dayIndex))
  const clusters = clusterInterstitialPhotos(initial, photos)
  return promoteDeviationClusters(initial, clusters, dayIndex)
}
