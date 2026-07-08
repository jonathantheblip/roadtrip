// resourceScan.js — the re-source scan mechanism (Album System Ch 04): read the
// ORIGINALS on a device, match to imported refs by capture instant, recover GPS +
// the capture offset. Tests the pure logic + the injected-IO runner. TZ-robust: the
// end-to-end case derives the ref's capturedAt the same local→UTC way the importer
// did, so it passes under any TZ (see deploy-verify note).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseOffsetMinutes,
  originalToRecovered,
  instantKey,
  buildRefIndex,
  matchRecovered,
  runResourceScan,
} from '../../src/lib/resourceScan.js'

test('parseOffsetMinutes: signed HH:MM → minutes', () => {
  assert.equal(parseOffsetMinutes('-04:00'), -240)
  assert.equal(parseOffsetMinutes('+05:30'), 330)
  assert.equal(parseOffsetMinutes('+00:00'), 0)
  assert.equal(parseOffsetMinutes('garbage'), null)
  assert.equal(parseOffsetMinutes(null), null)
})

test('originalToRecovered: capturedAt (UTC), gps, offset — omitting what is absent', () => {
  const full = originalToRecovered({
    DateTimeOriginal: new Date('2026-07-05T17:42:00.000Z'),
    GPSLatitude: 42.06,
    GPSLongitude: -70.16,
    OffsetTimeOriginal: '-04:00',
  })
  assert.equal(full.capturedAt, '2026-07-05T17:42:00.000Z')
  assert.equal(full.lat, 42.06)
  assert.equal(full.offsetMinutes, -240)
  const bare = originalToRecovered({ DateTimeOriginal: new Date('2026-07-05T17:42:00Z') })
  assert.equal('lat' in bare, false)
  assert.equal('offsetMinutes' in bare, false)
})

test('instantKey truncates to the second (import-ms vs recompute-no-ms never blocks)', () => {
  assert.equal(instantKey('2026-07-05T17:42:00.500Z'), '2026-07-05T17:42:00')
  assert.equal(instantKey('bad'), null)
})

test('buildRefIndex: indexes incomplete r2 refs; skips complete, masked, non-r2', () => {
  const idx = buildRefIndex([
    { id: 'm1', photoRefs: [{ key: 'k1', storage: 'r2', capturedAt: '2026-07-05T17:42:00Z' }] },
    { id: 'm2', photoRefs: [{ key: 'k2', storage: 'r2', capturedAt: '2026-07-05T18:00:00Z', lat: 1, lng: 2, offsetMinutes: -240 }] },
    { id: 'm3', masked: true, photoRefs: [{ key: 'k3', storage: 'r2', capturedAt: '2026-07-05T19:00:00Z' }] },
    { id: 'm4', photoRefs: [{ key: 'k4', storage: 'pending', capturedAt: '2026-07-05T20:00:00Z' }] },
  ])
  assert.equal(idx.size, 1)
  const e = idx.get('2026-07-05T17:42:00')[0]
  assert.equal(e.memoryId, 'm1')
  assert.equal(e.needsGps, true)
  assert.equal(e.needsOffset, true)
})

test('matchRecovered: fills a ref at the same instant; unplaced when none', () => {
  const idx = buildRefIndex([{ id: 'm1', photoRefs: [{ key: 'k1', storage: 'r2', capturedAt: '2026-07-05T17:42:00Z' }] }])
  const hit = matchRecovered({ capturedAt: '2026-07-05T17:42:00.000Z', lat: 42, lng: -70, offsetMinutes: -240 }, idx)
  assert.equal(hit.matched, true)
  assert.equal(hit.writes[0].lat, 42)
  assert.equal(hit.writes[0].offsetMinutes, -240)
  const miss = matchRecovered({ capturedAt: '2026-07-05T18:00:00Z', lat: 1, lng: 2 }, idx)
  assert.equal(miss.matched, false)
})

test('matchRecovered writes only the MISSING field (per-field idempotent)', () => {
  const idx = buildRefIndex([{ id: 'm1', photoRefs: [{ key: 'k1', storage: 'r2', capturedAt: '2026-07-05T17:42:00Z', lat: 1, lng: 2 }] }])
  const { writes } = matchRecovered({ capturedAt: '2026-07-05T17:42:00Z', lat: 9, lng: 9, offsetMinutes: -240 }, idx)
  assert.equal(writes.length, 1)
  assert.equal('lat' in writes[0], false) // gps already present → not re-written
  assert.equal(writes[0].offsetMinutes, -240)
})

test('runResourceScan end-to-end (injected IO): matched / unplaced / gpsFilled / offsetFilled', async () => {
  const cap = new Date(2026, 6, 5, 17, 42, 0).toISOString() // same construction the importer used
  const mems = [
    { id: 'm1', tripId: 't', photoRefs: [{ key: 'k1', storage: 'r2', capturedAt: cap }] },
    { id: 'm2', tripId: 't', photoRefs: [{ key: 'k2', storage: 'r2', capturedAt: new Date(2026, 6, 5, 18, 0, 0).toISOString() }] },
  ]
  const tags = {
    A: { exif: { DateTimeOriginal: { description: '2026:07:05 17:42:00' }, OffsetTimeOriginal: { description: '-04:00' } }, gps: { Latitude: 42, Longitude: -70 } },
    B: { exif: { DateTimeOriginal: { description: '2026:07:05 23:11:00' } }, gps: {} }, // matches nothing
  }
  const gps = []
  const off = []
  const stats = await runResourceScan({
    files: ['A', 'B'],
    memories: mems,
    loadTags: async (f) => tags[f],
    applyGps: (id, k, v) => gps.push({ id, k, v }),
    applyOffset: (id, k, o) => off.push({ id, k, o }),
  })
  assert.equal(stats.total, 2)
  assert.equal(stats.matched, 1)
  assert.equal(stats.unplaced, 1)
  assert.equal(stats.gpsFilled, 1)
  assert.equal(stats.offsetFilled, 1)
  assert.deepEqual(gps[0], { id: 'm1', k: 'k1', v: { lat: 42, lng: -70 } })
  assert.equal(off[0].o, -240)
})
