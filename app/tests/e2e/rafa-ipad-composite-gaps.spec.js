// Rafa's composite-trip gaps on the IPAD-only surfaces (RafaPad's place tile,
// RafaMap's empty-state). See rafa-composite-gaps.spec.js for the phone
// (RafaView) case — split into its own file because Playwright forces a new
// worker for a device-context test.use(), which can't sit in a nested
// describe alongside non-device tests (mirrors rafa-ipad.spec.js's own
// top-level test.use pattern).
import { test, expect } from './_fixtures/clockStub.js'
import { devices } from '@playwright/test'
import { seedTripIntoCache } from './_fixtures/withTrip.js'

test.use({ ...devices['iPad (gen 7) landscape'] })

const COMPOSITE_NO_STOPS = {
  id: 'rafa-composite-2026',
  status: 'planning',
  title: 'Two Cities',
  dateRangeStart: '2026-05-22',
  dateRangeEnd: '2026-05-26',
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
  parts: [
    { id: 'p-a', type: 'city', title: 'First stop', place: 'Providence, RI', dateStart: '2026-05-22', dateEnd: '2026-05-24' },
    { id: 'p-b', type: 'city', title: 'Second stop', place: 'Newport, RI', dateStart: '2026-05-25', dateEnd: '2026-05-26' },
  ],
  days: [],
}

test.describe('Rafa iPad — composite trip with no featured stop', () => {
  test("RafaPad's place tile shows the current leg, not the whole trip", async ({ page }) => {
    await seedTripIntoCache(page, COMPOSITE_NO_STOPS)
    await page.goto('/?person=rafa&nosw=1')
    const tile = page.getByTestId('rafa-pad-place-tile')
    await expect(tile).toBeVisible({ timeout: 10000 })
    await expect(tile).toContainText('Providence, RI')
  })

  test("RafaMap's empty-state (zero stops) shows the current leg's place, not a degenerate empty road", async ({ page }) => {
    await seedTripIntoCache(page, COMPOSITE_NO_STOPS)
    await page.goto('/?person=rafa&nosw=1')
    await page.getByTestId('rafa-map-tile').click()
    const map = page.getByTestId('rafa-map')
    await expect(map).toBeVisible({ timeout: 10000 })
    await expect(map).toContainText('Providence, RI')
  })
})
