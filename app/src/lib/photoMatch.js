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
import { stayPlaceCoords, isStayTrip } from './tripShape.js'

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
  // Photo within this of the NEAREST stop in its day → attach to that stop
  // (GPS-first; the planned time window is NOT a gate). Loosened 500→1000m
  // after the first real-photo run: real venues (a riverfront park, a museum
  // campus, a mall) span more than 500m, so 500m dropped clearly-at-the-stop
  // photos into "interstitial". 1000m attaches the clear cases while leaving
  // genuinely-off-stop clusters (an unplanned lunch ~2.6km out) to the
  // deviation→auto_added path. Tunable; measure with scripts/reconcile-report.
  gpsMatchMeters: 1_000,
  // A photo within this of a SPECIFIC (non-base) stop counts as taken AT that
  // stop even when a base also covers the area — so a meal at a restaurant near
  // the cabin files to the restaurant, not "At the cabin". Kept tight on
  // purpose: a base still wins for general hanging-out (the cabin-video-filed-
  // as-dinner bug); only a photo essentially INSIDE a specific venue overrides
  // the base. The one tuning knob for the base/specific tradeoff.
  baseYieldMeters: 150,
  clusterDistanceMeters: 500, // 3+ photos within this of each other = cluster
  routeDeviationMeters: 2_000, // cluster >this from route line = deviation
  clusterMinSize: 3,
}

// A stop is a "BASE" — a place you're staying or hanging out at (the cabin, the
// hotel), as opposed to a timed event. Bases catch the untimed "we're just
// here" photos in the matcher (before the nearest-stop pass) and render as an
// "At [place]" section in the album. A place you STAY is a base automatically
// (kind 'lodging'); an explicit `isBase` (true OR false) always overrides that
// default, so a one-night hotel can be opted out or a non-lodging spot (a visit
// to Grandma's) opted in. Shared by the matcher, the album, and the planning
// toggle so all three agree on what a base is.
export function stopIsBase(stop) {
  if (!stop) return false
  if (typeof stop.isBase === 'boolean') return stop.isBase
  return stop.kind === 'lodging'
}

// How far out a base CLAIMS PRIORITY — the radius within which it grabs the
// "we're just here" photos ahead of a closer timed stop. Per-base override via
// `baseRadiusMeters`; defaults to the standard GPS attach radius. NOTE: this
// governs base PRIORITY, not an exclusive catch boundary — beyond it a base can
// still pick up a photo through the ordinary nearest-stop attach (gpsMatchMeters),
// exactly as any stop would. A future per-base size control could tighten this
// into a hard footprint; today there's no UI to set it, so every base uses the
// 1000m default and the distinction is invisible.
export function stopBaseRadiusMeters(stop) {
  return Number.isFinite(stop?.baseRadiusMeters)
    ? stop.baseRadiusMeters
    : MATCH_THRESHOLDS.gpsMatchMeters
}

// ── The trip's IMPLICIT base (the place you're STAYING, with no planned stop) ──
// Phase 1 only filed "At the cabin" when you marked a STOP as a base. A
// destination-less stay — a family weekend at a cabin, where the only planned
// things are dinners out — has no such stop, so cabin photos fell to the nearest
// dinner. This surfaces the trip's lodging/home anchor (which the app already
// tracks for drive-home ETA — `trip.homeBase`, by convention the lodging) as a
// base place so footprint photos file to "At [the cabin]" with no extra planning.

export const IMPLICIT_BASE_PREFIX = '__trip_base__'
export function implicitBaseIdForDay(isoDate) {
  return `${IMPLICIT_BASE_PREFIX}:${isoDate}`
}
export function isImplicitBaseId(id) {
  return typeof id === 'string' && id.startsWith(`${IMPLICIT_BASE_PREFIX}:`)
}

// "home" / "(home)" / "— (home)" — a trip you DIDN'T stay away for. The implicit
// base must never turn your actual house into a photo place on a day trip.
const HOME_LODGING = /^[\s—–-]*\(?\s*home\s*\)?[\s—–-]*$/i

