import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'

// BUG 1 regression — the trip-home top bar must NOT repeat the trip title
// (that doubled the title with the persona masthead below it). It now carries
// a compact "Trips ▾" switcher; the masthead is the sole title band. The bar's
// navigation (back, switcher, ⋯) is preserved.
test('trip-home top bar shows the compact switcher, not a duplicate title', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')

  const topbar = page.getByTestId('trip-topbar')
  await expect(topbar).toBeVisible()
  // Compact switcher label present (it replaced the old in-bar title band).
  await expect(topbar).toContainText('Trips')
  // The switcher still works — the native <select> carries the active trip id.
  await expect(topbar.locator('select')).toHaveValue('volleyball-2026')
  // Back-to-trips affordance preserved (the ae4545a aria-label dependency).
  await expect(page.getByRole('button', { name: 'Back to trips' })).toBeVisible()
  // The trip title still renders once — in the persona masthead, not the bar.
  await expect(page.getByText('FUN @ THE SUN', { exact: true })).toBeVisible()
})
