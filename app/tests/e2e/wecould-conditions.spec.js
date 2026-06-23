// "Real conditions" (slice 7) — the "We could…" tray re-ranks by real weather and
// shows tide at the coast. The pure re-rank is covered in scripts/__tests__/
// weCould.test.mjs and the proxy in worker/test/conditions.test.js; here we prove
// the UI integration: the conditions strip shows weather + tide, a rainy day floats
// sheltered ideas above exposed ones with an honest reason banner, and a failed
// conditions fetch degrades quietly (no banner, the tray still works).
import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache } from './_fixtures/withTrip.js'

const STAY = {
  id: 'conditions-stay-2026',
  status: 'planning',
  title: 'Cabin Stay',
  dateRangeStart: '2026-05-22',
  dateRangeEnd: '2026-05-24',
  startCity: 'Belmont, MA',
  endCity: 'Peru, VT',
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
  lodging: { name: 'Our Cabin', address: 'Peru, VT', lat: 43.2398, lng: -72.9051 },
  days: [
    { n: 1, date: 'Fri May 22', isoDate: '2026-05-22', title: 'At the cabin', drive: { from: '', to: '', hours: '', miles: 0 }, lodging: '', stops: [] },
  ],
}

// One result per category so the re-rank order is unambiguous:
// meal=Cabin Diner, energy=Pine Playground, look=Mountain Overlook, treat=Maple Creemee.
const BY_QUERY = [
  { match: 'restaurant', results: [{ placeId: 'r1', name: 'Cabin Diner', address: '1 Main St', lat: 43.24, lng: -72.9, distanceMeters: 800, openNow: true, photoUrl: null }] },
  { match: 'park', results: [{ placeId: 'p1', name: 'Pine Playground', address: 'Forest Rd', lat: 43.26, lng: -72.92, distanceMeters: 1500, openNow: true, photoUrl: null }] },
  { match: 'scenic', results: [{ placeId: 's1', name: 'Mountain Overlook', address: 'Ridge Rd', lat: 43.27, lng: -72.93, distanceMeters: 4200, openNow: null, photoUrl: null }] },
  { match: 'cafe', results: [{ placeId: 't1', name: 'Maple Creemee Stand', address: 'Dairy Ln', lat: 43.28, lng: -72.94, distanceMeters: 900, openNow: true, photoUrl: null }] },
]

async function mockNearby(page) {
  await page.route(/workers\.dev\/places\/nearby$/, async (route) => {
    let q = ''
    try { q = (JSON.parse(route.request().postData() || '{}').query || '').toLowerCase() } catch { /* */ }
    const hit = BY_QUERY.find((e) => q.includes(e.match))
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: hit?.results || [], radiusMeters: 10000 }) })
  })
}

function mockConditions(page, payload) {
  page.route(/workers\.dev\/conditions$/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
  })
}

const RAINY = {
  weather: { tempF: 54, code: 63, label: 'Rain', icon: '🌧️', kind: 'rain', precipProbPct: 80, hiF: 58, loF: 49 },
  tide: { state: 'rising', heightM: 0.3, next: { type: 'high', at: '2026-05-23T15:45' } },
}

// Seed FIRST (it installs a catch-all 404), THEN the specific mocks — Playwright
// uses the LAST-registered matching route, so the mocks must come after the seed.
async function openWeCould(page, { who = 'jonathan', conditions } = {}) {
  await seedTripIntoCache(page, STAY)
  await mockNearby(page)
  if (conditions !== undefined) mockConditions(page, conditions)
  await page.goto(`/?person=${who}&trip=${STAY.id}&nosw=1`)
  await expect(page.getByTestId('stay-tabbar')).toBeVisible({ timeout: 10000 })
  await page.locator('.stay-tab', { hasText: 'We could' }).click()
  await expect(page.getByTestId('wecould-nearby')).toBeVisible({ timeout: 10000 })
}

test.describe('We could… — real conditions (slice 7)', () => {
  test('a rainy day shows weather + tide and floats sheltered ideas up, with a reason', async ({ page }) => {
    await openWeCould(page, { conditions: RAINY })

    // The conditions strip carries real weather + tide.
    await expect(page.getByTestId('wecould-weather')).toContainText('54°F')
    await expect(page.getByTestId('wecould-weather')).toContainText('Rain')
    await expect(page.getByTestId('wecould-conditions')).toContainText(/High tide/)

    // The honest re-rank banner.
    await expect(page.getByTestId('wecould-condition-reason')).toContainText(/indoor/i)

    // The order moved: the sheltered creemee/diner lead the exposed park.
    const cards = page.getByTestId('wecould-nearby')
    const treatIdx = await cards.getByText('Maple Creemee Stand').evaluate((el) => el.getBoundingClientRect().top)
    const parkIdx = await cards.getByText('Pine Playground').evaluate((el) => el.getBoundingClientRect().top)
    expect(treatIdx).toBeLessThan(parkIdx)
    await page.screenshot({ path: 'tests/e2e/screenshots/wecould-conditions-rainy.png' })
  })

  test('a failed conditions fetch degrades quietly — no banner, tray still works', async ({ page }) => {
    await openWeCould(page, { conditions: { weather: null, tide: null } }) // worker degrade shape
    await expect(page.getByTestId('wecould-nearby')).toContainText('Cabin Diner')
    await expect(page.getByTestId('wecould-condition-reason')).toHaveCount(0)
    await expect(page.getByTestId('wecould-weather')).toHaveCount(0)
  })
})
