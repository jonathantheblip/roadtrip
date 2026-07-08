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

import { buildSessions } from './sessions.js'
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
      })
      meta.set(id, { capturedAt: ref.capturedAt, offsetMinutes: off })
    }
  }

  const out = []
  for (const [iso, pts] of pointsByDay) {
    const entry = dayIndex.get(iso)
    const sessions = buildSessions(pts, opts)

    const scored = sessions.map((s) => {
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
        if (match && match.matchType === 'gps+time') gpsPlaceId = match.stopId
      }
      return { ...s, medianMin: localMin(s.medianMs), gpsPlaceId }
    })

    const places = (entry?.allStops || []).map((st) => ({
      id: st.id,
      name: st.name || st.title || '',
      lat: numOrU(st.lat),
      lng: numOrU(st.lng),
      timeMin: placeTimeMin(st.time, iso),
      kind: placeKind(st),
    }))

    out.push({ isoDate: iso, decisions: scoreDay(scored, places, opts) })
  }
  out.sort((a, b) => a.isoDate.localeCompare(b.isoDate))
  return out
}
