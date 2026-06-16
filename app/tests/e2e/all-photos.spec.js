import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, seedMemoriesIntoCache, FIXTURE_TRIP, TINY_RED_PNG_DATA_URL } from './_fixtures/withTrip.js'

// PUNCHLIST_4 — cross-trip All Photos view. Aggregates memories from
// every trip Helen can see, groups by trip → stop, lightbox shows
// trip name. Read-only — no upload composer in this view.

const SHOT_DIR = 'tests/e2e/screenshots'

// A second trip with photos so the aggregate has cross-trip data to
// render. Same shape as FIXTURE_TRIP — older date so it sorts second.
const SECOND_TRIP = {
  id: 'older-weekend',
  status: 'planning',
  title: 'Earlier Weekend',
  dateRange: 'Apr 17 – 18, 2026',
  dateRangeStart: '2026-04-17',
  dateRangeEnd: '2026-04-18',
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
  homeBase: { lat: 41.3225, lng: -72.0943, label: '41 Lower Boulevard' },
  days: [
    {
      n: 1,
      date: 'Fri Apr 17',
      isoDate: '2026-04-17',
      title: 'Drive south',
      stops: [
        { id: 'ow1-1', time: 'Morning', name: 'Eric Carle', address: 'Amherst MA' },
      ],
    },
  ],
}

function singlePhotoMem({ id, tripId, stopId, caption, capturedAt }) {
  return {
    id,
    tripId,
    stopId,
    authorTraveler: 'helen',
    visibility: 'shared',
    kind: 'photo',
    caption,
    capturedAt,
    photoRef: { storage: 'external', url: TINY_RED_PNG_DATA_URL + `#${id}` },
    photoExternalURLs: [],
    reactions: [],
    createdAt: capturedAt,
    updatedAt: capturedAt,
  }
}

