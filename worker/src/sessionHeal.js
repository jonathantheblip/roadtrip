// sessionHeal.js — WORKER MIRROR of app/src/lib/sessionHeal.js. The v2 ADAPTER:
// ties the pure engine to real trip data. Body is identical to the client; only
// the imports differ (the worker keeps parseStopTime in photoMatch.js and the id
// predicates in dayStopIds.js). A parity test gates the two against one corpus.
//
// Per day: memories → time-bearing points (LOCAL wall-clock via the offset) →
// buildSessions (bursts + GPS inheritance) → resolve each LOCATED session through
// the worker's tuned matchPhotoToStop (GPS only) → normalize places from
// buildDayIndex → scoreDay. Output: per-day tiered decisions with explainable
// signals (the shadow LEARNING ledger's content). Metadata-blind photos excluded.

import { buildMoments } from './sessions.js'
import { scoreDay } from './sessionScorer.js'
import { buildDayIndex, matchPhotoToStop, parseStopTime } from './photoMatch.js'
import { isImplicitBaseId, isRecordTargetId } from './dayStopIds.js'

const numOrU = (x) => (Number.isFinite(x) ? x : undefined)

function refsOf(m) {
  if (Array.isArray(m.photos)) return m.photos
  if (Array.isArray(m.refs)) return m.refs
  if (typeof m.photo_r2_keys_json === 'string') {
    try {
      const a = JSON.parse(m.photo_r2_keys_json)
      return Array.isArray(a) ? a : a ? [a] : []
    } catch {
      return []
    }
  }
  return []
}

const localMin = (ms) => new Date(ms).getUTCHours() * 60 + new Date(ms).getUTCMinutes()

function placeTimeMin(timeStr, iso) {
  const { at, loose } = parseStopTime(timeStr, iso)
  if (loose || !Number.isFinite(at)) return null
  const base = Date.parse(`${iso}T00:00:00.000Z`)
  return Math.round((at - base) / 60000)
}

function placeKind(st) {
  if (st.isBase || isImplicitBaseId(st.id)) return 'base'
  if (st._recordEntry || isRecordTargetId(st.id)) return 'record'
  return 'stop'
}

// The moment's VISION name: the most common Claude-vision name across its photos (the
// content dimension). Used to NAME a moment with no located/agenda place — turning an
// unplaced burst ("leave") into a named one to confirm ("At the beach"). null when no
// photo in the moment carries a vision name.
function momentVisionName(photoIds, meta) {
  const counts = new Map()
  for (const pid of photoIds || []) {
    const v = meta.get(pid)?.vision
    const name = v && typeof v.name === 'string' ? v.name.trim() : ''
    if (name) counts.set(name, (counts.get(name) || 0) + 1)
  }
  let best = null
  let bestN = 0
  for (const [name, n] of counts) {
    if (n > bestN) {
      best = name
      bestN = n
    }
  }
  return best
}

