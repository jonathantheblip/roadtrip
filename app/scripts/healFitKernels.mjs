// healFitKernels.mjs — O3 (BUILD_PLAN_HM_WEEK.md): a REPORT-ONLY measurement instrument
// for the settling engine's soft-kernel SCALES, on the real corpus.
//
// ⛔ THE ONE RULE (§15b of DESIGN_THE_HEALING_MODEL.md — "measurements are instruments,
// not gates"): this script MEASURES and PRINTS. It NEVER writes, applies, or tunes
// anything — not BENCH_DEFAULTS, not SETTLE_DEFAULTS, not any lib, not any file. There is
// no accept/reject-if-better logic here. The output is numbers for Jonathan to reason
// about as a WHOLE; a proposed scale from ~20 points is a whisper, never a verdict, and
// nothing downstream reads this. Run:
//   SCRATCH=<scratch dir> node app/scripts/healFitKernels.mjs
import fs from 'node:fs'
import { BENCH_DEFAULTS } from '../src/lib/evidenceBench.js'

const S = process.env.SCRATCH
if (!S) { console.error('set SCRATCH to the dir holding mem.json + trips.json'); process.exit(1) }
const load = (f) => { const t = fs.readFileSync(`${S}/${f}`, 'utf8'); return JSON.parse(t.slice(t.indexOf('[')))[0].results }
const FIXTURE = new Set(['volleyball-2026'])

// Kernels re-declared here (module-internal in evidenceBench) so the Q-Q readout uses the
// EXACT shapes the engine uses — never a re-imagined curve.
const gaussKernel = (x, scale) => (scale > 0 && Number.isFinite(x) ? Math.exp(-0.5 * (x / scale) ** 2) : 0)
const expDecay = (x, tau) => (tau > 0 ? Math.exp(-Math.max(0, x) / tau) : 0)
const R = 6371000
const toRad = (d) => (d * Math.PI) / 180
function haversineMeters(lat1, lng1, lat2, lng2) {
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}
const parseTimeMin = (s) => { const m = typeof s === 'string' && s.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i); if (!m) return null; let h = +m[1]; const ap = (m[3] || '').toUpperCase(); if (ap === 'PM' && h < 12) h += 12; if (ap === 'AM' && h === 12) h = 0; return h * 60 + +m[2] }
const localISO = (at) => (Number.isFinite(at) ? new Date(at).toISOString().slice(0, 10) : null)
const localMin = (at) => (Number.isFinite(at) ? new Date(at).getUTCHours() * 60 + new Date(at).getUTCMinutes() : null)
const q = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const i = Math.min(s.length - 1, Math.floor(p * (s.length - 1))); return s[i] }
const fmt = (x, d = 0) => (x == null ? '—' : x.toFixed(d))

// ── adapt the corpus (faithful to healShadow.mjs) ──────────────────────────────
const trips = load('trips.json').filter((r) => !FIXTURE.has(r.id)).map((r) => {
  let d = {}; try { d = JSON.parse(r.data_json) } catch { /* skip */ }
  const stopById = new Map()
  const days = (d.days || []).map((day) => ({
    isoDate: day.isoDate,
    stops: (day.stops || []).map((st) => { const s = { id: st.id, name: st.name || st.title, lat: st.lat, lng: st.lng, timeMin: parseTimeMin(st.time) }; if (s.id) stopById.set(s.id, s); return s }),
  }))
  return { id: r.id, days, stopById }
})
const tripById = new Map(trips.map((t) => [t.id, t]))
const points = []
for (const m of load('mem.json')) {
  if (FIXTURE.has(m.trip_id)) continue
  let arr = []; try { arr = JSON.parse(m.photo_r2_keys_json || '[]') } catch { arr = [] }
  if (!Array.isArray(arr)) arr = arr ? [arr] : []
  for (const e of arr) {
    if (!e || typeof e !== 'object' || !e.key) continue
    const off = Number.isFinite(e.offsetMinutes) ? e.offsetMinutes : 0
    points.push({ tripId: m.trip_id, currentStopId: m.stop_id || null, at: e.capturedAt ? Date.parse(e.capturedAt) + off * 60000 : undefined, lat: e.lat, lng: e.lng })
  }
}

console.log('=== O3 — soft-kernel scale MEASUREMENT on the real corpus (report-only) ===')
console.log(`corpus: ${trips.length} real trips, ${points.length} photos\n`)

