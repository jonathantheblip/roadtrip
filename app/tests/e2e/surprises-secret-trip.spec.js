// Slice 3b — a "totally secret trip". A whole-trip surprise marks a real trip
// hidden (masking rides in the trip object). The recipient's trip list shows a
// believable stand-in (the cover), never the real trip; the author sees it real.
// This is also the render check: the masked stand-in (days:[]) must not crash the
// index / cold-load.
import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'

const SECRET_TRIP = {
  id: 'secret-aug',
  title: 'Disney World surprise!',
  dateRange: 'Aug 1 – 5, 2026',
  dateRangeStart: '2026-08-01',
  dateRangeEnd: '2026-08-05',
  status: 'planning',
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
  heroResolved: { key: 'x' },
  days: [{ n: 1, isoDate: '2026-08-01', title: 'Magic Kingdom', stops: [] }],
  surprise: {
    author: 'jonathan',
    hideFrom: ['rafa'],
    reveal: { type: 'manual' },
    conceal: 'cover',
    cover: { title: 'Visiting Grandma', loc: "Grandma's house" },
  },
}

async function seedBoth(page) {
  await seedTripIntoCache(page, FIXTURE_TRIP) // volleyball (active) + worker route mock + person
  // Append the secret trip to the same cache (runs after the seed's init script).
  await page.addInitScript((secret) => {
    const arr = JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]')
    if (!arr.some((t) => t.id === secret.id)) arr.push(secret)
    localStorage.setItem('rt_trips_cache_v1', JSON.stringify(arr))
  }, SECRET_TRIP)
}

async function gotoTripsIndex(page, persona) {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`/?person=${persona}&trip=volleyball-2026&nosw=1`)
  await page.getByRole('button', { name: /trips/i }).first().click()
  return errors
}

test('the AUTHOR sees the real secret trip in their list', async ({ page }) => {
  await seedBoth(page)
  const errors = await gotoTripsIndex(page, 'jonathan')
  await expect(page.getByText('Disney World surprise!').first()).toBeVisible()
  expect(errors, errors.join(' | ')).toEqual([])
})

test('the RECIPIENT sees the cover stand-in, never the real trip', async ({ page }) => {
  await seedBoth(page)
  const errors = await gotoTripsIndex(page, 'rafa')
  // The cover trip is what Rafa sees.
  await expect(page.getByText('Visiting Grandma').first()).toBeVisible()
  // The real trip never leaks anywhere on the page.
  await expect(page.getByText('Disney World surprise!')).toHaveCount(0)
  await expect(page.getByText('Magic Kingdom')).toHaveCount(0)
  expect(errors, errors.join(' | ')).toEqual([])
})
