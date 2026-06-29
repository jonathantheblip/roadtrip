// "Look back further" — the per-person home strip of PAST trips that jumps
// straight into an older trip's reel (no navigating into the trip first).
import { test, expect } from './_fixtures/clockStub.js'
import { TINY_RED_PNG_DATA_URL, FIXTURE_TRIP } from './_fixtures/withTrip.js'

const PAST_TRIP = {
  id: 'older-weekend',
  status: 'planning',
  title: 'Earlier Weekend',
  dateRange: 'Apr 17 – 18, 2026',
  dateRangeStart: '2026-04-17',
  dateRangeEnd: '2026-04-18',
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
  days: [
    { n: 1, date: 'Fri Apr 17', isoDate: '2026-04-17', title: 'Drive south', stops: [{ id: 'ow1-1', time: 'Morning', name: 'Eric Carle', address: 'Amherst MA' }] },
  ],
}
const PAST_MEM = {
  id: 'pm', tripId: 'older-weekend', stopId: 'ow1-1',
  authorTraveler: 'helen', visibility: 'shared', kind: 'photo', caption: 'museum',
  capturedAt: '2026-04-17T10:00:00.000Z',
  photoRef: { storage: 'external', url: TINY_RED_PNG_DATA_URL + '#pm' },
  createdAt: '2026-04-17T10:00:00.000Z',
}

function seedBoth(page, who) {
  return page.addInitScript(({ trips, mems, person }) => {
    for (const k of ['rt_trips_cache_v1', 'rt_memories_shared_v1']) localStorage.removeItem(k)
    localStorage.setItem('rt_trips_cache_v1', JSON.stringify(trips))
    localStorage.setItem('rt_memories_shared_v1', JSON.stringify(mems))
    localStorage.setItem('rt_person_v2', person)
  }, { trips: [FIXTURE_TRIP, PAST_TRIP], mems: [PAST_MEM], person: who })
}
function stubWorker(page) {
  return page.route(/roadtrip-sync\.jonathan-d-jackson\.workers\.dev/, (route) => {
    const u = new URL(route.request().url())
    if (u.pathname === '/memories' || u.pathname === '/trips') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    }
    return route.fulfill({ status: 404, body: '{}' })
  })
}

test.describe('Look back further — home strip', () => {
  for (const person of ['jonathan', 'helen', 'aurelia']) {
    test(`${person}: home shows the strip and a past trip opens its reel`, async ({ page }) => {
      await seedBoth(page, person)
      await stubWorker(page)
      await page.goto(`/?person=${person}&trip=volleyball-2026&nosw=1`)

      const strip = page.getByTestId('lookback-strip')
      await expect(strip).toBeVisible()
      await expect(strip).toContainText('Earlier Weekend')

      // Tapping a past trip jumps straight into its reel (scoped to that trip).
      await strip.getByTestId('lookback-trip').first().click()
      await expect(page.locator('.rpl-root')).toBeVisible()
      await expect(page.locator('.rpl-cine-layer').first()).toBeAttached()
    })
  }

  test('the strip is absent when there are no past trips', async ({ page }) => {
    await page.addInitScript(({ trip }) => {
      for (const k of ['rt_trips_cache_v1', 'rt_memories_shared_v1']) localStorage.removeItem(k)
      localStorage.setItem('rt_trips_cache_v1', JSON.stringify([trip]))
      localStorage.setItem('rt_person_v2', 'jonathan')
    }, { trip: FIXTURE_TRIP })
    await stubWorker(page)
    await page.goto('/?person=jonathan&trip=volleyball-2026&nosw=1')
    // Jonathan's stay home is the redesigned LivingHeartHome (slice 1).
    await expect(page.getByTestId('living-heart-home')).toBeVisible()
    await expect(page.getByTestId('lookback-strip')).toHaveCount(0)
  })
})
