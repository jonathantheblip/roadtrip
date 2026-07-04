import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'
import { redPhotoFile } from './_fixtures/photoFixtures.js'
import { WEBKIT_IDB_BLOB_REASON } from './_fixtures/webkitIdbBlobGate.js'
import { resolvePersona } from './_fixtures/persona.js'

// Honors RT_PERSONA (Phase 2 build-list item 1); defaults to 'helen' when
// unset so existing runs stay byte-identical to before.
const PERSONA = resolvePersona('helen')

// Importer offline AUTO-drain — the two triggers the importer's own offline
// spec (photos-import-offline, manual pill-tap only) does NOT cover: Page
// Visibility (foreground) and a service-worker drain message. Plays the
// end-to-end story: Helen loses signal, imports a photo, signal returns, the
// app drains without her tapping anything. Stage 3 moved the on-ramp from the
// dispatch composer to the one importer; the drain triggers under test are
// unchanged.
//
// Background Sync API itself is absent on iOS Safari, so the app relies on
// this fallback path. We simulate the outage by failing the /assets route
// (503) then flipping it to 200.

// One photo, cleanly at the Saturday match stop (vb2-3) → the importer
// smart-skips review and saves silently; the failed upload parks in the queue
// and the album header shows the pill.
const CLEAN_EXIF = {
  'outage.png': { capturedAt: '2026-05-23T19:45:00Z', lat: 41.4923, lng: -72.0934 },
}

