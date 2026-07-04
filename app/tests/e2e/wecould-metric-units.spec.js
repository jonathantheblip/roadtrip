// Metric units abroad (#7 features queue) — the "We could…" conditions strip
// and a nearby card's distance follow the CURRENT LEG's locale: home (or no
// locale, the domestic/pre-keystone case) stays imperial (byte-identical to
// today — covered by wecould-conditions.spec.js); a trip whose locale names a
// non-US region shows metric first, with the home unit as a hint for temp
// (04-copy-and-conditions.md: "km/°C abroad, with a home-unit hint").
import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache } from './_fixtures/withTrip.js'

const STAY_ABROAD = {
  id: 'metric-stay-2026',
  status: 'planning',
  title: 'A Week in Tuscany',
  locale: 'it-IT', // a plain STAY can carry a top-level locale (deriveCurrentLeg falls back to it)
  // clockStub.js freezes `new Date()` at 2026-05-23T12:00Z — the window must
  // contain that instant or App.jsx's active-trip cold-load override bounces
  // a direct `?trip=` open back to the index (the FIXTURE_TRIP/clockStub note).
  dateRangeStart: '2026-05-22',
  dateRangeEnd: '2026-05-24',
  startCity: 'Florence, Italy',
  endCity: 'Florence, Italy',
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
  lodging: { name: 'Villa Fiesole', address: 'Fiesole, Italy', lat: 43.8065, lng: 11.2947 },
  days: [
    { n: 1, date: 'Fri May 22', isoDate: '2026-05-22', title: 'Arrival', drive: { from: '', to: '', hours: '', miles: 0 }, lodging: '', stops: [] },
  ],
}

async function mockNearby(page) {
  await page.route(/workers\.dev\/places\/nearby$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        results: [{ placeId: 'r1', name: 'Trattoria da Ugo', address: 'Via Roma 1', lat: 43.81, lng: 11.3, distanceMeters: 1800, openNow: true, photoUrl: null }],
        radiusMeters: 10000,
      }),
    })
  })
}

function mockConditions(page, payload) {
  page.route(/workers\.dev\/conditions$/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
  })
}

const SUNNY = {
  weather: { tempF: 75, code: 0, label: 'Clear', icon: '☀️', kind: 'clear', precipProbPct: 5, hiF: 80, loF: 62 },
  tide: null,
}

test.describe('We could… — metric units abroad (#7 queue)', () => {
  test('a leg abroad shows °C first, with °F as a home hint, and km for distance', async ({ page }) => {
    await seedTripIntoCache(page, STAY_ABROAD)
    await mockNearby(page)
    mockConditions(page, SUNNY)
    await page.goto(`/?person=jonathan&trip=${STAY_ABROAD.id}&nosw=1`)
    await expect(page.getByTestId('stay-tabbar')).toBeVisible({ timeout: 10000 })
    await page.locator('.stay-tab', { hasText: 'We could' }).click()
    await expect(page.getByTestId('wecould-nearby')).toBeVisible({ timeout: 10000 })

    // 75°F ≈ 24°C — metric leads, imperial rides along as the hint.
    await expect(page.getByTestId('wecould-weather')).toContainText('24°C · 75°F')

    // The nearby card's distance (1800m) reads in km, not miles.
    await expect(page.getByTestId('wecould-nearby')).toContainText('Trattoria da Ugo')
    await expect(page.getByTestId('wecould-card')).toContainText('1.8 km')
  })
})
