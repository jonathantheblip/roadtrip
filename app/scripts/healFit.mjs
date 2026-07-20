// healFit.mjs — F5: fit the settle-level per-witness weights from MEASUREMENT
// (BUILD_PLAN_HM_WEEK F5; plan §13 — weights are measured, never felt; §15/AUDIT-1 —
// ablation runs are sanctioned instruments, results to this local report only).
//
// The fit criterion (its own knobs are DECLARED seeds, per §13), carrying Jonathan's
// asymmetry — fabrication slightly down-weighted, failure-to-learn up-weighted:
//     score = recoveryRate − 0.75·askRate − 1.0·misfileRate
// (asks are taxed as failure-to-learn; silent misfiles penalized but NOT crushingly —
// they are the reversible-soft class in the real system, and over-fearing them is the
// §13 drift). §13 floor: no candidate weight below 0.2 — measure-and-lower, never
// silence. Grid over the two measured-harmful channels (placeType, worldModel); the
// helping channels keep weight 1 (their deltas are positive; inflating past 1 would
// be a felt boost, not a measured one).
import fs from 'node:fs'
import { buildEvidenceBench } from '../src/lib/evidenceBench.js'
import { settle, combineAffinity, SETTLE_DEFAULTS } from '../src/lib/settlingEngine.js'
import { buildWorldModel } from '../src/lib/worldModel.js'
import { imputeSignals } from '../src/lib/imputation.js'
import { buildVisionExemplars } from '../src/lib/visionPlacement.js'

const S = process.env.SCRATCH
const load = (f) => { const t = fs.readFileSync(`${S}/${f}`, 'utf8'); return JSON.parse(t.slice(t.indexOf('[')))[0].results }
const NOW = Date.now()
const FIXTURE = new Set(['volleyball-2026'])
const localISO = (at) => (Number.isFinite(at) ? new Date(at).toISOString().slice(0, 10) : null)
const parseTimeMin = (s) => { const m = typeof s === 'string' && s.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i); if (!m) return null; let h = +m[1]; const ap = (m[3] || '').toUpperCase(); if (ap === 'PM' && h < 12) h += 12; if (ap === 'AM' && h === 12) h = 0; return h * 60 + +m[2] }

const trips = load('trips.json').map((r) => {
  const d = JSON.parse(r.data_json)
  const days = (d.days || []).map((day) => ({ isoDate: day.isoDate, stops: (day.stops || []).map((st) => ({ id: st.id, name: st.name, lat: st.lat, lng: st.lng, timeMin: parseTimeMin(st.time), kind: st.kind })) }))
  return { id: r.id, endMs: Date.parse(d.dateRangeEnd) || null, days, stops: days.flatMap((dy) => dy.stops) }
})
const tripById = new Map(trips.map((t) => [t.id, t]))
const pointsByTrip = new Map()
for (const m of load('mem.json')) {
  let arr = []; try { arr = JSON.parse(m.photo_r2_keys_json || '[]') } catch { /* skip */ }
  if (!Array.isArray(arr)) arr = arr ? [arr] : []
  for (const e of arr) {
    if (!e || typeof e !== 'object' || !e.key) continue
    const off = Number.isFinite(e.offsetMinutes) ? e.offsetMinutes : 0
    const v = e.vision || {}
    const pt = { id: e.key, memoryId: m.id, currentStopId: m.stop_id || null, at: e.capturedAt ? Date.parse(e.capturedAt) + off * 60000 : undefined, lat: e.lat, lng: e.lng, provGps: e.prov && e.prov.gps, scene: typeof e.scene === 'string' ? e.scene : undefined, placeType: v.placeType, setting: v.setting, visionName: v.name, labels: v.labels, signage: v.signage }
    if (!pointsByTrip.has(m.trip_id)) pointsByTrip.set(m.trip_id, [])
    pointsByTrip.get(m.trip_id).push(pt)
  }
}
const exemplars = buildVisionExemplars([...pointsByTrip.values()].flat()) // lookalike self/sibling holdout applies internally

