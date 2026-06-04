import { test } from '../_fixtures/clockStub.js'
import { step, setActivePage, expect } from './_steps.js'
import { seedTripIntoCache, FIXTURE_TRIP } from '../_fixtures/withTrip.js'
import { mockSuccessfulUpload } from '../_fixtures/mockUpload.js'
import { realMedia } from '../_fixtures/realMedia.js'

// Journey 02 — Photo import from the album entry (the one importer).
// Spec source: BUG_TRAP_PUNCHLIST.md A.3 second bullet.
//
// Surface: HelenView → "Photos" album entry → "Import photos" → the bulk
// importer (Stage 3 retired the single-photo dispatch composer). Drives a
// REAL iPhone JPEG through the REAL pipeline (ExifReader → match → downscale →
// upload → render) and asserts it lands in the album grouped under a stop.
//
// We widen the trip's date range so the fixture (whatever its capture date)
// survives the trip-range filter; its real GPS (~41.32/-72.09) matches the
// Beach Bungalow stop at homeBase. Real EXIF is read for real — no override.

// FIXTURE_TRIP with an opened-up window so the real fixture can't be excluded
// by the trip-range filter (the stops/GPS are unchanged).
const WIDE_TRIP = { ...FIXTURE_TRIP, dateRangeStart: '2025-01-01', dateRangeEnd: '2027-12-31' }

test.beforeEach(async ({ page }) => setActivePage(page))

test('photo import from album entry', async ({ page }) => {
  const fx = realMedia('JPEG_FULLRES')
  test.skip(!fx, 'JPEG_FULLRES fixture not present')

  await seedTripIntoCache(page, WIDE_TRIP)
  await mockSuccessfulUpload(page)

  await step('open trip + tap Photos entry', async () => {
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await page.getByTestId('helen-photos-entry').click()
  })

  await step('import the real-media JPEG fixture', async () => {
    await page.getByTestId('import-file-input').setInputFiles({
      name: fx.name,
      mimeType: fx.mimeType,
      buffer: fx.buffer,
    })
  })

  await step('importer files it (smart-skip or confirm) and saves', async () => {
    // The real EXIF drives the match: a clean shot smart-skips straight to a
    // toast; an off-route/after shot shows the confirm summary → Import.
    const confirmGo = page.getByTestId('import-confirm-go')
    await Promise.race([
      confirmGo.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {}),
      page.getByTestId('import-toast').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {}),
    ])
    if (await confirmGo.isVisible().catch(() => false)) {
      await confirmGo.click()
    }
    await expect(page.getByTestId('import-toast')).toContainText(/photos? added/i, {
      timeout: 15_000,
    })
  })

  await step('tile appears grouped under a stop', async () => {
    const stopGroups = page.getByTestId('stop-group')
    await expect(stopGroups.first()).toBeVisible({ timeout: 8000 })
  })
})
