// Tests for the upload helper. The heavy lifting (saveAsset to IDB,
// pushMemory to the worker) is exercised end-to-end in Playwright;
// this file focuses on the pure mergeRefIntoExisting dedup logic
// behind the re-attach case, since silent dedup bugs would create
// duplicate refs on every retry. (photoBackfillUpload.js itself can't be
// imported under plain `node --test` — its OTHER imports use extensionless
// specifiers Vite resolves but Node's ESM loader doesn't — so the pure
// ref-building helpers it uses live in photoRefMerge.js instead, and are
// imported directly here.)

import { test } from 'node:test'
import assert from 'node:assert/strict'

const { mergeRefIntoExisting, buildReattachRef, entrySidecar, buildNewPhotoBaseRef, buildNewVideoBaseRef } =
  await import('../../src/lib/photoRefMerge.js')

test('mergeRefIntoExisting: empty existing returns just the new ref', () => {
  const merged = mergeRefIntoExisting({}, { key: 'photo_new', storage: 'idb' })
  assert.deepEqual(merged, [{ key: 'photo_new', storage: 'idb' }])
})

test('mergeRefIntoExisting: appends to existing photoRefs array', () => {
  const existing = {
    photoRefs: [{ key: 'old1', storage: 'r2' }],
  }
  const merged = mergeRefIntoExisting(existing, { key: 'photo_new', storage: 'idb' })
  assert.equal(merged.length, 2)
  assert.equal(merged[0].key, 'old1')
  assert.equal(merged[1].key, 'photo_new')
})

test('mergeRefIntoExisting: does not duplicate when new ref already present', () => {
  const existing = {
    photoRefs: [{ key: 'photo_new', storage: 'r2' }],
  }
  const merged = mergeRefIntoExisting(existing, { key: 'photo_new', storage: 'idb' })
  assert.equal(merged.length, 1)
  assert.equal(merged[0].storage, 'r2', 'preserves existing ref form on conflict')
})

test('mergeRefIntoExisting: folds legacy photoRef into the array', () => {
  const existing = {
    photoRefs: [{ key: 'old1', storage: 'r2' }],
    photoRef: { key: 'old-legacy', storage: 'r2' },
  }
  const merged = mergeRefIntoExisting(existing, { key: 'photo_new', storage: 'idb' })
  const keys = merged.map((r) => r.key)
  assert.deepEqual(keys, ['old1', 'old-legacy', 'photo_new'])
})

test('mergeRefIntoExisting: legacy photoRef already in photoRefs is not duplicated', () => {
  const existing = {
    photoRefs: [{ key: 'old1', storage: 'r2' }],
    photoRef: { key: 'old1', storage: 'r2' },
  }
  const merged = mergeRefIntoExisting(existing, { key: 'new', storage: 'idb' })
  const keys = merged.map((r) => r.key)
  assert.deepEqual(keys, ['old1', 'new'])
})

test('mergeRefIntoExisting: skips null entries in existing photoRefs', () => {
  const existing = { photoRefs: [null, { key: 'old', storage: 'r2' }, null] }
  const merged = mergeRefIntoExisting(existing, { key: 'new', storage: 'idb' })
  assert.equal(merged.length, 2)
  assert.equal(merged[0].key, 'old')
  assert.equal(merged[1].key, 'new')
})

// ── regression: the never-discard sidecar SURVIVES the reattach + merge path ──
//
// This project was already burned once (commit da2e0b7) by exactly this bug
// class: a value computed correctly earlier in the reattach branch but
// silently missing from the ref LITERAL before mergeRefIntoExisting ran (that
// time it was offsetMinutes). buildReattachRef is the exact literal the
// reattach branch in photoBackfillUpload.js builds — extracted so it's
// provable here without the IDB/canvas pipeline. Mutation-test candidate:
// temporarily delete the `...entrySidecar(entry)` spread (or the lat/lng/
// offsetMinutes lines) from buildReattachRef in photoRefMerge.js and confirm
// this test goes red.

