import { test, expect } from './_fixtures/clockStub.js'
import {
  seedTripIntoCache,
  FIXTURE_TRIP,
} from './_fixtures/withTrip.js'
import {
  redPhotoFile,
  mp4FileForRejection,
  tiffFileForRejection,
} from './_fixtures/photoFixtures.js'
import { WEBKIT_IDB_BLOB_REASON } from './_fixtures/webkitIdbBlobGate.js'
import { resolvePersona } from './_fixtures/persona.js'

// Honors RT_PERSONA (Phase 2 build-list item 1); defaults to 'helen' when
// unset so existing runs stay byte-identical to before.
const PERSONA = resolvePersona('helen')

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

    await page.goto(`/?person=${PERSONA}&trip=volleyball-2026`)
    await page.getByTestId(`${PERSONA}-photos-entry`).click()
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

  test('silent rejection: picking a video returns to the picker, no upload, no error panel', async ({
    page,
  }) => {
    // Per the carryover §3, this case is Bucket A — the iOS picker
    // can't surface a video via accept="image/*", so reaching it via
    // file-input shenanigans is a maintainer-only edge that should
    // never present a technical message to Helen. The modal silently
    // resets to the picker; the dev-mode upload log captures the code.
    await seedTripIntoCache(page, FIXTURE_TRIP)
    const uploads = await mockSuccessfulUpload(page)

    await page.goto(`/?person=${PERSONA}&trip=volleyball-2026`)
    await page.getByTestId(`${PERSONA}-photos-entry`).click()
    await page.getByTestId('add-dispatch').click()
    const modal = page.getByTestId('add-dispatch-modal')
    await modal.getByTestId('dispatch-file-input').setInputFiles(mp4FileForRejection())

    // No Bucket C panel — Helen sees nothing technical.
    await expect(modal.getByTestId('dispatch-bucketC')).toHaveCount(0)
    // Picker affordance is back, ready for another pick.
    await expect(modal.getByTestId('open-picker')).toBeVisible({ timeout: 4000 })
    expect(uploads.length).toBe(0)
  })

  test('silent rejection: TIFF returns to the picker silently', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await mockSuccessfulUpload(page)

    await page.goto(`/?person=${PERSONA}&trip=volleyball-2026`)
    await page.getByTestId(`${PERSONA}-photos-entry`).click()
    await page.getByTestId('add-dispatch').click()
    const modal = page.getByTestId('add-dispatch-modal')
    await modal.getByTestId('dispatch-file-input').setInputFiles(tiffFileForRejection())

    await expect(modal.getByTestId('dispatch-bucketC')).toHaveCount(0)
    await expect(modal.getByTestId('open-picker')).toBeVisible({ timeout: 4000 })
  })

  test('network failure: upload 500 → queued + tile still appears + sync pill shows', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'webkit', WEBKIT_IDB_BLOB_REASON)
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

    await page.goto(`/?person=${PERSONA}&trip=volleyball-2026`)
    await page.getByTestId(`${PERSONA}-photos-entry`).click()
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

  test('sync pill drains when retry succeeds', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', WEBKIT_IDB_BLOB_REASON)
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

    await page.goto(`/?person=${PERSONA}&trip=volleyball-2026`)
    await page.getByTestId(`${PERSONA}-photos-entry`).click()
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

  test('Bucket C panel renders verbatim §3 copy with no banned vocabulary', async ({
    page,
  }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.addInitScript(() => {
      window.__RT_FORCE_BUCKETC = 'photo-too-large'
    })
    await page.goto(`/?person=${PERSONA}&trip=volleyball-2026`)
    await page.getByTestId(`${PERSONA}-photos-entry`).click()
    await page.getByTestId('add-dispatch').click()
    const panel = page.getByTestId('dispatch-bucketC')
    await expect(panel).toBeVisible()
    await expect(panel).toHaveAttribute('data-outcome', 'photo-too-large')
    await expect(panel).toContainText('This photo is too large')
    await expect(panel).toContainText(/screenshot/i)
    // Banned vocabulary spot-checks — none of these technical terms
    // should appear in any Bucket C surface.
    const text = (await panel.textContent()) || ''
    for (const banned of ['HEIC', 'EXIF', 'MB', 'KB', 'bytes', 'compression', 'IndexedDB', 'queue']) {
      expect(text).not.toMatch(new RegExp(`\\b${banned}\\b`, 'i'))
    }
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

    await page.goto(`/?person=${PERSONA}&trip=volleyball-2026`)
    await page.getByTestId(`${PERSONA}-photos-entry`).click()

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

    // Source attribute is 'memory' when the album has a top-level
    // capturedAt — which is the post-C0 default for any new upload
    // with EXIF, and what the boot-time backfill produces for legacy
    // records whose ref.capturedAt is meaningfully earlier than the
    // upload time. Both 'memory' and 'exif' are "real capture date"
    // sources from the viewer's perspective; the alternative would be
    // 'createdAt' which the fallback test below covers.
    expect(['memory', 'exif']).toContain(exifSource)
    expect(fallbackSource).toBe('createdAt')

    // The fallback tile additionally labels itself "· uploaded" so the
    // viewer can tell that the date isn't the actual capture moment.
    await expect(fallbackTile).toContainText('· uploaded')
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
