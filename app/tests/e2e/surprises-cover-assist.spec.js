// Surprises Slice 3 — the "Suggest a cover with Claude" assist in the composer.
// The worker /cover route is mocked here; this proves the composer wiring: the
// button fills the cover fields on success, and shows an honest "fill it in by
// hand" fallback on failure (the cover form still works by hand either way).
import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'
import { openTopMenuItem } from './_fixtures/topNav.js'

const COVER = { icon: '🍦', title: 'Ice cream at the pier', loc: 'the pier', time: 'Sat 3:00 PM', weather: 'Mild', packing: 'A sweater' }

async function openCoverForm(page) {
  await openTopMenuItem(page, /surprises/i)
  await expect(page.getByTestId('surprises-view')).toBeVisible()
  await page.getByRole('button', { name: /New/i }).click()
  await page.getByRole('button', { name: 'A stop' }).click()
  await page.getByRole('button', { name: 'Beach Bungalow' }).first().click()
  await page.getByRole('button', { name: /A cover story/i }).click()
}

test('Suggest a cover with Claude fills the cover fields', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await seedTripIntoCache(page, FIXTURE_TRIP)
  // Mock the worker /cover route (registered after the seed catch-all → wins).
  await page.route(/workers\.dev\/cover/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(COVER) })
  })
  await page.goto('/?person=jonathan&trip=volleyball-2026&nosw=1')
  await openCoverForm(page)

  await page.getByRole('button', { name: 'Suggest a cover with Claude' }).click()
  await expect(page.getByPlaceholder(/What it looks like/i)).toHaveValue('Ice cream at the pier')
  await expect(page.getByPlaceholder(/What to bring/i)).toHaveValue('A sweater')
  await expect(page.getByPlaceholder(/^Where$/i)).toHaveValue('the pier')
  expect(errors, errors.join(' | ')).toHaveLength(0)
})

test('cover-assist failure shows the fill-it-in-by-hand fallback (form still usable)', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await page.route(/workers\.dev\/cover/, async (route) => {
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"not configured"}' })
  })
  await page.goto('/?person=jonathan&trip=volleyball-2026&nosw=1')
  await openCoverForm(page)

  await page.getByRole('button', { name: 'Suggest a cover with Claude' }).click()
  await expect(page.getByText(/fill it in by hand/i)).toBeVisible()
  // The author can still type the cover by hand.
  await page.getByPlaceholder(/What it looks like/i).fill('A walk in the park')
  await expect(page.getByPlaceholder(/What it looks like/i)).toHaveValue('A walk in the park')
})