export function buildTripDecisions(trip, memories, opts = {}) {
  const dayIndex = buildDayIndex(trip)
  const defaultOffset = Number.isFinite(opts.defaultOffset) ? opts.defaultOffset : 0

  const pointsByDay = new Map()
  const meta = new Map()
  for (const m of memories || []) {
    for (const ref of refsOf(m)) {
      if (!ref || !ref.capturedAt) continue
      const off = Number.isFinite(ref.offsetMinutes) ? ref.offsetMinutes : defaultOffset
      const localMs = Date.parse(ref.capturedAt) + off * 60000
      if (!Number.isFinite(localMs)) continue
      const iso = new Date(localMs).toISOString().slice(0, 10)
      const id = ref.key || ref.id
      if (!id) continue
      if (!pointsByDay.has(iso)) pointsByDay.set(iso, [])
      pointsByDay.get(iso).push({
        id,
        memoryId: m.id,
        at: localMs,
        lat: numOrU(ref.lat),
        lng: numOrU(ref.lng),
        author: m.author || m.authorTraveler || m.author_traveler,
        // the COMPOSITION dimension (sceneHash.js) — a sidecar like lat/lng, absent
        // until the import/backfill computes it from the surviving pixels.
        scene: typeof ref.scene === 'string' && ref.scene ? ref.scene : undefined,
        // the PEOPLE dimension — face ids on the ref (wired from the face model in a
        // later brick); absent → the dimension simply abstains from the clustering.
        faces: Array.isArray(ref.faces) && ref.faces.length ? ref.faces : undefined,
        // the PLACE-TYPE dimension (BUILD 3, §16) — a constrained vision enum, absent
        // until the vision backfill computes it. Consumed ONLY by the bridge-only path
        // in sessions.js (never nonTimeAffinity's blend); a missing/catch-all value
        // simply abstains, same as every other dimension here.
        placeType: typeof ref.vision?.placeType === 'string' && ref.vision.placeType
          ? ref.vision.placeType
          : undefined,
      })
      meta.set(id, { capturedAt: ref.capturedAt, offsetMinutes: off, vision: ref.vision })
    }
  }

  const out = []
  for (const [iso, pts] of pointsByDay) {
    const entry = dayIndex.get(iso)
    const moments = buildMoments(pts, opts)

    // 2. the day's AGENDA places (v1's allStops: planned + base + record). Built
    //    BEFORE resolving sessions so a located burst can prefer a real NAMED stop,
    //    and so we can tell a base match (the ~1km all-day catch-all) from a
    //    specific one.
    const places = (entry?.allStops || []).map((st) => ({
      id: st.id,
      name: st.name || st.title || '',
      lat: numOrU(st.lat),
      lng: numOrU(st.lng),
      timeMin: placeTimeMin(st.time, iso),
      kind: placeKind(st),
    }))
    const kindById = new Map(places.map((p) => [p.id, p.kind]))

    // 3. resolve GPS for located sessions. A burst prefers a real NAMED agenda stop
    //    (v1's confident, parity-tested match). When none matches — only the all-day
    //    base, or nothing at all (the hangout case: the family entered no plan) —
    //    the burst files to a DISCOVERED place at its OWN coordinates, so the photo
    //    lands where it ACTUALLY was instead of dissolving into the base's ~1km
    //    catch-all. This is the agenda-free spine: the trip documents itself from
    //    where the photos were, with no stop ever entered. A discovered spot is
    //    unnamed (coords only) pending naming (geocode/vision — a later phase).
    let discSeq = 0
    const scored = moments.map((s) => {
      let gpsPlaceId = null
      if (s.located) {
        const medId = s.photoIds[Math.floor((s.count - 1) / 2)]
        const mm = meta.get(medId) || {}
        const synthetic = {
          lat: s.location.lat,
          lng: s.location.lng,
          capturedAt: mm.capturedAt,
          offsetMinutes: mm.offsetMinutes,
        }
        const match = matchPhotoToStop(synthetic, dayIndex)
        const agendaId = match && match.matchType === 'gps+time' ? match.stopId : null
        const agendaKind = agendaId ? kindById.get(agendaId) : undefined
        if (agendaId && agendaKind && agendaKind !== 'base') {
          gpsPlaceId = agendaId // a real named place — keep v1's confident match
        } else {
          const { lat, lng } = s.location
          const id = `__discovered__:${iso}:${discSeq++}`
          places.push({
            id,
            name: `a place near ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
            lat,
            lng,
            timeMin: localMin(s.medianMs),
            kind: 'discovered',
          })
          gpsPlaceId = id
        }
      }
      return { ...s, medianMin: localMin(s.medianMs), gpsPlaceId }
    })

    const decisions = scoreDay(scored, places, opts)
    // Fold the moment's multi-dimensional provenance — WHICH signals were present and
    // how strongly they cohere — into each decision's signals, so the ledger records
    // why a group formed (which dimensions agreed), not just where it filed.
    const byFirst = new Map(scored.map((m) => [m.photoIds[0], m]))
    let visSeq = 0
    for (const d of decisions) {
      const m = byFirst.get(d.photoIds[0])
      if (m) {
        d.signals = {
          ...d.signals,
          dims: m.dims,
          cohesion: m.cohesion == null ? null : Math.round(m.cohesion * 100) / 100,
          // BUILD 3 (§16): surfaced ONLY when true, so every pre-Build-3 ledger row
          // (and every moment the vision bridge never touched) stays byte-identical.
          ...(m.visionBridged ? { visionBridged: true } : {}),
        }
      }
      // A moment with no located/agenda place would LEAVE — but if vision can NAME it,
      // surface it as a named moment to CONFIRM (content-inferred, never a silent auto).
      // This is what turns the no-GPS beach afternoons into "At the beach".
      if (d.tier === 'leave') {
        const vn = momentVisionName(d.photoIds, meta)
        if (vn) {
          d.place = { id: `__vision__:${iso}:${visSeq++}`, name: vn }
          d.tier = 'confirm'
          d.naming = 'named'
          d.confidence = 0.5
          d.signals = { ...d.signals, evidence: 'vision', visionName: vn }
          d.reason = `looks like ${vn} — confirm it`
        }
      }
    }
    out.push({ isoDate: iso, decisions })
  }
  out.sort((a, b) => a.isoDate.localeCompare(b.isoDate))
  return out
}