// Located stay anchor — THE shared source (homeBase → geocoded lodging address
// → located lodging stop), so the filer and the live rail agree on where the
// place is. (A located lodging STOP also short-circuits gate 2 below, so reading
// it here is harmless — tripImplicitBase still returns null for those, they're
// already Phase-1 bases.) Phase 2: a geocoded `trip.lodging.lat/lng` now lights
// this up for an address-only stay where P1.5 had no coords and silently no-op'd.
function tripStayCoords(trip) {
  return stayPlaceCoords(trip)
}

// Human name of where you're staying — the lodging (object or legacy string).
function lodgingLabel(trip) {
  const lod = trip?.lodging
  if (lod && typeof lod === 'object') return ((lod.name || lod.address) || '').trim()
  if (typeof lod === 'string') return lod.trim()
  return ''
}

function hasPlannedBaseStop(trip) {
  for (const day of trip?.days || []) {
    for (const s of day.stops || []) {
      if (stopIsBase(s) && Number.isFinite(s.lat) && Number.isFinite(s.lng)) return true
    }
  }
  return false
}

// Returns the implicit-base TEMPLATE {name, lat, lng, isBase} or null.
// buildDayIndex + groupByStop stamp it with a per-DAY id so a multi-night stay
// renders as one "At [place]" section per day (matching the per-day-stop model).
// GATES: (1) a located anchor exists; (2) no planned base stop already covers it
// (Phase 1 owns those); (3) a real STAY signal — a set lodging that isn't literally
// "home", OR a multi-day trip (an overnight means you stayed somewhere away).
export function tripImplicitBase(trip) {
  // STRICTLY stays only — never an implicit base on a route trip (G5). The coord
  // + hasPlannedBaseStop gates below almost always catch routes, but an explicit
  // shape gate makes it bulletproof: a 2+-base route that happens to carry a
  // homeBase anchor must NOT sprout an "At the cabin" place.
  if (!isStayTrip(trip)) return null
  const coords = tripStayCoords(trip)
  if (!coords) return null
  if (hasPlannedBaseStop(trip)) return null
  const name = lodgingLabel(trip)
  const namedStay = !!name && !HOME_LODGING.test(name)
  const multiDay = Array.isArray(trip?.days) && trip.days.length >= 2
  if (!namedStay && !multiDay) return null
  return {
    // A named lodging wins; otherwise the homeBase label is usually a full street
    // address — show just its first segment ("41 Lower Boulevard") rather than a
    // postal address masquerading as a place name, and a neutral phrase if blank.
    name: namedStay ? name : (coords.label ? coords.label.split(',')[0].trim() : 'Where we’re staying'),
    lat: coords.lat,
    lng: coords.lng,
    isBase: true,
    _implicitBase: true,
  }
}

// A night spent at home — the per-day lodging note literally says "home". The
// implicit base is SUPPRESSED on these days, so your own house never becomes a
// "place" on a trip that starts or ends at home (the homeBase anchor can itself be
// your house). This is the real "never file your house" guard — it lives on the
// per-DAY lodging string, which is where the family actually records "home".
export function isHomeDay(day) {
  const lod = typeof day?.lodging === 'string' ? day.lodging.trim() : ''
  return !!lod && HOME_LODGING.test(lod)
}

// THE one source of truth for "which stop ids a memory can be filed to on this
// day" — the planned stops PLUS the trip's implicit base (when it applies to the
// day). Every surface that groups memories by stop (album, weave, resurface,
// replay) must use this, or a base-filed "At the cabin" photo gets silently
// dropped by a surface that only knows about planned stops.
export function dayStopIds(trip, day) {
  const ids = new Set((day?.stops || []).map((s) => s.id))
  if (day?.isoDate && !isHomeDay(day) && tripImplicitBase(trip)) {
    ids.add(implicitBaseIdForDay(day.isoDate))
  }
  return ids
}

