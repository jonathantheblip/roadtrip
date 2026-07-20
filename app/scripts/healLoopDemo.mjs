// healLoopDemo.mjs — HM-6 measured on the REAL corpus: Jonathan's two scenarios.
//   A) The collapse curve: consolidated questions, answered one at a time (simulated
//      answer = the family's own held-out filing) — how fast does the queue empty?
//   B) A SIMULATED new GPS upload to the completed Provincetown trip — how many photos
//      resolve without any question?
// Honest: filings held out from the machine; per-day; read-only; aggregates only.
import fs from 'node:fs'
import { buildEvidenceBench } from '../src/lib/evidenceBench.js'
import { settle, combineAffinity, SETTLE_DEFAULTS } from '../src/lib/settlingEngine.js'
import { buildWorldModel } from '../src/lib/worldModel.js'
import { imputeSignals } from '../src/lib/imputation.js'
import { buildVisionExemplars } from '../src/lib/visionPlacement.js'
import { consolidateAsks, applyAnswers, scoreQuestions } from '../src/lib/healLoop.js'

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

const truthByTrip = new Map() // held-out filings, used ONLY to simulate the family's answers
const pointsByTrip = new Map()
for (const m of load('mem.json')) {
  let arr = []; try { arr = JSON.parse(m.photo_r2_keys_json || '[]') } catch { /* skip */ }
  if (!Array.isArray(arr)) arr = arr ? [arr] : []
  for (const e of arr) {
    if (!e || typeof e !== 'object' || !e.key) continue
    const off = Number.isFinite(e.offsetMinutes) ? e.offsetMinutes : 0
    const v = e.vision || {}
    const pt = { id: e.key, memoryId: m.id, at: e.capturedAt ? Date.parse(e.capturedAt) + off * 60000 : undefined, lat: e.lat, lng: e.lng, provGps: e.prov && e.prov.gps, scene: typeof e.scene === 'string' ? e.scene : undefined, placeType: v.placeType, setting: v.setting, visionName: v.name, labels: v.labels, signage: v.signage }
    if (!pointsByTrip.has(m.trip_id)) pointsByTrip.set(m.trip_id, [])
    pointsByTrip.get(m.trip_id).push(pt)
    if (m.stop_id) { if (!truthByTrip.has(m.trip_id)) truthByTrip.set(m.trip_id, new Map()); truthByTrip.get(m.trip_id).set(e.key, m.stop_id) }
  }
}
const exemplars = buildVisionExemplars([...pointsByTrip.values()].flat().map((p) => ({ ...p, currentStopId: truthByTrip.get('')?.get?.(p.id) ?? null }))) // no filings leak: exemplars built only from confirmed answers as they arrive

function runTrip(tripId, { answers = [], extraPoints = [] } = {}) {
  const trip = tripById.get(tripId)
  const base = (pointsByTrip.get(tripId) || []).concat(extraPoints)
  const points = applyAnswers(base, answers)
  const worldModel = buildWorldModel(trips.filter((t) => t.id !== tripId), {})
  const dayStops = new Map(trip.days.map((dy) => [dy.isoDate, dy.stops]))
  const groups = new Map()
  for (const pt of points) { const day = localISO(pt.at); const key = day && dayStops.has(day) ? day : '__loose__'; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(pt) }
  const perPoint = new Map(); const allPairs = []
  // exemplars grow ONLY from answers (the corpus learning loop) — never from held-out filings
  const answeredEx = buildVisionExemplars(points.filter((p) => p.confirmedStopId).map((p) => ({ ...p, currentStopId: p.confirmedStopId })))
  for (const [key, gpts] of groups) {
    const places = key === '__loose__' ? trip.stops : dayStops.get(key)
    if (!places.length) continue
    const pairs0 = [...combineAffinity(buildEvidenceBench(gpts, places).affinity, SETTLE_DEFAULTS).values()]
    const imputed = imputeSignals(gpts, pairs0)
    const bench = buildEvidenceBench(imputed, places, { worldModel, now: NOW, exemplars: answeredEx })
    const res = settle(bench, places)
    allPairs.push(...pairs0)
    for (const pt of gpts) { const r = res.photos.get(pt.id); if (r) perPoint.set(pt.id, r) }
  }
  return { trip, points, perPoint, pairs: allPairs }
}

const real = trips.filter((t) => !FIXTURE.has(t.id) && (pointsByTrip.get(t.id) || []).length)
const countAsks = (perPoint) => [...perPoint.values()].filter((r) => r.destination === 'ask').length

console.log('=== SCENARIO A: the collapse curve — consolidated questions, one answer at a time ===\n')
let totalAsksStart = 0, totalPhotos = 0
const state = new Map() // tripId -> answers[]
for (const t of real) { const { perPoint, points } = runTrip(t.id); totalAsksStart += countAsks(perPoint); totalPhotos += points.length }
console.log(`start: ${totalPhotos} photos, ${totalAsksStart} ask-photos across ${real.length} trips`)

