import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, FIXTURE_ROUTE_TRIP } from './_fixtures/withTrip.js'

// Enrolled-only persona switcher (close-the-door step 2). The dock offers only
// personas this device holds a credential for + an "add a family member" pill when
// it's genuinely narrowed. Post-cutover the credential is a per-device SESSION; the
// e2e harness seeds a session for ALL FOUR personas (playwright.config storageState),
// so every persona is credentialed → the dock is UNCHANGED and the add pill is
// ABSENT. This guards that all-enrolled invariant (the narrowing logic, which fires
// when a device holds only SOME sessions, is unit-tested in
// scripts/__tests__/auth.test.mjs).

// EVERY trip now uses the 4-tab StayTabBar (the family-trips home — not a road-trip
// app), so the FamilyDock + this enrolled-only invariant live on the between-trips
// INDEX, where the persona pills are the nav. Land on the index to assert it.
test('all-enrolled: the dock shows all four personas and no "add" pill', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_ROUTE_TRIP)
  await page.goto('/?person=jonathan&nosw=1')
  // The seeded trip is active today, so step back to the trips index where the dock shows.
  await page.getByRole('button', { name: /trips/i }).first().click()

  const dock = page.locator('.switcher')
  await expect(dock).toBeVisible()
  // All four persona pills are offered (credentialed via the still-bundled tokens).
  for (const name of [/Jonathan/, /Helen/, /Aurelia/, /Rafa/]) {
    await expect(dock.getByRole('button', { name })).toBeVisible()
  }
  // The narrowing is a no-op pre-cutover → the "add a family member" pill is absent.
  await expect(page.getByTestId('switcher-add')).toHaveCount(0)
})
