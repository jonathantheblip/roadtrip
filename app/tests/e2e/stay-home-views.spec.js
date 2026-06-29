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

  test('Helen leads with the place on a stay', async ({ page }) => {
    await page.goto('/?person=helen&trip=stay-home-2026&nosw=1')
    // Slice 3a: Helen's road-trip chrome (the place-card + day-by-day timeline)
    // is shed on a stay — the living heart leads with the place in its hero.
    const home = page.getByTestId('living-heart-home')
    await expect(home).toBeVisible({ timeout: 10000 })
    await expect(home.getByText('At Our Cabin')).toBeVisible()
  })

  test('Aurelia leads the day with the place on a stay', async ({ page }) => {
    await page.goto('/?person=aurelia&trip=stay-home-2026&nosw=1')
    // Slice 3a: Aurelia's roll + day list are shed on a stay — the living heart
    // leads with the place in its hero.
    const home = page.getByTestId('living-heart-home')
    await expect(home).toBeVisible({ timeout: 10000 })
    await expect(home.getByText('At Our Cabin')).toBeVisible()
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
      // On a STAY, both personas render the redesigned LivingHeartHome; its hero
      // leads with "At [place]" (Jonathan slice 1, Helen slice 2).
      const band = page.getByTestId('living-heart-home')
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

// Destination auto-recognition: the cabin address sits in endCity with a BLANK
// lodging (the real Vermont trip's shape) → it used to infer 'route' (drive
// scaffolding, the dock, clock-picked stops). The safe rule recognizes the stay.
const DEST_ONLY = {
  id: 'dest-only-2026',
  status: 'planning',
  title: 'Vermont — Juneteenth',
  subtitle: 'fixture',
  dateRange: 'May 22 – 24, 2026',
  dateRangeStart: '2026-05-22',
  dateRangeEnd: '2026-05-24',
  startCity: 'Belmont, MA',
  endCity: '613 Forest Mountain Road, Peru, VT', // the place is in the DESTINATION
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
  // No lodging, no homeBase → bases-empty; before auto-recognition this was 'route'.
  days: [
    { n: 1, date: 'Fri May 22', isoDate: '2026-05-22', title: 'At the cabin', drive: { from: 'Belmont, MA', to: '', hours: '', miles: 0 }, lodging: '', stops: [] },
    { n: 2, date: 'Sat May 23', isoDate: '2026-05-23', title: 'Around the lake', drive: { from: '', to: 'Belmont, MA', hours: '', miles: 0 }, lodging: '', stops: [] },
  ],
}

test.describe('destination auto-recognition (place typed as the trip end)', () => {
  test('jonathan: a destination-only trip renders as a STAY, named from endCity', async ({ page }) => {
    await seedTripIntoCache(page, DEST_ONLY)
    await page.goto('/?person=jonathan&trip=dest-only-2026&nosw=1')
    // It's recognized as a stay → the 4-tab bar shows (a route would show the dock).
    await expect(page.getByTestId('stay-tabbar')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.switcher')).toHaveCount(0)
    // The Now band leads with the place, named from the destination ("Peru").
    // Jonathan's stay home is the redesigned LivingHeartHome; the hero says "At Peru".
    await expect(page.getByTestId('living-heart-home').getByText('At Peru')).toBeVisible()
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
