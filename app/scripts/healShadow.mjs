// healShadow.mjs — HM-5: the WHOLE Healing Model run on the real corpus (read-only).
//
// Assembles every organ (bench + settling + world-model held-out + imputation + the
// vision place-witness) against the family's real trips and reads out where the machine
// lands and where it DIVERGES from the current filing — evidence, never a verdict (§7).
// HONEST by construction: it HOLDS THE FILING OUT (the currentFiling witness never sees
// the answer), runs PER-DAY (the clock can't match across days), and scores the unfiled
// photos too. Plus per-channel ABLATION (§13). Reads a session-local dump; never commits
// data; prints aggregates + a few illustrative divergences only.
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
const parseTimeMin = (s) => {
  const m = typeof s === 'string' && s.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
  if (!m) return null
  let h = +m[1]; const min = +m[2]; const ap = (m[3] || '').toUpperCase()
  if (ap === 'PM' && h < 12) h += 12; if (ap === 'AM' && h === 12) h = 0
  return h * 60 + min
}

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
    const pt = {
      id: e.key, memoryId: m.id, currentStopId: m.stop_id || null,
      at: e.capturedAt ? Date.parse(e.capturedAt) + off * 60000 : undefined,
      lat: e.lat, lng: e.lng, provGps: e.prov && e.prov.gps, scene: typeof e.scene === 'string' ? e.scene : undefined,
      placeType: v.placeType, setting: v.setting, visionName: v.name, labels: v.labels, signage: v.signage,
    }
    if (!pointsByTrip.has(m.trip_id)) pointsByTrip.set(m.trip_id, [])
    pointsByTrip.get(m.trip_id).push(pt)
  }
}
const exemplars = buildVisionExemplars([...pointsByTrip.values()].flat()) // cross-corpus; lookalike holds out self+siblings

function runTrip(tripId, dropWitness) {
  const trip = tripById.get(tripId)
  const points = pointsByTrip.get(tripId) || []
  const worldModel = buildWorldModel(trips.filter((t) => t.id !== tripId), {}) // HELD OUT
  const dayStops = new Map(trip.days.map((dy) => [dy.isoDate, dy.stops]))
  const groups = new Map()
  for (const pt of points) {
    const day = localISO(pt.at)
    const key = day && dayStops.has(day) ? day : '__loose__'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(pt)
  }
  const perPoint = new Map()
  for (const [key, gpts] of groups) {
    const places = key === '__loose__' ? trip.stops : dayStops.get(key)
    if (!places.length) continue
    const masked = gpts.map((p) => { const c = { ...p }; delete c.currentStopId; return c }) // HOLD OUT the filing
    const pairs = [...combineAffinity(buildEvidenceBench(masked, places).affinity, SETTLE_DEFAULTS).values()]
    const imputed = imputeSignals(masked, pairs)
    let bench = buildEvidenceBench(imputed, places, { worldModel, now: NOW, exemplars })
    if (dropWitness) bench = { placement: bench.placement.filter((e) => e.witness !== dropWitness), affinity: bench.affinity.filter((e) => e.witness !== dropWitness) }
    const res = settle(bench, places)
    const ids = new Set(places.map((p) => p.id)); const names = new Map(places.map((p) => [p.id, p.name]))
    for (const pt of gpts) { const r = res.photos.get(pt.id); if (r) perPoint.set(pt.id, { r, ids, names }) }
  }
  return { trip, points, perPoint }
}

function score(runs) {
  let filedToCand = 0, agree = 0, filedSynthetic = 0, unfiled = 0
  const dest = { file: 0, heal: 0, ask: 0, leave: 0 }; const divergences = []
  for (const { points, perPoint } of runs) {
    for (const pt of points) {
      const e = perPoint.get(pt.id); if (!e) continue
      dest[e.r.destination] = (dest[e.r.destination] || 0) + 1
      if (!pt.currentStopId) { unfiled++; continue }
      if (!e.ids.has(pt.currentStopId)) { filedSynthetic++; continue }
      filedToCand++
      if (e.r.top === pt.currentStopId) agree++
      else if (divergences.length < 8) divergences.push({ filed: e.names.get(pt.currentStopId), top: e.r.top ? e.names.get(e.r.top) : '(leave)', dest: e.r.destination })
    }
  }
  return { filedToCand, agree, filedSynthetic, unfiled, dest, divergences }
}

const real = trips.filter((t) => !FIXTURE.has(t.id) && (pointsByTrip.get(t.id) || []).length)
console.log('=== HM-5 (honest: filing held out, per-day) — the WHOLE machine on real trips ===\n')
const fullRuns = real.map((t) => runTrip(t.id))
for (const { trip, points, perPoint } of fullRuns) {
  const d = { file: 0, heal: 0, ask: 0, leave: 0 }
  for (const pt of points) { const e = perPoint.get(pt.id); if (e) d[e.r.destination]++ }
  console.log(`${trip.id.padEnd(30)} ${String(points.length).padStart(3)}  →  file ${String(d.file).padStart(3)}  heal ${String(d.heal).padStart(3)}  ask ${String(d.ask).padStart(3)}  leave ${String(d.leave).padStart(3)}`)
}
const full = score(fullRuns)
const rate = full.filedToCand ? full.agree / full.filedToCand : 0
console.log(`\nHONEST agreement (filing held out): ${full.agree}/${full.filedToCand} = ${(100 * rate).toFixed(0)}%   [${full.filedSynthetic} filed to base/synthetic; ${full.unfiled} unfiled]`)
console.log('destination mix (all):', JSON.stringify(full.dest), ` — ask-rate ${Math.round(100 * full.dest.ask / (full.dest.file + full.dest.heal + full.dest.ask + full.dest.leave))}%`)
console.log('\nsample DIVERGENCES (filed → machine leans; evidence, not verdicts):')
for (const dv of full.divergences) console.log(`   ${String(dv.filed).slice(0, 24).padEnd(24)} → ${String(dv.top).slice(0, 24).padEnd(24)} [${dv.dest}]`)

console.log('\n=== ABLATION (§13) — agreement without each channel ===')
console.log(`full: ${(100 * rate).toFixed(0)}%`)
const rows = ['gps', 'time', 'currentFiling', 'worldModel', 'signage', 'placeType', 'lookalike', 'timeGap', 'sequence', 'scene', 'faces'].map((w) => {
  const s = score(real.map((t) => runTrip(t.id, w))); const r = s.filedToCand ? s.agree / s.filedToCand : 0
  return { w, r, delta: rate - r }
}).sort((a, b) => b.delta - a.delta)
for (const r of rows) console.log(`   drop ${r.w.padEnd(14)} → ${(100 * r.r).toFixed(0).padStart(3)}%   (${r.delta >= 0 ? '+' : ''}${(100 * r.delta).toFixed(0)} ${r.delta > 0.005 ? 'HELPS' : r.delta < -0.005 ? 'HURTS' : '·'})`)
