// Family-trips: each persona's HOME view leads with the place on a STAY (mirrors
// JonathanView's "AT [place]" card), shedding road-trip scaffolding. Guards the
// per-persona stay reshape (Helen / Aurelia / Rafa phone + RafaPad iPad).
import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, FIXTURE_ROUTE_TRIP } from './_fixtures/withTrip.js'

// A destination-less cabin STAY (geocoded lodging → isStayTrip true), dates
// straddling the stubbed clock so it cold-loads as the active trip.
const STAY = {
  id: 'stay-home-2026',
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

test.describe('stay home views — phone / standard', () => {
  test.beforeEach(async ({ page }) => {
    await seedTripIntoCache(page, STAY)
  })

  test('Helen leads with the place card on a stay', async ({ page }) => {
    await page.goto('/?person=helen&trip=stay-home-2026&nosw=1')
    const card = page.getByTestId('helen-stay-place-card')
    await expect(card).toBeVisible({ timeout: 10000 })
    await expect(card).toContainText('Our Cabin')
  })

  test('Aurelia leads the day with the place on a stay', async ({ page }) => {
    await page.goto('/?person=aurelia&trip=stay-home-2026&nosw=1')
    const line = page.getByTestId('aurelia-stay-place')
    await expect(line).toBeVisible({ timeout: 10000 })
    await expect(line).toContainText('Our Cabin')
  })

  test('Rafa leads with the place hero on a stay (no dead zone)', async ({ page }) => {
    await page.goto('/?person=rafa&trip=stay-home-2026&nosw=1')
    const card = page.getByTestId('rafa-stay-place-card')
    await expect(card).toBeVisible({ timeout: 10000 })
    await expect(card).toContainText('Our Cabin')
  })
})

// The dock carried a live "At [place] · next" readout; on a STAY the dock is
// hidden, so the Now band's Live Map register shows that readout itself (the
// lenses with a live ledge — jonathan/helen). On a ROUTE the dock still shows
// it, so the band stays the generic "Where we are now" (G5 — no duplication).
test.describe('Now-band live readout (stay re-home of the dock ledge)', () => {
  for (const who of ['jonathan', 'helen']) {
    test(`${who}: the Now band shows "At [place]" on a stay, not the generic link`, async ({ page }) => {
      await seedTripIntoCache(page, STAY)
      await page.goto(`/?person=${who}&trip=stay-home-2026&nosw=1`)
      const band = page.getByTestId(`${who}-entries`)
      await expect(band).toBeVisible({ timeout: 10000 })
      await expect(band.getByText('At Our Cabin')).toBeVisible()
    })
  }

  test('jonathan: a ROUTE keeps the generic "Where we are now" (the dock carries the readout)', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_ROUTE_TRIP)
    await page.goto('/?person=jonathan&trip=roadtrip-2026&nosw=1')
    const band = page.getByTestId('jonathan-entries')
    await expect(band).toBeVisible({ timeout: 10000 })
    // The generic title stands (readout is null on a route → not replaced); the
    // dock carries the live readout instead. The route fixture's base is "Beach
    // Bungalow", so a leaked readout would read "At Beach Bungalow".
    await expect(band.getByText('Where we are now')).toBeVisible()
    await expect(band.getByText('At Beach Bungalow')).toHaveCount(0)
  })
})

test.describe('RafaPad (iPad) on a stay', () => {
  // iPad = width ≥768 + touch (pointer:coarse) → useIsIpad true. isMobile is a
  // Chromium emulation; skip elsewhere.
  test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true })
  test.skip(({ browserName }) => browserName !== 'chromium', 'iPad emulation (isMobile) is Chromium-only')

  test('RafaPad shows the place tile + map empty-state on a stay', async ({ page }) => {
    await seedTripIntoCache(page, STAY)
    await page.goto('/?person=rafa&trip=stay-home-2026&nosw=1')
    await expect(page.getByTestId('rafa-pad')).toBeVisible({ timeout: 10000 })
    const placeTile = page.getByTestId('rafa-pad-place-tile')
    await expect(placeTile).toBeVisible({ timeout: 10000 })
    await expect(placeTile).toContainText('Our Cabin')
    // tap → the adventure-map stay empty-state (no degenerate road)
    await placeTile.click()
    await expect(page.getByTestId('rafa-map')).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('rafa-map')).toContainText('home base')
  })
})
