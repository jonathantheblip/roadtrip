import { test } from './_fixtures/clockStub.js'
import { seedTripIntoCache, seedMemoriesIntoCache, FIXTURE_TRIP, TINY_RED_PNG_DATA_URL } from './_fixtures/withTrip.js'

// Capture screenshots of each Photos surface for the verify-in-DOM
// requirement. Output lands in app/tests/e2e/screenshots/. Not asserted
// — the test passes as long as the surfaces render.

const SHOT_DIR = 'tests/e2e/screenshots'

test.describe('Photos surfaces — visual capture', () => {
  test('empty Photos view (Helen)', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.goto('/?person=helen&trip=volleyball-2026')
    await page.getByTestId('helen-photos-entry').click()
    await page.waitForSelector('[data-testid="add-dispatch"]')
    await page.screenshot({ path: `${SHOT_DIR}/photos-empty-helen.png`, fullPage: true })
  })

  test('populated Photos view + lightbox (Helen)', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [
      photoMemory({ id: 'm1', stopId: 'vb2-3', author: 'helen', caption: 'Warmup', createdAt: '2026-05-23T19:50:00Z' }),
      photoMemory({ id: 'm2', stopId: 'vb2-3', author: 'jonathan', caption: 'Aurelia serving', createdAt: '2026-05-23T20:30:00Z' }),
      photoMemory({ id: 'm3', stopId: 'vb3-4', author: 'aurelia', caption: 'Court 3 Sunday', createdAt: '2026-05-24T20:05:00Z' }),
    ])
    await page.goto('/?person=helen&trip=volleyball-2026')
    await page.getByTestId('helen-photos-entry').click()
    await page.waitForSelector('[data-testid="photo-tile"]')
    await page.screenshot({ path: `${SHOT_DIR}/photos-populated-helen.png`, fullPage: true })

    await page.getByTestId('photo-tile').first().click()
    await page.waitForSelector('[data-testid="photo-lightbox"]')
    await page.screenshot({ path: `${SHOT_DIR}/photos-lightbox.png`, fullPage: true })
  })

  test('Photos entry on every themed view', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    for (const person of ['jonathan', 'helen', 'aurelia', 'rafa']) {
      await page.goto(`/?person=${person}&trip=volleyball-2026`)
      await page.waitForSelector(`[data-testid="${person}-photos-entry"]`)
      await page.screenshot({ path: `${SHOT_DIR}/entry-${person}.png`, fullPage: true })
    }
  })
})

function photoMemory({ id, stopId, author, caption, createdAt }) {
  return {
    id,
    tripId: 'volleyball-2026',
    stopId,
    authorTraveler: author,
    visibility: 'shared',
    kind: 'photo',
    caption,
    photoRef: { storage: 'external', url: TINY_RED_PNG_DATA_URL },
    photoExternalURLs: [],
    reactions: [],
    createdAt,
    updatedAt: createdAt,
  }
}
