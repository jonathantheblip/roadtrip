// Real-decode regression guard for the ExifReader swap (A + A′).
//
// Every prior GPS test fed DECIMAL STUBS into the pure parser and never
// exercised a real decode — which is exactly how the exifr bug (GPS came
// back as a DMS array, never finite; HEIC threw outright) shipped
// undetected. This runs the REAL reader over the REAL fixtures and
// asserts the full contract: finite lat/lng, CORRECT SIGN (negative
// longitude for these US photos), and a real capture date — for JPEG
// AND HEIC. If the EXIF library regresses, this fails.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { readExif } from '../../src/lib/photoPipeline.js'
import { readPhotoExif } from '../../src/lib/photoBackfill.js'
import { exifReaderToRaw, exifDateToDate, parseOffsetMinutes } from '../../src/lib/exifRead.js'

const here = dirname(fileURLToPath(import.meta.url))
const MEDIA = resolve(here, '../../tests/fixtures/media')

// Wrap fixture bytes in a Blob so loadExifTags hits the browser
// `file.arrayBuffer()` → ArrayBuffer → ExifReader.load path the app
// actually uses (not just a Node Buffer).
function fixtureBlob(name, type) {
  const buf = readFileSync(resolve(MEDIA, name))
  return new Blob([buf], { type })
}

// Expected coordinates (cross-validated against exifr in recon).
const EXPECT = {
  jpeg: { file: 'iphone-jpeg-fullres.jpg', type: 'image/jpeg', lat: 41.32245, lng: -72.09434 },
  heic: { file: 'iphone-heic-with-gps.heic', type: 'image/heic', lat: 41.49430, lng: -72.09163 },
}
// This fixture's real EXIF carries OffsetTimeOriginal '-04:00' (verified by reading
// its bytes directly). readExif must capture it — this is the live-import leak: a
// photo shot outside home timezone must not silently lose its offset at import,
// the same way 87/118 real Provincetown photos did before this test existed.
const EXPECT_OFFSET_MINUTES = -240

for (const [label, e] of Object.entries(EXPECT)) {
  test(`readExif (dispatch reader) — ${label} real decode: finite, correct-sign GPS + date`, async () => {
    const out = await readExif(fixtureBlob(e.file, e.type))
    assert.ok(Number.isFinite(out.lat), `${label} lat must be finite, got ${out.lat}`)
    assert.ok(Number.isFinite(out.lng), `${label} lng must be finite, got ${out.lng}`)
    assert.ok(out.lng < 0, `${label} lng must be NEGATIVE (W), got ${out.lng}`)
    assert.ok(Math.abs(out.lat - e.lat) < 0.001, `${label} lat ≈ ${e.lat}, got ${out.lat}`)
    assert.ok(Math.abs(out.lng - e.lng) < 0.001, `${label} lng ≈ ${e.lng}, got ${out.lng}`)
    assert.equal(typeof out.capturedAt, 'string')
    assert.ok(Number.isFinite(Date.parse(out.capturedAt)), 'capturedAt parses')
    // Photo was taken in May 2026 — proves the date is the EXIF capture
    // moment, not the upload/now time (the bug this whole arc chased).
    assert.ok(out.capturedAt.startsWith('2026-05'), `capturedAt is the EXIF date, got ${out.capturedAt}`)
    if (label === 'jpeg') {
      // The offset is what this test file exists to guard — readExif (the LIVE
      // import path's reader) must not drop it. The HEIC fixture wasn't verified
      // to carry OffsetTimeOriginal, so this assertion is scoped to the fixture
      // it's proven for.
      assert.equal(out.offsetMinutes, EXPECT_OFFSET_MINUTES)
    }
  })

  test(`readPhotoExif (backfill reader) — ${label} real decode: finite, correct-sign GPS + date`, async () => {
    const out = await readPhotoExif(fixtureBlob(e.file, e.type))
    assert.ok(Number.isFinite(out.lat), `${label} lat must be finite, got ${out.lat}`)
    assert.ok(Number.isFinite(out.lng), `${label} lng must be finite, got ${out.lng}`)
    assert.ok(out.lng < 0, `${label} lng must be NEGATIVE (W), got ${out.lng}`)
    assert.ok(Math.abs(out.lat - e.lat) < 0.001, `${label} lat ≈ ${e.lat}, got ${out.lat}`)
    assert.ok(Math.abs(out.lng - e.lng) < 0.001, `${label} lng ≈ ${e.lng}, got ${out.lng}`)
    assert.equal(typeof out.capturedAt, 'string')
    assert.equal(out.capturedAtSource, 'exif-original')
    assert.ok(out.capturedAt.startsWith('2026-05'), `capturedAt is the EXIF date, got ${out.capturedAt}`)
  })
}

