// sessions.js — the v2 self-healing "session": the primary filing UNIT.
//
// A session is one MOMENT — a burst of a day's photos, clustered by capture-time
// gap (single-linkage on the gap, GPS-agnostic, so a no-GPS photo joins the burst
// it was taken in). Then GPS INHERITANCE: a burst happens at ONE place, so if even
// one photo in it is geotagged, the whole session inherits that location. That
// turns the sparse GPS we actually get (indoor arenas record none; the outdoor
// shot right before does) into broad coverage — one located photo anchors the
// moment. See app/docs/design/self-healing-photos/SPEC_V2_TIME_AND_EVIDENCE.md
// (Pillar 2 + the GPS-inheritance unlock).
//
// PURE + DETERMINISTIC + mirror-safe (own haversine; the only import is the equally
// mirrored scene primitive) so the worker referee can mirror this file byte-for-byte
// and a parity test can gate the two. `at` is a monotonic instant in ms; pass a
// CONSISTENT clock — local wall-clock ms if `medianMs` will be compared to local
// agenda times downstream (the scorer does).

import { sceneDistance, SCENE_DEFAULTS } from './sceneHash.js'

export const SESSION_DEFAULTS = {
  gapMinutes: 40, // a burst breaks after this idle gap (tighter than evidence.js's
  // 90m presence-clustering: a "moment" is finer-grained than "a continuous stay")
  inheritRadiusMeters: 250, // located members within this of their centroid → the
  // session is ONE place and inherits it; beyond → the burst moved, don't fabricate.
}

// Great-circle metres. Self-contained (mirror-safe); matches evidence.js's formula.
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

const isNum = (x) => Number.isFinite(x)
const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length

// points: [{ id, memoryId?, at (ms), lat?, lng?, author?, scene? }]  →  [session]
//   scene = a perceptual COMPOSITION signature (sceneHash.js), the dimension that
//   survives our pipeline; overlapped with time + GPS so a moment can cohere (or a
//   burst can be flagged as spanning two backgrounds) even with no GPS at all.
// A session: {
//   photoIds, memoryIds, count, startMs, endMs, medianMs,
//   located (bool: GPS inheritance succeeded), location ({lat,lng}|null),
//   locatedCount (members that actually carried GPS), gpsSpreadMeters (|null),
//   split (bool: located members disagreed > radius → the burst moved), authors[],
//   scene (representative signature | null), sceneConsistent (bool | null: members
//   with a signature share one background), sceneSpread (max pairwise bits | null)
// }
export function buildSessions(points, opts = {}) {
  const gapMs = (opts.gapMinutes ?? SESSION_DEFAULTS.gapMinutes) * 60_000
  const pts = (Array.isArray(points) ? points : [])
    .filter((p) => p && isNum(p.at))
    .sort((a, b) => a.at - b.at || String(a.id).localeCompare(String(b.id)))
  const sessions = []
  let cur = []
  for (const p of pts) {
    if (cur.length && p.at - cur[cur.length - 1].at > gapMs) {
      sessions.push(finalize(cur, opts))
      cur = []
    }
    cur.push(p)
  }
  if (cur.length) sessions.push(finalize(cur, opts))
  return sessions
}

// ── Multi-dimensional MOMENTS ────────────────────────────────────────────────
// buildSessions groups by TIME alone. buildMoments is the self-healing engine's real
// grouping: a moment EMERGES where MULTIPLE dimensions agree — time, GPS, composition
// (sceneHash), and the people in frame (faces). No single axis leads; each present
// dimension votes (weighted) and a missing one simply ABSTAINS — it never breaks the
// group (the lowest-denominator trap). Time still BOUNDS a moment (you can't be two
// places at once — a hard span cap), but within/around that bound the other dimensions
// BRIDGE a burst the clock over-split (same place + people after a lull) and SPLIT a
// burst the clock wrongly merged (two backgrounds / two crowds, minutes apart). When
// no non-time dimension is present (today's stripped archive) it degrades EXACTLY to a
// time burst, so nothing regresses while the dimensions are still being populated.
// PURE + mirror-safe (shared helpers; the scene primitive is the only import).

export const MOMENT_DEFAULTS = {
  gapMinutes: 40, // time-only bond: within this, same moment (buildSessions behaviour)
  bridgeGapMinutes: 90, // beyond gapMinutes, other dims may still BRIDGE up to here
  maxSpanMinutes: 180, // hard cap: one moment can't span longer than this
  bridgeAffinity: 0.68, // non-time dims must agree ≥ this to bridge a time gap
  splitAffinity: 0.22, // within the time bond, non-time dims THIS far apart → split
  gpsSigmaMeters: 160, // gaussian falloff for the GPS dimension
  weights: { gps: 1.6, scene: 1.1, faces: 1.3 }, // relative say of each non-time dim
}

