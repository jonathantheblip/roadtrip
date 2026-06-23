// Rafa "Who's around" (slice 8 follow-up) — the kid diorama. Reads the SAME
// presence data as the band (worker boundary covered in worker/test/presence.test.js).
// Here we prove Rafa's surface: the two-zone scene renders the family from real
// presence, tapping a face opens the warm reveal, and the wave is local delight.
import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'
import { expectNoSeriousA11y } from './_fixtures/axe.js'

const TRIP = FIXTURE_TRIP.id
const STUB = Date.parse('2026-05-23T12:00:00.000Z')

// Mama home + live, Papa out + live, Sissy out + idle, Rafa (me) home + live.
function presenceRows() {
  return [
    { tripId: TRIP, traveler: 'helen', precise: false, lat: null, lng: null, placeBucket: 'at_place', note: null, updatedAt: STUB - 30_000, createdAt: STUB - 3_600_000 },
    { tripId: TRIP, traveler: 'jonathan', precise: false, lat: null, lng: null, placeBucket: 'out', note: null, updatedAt: STUB - 60_000, createdAt: STUB - 3_600_000 },
    { tripId: TRIP, traveler: 'aurelia', precise: false, lat: null, lng: null, placeBucket: 'out', note: null, updatedAt: STUB - 3 * 60 * 60_000, createdAt: STUB - 3_600_000 },
    { tripId: TRIP, traveler: 'rafa', precise: false, lat: null, lng: null, placeBucket: 'at_place', note: null, updatedAt: STUB - 20_000, createdAt: STUB - 3_600_000 },
  ]
}

async function openRafa(page) {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  page.route(/workers\.dev\/presence(\?.*)?$/, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(presenceRows()) })
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    }
  })
  await page.goto(`/?person=rafa&trip=${TRIP}&nosw=1`)
  await expect(page.getByTestId('rafa-whos-around')).toBeVisible({ timeout: 10000 })
}

test.describe("Rafa — Who's around (the diorama)", () => {
  test('the diorama renders the family across the two zones, and passes axe', async ({ page }) => {
    await openRafa(page)
    const scene = page.getByTestId('rafa-whos-around')
    await expect(scene).toContainText("Where’s everybody?")
    await expect(scene).toContainText('Special house')
    await expect(scene).toContainText('Out & about')
    // The four family bubbles are tappable, labelled by nickname + state.
    await expect(page.getByRole('button', { name: /Mama/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Papa/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Sissy/ })).toBeVisible()
    await page.screenshot({ path: 'tests/e2e/screenshots/rafa-whos-around.png' })
    await expectNoSeriousA11y(page)
  })

  test('tapping a face opens the reveal; the wave is local delight', async ({ page }) => {
    await openRafa(page)
    await page.getByRole('button', { name: /Mama/ }).click()
    const modal = page.getByRole('dialog')
    await expect(modal).toContainText('Mama')
    await expect(modal).toContainText('at the special house')
    await expect(modal).toContainText('here right now')
    await page.screenshot({ path: 'tests/e2e/screenshots/rafa-whos-around-reveal.png' })
    await page.getByRole('button', { name: 'Wave hi!' }).click()
    await expect(modal).toContainText('Wave sent to Mama')
  })

  test('tapping yourself shows "that\'s you" with no wave button', async ({ page }) => {
    await openRafa(page)
    await page.getByRole('button', { name: /me —/ }).click()
    const modal = page.getByRole('dialog')
    await expect(modal).toContainText("that’s you")
    await expect(modal.getByRole('button', { name: 'Wave hi!' })).toHaveCount(0)
  })
})
