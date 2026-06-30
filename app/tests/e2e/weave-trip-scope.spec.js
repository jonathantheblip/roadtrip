// The Weave, opened from inside a trip, must show THAT trip's story — never a
// random page from a different trip. Regression cover for the cross-trip
// random-pick bug: selectWeaveDay's discovery fallback picked a random
// (trip, day) across ALL trips whenever the open trip wasn't active *today*, so
// tapping "Read the Weave" on a past trip surfaced another trip's day entirely.
// The fix (selectWeaveDayForTrip) scopes the pick to the open trip.
//
// Clock is stubbed to 2026-05-23 (clockStub). BOTH seeded trips end before
// then, so neither is "active today" — exactly the case that used to mis-route.
import { test, expect } from './_fixtures/clockStub.js'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

// Two PAST stays, each with a memory matched to a stop on one of its days, so
// each trip has exactly one weave-eligible day — with a DISTINCT day title.
const CABIN = {
  id: 'wv-cabin', shape: 'stay', status: 'archived', title: 'Cabin Weekend', subtitle: 'fixture',
  dateRange: 'Apr 10 – 12, 2026', dateRangeStart: '2026-04-10', dateRangeEnd: '2026-04-12',
  startCity: '', endCity: '', travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
  lodging: { name: 'The Cabin', address: 'Peru, VT' },
  days: [{ n: 1, isoDate: '2026-04-11', date: 'Sat Apr 11', title: 'At the cabin', stops: [{ id: 'cab-s1', name: 'Lake dock', kind: 'activity' }] }],
}
const LAKE = {
  id: 'wv-lake', shape: 'stay', status: 'archived', title: 'Lake House', subtitle: 'fixture',
  dateRange: 'May 1 – 3, 2026', dateRangeStart: '2026-05-01', dateRangeEnd: '2026-05-03',
  startCity: '', endCity: '', travelers: ['jonathan', 'helen'],
  lodging: { name: 'Lakeview House', address: 'Lake George, NY' },
  days: [{ n: 1, isoDate: '2026-05-02', date: 'Sat May 2', title: 'Lazy lake day', stops: [{ id: 'lake-s1', name: 'Boathouse', kind: 'activity' }] }],
}
const MEMORIES = [
  { id: 'mx1', tripId: 'wv-cabin', stopId: 'cab-s1', authorTraveler: 'jonathan', visibility: 'shared', kind: 'photo', caption: 'Dock day', photoRef: { url: PNG, w: 1, h: 1 }, createdAt: '2026-04-11T15:00:00.000Z' },
  { id: 'my1', tripId: 'wv-lake', stopId: 'lake-s1', authorTraveler: 'jonathan', visibility: 'shared', kind: 'photo', caption: 'Boathouse', photoRef: { url: PNG, w: 1, h: 1 }, createdAt: '2026-05-02T15:00:00.000Z' },
]

async function seedBoth(page) {
  await page.addInitScript(({ trips, mems }) => {
    for (const k of ['rt_trips_cache_v1', 'rt_memories_shared_v1', 'rt_memories_private_jonathan_v1', 'rt_memories_private_helen_v1', 'rt_memories_private_aurelia_v1', 'rt_memories_private_rafa_v1']) {
      localStorage.removeItem(k)
    }
    localStorage.setItem('rt_trips_cache_v1', JSON.stringify(trips))
    localStorage.setItem('rt_memories_shared_v1', JSON.stringify(mems))
    localStorage.setItem('rt_person_v2', 'jonathan')
  }, { trips: [CABIN, LAKE], mems: MEMORIES })
  // Suppress worker pulls so the seeded cache wins (mirror withTrip.js).
  await page.route(/roadtrip-sync\.jonathan-d-jackson\.workers\.dev/, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/memories' || url.pathname.startsWith('/memories/') || url.pathname === '/trips' || url.pathname.startsWith('/trips/')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
      return
    }
    await route.fulfill({ status: 404, body: '{"error":"not found"}' })
  })
}

async function openTripWeave(page, cardText) {
  await page.goto('/?person=jonathan&nosw=1')
  // Target the ARCHIVED trip CARD specifically — not the "Looking back"
  // resurface card, which can also name the trip and would open a photo replay.
  await page.getByRole('button').filter({ hasText: cardText }).filter({ hasText: /MEMOR/i }).first().click()
  await expect(page.getByTestId('living-heart-home')).toBeVisible({ timeout: 10000 })
  await page.getByTestId('open-weave').click()
}

test('opening a past trip’s Weave shows THAT trip’s day, not another trip’s', async ({ page }) => {
  await seedBoth(page)
  await openTripWeave(page, 'Cabin Weekend')
  // The Cabin's own day is woven…
  await expect(page.getByText('At the cabin')).toBeVisible({ timeout: 10000 })
  // …and the OTHER trip's day never leaks in.
  await expect(page.getByText('Lazy lake day')).toHaveCount(0)
})

test('the scoping holds for the other trip too (no shared global pick)', async ({ page }) => {
  await seedBoth(page)
  await openTripWeave(page, 'Lake House')
  await expect(page.getByText('Lazy lake day')).toBeVisible({ timeout: 10000 })
  await expect(page.getByText('At the cabin')).toHaveCount(0)
})
