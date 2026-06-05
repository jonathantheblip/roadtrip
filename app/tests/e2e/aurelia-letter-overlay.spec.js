import { test, expect } from '@playwright/test'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'

// Aurelia's "note from Dad" letter is a must-keep. Its text is authored
// ONLY in the seed (data/trips.js → trip.travelerNotes) and never edited
// in-app, so a synced/cached trip copy can predate the letter being added.
// The Worker (D1) is canonical on pull, so without an overlay a stale
// remote copy silently drops the letter after the first sync.
// useTrips.withSeedNotes keeps the seed authoritative for travelerNotes.
//
// FIXTURE_TRIP (id 'volleyball-2026') carries NO travelerNotes — the exact
// stale-remote condition. Seeding it as the cached/synced trip and then
// finding the letter proves the overlay works: this FAILS without the fix
// (no note on the trip → no letter) and PASSES with it (seed note overlaid).
test('aurelia: the note-from-Dad letter survives a letterless synced trip', async ({ page }) => {
  expect(
    FIXTURE_TRIP.travelerNotes,
    'fixture must stay letterless or this no longer tests the overlay',
  ).toBeUndefined()

  await seedTripIntoCache(page, FIXTURE_TRIP)
  await page.goto('/?person=aurelia&nosw=1')
  // Open the seeded trip from the index (the realistic path; the seeded
  // trip is the letterless 'Fun @ the Sun').
  await page.getByText('Fun @ the Sun').first().click()

  // The letter renders via the seed overlay even though the opened trip
  // had no travelerNotes of its own.
  await expect(page.getByText(/a note from dad/i)).toBeVisible()
  await expect(page.getByText(/dear aurelia/i)).toBeVisible()
})

// Pull-path coverage. The PRODUCTION case is a non-empty Worker pull that
// returns the canonical-but-stale letterless trip (D1's copy predates the
// note). That goes through the overlay on the PULL result
// (withSeedNotes(remote)) — a different call site than the cache read above.
// Cold cache + a DISTINCT title so the trip arrives ONLY via the pull and
// we can wait for the pulled list to replace the seed list before opening it.
test('aurelia: the letter survives a letterless trip arriving via the Worker pull', async ({ page }) => {
  // Same id as the seed (volleyball-2026) so the overlay matches it, but a
  // distinct title and NO travelerNotes — the exact stale-D1 shape.
  const pulled = { ...FIXTURE_TRIP, title: 'Sync Fixture Trip' }
  expect(pulled.travelerNotes, 'pulled trip must be letterless').toBeUndefined()

  await page.addInitScript(() => {
    localStorage.removeItem('rt_trips_cache_v1') // cold cache → trip comes only from the pull
    localStorage.setItem('rt_person_v2', 'aurelia')
  })
  await page.route(/roadtrip-sync\.jonathan-d-jackson\.workers\.dev/, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/trips') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([pulled]),
      })
    }
    if (url.pathname.startsWith('/memories')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    }
    return route.fulfill({ status: 404, body: '{"error":"not found"}' })
  })

  await page.goto('/?person=aurelia&nosw=1')
  // Wait until the canonical pull has replaced the seed list — the distinct
  // title only exists on the pulled copy, so its appearance proves the pull
  // (and its overlay) rendered.
  await expect(page.getByText('Sync Fixture Trip')).toBeVisible()
  await page.getByText('Sync Fixture Trip').first().click()

  await expect(page.getByText(/a note from dad/i)).toBeVisible()
  await expect(page.getByText(/dear aurelia/i)).toBeVisible()
})
