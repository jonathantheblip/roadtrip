import { test } from '../_fixtures/clockStub.js'
import { step, setActivePage, expect } from './_steps.js'
import { seedTripIntoCache, FIXTURE_TRIP } from '../_fixtures/withTrip.js'
import { realMedia } from '../_fixtures/realMedia.js'
import { WEBKIT_IDB_BLOB_REASON } from '../_fixtures/webkitIdbBlobGate.js'

// Journey 07 — Offline upload queue, real media, through the one importer.
// Spec source: BUG_TRAP_PUNCHLIST.md A.3 seventh bullet.
//
// Canonical happy-path offline→online case: a REAL iPhone JPEG imported while
// the Worker is unreachable parks in the queue, and a foreground (visibility)
// tick after reconnect drains it — no manual tap. The network-condition matrix
// (network-matrix/photo-upload.matrix) expands the variants; this is the
// end-to-end with real bytes in the IndexedDB queue. Stage 3 moved the on-ramp
// from the dispatch composer to the one importer.

// FIXTURE_TRIP with an opened-up window so the real fixture can't be excluded
// by the trip-range filter (stops/GPS unchanged; its GPS matches the homeBase
// Beach Bungalow stop).
const WIDE_TRIP = { ...FIXTURE_TRIP, dateRangeStart: '2025-01-01', dateRangeEnd: '2027-12-31' }
const ASSET_RE = /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/assets\/(photo|video)/
const OTHER_RE = /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/(memories|trips)/

test.beforeEach(async ({ page }) => setActivePage(page))

test('offline import queues + drains on reconnect (real media)', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', WEBKIT_IDB_BLOB_REASON)
  const fx = realMedia('JPEG_FULLRES')
  test.skip(!fx, 'JPEG_FULLRES fixture not present')

  await page.addInitScript(() => indexedDB.deleteDatabase('roadtrip-upload-queue'))
  await seedTripIntoCache(page, WIDE_TRIP)

  // /assets fails while "offline" so the import queues; flip to 200 to drain.
  let online = false
  await page.route(ASSET_RE, async (route) => {
    if (!online) {
      await route.fulfill({ status: 503, body: '{"error":"offline simulated"}' })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ key: 'helen/journey07/photo', url: 'https://example.test/journey07', mime: 'image/jpeg' }),
    })
  })
  await page.route(OTHER_RE, (route) => route.fulfill({ status: 200, body: '{}' }))

  await step('open Photos album', async () => {
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await page.getByTestId('helen-photos-entry').click()
  })

  await step('import the real JPEG while offline → parks in the queue', async () => {
    await page.getByTestId('import-file-input').setInputFiles({
      name: fx.name,
      mimeType: fx.mimeType,
      buffer: fx.buffer,
    })
    // Smart-skip (toast) or confirm (Import) — either way it saves + queues.
    const confirmGo = page.getByTestId('import-confirm-go')
    await Promise.race([
      confirmGo.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {}),
      page.getByTestId('sync-pill').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {}),
    ])
    if (await confirmGo.isVisible().catch(() => false)) await confirmGo.click()
    await expect(page.getByTestId('sync-pill')).toBeVisible({ timeout: 12_000 })
  })

  await step('reconnect + foreground tick → queue drains, pill clears', async () => {
    online = true
    // The drain runs on the hidden→visible transition (App.jsx onVisibility).
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await expect(page.getByTestId('sync-pill')).toBeHidden({ timeout: 30_000 })
  })
})