test('buildReattachRef: carries GPS + offset + the full Build 1 sidecar onto the ref literal', () => {
  const entry = {
    file: { name: 'IMG_0007.HEIC', lastModified: 1700000000000 },
    exif: {
      capturedAtSource: 'exif-original',
      meta: { make: 'Apple', model: 'iPhone 14 Pro', orient: 6 },
    },
  }
  const ref = buildReattachRef({
    entry, assetKey: 'photo_abc123', mime: 'image/heic',
    capturedAt: '2026-05-23T10:00:00.000Z', lat: 41.3, lng: -72.1, offsetMinutes: -240,
  })
  assert.equal(ref.lat, 41.3)
  assert.equal(ref.lng, -72.1)
  assert.equal(ref.offsetMinutes, -240)
  assert.deepEqual(ref.meta, { make: 'Apple', model: 'iPhone 14 Pro', orient: 6 })
  assert.equal(ref.srcName, 'IMG_0007.HEIC')
  assert.equal(ref.srcMod, 1700000000000)
  assert.equal(ref.atSrc, 'exif-original')
})

test('buildReattachRef + mergeRefIntoExisting: every field SURVIVES the reattach merge into an existing metadata-only record', () => {
  const entry = {
    file: { name: 'IMG_0007.HEIC', lastModified: 1700000000000 },
    exif: {
      capturedAtSource: 'exif-original',
      meta: { make: 'Apple', model: 'iPhone 14 Pro', orient: 6 },
    },
  }
  const ref = buildReattachRef({
    entry, assetKey: 'photo_abc123', mime: 'image/heic',
    capturedAt: '2026-05-23T10:00:00.000Z', lat: 41.3, lng: -72.1, offsetMinutes: -240,
  })
  // The existing record is a metadata-only row (the vb3-4 case): D1 knew
  // about this photo's capture but had no bytes until this reattach.
  const existing = { id: 'mem1', photoRefs: [] }
  const merged = mergeRefIntoExisting(existing, ref)
  assert.equal(merged.length, 1)
  const out = merged[0]
  assert.equal(out.key, 'photo_abc123')
  assert.equal(out.lat, 41.3, 'GPS survives the merge')
  assert.equal(out.lng, -72.1, 'GPS survives the merge')
  assert.equal(out.offsetMinutes, -240, 'the capture-offset survives the merge (da2e0b7 bug class)')
  assert.deepEqual(out.meta, { make: 'Apple', model: 'iPhone 14 Pro', orient: 6 }, 'the sidecar meta survives the merge')
  assert.equal(out.srcName, 'IMG_0007.HEIC', 'the sidecar srcName survives the merge')
  assert.equal(out.srcMod, 1700000000000, 'the sidecar srcMod survives the merge')
  assert.equal(out.atSrc, 'exif-original', 'the sidecar atSrc survives the merge')
})

test('buildReattachRef: an entry with no EXIF meta / GPS / offset omits those keys entirely (never a false value)', () => {
  const entry = { file: { name: 'plain.jpg', lastModified: 1000 }, exif: {} }
  const ref = buildReattachRef({
    entry, assetKey: 'photo_bare', mime: 'image/jpeg',
    capturedAt: null, lat: null, lng: null, offsetMinutes: null,
  })
  assert.equal('lat' in ref, false)
  assert.equal('lng' in ref, false)
  assert.equal('offsetMinutes' in ref, false)
  assert.equal('meta' in ref, false)
  assert.equal(ref.srcName, 'plain.jpg', 'srcName/srcMod still ride — they come off the File, not EXIF')
  assert.equal(ref.srcMod, 1000)
})

test('entrySidecar: bounds/whitelist still apply on the reattach path (a garbage meta field never rides)', () => {
  const entry = {
    file: { name: 'IMG_0008.HEIC', lastModified: 2000 },
    exif: { meta: { make: 'Apple', iso: 99999999 } }, // iso wildly out of [0, 500000]
  }
  const sc = entrySidecar(entry)
  assert.equal(sc.meta.make, 'Apple')
  assert.equal('iso' in sc.meta, false, 'an out-of-range number is dropped, not the whole meta object')
})

