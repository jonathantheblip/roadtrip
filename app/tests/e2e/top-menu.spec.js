// Trip top bar — the overflow (⋯) menu.
//
// The menu is shape-aware. On a ROUTE trip it holds the full secondary set
// (Replay / Live map / Surprises / Share a moment / Add photos / Book /
// Show me, me / Settings). On a STAY the four-tab shell IS the navigation, so
// the menu sheds everything the tabs already host (Replay → Look back tab;
// Live map → route-only; Surprises / Share / Book → the Now-tab home band) and
// keeps only the entries with no tab home: Add photos, Show me me, Settings.

import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, FIXTURE_TRIP, FIXTURE_ROUTE_TRIP } from './_fixtures/withTrip.js'

test.describe('Top bar — overflow ⋯ menu', () => {
  test('STAY: ⋯ keeps only the entries with no tab home', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.goto('/?person=jonathan&trip=volleyball-2026&nosw=1')

    // Primary action stays on the bar.
    await expect(page.getByRole('button', { name: /Modify this trip with Claude/i })).toBeVisible()

    await page.getByRole('button', { name: 'More' }).click()
    // Kept — no full tab/home-band home. Share a moment stays because the home
    // band offers it only DURING the trip; the ⋯ is its after-trip path.
    await expect(page.getByRole('menuitem', { name: /Share a moment/i })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /Add photos/i })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /Show me, me/i })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /Settings/i })).toBeVisible()
    // Shed onto the tabs / Now-tab home band — gone from the stay menu.
    await expect(page.getByRole('menuitem', { name: /Replay/i })).toHaveCount(0)
    await expect(page.getByRole('menuitem', { name: /Live map/i })).toHaveCount(0)
    await expect(page.getByRole('menuitem', { name: /Surprises/i })).toHaveCount(0)

    // An item navigates and the menu closes.
    await page.getByRole('menuitem', { name: /Settings/i }).click()
    await expect(page.getByRole('heading', { name: /Trip Settings/i })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /Settings/i })).toHaveCount(0)
  })

  test('ROUTE: ⋯ holds the full secondary set and an item navigates', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_ROUTE_TRIP)
    await page.goto('/?person=jonathan&trip=roadtrip-2026&nosw=1')

    await expect(page.getByRole('button', { name: /Modify this trip with Claude/i })).toBeVisible()

    await page.getByRole('button', { name: 'More' }).click()
    await expect(page.getByRole('menuitem', { name: /Replay/i })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /Live map/i })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /Settings/i })).toBeVisible()

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
