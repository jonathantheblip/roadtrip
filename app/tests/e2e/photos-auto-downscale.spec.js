import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'
import { bigPhotoFile } from './_fixtures/photoFixtures.js'
import { WEBKIT_IDB_BLOB_REASON } from './_fixtures/webkitIdbBlobGate.js'

// Pri 1 structural fix — saveAsset auto-runs preparePhotoForUpload for
// photo kind. Pre-fix, ThreadedMemories.savePhotoAlbum bypassed the
// pipeline and stored full-resolution iPhone JPEGs in IDB → R2, causing
// iOS Safari to render black tiles when several were on screen at once
// (decoded RGBA exceeded the per-tab graphics budget).
//
// This test calls saveAsset directly inside the page (skipping any UI
// rigmarole) with a 3000x2250 fixture and asserts the stored blob is
// (a) image/jpeg, not the input PNG, and (b) at or under 2048 on the
// longest edge. Both conditions only pass if preparePhotoForUpload
// actually ran during save.
//
// Skipped on Playwright webkit-mobile: saveAsset's IDB write trips the
// same R4 IDB+Blob bug (`IDBObjectStore.put({...blob})` fails with
// "Error preparing Blob/File data to be stored in object store"). The
// carryover hypothesis attributed R2 to Vite dev-server URL resolution
// for the in-page dynamic import; investigation showed the import works
// after switching to a window-global hook, but the underlying saveAsset
// then fails at the same IDB+Blob layer R4 hit. Real iOS Safari handles
// this cleanly; the Simulator gate's offline-drain.test.mjs covers
// IDB+Blob storage on the iOS-real surface.

test('saveAsset auto-downscales photo input to JPEG at PHOTO_MAX_EDGE', async ({
  page,
  browserName,
}) => {
  test.skip(browserName === 'webkit', WEBKIT_IDB_BLOB_REASON)
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')

  // Wait for the app to mount.
  await expect(page.getByRole('button', { name: /Modify this trip with Claude/i })).toBeVisible()

  const big = bigPhotoFile({ width: 3000, height: 2250 })
  // Round-trip the buffer through the page so we can hand it to a
  // File constructor in the browser context.
  const bufferB64 = big.buffer.toString('base64')

  const result = await page.evaluate(
    async ({ name, mimeType, b64 }) => {
      const { saveAsset, makeAssetKey, loadAsset } = await import('/src/lib/memAssets.js')
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const file = new File([bin], name, { type: mimeType })
      const key = makeAssetKey('photo')
      const saved = await saveAsset('photo', key, file, file.type)
      const stored = await loadAsset('photo', key)
      // Decode the stored blob to read its actual pixel dimensions.
      const bitmap = await createImageBitmap(stored)
      return {
        savedMime: saved.mime,
        preparedExists: !!saved.prepared,
        preparedWidth: saved.prepared?.width || null,
        preparedHeight: saved.prepared?.height || null,
        storedBytes: stored.size,
        storedMime: stored.type,
        decodedWidth: bitmap.width,
        decodedHeight: bitmap.height,
      }
    },
    { name: big.name, mimeType: big.mimeType, b64: bufferB64 }
  )

  // The pipeline must have run.
  expect(result.preparedExists).toBe(true)

  // Stored bytes must be JPEG, not the PNG input.
  expect(result.storedMime).toBe('image/jpeg')
  expect(result.savedMime).toBe('image/jpeg')

  // Longest edge must be at or under PHOTO_MAX_EDGE (2048).
  const longestEdge = Math.max(result.decodedWidth, result.decodedHeight)
  expect(longestEdge).toBeLessThanOrEqual(2048)

  // 3000x2250 → 2048x1536 — exact ratio preserved.
  expect(result.decodedWidth).toBe(2048)
  expect(result.decodedHeight).toBe(1536)

  // The prepared metadata should match the decoded dimensions.
  expect(result.preparedWidth).toBe(2048)
  expect(result.preparedHeight).toBe(1536)
})

test('saveAsset({ raw: true }) preserves input bytes for opt-out callers', async ({
  page,
  browserName,
}) => {
  test.skip(browserName === 'webkit', WEBKIT_IDB_BLOB_REASON)
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
  await expect(page.getByRole('button', { name: /Modify this trip with Claude/i })).toBeVisible()

  const big = bigPhotoFile({ width: 3000, height: 2250 })
  const bufferB64 = big.buffer.toString('base64')

  const result = await page.evaluate(
    async ({ name, mimeType, b64 }) => {
      const { saveAsset, makeAssetKey, loadAsset } = await import('/src/lib/memAssets.js')
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const file = new File([bin], name, { type: mimeType })
      const key = makeAssetKey('photo')
      const saved = await saveAsset('photo', key, file, file.type, { raw: true })
      const stored = await loadAsset('photo', key)
      return {
        savedMime: saved.mime,
        preparedExists: !!saved.prepared,
        storedMime: stored.type,
        storedBytes: stored.size,
        inputBytes: bin.length,
      }
    },
    { name: big.name, mimeType: big.mimeType, b64: bufferB64 }
  )

  // Pipeline must NOT have run.
  expect(result.preparedExists).toBe(false)
  // Stored bytes are exactly the input — same mime, same length.
  expect(result.storedMime).toBe('image/png')
  expect(result.savedMime).toBe('image/png')
  expect(result.storedBytes).toBe(result.inputBytes)
})

test('saveAsset still works for audio kind without modification', async ({
  page,
  browserName,
}) => {
  test.skip(browserName === 'webkit', WEBKIT_IDB_BLOB_REASON)
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
  await expect(page.getByRole('button', { name: /Modify this trip with Claude/i })).toBeVisible()

  const result = await page.evaluate(async () => {
    const { saveAsset, makeAssetKey, loadAsset } = await import('/src/lib/memAssets.js')
    const blob = new Blob([new Uint8Array([0, 1, 2, 3, 4])], { type: 'audio/webm' })
    const key = makeAssetKey('audio')
    const saved = await saveAsset('audio', key, blob, 'audio/webm')
    const stored = await loadAsset('audio', key)
    return {
      savedMime: saved.mime,
      preparedExists: !!saved.prepared,
      storedSize: stored.size,
    }
  })

  // Audio bytes never go through the photo pipeline.
  expect(result.preparedExists).toBe(false)
  expect(result.savedMime).toBe('audio/webm')
  expect(result.storedSize).toBe(5)
})
