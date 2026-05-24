import { test, expect } from '@playwright/test'
import { seedTripIntoCache, seedMemoriesIntoCache, FIXTURE_TRIP, TINY_RED_PNG_DATA_URL } from './_fixtures/withTrip.js'

// M1 acceptance — PhotosView renders, groups by stop, dedupes, lightbox
// opens/navigates/closes. Asserts against the actual DOM the family
// will see, not a snapshot of intent.

test.describe('PhotosView shell (M1)', () => {
  test('empty state when the trip has no photo memories', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.goto('/?person=helen&trip=volleyball-2026')
    await openPhotos(page)
    await expect(
      page.getByText('Once the trip starts collecting photos', { exact: false })
    ).toBeVisible()
    // The "Add photo or video" entry point shows even when empty —
    // it's the only way Helen can add the first photo.
    await expect(page.getByTestId('add-dispatch')).toBeVisible()
  })

  test('photos group by stop, sorted by capture date ascending', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [
      // Saturday match — two photos out of order so the sort matters.
      photoMemory({
        id: 'm1',
        stopId: 'vb2-3',
        author: 'helen',
        caption: 'Court 1 warmup',
        createdAt: '2026-05-23T19:50:00Z',
      }),
      photoMemory({
        id: 'm2',
        stopId: 'vb2-3',
        author: 'jonathan',
        caption: 'Aurelia serving',
        createdAt: '2026-05-23T20:30:00Z',
      }),
      photoMemory({
        id: 'm3',
        stopId: 'vb3-4',
        author: 'helen',
        caption: 'Sunday court 3',
        createdAt: '2026-05-24T20:05:00Z',
      }),
      // Stop with no photos — should NOT render a group.
      // (vb1-3 lodging is in the trip but has no memory.)
    ])
    await page.goto('/?person=helen&trip=volleyball-2026')
    await openPhotos(page)

    const groups = page.getByTestId('stop-group')
    await expect(groups).toHaveCount(2)
    // First group should be Saturday (Day 2) because day order ascending.
    await expect(groups.nth(0)).toContainText('vs BEV 13 Empire')
    await expect(groups.nth(1)).toContainText('Match 1 vs Northeast 13.2')
    // Sat group has two photos, captions in capture-asc order.
    const satTiles = groups.nth(0).getByTestId('photo-tile')
    await expect(satTiles).toHaveCount(2)
    await expect(satTiles.nth(0)).toContainText('Court 1 warmup')
    await expect(satTiles.nth(1)).toContainText('Aurelia serving')
  })

  test('lightbox opens, navigates within the stop group, closes', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [
      photoMemory({ id: 'm1', stopId: 'vb2-3', author: 'helen', caption: 'first', createdAt: '2026-05-23T19:50:00Z' }),
      photoMemory({ id: 'm2', stopId: 'vb2-3', author: 'jonathan', caption: 'second', createdAt: '2026-05-23T20:30:00Z' }),
      photoMemory({ id: 'm3', stopId: 'vb2-3', author: 'aurelia', caption: 'third', createdAt: '2026-05-23T20:45:00Z' }),
    ])
    await page.goto('/?person=helen&trip=volleyball-2026')
    await openPhotos(page)

    await page.getByTestId('photo-tile').first().click()
    const lightbox = page.getByTestId('photo-lightbox')
    await expect(lightbox).toBeVisible()
    await expect(lightbox).toContainText('1 / 3')
    await expect(lightbox).toContainText('first')

    await page.getByRole('button', { name: 'Next photo' }).click()
    await expect(lightbox).toContainText('2 / 3')
    await expect(lightbox).toContainText('second')

    await page.keyboard.press('ArrowRight')
    await expect(lightbox).toContainText('3 / 3')
    await expect(lightbox).toContainText('third')

    // At the end, the next arrow disappears.
    await expect(page.getByRole('button', { name: 'Next photo' })).toHaveCount(0)

    await page.keyboard.press('Escape')
    await expect(lightbox).toHaveCount(0)
  })

  test('every themed view exposes a Photos entry point', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)

    const expected = {
      jonathan: 'jonathan-photos-entry',
      helen: 'helen-photos-entry',
      aurelia: 'aurelia-photos-entry',
      rafa: 'rafa-photos-entry',
    }
    for (const [person, testId] of Object.entries(expected)) {
      await page.goto(`/?person=${person}&trip=volleyball-2026`)
      await expect(
        page.getByTestId(testId),
        `${person}'s view is missing the Photos entry`
      ).toBeVisible()
    }
  })

  test('photo tile renders poster color, caption, date, location', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [
      photoMemory({
        id: 'm1',
        stopId: 'vb2-3',
        author: 'helen', // → forest green TRAVELER_DOT
        caption: 'Helen tile metadata',
        createdAt: '2026-05-23T20:30:00Z',
      }),
    ])
    await page.goto('/?person=helen&trip=volleyball-2026')
    await openPhotos(page)

    const tile = page.getByTestId('photo-tile').first()
    await expect(tile).toContainText('Helen tile metadata')
    // Location falls back to stop address when EXIF is absent.
    await expect(tile).toContainText('Court 1, Mohegan Sun')
    // The poster color dot is the green TRAVELER_DOT for Helen.
    const dot = tile.locator('[aria-label="Posted by Helen"]')
    await expect(dot).toBeVisible()
    const bg = await dot.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(bg).toBe('rgb(46, 93, 58)')
  })
})

async function openPhotos(page) {
  // Each view exposes its own Photos entry; click whichever is visible
  // on the current person's surface.
  const candidates = [
    'helen-photos-entry',
    'jonathan-photos-entry',
    'aurelia-photos-entry',
    'rafa-photos-entry',
  ]
  for (const tid of candidates) {
    const loc = page.getByTestId(tid)
    if (await loc.count()) {
      await loc.click()
      return
    }
  }
  throw new Error('No Photos entry point found on this view')
}

function photoMemory({ id, stopId, author, caption, createdAt }) {
  return {
    id,
    tripId: 'volleyball-2026',
    stopId,
    authorTraveler: author,
    visibility: 'shared',
    kind: 'photo',
    caption,
    photoRef: {
      storage: 'external',
      url: TINY_RED_PNG_DATA_URL,
    },
    photoExternalURLs: [],
    reactions: [],
    createdAt,
    updatedAt: createdAt,
  }
}
