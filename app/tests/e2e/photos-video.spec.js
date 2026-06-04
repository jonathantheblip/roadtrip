import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'
import { resolvePersona } from './_fixtures/persona.js'

// Honors RT_PERSONA (Phase 2 build-list item 1); defaults to 'helen' when
// unset so existing runs stay byte-identical to before.
const PERSONA = resolvePersona('helen')

// The one importer is the SOLE video path (Stage 3 retired the single-photo
// dispatch composer). Video only enters the importer where the WebCodecs
// encode can actually run, so the bulk picker's `accept` includes video/*
// only when VideoEncoder is present — mirroring PhotosView's gate and the
// composer's old hide-the-video-picker behavior. This is the headless-safe
// gating assertion; the real iOS encode end-to-end lives in the Simulator
// gate (tests/simulator/import-video.test.mjs), since Playwright's bundled
// WebKit + Chromium can't run the encode to completion (see that file).

test.describe('Importer — video picker gating', () => {
  test('bulk picker accepts video only when WebCodecs is supported', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.goto(`/?person=${PERSONA}&trip=volleyball-2026&nosw=1`)
    await page.getByTestId(`${PERSONA}-photos-entry`).click()

    // Headless Chromium + Playwright's WebKit both expose VideoEncoder, so
    // the importer offers video alongside photos.
    const input = page.getByTestId('import-file-input')
    await expect(input).toHaveAttribute('accept', 'image/*,video/*')

    // Reload with the WebCodecs API stubbed away → video drops out of the
    // picker's accept (a picked video would otherwise be silently skipped).
    await page.addInitScript(() => {
      delete window.VideoEncoder
      delete window.VideoFrame
    })
    await page.goto(`/?person=${PERSONA}&trip=volleyball-2026&nosw=1`)
    await page.getByTestId(`${PERSONA}-photos-entry`).click()
    await expect(page.getByTestId('import-file-input')).toHaveAttribute('accept', 'image/*')
  })
})
