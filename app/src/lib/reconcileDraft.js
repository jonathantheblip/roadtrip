// Reconciliation draft builder. The heart of trip reconciliation:
// turn the photo matcher's output into a pre-built proposal of "what
// actually happened" that Helen refines rather than assembles.
//
// Deliberately pure — no React, no network, no IndexedDB — so the
// classification is unit-testable in Node (mirrors photoMatch.js) and
// reusable from the triage UI, a future laptop batch tool, and tests.
//
// What this module does NOT do (kept elsewhere to stay pure):
//   - reverse-geocode the auto-added stop names (async; the triage
//     component resolves cluster centroids → names and patches them in,
//     or passes them via opts.clusterNames).
//   - persist anything (the UI maps an accepted draft → a trip record
//     and calls tripsApi.upsertTrip).
//
// Input: the SAME matcher output the backfill flow already produces
// (see photoMatch.js#matchPhotosToStops):
//   matches: [{ photoId, dayIsoDate, dayN, stopId, matchType,
//               interstitialBefore, interstitialAfter, distanceMeters,
//               deviationClusterId }]
//     matchType ∈ 'gps+time' | 'time' | 'interstitial' | 'deviation' | 'unmatched'
//   deviationClusters: [{ id, dayIsoDate, photoIds[], centroid{lat,lng},
//                         distanceToRouteMeters }]
//
// Output: a structured draft (see buildReconciliationDraft) the triage
// view renders directly and Helen edits on top of.

import { MATCH_THRESHOLDS, matchPhotosToStops } from './photoMatch.js'
import { parseStopTime } from './photoBackfill.js'

// The one NEW tunable reconciliation adds on top of the matcher's
// geometry gates (MATCH_THRESHOLDS: 500m cluster, 3+ photos, >2km from
// route). The matcher decides a cluster is geographically off-route;
// reconciliation additionally asks "did someone actually spend time
// there?" via dwell — the span between the cluster's earliest and
// latest photo. A tight burst of shots at one spot (< this many
// minutes) reads as a quick pull-over / drive-by and stays
// interstitial; a longer span means they got out and explored, so it
// becomes a real (auto_added) stop.
//
// Tunable: the first real run on the April photos will show whether 20
// minutes is right. Keep it named next to MATCH_THRESHOLDS' values so
// the whole stop-vs-interstitial judgment is adjustable in one glance.
export const RECONCILE_THRESHOLDS = {
  clusterDwellMinutes: 20,
}

// Placeholder name an auto-added stop carries until its cluster centroid
// reverse-geocodes into a real place name. Shared so the draft builder
// and the async name-patch in the triage UI agree on what "not yet
// named" looks like — the patch only overwrites this exact string, so a
// Helen rename is never clobbered when geocoding resolves late.
export const AUTO_STOP_PLACEHOLDER = 'Off-route stop'

// Per-stop reconciliation states. happened / happened_no_photos /
// auto_added are set automatically here; didnt_happen is only ever
// Helen's override (and removes the stop from the record), so the draft
// never emits it.
export const STOP_STATE = {
  HAPPENED: 'happened',
  HAPPENED_NO_PHOTOS: 'happened_no_photos',
  AUTO_ADDED: 'auto_added',
  DIDNT_HAPPEN: 'didnt_happen',
}

// Dwell span (ms) across a set of photo ids = latest capturedAt minus
// earliest. Photos without a parseable capturedAt are ignored. Returns
// 0 when fewer than two timestamps are available (can't imply dwell).
export function clusterDwellMs(photoIds, photoById) {
  let min = Infinity
  let max = -Infinity
  let count = 0
  for (const pid of photoIds) {
    const p = photoById.get(pid)
    const t = p ? Date.parse(p.capturedAt) : NaN
    if (!Number.isFinite(t)) continue
    count += 1
    if (t < min) min = t
    if (t > max) max = t
  }
  if (count < 2) return 0
  return max - min
}

// Median capturedAt (ms) across photo ids, for positioning an
// auto-added stop "at the right time slot." Median (not mean) so one
// stray timestamp doesn't drag the slot. Returns NaN if none parse.
export function medianCapturedMs(photoIds, photoById) {
  const times = []
  for (const pid of photoIds) {
    const p = photoById.get(pid)
    const t = p ? Date.parse(p.capturedAt) : NaN
    if (Number.isFinite(t)) times.push(t)
  }
  if (times.length === 0) return NaN
  times.sort((a, b) => a - b)
  const mid = Math.floor(times.length / 2)
  return times.length % 2 ? times[mid] : Math.round((times[mid - 1] + times[mid]) / 2)
}

