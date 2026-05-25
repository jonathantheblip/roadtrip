import { test } from '@playwright/test'
import { step, setActivePage, expect } from './_steps.js'
import { seedTripIntoCache, FIXTURE_TRIP } from '../_fixtures/withTrip.js'
import { realMedia } from '../_fixtures/realMedia.js'
import { WEBKIT_IDB_BLOB_REASON } from '../_fixtures/webkitIdbBlobGate.js'

// Journey 07 — Offline upload queue.
// Spec source: BUG_TRAP_PUNCHLIST.md A.3 seventh bullet.
//
// Flow: go offline → pick photo → save → tile shows with queued
// state → online → drain → tile flips out of queued state.
//
// This is the network-condition probe that the wider Item A.5
// matrix expands into multiple variants (slow 3G, mid-drop,
// drop-and-resume). Journey 07 is the canonical happy-path
// offline-then-online case.

test.beforeEach(async ({ page }) => setActivePage(page))

test('offline upload queues + drains on reconnect', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(browserName === 'webkit', WEBKIT_IDB_BLOB_REASON)
  const fx = realMedia('JPEG_FULLRES')
  test.skip(!fx, 'JPEG_FULLRES fixture not present')

  await seedTripIntoCache(page, FIXTURE_TRIP)

  // Stateful mock: fail while `simulateOffline` is true (so the upload
  // queues), succeed after we flip it (so the drain clears the queue).
  // mockSuccessfulUpload would unconditionally return 200, which makes
  // the offline-then-online dance impossible to assert.
  let simulateOffline = true
  await page.route(
    /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/assets\/(photo|video)/,
    async (route) => {
      if (simulateOffline) {
        await route.fulfill({
          status: 503,
          body: '{"error":"offline simulated"}',
          contentType: 'application/json',
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          key: 'helen/journey07/photo',
          url: 'https://example.test/journey07/photo',
          mime: 'image/jpeg',
        }),
      })
    }
  )

  await step('open trip view + Photos album', async () => {
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await page.getByTestId('helen-photos-entry').click()
  })

  await step('go offline before saving', async () => {
    await context.setOffline(true)
  })

  await step('open dispatch composer + pick fixture', async () => {
    await page.getByTestId('add-dispatch').click()
    await page.getByTestId('dispatch-file-input').setInputFiles({
      name: fx.name,
      mimeType: fx.mimeType,
      buffer: fx.buffer,
    })
    await expect(page.getByTestId('prep-metadata')).toBeVisible({
      timeout: 15_000,
    })
  })

  await step('save while offline — should land queued, no error', async () => {
    await page.getByTestId('dispatch-submit').click()
    // The dispatch surface should NOT show one of the three
    // Bucket C error strings. Per the user-facing error policy,
    // network drops queue silently.
    const errorBubble = page.getByTestId('dispatch-bucketC')
    await expect(errorBubble).not.toBeVisible()
  })

  await step('sync pill shows queued count', async () => {
    // PhotosView's sync pill increments when items land in the
    // upload queue.
    const pill = page.getByTestId('sync-pill')
    await expect(pill).toBeVisible({ timeout: 10_000 })
  })

  await step('reconnect — queue drains, pill clears', async () => {
    await context.setOffline(false)
    simulateOffline = false
    // Drain hooks listen to `online` event + page-visibility +
    // a 120s backstop. Toggle hidden → visible explicitly because
    // App.jsx's onVisibility only runs on the visible transition.
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
    const pill = page.getByTestId('sync-pill')
    // Either the pill disappears (queue empty) or its text falls
    // to 0. Both reflect drain success.
    await expect(pill).toBeHidden({ timeout: 30_000 })
  })
})
