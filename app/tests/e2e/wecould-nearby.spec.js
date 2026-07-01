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
    // Cabin Diner carries a (worker-proxied) photoUrl; The Tavern has none → tint-band fallback.
    { placeId: 'r1', name: 'Cabin Diner', address: '1 Main St', lat: 43.24, lng: -72.90, distanceMeters: 800, openNow: true, phone: null, photoUrl: 'https://example.test/places/photo?name=places/r1/photos/x&w=640' },
    { placeId: 'r2', name: 'The Tavern', address: '2 Main St', lat: 43.25, lng: -72.91, distanceMeters: 2600, openNow: false, phone: null, photoUrl: null },
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

// A 1×1 PNG so a card's photoUrl actually LOADS (otherwise the <img> fires
// onError and correctly falls back to the tint band — which would race the
// "photo renders" assertion).
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

async function mockNearby(page, { fail = false } = {}) {
  // The photo proxy URL the worker hands back — return a real image so the
  // card's <img> loads (and the fallback path is exercised by The Tavern,
  // which has no photoUrl at all).
  await page.route(/\/places\/photo\?/, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1x1 }),
  )
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

  test('the conditions strip shows the place + the day\'s light, and category chips appear', async ({ page }) => {
    await seedTripIntoCache(page, STAY)
    await mockNearby(page)
    await openWeCould(page, 'jonathan')
    const cond = page.getByTestId('wecould-conditions')
    await expect(cond).toContainText('Ideas near Our Cabin')
    await expect(cond).toContainText(/Sunset/i) // golden-hour/sunset calc engaged for the stay's coords
    await expect(page.getByTestId('wecould-cats')).toBeVisible()
  })

  test('the category filter narrows the tray and clears', async ({ page }) => {
    await seedTripIntoCache(page, STAY)
    await mockNearby(page)
    await openWeCould(page, 'jonathan')
    await expect(page.getByTestId('wecould-card')).toHaveCount(5)
    const chips = page.getByTestId('wecould-cats')
    await chips.getByRole('button', { name: 'A bite' }).click()
    await expect(page.getByTestId('wecould-card')).toHaveCount(2) // Cabin Diner + The Tavern
    await chips.getByRole('button', { name: 'A bite' }).click() // tap again to clear
    await expect(page.getByTestId('wecould-card')).toHaveCount(5)
  })

  test('a card with a photo renders the real image; one without falls back to the tint band', async ({ page }) => {
    await seedTripIntoCache(page, STAY)
    await mockNearby(page)
    await openWeCould(page, 'jonathan')
    const diner = page.getByTestId('wecould-card').filter({ hasText: 'Cabin Diner' })
    await expect(diner.locator('img')).toHaveAttribute('src', /places\/photo\?name=/)
    // The Tavern has no photoUrl → no <img>, just the category band.
    await expect(page.getByTestId('wecould-card').filter({ hasText: 'The Tavern' }).locator('img')).toHaveCount(0)
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

  test('an UNLOCATED stay offers "Locate this stay" → tapping it geocodes + fills the tray', async ({ page }) => {
    // The AI/screenshot shape: a lodging ADDRESS but no coords (no homeBase, no
    // lodging.lat/lng, no located stop) — so the tray can't search until located.
    const UNLOCATED = {
      ...STAY,
      id: 'wecould-unlocated-2026',
      shape: 'stay',
      lodging: { name: 'Harbor Breeze', address: '690 Commercial St #4d' }, // intentionally no lat/lng
      locationLabel: '690 Commercial St #4d, Provincetown, MA',
      homeBase: undefined,
    }
    await seedTripIntoCache(page, UNLOCATED)
    await mockNearby(page)
    // Mock the keyless geocoder (Nominatim) the Locate handler calls. Registered
    // before navigation so the tap's lookup is deterministic (CI never hits OSM).
    await page.route(/nominatim\.openstreetmap\.org\/search/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ lat: '42.0584', lon: '-70.1787' }]),
      }),
    )

    await page.goto(`/?person=jonathan&trip=${UNLOCATED.id}&nosw=1`)
    await expect(page.getByTestId('stay-tabbar')).toBeVisible({ timeout: 10000 })
    await page.locator('.stay-tab', { hasText: 'We could' }).click()

    // No coords yet → the Locate prompt (not the tray, not silent emptiness).
    await expect(page.getByTestId('wecould-locate')).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('wecould-card')).toHaveCount(0)
    // A new interactive surface — gate it for a11y (accent-fill button + text).
    await expectNoSeriousA11y(page, { include: '[data-testid="wecould-nearby"]', label: 'we could · locate prompt' })

    // Tap Locate → geocode → coords persist (trip.lodging.lat/lng) → the tray
    // re-renders WITH coords and fetches the nearby ideas.
    await page.getByTestId('wecould-locate-btn').click()
    await expect(page.getByTestId('wecould-card').first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Cabin Diner')).toBeVisible()
  })

  // THE COMPOSITE MIRROR — a multi-city trip anchors "We could…" to WHERE IT IS
  // NOW (the current leg), not one whole-trip place. Clock is 2026-05-23: Rome's
  // window (05-20 – 05-22) is over, Florence (05-23 – 05-24) is the current leg.
  const COMPOSITE_LOCATED = {
    id: 'wecould-composite-located',
    status: 'planning',
    title: 'Italy composite',
    subtitle: 'fixture',
    dateRange: 'May 20 – 26, 2026',
    dateRangeStart: '2026-05-20',
    dateRangeEnd: '2026-05-26',
    travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
    parts: [
      { id: 'p-rome', type: 'city', place: { name: 'Rome', lat: 41.9028, lng: 12.4964 }, dateStart: '2026-05-20', dateEnd: '2026-05-22' },
      { id: 'p-flor', type: 'city', place: { name: 'Florence', lat: 43.7696, lng: 11.2558 }, dateStart: '2026-05-23', dateEnd: '2026-05-24' },
    ],
    days: [],
  }

  test('a composite trip\'s tray anchors to the CURRENT leg (Florence), not the whole trip', async ({ page }) => {
    await seedTripIntoCache(page, COMPOSITE_LOCATED)
    await mockNearby(page)
    await page.goto(`/?person=jonathan&trip=${COMPOSITE_LOCATED.id}&nosw=1`)
    await expect(page.getByTestId('stay-tabbar')).toBeVisible({ timeout: 10000 })
    await page.locator('.stay-tab', { hasText: 'We could' }).click()
    await expect(page.getByTestId('wecould-nearby')).toBeVisible({ timeout: 10000 })

    await expect(page.getByTestId('wecould-nearby')).toContainText('Ideas near Florence')
    await expect(page.getByTestId('wecould-card').first()).toBeVisible()
  })

  // Florence has a place NAME but no coords yet (the real shape today — no
  // current producer, AI or manual, geocodes a leg at creation time) → the
  // per-leg mirror of "Locate this stay": "Locate this leg" fills the tray.
  const COMPOSITE_UNLOCATED = {
    ...COMPOSITE_LOCATED,
    id: 'wecould-composite-unlocated',
    parts: [
      { id: 'p-rome', type: 'city', place: 'Rome', dateStart: '2026-05-20', dateEnd: '2026-05-22' },
      { id: 'p-flor', type: 'city', place: 'Florence', locale: 'it-IT', dateStart: '2026-05-23', dateEnd: '2026-05-24' },
    ],
  }

  test('an UNLOCATED composite leg offers "Locate this leg" → tapping it geocodes + fills the tray, scoped to Florence only', async ({ page }) => {
    await seedTripIntoCache(page, COMPOSITE_UNLOCATED)
    await mockNearby(page)
    await page.route(/nominatim\.openstreetmap\.org\/search/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ lat: '43.7696', lon: '11.2558' }]) }),
    )
    await page.goto(`/?person=jonathan&trip=${COMPOSITE_UNLOCATED.id}&nosw=1`)
    await expect(page.getByTestId('stay-tabbar')).toBeVisible({ timeout: 10000 })
    await page.locator('.stay-tab', { hasText: 'We could' }).click()

    await expect(page.getByTestId('wecould-locate')).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('wecould-locate')).toContainText('Florence')
    await expect(page.getByTestId('wecould-card')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Locate this leg/i })).toBeVisible()
    await expectNoSeriousA11y(page, { include: '[data-testid="wecould-nearby"]', label: 'we could · locate leg prompt' })

    await page.getByTestId('wecould-locate-btn').click()
    await expect(page.getByTestId('wecould-card').first()).toBeVisible({ timeout: 10000 })

    // Rome — the OTHER leg — never got geocoded (the leg-scoped fallback only
    // located the CURRENT leg), and never should be: this trip's "today" is
    // Florence's, not Rome's.
    const parts = await page.evaluate((id) => {
      const all = JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]')
      return all.find((t) => t.id === id)?.parts || []
    }, COMPOSITE_UNLOCATED.id)
    expect(parts.find((p) => p.id === 'p-flor')?.coords).toEqual({ lat: 43.7696, lng: 11.2558 })
    expect(parts.find((p) => p.id === 'p-rome')?.coords).toBeUndefined()
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