// Format an absolute ms instant as a "3:30 PM" clock string using UTC
// components. The matcher treats EXIF wall-clock as UTC (see
// photoBackfill.parseStopTime, which anchors `${isoDate}T00:00:00.000Z`),
// so reading the UTC clock here keeps auto-added stop times consistent
// with how planned stop times are parsed and ordered.
export function formatClockTime(ms) {
  if (!Number.isFinite(ms)) return ''
  const d = new Date(ms)
  let h = d.getUTCHours()
  const m = d.getUTCMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`
}

// Build the reconciliation draft.
//
//   photos: [{ id, capturedAt, lat, lng }]   (same shape the matcher eats)
//   trip:   the trip record (days[].stops[] with time + optional lat/lng)
//   opts:
//     matchResult:  precomputed matchPhotosToStops output (the triage UI
//                   already has this — pass it to avoid recomputing).
//     clusterNames: { [clusterId]: name }  resolved geocode names for
//                   auto-added stops. Absent names fall back to a label.
//     thresholds:   override RECONCILE_THRESHOLDS (tuning / tests).
//
// Returns:
//   {
//     tripId,
//     days: [{
//       dayN, dayIsoDate, dayTitle,
//       stops: [{                      // planned + auto_added, time-ordered
//         stopId, name, time, kind, for,
//         state,                       // happened | happened_no_photos | auto_added
//         source,                      // 'planned' | 'auto_added'
//         addedDuringReconciliation,   // bool
//         photoIds: [],
//         clusterId, centroid, distanceToRouteMeters,  // auto_added only
//       }],
//       interstitials: [{ key, interstitialBefore, interstitialAfter,
//                         title, photoIds: [] }],
//     }],
//     unmatched: [{ photoId, dayN }],
//     summary: { happened, happenedNoPhotos, autoAdded,
//                interstitialBuckets, demotedClusters },
//   }
export function buildReconciliationDraft(photos, trip, opts = {}) {
  const thresholds = { ...RECONCILE_THRESHOLDS, ...(opts.thresholds || {}) }
  const dwellGateMs = thresholds.clusterDwellMinutes * 60_000
  const clusterNames = opts.clusterNames || {}

  const photoList = Array.isArray(photos) ? photos : []
  const photoById = new Map(photoList.map((p) => [p.id, p]))

  const matchResult = opts.matchResult || matchPhotosToStops(photoList, trip)
  const matches = (matchResult.matches || []).map((m) => ({ ...m }))
  const deviationClusters = matchResult.deviationClusters || []
  const matchByPhoto = new Map(matches.map((m) => [m.photoId, m]))

  // ── Dwell gate ────────────────────────────────────────────────────
  // The matcher already promoted geographically-off-route clusters to
  // matchType 'deviation'. Apply the dwell criterion: a cluster whose
  // photos span less than the gate is demoted back to interstitial (its
  // photos keep the interstitialBefore/After the matcher preserved on
  // them through promotion, so they re-bucket cleanly).
  const keptClusters = []
  const demotedClusterIds = new Set()
  for (const cluster of deviationClusters) {
    const dwell = clusterDwellMs(cluster.photoIds, photoById)
    if (dwell >= dwellGateMs) {
      keptClusters.push(cluster)
    } else {
      demotedClusterIds.add(cluster.id)
      for (const pid of cluster.photoIds) {
        const m = matchByPhoto.get(pid)
        if (m) {
          m.matchType = 'interstitial'
          m.deviationClusterId = null
        }
      }
    }
  }

  // ── Index photos by stop and by interstitial bucket, per day ──────
  const photosByStop = new Map() // stopId → [photoId]
  const photosByCluster = new Map() // clusterId → [photoId]
  const interstitialBuckets = new Map() // dayN → Map(bucketKey → bucket)
  const unmatched = []

  for (const m of matches) {
    if (m.matchType === 'gps+time' || m.matchType === 'time') {
      if (!photosByStop.has(m.stopId)) photosByStop.set(m.stopId, [])
      photosByStop.get(m.stopId).push(m.photoId)
    } else if (m.matchType === 'deviation' && m.deviationClusterId) {
      if (!photosByCluster.has(m.deviationClusterId)) {
        photosByCluster.set(m.deviationClusterId, [])
      }
      photosByCluster.get(m.deviationClusterId).push(m.photoId)
    } else if (m.matchType === 'interstitial' && m.dayN != null) {
      const dayMap = ensure(interstitialBuckets, m.dayN, () => new Map())
      const a = m.interstitialBefore
      const b = m.interstitialAfter
      const key = `interstitial:${a || 'start'}-${b || 'end'}`
      const bucket = ensure(dayMap, key, () => ({
        key,
        interstitialBefore: a || null,
        interstitialAfter: b || null,
        title: null, // resolved by the UI from the bounding stop names
        photoIds: [],
      }))
      bucket.photoIds.push(m.photoId)
    } else {
      // unmatched, or anything without a day anchor
      unmatched.push({ photoId: m.photoId, dayN: m.dayN ?? null })
    }
  }

  // ── Auto-added stops from kept clusters, grouped by day ───────────
  const autoStopsByDay = new Map() // dayN → [autoStop]
  for (const cluster of keptClusters) {
    const dayN = dayNForIso(trip, cluster.dayIsoDate)
    const clusterPhotoIds = photosByCluster.get(cluster.id) || cluster.photoIds
    const medianMs = medianCapturedMs(clusterPhotoIds, photoById)
    const autoStop = {
      stopId: `auto-${cluster.id}`,
      name: clusterNames[cluster.id] || AUTO_STOP_PLACEHOLDER,
      time: formatClockTime(medianMs),
      kind: 'activity',
      for: Array.isArray(trip?.travelers) ? [...trip.travelers] : [],
      state: STOP_STATE.AUTO_ADDED,
      source: 'auto_added',
      addedDuringReconciliation: true,
      photoIds: clusterPhotoIds,
      clusterId: cluster.id,
      centroid: cluster.centroid || null,
      distanceToRouteMeters: cluster.distanceToRouteMeters ?? null,
      _parsedAt: positionMs(cluster.dayIsoDate, medianMs),
    }
    ensure(autoStopsByDay, dayN, () => []).push(autoStop)
  }

  // ── Assemble per-day draft ────────────────────────────────────────
  const days = []
  const summary = {
    happened: 0,
    happenedNoPhotos: 0,
    autoAdded: 0,
    interstitialBuckets: 0,
    demotedClusters: demotedClusterIds.size,
  }

  for (const day of trip?.days || []) {
    const plannedStops = (day.stops || []).map((stop) => {
      const photoIds = photosByStop.get(stop.id) || []
      const state =
        photoIds.length > 0 ? STOP_STATE.HAPPENED : STOP_STATE.HAPPENED_NO_PHOTOS
      if (state === STOP_STATE.HAPPENED) summary.happened += 1
      else summary.happenedNoPhotos += 1
      return {
        stopId: stop.id,
        name: stop.name || stop.title || stop.id,
        time: stop.time || '',
        kind: stop.kind || 'activity',
        for: Array.isArray(stop.for) ? [...stop.for] : [],
        state,
        source: 'planned',
        addedDuringReconciliation: false,
        photoIds,
        clusterId: null,
        centroid:
          Number.isFinite(stop.lat) && Number.isFinite(stop.lng)
            ? { lat: stop.lat, lng: stop.lng }
            : null,
        distanceToRouteMeters: null,
        _parsedAt: parseStopTime(stop.time, day.isoDate).at,
      }
    })

    const autoStops = autoStopsByDay.get(day.n) || []
    summary.autoAdded += autoStops.length

    // Combine planned + auto-added and order by parsed time so an
    // auto-added stop lands in the right slot in the day's flow.
    const stops = [...plannedStops, ...autoStops]
      .sort((a, b) => safeNum(a._parsedAt) - safeNum(b._parsedAt))
      .map((s) => {
        const { _parsedAt, ...rest } = s
        return rest
      })

    const dayInterstitials = Array.from(
      (interstitialBuckets.get(day.n) || new Map()).values()
    ).map((bucket) => ({
      ...bucket,
      title: interstitialTitle(bucket, day),
    }))
    summary.interstitialBuckets += dayInterstitials.length

    days.push({
      dayN: day.n,
      dayIsoDate: day.isoDate,
      dayTitle: day.title || `Day ${day.n}`,
      stops,
      interstitials: dayInterstitials,
    })
  }

  return {
    tripId: trip?.id || null,
    days,
    unmatched,
    summary,
  }
}

// ── helpers ─────────────────────────────────────────────────────────

function ensure(map, key, make) {
  if (!map.has(key)) map.set(key, make())
  return map.get(key)
}

function safeNum(n) {
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY
}

function dayNForIso(trip, isoDate) {
  const day = (trip?.days || []).find((d) => d.isoDate === isoDate)
  return day ? day.n : null
}

// Position an auto-added stop within its day. Prefer the median photo
// instant; fall back to noon of the cluster's day if timestamps are
// missing, so it still sorts into a sane slot rather than the start.
function positionMs(dayIsoDate, medianMs) {
  if (Number.isFinite(medianMs)) return medianMs
  const noon = Date.parse(`${dayIsoDate}T12:00:00.000Z`)
  return Number.isFinite(noon) ? noon : 0
}

// "From A to B" / "Before B" / "After A" / "In transit" — same framing
// as the backfill triage so interstitials read consistently.
function interstitialTitle(bucket, day) {
  const stopName = (id) => {
    const s = (day.stops || []).find((x) => x.id === id)
    return s ? s.name || s.title || id : null
  }
  const a = bucket.interstitialBefore ? stopName(bucket.interstitialBefore) : null
  const b = bucket.interstitialAfter ? stopName(bucket.interstitialAfter) : null
  if (a && b) return `From ${a} to ${b}`
  if (b) return `Before ${b}`
  if (a) return `After ${a}`
  return 'In transit'
}
