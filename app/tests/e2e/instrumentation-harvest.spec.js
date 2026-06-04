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
// Non-vacuous: captured-when-silently-failing (an UNENCODABLE video picked into
// the importer is skipped silently — no error panel, the batch just finds
// nothing new — and ImportFlow logs 'video-encode-failed' which the harvest
// picks up) + clean-when-good (opening the importer with no failing action
// leaves the failure-only dev-log empty). Swapped from the retired dispatch
// composer's video-into-photo-input reject to the importer's silent video-skip.

test.describe('instrumentation harvest — client dev-log', () => {
  test.beforeEach(async ({ page }) => {
    // Deterministic queue state; the dev-log itself starts empty in each fresh
    // Playwright context.
    await page.addInitScript(() => indexedDB.deleteDatabase('roadtrip-upload-queue'))
  })

  test('clean walk leaves an empty dev-log (no false silent failures)', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await page.getByTestId('helen-photos-entry').click()
    await expect(page.getByTestId('import-photos')).toBeVisible()

    // No failing action taken → the failure-only dev-log stays empty.
    const entries = await harvestDevLog(page)
    expect(entries).toEqual([])
    await expectNoSilentFailures(page, { label: 'clean importer open' }) // green
  })

  test('a silently-skipped unencodable video IS captured by the harvest (UI stayed silent)', async ({
    page,
  }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await page.getByTestId('helen-photos-entry').click()
    await expect(page.getByTestId('import-photos')).toBeVisible()

    // Import a video the encoder can't decode (an ftyp-only mp4 with no tracks).
    // ImportFlow's encode throws at the <video> metadata stage; the clip is
    // skipped SILENTLY — no error panel, the batch just finds nothing new — and
    // ImportFlow logs 'video-encode-failed' (Bucket A). The visual/DOM tier sees
    // nothing wrong; only the dev-log records it.
    await page.getByTestId('import-file-input').setInputFiles(mp4FileForRejection())

    // UI stayed SILENT: the importer fell back to the album (no error surface,
    // at most a quiet "nothing new" toast).
    await expect(page.getByTestId('import-photos')).toBeVisible({ timeout: 10_000 })

    // THE HARVEST captured the swallowed Bucket-A failure the UI hid.
    await expect
      .poll(async () => silentFailures(await harvestDevLog(page)).length, { timeout: 8000 })
      .toBeGreaterThan(0)

    // ASSERT-mode gate fires on the real silent failure (non-vacuous): with the
    // Bucket-A entry present, expectNoSilentFailures must throw.
    let threw = false
    try {
      await expectNoSilentFailures(page, { label: 'unencodable-video-skip' })
    } catch {
      threw = true
    }
    expect(threw).toBe(true)
  })
})
