// PersonView — "Show me, me", the on-device face recognizer surface
// (Increment C). Reached from Rafa's iPad tile / Aurelia's lens, or
// directly via ?personview=1. This smoke proves it MOUNTS to the enroll
// step (no faces taught yet) without crashing and is contrast-clean. The
// model load + enroll + scan + recognition is device-only (no CI can run
// on-device ML), and is verified on Jonathan's iPad.
import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'
import { expectNoSeriousA11y } from './_fixtures/axe.js'

test.describe('PersonView — Show me, me', () => {
  test('opens via ?personview=1 to the enroll step', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.goto('/?personview=1&person=aurelia&nosw=1')
    await expect(page.getByTestId('person-view')).toBeVisible()
    await expect(page.getByTestId('person-view-enroll')).toBeVisible()
    // all four family members are offered to teach
    await expect(page.getByTestId('person-enroll-rafa')).toBeVisible()
    await expect(page.getByTestId('person-enroll-aurelia')).toBeVisible()
  })

  test('enroll step has no serious a11y violations', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.goto('/?personview=1&person=rafa&nosw=1')
    await expect(page.getByTestId('person-view-enroll')).toBeVisible()
    await expectNoSeriousA11y(page, {
      include: '[data-testid="person-view-enroll"]',
      label: 'person view enroll',
    })
  })
})