console.log('\n--- what the QUESTIONS actually look like (value-ordered, human-shaped) ---')
const allQs = []
for (const t of real) {
  const { perPoint, pairs, points, trip } = runTrip(t.id)
  const qs = scoreQuestions(consolidateAsks(perPoint, pairs), perPoint, points, trip.stops)
  for (const q of qs) allQs.push({ tripId: t.id, q })
}
allQs.sort((a, b) => b.q.value - a.q.value)
for (const { tripId, q } of allQs.slice(0, 5)) {
  const cands = q.candidates.slice(0, 2).map((c) => `${c.name}${c.kind ? ` (${c.kind})` : ''}`).join('  vs  ')
  console.log(`  ${q.worthAsking ? 'ASK ' : 'SKIP'} “${q.momentName || 'this moment'}” — ${q.photoIds.length} photos: ${cands}`)
  console.log(`        value ${q.value.toFixed(1)} · answerability ${q.answerability.toFixed(2)} · teaches ${q.taught} lookalikes · reach ${q.reach}  [${tripId}]`)
}
const skipped = allQs.filter((x) => !x.q.worthAsking).length
console.log(`  (${skipped} of ${allQs.length} candidate questions deemed NOT worth a glance — they stay soft instead of nagging)`)
let q = 0
for (; q < 12; q++) {
  // find the highest-reach question anywhere
  let best = null
  for (const t of real) {
    const { perPoint, pairs } = runTrip(t.id, { answers: state.get(t.id) || [] })
    for (const c of consolidateAsks(perPoint, pairs)) if (!best || c.reach > best.c.reach) best = { tripId: t.id, c }
  }
  if (!best) break
  // the family answers with their own held-out filing (majority among the question's members)
  const truth = truthByTrip.get(best.tripId) || new Map()
  const tally = new Map()
  for (const id of best.c.photoIds) { const s = truth.get(id); if (s) tally.set(s, (tally.get(s) || 0) + 1) }
  const answer = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || best.c.candidates[0]?.placeId
  if (!answer) break
  state.set(best.tripId, [...(state.get(best.tripId) || []), { photoIds: best.c.photoIds, placeId: answer }])
  let asksNow = 0
  for (const t of real) asksNow += countAsks(runTrip(t.id, { answers: state.get(t.id) || [] }).perPoint)
  console.log(`  Q${q + 1} (${best.c.photoIds.length} photos, reach ${best.c.reach}) answered → ask-photos remaining: ${asksNow}`)
  if (!asksNow) { q++; break }
}
console.log(`\n→ ${totalAsksStart} ask-photos collapsed under ${q} consolidated question(s).`)

console.log('\n=== SCENARIO B (SIMULATED): one new GPS photo uploaded to completed Provincetown ===\n')
const PT = 'provincetown-july-4th-2026-07-2'
const before = runTrip(PT)
const ptTrip = tripById.get(PT)
// pick the day with the most non-file photos whose stops have coords; synth one upload there
let target = null
for (const dy of ptTrip.days) {
  const stop = dy.stops.find((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng))
  if (!stop) continue
  const dayPts = (pointsByTrip.get(PT) || []).filter((p) => localISO(p.at) === dy.isoDate)
  const unresolved = dayPts.filter((p) => { const r = before.perPoint.get(p.id); return r && r.destination !== 'file' })
  if (dayPts.length && (!target || unresolved.length > target.unresolved.length)) target = { dy, stop, dayPts, unresolved }
}
if (!target) { console.log('(no coorded day found)') } else {
  const times = target.dayPts.map((p) => p.at).filter(Number.isFinite).sort((a, b) => a - b)
  const sim = { id: '__sim_upload__', memoryId: '__sim__', at: times[Math.floor(times.length / 2)], lat: target.stop.lat, lng: target.stop.lng, provGps: 'exif' }
  const after = runTrip(PT, { extraPoints: [sim] })
  let resolved = 0, asksB = 0, asksA = 0
  for (const p of target.dayPts) {
    const b = before.perPoint.get(p.id), a = after.perPoint.get(p.id)
    if (!b || !a) continue
    if (b.destination === 'ask') asksB++
    if (a.destination === 'ask') asksA++
    if ((b.destination === 'leave' || b.destination === 'ask') && (a.destination === 'heal' || a.destination === 'file')) resolved++
  }
  console.log(`day ${target.dy.isoDate} (“${target.stop.name}”, ${target.dayPts.length} photos): ONE simulated GPS upload →`)
  console.log(`  ${resolved} previously loose/asking photos resolved to a place; ask-photos ${asksB} → ${asksA}`)
}
