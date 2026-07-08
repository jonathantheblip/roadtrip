// resourceScan.js — the re-source scan MECHANISM (design: "Find your photos'
// locations", Album System Ch 04). The evolution of the Stage C-b Locate tool
// (gpsBackfill.js) that reads the STRIPPED uploaded copy — a dry well — this reads
// the ORIGINALS on the family member's phone, where GPS + the capture-time offset
// still live, matches each original to its imported memory by CAPTURE INSTANT, and
// fills in the recovered { lat, lng } + offsetMinutes additively.
//
// THE MATCH KEY. The imported ref's `capturedAt` was computed at import as
// exifDateToDate(DateTimeOriginal).toISOString(). We recompute it here the SAME way
// from the same original's EXIF, so — on the phone the photo came from — the two
// resolve to the identical instant. A near-miss (an edited/re-exported copy whose
// timestamp drifted) simply doesn't match: "unplaced", never a wrong write.
//
// All I/O is injected (loadTags / applyGps / applyOffset) so the engine unit-tests
// without real files or the DOM. Pure helpers (parseOffsetMinutes, originalToRecovered,
// buildRefIndex, matchRecovered) carry the logic.

import { exifReaderToRaw } from './exifRead.js'

// "-04:00" → -240 ; "+05:30" → 330 ; missing/invalid → null.
export function parseOffsetMinutes(offsetStr) {
  if (typeof offsetStr !== 'string') return null
  const m = offsetStr.trim().match(/^([+-])(\d{2}):(\d{2})$/)
  if (!m) return null
  const sign = m[1] === '-' ? -1 : 1
  const mins = sign * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10))
  return Number.isFinite(mins) ? mins : null
}

// EXIF raw (exifReaderToRaw output) → the fields we can recover from an original.
// capturedAt is the same instant the importer would have derived (the match key).
export function originalToRecovered(raw) {
  const out = {}
  if (raw?.DateTimeOriginal instanceof Date && !Number.isNaN(raw.DateTimeOriginal.getTime())) {
    out.capturedAt = raw.DateTimeOriginal.toISOString()
  }
  if (Number.isFinite(raw?.GPSLatitude) && Number.isFinite(raw?.GPSLongitude)) {
    out.lat = raw.GPSLatitude
    out.lng = raw.GPSLongitude
  }
  const off = parseOffsetMinutes(raw?.OffsetTimeOriginal)
  if (Number.isFinite(off)) out.offsetMinutes = off
  return out
}

// capturedAt (any ISO) → a second-precision key ("2026-07-05T17:42:00"), so import-ms
// vs recompute-no-ms never blocks a match. Invalid → null.
export function instantKey(capturedAt) {
  if (typeof capturedAt !== 'string') return null
  const t = Date.parse(capturedAt)
  return Number.isFinite(t) ? new Date(Math.floor(t / 1000) * 1000).toISOString().slice(0, 19) : null
}

// Index the LOCAL memories' real photo refs by capture instant → the refs at that
// instant, each tagged with what it still needs (GPS / offset). Masked memories are
// skipped entirely (a recovered field must never touch a hidden/surprise photo).
export function buildRefIndex(memories) {
  const idx = new Map()
  for (const m of memories || []) {
    if (!m || m.masked || m.deletedAt) continue
    const refs = []
    if (m.photoRef) refs.push(m.photoRef)
    if (Array.isArray(m.photoRefs)) refs.push(...m.photoRefs)
    for (const r of refs) {
      if (!r || r.storage !== 'r2' || !r.key || !r.capturedAt) continue
      const key = instantKey(r.capturedAt)
      if (!key) continue
      const needsGps = !(Number.isFinite(r.lat) && Number.isFinite(r.lng))
      const needsOffset = !Number.isFinite(r.offsetMinutes)
      if (!needsGps && !needsOffset) continue // already complete
      if (!idx.has(key)) idx.set(key, [])
      idx.get(key).push({ memoryId: m.id, refKey: r.key, tripId: m.tripId || null, needsGps, needsOffset })
    }
  }
  return idx
}

// Pair one recovered original to the ref(s) at its instant, returning the writes it
// enables. A recovered original with GPS fills every ref at that instant that lacks
// GPS; likewise its offset. Returns { matched:boolean, writes:[{memoryId,refKey,lat?,lng?,offsetMinutes?}] }.
export function matchRecovered(recovered, refIndex) {
  const key = instantKey(recovered?.capturedAt)
  const cands = key ? refIndex.get(key) : null
  if (!cands || !cands.length) return { matched: false, writes: [] }
  const writes = []
  for (const c of cands) {
    const w = { memoryId: c.memoryId, refKey: c.refKey }
    if (c.needsGps && Number.isFinite(recovered.lat) && Number.isFinite(recovered.lng)) {
      w.lat = recovered.lat
      w.lng = recovered.lng
    }
    if (c.needsOffset && Number.isFinite(recovered.offsetMinutes)) w.offsetMinutes = recovered.offsetMinutes
    if ('lat' in w || 'offsetMinutes' in w) writes.push(w)
  }
  return { matched: true, writes }
}

// Run the scan over a batch of device-original Files. Injected I/O:
//   files      — File[] the family granted (their originals)
//   memories   — the local memory set to match against
//   loadTags   — File → ExifReader tags (loadExifTags in production)
//   applyGps    — (memoryId, refKey, {lat,lng}) → void
//   applyOffset — (memoryId, refKey, offsetMinutes) → void
//   onProgress — ({ done, total, matched, gpsFilled, offsetFilled }) → void
//   signal     — optional AbortSignal (stop between files)
// Returns { total, matched, gpsFilled, offsetFilled, unplaced, perTrip }.
export async function runResourceScan({ files, memories, loadTags, applyGps, applyOffset, onProgress, signal } = {}) {
  const refIndex = buildRefIndex(memories)
  const list = Array.isArray(files) ? files : []
  const total = list.length
  const stats = { total, matched: 0, gpsFilled: 0, offsetFilled: 0, unplaced: 0, perTrip: {} }
  let done = 0
  for (const file of list) {
    if (signal?.aborted) break
    onProgress?.({ done, total, ...stats })
    let recovered = {}
    try {
      recovered = originalToRecovered(exifReaderToRaw(await loadTags(file)))
    } catch {
      recovered = {}
    }
    const { matched, writes } = matchRecovered(recovered, refIndex)
    if (!matched) {
      stats.unplaced += 1
    } else {
      stats.matched += 1
      for (const w of writes) {
        if (Number.isFinite(w.lat) && Number.isFinite(w.lng)) {
          applyGps?.(w.memoryId, w.refKey, { lat: w.lat, lng: w.lng })
          stats.gpsFilled += 1
        }
        if (Number.isFinite(w.offsetMinutes)) {
          applyOffset?.(w.memoryId, w.refKey, w.offsetMinutes)
          stats.offsetFilled += 1
        }
      }
    }
    done += 1
  }
  onProgress?.({ done, total, ...stats })
  return stats
}
