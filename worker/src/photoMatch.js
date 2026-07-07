// worker/src/photoMatch.js — the SERVER-SIDE mirror of the client photo→stop
// matcher (app/src/lib/photoMatch.js), for the self-healing-photos worker
// matcher (SPEC §5 D). The lib/surprises.js + dayStopIds.js mirror precedent,
// this time WITH an automatic parity test (test/photoMatch-parity.test.js) that
// runs BOTH copies over one shared fixture corpus and asserts identical match
// records. Change either side → keep the other in step and extend the corpus.
//
// WHY THE WORKER NEEDS THIS. The worker is the single referee for the healing
// service: it holds every ref's GPS (photo_r2_keys_json) and the verbatim trip
// data_json, and — unlike a phone — sees the whole truth (no masked views). To
// decide "does this photo still belong where it's filed?" it must run the exact
// same matcher the client ran at import, or the two would tell different stories
// about the same photo. The parity test is what keeps them from drifting.
//
// FAITHFUL MIRROR. matchPhotoToStop / buildDayIndex / the clustering pass are
// behavior-identical to the client — the parity test deep-equals their FULL
// output. The runner-up / margin the auto-apply gate needs (SPEC §2:
// "no runner-up/margin exists today") is NOT bolted onto matchPhotoToStop (that
// would fork the mirror); it is a SEPARATE exported helper, nearestLocatedStops,
// that re-derives the winner + runner-up distances from the same day index. The
// heal gate (photoHeal.js) consumes it. This keeps the mirror a clean deep-equal
// while still adding the "small matcher addition" §5 D calls for, in this module.
//
// SHARED SHAPE HELPERS come from ./dayStopIds.js (stopIsBase, isImplicitBaseId,
// implicitBaseIdForDay, isHomeDay, tripImplicitBase, isStayTrip) — already
// mirrored there with their own parity test, so the shape gates have ONE server
// source, not two.

import {
  stopIsBase,
  isImplicitBaseId,
  implicitBaseIdForDay,
  isHomeDay,
  tripImplicitBase,
  isStayTrip,
  recordEntryTargets,
} from './dayStopIds.js'

// ── parseStopTime (mirror of app/src/lib/photoBackfill.js:201) ───────────────
// Representative offsets from midnight UTC for loose-time stop labels. Used only
// to position loose stops for sorting + fallback bucketing; they never gate a
// strict GPS+time match.
const TIME_BUCKETS = {
  default: 12 * 60 * 60_000, // noon
  morning: 9 * 60 * 60_000,
  am: 9 * 60 * 60_000,
  noon: 12 * 60 * 60_000,
  afternoon: 14 * 60 * 60_000,
  evening: 19 * 60 * 60_000,
  pm: 19 * 60 * 60_000,
  night: 21 * 60 * 60_000,
  late: 22 * 60 * 60_000,
  overnight: 22 * 60 * 60_000,
}

export function parseStopTime(timeStr, dayIsoDate) {
  if (typeof dayIsoDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dayIsoDate)) {
    return { at: NaN, loose: true }
  }
  const baseMs = Date.parse(`${dayIsoDate}T00:00:00.000Z`)
  if (!Number.isFinite(baseMs)) return { at: NaN, loose: true }

  const trimmed = (timeStr || '').trim()
  if (!trimmed) return { at: baseMs + TIME_BUCKETS.default, loose: true }

  const ampm = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (ampm) {
    let h = parseInt(ampm[1], 10)
    const m = parseInt(ampm[2], 10)
    const isPm = ampm[3].toUpperCase() === 'PM'
    if (h === 12) h = isPm ? 12 : 0
    else if (isPm) h += 12
    return { at: baseMs + (h * 60 + m) * 60_000, loose: false }
  }
  const h24 = trimmed.match(/^(\d{1,2}):(\d{2})$/)
  if (h24) {
    const h = parseInt(h24[1], 10)
    const m = parseInt(h24[2], 10)
    if (h >= 0 && h < 24 && m >= 0 && m < 60) {
      return { at: baseMs + (h * 60 + m) * 60_000, loose: false }
    }
  }
  const key = trimmed.toLowerCase()
  if (key in TIME_BUCKETS) {
    return { at: baseMs + TIME_BUCKETS[key], loose: true }
  }
  return { at: baseMs + TIME_BUCKETS.default, loose: true }
}