const faceSetOf = (p) => new Set(Array.isArray(p?.faces) ? p.faces.filter(Boolean) : [])
function jaccard(a, b) {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}
// Weighted agreement of the NON-time dimensions two points SHARE (present on both).
// null when they share no non-time dimension → the caller falls back to time alone.
function nonTimeAffinity(a, b, o) {
  let wsum = 0
  let s = 0
  if (isNum(a.lat) && isNum(a.lng) && isNum(b.lat) && isNum(b.lng)) {
    const m = haversineMeters(a.lat, a.lng, b.lat, b.lng)
    const g = Math.exp(-(m * m) / (2 * o.gpsSigmaMeters * o.gpsSigmaMeters))
    wsum += o.weights.gps
    s += o.weights.gps * g
  }
  if (typeof a.scene === 'string' && a.scene && typeof b.scene === 'string' && b.scene) {
    const h = sceneDistance(a.scene, b.scene)
    if (Number.isFinite(h)) {
      wsum += o.weights.scene
      s += o.weights.scene * Math.max(0, 1 - h / 64)
    }
  }
  const fa = faceSetOf(a)
  const fb = faceSetOf(b)
  if (fa.size && fb.size) {
    wsum += o.weights.faces
    s += o.weights.faces * jaccard(fa, fb)
  }
  return wsum ? s / wsum : null
}

// points: [{ id, memoryId?, at, lat?, lng?, scene?, faces?, author? }] → [moment].
// A moment carries the buildSessions fields PLUS: faces (union), dims (which
// dimensions were present), cohesion (mean non-time agreement 0..1 | null).
export function buildMoments(points, opts = {}) {
  const o = {
    ...MOMENT_DEFAULTS,
    ...opts,
    weights: { ...MOMENT_DEFAULTS.weights, ...(opts.weights || {}) },
  }
  const gapMs = o.gapMinutes * 60_000
  const bridgeMs = o.bridgeGapMinutes * 60_000
  const spanMs = o.maxSpanMinutes * 60_000
  const pts = (Array.isArray(points) ? points : [])
    .filter((p) => p && isNum(p.at))
    .sort((a, b) => a.at - b.at || String(a.id).localeCompare(String(b.id)))
  const moments = []
  let cur = []
  for (const p of pts) {
    if (cur.length) {
      // Single-linkage: nearest current member in time, and the best non-time
      // agreement to any member still inside the bridge window (an old member must
      // not anchor a bridge across a long lull).
      let nearestMs = Infinity
      let bestNonTime = null
      for (const m of cur) {
        const dt = p.at - m.at
        if (dt < nearestMs) nearestMs = dt
        if (dt <= bridgeMs) {
          const nt = nonTimeAffinity(p, m, o)
          if (nt != null && (bestNonTime == null || nt > bestNonTime)) bestNonTime = nt
        }
      }
      let join
      if (p.at - cur[0].at > spanMs) {
        join = false // hard physical bound — a moment can't run this long
      } else if (nearestMs <= gapMs) {
        // time bonds them — unless the present non-time dims CONFIDENTLY disagree
        join = !(bestNonTime != null && bestNonTime < o.splitAffinity)
      } else if (nearestMs <= bridgeMs) {
        // beyond the time bond — join only if non-time dims BRIDGE the gap
        join = bestNonTime != null && bestNonTime >= o.bridgeAffinity
      } else {
        join = false
      }
      if (!join) {
        moments.push(finalizeMoment(cur, o))
        cur = []
      }
    }
    cur.push(p)
  }
  if (cur.length) moments.push(finalizeMoment(cur, o))
  return moments
}