test.describe('AllPhotosView — cross-trip aggregation', () => {
  test('entry point on every themed view leads to AllPhotosView', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    for (const person of ['jonathan', 'helen', 'aurelia', 'rafa']) {
      await page.goto(`/?person=${person}&trip=volleyball-2026&nosw=1`)
      const entry = page.getByTestId(`${person}-all-photos-entry`)
      await expect(entry, `${person}-all-photos-entry should be visible`).toBeVisible()
      await entry.click()
      await expect(page.getByText('All photos', { exact: true })).toBeVisible()
    }
  })

  test('aggregates memories from multiple trips, newest trip first', async ({ page }) => {
    // Seed two trips' worth of memories. seedTripIntoCache only takes
    // one trip — replace the cache directly to seat both.
    await page.addInitScript(({ trips, mems }) => {
      const KEYS = [
        'rt_trips_cache_v1',
        'rt_memories_shared_v1',
        'rt_memories_private_jonathan_v1',
        'rt_memories_private_helen_v1',
        'rt_memories_private_aurelia_v1',
        'rt_memories_private_rafa_v1',
      ]
      for (const k of KEYS) localStorage.removeItem(k)
      localStorage.setItem('rt_trips_cache_v1', JSON.stringify(trips))
      localStorage.setItem('rt_memories_shared_v1', JSON.stringify(mems))
      localStorage.setItem('rt_person_v2', 'jonathan')
    }, {
      trips: [FIXTURE_TRIP, SECOND_TRIP],
      mems: [
        // Older trip memory.
        {
          id: 'mO',
          tripId: 'older-weekend',
          stopId: 'ow1-1',
          authorTraveler: 'helen',
          visibility: 'shared',
          kind: 'photo',
          caption: 'Eric Carle morning',
          capturedAt: '2026-04-17T10:00:00.000Z',
          photoRef: { storage: 'external', url: TINY_RED_PNG_DATA_URL + '#O' },
          photoExternalURLs: [],
          reactions: [],
          createdAt: '2026-04-17T10:00:00.000Z',
          updatedAt: '2026-04-17T10:00:00.000Z',
        },
        // Newer trip memory.
        {
          id: 'mN',
          tripId: 'volleyball-2026',
          stopId: 'vb2-3',
          authorTraveler: 'helen',
          visibility: 'shared',
          kind: 'photo',
          caption: 'Court 1 warmup',
          capturedAt: '2026-05-23T19:50:00.000Z',
          photoRef: { storage: 'external', url: TINY_RED_PNG_DATA_URL + '#N' },
          photoExternalURLs: [],
          reactions: [],
          createdAt: '2026-05-23T19:55:00.000Z',
          updatedAt: '2026-05-23T19:55:00.000Z',
        },
      ],
    })
    // Stub the worker so the auto-pull doesn't overwrite our seed.
    await page.route(
      /roadtrip-sync\.jonathan-d-jackson\.workers\.dev/,
      (route) => {
        const url = new URL(route.request().url())
        if (url.pathname === '/memories' || url.pathname === '/trips') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([]),
          })
        }
        return route.fulfill({ status: 404, body: '{"error":"not found"}' })
      }
    )

    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await page.getByTestId('helen-all-photos-entry').click()
    await expect(page.getByText('All photos', { exact: true })).toBeVisible()

    // Two trip sections, newest first.
    const tripSections = page.getByTestId('all-photos-trip')
    await expect(tripSections).toHaveCount(2)
    await expect(tripSections.nth(0)).toHaveAttribute('data-trip-id', 'volleyball-2026')
    await expect(tripSections.nth(1)).toHaveAttribute('data-trip-id', 'older-weekend')
    await expect(tripSections.nth(0)).toContainText('Fun @ the Sun')
    await expect(tripSections.nth(1)).toContainText('Earlier Weekend')

    // Tile counts: one per memory.
    await expect(page.getByTestId('photo-tile')).toHaveCount(2)

    await page.screenshot({
      path: `${SHOT_DIR}/c4-all-photos-two-trips.png`,
      fullPage: true,
    })
  })

  // The lightbox swipe is SCOPED to the trip you opened — it moves within that
  // trip but NEVER silently crosses a trip boundary (which would jump BACKWARD
  // in time, since trips render newest-first). Crossing trips is the deliberate
  // jump-back control (next test).
  test('lightbox swipe stays within the trip — no silent backward time-jump', async ({ page }) => {
    await page.addInitScript(({ trips, mems }) => {
      const KEYS = [
        'rt_trips_cache_v1', 'rt_memories_shared_v1',
        'rt_memories_private_jonathan_v1', 'rt_memories_private_helen_v1',
        'rt_memories_private_aurelia_v1', 'rt_memories_private_rafa_v1',
      ]
      for (const k of KEYS) localStorage.removeItem(k)
      localStorage.setItem('rt_trips_cache_v1', JSON.stringify(trips))
      localStorage.setItem('rt_memories_shared_v1', JSON.stringify(mems))
      localStorage.setItem('rt_person_v2', 'helen')
    }, {
      trips: [FIXTURE_TRIP, SECOND_TRIP],
      mems: [
        {
          id: 'mO', tripId: 'older-weekend', stopId: 'ow1-1',
          authorTraveler: 'helen', visibility: 'shared', kind: 'photo',
          caption: 'Older trip photo', capturedAt: '2026-04-17T10:00:00.000Z',
          photoRef: { storage: 'external', url: TINY_RED_PNG_DATA_URL + '#O' },
          photoExternalURLs: [], reactions: [],
          createdAt: '2026-04-17T10:00:00.000Z', updatedAt: '2026-04-17T10:00:00.000Z',
        },
        // Two photos in the NEWER trip so the swipe has somewhere to go in-trip.
        {
          id: 'mN1', tripId: 'volleyball-2026', stopId: 'vb2-3',
          authorTraveler: 'helen', visibility: 'shared', kind: 'photo',
          caption: 'Newer photo A', capturedAt: '2026-05-23T19:50:00.000Z',
          photoRef: { storage: 'external', url: TINY_RED_PNG_DATA_URL + '#N1' },
          photoExternalURLs: [], reactions: [],
          createdAt: '2026-05-23T19:50:00.000Z', updatedAt: '2026-05-23T19:50:00.000Z',
        },
        {
          id: 'mN2', tripId: 'volleyball-2026', stopId: 'vb2-3',
          authorTraveler: 'helen', visibility: 'shared', kind: 'photo',
          caption: 'Newer photo B', capturedAt: '2026-05-23T20:10:00.000Z',
          photoRef: { storage: 'external', url: TINY_RED_PNG_DATA_URL + '#N2' },
          photoExternalURLs: [], reactions: [],
          createdAt: '2026-05-23T20:10:00.000Z', updatedAt: '2026-05-23T20:10:00.000Z',
        },
      ],
    })
    await page.route(
      /roadtrip-sync\.jonathan-d-jackson\.workers\.dev/,
      (route) => {
        const url = new URL(route.request().url())
        if (url.pathname === '/memories' || url.pathname === '/trips') {
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
        }
        return route.fulfill({ status: 404, body: '{}' })
      }
    )
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await page.getByTestId('helen-all-photos-entry').click()
    // First tile = the newer trip's first photo (newest trip first).
    await page.getByTestId('photo-tile').first().click()
    const lightbox = page.getByTestId('photo-lightbox')
    await expect(lightbox).toBeVisible()
    const tripNode = page.getByTestId('lightbox-trip-name')
    await expect(tripNode).toContainText('Fun @ the Sun')
    await expect(lightbox).toContainText('Newer photo A')

    // Next → moves WITHIN the newer trip (A → B), trip unchanged.
    await page.keyboard.press('ArrowRight')
    await expect(tripNode).toContainText('Fun @ the Sun')
    await expect(lightbox).toContainText('Newer photo B')

    // Next again → clamped at the trip's last photo; it does NOT cross into the
    // older trip, and "Next photo" is gone.
    await page.keyboard.press('ArrowRight')
    await expect(tripNode).toContainText('Fun @ the Sun')
    await expect(lightbox).toContainText('Newer photo B')
    await expect(page.getByRole('button', { name: 'Next photo' })).toHaveCount(0)
  })

  test('jump-back row steps deliberately to the older trip + Play opens its reel', async ({ page }) => {
    await page.addInitScript(({ trips, mems }) => {
      const KEYS = [
        'rt_trips_cache_v1', 'rt_memories_shared_v1',
        'rt_memories_private_jonathan_v1', 'rt_memories_private_helen_v1',
        'rt_memories_private_aurelia_v1', 'rt_memories_private_rafa_v1',
      ]
      for (const k of KEYS) localStorage.removeItem(k)
      localStorage.setItem('rt_trips_cache_v1', JSON.stringify(trips))
      localStorage.setItem('rt_memories_shared_v1', JSON.stringify(mems))
      localStorage.setItem('rt_person_v2', 'helen')
    }, {
      trips: [FIXTURE_TRIP, SECOND_TRIP],
      mems: [
        {
          id: 'mO', tripId: 'older-weekend', stopId: 'ow1-1',
          authorTraveler: 'helen', visibility: 'shared', kind: 'photo',
          caption: 'Older trip photo', capturedAt: '2026-04-17T10:00:00.000Z',
          photoRef: { storage: 'external', url: TINY_RED_PNG_DATA_URL + '#O' },
          photoExternalURLs: [], reactions: [],
          createdAt: '2026-04-17T10:00:00.000Z', updatedAt: '2026-04-17T10:00:00.000Z',
        },
        {
          id: 'mN', tripId: 'volleyball-2026', stopId: 'vb2-3',
          authorTraveler: 'helen', visibility: 'shared', kind: 'photo',
          caption: 'Newer trip photo', capturedAt: '2026-05-23T19:50:00.000Z',
          photoRef: { storage: 'external', url: TINY_RED_PNG_DATA_URL + '#N' },
          photoExternalURLs: [], reactions: [],
          createdAt: '2026-05-23T19:55:00.000Z', updatedAt: '2026-05-23T19:55:00.000Z',
        },
      ],
    })
    await page.route(
      /roadtrip-sync\.jonathan-d-jackson\.workers\.dev/,
      (route) => {
        const url = new URL(route.request().url())
        if (url.pathname === '/memories' || url.pathname === '/trips') {
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
        }
        return route.fulfill({ status: 404, body: '{}' })
      }
    )
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await page.getByTestId('helen-all-photos-entry').click()

    // Newest trip is in view → jump-back targets the older trip; Play is present.
    const jumpBack = page.getByTestId('all-photos-jumpback')
    await expect(jumpBack).toContainText('Earlier Weekend')
    await expect(page.getByTestId('all-photos-play')).toBeVisible()

    // Jump back a trip → now at the oldest, jump-back disables.
    await jumpBack.click()
    await expect(page.getByTestId('all-photos-jumpback-disabled')).toContainText('Earliest trip')

    // Play (scoped to the in-view trip) opens the reel.
    await page.getByTestId('all-photos-play').click()
    await expect(page.locator('.rpl-root')).toBeVisible()
  })

  test('empty state when no trip has any photos', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    // No seeded memories — every trip is empty.
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await page.getByTestId('helen-all-photos-entry').click()
    await expect(page.getByTestId('all-photos-empty')).toBeVisible()
    await expect(page.getByTestId('all-photos-empty')).toContainText(
      /Photos you add inside any trip/
    )
  })
})
