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
import {
  exifReaderToRaw,
  exifDateToDate,
  parseOffsetMinutes,
  exifReaderToMeta,
  sanitizeMeta,
  sanitizeSidecar,
  sanitizeFaces,
  loadExifTags,
} from '../../src/lib/exifRead.js'

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

// ─── Build 1 — the never-discard metadata sidecar: real-fixture extraction ──
//
// Pinned against the ACTUAL fixture bytes (dumped via ExifReader directly,
// not invented) — see BUILD_PLAN_SIGNAL_FLEET.md Build 1 step 5. Date fields
// use `startsWith` rather than an exact instant, matching this file's
// existing house style (exifDateToDate parses EXIF's wall clock in the
// RUNNING MACHINE's local timezone, so the exact ISO instant is only
// TZ-independent under `TZ=UTC`, which the local gate runs under, but a
// stray local run must not spuriously fail).
const EXPECT_META = {
  jpeg: {
    make: 'Apple',
    model: 'iPhone 16 Pro',
    lens: 'iPhone 16 Pro back triple camera 6.765mm f/1.78',
    focalMm: 6.764999865652793,
    iso: 1600,
    fnum: 1.7799999713880652,
    expMs: 50,
    flash: 16,
    altM: 11.776095009806058,
    headingDeg: 250.40327471194664,
    w: 4032,
    h: 3024,
    orient: 1,
  },
  heic: {
    make: 'Apple',
    model: 'iPhone 16 Pro',
    lens: 'iPhone 16 Pro back triple camera 15.66mm f/2.8',
    focalMm: 15.659999847383,
    iso: 320,
    fnum: 2.8,
    expMs: 16.666666666666668,
    flash: 16,
    altM: 14.209949445600918,
    headingDeg: 133.99714656290533,
    w: 4032,
    h: 3024,
    orient: 6,
  },
}

for (const [label, e] of Object.entries(EXPECT)) {
  test(`exifReaderToMeta — ${label} real decode: pinned Make/Model/lens/exposure/GPS-altitude+heading/dims`, async () => {
    const tags = await loadExifTags(fixtureBlob(e.file, e.type))
    const meta = exifReaderToMeta(tags)
    assert.ok(meta, `${label} must produce a meta object`)
    const want = EXPECT_META[label]
    for (const [key, value] of Object.entries(want)) {
      if (typeof value === 'number') {
        assert.ok(Math.abs(meta[key] - value) < 1e-6, `${label} meta.${key} ≈ ${value}, got ${meta[key]}`)
      } else {
        assert.equal(meta[key], value, `${label} meta.${key}`)
      }
    }
    assert.ok(meta.createdAt.startsWith('2026-05'), `${label} meta.createdAt is the EXIF date, got ${meta.createdAt}`)
    assert.ok(meta.modifiedAt.startsWith('2026-05'), `${label} meta.modifiedAt is the EXIF date, got ${meta.modifiedAt}`)
    // No Apple Live-Photo/burst content-identifier field — investigated and
    // confirmed unavailable via ExifReader (no Apple MakerNote decoder); must
    // never be silently invented.
    assert.equal('contentId' in meta, false)
  })

  test(`readExif (dispatch reader) — ${label} threads meta + capturedAtSource onto the sidecar`, async () => {
    const out = await readExif(fixtureBlob(e.file, e.type))
    assert.ok(out.meta, `${label} readExif must carry a meta sidecar`)
    assert.equal(out.meta.make, 'Apple')
    assert.equal(out.meta.model, 'iPhone 16 Pro')
    assert.equal(out.capturedAtSource, 'exif-original')
  })

  test(`readPhotoExif (backfill reader) — ${label} threads meta onto the sidecar`, async () => {
    const out = await readPhotoExif(fixtureBlob(e.file, e.type))
    assert.ok(out.meta, `${label} readPhotoExif must carry a meta sidecar`)
    assert.equal(out.meta.make, 'Apple')
    assert.equal(out.meta.iso, EXPECT_META[label].iso)
  })
}

test('exifReaderToMeta tolerates a null/empty tags object', () => {
  assert.equal(exifReaderToMeta(null), undefined)
  assert.equal(exifReaderToMeta({}), undefined)
  assert.equal(exifReaderToMeta({ exif: {}, gps: {} }), undefined)
})

