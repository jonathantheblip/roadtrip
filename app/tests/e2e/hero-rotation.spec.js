// Per-visit rotating trip hero (the Vermont Juneteenth trip). The real trip
// lives in prod, so we seed a Juneteenth-titled trip and assert its trip-index
// card renders a hero from the rotation SET — its current hero (here a stand-in
// heroImage) plus the two committed deck photos. The pick is random per visit;
// the pure pick logic (that it reaches every candidate) is unit-tested in
// scripts/__tests__/heroRotation.test.mjs — this proves the card is wired to the
// right candidate set. A non-rotating trip would always show its single hero.
import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'

const VERMONT = {
  id: 'vt-juneteenth',
  title: 'Vermont Juneteenth Weekend',
  subtitle: 'Juneteenth and Father’s Day',
  dateRange: 'Jun 19 – 21, 2026',
  dateRangeStart: '2026-06-19',
  dateRangeEnd: '2026-06-21',
  status: 'planning',
  locationLabel: 'Belmont, MA → Peru, VT',
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
  heroImage: './images/volleyball.png', // stand-in for "the one that's there now"
  days: [{ n: 1, isoDate: '2026-06-19', stops: [] }],
}

test('Vermont Juneteenth card rotates its hero among the current hero + the two deck photos', async ({ page }) => {
  // seedTripIntoCache sets up worker suppression + person + cache=[FIXTURE_TRIP];
  // then add the Vermont trip so both appear on the index.
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await page.addInitScript((vt) => {
    const cur = JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]')
    localStorage.setItem('rt_trips_cache_v1', JSON.stringify([...cur, vt]))
  }, VERMONT)

  await page.goto('/?person=jonathan&trip=volleyball-2026&nosw=1')
  await page.getByRole('button', { name: /trips/i }).first().click()

  const hero = page.getByRole('img', { name: 'Vermont Juneteenth Weekend' })
  await expect(hero).toBeVisible()
  const src = (await hero.getAttribute('src')) || ''
  const candidates = ['volleyball.png', 'vermont-deck-1.jpg', 'vermont-deck-2.jpg']
  expect(
    candidates.some((f) => src.includes(f)),
    `rotated hero src "${src}" should be one of: ${candidates.join(', ')}`
  ).toBe(true)
})