// ── Geometry (mirror of app/src/lib/photoMatch.js) ───────────────────────────

export function haversineMeters(lat1, lng1, lat2, lng2) {
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lng1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lng2)
  ) {
    return Infinity
  }
  const R = 6_371_000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

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
    const dx = px - ax
    const dy = py - ay
    return Math.sqrt(dx * dx + dy * dy)
  }
  let t = ((px - ax) * abx + (py - ay) * aby) / lenSq
  if (t < 0) t = 0
  else if (t > 1) t = 1
  const cx = ax + t * abx
  const cy = ay + t * aby
  const dx = px - cx
  const dy = py - cy
  return Math.sqrt(dx * dx + dy * dy)
}

export function distanceToPolylineMeters(point, polyline) {
  if (!Array.isArray(polyline) || polyline.length < 2) return Infinity
  let min = Infinity
  for (let i = 0; i < polyline.length - 1; i++) {
    const d = distanceToSegmentMeters(point, polyline[i], polyline[i + 1])
    if (d < min) min = d
  }
  return min
}

// Tunables — mirror of the client MATCH_THRESHOLDS. Keep in step with the
// client; the parity corpus exercises the base/specific/gps boundaries.
export const MATCH_THRESHOLDS = {
  gpsMatchMeters: 1_000,
  baseYieldMeters: 150,
  clusterDistanceMeters: 500,
  routeDeviationMeters: 2_000,
  clusterMinSize: 3,
}

export function stopBaseRadiusMeters(stop) {
  return Number.isFinite(stop?.baseRadiusMeters)
    ? stop.baseRadiusMeters
    : MATCH_THRESHOLDS.gpsMatchMeters
}

function photoHasGps(photo) {
  return Number.isFinite(photo.lat) && Number.isFinite(photo.lng)
}

// Build the per-day stop time map — mirror of the client buildDayIndex. Returns
// Map<isoDate, { day, sortedClockStops, looseStops, allStops, polyline, isStay }>.
export function buildDayIndex(trip) {
  const out = new Map()
  if (!trip || !Array.isArray(trip.days)) return out
  const baseTemplate = tripImplicitBase(trip)
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
    // Named settle-sheet moments join the base/nearest GPS scan (allStops) ONLY
    // — no clock time, so never sortedClockStops/looseStops/polyline. Record
    // bridge, SPEC §5 D. Faithful mirror of the client buildDayIndex.
    const recordTargets = recordEntryTargets(day)
    out.set(day.isoDate, {
      day,
      sortedClockStops,
      looseStops,
      allStops: [...allStops, ...(dayBase ? [dayBase] : []), ...recordTargets],
      polyline,
      isStay: stay,
    })
  }
  return out
}

// Which day's [00:00, 23:59]Z window contains this photo? Shared by the matcher
// and the margin helper so both agree on the day a photo belongs to.
function dayEntryForPhoto(photoMs, dayIndex) {
  for (const entry of dayIndex.values()) {
    const dayStartMs = Date.parse(`${entry.day.isoDate}T00:00:00.000Z`)
    const dayEndMs = Date.parse(`${entry.day.isoDate}T23:59:59.999Z`)
    if (photoMs >= dayStartMs && photoMs <= dayEndMs) return entry
  }
  return null
}

