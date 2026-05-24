import { test } from '@playwright/test'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'
import { redPhotoFile, mp4FileForRejection } from './_fixtures/photoFixtures.js'

// Capture M2 surfaces: dispatch composer (pick / preview / error /
// done) + the sync pill in the album header. Verify-in-DOM artifacts
// the constraint list calls out — passes as long as the surfaces
// render.

const SHOT_DIR = 'tests/e2e/screenshots'

test.describe('M2 photo path — visual capture', () => {
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

  test('dispatch composer — error state (video rejection)', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.goto('/?person=helen&trip=volleyball-2026')
    await page.getByTestId('helen-photos-entry').click()
    await page.getByTestId('add-dispatch').click()
    await page.getByTestId('dispatch-file-input').setInputFiles(mp4FileForRejection())
    await page.waitForSelector('[data-testid="dispatch-error"]')
    await page.screenshot({ path: `${SHOT_DIR}/m2-dispatch-error.png`, fullPage: true })
  })

  test('album with sync pill — pending upload', async ({ page }) => {
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
