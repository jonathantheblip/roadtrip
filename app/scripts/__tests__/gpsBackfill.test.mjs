import { test } from 'node:test'
import assert from 'node:assert/strict'

const { collectCandidateRefs, runGpsBackfill } = await import('../../src/lib/gpsBackfill.js')

// ── collectCandidateRefs ──────────────────────────────────────────────────

const r2 = (key, url, extra = {}) => ({ storage: 'r2', key, url, ...extra })

test('collectCandidateRefs: only R2-backed, coordless, visible refs — deduped by key', () => {
  const mems = [
    { id: 'm1', tripId: 't1', photoRef: r2('k1', 'u1') },                       // candidate
    { id: 'm2', tripId: 't1', photoRef: r2('k2', 'u2', { lat: 40, lng: -75 }) },// has GPS → skip
    { id: 'm3', tripId: 't1', photoRef: { storage: 'pending', key: 'k3', url: 'u3' } }, // not uploaded → skip
    { id: 'm4', tripId: 't2', photoRefs: [r2('k4', 'u4'), r2('k5', 'u5', { lat: 1, lng: 2 })] }, // k4 only
    { id: 'm5', tripId: 't2', masked: true, photoRef: r2('k6', 'u6') },         // masked → skip
    { id: 'm6', tripId: 't2', deletedAt: 'x', photoRef: r2('k7', 'u7') },       // tombstone → skip
    { id: 'm7', tripId: 't2', photoRef: r2('k1', 'u1dup') },                    // dup key → skip
  ]
  const got = collectCandidateRefs(mems).map((c) => c.refKey).sort()
  assert.deepEqual(got, ['k1', 'k4'])
})

// ── runGpsBackfill ────────────────────────────────────────────────────────

// In-memory localStorage stub.
function memStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  }
}
// loadTags stub: extractGps hands it an ArrayBuffer (ExifReader's input); the
// first byte marker says whether this asset carries GPS.
const loadTags = async (ab) =>
  new Uint8Array(ab)[0] === 1 ? { gps: { Latitude: 40.1, Longitude: -75.2 } } : {}
// fetchImpl stub: url → a Response-like with an arrayBuffer (no stream → fallback path).
function fetcher(gpsUrls, failUrls = new Set()) {
  return async (url) => {
    if (failUrls.has(url)) return { ok: false, status: 503 }
    const marker = gpsUrls.has(url) ? 1 : 0
    return { ok: true, arrayBuffer: async () => new Uint8Array([marker, 9, 9, 9]).buffer }
  }
}

const twoTrips = () => [
  { id: 'm1', tripId: 't1', photoRef: r2('k1', 'u1') }, // GPS
  { id: 'm2', tripId: 't1', photoRef: r2('k2', 'u2') }, // no GPS
  { id: 'm3', tripId: 't2', photoRefs: [r2('k3', 'u3')] }, // GPS
]

test('runGpsBackfill: applies coords only where EXIF survived; tallies per trip; marks all examined', async () => {
  const storage = memStorage()
  const applied = []
  const res = await runGpsBackfill({
    memories: twoTrips(),
    fetchImpl: fetcher(new Set(['u1', 'u3'])),
    loadTags,
    apply: (memoryId, refKey, gps) => applied.push({ memoryId, refKey, ...gps }),
    storage,
  })
  assert.equal(res.found, 2)
  assert.equal(res.total, 3)
  assert.deepEqual(res.perTrip, { t1: 1, t2: 1 })
  assert.deepEqual(applied, [
    { memoryId: 'm1', refKey: 'k1', lat: 40.1, lng: -75.2 },
    { memoryId: 'm3', refKey: 'k3', lat: 40.1, lng: -75.2 },
  ])
  // All three refs are remembered (found OR honestly empty).
  assert.deepEqual(JSON.parse(storage.getItem('rt_gps_backfill_checked_v1')).sort(), ['k1', 'k2', 'k3'])
})

test('runGpsBackfill: a resume run skips everything already examined — no re-fetch, no re-apply', async () => {
  const storage = memStorage()
  const f = fetcher(new Set(['u1', 'u3']))
  await runGpsBackfill({ memories: twoTrips(), fetchImpl: f, loadTags, apply: () => {}, storage })
  let calls = 0
  const applied = []
  const res = await runGpsBackfill({
    memories: twoTrips(),
    fetchImpl: async (u) => { calls += 1; return f(u) },
    loadTags,
    apply: (id, k, g) => applied.push({ id, k, ...g }),
    storage,
  })
  assert.equal(res.total, 3) // still three candidates in the set…
  assert.equal(res.found, 0) // …but none re-examined
  assert.equal(calls, 0, 'no asset was re-fetched on resume')
  assert.equal(applied.length, 0)
})

