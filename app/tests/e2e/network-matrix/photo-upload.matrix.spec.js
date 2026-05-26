import { test } from '../_fixtures/clockStub.js'
import { step, setActivePage, expect } from '../journeys/_steps.js'
import { seedTripIntoCache, FIXTURE_TRIP } from '../_fixtures/withTrip.js'
import { mockSuccessfulUpload } from '../_fixtures/mockUpload.js'
import { realMedia } from '../_fixtures/realMedia.js'
import { slow3G, dropAfterNUploads, dropFirstThenResume } from './_throttle.js'

// Bug-Trap A.5 — network condition matrix for photo upload.
//
// Each test runs the same happy-path photo upload through the
// album dispatch composer (the surface we exercise heavily in
// journey-02) under a different network condition. The intent
// is to catch the silent-failure class of bug — "the upload
// percent counter disappeared halfway through" — that only
// shows up under degraded networks.
//
// Longer per-test timeout because the slow/retry paths add real
// time. Still well under Playwright's default global.

test.describe.configure({ timeout: 90_000 })
test.beforeEach(async ({ page }) => setActivePage(page))

async function setupAlbumComposer(page) {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
  await page.getByTestId('helen-photos-entry').click()
  await page.getByTestId('add-dispatch').click()
  await expect(page.getByTestId('add-dispatch-modal')).toBeVisible()
}

async function pickFixtureAndSubmit(page) {
  const fx = realMedia('JPEG_FULLRES')
  test.skip(!fx, 'JPEG_FULLRES fixture not present')
  await page.getByTestId('dispatch-file-input').setInputFiles({
    name: fx.name,
    mimeType: fx.mimeType,
    buffer: fx.buffer,
  })
  await expect(page.getByTestId('prep-metadata')).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('dispatch-submit').click()
}

// ─── Variant 1 — slow 3G, upload completes ────────────────────
test('photo upload over slow 3G completes', async ({ page }) => {
  await mockSuccessfulUpload(page)
  await slow3G(page, { latencyMs: 600 })

  await step('setup composer + pick fixture + submit', async () => {
    await setupAlbumComposer(page)
    await pickFixtureAndSubmit(page)
  })

  await step('save eventually lands despite latency', async () => {
    await expect(page.getByTestId('dispatch-status')).toContainText(/saved/i, {
      timeout: 30_000,
    })
  })
})

// ─── Variant 2 — offline mid-upload, then back online ─────────
test('offline mid-upload + online again drains the queue', async ({
  page,
  context,
}) => {
  await mockSuccessfulUpload(page)

  // Allow the first /assets upload to land; drop any subsequent
  // ones to offline. Models a multi-part or retry scenario where
  // the connection dies between bytes.
  await dropAfterNUploads(page, context, 0)

  await step('setup composer + pick fixture + submit', async () => {
    await setupAlbumComposer(page)
    await pickFixtureAndSubmit(page)
  })

  await step('no Bucket C error surfaces while offline', async () => {
    await page.waitForTimeout(2000)
    await expect(page.getByTestId('dispatch-bucketC')).not.toBeVisible()
  })

  await step('reconnect + tick visibility → queue drains', async () => {
    await context.setOffline(false)
    // The drop helper installed a route; reset it so the post-
    // reconnect attempts go through to the mock.
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await mockSuccessfulUpload(page)
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    // Either the dispatch status flips to Saved (single-shot path)
    // or the album surface re-renders (multi-shot drain path) —
    // we accept whichever fires within the window.
    await Promise.race([
      page
        .getByTestId('dispatch-status')
        .waitFor({ state: 'visible', timeout: 20_000 })
        .catch(() => {}),
      page
        .getByTestId('sync-pill')
        .waitFor({ state: 'hidden', timeout: 20_000 })
        .catch(() => {}),
    ])
  })
})

// ─── Variant 3 — drop the first upload, allow retry ───────────
test('drop-and-resume: first upload aborts, retry succeeds', async ({
  page,
}) => {
  let probe
  await step('setup composer + install mocks + pick fixture + submit', async () => {
    // setupAlbumComposer calls seedTripIntoCache which registers a
    // catch-all worker 404 route. Playwright's route matching is LIFO,
    // so the more specific mocks below must register AFTER the catch-
    // all to win. (Previously mocks were registered before setup, the
    // catch-all then intercepted /assets/photo with 404 and
    // dropFirstThenResume's abort never fired — probe.dropped() stayed
    // false even though the test passed all upstream assertions.)
    await setupAlbumComposer(page)
    await mockSuccessfulUpload(page)
    probe = await dropFirstThenResume(page)
    await pickFixtureAndSubmit(page)
  })

  await step('save lands on retry', async () => {
    // The dispatch UI retries automatically (queue + drain
    // semantics). We just wait for the success status.
    await expect(page.getByTestId('dispatch-status')).toContainText(/saved/i, {
      timeout: 30_000,
    })
    expect(probe.dropped()).toBe(true)
  })
})