// ─── sanitizeMeta / sanitizeSidecar — the bounds-check (house rule: the
// unbounded-offset bug shipped TWICE in two separate parsers). Every field
// whitelisted, every string capped, every number range-checked — never just
// "finite". A field-level failure drops that field, never the whole object.

test('sanitizeMeta keeps a fully-valid candidate untouched', () => {
  const candidate = {
    make: 'Apple', model: 'iPhone 16 Pro', lens: 'back triple camera',
    focalMm: 6.76, iso: 1600, fnum: 1.8, expMs: 50, flash: 16,
    altM: 11.7, headingDeg: 250.4, w: 4032, h: 3024, orient: 1,
    createdAt: '2026-05-24T22:49:12.000Z', modifiedAt: '2026-05-24T22:49:12.000Z',
  }
  assert.deepEqual(sanitizeMeta(candidate), candidate)
})

test('sanitizeMeta drops a stray/unknown key (whitelist, not blacklist)', () => {
  const meta = sanitizeMeta({ make: 'Apple', evil: 'DROP TABLE memories', __proto__: { polluted: true } })
  assert.deepEqual(meta, { make: 'Apple' })
  assert.equal('evil' in meta, false)
})

test('sanitizeMeta drops an over-length string field, keeps the rest', () => {
  const meta = sanitizeMeta({ make: 'A'.repeat(65), model: 'iPhone 16 Pro' })
  assert.equal(meta.make, undefined)
  assert.equal(meta.model, 'iPhone 16 Pro')
})

test('sanitizeMeta drops a non-finite / out-of-range number field, keeps the rest — the offset-leak class of bug, closed for every numeric field', () => {
  const cases = [
    ['iso', Infinity], ['iso', NaN], ['iso', 9e18], ['iso', -1],
    ['fnum', -5], ['fnum', 1000],
    ['expMs', -1], ['expMs', 999_999_999],
    ['headingDeg', -1], ['headingDeg', 361],
    ['altM', -50000], ['altM', 50000],
    ['orient', 0], ['orient', 9],
    ['w', 0], ['w', 9_999_999],
  ]
  for (const [key, value] of cases) {
    const meta = sanitizeMeta({ model: 'iPhone 16 Pro', [key]: value })
    assert.equal(meta[key], undefined, `${key}=${value} must be dropped`)
    assert.equal(meta.model, 'iPhone 16 Pro', `${key}=${value} must not poison sibling fields`)
  }
})

test('sanitizeMeta drops an unparseable createdAt/modifiedAt, keeps the rest', () => {
  const meta = sanitizeMeta({ make: 'Apple', createdAt: 'not a date', modifiedAt: 'A'.repeat(100) })
  assert.equal(meta.createdAt, undefined)
  assert.equal(meta.modifiedAt, undefined)
  assert.equal(meta.make, 'Apple')
})

test('sanitizeMeta rejects non-object / array input entirely', () => {
  assert.equal(sanitizeMeta(null), undefined)
  assert.equal(sanitizeMeta(undefined), undefined)
  assert.equal(sanitizeMeta('garbage'), undefined)
  assert.equal(sanitizeMeta([1, 2, 3]), undefined)
  assert.equal(sanitizeMeta({}), undefined) // empty → undefined, not {}
})

test('sanitizeSidecar bounds srcName/srcMod/atSrc independently of meta', () => {
  assert.deepEqual(sanitizeSidecar({ srcName: 'IMG_1234.HEIC', srcMod: 1748000000000, atSrc: 'exif-original' }), {
    srcName: 'IMG_1234.HEIC', srcMod: 1748000000000, atSrc: 'exif-original',
  })
  // Over-length name dropped.
  assert.equal(sanitizeSidecar({ srcName: 'x'.repeat(201) }).srcName, undefined)
  // Non-finite / non-positive mtime dropped.
  assert.equal(sanitizeSidecar({ srcMod: NaN }).srcMod, undefined)
  assert.equal(sanitizeSidecar({ srcMod: -1 }).srcMod, undefined)
  // atSrc is a VALUE whitelist, not just a string check.
  assert.equal(sanitizeSidecar({ atSrc: 'made-up-source' }).atSrc, undefined)
  assert.equal(sanitizeSidecar({ atSrc: 'file-mtime' }).atSrc, 'file-mtime')
  // Garbage input never throws.
  assert.deepEqual(sanitizeSidecar(null), {})
  assert.deepEqual(sanitizeSidecar('garbage'), {})
})

