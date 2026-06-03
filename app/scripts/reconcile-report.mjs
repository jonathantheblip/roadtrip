#!/usr/bin/env node
// RECONCILIATION REPORT — the instrument for "validate auto-filing on real data."
//
// Runs the REAL pipeline headlessly over a folder of real photos against a real trip:
//   readPhotoExif (ExifReader)  →  matchPhotosToStops  →  buildReconciliationDraft
// and prints a legible classification report PLUS how close each promote/demote/match
// decision sat to its threshold — so the first real run on the April photos shows both
// whether the draft "arrives mostly right" AND whether 500m / 2000m / 20min need tuning.
//
// No app, no deploy, no DB — pure functions over real bytes. Iterate on thresholds here.
//
// Usage:
//   node scripts/reconcile-report.mjs <photosDir> [tripId=jackson-2026]
//   node scripts/reconcile-report.mjs --self-test          # synthetic scenario (shows format)

import { readFileSync, readdirSync } from 'node:fs'
import { resolve, extname } from 'node:path'
import { findTrip, allStops } from '../src/data/trips.js'
import { readPhotoExif, filterByTripRange } from '../src/lib/photoBackfill.js'
import { matchPhotosToStops, MATCH_THRESHOLDS, haversineMeters } from '../src/lib/photoMatch.js'

const VERBOSE = process.argv.includes('--verbose')
import {
  buildReconciliationDraft,
  RECONCILE_THRESHOLDS,
  clusterDwellMs,
} from '../src/lib/reconcileDraft.js'

const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.heic': 'image/heic', '.heif': 'image/heif', '.png': 'image/png',
}

// Decode a folder of real photos into the {id, capturedAt, lat, lng} shape the matcher
// consumes — exactly what PhotoBackfillTriage builds from readPhotoExif.
async function decodeDir(dir) {
  const files = readdirSync(dir).filter((f) => MIME[extname(f).toLowerCase()])
  const photos = []
  for (const f of files) {
    let exif = {}
    try {
      const blob = new Blob([readFileSync(resolve(dir, f))], { type: MIME[extname(f).toLowerCase()] })
      exif = await readPhotoExif(blob)
    } catch {
      exif = {}
    }
    photos.push({ id: f, capturedAt: exif.capturedAt ?? null, lat: exif.lat ?? null, lng: exif.lng ?? null })
  }
  return photos
}

// Margin formatter: "23.4 > 20 ✓ (by 3.4)".
function margin(value, threshold, op) {
  if (!Number.isFinite(value)) return '—'
  const pass = op === '>' ? value > threshold : value < threshold
  const d = Math.abs(value - threshold)
  const r = (n) => (n < 100 ? n.toFixed(1) : String(Math.round(n)))
  return `${r(value)} ${op} ${threshold} ${pass ? '✓' : '✗'} (by ${r(d)})`
}

