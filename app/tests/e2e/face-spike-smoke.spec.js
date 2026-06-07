// FaceSpike is the flag-gated (?facespike=1) prove-it screen for the
// Increment C on-device face recognizer — a DIAGNOSTIC, not a shipping
// surface (it'll be superseded by PersonView). This smoke spec proves
// it MOUNTS without crashing and is contrast-clean per the project's
// "always axe-gate a new full-screen view" rule. The actual model load
// + face inference is device-only — no CI can prove on-device ML, so
// this spec deliberately does NOT click "Load the face models".
// (Temporary: remove alongside the spike when PersonView lands.)
import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'
import { expectNoSeriousA11y } from './_fixtures/axe.js'

test.describe('FaceSpike — on-device recognizer prove-it screen', () => {
  test('mounts behind ?facespike=1 with the load control', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.goto('/?facespike=1&person=rafa&nosw=1')
    await expect(page.getByTestId('face-spike')).toBeVisible()
    await expect(page.getByTestId('face-spike-load')).toBeVisible()
  })

  test('has no serious a11y violations', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.goto('/?facespike=1&person=rafa&nosw=1')
    await expect(page.getByTestId('face-spike')).toBeVisible()
    await expectNoSeriousA11y(page, {
      include: '[data-testid="face-spike"]',
      label: 'face spike',
    })
  })
})