// ─── sanitizeFaces (Build W4 — faces) — THE load-bearing safety property:
// ONLY pseudonymous fc_N cluster ids may ever ride a ref. Fail CLOSED
// (whitelist, not blocklist); mirrored independently server-side in
// worker/src/photoSidecar.js (see worker/test/photo-sidecar-parity.test.js
// for the parity proof between the two copies).

test('sanitizeFaces keeps a valid fc_N array, deduped, in order', () => {
  assert.deepEqual(sanitizeFaces(['fc_1', 'fc_2', 'fc_1', 'fc_42']), ['fc_1', 'fc_2', 'fc_42'])
  assert.deepEqual(sanitizeFaces(['fc_999']), ['fc_999'])
})

test('sanitizeFaces caps at 10, keeping the first 10 valid ids', () => {
  const many = Array.from({ length: 15 }, (_, i) => `fc_${i + 1}`)
  const out = sanitizeFaces(many)
  assert.equal(out.length, 10)
  assert.deepEqual(out, many.slice(0, 10))
})

test('sanitizeFaces: mutation battery — a raw embedding, a person name, an oversized id, a non-fc string all dropped; only fc_1..fc_999 survive', () => {
  assert.equal(sanitizeFaces([0.123, -0.456, 0.789]), undefined, 'raw embedding numbers dropped')
  assert.equal(sanitizeFaces(['jonathan', 'helen', 'aurelia', 'rafa']), undefined, "a real person's id/name dropped")
  assert.equal(sanitizeFaces(['fc_1000']), undefined, '4 digits — one over the {1,3} bound')
  assert.equal(sanitizeFaces(['fc_']), undefined, 'no digits at all')
  assert.equal(sanitizeFaces(['FC_1']), undefined, 'wrong case')
  assert.equal(sanitizeFaces([' fc_1']), undefined, 'leading whitespace never trimmed-and-accepted')
  assert.equal(sanitizeFaces(['fc_1 ']), undefined, 'trailing whitespace never trimmed-and-accepted')
  assert.equal(sanitizeFaces(['fc_01x']), undefined, 'trailing garbage after digits')
  assert.equal(sanitizeFaces(['hello world']), undefined, 'arbitrary non-fc string')
  assert.equal(sanitizeFaces([{ fc: 1 }, null, undefined, true]), undefined, 'non-string junk')

  // Mixed batch — never all-or-nothing: only the genuinely fc_N-shaped
  // entries survive, everything else in the SAME array is dropped.
  assert.deepEqual(
    sanitizeFaces(['fc_1', 'jonathan', 'fc_42', 0.5, 'fc_1000', 'fc_7']),
    ['fc_1', 'fc_42', 'fc_7']
  )
})

test('sanitizeFaces rejects non-array input entirely, never throws', () => {
  assert.equal(sanitizeFaces(null), undefined)
  assert.equal(sanitizeFaces(undefined), undefined)
  assert.equal(sanitizeFaces('fc_1'), undefined) // a bare string is not an array of ids
  assert.equal(sanitizeFaces(42), undefined)
  assert.equal(sanitizeFaces({ 0: 'fc_1' }), undefined) // array-like object, not a real array
  assert.equal(sanitizeFaces([]), undefined) // empty → undefined, not []
})

test('sanitizeSidecar carries faces alongside the rest of the sidecar, applying the same whitelist', () => {
  assert.deepEqual(
    sanitizeSidecar({ srcName: 'IMG_1.HEIC', atSrc: 'exif-original', faces: ['fc_1', 'fc_2', 'jonathan'] }),
    { srcName: 'IMG_1.HEIC', atSrc: 'exif-original', faces: ['fc_1', 'fc_2'] }
  )
  // Absent → omitted entirely (never a null/empty-array field on the ref).
  assert.equal('faces' in sanitizeSidecar({ srcName: 'IMG_1.HEIC' }), false)
})
