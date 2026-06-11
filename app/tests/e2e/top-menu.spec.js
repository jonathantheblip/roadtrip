// Trip top bar — the overflow (⋯) menu.
//
// The bar was overcrowded on a phone (back, title, Claude, Replay, Map, Weave,
// Book, Settings) and collided. Now: back/title + Modify-with-Claude + ✦ Weave
// stay visible; Replay / Map / Book / Settings collapse into a ⋯ menu.

import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'

test.describe('Top bar — overflow ⋯ menu', () => {
  test('primary actions stay visible; ⋯ opens the secondary entries and an item navigates', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.goto('/?person=jonathan&trip=volleyball-2026&nosw=1')

    // Primary actions stay on the bar.
    await expect(page.getByRole('button', { name: /Modify this trip with Claude/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Weave/i }).first()).toBeVisible()

    // ⋯ opens the overflow with the secondary entries.
    await page.getByRole('button', { name: 'More' }).click()
    await expect(page.getByRole('menuitem', { name: /Replay/i })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /Live map/i })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /Settings/i })).toBeVisible()

    // An item navigates and the menu closes.
    await page.getByRole('menuitem', { name: /Replay/i }).click()
    await expect(page.locator('.rpl-root')).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /Replay/i })).toHaveCount(0)
  })

  test('tapping the backdrop closes the menu without navigating', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.goto('/?person=jonathan&trip=volleyball-2026&nosw=1')

    await page.getByRole('button', { name: 'More' }).click()
    await expect(page.getByRole('menuitem', { name: /Settings/i })).toBeVisible()

    await page.getByTestId('top-menu-backdrop').click()
    await expect(page.getByRole('menuitem', { name: /Settings/i })).toHaveCount(0)
    // Still on the trip view — no navigation happened.
    await expect(page.getByTestId('trip-topbar')).toBeVisible()
  })
})
