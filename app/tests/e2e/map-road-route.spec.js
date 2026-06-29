import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, FIXTURE_ROUTE_TRIP } from './_fixtures/withTrip.js'

// The live map upgrades from straight-line to the REAL road route fetched
// from the worker /route endpoint (Google Routes, cached). This proves the
// end-to-end client integration: the map calls /route and renders its result
// (the road distance). The road geometry itself drives the leaflet polyline;
// the visible distance is the deterministic hook. Without a /route response
// the map falls back to straight-line (covered by it simply not appearing).
// Uses the ROUTE fixture: a road distance only makes sense on a road trip. The
// map is reached by tapping the living-heart hero (every trip uses that home now;
// the road-trip ⋯ "Live map" entry is retired).
test('map: shows the real road distance fetched from /route', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_ROUTE_TRIP)
  // Registered after the fixture's worker catch-all, so this wins for /route.
  await page.route(/workers\.dev\/route$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        miles: 540,
        durationMinutes: 600,
        points: [
          { lat: 42.34, lng: -73.6 },
          { lat: 41.0, lng: -75.0 },
          { lat: 36.34, lng: -82.21 },
        ],
        cached: false,
      }),
    })
  })

  // Clock-stubbed to 2026-05-23 (inside the fixture window) so the trip is DURING
  // → it leads with the living heart, whose hero opens the live map. Open via
  // ?trip= (an active trip opens directly), then tap the hero.
  await page.goto('/?person=jonathan&trip=roadtrip-2026&nosw=1')
  await page.getByRole('button', { name: /Where we are/i }).click()

  await expect(page.getByTestId('map-road-miles')).toHaveText(/540 mi by road/)
})
