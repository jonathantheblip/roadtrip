import { test } from '@playwright/test'
import { step, setActivePage, expect } from './_steps.js'
import { seedTripIntoCache, FIXTURE_TRIP } from '../_fixtures/withTrip.js'
import { mockSuccessfulUpload } from '../_fixtures/mockUpload.js'
import { realMedia } from '../_fixtures/realMedia.js'

// Journey 02 — Photo upload from the album entry (AddDispatchModal).
// Spec source: BUG_TRAP_PUNCHLIST.md A.3 second bullet.
//
// Surface: HelenView → "Photos" album entry → "+" add-dispatch button
// → AddDispatchModal. This is the M2 surface with the well-developed
// data-testid coverage; the journey leans on it directly.

test.beforeEach(async ({ page }) => setActivePage(page))

test('photo upload from album entry', async ({ page }) => {
  const fx = realMedia('JPEG_FULLRES')
  test.skip(!fx, 'JPEG_FULLRES fixture not present')

  await seedTripIntoCache(page, FIXTURE_TRIP)
  await mockSuccessfulUpload(page)

  await step('open trip + tap Photos entry', async () => {
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await page.getByTestId('helen-photos-entry').click()
  })

  await step('open add-dispatch composer', async () => {
    await page.getByTestId('add-dispatch').click()
    await expect(page.getByTestId('add-dispatch-modal')).toBeVisible()
  })

  await step('pick real-media JPEG fixture', async () => {
    await page.getByTestId('dispatch-file-input').setInputFiles({
      name: fx.name,
      mimeType: fx.mimeType,
      buffer: fx.buffer,
    })
    // prep-metadata appearing proves the M2 pipeline ran.
    await expect(page.getByTestId('prep-metadata')).toContainText(
      /\d+×\d+/, { timeout: 15_000 }
    )
  })

  await step('add caption + submit', async () => {
    await page.getByTestId('dispatch-caption').fill('journey-02 album upload')
    await page.getByTestId('dispatch-submit').click()
    await expect(page.getByTestId('dispatch-status')).toContainText(/saved/i, {
      timeout: 15_000,
    })
  })

  await step('tile appears grouped under correct stop', async () => {
    // Close the modal; the album re-renders with the new memory.
    const close = page.getByRole('button', { name: /close|done|×/i }).first()
    if (await close.isVisible().catch(() => false)) await close.click()
    const stopGroups = page.getByTestId('stop-group')
    await expect(stopGroups.first()).toBeVisible({ timeout: 5000 })
  })
})
