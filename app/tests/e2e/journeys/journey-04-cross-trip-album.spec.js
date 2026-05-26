import { test } from '../_fixtures/clockStub.js'
import { step, setActivePage, expect } from './_steps.js'
import { seedTripIntoCache, seedMemoriesIntoCache, FIXTURE_TRIP, TINY_RED_PNG_DATA_URL } from '../_fixtures/withTrip.js'

// Journey 04 — Cross-trip "all photos" album.
// Spec source: BUG_TRAP_PUNCHLIST.md A.3 fourth bullet.
//
// Surface: HelenView → "All photos" entry → AllPhotosView. The
// journey seeds memories under TWO distinct trips so the cross-trip
// rendering boundary is exercised, then opens the lightbox and
// verifies trip-name metadata flows through.

test.beforeEach(async ({ page }) => setActivePage(page))

test('cross-trip album renders memories from multiple trips', async ({ page }) => {
  // Two trips: the volleyball fixture + a synthetic NYC trip with
  // one memory attached. Both are seeded into localStorage so the
  // AllPhotosView sees them at first paint.
  const nycTrip = {
    ...FIXTURE_TRIP,
    id: 'nyc-test',
    title: 'NYC test trip',
    dateRangeStart: '2026-01-10',
    dateRangeEnd: '2026-01-12',
  }
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await page.addInitScript((trip) => {
    const KEY = 'rt_trips_cache_v1'
    const existing = JSON.parse(localStorage.getItem(KEY) || '[]')
    localStorage.setItem(KEY, JSON.stringify([...existing, trip]))
  }, nycTrip)
  await seedMemoriesIntoCache(page, [
    {
      id: 'mem_j04_v',
      tripId: 'volleyball-2026',
      stopId: 'vb1-1',
      authorTraveler: 'helen',
      visibility: 'shared',
      kind: 'photo',
      caption: 'journey 04 volleyball photo',
      photoExternalURLs: [TINY_RED_PNG_DATA_URL],
      createdAt: '2026-05-23T14:00:00.000Z',
      capturedAt: '2026-05-23T14:00:00.000Z',
    },
    {
      id: 'mem_j04_n',
      tripId: 'nyc-test',
      stopId: 'vb1-1',
      authorTraveler: 'helen',
      visibility: 'shared',
      kind: 'photo',
      caption: 'journey 04 nyc photo',
      photoExternalURLs: [TINY_RED_PNG_DATA_URL],
      createdAt: '2026-01-11T14:00:00.000Z',
      capturedAt: '2026-01-11T14:00:00.000Z',
    },
  ])

  await step('open Helen trip view', async () => {
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await expect(page.getByTestId('helen-all-photos-entry')).toBeVisible({
      timeout: 10_000,
    })
  })

  await step('open All photos cross-trip view', async () => {
    await page.getByTestId('helen-all-photos-entry').click()
  })

  await step('memories from both trips render', async () => {
    const trips = page.getByTestId('all-photos-trip')
    await expect(trips).toHaveCount(2, { timeout: 10_000 })
  })

  await step('lightbox opens with trip name in metadata', async () => {
    // Tap the first visible tile in the all-photos grid.
    const firstTile = page.locator('img').first()
    await firstTile.click()
    // Lightbox header carries the trip name above the caption
    // (PUNCHLIST_4 — cross-trip lightbox).
    const header = page.locator('text=/NYC test trip|Fun @ the Sun/i').first()
    await expect(header).toBeVisible({ timeout: 5000 })
  })
})
