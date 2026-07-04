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
// Non-vacuous, two ways: (1) captured-and-SURFACED — an UNENCODABLE video picked
// into the importer is no longer skipped silently; foolproof-video (#2) surfaces
// it as the warm "couldn't add" confirm banner AND logs 'video-encode-failed'
// (Bucket C — surfaced) which the harvest picks up, leaving NO silent (Bucket A)
// failure; (2) the gate still BITES — a genuine synthetic Bucket-A entry makes
// expectNoSilentFailures throw. Plus clean-when-good (an importer open with no
// failing action leaves the failure-only dev-log empty).

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

  test('an unencodable video is SURFACED (couldn\'t-add) + traced, leaving no silent failure', async ({
    page,
  }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await page.getByTestId('helen-photos-entry').click()
    await expect(page.getByTestId('import-photos')).toBeVisible()

    // Import a video the encoder can't decode (an ftyp-only mp4 with no tracks).
    // ImportFlow's encode throws at the <video> metadata stage. Foolproof-video
    // (#2) turned this from a SILENT skip into a SURFACED outcome: it forces the
    // confirm with the warm "couldn't add" banner + a retry, and logs
    // 'video-encode-failed' (now Bucket C — surfaced) for diagnostics.
    await page.getByTestId('import-file-input').setInputFiles(mp4FileForRejection())

    // The failure is now SHOWN, not hidden: the confirm surfaces the couldn't-add
    // banner (the family sees it), instead of a silent fall-back to the album.
    await expect(page.getByTestId('import-confirm')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('import-confirm')).toContainText(/couldn.t be added/i)

    // Still fully TRACED: the harvest picks up the import-video-encode failure
    // entry (its code is decode-failed / video-encode-failed depending on where the
    // encode broke — assert by the stable context phase, not the specific code).
    await expect
      .poll(
        async () =>
          (await harvestDevLog(page)).filter((e) => e.context?.phase === 'import-video-encode').length,
        { timeout: 8000 }
      )
      .toBeGreaterThan(0)

    // And it leaves NO silent (Bucket A) failure — the whole point of the work: a
    // video failure is surfaced, never swallowed. The standing gate stays green.
    await expectNoSilentFailures(page, { label: 'unencodable-video (now surfaced)' })
  })

  test('the gate still BITES: a genuine silent (Bucket A) failure is caught', async ({ page }) => {
    // Keep the standing gate non-vacuous now that the video case is surfaced: a
    // real silent failure (e.g. a 'network' drop that auto-queued — Bucket A, no
    // error UI) must still trip expectNoSilentFailures. Seed one exactly as
    // logUploadEvent would write it, then prove the gate throws.
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await page.evaluate(() => {
      const entry = {
        ts: new Date().toISOString(),
        code: 'network',
        bucket: 'A',
        outcome: null,
        message: 'simulated silent drop',
        context: { phase: 'synthetic-bucket-a' },
      }
      localStorage.setItem('rt_upload_log_v1', JSON.stringify([entry]))
    })
    expect(silentFailures(await harvestDevLog(page)).length).toBeGreaterThan(0)
    let threw = false
    try {
      await expectNoSilentFailures(page, { label: 'synthetic silent A' })
    } catch {
      threw = true
    }
    expect(threw).toBe(true)
  })
})
