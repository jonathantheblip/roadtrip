import { test, expect } from '@playwright/test'
import {
  seedTripIntoCache,
  FIXTURE_TRIP,
} from './_fixtures/withTrip.js'
import { redPhotoFile } from './_fixtures/photoFixtures.js'

// M4 acceptance — Background Sync fallback (Page Visibility +
// interval + online event). Plays the actual end-to-end story:
// Helen loses signal, picks a photo, signal comes back, app drains
// without her doing anything.
//
// Background Sync API itself is not available in iOS Safari, so the
// app relies on the fallback path. Headless Chromium DOES have
// SyncManager, but for this test we toggle offline/online via
// context.setOffline + visibilitychange so the assertion holds
// across both code paths.

test.describe('Photos upload — offline drain (M4)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => indexedDB.deleteDatabase('roadtrip-upload-queue'))
  })

  test('offline pick → queue populates → online + foreground → drain to zero', async ({
    page,
    context,
  }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)

    // Mock the asset upload endpoint to count attempts. The catch-all
    // in seedTripIntoCache 404s anything else from the Worker host;
    // we install this more-specific route first so Playwright's LIFO
    // routing reaches it before the catch-all.
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
          body: JSON.stringify({
            key: 'helen/test/drain-photo',
            url: 'https://example.test/drain-photo',
            mime: 'image/jpeg',
          }),
        })
      }
    )

    await page.goto('/?person=helen&trip=volleyball-2026')

    // Take the upload offline (simulated via 500 from the Worker
    // mock). context.setOffline would also work but the network
    // route gives us a deterministic signal of "the upload was
    // attempted but failed."
    nextResponseStatus = 503

    await page.getByTestId('helen-photos-entry').click()
    await page.getByTestId('add-dispatch').click()
    const modal = page.getByTestId('add-dispatch-modal')
    await modal.getByTestId('dispatch-file-input').setInputFiles(redPhotoFile())
    await modal.getByTestId('dispatch-caption').fill('Queued during outage')
    await modal.getByTestId('dispatch-submit').click()
    // Composer pivots to 'done' silently (Bucket A — no error UI).
    await expect(modal.getByTestId('dispatch-status')).toContainText('Saved', {
      timeout: 8000,
    })
    await modal.getByRole('button', { name: 'Close' }).click()

    // Sync pill in the album header now shows 1 item pending.
    await expect(page.getByTestId('sync-pill')).toBeVisible()
    await expect(page.getByTestId('sync-pill')).toContainText(/1 syncing/i)
    expect(assetCalls).toBeGreaterThanOrEqual(1) // initial attempt
    const callsBeforeDrain = assetCalls

    // Signal comes back. Flip the mock to 200, then trigger a
    // visibility change — App.jsx's onVisibility handler should call
    // runDrain, which calls uploadQueue.drain, which retries.
    nextResponseStatus = 200
    await page.evaluate(() => {
      // Simulate the tab going hidden then visible. The drain handler
      // only runs on the visible transition.
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

    // Pill drops to zero on its own — no manual tap required.
    await expect(page.getByTestId('sync-pill')).toHaveCount(0, { timeout: 8000 })
    // The drain genuinely retried — call count went up.
    expect(assetCalls).toBeGreaterThan(callsBeforeDrain)
  })

  test('SW message → drain fires (Background Sync fallback path)', async ({
    page,
  }) => {
    // Posting `{ type: 'drain-upload-queue' }` to the page from the
    // SW (or anywhere) should kick off a drain. This is the same
    // message the SW's sync event handler posts.
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
          body: JSON.stringify({
            key: 'helen/test/sw-drain',
            url: 'https://example.test/sw-drain',
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
    const callsBeforeDrain = assetCalls

    // Connectivity returns; simulate the SW posting a drain message.
    respondWith = 200
    await page.evaluate(() => {
      // The App listens for 'message' on navigator.serviceWorker. We
      // dispatch a synthetic MessageEvent directly onto that target so
      // the listener fires without needing a real SW running.
      const target = navigator.serviceWorker
      const evt = new MessageEvent('message', {
        data: { type: 'drain-upload-queue', tag: 'rt-upload-queue' },
      })
      target.dispatchEvent(evt)
    })

    await expect(page.getByTestId('sync-pill')).toHaveCount(0, { timeout: 8000 })
    expect(assetCalls).toBeGreaterThan(callsBeforeDrain)
  })
})
