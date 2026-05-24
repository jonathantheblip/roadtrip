import { test, expect } from '@playwright/test'
import {
  seedTripIntoCache,
  FIXTURE_TRIP,
} from './_fixtures/withTrip.js'
import {
  redPhotoFile,
  mp4FileForRejection,
  tiffFileForRejection,
} from './_fixtures/photoFixtures.js'

// M2 acceptance — the AddDispatchModal exercises the real photo
// pipeline (Canvas decode, EXIF read, downscale, upload, IndexedDB
// fallback) against headless Chromium. Mocks the worker upload so
// the deterministic happy path doesn't rely on staging infra.

test.describe('AddDispatchModal — photo path (M2)', () => {
  test.beforeEach(async ({ page }) => {
    // Clear IndexedDB upload queue between tests so the sync pill
    // count starts at zero deterministically.
    await page.addInitScript(() => {
      indexedDB.deleteDatabase('roadtrip-upload-queue')
    })
  })

  test('happy path: pick photo → preview → save → tile appears + worker called', async ({
    page,
  }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    const uploads = await mockSuccessfulUpload(page)

    await page.goto('/?person=helen&trip=volleyball-2026')
    await page.getByTestId('helen-photos-entry').click()
    await page.getByTestId('add-dispatch').click()

    const modal = page.getByTestId('add-dispatch-modal')
    await expect(modal).toBeVisible()

    await modal.getByTestId('dispatch-file-input').setInputFiles(redPhotoFile())

    // Prep → preview pivots; the metadata line confirms the downscale ran.
    await expect(modal.getByTestId('prep-metadata')).toContainText(
      /\d+×\d+ from \d+×\d+/
    )

    await modal.getByTestId('dispatch-caption').fill('First Helen dispatch')
    await modal.getByTestId('dispatch-submit').click()
    await expect(modal.getByTestId('dispatch-status')).toContainText('Saved', {
      timeout: 8000,
    })

    // Worker was called with a JPEG (the downscale output, not the
    // original PNG). Playwright route interception doesn't always
    // surface Blob-typed request bodies through postDataBuffer(), so
    // we use the Content-Type header as the proof that the JPEG
    // downscale ran end-to-end.
    expect(uploads.length).toBe(1)
    expect(uploads[0].mime).toMatch(/jpeg/i)

    // Close modal, verify tile renders in the album.
    await modal.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByText('First Helen dispatch')).toBeVisible({
      timeout: 5000,
    })
  })

  test('rejection: picking a video shows the designed copy, no upload', async ({
    page,
  }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    const uploads = await mockSuccessfulUpload(page)

    await page.goto('/?person=helen&trip=volleyball-2026')
    await page.getByTestId('helen-photos-entry').click()
    await page.getByTestId('add-dispatch').click()
    const modal = page.getByTestId('add-dispatch-modal')
    await modal.getByTestId('dispatch-file-input').setInputFiles(mp4FileForRejection())

    const err = modal.getByTestId('dispatch-error')
    await expect(err).toBeVisible()
    await expect(err).toContainText('Looks like a video')
    expect(uploads.length).toBe(0)
  })

  test('rejection: TIFF gets the "unsupported image" message', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await mockSuccessfulUpload(page)

    await page.goto('/?person=helen&trip=volleyball-2026')
    await page.getByTestId('helen-photos-entry').click()
    await page.getByTestId('add-dispatch').click()
    const modal = page.getByTestId('add-dispatch-modal')
    await modal.getByTestId('dispatch-file-input').setInputFiles(tiffFileForRejection())

    const err = modal.getByTestId('dispatch-error')
    await expect(err).toBeVisible()
    await expect(err).toContainText(/Unsupported|JPEG, PNG, HEIC/i)
  })

  test('network failure: upload 500 → queued + tile still appears + sync pill shows', async ({
    page,
  }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.route(
      /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/assets\/photo/,
      (route) =>
        route.fulfill({
          status: 500,
          body: '{"error":"server down"}',
          contentType: 'application/json',
        })
    )

    await page.goto('/?person=helen&trip=volleyball-2026')
    await page.getByTestId('helen-photos-entry').click()
    await page.getByTestId('add-dispatch').click()
    const modal = page.getByTestId('add-dispatch-modal')
    await modal.getByTestId('dispatch-file-input').setInputFiles(redPhotoFile())
    await modal.getByTestId('dispatch-caption').fill('Will be queued')
    await modal.getByTestId('dispatch-submit').click()
    await expect(modal.getByTestId('dispatch-status')).toContainText('Saved', {
      timeout: 8000,
    })
    await modal.getByRole('button', { name: 'Close' }).click()

    // Tile rendered from the locally-saved memory.
    await expect(page.getByText('Will be queued')).toBeVisible()
    // Sync pill shows pending count.
    await expect(page.getByTestId('sync-pill')).toBeVisible()
    await expect(page.getByTestId('sync-pill')).toContainText(/1 syncing/i)
  })

  test('sync pill drains when retry succeeds', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    let attemptCount = 0
    await page.route(
      /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/assets\/photo/,
      (route) => {
        attemptCount += 1
        if (attemptCount === 1) {
          return route.fulfill({ status: 500, body: '{"error":"first fail"}' })
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            key: 'helen/m1/photo-test',
            url: 'https://example.test/helen/m1/photo-test',
            mime: 'image/jpeg',
          }),
        })
      }
    )

    await page.goto('/?person=helen&trip=volleyball-2026')
    await page.getByTestId('helen-photos-entry').click()
    await page.getByTestId('add-dispatch').click()
    const modal = page.getByTestId('add-dispatch-modal')
    await modal.getByTestId('dispatch-file-input').setInputFiles(redPhotoFile())
    await modal.getByTestId('dispatch-submit').click()
    await expect(modal.getByTestId('dispatch-status')).toContainText('Saved', {
      timeout: 8000,
    })
    await modal.getByRole('button', { name: 'Close' }).click()

    await expect(page.getByTestId('sync-pill')).toBeVisible()
    // Tap sync pill to drain manually.
    await page.getByTestId('sync-pill').click()
    await expect(page.getByTestId('sync-pill')).toHaveCount(0, { timeout: 6000 })
    expect(attemptCount).toBeGreaterThanOrEqual(2)
  })

  test('EXIF capture date is primary, fallback to createdAt is labelled', async ({
    page,
  }) => {
    // Seed two memories — one with EXIF capturedAt, one without — and
    // assert the tiles render the right date *source* tag.
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.addInitScript(() => {
      const memories = [
        {
          id: 'with-exif',
          tripId: 'volleyball-2026',
          stopId: 'vb2-3',
          authorTraveler: 'helen',
          visibility: 'shared',
          kind: 'photo',
          caption: 'EXIF photo Helen',
          photoRef: {
            storage: 'external',
            url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9eyf3KsAAAAASUVORK5CYII=',
            capturedAt: '2026-05-23T19:50:00Z', // EXIF says ~3:50 PM ET
          },
          // memory uploaded much later — if app used createdAt, the
          // chronology would break.
          createdAt: '2026-05-24T09:00:00Z',
          updatedAt: '2026-05-24T09:00:00Z',
        },
        {
          id: 'no-exif',
          tripId: 'volleyball-2026',
          stopId: 'vb2-3',
          authorTraveler: 'jonathan',
          visibility: 'shared',
          kind: 'photo',
          caption: 'Bare upload Jonathan',
          photoRef: {
            storage: 'external',
            url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9eyf3KsAAAAASUVORK5CYII=',
            // no capturedAt
          },
          createdAt: '2026-05-23T20:30:00Z',
          updatedAt: '2026-05-23T20:30:00Z',
        },
      ]
      localStorage.setItem('rt_memories_shared_v1', JSON.stringify(memories))
    })

    await page.goto('/?person=helen&trip=volleyball-2026')
    await page.getByTestId('helen-photos-entry').click()

    const exifTile = page
      .getByTestId('photo-tile')
      .filter({ hasText: 'EXIF photo Helen' })
    const fallbackTile = page
      .getByTestId('photo-tile')
      .filter({ hasText: 'Bare upload Jonathan' })

    const exifSource = await exifTile
      .locator('[data-testid="tile-date-source"]')
      .getAttribute('data-source')
    const fallbackSource = await fallbackTile
      .locator('[data-testid="tile-date-source"]')
      .getAttribute('data-source')

    expect(exifSource).toBe('exif')
    expect(fallbackSource).toBe('createdAt')

    // The fallback tile additionally labels itself "·uploaded" so the
    // viewer can tell that the date isn't the actual capture moment.
    await expect(fallbackTile).toContainText('·uploaded')
  })
})

// Capture every successful upload's body + headers so tests can
// assert what was sent. Returns the array (mutated as uploads fire).
async function mockSuccessfulUpload(page) {
  const uploads = []
  await page.route(
    /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/assets\/photo/,
    async (route) => {
      const req = route.request()
      const body = req.postDataBuffer()
      const mime = (await req.headerValue('content-type')) || ''
      uploads.push({
        mime,
        byteLength: body ? body.length : 0,
      })
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          key: 'helen/test/photo-mock',
          url: 'https://example.test/photo-mock',
          mime: 'image/jpeg',
        }),
      })
    }
  )
  // Memories POST: just 200 so saveMemory's mirror call doesn't fail.
  await page.route(
    /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/memories/,
    (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  )
  return uploads
}
