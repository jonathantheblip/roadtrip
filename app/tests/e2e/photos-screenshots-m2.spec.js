import { test } from '@playwright/test'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'
import { redPhotoFile } from './_fixtures/photoFixtures.js'
import { WEBKIT_IDB_BLOB_REASON } from './_fixtures/webkitIdbBlobGate.js'

// Capture M2 surfaces after the §3 error-surface collapse: dispatch
// composer (pick / preview / done) + the sync pill in the album header
// + the single Bucket C panel. Per the carryover, there are no longer
// per-code error surfaces — the only failure UI the user can see is
// one of three Bucket C messages.

const SHOT_DIR = 'tests/e2e/screenshots'

test.describe('M2 photo path — visual capture (post §3)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => indexedDB.deleteDatabase('roadtrip-upload-queue'))
  })

  test('dispatch composer — pick state', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.goto('/?person=helen&trip=volleyball-2026')
    await page.getByTestId('helen-photos-entry').click()
    await page.getByTestId('add-dispatch').click()
    await page.waitForSelector('[data-testid="open-picker"]')
    await page.screenshot({ path: `${SHOT_DIR}/m2-dispatch-pick.png`, fullPage: true })
  })

  test('dispatch composer — preview after pick', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.route(
      /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/(memories|assets)/,
      (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    )
    await page.goto('/?person=helen&trip=volleyball-2026')
    await page.getByTestId('helen-photos-entry').click()
    await page.getByTestId('add-dispatch').click()
    await page.getByTestId('dispatch-file-input').setInputFiles(redPhotoFile())
    await page.waitForSelector('[data-testid="prep-metadata"]')
    await page.getByTestId('dispatch-caption').fill('Court 1 warmup — Helen')
    await page.screenshot({ path: `${SHOT_DIR}/m2-dispatch-preview.png`, fullPage: true })
  })

  test('dispatch composer — Bucket C panel (photo too large)', async ({ page }) => {
    // Force the pipeline to emit 'still-too-large' by setting the
    // session ceiling extremely low *before* the modal mounts. The
    // pipeline reads its option from the modal, so we hand the picker
    // a real PNG and intercept by injecting a tiny ceiling globally
    // via a window flag the modal honours in test mode.
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.addInitScript(() => {
      // The modal reads MAX_OUTPUT_BYTES from a module constant; for
      // the screenshot we set up the same forced outcome by injecting
      // the Bucket C panel directly via a debug hook the modal exposes
      // when window.__RT_FORCE_BUCKETC is set. See AddDispatchModal.
      window.__RT_FORCE_BUCKETC = 'photo-too-large'
    })
    await page.goto('/?person=helen&trip=volleyball-2026')
    await page.getByTestId('helen-photos-entry').click()
    await page.getByTestId('add-dispatch').click()
    await page.waitForSelector('[data-testid="dispatch-bucketC"]')
    await page.screenshot({ path: `${SHOT_DIR}/m2-dispatch-bucketC.png`, fullPage: true })
  })

  test('album with sync pill — pending upload', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', WEBKIT_IDB_BLOB_REASON)
    await seedTripIntoCache(page, FIXTURE_TRIP)
    // Force the upload to fail so the pending state shows.
    await page.route(
      /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/assets\/photo/,
      (route) => route.fulfill({ status: 500, body: '{"error":"down"}' })
    )
    await page.route(
      /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/memories/,
      (route) => route.fulfill({ status: 200, body: '{}' })
    )
    await page.goto('/?person=helen&trip=volleyball-2026')
    await page.getByTestId('helen-photos-entry').click()
    await page.getByTestId('add-dispatch').click()
    await page.getByTestId('dispatch-file-input').setInputFiles(redPhotoFile())
    await page.getByTestId('dispatch-caption').fill('Queued for retry')
    await page.getByTestId('dispatch-submit').click()
    await page.waitForSelector('[data-testid="dispatch-status"]')
    // close modal so the album header is visible
    await page.getByRole('button', { name: 'Close' }).click()
    await page.waitForSelector('[data-testid="sync-pill"]')
    await page.screenshot({ path: `${SHOT_DIR}/m2-sync-pill.png`, fullPage: true })
  })
})