function runTrip(tripId, weights) {
  const trip = tripById.get(tripId)
  const points = pointsByTrip.get(tripId) || []
  const worldModel = buildWorldModel(trips.filter((t) => t.id !== tripId), {})
  const dayStops = new Map(trip.days.map((dy) => [dy.isoDate, dy.stops]))
  const groups = new Map()
  for (const pt of points) { const day = localISO(pt.at); const key = day && dayStops.has(day) ? day : '__loose__'; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(pt) }
  const out = []
  for (const [key, gpts] of groups) {
    const places = key === '__loose__' ? trip.stops : dayStops.get(key)
    if (!places.length) continue
    const masked = gpts.map((p) => { const c = { ...p }; delete c.currentStopId; return c }) // filing HELD OUT
    const pairs = [...combineAffinity(buildEvidenceBench(masked, places).affinity, SETTLE_DEFAULTS).values()]
    const imputed = imputeSignals(masked, pairs)
    const bench = buildEvidenceBench(imputed, places, { worldModel, now: NOW, exemplars })
    const res = settle(bench, places, { weights })
    const ids = new Set(places.map((p) => p.id))
    for (const pt of gpts) { const r = res.photos.get(pt.id); if (r) out.push({ pt, r, ids }) }
  }
  return out
}

const real = trips.filter((t) => !FIXTURE.has(t.id) && (pointsByTrip.get(t.id) || []).length)
function evaluate(weights) {
  let filed = 0, agree = 0, misfiled = 0
  const dest = { file: 0, heal: 0, ask: 0, leave: 0 }
  for (const t of real) for (const { pt, r, ids } of runTrip(t.id, weights)) {
    dest[r.destination] = (dest[r.destination] || 0) + 1
    if (!pt.currentStopId || !ids.has(pt.currentStopId)) continue
    filed++
    if (r.top === pt.currentStopId) agree++
    else if (r.destination === 'file') misfiled++ // SILENT wrong file — the dangerous class
  }
  const total = dest.file + dest.heal + dest.ask + dest.leave
  const recovery = filed ? agree / filed : 0
  const askRate = total ? dest.ask / total : 0
  const misfileRate = filed ? misfiled / filed : 0
  return { recovery, askRate, misfileRate, dest, score: recovery - 0.75 * askRate - 1.0 * misfileRate }
}

const GRID = [0.2, 0.4, 0.6, 0.8, 1.0] // §13 floor: never below 0.2 — lowered, never silenced
console.log('=== F5 FIT — criterion: recovery − 0.75·ask − 1.0·misfile (declared seeds) ===\n')
const base = evaluate({})
console.log(`baseline (all weights 1): recovery ${(100 * base.recovery).toFixed(0)}% · ask ${(100 * base.askRate).toFixed(0)}% · misfile ${(100 * base.misfileRate).toFixed(1)}% · score ${base.score.toFixed(3)}`)
let best = { w: {}, ...base }
const rows = []
for (const pt of GRID) for (const wm of GRID) {
  const w = { placeType: pt, worldModel: wm }
  const e = evaluate(w)
  rows.push({ pt, wm, ...e })
  if (e.score > best.score + 1e-9) best = { w, ...e }
}
rows.sort((a, b) => b.score - a.score)
console.log('\ntop 5 combos (placeType / worldModel):')
for (const r of rows.slice(0, 5)) console.log(`   pT ${r.pt} · wM ${r.wm} → recovery ${(100 * r.recovery).toFixed(0)}% · ask ${(100 * r.askRate).toFixed(0)}% · misfile ${(100 * r.misfileRate).toFixed(1)}% · score ${r.score.toFixed(3)}`)
console.log(`\nFITTED: ${JSON.stringify(best.w)} → recovery ${(100 * best.recovery).toFixed(0)}% · ask ${(100 * best.askRate).toFixed(0)}% · misfile ${(100 * best.misfileRate).toFixed(1)}%`)
console.log('destinations at fit:', JSON.stringify(best.dest))
// §13 both-direction guards, checked explicitly:
console.log('\nGUARDS: no weight below 0.2 (floor held by grid) ·',
  `misfile did not rise vs baseline: ${best.misfileRate <= base.misfileRate + 1e-9 ? 'HELD' : '⚠ ROSE — reject fit'}`,
  `· recovery did not fall: ${best.recovery >= base.recovery - 1e-9 ? 'HELD' : '⚠ FELL — examine'}`)
