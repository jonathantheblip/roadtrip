import { test, expect } from '@playwright/test'
import { openTopMenuItem } from './_fixtures/topNav.js'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'

// The live map upgrades from straight-line to the REAL road route fetched
// from the worker /route endpoint (Google Routes, cached). This proves the
// end-to-end client integration: the map calls /route and renders its result
// (the road distance). The road geometry itself drives the leaflet polyline;
// the visible distance is the deterministic hook. Without a /route response
// the map falls back to straight-line (covered by it simply not appearing).
test('map: shows the real road distance fetched from /route', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
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

  await page.goto('/?person=jonathan&nosw=1')
  await page.getByText('Fun @ the Sun').first().click()
  await openTopMenuItem(page, /Live map/i)

  await expect(page.getByTestId('map-road-miles')).toHaveText(/540 mi by road/)
})
