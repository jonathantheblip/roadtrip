import { test, expect } from '@playwright/test'

// Smoke test: app boots, the active trip resolver lands on volleyball
// (its window contains "today" per the system clock during the
// tournament), and the bottom switcher renders all four travelers.
// If this fails, none of the photo-pipeline tests will work either —
// run it first when debugging.
test('app boots and lands on the active trip', async ({ page }) => {
  // Clean storage so the cold-load resolver runs fresh.
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.clear()
    // Re-set the resolved person so we don't blink through the picker.
    localStorage.setItem('rt_person_v2', 'jonathan')
  })
  await page.goto('/?person=jonathan')

  // The trip-switcher select reads "Fun @ the Sun" when the active
  // trip is volleyball-2026. Wait for it — the worker pull can take
  // a beat to hydrate the cache on first load.
  const tripSelect = page.locator('select')
  await expect(tripSelect).toHaveValue('volleyball-2026', { timeout: 10_000 })

  // Bottom switcher renders all four travelers. Constrain to <button>
  // so we don't match the trip-switcher <option> text or the deeper
  // body copy that mentions traveler names.
  for (const name of ['Jonathan', 'Helen', 'Aurelia', 'Rafa']) {
    await expect(page.locator('button', { hasText: name }).first()).toBeVisible()
  }
})
