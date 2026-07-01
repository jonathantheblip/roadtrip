import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, TINY_RED_PNG_DATA_URL } from './_fixtures/withTrip.js'

// Design decision 1 — the Map panel adapts to how you're moving. The drive %/bar
// answered a question a stay never asked ("This drive 64%" on a beach hangout).
// A stay (and a composite/multi-city trip) now gets the calm "Where we are" face:
// place-oriented, NO drive bar, NO "up next" road rail. The drive face survives
// unchanged for a genuine road trip (covered by map-road-route.spec.js).

// A stay straddling the stubbed clock (2026-05-23) → "during", so it leads with
// the living heart whose hero opens the live map. Coords make it a real stay.
const DURING_STAY = {
  id: 'mf-stay', shape: 'stay', status: 'planning', title: 'Provincetown',
  subtitle: 'fixture', dateRange: 'May 22 – 25, 2026',
  dateRangeStart: '2026-05-22', dateRangeEnd: '2026-05-25',
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
  heroImage: TINY_RED_PNG_DATA_URL,
  lodging: { name: 'Harbor Breeze', address: '690 Commercial St, Provincetown, MA', lat: 42.0584, lng: -70.1787 },
  days: [
    { n: 1, isoDate: '2026-05-22', date: 'Fri May 22', title: 'Arrive', lodging: 'Harbor Breeze', stops: [] },
    { n: 2, isoDate: '2026-05-23', date: 'Sat May 23', title: 'Beach', lodging: 'Harbor Breeze', stops: [] },
  ],
}

async function openMap(page) {
  const home = page.getByTestId('living-heart-home')
  await expect(home).toBeVisible({ timeout: 10000 })
  // The hero ("Where we are — At [place]") opens the live map.
  await home.getByRole('button', { name: /Where we are/i }).click()
}

test('a stay opens the calm "Where we are" map face — no drive bar, no road rail', async ({ page }) => {
  await seedTripIntoCache(page, DURING_STAY)
  await page.goto('/?person=jonathan&trip=mf-stay&nosw=1')
  await openMap(page)

  // The where-we-are panel is the one that renders…
  const panel = page.getByTestId('map-where-we-are')
  await expect(panel).toBeVisible({ timeout: 7000 })
  await expect(panel.getByText('Harbor Breeze')).toBeVisible()

  // …and the road-trip framing is gone: no "This drive %", no road miles, no
  // "Up next / Done" rail (all of which answered a question a stay never asked).
  await expect(page.getByText('This drive')).toHaveCount(0)
  await expect(page.getByTestId('map-road-miles')).toHaveCount(0)
  await expect(page.getByText(/^Up next$/)).toHaveCount(0)
})