// ── 1. GPS-distance kernel (gpsScaleMeters) ────────────────────────────────────
// For photos with coords, filed to a real coord-bearing stop: photo→its-filed-stop.
const gpsDists = []
for (const pt of points) {
  if (!Number.isFinite(pt.lat) || !Number.isFinite(pt.lng) || !pt.currentStopId) continue
  const st = tripById.get(pt.tripId)?.stopById.get(pt.currentStopId)
  if (!st || !Number.isFinite(st.lat) || !Number.isFinite(st.lng)) continue
  const d = haversineMeters(pt.lat, pt.lng, st.lat, st.lng)
  if (Number.isFinite(d)) gpsDists.push(d)
}
const gSeed = BENCH_DEFAULTS.gpsScaleMeters
console.log(`1. GPS-distance kernel — current seed gpsScaleMeters = ${gSeed}m  (gauss: 0.5 membership at ${(1.177 * gSeed).toFixed(0)}m)`)
// The distribution is BIMODAL: a tight same-place cluster + a far tail (photos whose GPS
// disagrees with their filed stop by >1km — a real divergence, not kernel material). A
// naive p90 would be dominated by the tail and propose a garbage scale, so split them and
// propose ONLY from the near mode; surface the far filings as evidence for Jonathan.
const NEAR = 1000
const near = gpsDists.filter((d) => d <= NEAR)
const far = gpsDists.filter((d) => d > NEAR)
if (gpsDists.length >= 5) {
  console.log(`   n=${gpsDists.length} located+filed photos: ${near.length} near (≤${NEAR}m) + ${far.length} FAR (>${NEAR}m — GPS disagrees with the filing)`)
  if (near.length >= 5) {
    const p50 = q(near, 0.5), p75 = q(near, 0.75), p90 = q(near, 0.9)
    console.log(`   near/same-place distances: median ${fmt(p50)}m · p75 ${fmt(p75)}m · p90 ${fmt(p90)}m`)
    console.log(`   PROPOSED gpsScaleMeters ≈ ${(p90 / 1.177).toFixed(0)}m (0.5 at the near-mode p90 — the tail EXCLUDED, not fitted)`)
    console.log(`   Q-Q (membership the SEED gives, near mode): p50 ${gaussKernel(p50, gSeed).toFixed(2)} · p90 ${gaussKernel(p90, gSeed).toFixed(2)}`)
  } else console.log(`   near mode n=${near.length} — too few to propose a scale.`)
  if (far.length) console.log(`   ⚑ FLAG for Jonathan: ${far.length} photo(s) filed >1km from their GPS (median far ${fmt(q(far, 0.5))}m) — a filing↔GPS divergence the shadow engine would surface, NOT a kernel-scale question.`)
} else console.log(`   n=${gpsDists.length} — too few located+filed photos to say anything (a whisper at best).`)

// ── 2. Time-gap kernel (gapTauMin) ─────────────────────────────────────────────
// Consecutive within-day photo gaps. Small mode = same burst; large = moment boundary.
const gaps = []
const byTripDay = new Map()
for (const pt of points) {
  if (!Number.isFinite(pt.at)) continue
  const k = `${pt.tripId}|${localISO(pt.at)}`
  if (!byTripDay.has(k)) byTripDay.set(k, [])
  byTripDay.get(k).push(pt.at)
}
for (const ats of byTripDay.values()) {
  ats.sort((a, b) => a - b)
  for (let i = 1; i < ats.length; i++) gaps.push((ats[i] - ats[i - 1]) / 60000)
}
const small = gaps.filter((g) => g <= 60) // the same-moment mode (heavy tail beyond)
const tSeed = BENCH_DEFAULTS.gapTauMin
console.log(`\n2. Time-gap kernel — current seed gapTauMin = ${tSeed}min  (expDecay: 0.5 same-moment at ${(0.693 * tSeed).toFixed(0)}min)`)
if (gaps.length >= 5) {
  console.log(`   all within-day gaps (n=${gaps.length}): median ${fmt(q(gaps, 0.5), 1)}min · p75 ${fmt(q(gaps, 0.75), 1)}min · p90 ${fmt(q(gaps, 0.9), 1)}min`)
  console.log(`   small-mode (≤60min, the burst gaps, n=${small.length}): median ${fmt(q(small, 0.5), 1)}min · p75 ${fmt(q(small, 0.75), 1)}min · p90 ${fmt(q(small, 0.9), 1)}min`)
  if (small.length >= 5) {
    const proposed = q(small, 0.75) / Math.LN2 // tau s.t. the burst-p75 gap keeps ~0.5 same-moment
    console.log(`   PROPOSED gapTauMin ≈ ${proposed.toFixed(0)}min (0.5 same-moment at the burst-gap p75)`)
    console.log(`   Q-Q (same-moment the SEED gives at each burst quantile): p50 ${expDecay(q(small, 0.5), tSeed).toFixed(2)} · p75 ${expDecay(q(small, 0.75), tSeed).toFixed(2)} · p90 ${expDecay(q(small, 0.9), tSeed).toFixed(2)}`)
  }
} else console.log(`   n=${gaps.length} — too few gaps to say anything.`)

// ── 3. Time-of-day kernel (timeScaleMin) ───────────────────────────────────────
// |photo local-minute − filed-stop declared-minute| for photos filed to a timed stop.
const todDeltas = []
for (const pt of points) {
  if (!Number.isFinite(pt.at) || !pt.currentStopId) continue
  const st = tripById.get(pt.tripId)?.stopById.get(pt.currentStopId)
  if (!st || !Number.isFinite(st.timeMin)) continue
  const lm = localMin(pt.at)
  if (lm != null) todDeltas.push(Math.abs(lm - st.timeMin))
}
const tdSeed = BENCH_DEFAULTS.timeScaleMin
console.log(`\n3. Time-of-day kernel — current seed timeScaleMin = ${tdSeed}min  (gauss: 0.5 at ${(1.177 * tdSeed).toFixed(0)}min)`)
if (todDeltas.length >= 5) {
  const p50 = q(todDeltas, 0.5), p75 = q(todDeltas, 0.75), p90 = q(todDeltas, 0.9)
  console.log(`   |photo − stop-time| (n=${todDeltas.length}): median ${fmt(p50)}min · p75 ${fmt(p75)}min · p90 ${fmt(p90)}min`)
  console.log(`   PROPOSED timeScaleMin ≈ ${(p90 / 1.177).toFixed(0)}min (0.5 at the p90)`)
  console.log(`   Q-Q (membership the SEED gives): p50 ${gaussKernel(p50, tdSeed).toFixed(2)} · p90 ${gaussKernel(p90, tdSeed).toFixed(2)}`)
} else console.log(`   n=${todDeltas.length} — too few timed-stop filings (declared stop times are sparse).`)

console.log(`\n** REPORT ONLY — nothing applied. Measurements for Jonathan's holistic judgment (§15b). **`)
console.log(`** A proposed scale here is a whisper from a small corpus, never a verdict; the WHOLE machine is the unit, not any one kernel. **`)
