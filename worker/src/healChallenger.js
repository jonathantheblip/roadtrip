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
import { buildEvidenceBench, WITNESSES } from './evidenceBench.js'
import { settle, combineAffinity, SETTLE_DEFAULTS } from './settlingEngine.js'
import { buildWorldModel } from './worldModel.js'
import { imputeSignals } from './imputation.js'
import { buildVisionExemplars } from './visionPlacement.js'

const localISO = (at) => (Number.isFinite(at) ? new Date(at).toISOString().slice(0, 10) : null)

// Compact tier codes for the per-witness map (an evidence GRADE, never a cutoff — §3/§5):
// o = observed (a real read), d = derived (imputed / propagated — softer), p = prior
// (the clamped cross-trip world model). Ranked so an aggregate keeps the STRONGEST tier a
// witness reached over a decision's photos (observed outranks derived outranks prior).
const TIER_CHAR = { observed: 'o', derived: 'd', prior: 'p' }
const TIER_RANK = { o: 3, d: 2, p: 1 }
const RANK_TIER = { 3: 'o', 2: 'd', 1: 'p' }
const maxSupport = (s) => Math.max(0, ...Object.values(s || {}).filter(Number.isFinite))

// Per-photo, per-witness contribution read straight off the FINAL bench (the same bench
// `settle` consumed), keyed by each photo's settled LEAN (its readout `top`). AUDIT-1 A1:
// top-k alone throws the fleet away — settle collapses every witness into a few scalars, so
// a later Learning Spine (O7) can't tell WHICH witnesses backed the lean vs the family's
// answer. This recovers that, additively, without re-deciding anything:
//   • PRESENCE ("which witnesses spoke") = the witness emitted a bench entry about this
//     photo. Abstainers emit nothing (the bench's grammar), so they are simply absent — a
//     dissenter that spoke about a NON-lean place is still present (recorded at g:0), which
//     is different from silence.
//   • GRADE ("at what grade") — for a PLACEMENT witness, its support for the photo's lean
//     place: the decomposition of the lean into per-witness credit. If the witness didn't
//     back the lean it registers 0 (spoke, but not for the winner); with no lean (a `leave`
//     read) it falls back to its strongest support so the voice still records. For an
//     AFFINITY witness there is no place — its grade is the same-moment pull it exerted on a
//     pair touching this photo (grouping, which flows to the lean via borrowing).
// Compact + deterministic; the grade is graded evidence, never a verdict.
export function witnessContributions(bench, photos) {
  const out = new Map()
  const add = (pid, witness, g, tier) => {
    const grade = Number.isFinite(g) ? g : 0
    const t = TIER_CHAR[tier] || 'o'
    if (!out.has(pid)) out.set(pid, {})
    const m = out.get(pid)
    const prev = m[witness]
    if (!prev) { m[witness] = { g: grade, t } }
    else {
      if (grade > prev.g) prev.g = grade
      if (TIER_RANK[t] > TIER_RANK[prev.t]) prev.t = t
    }
  }
  for (const e of bench?.placement || []) {
    const s = e.support || {}
    if (!Object.keys(s).length) continue // never emitted → didn't speak
    const top = photos?.get?.(e.photoId)?.top
    const g = top != null ? (Number.isFinite(s[top]) ? s[top] : 0) : maxSupport(s)
    add(e.photoId, e.witness, g, e.tier)
  }
  for (const e of bench?.affinity || []) {
    add(e.aId, e.witness, e.affinity, e.tier)
    add(e.bId, e.witness, e.affinity, e.tier)
  }
  return out
}

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

  // ADDITIVE (O2 lean-enrichment): the per-witness contribution map for THIS decision's
  // photos — which witnesses spoke (n = how many of the reads carried them) and at what
  // aggregate grade (g = mean lean-credit; t = the strongest tier they reached). Each read
  // may carry a per-photo `wit` (attached by challengerRead off the bench); reads without
  // one (hand-built callers) simply contribute nothing → an empty, still-shaped map. Built
  // in WITNESSES order so the map is deterministic. None of the existing fields move.
  const witAgg = {}
  for (const r of rs) {
    const w = r.wit
    if (!w) continue
    for (const k of Object.keys(w)) {
      const c = w[k]
      if (!c) continue
      const a = witAgg[k] || (witAgg[k] = { n: 0, gSum: 0, tRank: 0 })
      a.n += 1
      a.gSum += Number.isFinite(c.g) ? c.g : 0
      const tr = TIER_RANK[c.t] || 0
      if (tr > a.tRank) a.tRank = tr
    }
  }
  const wit = {}
  for (const k of WITNESSES) {
    const a = witAgg[k]
    if (!a) continue
    wit[k] = { n: a.n, g: round2(a.gSum / a.n), t: RANK_TIER[a.tRank] || 'o' }
  }

  return {
    top,
    dest: modal(dest),
    m: round2(mean(onTop.map((r) => (Number.isFinite(r.topM) ? r.topM : 0)))),
    conflict: round2(mean(rs.map((r) => (Number.isFinite(r.conflict) ? r.conflict : 0)))),
    ignorance: round2(mean(rs.map((r) => (Number.isFinite(r.ignorance) ? r.ignorance : 0)))),
    n: rs.length,
    wit,
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
    // ADDITIVE: attach each photo's per-witness contribution (keyed off its settled lean)
    // so the per-decision summary can decompose the lean per witness (AUDIT-1 A1 / O7).
    const contribs = witnessContributions(bench, res.photos)
    for (const pt of gpts) {
      const r = res.photos.get(pt.id)
      if (r) {
        r.wit = contribs.get(pt.id) || {}
        byPhoto.set(pt.id, r)
      }
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
