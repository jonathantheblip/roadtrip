// sessionHeal.js — the v2 ADAPTER: ties the pure engine to real trip data.
//
// Per day: normalize memories → time-bearing points (LOCAL wall-clock via the
// offset, ea2296a) → buildSessions (bursts + GPS inheritance) → resolve each
// LOCATED session's place through v1's tuned matchPhotoToStop (GPS only — reuse,
// never reinvent the geo tolerance) → normalize the day's places from v1's
// buildDayIndex → scoreDay. Output: per-day tiered decisions (auto/confirm/leave)
// with explainable signals — exactly what the shadow LEARNING ledger records.
//
// Metadata-blind photos (no capturedAt) are intentionally excluded — the engine
// is time+evidence; those are the vision/naming track (SPEC_V2 Pillar 1 floor).
//
// Imports v1's client matcher; the worker adapter mirrors this against the worker
// matcher (the photoHealRunner precedent). Deterministic given its inputs.

import { buildSessions } from './sessions.js'
import { scoreDay } from './sessionScorer.js'
import { buildDayIndex, matchPhotoToStop, isImplicitBaseId, isRecordTargetId } from './photoMatch.js'
import { parseStopTime } from './photoBackfill.js'

const numOrU = (x) => (Number.isFinite(x) ? x : undefined)

// Accept a memory in D1-row shape (photo_r2_keys_json string) OR normalized
// (`photos`/`refs` array). Returns the photo refs.
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

// minutes from LOCAL midnight for a local-wall-as-UTC instant (medianMs = the
// real UTC instant already shifted by the offset, so getUTC* reads local components)
const localMin = (ms) => new Date(ms).getUTCHours() * 60 + new Date(ms).getUTCMinutes()

// a place's clock time in minutes-from-midnight, or null if vague ("Afternoon")
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

// trip + its memories → [{ isoDate, decisions: [...] }]. `defaultOffset` (min)
// is used only when a ref carries no offsetMinutes (legacy) — 0 = prior UTC behavior.
export function buildTripDecisions(trip, memories, opts = {}) {
  const dayIndex = buildDayIndex(trip)
  const defaultOffset = Number.isFinite(opts.defaultOffset) ? opts.defaultOffset : 0

  // 1. extract time-bearing points, grouped by LOCAL day
  const pointsByDay = new Map()
  const meta = new Map() // pointId -> { capturedAt, offsetMinutes }  (for the GPS synthetic)
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

    // 2. resolve GPS for located sessions via v1's tuned matcher (GPS hits only)
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

    // 3. normalize the day's places (v1's allStops: planned + base + record)
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
