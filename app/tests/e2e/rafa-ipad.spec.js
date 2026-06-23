// Rafa's iPad command-center home + the Adventure Map. These surfaces render
// ONLY on a wide touch screen (App.jsx useIsIpad = min-width:768 + pointer:coarse),
// so this spec runs in an iPad device context — unlike the rest of the suite,
// which runs at the chromium desktop / iPhone viewports where Rafa keeps RafaView.
// Clock is pinned (clockStub) so FIXTURE_TRIP is "active" → auto-opens to the home.
import { test, expect } from './_fixtures/clockStub.js'
import { devices } from '@playwright/test'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'
import { expectNoSeriousA11y } from './_fixtures/axe.js'

test.use({ ...devices['iPad (gen 7) landscape'] })

test.describe('Rafa iPad — home + Adventure Map', () => {
  test('home renders; the map opens, reveals a stop, and closes', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.goto('/?person=rafa&nosw=1')

    // the quadrant home (not RafaView) renders, with the Adventure-Map tile
    await expect(page.getByTestId('rafa-pad-grid')).toBeVisible()
    await expect(page.getByTestId('rafa-map-tile')).toBeVisible()

    // tap the map tile → the storybook map opens
    await page.getByTestId('rafa-map-tile').click()
    await expect(page.getByTestId('rafa-map')).toBeVisible()

    // tap a landmark → its reveal card names the place
    await page.getByRole('button', { name: /Our room/ }).first().click()
    await expect(page.getByText('Our room!')).toBeVisible()

    // close the card, then back out of the map
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByText('Our room!')).toHaveCount(0)
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.getByTestId('rafa-map')).toHaveCount(0)
    await expect(page.getByTestId('rafa-pad-grid')).toBeVisible()
  })

  test('home has no serious a11y violations (candy-tile contrast)', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.goto('/?person=rafa&nosw=1')
    await expect(page.getByTestId('rafa-pad-grid')).toBeVisible()
    await expectNoSeriousA11y(page, { include: '[data-testid="rafa-pad"]', label: 'rafa ipad home' })
  })

  test('the Adventure Map overlay has no serious a11y violations', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.goto('/?person=rafa&nosw=1')
    await page.getByTestId('rafa-map-tile').click()
    await expect(page.getByTestId('rafa-map')).toBeVisible()
    await expectNoSeriousA11y(page, { include: '[data-testid="rafa-map"]', label: 'rafa adventure map' })
  })

  test('the family rides the Adventure Map; tapping one opens the reveal', async ({ page }) => {
    const STUB = Date.parse('2026-05-23T12:00:00.000Z')
    const row = (traveler, bucket, ago) => ({ tripId: FIXTURE_TRIP.id, traveler, precise: false, lat: null, lng: null, placeBucket: bucket, note: null, updatedAt: STUB - ago, createdAt: STUB - 3_600_000 })
    await seedTripIntoCache(page, FIXTURE_TRIP)
    page.route(/workers\.dev\/presence(\?.*)?$/, (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
            row('helen', 'at_place', 30_000), row('jonathan', 'out', 60_000),
            row('aurelia', 'out', 3 * 60 * 60_000), row('rafa', 'at_place', 20_000),
          ]) })
        : route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }))
    await page.goto('/?person=rafa&nosw=1')
    await page.getByTestId('rafa-map-tile').click()
    await expect(page.getByTestId('rafa-map')).toBeVisible()
    // the family bubbles ride the map (labelled by nickname + state)
    await expect(page.getByRole('button', { name: /Mama/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Papa/ })).toBeVisible()
    await page.screenshot({ path: 'tests/e2e/screenshots/rafa-map-family.png' })
    // tap a face → the same warm reveal as the phone
    await page.getByRole('button', { name: /Papa/ }).click()
    await expect(page.getByRole('dialog')).toContainText('Papa')
  })
})
