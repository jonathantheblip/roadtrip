import { test, expect } from './_fixtures/clockStub.js'

// Smoke test: app boots, the active trip resolver lands on volleyball
// (its window contains "today" per the system clock during the
// tournament), and the trip's bottom navigation renders.
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

  // The trip's bottom navigation renders. Shape-agnostic: a STAY shows the
  // 4-tab StayTabBar (the recenter hides the FamilyDock there), a route/index
  // shows the dock pills — accept either so this canary isn't coupled to the
  // live active trip's shape. (The dock's all-four-personas invariant is
  // guarded by switcher-enrolled.spec.js on a route fixture.)
  await expect(page.locator('.stay-tabbar, .switcher').first()).toBeVisible()
})