function report(photos, trip) {
  const T = MATCH_THRESHOLDS
  const dwellGate = RECONCILE_THRESHOLDS.clusterDwellMinutes
  console.log(`\n=== RECONCILIATION REPORT — "${trip.title}" (${trip.id}) ${trip.dateRangeStart}…${trip.dateRangeEnd} ===`)
  console.log(`Gates: gpsMatch ${T.gpsMatchMeters}m · cluster ${T.clusterDistanceMeters}m ×${T.clusterMinSize}+ · routeDev ${T.routeDeviationMeters}m · dwell ${dwellGate}min`)

  const withGps = photos.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)).length
  const withDate = photos.filter((p) => p.capturedAt).length
  console.log(`\nDECODE   : ${photos.length} photos · ${withGps} GPS · ${withDate} dated`)

  const { included, excluded } = filterByTripRange(photos, trip.dateRangeStart, trip.dateRangeEnd)
  console.log(`IN-WINDOW: ${included.length} kept · ${excluded.length} excluded (no date / outside ${trip.dateRangeStart}…${trip.dateRangeEnd})`)

  const mr = matchPhotosToStops(included, trip)
  const byType = {}
  for (const m of mr.matches) byType[m.matchType] = (byType[m.matchType] || 0) + 1
  console.log(`MATCH    : ${Object.entries(byType).map(([k, v]) => `${v} ${k}`).join(' · ') || '(none)'}`)

  if (VERBOSE) {
    const geoStops = allStops(trip).filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng))
    const nearest = (p) => {
      let best = null
      for (const s of geoStops) {
        const d = haversineMeters(p.lat, p.lng, s.lat, s.lng)
        if (!best || d < best.d) best = { s, d }
      }
      return best
    }
    const byPhoto = new Map(mr.matches.map((m) => [m.photoId, m]))
    console.log(`\nPER-PHOTO (in-window, GPS) — clock · verdict · NEAREST stop (any time):`)
    for (const p of included) {
      if (!Number.isFinite(p.lat)) continue
      const m = byPhoto.get(p.id) || {}
      const n = nearest(p)
      const clock = (p.capturedAt || '').slice(11, 16)
      const near = n ? `${n.s.name} (${Math.round(n.d)}m)` : '—'
      const flag = n && n.d <= MATCH_THRESHOLDS.gpsMatchMeters && m.matchType !== 'gps+time' ? '  ◀ near a stop but NOT gps+time' : ''
      console.log(`  ${p.id.padEnd(17)} ${clock}  ${(m.matchType || '?').padEnd(12)} ${near}${flag}`)
    }
  }

  const photoById = new Map(included.map((p) => [p.id, p]))
  if (mr.deviationClusters.length) {
    console.log(`\nOFF-ROUTE CLUSTERS (${mr.deviationClusters.length}) — each gets the dwell gate:`)
    for (const c of mr.deviationClusters) {
      const dwellMin = clusterDwellMs(c.photoIds, photoById) / 60_000
      const verdict = dwellMin >= dwellGate ? 'AUTO-ADDED stop' : 'demoted → interstitial'
      console.log(`  ${c.id}: ${c.photoIds.length} photos · dwell ${margin(dwellMin, dwellGate, '>')}min · offRoute ${margin(c.distanceToRouteMeters, T.routeDeviationMeters, '>')}m  →  ${verdict}`)
    }
  }

  const draft = buildReconciliationDraft(included, trip, { matchResult: mr })
  console.log(`\nDRAFT    : ${JSON.stringify(draft.summary)}`)
  for (const day of draft.days) {
    const auto = day.stops.filter((s) => s.source === 'auto_added')
    const happened = day.stops.filter((s) => s.state === 'happened' && s.photoIds.length)
    const ints = day.interstitials.filter((i) => i.photoIds.length)
    if (!auto.length && !happened.length && !ints.length) continue
    console.log(`  Day ${day.dayN} (${day.dayIsoDate}) ${day.dayTitle}: ${happened.length} stops-with-photos, ${auto.length} auto-added, ${ints.length} interstitial buckets`)
    for (const s of auto) console.log(`      + auto "${s.name}" — ${s.photoIds.length} photos, ${Math.round(s.distanceToRouteMeters)}m off route`)
  }

  console.log(`\nRESIDUE  : ${draft.unmatched.length} unmatched`)
  for (const u of draft.unmatched.slice(0, 25)) {
    const p = photoById.get(u.photoId)
    const why = !p ? '?' : !p.capturedAt ? 'no capture date' : !Number.isFinite(p.lat) ? 'no GPS' : 'GPS but no stop/day window'
    console.log(`   - ${u.photoId}: ${why}`)
  }

  const edges = []
  for (const c of mr.deviationClusters) {
    const dwellMin = clusterDwellMs(c.photoIds, photoById) / 60_000
    if (Math.abs(dwellMin - dwellGate) < 5) edges.push(`${c.id}: dwell ${dwellMin.toFixed(1)}min within 5min of the ${dwellGate}min gate`)
    if (Math.abs(c.distanceToRouteMeters - T.routeDeviationMeters) < 300) edges.push(`${c.id}: offRoute ${Math.round(c.distanceToRouteMeters)}m within 300m of the ${T.routeDeviationMeters}m gate`)
  }
  for (const m of mr.matches) {
    if (m.matchType === 'gps+time' && Number.isFinite(m.distanceMeters) && Math.abs(m.distanceMeters - T.gpsMatchMeters) < 100)
      edges.push(`${m.photoId}: gpsMatch ${Math.round(m.distanceMeters)}m within 100m of the ${T.gpsMatchMeters}m gate`)
  }
  console.log(edges.length
    ? `\n⚠ THRESHOLD-MARGINAL (tune candidates):\n   ${edges.join('\n   ')}`
    : `\n✓ No threshold-marginal decisions — every gate cleared with margin.`)
}

// ── Self-test: synthetic scenario so the report format is visible without real photos.
// Reuses the McComb→Terrell route + Vicksburg deviation proven in reconcileDraft.test.mjs.
function selfTest() {
  const day = '2026-04-20'
  const at = (h, m) => `${day}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`
  const trip = {
    id: 'self-test', title: 'Self-Test (McComb→Terrell)',
    dateRangeStart: day, dateRangeEnd: day,
    days: [{ n: 1, isoDate: day, date: day, title: 'MS → TX', stops: [
      { id: 'mccomb', time: '9:00 AM', name: 'McComb', lat: 31.244, lng: -90.454 },
      { id: 'terrell', time: '8:00 PM', name: "Buc-ee's Terrell", lat: 32.731, lng: -96.228 },
    ] }],
  }
  const photos = [
    // At McComb (morning) → gps+time happened.
    { id: 'mccomb-a', capturedAt: at(14, 0), lat: 31.2442, lng: -90.4541 },
    { id: 'mccomb-b', capturedAt: at(14, 6), lat: 31.2439, lng: -90.4538 },
    // Vicksburg cluster, 30-min dwell, >2km off route → auto-added.
    { id: 'vburg-1', capturedAt: at(16, 0), lat: 32.352, lng: -90.879 },
    { id: 'vburg-2', capturedAt: at(16, 12), lat: 32.3522, lng: -90.8788 },
    { id: 'vburg-3', capturedAt: at(16, 24), lat: 32.3518, lng: -90.8792 },
    { id: 'vburg-4', capturedAt: at(16, 30), lat: 32.3521, lng: -90.879 },
    // A no-GPS photo (excluded path is no-date; this one has a date but no GPS → time-only).
    { id: 'no-gps', capturedAt: at(15, 0), lat: null, lng: null },
    // Out-of-window (May) → excluded by the date filter.
    { id: 'wrong-month', capturedAt: '2026-05-09T15:00:00Z', lat: 32.0, lng: -90.0 },
  ]
  report(photos, trip)
}

async function main() {
  const [arg0, arg1] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  if (!arg0 || process.argv.includes('--self-test')) return selfTest()
  const trip = findTrip(arg1 || 'jackson-2026')
  if (!trip) {
    console.error(`No trip "${arg1 || 'jackson-2026'}" found in src/data/trips.js`)
    process.exit(1)
  }
  report(await decodeDir(arg0), trip)
}

main()
