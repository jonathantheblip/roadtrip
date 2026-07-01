import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, TINY_RED_PNG_DATA_URL } from './_fixtures/withTrip.js'

// Design decision 2 — "Leave when?" → "Getting there", mode-aware. A short walk
// shouldn't wear a car's clothing: a walkable stop softens (no traffic leave-by,
// a gentle nudge or none at all, a walking deep-link); a far stop keeps today's
// full traffic-aware drive countdown. Also proves the origin fallback — the
// affordance now appears on a STAY (origin = the lodging coords, which
// tripHomeBase deliberately ignores).

// A during stay (clock 2026-05-23) with two of today's stops: one a short walk
// from the lodging, one a long drive. Lodging carries coords → the stay origin.
const LODGING = { lat: 42.0584, lng: -70.1787 }
const STAY = {
  id: 'gt-stay', shape: 'stay', status: 'planning', title: 'Provincetown',
  subtitle: 'fixture', dateRange: 'May 22 – 25, 2026',
  dateRangeStart: '2026-05-22', dateRangeEnd: '2026-05-25',
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
  heroImage: TINY_RED_PNG_DATA_URL,
  lodging: { name: 'Harbor Breeze', address: '690 Commercial St, Provincetown, MA', ...LODGING },
  days: [
    {
      n: 2, isoDate: '2026-05-23', date: 'Sat May 23', title: 'Beach', lodging: 'Harbor Breeze',
      stops: [
        // ~200 m from the lodging → a walk.
        { id: 'gt-walk', time: '3:00 PM', name: 'Corner Café', kind: 'food',
          for: ['jonathan'], note: 'coffee', address: 'nearby', lat: 42.0602, lng: -70.1787 },
        // ~20 km away → a drive.
        { id: 'gt-drive', time: '5:00 PM', name: 'Big Aquarium', kind: 'sights',
          for: ['jonathan'], note: 'fish', address: 'far', lat: 42.24, lng: -70.18 },
        // A short walk with NO fixed time → open-ended (nothing to time).
        { id: 'gt-open', time: '', name: 'Beach Shack', kind: 'food',
          for: ['jonathan'], note: 'snacks', address: 'nearby', lat: 42.0596, lng: -70.1787 },
      ],
    },
  ],
}

async function openStopThenGettingThere(page, stopName) {
  const home = page.getByTestId('living-heart-home')
  await expect(home).toBeVisible({ timeout: 10000 })
  await home.getByRole('button', { name: stopName }).click()
  await page.getByRole('button', { name: /Getting there/i }).click()
  return page.getByRole('dialog', { name: /Getting there/i })
}

test('a walkable stop shows the calm walk face — no traffic, a walking deep-link', async ({ page }) => {
  await seedTripIntoCache(page, STAY)
  await page.goto('/?person=jonathan&trip=gt-stay&nosw=1')
  const dialog = await openStopThenGettingThere(page, /Corner Café/i)

  await expect(dialog.getByText(/about a \d+-min walk/i)).toBeVisible()
  // A gentle nudge (fixed time), never a red "in traffic" countdown.
  await expect(dialog.getByText(/gentle nudge, not an alarm/i)).toBeVisible()
  await expect(dialog.getByText(/in traffic/i)).toHaveCount(0)
  // Walking deep-link, and no drive-only "Re-check".
  await expect(dialog.getByRole('link', { name: /walk there/i })).toBeVisible()
  await expect(dialog.getByRole('button', { name: /re-check/i })).toHaveCount(0)
})

test('an open-ended walk (no fixed time) shows no leave-by at all — "no need to time it"', async ({ page }) => {
  await seedTripIntoCache(page, STAY)
  await page.goto('/?person=jonathan&trip=gt-stay&nosw=1')
  const dialog = await openStopThenGettingThere(page, /Beach Shack/i)

  await expect(dialog.getByText(/about a \d+-min walk/i)).toBeVisible()
  await expect(dialog.getByText(/no need to time it/i)).toBeVisible()
  // Nothing to time → no nudge, no "be there by" input, no traffic.
  await expect(dialog.getByText(/gentle nudge/i)).toHaveCount(0)
  await expect(dialog.getByText(/be there by/i)).toHaveCount(0)
  await expect(dialog.getByRole('link', { name: /walk there/i })).toBeVisible()
})

test('a far stop keeps the drive face — a traffic re-check + driving deep-link, not a walk', async ({ page }) => {
  await seedTripIntoCache(page, STAY)
  await page.goto('/?person=jonathan&trip=gt-stay&nosw=1')
  const dialog = await openStopThenGettingThere(page, /Big Aquarium/i)

  // The drive flow is intact: the traffic-aware "Re-check" (a Worker call, never
  // shown on a walk) + the driving deep-link. The walk face is absent — a 20 km
  // stop is not softened into "about an N-min walk."
  await expect(dialog.getByRole('button', { name: /re-check/i })).toBeVisible()
  await expect(dialog.getByRole('link', { name: /open in (maps|waze)/i })).toBeVisible()
  await expect(dialog.getByText(/about a \d+-min walk/i)).toHaveCount(0)
  await expect(dialog.getByRole('link', { name: /walk there/i })).toHaveCount(0)
})
