// "We could…" nearby tray (slice 3a). On a STAY with coordinates the
// activities surface leads with auto-suggested nearby ideas so a brand-new
// trip never opens empty (FAMILY_TRIPS_VISION §2/§3). Each person curates
// their own device's tray (keep / hide), client-local. The Worker
// /places/nearby proxy is MOCKED here — CI never hits Google.
import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache } from './_fixtures/withTrip.js'
import { expectNoSeriousA11y } from './_fixtures/axe.js'

// A geocoded cabin STAY straddling the stubbed clock so it cold-loads active.
const STAY = {
  id: 'wecould-stay-2026',
  status: 'planning',
  title: 'Cabin Stay',
  subtitle: 'fixture',
  dateRange: 'May 22 – 24, 2026',
  dateRangeStart: '2026-05-22',
  dateRangeEnd: '2026-05-24',
  startCity: 'Belmont, MA',
  endCity: 'Peru, VT',
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
  lodging: { name: 'Our Cabin', address: 'Peru, VT', lat: 43.2398, lng: -72.9051 },
  days: [
    { n: 1, date: 'Fri May 22', isoDate: '2026-05-22', title: 'At the cabin', drive: { from: '', to: '', hours: '', miles: 0 }, lodging: '', stops: [] },
    { n: 2, date: 'Sat May 23', isoDate: '2026-05-23', title: 'Around the lake', drive: { from: '', to: '', hours: '', miles: 0 }, lodging: '', stops: [] },
  ],
}

// Deterministic nearby results keyed off the category query the tray sends.
const BY_QUERY = [
  { match: 'restaurant', results: [
    { placeId: 'r1', name: 'Cabin Diner', address: '1 Main St', lat: 43.24, lng: -72.90, distanceMeters: 800, openNow: true, phone: null },
    { placeId: 'r2', name: 'The Tavern', address: '2 Main St', lat: 43.25, lng: -72.91, distanceMeters: 2600, openNow: false, phone: null },
  ] },
  { match: 'park', results: [
    { placeId: 'p1', name: 'Pine Playground', address: 'Forest Rd', lat: 43.26, lng: -72.92, distanceMeters: 1500, openNow: true, phone: null },
  ] },
  { match: 'scenic', results: [
    { placeId: 's1', name: 'Mountain Overlook', address: 'Ridge Rd', lat: 43.27, lng: -72.93, distanceMeters: 4200, openNow: null, phone: null },
  ] },
  { match: 'cafe', results: [
    { placeId: 't1', name: 'Maple Creemee Stand', address: 'Dairy Ln', lat: 43.28, lng: -72.94, distanceMeters: 900, openNow: true, phone: null },
  ] },
]

async function mockNearby(page, { fail = false } = {}) {
  // Registered AFTER the fixture's worker catch-all, so this wins for the
  // /places/nearby calls the tray makes.
  await page.route(/workers\.dev\/places\/nearby$/, async (route) => {
    if (fail) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) })
      return
    }
    let q = ''
    try { q = (JSON.parse(route.request().postData() || '{}').query || '').toLowerCase() } catch { /* */ }
    const hit = BY_QUERY.find((e) => q.includes(e.match))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ results: hit ? hit.results : [], radiusMeters: 10000 }),
    })
  })
}

async function openWeCould(page, who) {
  await page.goto(`/?person=${who}&trip=wecould-stay-2026&nosw=1`)
  await expect(page.getByTestId('stay-tabbar')).toBeVisible({ timeout: 10000 })
  await page.locator('.stay-tab', { hasText: 'We could' }).click()
  await expect(page.getByTestId('wecould-nearby')).toBeVisible({ timeout: 10000 })
}

test.describe('We could… nearby tray (slice 3a)', () => {
  test('the tray auto-suggests nearby ideas on a stay — never empty', async ({ page }) => {
    await seedTripIntoCache(page, STAY)
    await mockNearby(page)
    await openWeCould(page, 'jonathan')

    await expect(page.getByTestId('wecould-nearby')).toContainText('Ideas near Our Cabin')
    // results from multiple categories, deduped, are present
    const cards = page.getByTestId('wecould-card')
    await expect(cards.first()).toBeVisible()
    await expect(cards).toHaveCount(5) // r1,r2,p1,s1,t1
    await expect(page.getByText('Cabin Diner')).toBeVisible()
    await expect(page.getByText('Pine Playground')).toBeVisible()
    await expect(page.getByText('Maple Creemee Stand')).toBeVisible()
    // open-now status surfaced honestly
    await expect(page.getByTestId('wecould-nearby').getByText('Open now').first()).toBeVisible()
  })

  test('keep floats a card to the top; hide removes it', async ({ page }) => {
    await seedTripIntoCache(page, STAY)
    await mockNearby(page)
    await openWeCould(page, 'jonathan')

    const cards = page.getByTestId('wecould-card')
    await expect(cards).toHaveCount(5)

    // Keep the card for "Pine Playground" → it floats to the top with a
    // pressed "Kept" state.
    const playground = cards.filter({ hasText: 'Pine Playground' })
    await playground.getByTestId('wecould-keep').click()
    await expect(cards.first()).toContainText('Pine Playground')
    await expect(cards.first().getByTestId('wecould-keep')).toHaveAttribute('aria-pressed', 'true')

    // Hide "Cabin Diner" → it leaves the tray.
    await cards.filter({ hasText: 'Cabin Diner' }).getByTestId('wecould-hide').click()
    await expect(cards).toHaveCount(4)
    await expect(page.getByText('Cabin Diner')).toHaveCount(0)
  })

  test('a failed nearby lookup degrades quietly — the page is not broken', async ({ page }) => {
    await seedTripIntoCache(page, STAY)
    await mockNearby(page, { fail: true })
    await openWeCould(page, 'jonathan')

    await expect(page.getByTestId('wecould-nearby')).toContainText(/Couldn.t load nearby ideas/i)
    await expect(page.getByTestId('wecould-card')).toHaveCount(0)
    // the rest of the surface still renders (the "We could…" page heading)
    await expect(page.getByText('We could…', { exact: true })).toBeVisible()
  })

  // Contrast gate across every lens — the accent-fill ("Kept") + category
  // tints + status dots must pass WCAG AA on each surface (the recurring trap).
  for (const who of ['jonathan', 'helen', 'aurelia', 'rafa']) {
    test(`${who}: the tray (with a kept card) has no serious a11y violations`, async ({ page }) => {
      await seedTripIntoCache(page, STAY)
      await mockNearby(page)
      await openWeCould(page, who)
      // exercise the accent-fill state so axe sees the "Kept" button
      await page.getByTestId('wecould-card').first().getByTestId('wecould-keep').click()
      await expect(page.getByTestId('wecould-card').first().getByTestId('wecould-keep')).toHaveAttribute('aria-pressed', 'true')
      await expectNoSeriousA11y(page, { include: '[data-testid="wecould-nearby"]', label: `we could · ${who}` })
    })
  }
})