function finalizeMoment(members, o) {
  const radius = o.inheritRadiusMeters ?? SESSION_DEFAULTS.inheritRadiusMeters
  const located = members.filter((p) => isNum(p.lat) && isNum(p.lng))
  let location = null
  let gpsSpreadMeters = null
  let split = false
  if (located.length) {
    const centroid = { lat: avg(located.map((p) => p.lat)), lng: avg(located.map((p) => p.lng)) }
    const spread = located.reduce(
      (mx, p) => Math.max(mx, haversineMeters(centroid.lat, centroid.lng, p.lat, p.lng)),
      0
    )
    gpsSpreadMeters = Math.round(spread)
    if (spread <= radius) location = centroid
    else split = true
  }
  const scened = members.filter((p) => typeof p.scene === 'string' && p.scene.length)
  let scene = null
  let sceneConsistent = null
  let sceneSpread = null
  if (scened.length) {
    scene = scened[Math.floor((scened.length - 1) / 2)].scene
    if (scened.length >= 2) {
      let mx = 0
      for (let i = 0; i < scened.length; i++) {
        for (let j = i + 1; j < scened.length; j++) {
          const d = sceneDistance(scened[i].scene, scened[j].scene)
          if (d > mx) mx = d
        }
      }
      sceneSpread = Number.isFinite(mx) ? mx : null
      sceneConsistent = Number.isFinite(mx) ? mx <= (o.sceneSameMaxBits ?? SCENE_DEFAULTS.sameMaxBits) : null
    }
  }
  const faceUnion = new Set()
  for (const p of members) for (const f of faceSetOf(p)) faceUnion.add(f)
  const dims = ['time']
  if (located.length) dims.push('gps')
  if (scened.length) dims.push('scene')
  if (faceUnion.size) dims.push('faces')
  let cohesion = null
  if (members.length >= 2) {
    let s = 0
    let n = 0
    for (let i = 1; i < members.length; i++) {
      const nt = nonTimeAffinity(members[i - 1], members[i], o)
      if (nt != null) {
        s += nt
        n++
      }
    }
    cohesion = n ? s / n : null
  }
  return {
    photoIds: members.map((p) => p.id),
    memoryIds: [...new Set(members.map((p) => p.memoryId).filter(Boolean))],
    count: members.length,
    startMs: members[0].at,
    endMs: members[members.length - 1].at,
    medianMs: members[Math.floor((members.length - 1) / 2)].at,
    located: !!location,
    location,
    locatedCount: located.length,
    gpsSpreadMeters,
    split,
    authors: [...new Set(members.map((p) => p.author).filter(Boolean))],
    scene,
    sceneConsistent,
    sceneSpread,
    faces: [...faceUnion],
    dims,
    cohesion,
  }
}

function finalize(members, opts) {
  const radius = opts.inheritRadiusMeters ?? SESSION_DEFAULTS.inheritRadiusMeters
  // members are already time-sorted by buildSessions.
  const located = members.filter((p) => isNum(p.lat) && isNum(p.lng))
  let location = null
  let gpsSpreadMeters = null
  let split = false
  if (located.length) {
    const centroid = { lat: avg(located.map((p) => p.lat)), lng: avg(located.map((p) => p.lng)) }
    const spread = located.reduce(
      (mx, p) => Math.max(mx, haversineMeters(centroid.lat, centroid.lng, p.lat, p.lng)),
      0
    )
    gpsSpreadMeters = Math.round(spread)
    if (spread <= radius) location = centroid // tight → the WHOLE session inherits it
    else split = true // the burst physically moved — never fabricate one location
  }
  // Scene cohesion — the COMPOSITION dimension. Among members that carry a signature,
  // how far apart do the backgrounds sit? A tight spread confirms one moment (a second
  // signal beyond time); a wide one flags a burst that spans two scenes. Reported here,
  // consumed by the scorer/adapter as a dimension to overlap — never grouping by scene
  // alone. Absent signatures (today's archive, pre-backfill) → null, a graceful no-op.
  const scened = members.filter((p) => typeof p.scene === 'string' && p.scene.length)
  const maxBits = opts.sceneSameMaxBits ?? SCENE_DEFAULTS.sameMaxBits
  let scene = null
  let sceneConsistent = null
  let sceneSpread = null
  if (scened.length) {
    scene = scened[Math.floor((scened.length - 1) / 2)].scene // representative (median member)
    if (scened.length >= 2) {
      let mx = 0
      for (let i = 0; i < scened.length; i++) {
        for (let j = i + 1; j < scened.length; j++) {
          const d = sceneDistance(scened[i].scene, scened[j].scene)
          if (d > mx) mx = d
        }
      }
      sceneSpread = Number.isFinite(mx) ? mx : null
      sceneConsistent = Number.isFinite(mx) ? mx <= maxBits : null
    }
  }
  return {
    photoIds: members.map((p) => p.id),
    memoryIds: [...new Set(members.map((p) => p.memoryId).filter(Boolean))],
    count: members.length,
    startMs: members[0].at,
    endMs: members[members.length - 1].at,
    medianMs: members[Math.floor((members.length - 1) / 2)].at,
    located: !!location,
    location,
    locatedCount: located.length,
    gpsSpreadMeters,
    split,
    authors: [...new Set(members.map((p) => p.author).filter(Boolean))],
    scene,
    sceneConsistent,
    sceneSpread,
  }
}
