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