test.describe('Photos upload — offline auto-drain (importer)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => indexedDB.deleteDatabase('roadtrip-upload-queue'))
  })

  test('offline import → queue populates → online + foreground → drain to zero', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'webkit', WEBKIT_IDB_BLOB_REASON)
    await seedTripIntoCache(page, FIXTURE_TRIP)

    // Mock the asset upload endpoint to count attempts. The catch-all in
    // seedTripIntoCache 404s anything else from the Worker host; we install
    // this more-specific route first so Playwright's LIFO routing reaches it.
    let assetCalls = 0
    let nextResponseStatus = 200
    await page.route(
      /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/assets\/(photo|video)/,
      async (route) => {
        assetCalls += 1
        if (nextResponseStatus >= 500) {
          await route.fulfill({ status: nextResponseStatus, body: '{"error":"offline simulated"}' })
          return
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ key: 'helen/test/drain-photo', url: 'https://example.test/drain-photo', mime: 'image/jpeg' }),
        })
      }
    )
    await page.route(
      /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/(memories|trips)/,
      (route) => route.fulfill({ status: 200, body: '{}' })
    )
    await page.addInitScript((map) => { window.__RT_BACKFILL_EXIF = map }, CLEAN_EXIF)

    await page.goto(`/?person=${PERSONA}&trip=volleyball-2026`)

    // Take the upload offline (simulated via 503) before importing.
    nextResponseStatus = 503
    await page.getByTestId(`${PERSONA}-photos-entry`).click()
    await page.getByTestId('import-file-input').setInputFiles([redPhotoFile('outage.png')])

    // Sync pill in the album header now shows 1 item pending.
    await expect(page.getByTestId('sync-pill')).toBeVisible()
    // Per-person pill copy (foolproof-video L5): "1 uploading"/"1 queued"/"saving…"
    // by lens (was the generic "1 syncing"); tolerant across the persona sweep.
    await expect(page.getByTestId('sync-pill')).toContainText(/(?:1\s+(?:uploading|queued))|saving/i)
    expect(assetCalls).toBeGreaterThanOrEqual(1) // initial attempt
    const callsBeforeDrain = assetCalls

    // Signal comes back. Flip the mock to 200, then trigger a visibility
    // change — App.jsx's onVisibility handler runs the drain on the visible
    // transition, which retries the queued upload.
    nextResponseStatus = 200
    await page.evaluate(() => {
      // Simulate the tab going hidden then visible. The drain handler only
      // runs on the visible transition.
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    // Pill drops to zero on its own — no manual tap required.
    await expect(page.getByTestId('sync-pill')).toHaveCount(0, { timeout: 8000 })
    // The drain genuinely retried — call count went up.
    expect(assetCalls).toBeGreaterThan(callsBeforeDrain)
  })

  test('SW message → drain fires (Background Sync fallback path)', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'webkit', WEBKIT_IDB_BLOB_REASON)
    // Posting `{ type: 'drain-upload-queue' }` to the page (the same message
    // the SW's sync event handler posts) should kick off a drain.
    await seedTripIntoCache(page, FIXTURE_TRIP)
    let assetCalls = 0
    let respondWith = 503
    await page.route(
      /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/assets\/(photo|video)/,
      async (route) => {
        assetCalls += 1
        if (respondWith >= 500) {
          await route.fulfill({ status: respondWith, body: '{}' })
          return
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ key: 'helen/test/sw-drain', url: 'https://example.test/sw-drain', mime: 'image/jpeg' }),
        })
      }
    )
    await page.route(
      /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/(memories|trips)/,
      (route) => route.fulfill({ status: 200, body: '{}' })
    )
    await page.addInitScript((map) => { window.__RT_BACKFILL_EXIF = map }, CLEAN_EXIF)

    await page.goto(`/?person=${PERSONA}&trip=volleyball-2026`)
    await page.getByTestId(`${PERSONA}-photos-entry`).click()
    // Imported while offline (503) → parks in the queue.
    await page.getByTestId('import-file-input').setInputFiles([redPhotoFile('outage.png')])
    await expect(page.getByTestId('sync-pill')).toBeVisible()
    const callsBeforeDrain = assetCalls

    // Connectivity returns; simulate the SW posting a drain message.
    respondWith = 200
    await page.evaluate(() => {
      // The App listens for 'message' on navigator.serviceWorker. Dispatch a
      // synthetic MessageEvent directly onto that target so the listener fires
      // without needing a real SW running.
      const target = navigator.serviceWorker
      const evt = new MessageEvent('message', {
        data: { type: 'drain-upload-queue', tag: 'rt-upload-queue' },
      })
      target.dispatchEvent(evt)
    })

    await expect(page.getByTestId('sync-pill')).toHaveCount(0, { timeout: 8000 })
    expect(assetCalls).toBeGreaterThan(callsBeforeDrain)
  })

  test('two drain triggers at once upload a queued photo only ONCE (single-flight guard)', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'webkit', WEBKIT_IDB_BLOB_REASON)
    // Two drain entry points with SEPARATE guards — the sync-pill tap
    // (PhotosView.triggerDrain) and the SW drain message (App.runDrain) — can
    // fire at once. Without uploadQueue.drain's single-flight guard each pass
    // picks up the same not-yet-removed queued item and POSTs it, so the photo
    // lands in R2 twice (the Worker mints a fresh key per upload) and one copy is
    // orphaned. The guard must let exactly ONE pass upload it.
    await seedTripIntoCache(page, FIXTURE_TRIP)
    let assetCalls = 0
    let respondWith = 503
    await page.route(
      /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/assets\/(photo|video)/,
      async (route) => {
        assetCalls += 1
        if (respondWith >= 500) {
          await route.fulfill({ status: respondWith, body: '{}' })
          return
        }
        // Slow success so the first pass is still in-flight (item not yet
        // removed) when the second trigger fires — the exact race window.
        await new Promise((r) => setTimeout(r, 500))
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ key: `helen/test/once-${assetCalls}`, url: `https://example.test/once-${assetCalls}`, mime: 'image/jpeg' }),
        })
      }
    )
    await page.route(
      /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/(memories|trips)/,
      (route) => route.fulfill({ status: 200, body: '{}' })
    )
    await page.addInitScript((map) => { window.__RT_BACKFILL_EXIF = map }, CLEAN_EXIF)

    await page.goto(`/?person=${PERSONA}&trip=volleyball-2026`)
    await page.getByTestId(`${PERSONA}-photos-entry`).click()
    await page.getByTestId('import-file-input').setInputFiles([redPhotoFile('outage.png')])
    await expect(page.getByTestId('sync-pill')).toBeVisible()
    // Per-person pill copy (foolproof-video L5): "1 uploading"/"1 queued"/"saving…"
    // by lens (was the generic "1 syncing"); tolerant across the persona sweep.
    await expect(page.getByTestId('sync-pill')).toContainText(/(?:1\s+(?:uploading|queued))|saving/i)
    const callsBeforeDrain = assetCalls

    // Reconnect, then fire BOTH drain entry points back-to-back.
    respondWith = 200
    await page.getByTestId('sync-pill').click()
    await page.evaluate(() => {
      navigator.serviceWorker.dispatchEvent(
        new MessageEvent('message', { data: { type: 'drain-upload-queue', tag: 'rt-upload-queue' } })
      )
    })

    // Queue drains to empty, and EXACTLY one upload happened despite two triggers.
    await expect(page.getByTestId('sync-pill')).toHaveCount(0, { timeout: 10000 })
    expect(assetCalls - callsBeforeDrain).toBe(1)
  })
})
