// Trip top bar — the overflow (⋯) menu.
//
// EVERY trip uses the four-tab shell as its navigation (the family-trips home —
// NOT a road-trip app; a road trip is a rare exception, not a different home), so
// the ⋯ menu always sheds what the tabs/home host (Replay → Look back tab; Live
// map → the Now hero; Surprises / Share / Book → the Now-tab home) and keeps only
// the entries with no tab home: Add photos, Show me me, Settings (+ Share a moment,
// whose only after-trip path is the ⋯).

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

  test('ROUTE: ⋯ slims to the SAME set — a road trip is not a different home', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_ROUTE_TRIP)
    await page.goto('/?person=jonathan&trip=roadtrip-2026&nosw=1')

    await expect(page.getByRole('button', { name: /Modify this trip with Claude/i })).toBeVisible()

    await page.getByRole('button', { name: 'More' }).click()
    // The road trip uses the same 4-tab home, so the menu sheds the same road-trip
    // secondary set the tabs/home now host — no full-menu fork for routes.
    await expect(page.getByRole('menuitem', { name: /Replay/i })).toHaveCount(0)
    await expect(page.getByRole('menuitem', { name: /Live map/i })).toHaveCount(0)
    await expect(page.getByRole('menuitem', { name: /Surprises/i })).toHaveCount(0)
    // The kept entries (no tab home) still navigate.
    await expect(page.getByRole('menuitem', { name: /Settings/i })).toBeVisible()
    await page.getByRole('menuitem', { name: /Settings/i }).click()
    await expect(page.getByRole('heading', { name: /Trip Settings/i })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /Settings/i })).toHaveCount(0)
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
