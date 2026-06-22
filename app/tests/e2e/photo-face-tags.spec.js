import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, seedMemoriesIntoCache, FIXTURE_TRIP, TINY_RED_PNG_DATA_URL } from './_fixtures/withTrip.js'
import { expectNoSeriousA11y } from './_fixtures/axe.js'

// "Who's in the frame" overlay on the Photos tab. The on-device face index
// (enrollment + per-photo scanned faces) is seeded directly so the overlay can
// be verified WITHOUT the ML model (which doesn't load headless) — the matcher
// (selectPhotosWith/computeFaceTags) is pure. Real recognition is device-only.

function photoMemory({ id, stopId, author, caption, createdAt }) {
  return {
    id, tripId: 'volleyball-2026', stopId, authorTraveler: author,
    visibility: 'shared', kind: 'photo', caption,
    photoRef: { storage: 'external', url: TINY_RED_PNG_DATA_URL },
    photoExternalURLs: [], reactions: [], createdAt, updatedAt: createdAt,
  }
}

async function openPhotos(page) {
  // Helen reaches the album from her themed home entry.
  await page.getByTestId('helen-photos-entry').click()
  await expect(page.getByTestId('photo-tile').first()).toBeVisible({ timeout: 10000 })
}

// Seed the on-device face index: enroll `personId` and mark `entryKey` as a
// scanned photo containing that person's face. Orthonormal 2-D embeddings give
// a deterministic cosine match (the matcher is dimension-agnostic).
async function seedFaceIndex(page, { personId, entryKey, vec }) {
  await page.evaluate(async ({ personId, entryKey, vec }) => {
    const fi = await import('/src/lib/faceIndex.js')
    await fi.addExemplar(personId, vec, '')
    await fi.setScannedFaces(entryKey, [{ embedding: vec, box: [0, 0, 10, 10], score: 0.99 }])
  }, { personId, entryKey, vec })
}

test.describe('Photos — who\'s-in-the-frame overlay', () => {
  test('a tile shows the face-tag dots for the enrolled person in it', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [
      photoMemory({ id: 'm1', stopId: 'vb2-3', author: 'helen', caption: 'Court 1', createdAt: '2026-05-23T19:50:00Z' }),
    ])
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await openPhotos(page)

    // No enrollment yet → no overlay.
    await expect(page.getByTestId('tile-face-tags')).toHaveCount(0)

    // Seed enrollment + a scanned face on the first tile's real entry key.
    const key = await page.getByTestId('photo-tile').first().getAttribute('data-photo-key')
    await seedFaceIndex(page, { personId: 'helen', entryKey: key, vec: [1, 0] })

    // Reload → the index is read and the overlay appears on that tile.
    await page.reload()
    await openPhotos(page)
    const tile = page.locator(`[data-photo-key="${key}"]`)
    const tags = tile.getByTestId('tile-face-tags')
    await expect(tags).toBeVisible({ timeout: 10000 })
    await expect(tags).toHaveAttribute('aria-label', /Helen/)

    // The dot overlay (identity dots on a dark scrim, names on the aria-label)
    // must not introduce a serious contrast/name violation on the album.
    await expectNoSeriousA11y(page, { label: 'photos · face tags' })
  })

  test('no enrolled faces → no overlay, and the album still renders', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [
      photoMemory({ id: 'm1', stopId: 'vb2-3', author: 'helen', caption: 'Court 1', createdAt: '2026-05-23T19:50:00Z' }),
    ])
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await openPhotos(page)
    await expect(page.getByTestId('photo-tile')).toHaveCount(1)
    await expect(page.getByTestId('tile-face-tags')).toHaveCount(0)
  })
})
