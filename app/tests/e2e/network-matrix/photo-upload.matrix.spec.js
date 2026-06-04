import { test } from '../_fixtures/clockStub.js'
import { step, setActivePage, expect } from '../journeys/_steps.js'
import { seedTripIntoCache, FIXTURE_TRIP } from '../_fixtures/withTrip.js'
import { realMedia } from '../_fixtures/realMedia.js'
import { WEBKIT_IDB_BLOB_REASON } from '../_fixtures/webkitIdbBlobGate.js'

// Bug-Trap A.5 — network condition matrix for photo upload, now through the
// one importer (Stage 3 retired the dispatch composer). Each test runs the
// same real-JPEG import under a different network condition. The intent is to
// catch the silent-failure class — "the upload stalled and nothing told the
// user" — that only shows up on degraded networks.
//
// The real JPEG's bytes upload over the (throttled) network; its match is
// PINNED to a stop via the EXIF override only so the flow is deterministic
// (smart-skip → save → upload). The real-EXIF match end-to-end is journey-02's
// job. The /assets route is installed AFTER seedTripIntoCache's catch-all so
// Playwright's LIFO matching reaches it first.

const ASSET_RE = /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/assets\/(photo|video)/
const OTHER_RE = /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/(memories|trips)/
// Saturday match stop (vb2-3) → a single clean photo smart-skips review.
const CLEAN_EXIF = {
  'iphone-jpeg-fullres.jpg': { capturedAt: '2026-05-23T19:45:00Z', lat: 41.4923, lng: -72.0934 },
}

const OK_BODY = JSON.stringify({ key: 'helen/net/photo', url: 'https://example.test/net-photo', mime: 'image/jpeg' })

function fireForegroundDrain(page) {
  // Tab goes hidden → visible; App.jsx's onVisibility runs the drain on the
  // visible transition.
  return page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

async function openImporterAndPick(page) {
  const fx = realMedia('JPEG_FULLRES')
  test.skip(!fx, 'JPEG_FULLRES fixture not present')
  await page.addInitScript((m) => { window.__RT_BACKFILL_EXIF = m }, CLEAN_EXIF)
  await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
  await page.getByTestId('helen-photos-entry').click()
  await page.getByTestId('import-file-input').setInputFiles({
    name: fx.name,
    mimeType: fx.mimeType,
    buffer: fx.buffer,
  })
}

test.describe.configure({ timeout: 90_000 })
test.beforeEach(async ({ page }) => setActivePage(page))

// ─── Variant 1 — slow 3G, upload completes ────────────────────
test('photo import over slow 3G completes', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  // Slow-but-successful upload: ~600ms pre-flight latency (SLOW_3G round
  // trip) then 200.
  await page.route(ASSET_RE, async (route) => {
    await new Promise((r) => setTimeout(r, 600))
    await route.fulfill({ status: 200, contentType: 'application/json', body: OK_BODY })
  })
  await page.route(OTHER_RE, (route) => route.fulfill({ status: 200, body: '{}' }))

  await step('import the fixture over slow 3G', async () => {
    await openImporterAndPick(page)
  })
  await step('import lands despite latency (toast, no stuck queue)', async () => {
    // doSave awaits the slow upload, so the toast confirms the upload finished.
    await expect(page.getByTestId('import-toast')).toContainText(/photo added/i, { timeout: 30_000 })
    // Upload succeeded → nothing parked in the queue.
    await expect(page.getByTestId('sync-pill')).toHaveCount(0)
  })
})

// ─── Variant 2 — offline mid-upload, then back online ─────────
test('offline import + online again drains the queue', async ({ page, browserName }) => {
  // The offline path parks the blob in the IndexedDB queue, which WebKit can't
  // do in the harness (same gate as every other queue test).
  test.skip(browserName === 'webkit', WEBKIT_IDB_BLOB_REASON)
  await seedTripIntoCache(page, FIXTURE_TRIP)
  let online = false
  await page.route(ASSET_RE, async (route) => {
    if (!online) {
      await route.fulfill({ status: 503, body: '{"error":"offline simulated"}' })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: OK_BODY })
  })
  await page.route(OTHER_RE, (route) => route.fulfill({ status: 200, body: '{}' }))

  await step('import while offline → parks in the queue, no error surfaced', async () => {
    await openImporterAndPick(page)
    // Landed on the album with a pending pill — not an error screen.
    await expect(page.getByTestId('sync-pill')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('sync-pill')).toContainText(/1 syncing/i)
  })
  await step('reconnect + foreground → queue drains to zero', async () => {
    online = true
    await fireForegroundDrain(page)
    await expect(page.getByTestId('sync-pill')).toHaveCount(0, { timeout: 20_000 })
  })
})

// ─── Variant 3 — drop the first upload, allow retry ───────────
test('drop-and-resume: first upload aborts, retry succeeds', async ({ page, browserName }) => {
  // The dropped upload parks the blob in the IndexedDB queue (WebKit can't in
  // the harness) and the foreground drain retries it from there.
  test.skip(browserName === 'webkit', WEBKIT_IDB_BLOB_REASON)
  await seedTripIntoCache(page, FIXTURE_TRIP)
  let dropped = false
  await page.route(ASSET_RE, async (route) => {
    if (!dropped) {
      // Transient cellular hiccup — abort the first attempt once.
      dropped = true
      await route.abort('internetdisconnected')
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: OK_BODY })
  })
  await page.route(OTHER_RE, (route) => route.fulfill({ status: 200, body: '{}' }))

  await step('import → first upload aborts → photo saved + queued', async () => {
    await openImporterAndPick(page)
    // The drop didn't error the import — the photo saved locally and parked.
    await expect(page.getByTestId('sync-pill')).toBeVisible({ timeout: 15_000 })
    expect(dropped).toBe(true)
  })
  await step('foreground drain retries → queue clears', async () => {
    await fireForegroundDrain(page)
    await expect(page.getByTestId('sync-pill')).toHaveCount(0, { timeout: 20_000 })
  })
})