// The day a stopId belongs to — works for a planned stop AND an implicit base id.
export function dayForStopId(trip, stopId) {
  if (!stopId) return null
  return (trip?.days || []).find((d) => dayStopIds(trip, d).has(stopId)) || null
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
  // The trip's implicit base is a candidate on EVERY day (you stay there each
  // night). It has no clock time, so it joins `allStops` (the base/nearest scan)
  // ONLY — never sortedClockStops/looseStops/polyline (which would warp the day's
  // time windows + route). A per-day id keeps each day's "At [place]" distinct.
  const baseTemplate = tripImplicitBase(trip)
  // Whether this is a STAY (one place you return to). Computed once; carried on
  // each entry so matchPhotoToStop can default a no-GPS photo to the place
  // WITHOUT re-deriving the shape per photo — and strictly gates the Phase-2
  // no-GPS default to stays, leaving route trips byte-identical (G5).
  const stay = isStayTrip(trip)
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
    const dayBase = baseTemplate && !isHomeDay(day)
      ? { ...baseTemplate, id: implicitBaseIdForDay(day.isoDate) }
      : null
    out.set(day.isoDate, {
      day,
      sortedClockStops,
      looseStops,
      allStops: dayBase ? [...allStops, dayBase] : allStops,
      polyline,
      isStay: stay,
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
  const unmatched = (dayIsoDate = null, dayN = null) => ({
    photoId: photo?.id ?? null,
    dayIsoDate,
    dayN,
    stopId: null,
    matchType: 'unmatched',
    interstitialBefore: null,
    interstitialAfter: null,
    distanceMeters: null,
  })
  if (!photo || !photo.capturedAt) return unmatched()
  const photoMs = Date.parse(photo.capturedAt)
  if (!Number.isFinite(photoMs)) return unmatched()

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
  if (!dayEntry) return unmatched()
  const { day, sortedClockStops, allStops, isStay } = dayEntry

  // Temporal bracket: the clock stops immediately before/after this photo.
  // Used to LABEL an interstitial ("from A to B") and to bind a no-GPS photo
  // to the stop whose window it sits in. It is NOT a gate on GPS matches.
  let before = null
  let after = null
  for (const s of sortedClockStops) {
    if (s._parsedAt <= photoMs) before = s
    else {
      after = s
      break
    }
  }

  // GPS-FIRST. A photo's coordinates are ground truth for WHERE the family
  // was, regardless of how the PLAN timed that stop — and reconciliation
  // exists precisely because the day deviated from the plan. So attach to the
  // NEAREST stop in the day within gpsMatchMeters, ignoring the planned time
  // window; only a photo near no stop at all is interstitial. (Replaces the
  // old time-window-first rule, which mis-filed real stop photos taken at an
  // off-plan time — the April run put a shot 81m from the Menil Collection in
  // "interstitial" because the plan timed that hour at a different stop.)
  if (photoHasGps(photo)) {
    // One pass over the day's located stops: track the overall nearest (the
    // fallback), the nearest BASE (with its own footprint radius), and the
    // nearest SPECIFIC (non-base) stop.
    let best = null
    let nearestBase = null
    let nearestSpecific = null
    for (const s of allStops) {
      if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) continue
      const d = haversineMeters(photo.lat, photo.lng, s.lat, s.lng)
      if (!best || d < best.distance) best = { stop: s, distance: d }
      if (stopIsBase(s)) {
        if (!nearestBase || d < nearestBase.distance) {
          nearestBase = { stop: s, distance: d, radius: stopBaseRadiusMeters(s) }
        }
      } else if (!nearestSpecific || d < nearestSpecific.distance) {
        nearestSpecific = { stop: s, distance: d }
      }
    }

    // BASE-PRIORITY (but smart). A base is a place you're staying/hanging out
    // at, so it claims the untimed "we're just here" photos within its
    // footprint BEFORE the nearest-stop pass — a porch shot files to "At the
    // cabin", not the nearest timed event (the cabin-video-filed-as-dinner
    // bug). EXCEPTION: a photo essentially INSIDE a specific nearby stop
    // (within baseYieldMeters AND closer than the base) belongs to that stop —
    // dinner at a restaurant near the cabin is "dinner", not the cabin. When
    // the base yields, we fall through to the nearest-stop pass below, which
    // picks that specific stop (it is then the overall nearest).
    if (nearestBase && nearestBase.distance <= nearestBase.radius) {
      const specificWins =
        nearestSpecific &&
        nearestSpecific.distance <= MATCH_THRESHOLDS.baseYieldMeters &&
        nearestSpecific.distance < nearestBase.distance
      if (!specificWins) {
        return {
          photoId: photo.id,
          dayIsoDate: day.isoDate,
          dayN: day.n,
          stopId: nearestBase.stop.id,
          matchType: 'gps+time',
          interstitialBefore: null,
          interstitialAfter: null,
          distanceMeters: nearestBase.distance,
        }
      }
    }

    if (best) {
      // The day has located stops, so GPS is decisive.
      if (best.distance <= MATCH_THRESHOLDS.gpsMatchMeters) {
        return {
          photoId: photo.id,
          dayIsoDate: day.isoDate,
          dayN: day.n,
          stopId: best.stop.id,
          matchType: 'gps+time',
          interstitialBefore: null,
          interstitialAfter: null,
          distanceMeters: best.distance,
        }
      }
      // Within a day's located stops but near none → interstitial, bracketed
      // by the temporally-adjacent stops.
      return {
        photoId: photo.id,
        dayIsoDate: day.isoDate,
        dayN: day.n,
        stopId: null,
        matchType: 'interstitial',
        interstitialBefore: before ? before.id : null,
        interstitialAfter: after ? after.id : null,
        distanceMeters: best.distance,
      }
    }
    // No located stop in the day at all → GPS can't place the photo; fall
    // through to the time-only binding below (treat like a no-GPS photo).
  }

  // FAMILY-TRIPS (Phase 2, FAMILY_TRIPS_VISION §5). On a STAY, a photo with no
  // GPS is most likely "we're just here at the place" — so default it to the
  // day's place instead of guessing the nearest event by the clock (the
  // road-trip-era proxy that filed a cabin-hangout video to "dinner"). Jonathan's
  // call: the place is the spine; an event only pulls a photo away when the
  // photo's OWN GPS proves it (a GPS photo never reaches here). "The place" is the
  // day's base in EITHER stay model — the implicit base (a destination-less stay,
  // P1.5) OR a planned base/lodging stop (a marked base, P1) — so the two model
  // shapes behave the same. Skipped on a home day (never your own house) and on
  // route trips (isStay is false) → those paths stay byte-identical (G5).
  if (isStay && !isHomeDay(day)) {
    const base =
      allStops.find((s) => isImplicitBaseId(s.id)) ||
      allStops.find((s) => stopIsBase(s))
    if (base) {
      return {
        photoId: photo.id,
        dayIsoDate: day.isoDate,
        dayN: day.n,
        stopId: base.id,
        matchType: 'time',
        interstitialBefore: null,
        interstitialAfter: null,
        distanceMeters: null,
      }
    }
  }

  // No GPS → time-only. Bind to the clock stop whose window contains the photo
  // (the bracket's `before`). If it's before the first clock stop, it's an
  // interstitial with no `before` neighbor.
  if (before) {
    return {
      photoId: photo.id,
      dayIsoDate: day.isoDate,
      dayN: day.n,
      stopId: before.id,
      matchType: 'time',
      interstitialBefore: null,
      interstitialAfter: null,
      distanceMeters: null,
    }
  }
  return {
    photoId: photo.id,
    dayIsoDate: day.isoDate,
    dayN: day.n,
    stopId: null,
    matchType: 'interstitial',
    interstitialBefore: null,
    interstitialAfter: after ? after.id : null,
    distanceMeters: null,
  }
}

function photoHasGps(photo) {
  return Number.isFinite(photo.lat) && Number.isFinite(photo.lng)
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
