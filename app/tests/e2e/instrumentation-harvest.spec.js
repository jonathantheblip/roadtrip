import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'
import { mp4FileForRejection } from './_fixtures/photoFixtures.js'
import {
  harvestDevLog,
  silentFailures,
  expectNoSilentFailures,
} from './_fixtures/instrumentation.js'

// Instrumentation harvest tier — QA_COVERAGE_SYSTEM_SPEC.md §4 #4.
// Proves the harvest collects the client dev-log (rt_upload_log_v1) after a
// walk and surfaces SILENT (Bucket A) failures the UI hid. NOT the Phase-3
// capture run — just the working proof.
//
// Non-vacuous: captured-when-silently-failing (a video picked into the photo
// input is Bucket-A 'is-video' — silently reset to the picker, no error panel —
// and the harvest picks the entry up) + clean-when-good (a normal walk leaves
// the dev-log empty).

test.describe('instrumentation harvest — client dev-log', () => {
  test.beforeEach(async ({ page }) => {
    // Deterministic queue state (mirrors photos-dispatch); the dev-log itself
    // starts empty in each fresh Playwright context.
    await page.addInitScript(() => indexedDB.deleteDatabase('roadtrip-upload-queue'))
  })

  test('clean walk leaves an empty dev-log (no false silent failures)', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await page.getByTestId('helen-photos-entry').click()
    await page.getByTestId('add-dispatch').click()
    await expect(page.getByTestId('add-dispatch-modal')).toBeVisible()

    // No failing action taken → the failure-only dev-log stays empty.
    const entries = await harvestDevLog(page)
    expect(entries).toEqual([])
    await expectNoSilentFailures(page, { label: 'clean dispatch open' }) // green
  })

  test('a silently-rejected dispatch IS captured by the harvest (UI stayed silent)', async ({
    page,
  }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await page.getByTestId('helen-photos-entry').click()
    await page.getByTestId('add-dispatch').click()
    const modal = page.getByTestId('add-dispatch-modal')
    await expect(modal).toBeVisible()

    // Pick a VIDEO into the PHOTO input → Bucket A 'is-video': the modal
    // silently resets to the picker (no error panel) and logs the code. This is
    // the canonical swallowed failure — the visual/DOM tier sees nothing wrong.
    await modal.getByTestId('dispatch-file-input').setInputFiles(mp4FileForRejection())

    // UI stayed SILENT: no Bucket-C / error panel, and the rejected video never
    // reached preview — the modal just resets to the picker (the file input is
    // a hidden, click-triggered control, so we assert on what's NOT shown).
    await expect(modal.getByTestId('dispatch-bucketC')).toHaveCount(0)
    await expect(modal.getByTestId('dispatch-preview-image')).toHaveCount(0)
    await expect(modal).toBeVisible()

    // THE HARVEST captured the swallowed Bucket-A failure the UI hid.
    await expect
      .poll(async () => silentFailures(await harvestDevLog(page)).length, { timeout: 5000 })
      .toBeGreaterThan(0)

    // ASSERT-mode gate fires on the real silent failure (non-vacuous): with the
    // Bucket-A entry present, expectNoSilentFailures must throw.
    let threw = false
    try {
      await expectNoSilentFailures(page, { label: 'video-into-photo-input' })
    } catch {
      threw = true
    }
    expect(threw).toBe(true)
  })
})