// ── regression: Blocker 1 — the Share Composer path threads GPS + the full
// sidecar exactly like the bulk importer, for BOTH new photos and new videos ──
//
// composerImport.js's saveImportedMedia() used to build a bare { file } / {
// encoded } entry with no `.exif` at all, so entrySidecar always saw an empty
// sidecar on this surface even though readExifForImport/extractVideoCreationDate
// had already computed it — and the video branch never even read vmeta.lat/
// vmeta.lng into its exif object in the first place. buildNewPhotoBaseRef /
// buildNewVideoBaseRef are the EXACT baseRef literals uploadOrQueueNewPhoto /
// uploadOrQueueVideo build (in photoBackfillUpload.js) for every caller,
// including the composer's saveImportedMedia — so proving these carry the
// full sidecar here proves the composer path does too, without needing the
// Worker/IDB/canvas pipeline. Mutation-test candidate: change either builder
// back to a bare literal missing `...entrySidecar(entry)` and confirm these
// go red.

test('buildNewPhotoBaseRef: carries GPS + offset + the full sidecar for a brand-new photo (bulk import AND composer import)', () => {
  const entry = {
    file: { name: 'IMG_0099.HEIC', lastModified: 1700000001000 },
    exif: { capturedAtSource: 'exif-original', meta: { make: 'Apple', model: 'iPhone 15 Pro' } },
  }
  const ref = buildNewPhotoBaseRef({
    entry, mime: 'image/heic', capturedAt: '2026-05-23T10:00:00.000Z',
    lat: 41.3, lng: -72.1, offsetMinutes: -240,
  })
  assert.equal(ref.lat, 41.3)
  assert.equal(ref.lng, -72.1)
  assert.equal(ref.offsetMinutes, -240)
  assert.deepEqual(ref.meta, { make: 'Apple', model: 'iPhone 15 Pro' })
  assert.equal(ref.srcName, 'IMG_0099.HEIC')
  assert.equal(ref.srcMod, 1700000001000)
  assert.equal(ref.atSrc, 'exif-original')
})

test('buildNewVideoBaseRef: carries GPS + offset + the sidecar for a brand-new video (the composer\'s previously-dropped vmeta.lat/lng)', () => {
  const entry = {
    file: { name: 'IMG_0100.MOV', lastModified: 1700000002000 },
    exif: {}, // a video's exif never carries `.meta` — its own EXIF reader doesn't apply to containers
    encoded: { mime: 'video/mp4', width: 1920, height: 1080, durationMs: 4000, blob: { size: 12345 }, sound: 'carried' },
  }
  const ref = buildNewVideoBaseRef({
    entry, capturedAt: '2026-05-23T10:05:00.000Z',
    lat: 41.32, lng: -72.09, offsetMinutes: -240, // the coordinates extractVideoCreationDate's Keys/Values scan recovers
  })
  assert.equal(ref.lat, 41.32, 'a located video is no longer GPS-blind through the composer')
  assert.equal(ref.lng, -72.09)
  assert.equal(ref.offsetMinutes, -240)
  assert.equal(ref.bytes, 12345)
  assert.equal(ref.sound, 'carried')
  assert.equal('meta' in ref, false, 'a video naturally has no EXIF meta — never a false object')
  assert.equal(ref.srcName, 'IMG_0100.MOV', 'srcName/srcMod still ride off the File, independent of .exif')
  assert.equal(ref.srcMod, 1700000002000)
})

test('buildNewPhotoBaseRef / buildNewVideoBaseRef: a coordless/offsetless entry omits those keys entirely (never a stamped 0)', () => {
  const photoRef = buildNewPhotoBaseRef({
    entry: { file: { name: 'plain.jpg', lastModified: 1 }, exif: {} },
    mime: 'image/jpeg', capturedAt: null, lat: null, lng: null, offsetMinutes: null,
  })
  assert.equal('lat' in photoRef, false)
  assert.equal('lng' in photoRef, false)
  assert.equal('offsetMinutes' in photoRef, false)

  const videoRef = buildNewVideoBaseRef({
    entry: { file: { name: 'plain.mov', lastModified: 1 }, encoded: {} },
    capturedAt: null, lat: null, lng: null, offsetMinutes: null,
  })
  assert.equal('lat' in videoRef, false)
  assert.equal('lng' in videoRef, false)
  assert.equal('offsetMinutes' in videoRef, false)
  assert.equal(videoRef.bytes, null, 'no encoded blob → bytes is explicitly null, never a false 0')
  assert.equal(videoRef.sound, null)
})
