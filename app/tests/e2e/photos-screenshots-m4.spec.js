import { test } from '@playwright/test'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'
import { redPhotoFile } from './_fixtures/photoFixtures.js'
import { WEBKIT_IDB_BLOB_REASON } from './_fixtures/webkitIdbBlobGate.js'

// Visual captures for M4 + the dev-mode upload log. Each screenshot
// proves a specific surface renders as designed — the carryover's
// "verify in DOM, not in commit messages" rule.

const SHOT_DIR = 'tests/e2e/screenshots'

test.describe('M4 + dev-mode — visual capture', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => indexedDB.deleteDatabase('roadtrip-upload-queue'))
  })

  test('sync pill — before and after foreground drain', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', WEBKIT_IDB_BLOB_REASON)
    await seedTripIntoCache(page, FIXTURE_TRIP)
    let nextStatus = 503
    await page.route(
      /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/assets\/(photo|video)/,
      (route) => {
        if (nextStatus >= 500) {
          return route.fulfill({ status: nextStatus, body: '{}' })
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            key: 'helen/test/m4',
            url: 'https://example.test/m4',
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
    await modal.getByTestId('dispatch-caption').fill('Outage capture')
    await modal.getByTestId('dispatch-submit').click()
    await page.waitForSelector('[data-testid="dispatch-status"]')
    await modal.getByRole('button', { name: 'Close' }).click()
    await page.waitForSelector('[data-testid="sync-pill"]')
    await page.screenshot({
      path: `${SHOT_DIR}/m4-sync-pill-pending.png`,
      fullPage: true,
    })

    // Bring the network back, fire a visibility change.
    nextStatus = 200
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      })
      document.dispatchEvent(new Event('visibilitychange'))
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    // Wait for the pill to disappear, then grab the cleared state.
    await page.waitForSelector('[data-testid="sync-pill"]', { state: 'detached', timeout: 8000 })
    await page.screenshot({
      path: `${SHOT_DIR}/m4-sync-pill-drained.png`,
      fullPage: true,
    })
  })

  test('dev-mode upload log section in Settings', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    // Pre-populate the log with a couple of entries so the screenshot
    // shows the rendered list, not the empty state.
    await page.addInitScript(() => {
      localStorage.setItem('rt_dev_mode', 'true')
      const entries = [
        {
          ts: '2026-05-24T10:14:22.000Z',
          code: 'network',
          bucket: 'A',
          outcome: null,
          message: 'Failed to fetch',
          stack: null,
          fileMeta: { name: 'family-pic.jpg', size: 412903, type: 'image/jpeg' },
          attempt: 1,
          context: { phase: 'upload-queued', kind: 'photo' },
        },
        {
          ts: '2026-05-24T10:14:48.000Z',
          code: 'worker-5xx',
          bucket: 'A',
          outcome: null,
          message: 'worker 503: cf edge degraded',
          stack: null,
          fileMeta: { name: 'rally.mp4', size: 4_103_222, type: 'video/mp4' },
          attempt: 2,
          context: { phase: 'upload-queued', kind: 'video' },
        },
        {
          ts: '2026-05-24T10:15:01.000Z',
          code: 'video-too-large',
          bucket: 'C',
          outcome: 'video-too-long',
          message: 'encoded 31MB exceeds 25MB cap',
          stack: null,
          fileMeta: { name: 'long-clip.mp4', size: 31_500_000, type: 'video/mp4' },
          attempt: 1,
          context: { phase: 'video-size-cap' },
        },
      ]
      localStorage.setItem('rt_upload_log_v1', JSON.stringify(entries))
    })
    await page.goto('/?person=helen&trip=volleyball-2026')
    // Open Settings via the ⋯ button in the top bar.
    await page.getByRole('button', { name: 'Trip settings' }).click()
    await page.waitForSelector('[data-testid="dev-upload-log"]')
    // Scroll the section into view so the screenshot frames it.
    await page.evaluate(() => {
      document.querySelector('[data-testid="dev-upload-log"]').scrollIntoView({
        behavior: 'instant',
        block: 'start',
      })
    })
    await page.screenshot({
      path: `${SHOT_DIR}/m4-dev-upload-log.png`,
      fullPage: false,
    })
  })
})
