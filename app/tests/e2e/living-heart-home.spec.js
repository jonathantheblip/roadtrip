// LivingHeartHome — the redesigned "Now" home for a STAY (Jonathan's lens, slice 1).
// It must feel alive at every stage: empty/upcoming leads with the place + gentle
// "fills in as you go" prompts (no sad blanks); with content, the Lately carousel
// appears. The weave entry is ALWAYS reachable (populated or a promise).
import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, seedMemoriesIntoCache, TINY_RED_PNG_DATA_URL } from './_fixtures/withTrip.js'

// Clock is stubbed to 2026-05-23 (see clockStub). An UPCOMING stay sits after it.
const UPCOMING_STAY = {
  id: 'lhh-upcoming', shape: 'stay', status: 'planning', title: 'Provincetown', subtitle: 'fixture',
  dateRange: 'Jun 10 – 14, 2026', dateRangeStart: '2026-06-10', dateRangeEnd: '2026-06-14',
  startCity: 'Belmont, MA', endCity: 'Provincetown, MA',
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
  heroImage: TINY_RED_PNG_DATA_URL,
  lodging: { name: 'Harbor Breeze', address: '690 Commercial St, Provincetown, MA', lat: 42.0584, lng: -70.1787 },
  days: [{ n: 1, isoDate: '2026-06-10', date: 'Wed Jun 10', title: 'Arrive', lodging: 'Harbor Breeze', stops: [] }],
}

// A stay straddling the stubbed clock → "during"; we seed photos for the carousel.
const DURING_STAY = {
  ...UPCOMING_STAY,
  id: 'lhh-during',
  dateRange: 'May 22 – 25, 2026', dateRangeStart: '2026-05-22', dateRangeEnd: '2026-05-25',
  days: [
    { n: 1, isoDate: '2026-05-22', date: 'Fri May 22', title: 'Arrive', lodging: 'Harbor Breeze', stops: [] },
    { n: 2, isoDate: '2026-05-23', date: 'Sat May 23', title: 'Beach', lodging: 'Harbor Breeze', stops: [] },
  ],
}
const PHOTOS = [
  { id: 'lhh-p1', tripId: 'lhh-during', stopId: null, authorTraveler: 'helen', visibility: 'shared', kind: 'photo', caption: '', photoRef: { url: TINY_RED_PNG_DATA_URL, w: 1, h: 1 }, createdAt: '2026-05-23T15:00:00.000Z' },
  { id: 'lhh-p2', tripId: 'lhh-during', stopId: null, authorTraveler: 'jonathan', visibility: 'shared', kind: 'photo', caption: '', photoRef: { url: TINY_RED_PNG_DATA_URL, w: 1, h: 1 }, createdAt: '2026-05-23T14:00:00.000Z' },
]

test('an upcoming stay leads with the place + gentle fills, never a sad blank', async ({ page }) => {
  await seedTripIntoCache(page, UPCOMING_STAY)
  // An UPCOMING trip isn't "active today", so a ?trip= deep-link is dropped on
  // cold load (a future trip must not hijack launch). Open it from the index,
  // the way a person would.
  await page.goto('/?person=jonathan&nosw=1')
  await page.getByRole('button').filter({ hasText: 'Provincetown' }).first().click()
  const home = page.getByTestId('living-heart-home')
  await expect(home).toBeVisible({ timeout: 10000 })
  // The place leads, with a real countdown (no faked "night 2 of 4").
  await expect(home.getByText('At Harbor Breeze')).toBeVisible()
  await expect(home.getByText(/In \d+ days|Tomorrow|Today/)).toBeVisible()
  // Gentle empty prompts, not blanks: the weave is always reachable, photos
  // "will gather", and a nudge to what you could do.
  await expect(home.getByTestId('open-weave')).toBeVisible()
  await expect(home.getByText(/Photos will gather here/i)).toBeVisible()
  await expect(home.getByRole('button', { name: /see what you could do/i })).toBeVisible()
})

test('a stay with photos shows the Lately carousel (no ghost)', async ({ page }) => {
  await seedTripIntoCache(page, DURING_STAY)
  await seedMemoriesIntoCache(page, PHOTOS)
  await page.goto('/?person=jonathan&trip=lhh-during&nosw=1')
  const home = page.getByTestId('living-heart-home')
  await expect(home).toBeVisible({ timeout: 10000 })
  await expect(home.getByText('Lately')).toBeVisible()
  // The ghost is gone, and real photo thumbnails are present.
  await expect(home.getByText(/Photos will gather here/i)).toHaveCount(0)
  await expect(home.getByRole('button', { name: 'Open photos' }).first()).toBeVisible()
})

// Design decision 4c: the SHAPE OF THE CONTENT decides simple-vs-complex, not a
// lone internal part. A manually-created trip carries ONE synthetic part; that must
// NOT force the complex "In [place]" + "The plan" frame. One place → simple "At".
const ONE_PART_STAY = {
  ...DURING_STAY,
  id: 'lhh-onepart',
  // Mirrors NewTrip output: exactly one part wrapping the whole stay. `place` is a
  // STRING (the convention the composite renderer + AI use).
  parts: [{ id: 'lhh-onepart__p1', type: 'stay', title: 'Harbor Breeze', place: 'Harbor Breeze', dateStart: '2026-05-22', dateEnd: '2026-05-25' }],
}
const TWO_PART_TRIP = {
  ...DURING_STAY,
  id: 'lhh-twopart',
  parts: [
    { id: 'p-a', type: 'city', title: 'Rome', place: 'Rome', dateStart: '2026-05-22', dateEnd: '2026-05-23' },
    { id: 'p-b', type: 'city', title: 'Florence', place: 'Florence', dateStart: '2026-05-24', dateEnd: '2026-05-25' },
  ],
}

test('a ONE-part stay renders the simple "At [place]" home — not the complex frame (4c)', async ({ page }) => {
  await seedTripIntoCache(page, ONE_PART_STAY)
  await page.goto('/?person=jonathan&trip=lhh-onepart&nosw=1')
  const home = page.getByTestId('living-heart-home')
  await expect(home).toBeVisible({ timeout: 10000 })
  await expect(home.getByText('At Harbor Breeze')).toBeVisible()
  // The complex frame stays OFF: no "The plan" section, no "In …" hero.
  await expect(home.getByText('The plan')).toHaveCount(0)
  await expect(home.getByText(/^In /)).toHaveCount(0)
})

test('a TWO-part trip still renders the composite frame ("In [city]" + The plan)', async ({ page }) => {
  await seedTripIntoCache(page, TWO_PART_TRIP)
  await page.goto('/?person=jonathan&trip=lhh-twopart&nosw=1')
  const home = page.getByTestId('living-heart-home')
  await expect(home).toBeVisible({ timeout: 10000 })
  await expect(home.getByText('The plan')).toBeVisible()
  await expect(home.getByText(/^In (Rome|Florence)/)).toBeVisible()
})
