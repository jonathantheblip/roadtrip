// Slice 2 — per-stop hiding. Hide ONE place on a trip's plan from chosen people.
// This is the CLIENT side of the security boundary (the in-app persona switcher:
// real trip data is cached, then re-viewed as another person — the worker guards
// each person's own device, this guards the same-device switch). Plus the composer
// create flow + manual reveal.
//
// NON-VACUOUS: the recipient render checks assert the real stop name/place are
// ABSENT from the page — drop the client mask and they render right there.
import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'

// A trip with two hidden stops on the active day (2026-05-23): one COVER, one
// TEASER, both hidden from rafa. Built off the fixture so the rest renders normally.
function tripWithSecretStops() {
  const t = JSON.parse(JSON.stringify(FIXTURE_TRIP))
  const day = t.days.find((d) => d.isoDate === '2026-05-23')
  day.stops.push({
    id: 'secret-cover', time: '6:00 PM', name: 'Surprise Dinner at Chez Fancy', kind: 'dinner',
    address: '99 Secret Lane', lat: 41.55, lng: -72.15,
    surprise: {
      author: 'jonathan', hideFrom: ['rafa'], conceal: 'cover', reveal: { type: 'manual' },
      cover: { icon: '🍦', title: 'Ice cream at the pier', loc: 'the pier', time: '6:00 PM', weather: 'mild', packing: 'a sweater' },
    },
  })
  day.stops.push({
    id: 'secret-teaser', time: '8:30 PM', name: 'Fireworks Over the Cove', kind: 'sights',
    address: '12 Hidden Cove', lat: 41.66, lng: -72.26,
    surprise: {
      author: 'jonathan', hideFrom: ['rafa'], conceal: 'teaser',
      reveal: { type: 'arrival', at: 'secret-teaser', label: 'Fireworks Over the Cove', lat: 41.66, lng: -72.26 },
    },
  })
  return t
}

async function gotoTrip(page, persona) {
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(`/?person=${persona}&trip=volleyball-2026&nosw=1`)
  return errors
}

// ── The masking render boundary (the security-critical part) ──────────────────

test('the AUTHOR sees the real hidden stops on the plan', async ({ page }) => {
  await seedTripIntoCache(page, tripWithSecretStops())
  const errors = await gotoTrip(page, 'jonathan')
  await expect(page.getByText('Surprise Dinner at Chez Fancy').first()).toBeVisible()
  await expect(page.getByText('Fireworks Over the Cove').first()).toBeVisible()
  expect(errors, errors.join(' | ')).toEqual([])
})

test('a non-targeted family member (helen) sees the real stops', async ({ page }) => {
  await seedTripIntoCache(page, tripWithSecretStops())
  const errors = await gotoTrip(page, 'helen')
  await expect(page.getByText('Surprise Dinner at Chez Fancy').first()).toBeVisible()
  expect(errors, errors.join(' | ')).toEqual([])
})

test('the RECIPIENT (rafa) sees the cover + teaser placeholder — the real stops NEVER leak', async ({ page }) => {
  await seedTripIntoCache(page, tripWithSecretStops())
  const errors = await gotoTrip(page, 'rafa')
  // Cover → believable stand-in on the plan.
  await expect(page.getByText('Ice cream at the pier').first()).toBeVisible()
  // Teaser → "something's coming" placeholder.
  await expect(page.getByText(/Something's coming/i).first()).toBeVisible()
  // The real things never appear anywhere on the page.
  await expect(page.getByText('Surprise Dinner at Chez Fancy')).toHaveCount(0)
  await expect(page.getByText('Chez Fancy')).toHaveCount(0)
  await expect(page.getByText('Secret Lane')).toHaveCount(0)
  await expect(page.getByText('Fireworks Over the Cove')).toHaveCount(0)
  await expect(page.getByText('Hidden Cove')).toHaveCount(0)
  expect(errors, errors.join(' | ')).toEqual([])
})

test('tapping the recipient cover stop opens its detail without crashing', async ({ page }) => {
  await seedTripIntoCache(page, tripWithSecretStops())
  const errors = await gotoTrip(page, 'rafa')
  await page.getByText('Ice cream at the pier').first().click()
  await expect(page.getByText('Ice cream at the pier').first()).toBeVisible()
  await expect(page.getByText('Chez Fancy')).toHaveCount(0)
  expect(errors, errors.join(' | ')).toEqual([])
})

// ── The composer create + reveal flow (the new UI) ────────────────────────────

test('create a stop surprise via the composer → the stop is marked hidden', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await page.goto('/?person=jonathan&trip=volleyball-2026&surprises=1&nosw=1')
  await expect(page.getByTestId('surprises-view')).toBeVisible()
  await page.getByRole('button', { name: /New/i }).click()

  await page.getByRole('button', { name: 'A stop' }).click()
  // The wrap picker lists the trip's named stops; pick one.
  await page.getByRole('button', { name: 'Beach Bungalow' }).first().click()
  await expect(page.getByText(/won.t see this stop in the trip/i)).toBeVisible()
  await page.getByRole('button', { name: /Keep it secret/i }).click()

  // The real stop in the trip cache is now marked hidden — attached to the stop,
  // not a new row.
  await expect.poll(async () => {
    const trips = await page.evaluate(() => JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]'))
    const stop = trips.find((x) => x.id === 'volleyball-2026')?.days?.flatMap((d) => d.stops || []).find((s) => s.id === 'vb1-3')
    return stop?.surprise?.hideFrom?.length || 0
  }).toBeGreaterThan(0)
  const stop = (await page.evaluate(() => JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]')))
    .find((x) => x.id === 'volleyball-2026').days.flatMap((d) => d.stops || []).find((s) => s.id === 'vb1-3')
  expect(stop.surprise.author).toBe('jonathan')
  expect(stop.name).toBe('Beach Bungalow') // the stop's real content is untouched
  expect(errors, errors.join(' | ')).toHaveLength(0)
})

test('the author can reveal a kept stop surprise — it un-hides', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await seedTripIntoCache(page, tripWithSecretStops())
  await page.goto('/?person=jonathan&trip=volleyball-2026&surprises=1&nosw=1')
  await expect(page.getByTestId('surprises-view')).toBeVisible()
  // The two stop surprises show in "You're keeping" with a Reveal now button.
  await page.getByRole('button', { name: /Reveal now/i }).first().click()
  // After reveal one stop is unhidden in the cache (revealed timestamp set).
  await expect.poll(async () => {
    const trips = await page.evaluate(() => JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]'))
    const stops = trips.find((x) => x.id === 'volleyball-2026')?.days?.flatMap((d) => d.stops || []) || []
    return stops.filter((s) => s.surprise && s.surprise.revealed).length
  }).toBeGreaterThan(0)
  expect(errors, errors.join(' | ')).toHaveLength(0)
})