test('runGpsBackfill: a fetch error is NOT marked checked — it retries on the next run', async () => {
  const storage = memStorage()
  // u2 fails this run.
  const res1 = await runGpsBackfill({
    memories: twoTrips(),
    fetchImpl: fetcher(new Set(['u1', 'u3']), new Set(['u2'])),
    loadTags, apply: () => {}, storage,
  })
  assert.equal(res1.found, 2)
  const checked1 = JSON.parse(storage.getItem('rt_gps_backfill_checked_v1'))
  assert.ok(!checked1.includes('k2'), 'the failed ref stayed unchecked')
  // Next run, u2 now succeeds (and has GPS) → recovered.
  const applied = []
  const res2 = await runGpsBackfill({
    memories: twoTrips(),
    fetchImpl: fetcher(new Set(['u1', 'u2', 'u3'])),
    loadTags, apply: (id, k, g) => applied.push(k), storage,
  })
  assert.equal(res2.found, 1) // only k2 was still pending
  assert.deepEqual(applied, ['k2'])
})

test('runGpsBackfill: a permanent 404 IS marked checked — a deleted asset is not re-fetched forever', async () => {
  const storage = memStorage()
  const base = fetcher(new Set(['u1', 'u3']))
  const with404 = async (url) => (url === 'u2' ? { ok: false, status: 404 } : base(url))
  await runGpsBackfill({ memories: twoTrips(), fetchImpl: with404, loadTags, apply: () => {}, storage })
  const checked = JSON.parse(storage.getItem('rt_gps_backfill_checked_v1'))
  assert.ok(checked.includes('k2'), 'the 404 (deleted) ref was marked checked — permanent, not retried')
  // A resume never re-fetches the gone asset.
  let refetched = false
  await runGpsBackfill({
    memories: twoTrips(),
    fetchImpl: async (u) => { if (u === 'u2') refetched = true; return with404(u) },
    loadTags, apply: () => {}, storage,
  })
  assert.equal(refetched, false, 'the deleted asset is never re-fetched on resume')
})

test('runGpsBackfill: an aborted signal stops the pass', async () => {
  const storage = memStorage()
  const signal = { aborted: true }
  let calls = 0
  const res = await runGpsBackfill({
    memories: twoTrips(),
    fetchImpl: async (u) => { calls += 1; return { ok: true, arrayBuffer: async () => new Uint8Array([1]).buffer } },
    loadTags, apply: () => {}, storage, signal,
  })
  assert.equal(calls, 0)
  assert.equal(res.found, 0)
})

test('runGpsBackfill: streaming fetch reads a bounded head and cancels the download', async () => {
  const storage = memStorage()
  let cancelled = false
  let reads = 0
  // A body that would stream forever if not cancelled; each chunk is 64 KB.
  const streamingFetch = async () => ({
    ok: true,
    body: {
      getReader: () => ({
        read: async () => {
          reads += 1
          return { done: false, value: new Uint8Array(64 * 1024).fill(reads === 1 ? 1 : 0) }
        },
        cancel: async () => { cancelled = true },
      }),
    },
  })
  const applied = []
  const res = await runGpsBackfill({
    memories: [{ id: 'm1', tripId: 't1', photoRef: r2('k1', 'u1') }],
    fetchImpl: streamingFetch,
    loadTags,
    apply: (id, k, g) => applied.push(k),
    storage,
    headBytes: 256 * 1024,
  })
  assert.equal(cancelled, true, 'the download was cancelled after the head')
  assert.ok(reads <= 5, 'stopped after ~256KB of 64KB chunks, not the whole stream')
  assert.equal(res.found, 1) // first chunk marker=1 → GPS
  assert.deepEqual(applied, ['k1'])
})

// ── real-EXIF chain: the engine recovers a real fixture photo's coords ──────

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadExifTags } from '../../src/lib/exifRead.js' // the REAL reader

test('runGpsBackfill: real ExifReader recovers a real full-res JPEG fixture\'s GPS from its head bytes', async () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const buf = readFileSync(resolve(here, '../../tests/fixtures/media/iphone-jpeg-fullres.jpg'))
  // A clean ArrayBuffer of exactly the file (a Node Buffer's .buffer is a shared pool).
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  const storage = memStorage()
  const applied = []
  const res = await runGpsBackfill({
    memories: [{ id: 'm1', tripId: 't1', photoRef: { storage: 'r2', key: 'k1', url: 'u1' } }],
    fetchImpl: async () => ({ ok: true, arrayBuffer: async () => ab }), // no stream → head-slice fallback
    loadTags: loadExifTags, // REAL exifreader
    apply: (id, k, gps) => applied.push(gps),
    storage,
    headBytes: 256 * 1024, // only the first 256KB of the 2.8MB original is read
  })
  assert.equal(res.found, 1)
  assert.ok(Math.abs(applied[0].lat - 41.32245) < 0.001, `lat ${applied[0].lat}`)
  assert.ok(Math.abs(applied[0].lng - -72.09434) < 0.001, `lng ${applied[0].lng}`)
})