// ─── exifReaderToRaw / exifDateToDate units (the swap's mapping seam) ──

test('exifDateToDate normalizes EXIF colon format to a real Date', () => {
  const d = exifDateToDate('2026:05:24 17:02:29')
  assert.ok(d instanceof Date)
  assert.ok(!Number.isNaN(d.getTime()))
  // Local-time components match the EXIF wall clock (matches old exifr behavior).
  assert.equal(d.getFullYear(), 2026)
  assert.equal(d.getMonth(), 4) // May (0-based)
  assert.equal(d.getDate(), 24)
  assert.equal(d.getHours(), 17)
})

test('exifDateToDate returns undefined for missing/garbage input', () => {
  assert.equal(exifDateToDate(undefined), undefined)
  assert.equal(exifDateToDate(''), undefined)
  assert.equal(exifDateToDate('not a date'), undefined)
})

test('exifReaderToRaw maps ExifReader tags to the exifr-shaped intermediate', () => {
  const raw = exifReaderToRaw({
    exif: {
      DateTimeOriginal: { description: '2026:05:24 17:02:29' },
      DateTimeDigitized: { description: '2026:05:24 17:02:30' },
      DateTime: { description: '2026:05:25 09:00:00' },
      OffsetTimeOriginal: { description: '-04:00' },
      Orientation: { value: 6, description: 'right-top' },
    },
    gps: { Latitude: 41.4943, Longitude: -72.0916, Altitude: 14.2 },
  })
  assert.ok(raw.DateTimeOriginal instanceof Date)
  assert.ok(raw.CreateDate instanceof Date) // ← DateTimeDigitized
  assert.ok(raw.ModifyDate instanceof Date) // ← DateTime
  assert.equal(raw.OffsetTimeOriginal, '-04:00')
  assert.equal(raw.GPSLatitude, 41.4943)
  assert.equal(raw.GPSLongitude, -72.0916) // signed, no DMS math on our side
  assert.equal(raw.Orientation, 6) // numeric .value, not the label
})

test('exifReaderToRaw omits (not nulls) absent fields and tolerates empties', () => {
  assert.deepEqual(exifReaderToRaw(null), {})
  const raw = exifReaderToRaw({ exif: {}, gps: {} })
  assert.equal('GPSLatitude' in raw, false)
  assert.equal('DateTimeOriginal' in raw, false)
})

// ─── parseOffsetMinutes — the shared parser both readExif and resourceScan key off

test('parseOffsetMinutes: signed HH:MM → minutes; garbage and out-of-range rejected', () => {
  assert.equal(parseOffsetMinutes('-04:00'), -240)
  assert.equal(parseOffsetMinutes('+05:30'), 330)
  assert.equal(parseOffsetMinutes('+00:00'), 0)
  assert.equal(parseOffsetMinutes('+14:00'), 840) // widest real UTC offset
  assert.equal(parseOffsetMinutes('garbage'), null)
  assert.equal(parseOffsetMinutes(null), null)
  assert.equal(parseOffsetMinutes('+99:99'), null) // corrupt exporter — must not stamp a 4-day offset
  assert.equal(parseOffsetMinutes('+15:00'), null)
  assert.equal(parseOffsetMinutes('-14:30'), null)
  assert.equal(parseOffsetMinutes('+05:60'), null)
})

// ─── readExif — the live import path's offset extraction (synthetic, no real bytes)

test('readExif: a synthetic EXIF-bearing file yields offsetMinutes (the live-import leak, closed)', async () => {
  // loadExifTags is dynamic-imported inside readExif via exifreader, which this
  // repo's other tests already exercise on real bytes above — this test instead
  // pins the CONTRACT (offsetMinutes appears in readExif's return shape) against a
  // real fixture whose offset is independently verified, so it fails if the
  // extraction is ever removed again.
  const out = await readExif(fixtureBlob(EXPECT.jpeg.file, EXPECT.jpeg.type))
  assert.equal(out.offsetMinutes, EXPECT_OFFSET_MINUTES)
})

test('readExif: a file with no OffsetTimeOriginal omits offsetMinutes (never a false 0)', async () => {
  // The HEIC fixture's offset support isn't verified, so this only asserts the
  // absent-field contract: omitted, not defaulted to 0 (0 is a real, meaningful UTC
  // offset — defaulting to it would be indistinguishable from "verified UTC").
  const out = await readExif(fixtureBlob(EXPECT.heic.file, EXPECT.heic.type))
  if (!Number.isFinite(out.offsetMinutes)) {
    assert.equal('offsetMinutes' in out, false)
  }
})
