// "Get directions" for a check-in/check-out stop on a STAY must point at the
// trip's own lodging address, not whatever (often vaguer) address the stop
// itself carries. Live bug (2026-07-01): an "Arrive" stop's own address was
// just the city ("Provincetown, MA" — no street number), so mapsLink's
// full-address heuristic rejected it and fell back to a vague city search
// instead of the real street address; a "Depart" stop showed the family's
// home city instead of the stay. See lib/mapsLink.js + views/StopDetail.jsx
// (lodgingAwareStop).
import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, TINY_RED_PNG_DATA_URL } from './_fixtures/withTrip.js'

// Clock is 2026-05-23 (clockStub) — all three stops sit on that one day so
// "On the agenda" (which shows only today's stops) surfaces all of them at
// once, reachable exactly the way a person would tap into them.
const STAY = {
  id: 'directions-stay-2026',
  shape: 'stay',
  status: 'planning',
  title: 'Provincetown July 4th',
  subtitle: 'fixture',
  dateRange: 'May 22 – 25, 2026',
  dateRangeStart: '2026-05-22',
  dateRangeEnd: '2026-05-25',
  startCity: 'Belmont, MA',
  endCity: 'Belmont, MA', // a stay is a round trip — home both ends (real trip-level data, G6)
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
  heroImage: TINY_RED_PNG_DATA_URL,
  lodging: { name: 'Harbor Breeze', address: '690 Commercial St #4d, Provincetown, MA', lat: 42.0584, lng: -70.1787 },
  days: [
    {
      n: 1, isoDate: '2026-05-23', date: 'Sat May 23', title: 'A day in Provincetown', lodging: 'Harbor Breeze',
      stops: [
        { id: 'arrive-1', time: '9:00 AM', name: 'Arrive', kind: 'arrival', address: 'Provincetown, MA', for: ['jonathan', 'helen', 'aurelia', 'rafa'] },
        { id: 'dinner-1', time: '6:30 PM', name: 'Spiritus', kind: 'dinner', address: '190 Commercial St, Provincetown, MA', for: ['jonathan', 'helen', 'aurelia', 'rafa'] },
        // A "Depart"-shaped stop whose OWN address is the family's home city —
        // the day-level `lodging` field flips to "— (home)" on a real checkout
        // day (per StopDetail's isLodgingStop convention); the stop's kind is
        // what this fix keys off, not that day-level join.
        { id: 'depart-1', time: '10:00 PM', name: 'Depart', kind: 'departure', address: 'Belmont, MA', for: ['jonathan', 'helen', 'aurelia', 'rafa'] },
      ],
    },
  ],
}

test('an "Arrive" stop\'s directions link uses the FULL lodging address, not the bare city', async ({ page }) => {
  await seedTripIntoCache(page, STAY)
  await page.goto(`/?person=jonathan&trip=${STAY.id}&nosw=1`)
  // Reach the stop the way a person would: tap it in the agenda / plan.
  await page.getByRole('button', { name: /^Arrive$/i }).click()
  const link = page.getByRole('link', { name: /Open in Waze/i })
  await expect(link).toBeVisible({ timeout: 10000 })
  const href = await link.getAttribute('href')
  expect(href).toContain(encodeURIComponent('690 Commercial St #4d, Provincetown, MA'))
})

test('a "Depart" stop\'s directions link uses the stay\'s address — never the family\'s home city', async ({ page }) => {
  await seedTripIntoCache(page, STAY)
  await page.goto(`/?person=jonathan&trip=${STAY.id}&nosw=1`)
  await page.getByRole('button', { name: /^Depart$/i }).click()
  const link = page.getByRole('link', { name: /Open in Waze/i })
  await expect(link).toBeVisible({ timeout: 10000 })
  const href = await link.getAttribute('href')
  expect(href).toContain(encodeURIComponent('690 Commercial St #4d, Provincetown, MA'))
  expect(href).not.toContain(encodeURIComponent('Belmont'))
})

test('a normal (non-lodging) stop keeps its OWN address — unaffected, byte-identical', async ({ page }) => {
  await seedTripIntoCache(page, STAY)
  await page.goto(`/?person=jonathan&trip=${STAY.id}&nosw=1`)
  await page.getByRole('button', { name: /^Spiritus$/i }).click()
  const link = page.getByRole('link', { name: /Open in Waze/i })
  await expect(link).toBeVisible({ timeout: 10000 })
  const href = await link.getAttribute('href')
  expect(href).toContain(encodeURIComponent('190 Commercial St, Provincetown, MA'))
})

test('helen (Apple Maps lens) also gets the lodging address for the Arrive stop', async ({ page }) => {
  await seedTripIntoCache(page, STAY)
  await page.goto(`/?person=helen&trip=${STAY.id}&nosw=1`)
  await page.getByRole('button', { name: /^Arrive$/i }).click()
  const link = page.getByRole('link', { name: /Open in Maps/i })
  await expect(link).toBeVisible({ timeout: 10000 })
  const href = await link.getAttribute('href')
  expect(href).toContain(encodeURIComponent('690 Commercial St #4d, Provincetown, MA'))
})
