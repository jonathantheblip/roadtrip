import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, seedMemoriesIntoCache, FIXTURE_TRIP, TINY_RED_PNG_DATA_URL } from './_fixtures/withTrip.js'

// #5 — captions in the album. The photo's AUTHOR can add / edit / clear a caption
// right from the lightbox (updateMemoryCaption → self-healing sync). A non-author
// sees the caption but gets no edit door — same author gate as delete + edit-date.

const SHOT_DIR = 'tests/e2e/screenshots'

function memoryWith({ id, caption = null, authorTraveler = 'helen' }) {
  return {
    id,
    tripId: 'volleyball-2026',
    stopId: 'vb2-3',
    authorTraveler,
    visibility: 'shared',
    kind: 'photo',
    ...(caption ? { caption } : {}),
    capturedAt: '2026-05-23T07:00:00.000Z',
    photoRef: { storage: 'external', url: TINY_RED_PNG_DATA_URL },
    photoExternalURLs: [],
    reactions: [],
    createdAt: '2026-05-24T22:00:00.000Z',
    updatedAt: '2026-05-24T22:00:00.000Z',
  }
}

async function openLightbox(page, persona) {
  await page.goto(`/?person=${persona}&trip=volleyball-2026&nosw=1`)
  await page.getByTestId(`${persona}-photos-entry`).click()
  await page.getByTestId('photo-tile').first().click()
  await expect(page.getByTestId('photo-lightbox')).toBeVisible()
}

const stored = (page, id) =>
  page.evaluate((mid) => JSON.parse(localStorage.getItem('rt_memories_shared_v1') || '[]').find((m) => m.id === mid), id)

test.describe('album captions (#5)', () => {
  test('the AUTHOR adds a caption to a captionless photo → it shows + persists', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [memoryWith({ id: 'mine', authorTraveler: 'helen' })])
    await openLightbox(page, 'helen')

    await page.screenshot({ path: `${SHOT_DIR}/caption-add-affordance.png` })
    await page.getByTestId('lightbox-add-caption').click()
    const input = page.getByTestId('lightbox-caption-input')
    await expect(input).toBeVisible()
    await input.fill("Rafa's first cannonball")
    await page.screenshot({ path: `${SHOT_DIR}/caption-editing.png` })
    await page.getByTestId('lightbox-caption-save').click()

    await expect(page.getByTestId('lightbox-caption')).toContainText("Rafa's first cannonball")
    await page.screenshot({ path: `${SHOT_DIR}/caption-saved.png` })
    expect((await stored(page, 'mine'))?.caption).toBe("Rafa's first cannonball")
  })

  test('the AUTHOR edits an existing caption', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [memoryWith({ id: 'mine2', caption: 'old words', authorTraveler: 'helen' })])
    await openLightbox(page, 'helen')

    await page.getByTestId('lightbox-caption').click()
    const input = page.getByTestId('lightbox-caption-input')
    await expect(input).toHaveValue('old words')
    await input.fill('new words')
    await page.getByTestId('lightbox-caption-save').click()

    await expect(page.getByTestId('lightbox-caption')).toContainText('new words')
    expect((await stored(page, 'mine2'))?.caption).toBe('new words')
  })

  test('the AUTHOR clears a caption by saving it empty', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [memoryWith({ id: 'mine3', caption: 'delete me', authorTraveler: 'helen' })])
    await openLightbox(page, 'helen')

    await page.getByTestId('lightbox-caption').click()
    await page.getByTestId('lightbox-caption-input').fill('')
    await page.getByTestId('lightbox-caption-save').click()

    // Back to the "add a caption" affordance; the stored caption is cleared.
    await expect(page.getByTestId('lightbox-add-caption')).toBeVisible()
    expect((await stored(page, 'mine3'))?.caption ?? null).toBeNull()
  })

  test('a NON-author sees the caption but no edit door', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [memoryWith({ id: 'theirs', caption: 'jonathan wrote this', authorTraveler: 'jonathan' })])
    await openLightbox(page, 'helen')

    await expect(page.getByTestId('photo-lightbox').getByText('jonathan wrote this')).toBeVisible()
    await expect(page.getByTestId('lightbox-caption')).toHaveCount(0) // not the editable variant
    await expect(page.getByTestId('lightbox-add-caption')).toHaveCount(0)
  })
})