// Match one photo to its day + stop — FAITHFUL mirror of the client
// matchPhotoToStop. Its output is deep-equaled against the client in the parity
// test, so it must stay byte-for-byte behavior-identical. (The margin the heal
// gate needs lives in nearestLocatedStops below, NOT here.)
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
  // TIME comparisons run in the photo's OWN local wall clock (offsetMinutes = its
  // capture-time UTC offset); absent an offset it degrades to UTC (+0), unchanged.
  // Faithful mirror of the client matchPhotoToStop — see its comment.
  const offMin = Number.isFinite(photo.offsetMinutes) ? photo.offsetMinutes : 0
  const photoWallMs = photoMs + offMin * 60_000

  const dayEntry = dayEntryForPhoto(photoWallMs, dayIndex)
  if (!dayEntry) return unmatched()
  const { day, sortedClockStops, allStops, isStay } = dayEntry

  let before = null
  let after = null
  for (const s of sortedClockStops) {
    if (s._parsedAt <= photoWallMs) before = s
    else {
      after = s
      break
    }
  }

  if (photoHasGps(photo)) {
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
  }

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

// ── The margin addition (SPEC §5 D — "track runner-up → margin gate") ────────
//
// The auto-apply gate must never move a photo on an AMBIGUOUS match — two stops
// nearly equidistant. This re-derives, for a GPS photo, the distance to the
// stop the matcher ASSIGNED (the winner) and to the nearest DISTINCT other
// located stop in the same day (the runner-up). The gate then requires the
// winner to beat the runner-up decisively (photoHeal.marginQualifies).
//
// Returns { winnerId, winnerMeters, runnerUpId, runnerUpMeters } — runnerUp*
// null when the day has only one located stop (an unambiguous single-candidate
// day → the margin gate treats it as clearing). Returns null when the photo has
// no GPS or falls in no day (those can't auto-move anyway; gate 1 stops them).
//
// `winnerId` is the id the FAITHFUL matcher chose, so margin is measured against
// the actual assignment — including base-priority wins, where the winner may not
// be the spatially-nearest stop and the runner-up gap can be small or negative
// (exactly the ambiguous "we're just here" case the gate should decline).
export function nearestLocatedStops(photo, dayIndex, assignedStopId) {
  if (!photo || !photoHasGps(photo)) return null
  const photoMs = Date.parse(photo.capturedAt)
  if (!Number.isFinite(photoMs)) return null
  // Day pick uses the photo's LOCAL wall clock (offset-aware), same as
  // matchPhotoToStop, so the margin is measured against the correct day's stops.
  const offMin = Number.isFinite(photo.offsetMinutes) ? photo.offsetMinutes : 0
  const entry = dayEntryForPhoto(photoMs + offMin * 60_000, dayIndex)
  if (!entry) return null

  const located = []
  for (const s of entry.allStops) {
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) continue
    located.push({ id: s.id, distance: haversineMeters(photo.lat, photo.lng, s.lat, s.lng) })
  }
  if (!located.length) return null

  // Winner = the assigned stop's own distance when it is a located stop;
  // otherwise the spatially-nearest (defensive — a faithful GPS match always
  // assigns a located stop). Runner-up = nearest stop with a DIFFERENT id.
  located.sort((a, b) => a.distance - b.distance)
  const winner =
    (assignedStopId != null && located.find((s) => s.id === assignedStopId)) ||
    located[0]
  let runnerUp = null
  for (const s of located) {
    if (s.id !== winner.id) { runnerUp = s; break }
  }
  return {
    winnerId: winner.id,
    winnerMeters: winner.distance,
    runnerUpId: runnerUp ? runnerUp.id : null,
    runnerUpMeters: runnerUp ? runnerUp.distance : null,
  }
}

// ── Clustering + deviation (faithful mirror) ─────────────────────────────────

export function clusterInterstitialPhotos(matches, photos) {
  const photoMap = new Map(photos.map((p) => [p.id, p]))
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

export function matchPhotosToStops(photos, trip) {
  const dayIndex = buildDayIndex(trip)
  const initial = photos.map((p) => matchPhotoToStop(p, dayIndex))
  const clusters = clusterInterstitialPhotos(initial, photos)
  return promoteDeviationClusters(initial, clusters, dayIndex)
}
