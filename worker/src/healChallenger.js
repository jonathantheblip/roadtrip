// healChallenger.js — O2 (BUILD_SPECS_GLANCE_ENGINE.md F4 + A3): the WHOLE Healing
// Model run as a SHADOW read over the worker's own trip + memory shapes. Worker-only
// orchestration (like photoHealRunner) — the six engine organs are the mirrored,
// parity-gated libs (O1). Its output rides INSIDE memory_heal_decisions.signals_json
// under `hm:` and is NEVER served while PHOTO_DECISION_ENGINE='v1'. It runs WHOLE or it
// throws — the caller omits the shadow entirely on any failure (F4 test 5: a partial
// challenger never writes a partial read).
//
// PRODUCTION semantics (NOT the honest harness): the filing is NOT held out — the
// challenger produces the read it WOULD serve if promoted, so currentFiling is a live
// witness and the trip's filed photos seed the lookalike exemplars. (The honest,
// filing-held-out measurement is app/scripts/healShadow.mjs / O3, a separate instrument
// per §15b — never this production path.)
import { buildEvidenceBench } from './evidenceBench.js'
import { settle, combineAffinity, SETTLE_DEFAULTS } from './settlingEngine.js'
import { buildWorldModel } from './worldModel.js'
import { imputeSignals } from './imputation.js'
import { buildVisionExemplars } from './visionPlacement.js'

const localISO = (at) => (Number.isFinite(at) ? new Date(at).toISOString().slice(0, 10) : null)

// Trip stop times are wall-clock strings ("10:30 AM"); the engine wants minutes-of-day.
export function parseTimeMin(s) {
  const m = typeof s === 'string' && s.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
  if (!m) return null
  let h = +m[1]
  const min = +m[2]
  const ap = (m[3] || '').toUpperCase()
  if (ap === 'PM' && h < 12) h += 12
  if (ap === 'AM' && h === 12) h = 0
  return h * 60 + min
}

// Parsed trip.data_json -> engine shape: days[].stops[] + a flat stops list (the
// __loose__ candidate set for photos whose day has no stops).
export function adaptTripStops(tripData) {
  const days = (tripData?.days || []).map((day) => ({
    isoDate: day.isoDate,
    // name || title: the incumbent (sessionHeal.js) reads `st.name || st.title`; a
    // title-only stop must not reach the name-keyed organs (world model / signage) as
    // undefined (O2 review Finding 2). Real stops use .name (verified), but stay faithful.
    stops: (day.stops || []).map((st) => ({ id: st.id, name: st.name || st.title, lat: st.lat, lng: st.lng, timeMin: parseTimeMin(st.time), kind: st.kind })),
  }))
  return { id: tripData?.id, endMs: Date.parse(tripData?.dateRangeEnd) || null, days, stops: days.flatMap((dy) => dy.stops) }
}

// Worker memory rows (snake_case, photo_r2_keys_json) -> engine points. Mirrors the
// proven healShadow.mjs extraction exactly (offset applied to capturedAt; vision fields
// flattened; currentStopId = the memory's current filing).
export function adaptMemoryRows(rows) {
  const points = []
  for (const m of rows || []) {
    let arr = []
    try { arr = JSON.parse(m.photo_r2_keys_json || '[]') } catch { arr = [] }
    if (!Array.isArray(arr)) arr = arr ? [arr] : []
    for (const e of arr) {
      if (!e || typeof e !== 'object' || !e.key) continue
      const off = Number.isFinite(e.offsetMinutes) ? e.offsetMinutes : 0
      const v = e.vision || {}
      points.push({
        id: e.key,
        memoryId: m.id,
        currentStopId: m.stop_id || null,
        at: e.capturedAt ? Date.parse(e.capturedAt) + off * 60000 : undefined,
        lat: e.lat,
        lng: e.lng,
        provGps: e.prov && e.prov.gps,
        scene: typeof e.scene === 'string' ? e.scene : undefined,
        placeType: v.placeType,
        setting: v.setting,
        visionName: v.name,
        labels: v.labels,
        signage: v.signage,
      })
    }
  }
  return points
}

// Compact a set of per-photo settle reads into one summary for a ledger row. Never a
// forced pick: the modal top place, the mean membership on it, and the conflict /
// ignorance means (§9.3) — so the divergence readout can compare incumbent vs
// challenger per moment without the full per-photo blob bloating every row.
export function summarizeReads(reads) {
  const rs = (reads || []).filter(Boolean)
  if (!rs.length) return null
  const dest = {}
  const topCount = {}
  for (const r of rs) {
    dest[r.destination] = (dest[r.destination] || 0) + 1
    if (r.top) topCount[r.top] = (topCount[r.top] || 0) + 1
  }
  const modal = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  const top = modal(topCount)
  const onTop = rs.filter((r) => r.top === top)
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  const round2 = (x) => Math.round(x * 100) / 100
  return {
    top,
    dest: modal(dest),
    m: round2(mean(onTop.map((r) => (Number.isFinite(r.topM) ? r.topM : 0)))),
    conflict: round2(mean(rs.map((r) => (Number.isFinite(r.conflict) ? r.conflict : 0)))),
    ignorance: round2(mean(rs.map((r) => (Number.isFinite(r.ignorance) ? r.ignorance : 0)))),
    n: rs.length,
  }
}

// The whole ladder over one trip. Returns per-photo reads keyed by photo key and the
// photo keys grouped by memory, so the caller can attach a per-decision `hm` summary.
// `otherTrips` are the already-adapted OTHER trips (for the name-keyed world model).
export function challengerRead({ tripData, rows, otherTrips = [], now = Date.now() } = {}) {
  const trip = adaptTripStops(tripData)
  const points = adaptMemoryRows(rows)
  const worldModel = buildWorldModel(otherTrips, {})
  // Exemplars from THIS trip's filed photos (lookalike holds out self + moment-siblings
  // internally). Cross-trip exemplars are a future enrichment — see the O2 REVISIT.
  const exemplars = buildVisionExemplars(points.filter((p) => p.currentStopId))

  const dayStops = new Map(trip.days.map((dy) => [dy.isoDate, dy.stops]))
  const groups = new Map()
  for (const pt of points) {
    const day = localISO(pt.at)
    const key = day && dayStops.has(day) ? day : '__loose__'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(pt)
  }

  const byPhoto = new Map()
  for (const [key, gpts] of groups) {
    const places = key === '__loose__' ? trip.stops : dayStops.get(key)
    if (!places || !places.length) continue // no candidates → the machine has nothing to settle onto
    // Production semantics: NO filing holdout — currentFiling is a live witness.
    const pairs = [...combineAffinity(buildEvidenceBench(gpts, places).affinity, SETTLE_DEFAULTS).values()]
    const imputed = imputeSignals(gpts, pairs)
    const bench = buildEvidenceBench(imputed, places, { worldModel, now, exemplars })
    const res = settle(bench, places)
    for (const pt of gpts) {
      const r = res.photos.get(pt.id)
      if (r) byPhoto.set(pt.id, r)
    }
  }

  return { byPhoto }
}

// For one incumbent decision, the compact challenger summary — scoped to the decision's
// OWN photos (dec.photoIds), NOT re-expanded from its memoryIds. A memory's photos can
// split across moments/days; keying on memoryIds would contaminate each decision's `hm`
// with photos that belong to other moments (the O2 review's Finding 1). Every decision
// carries photoIds (sessionScorer.js).
export function hmForDecision({ byPhoto }, photoIds) {
  const reads = []
  for (const key of photoIds || []) {
    const r = byPhoto.get(key)
    if (r) reads.push(r)
  }
  return summarizeReads(reads)
}
