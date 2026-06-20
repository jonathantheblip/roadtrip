// Family-trips Phase 2 — end to end through the reconcile editor:
//   * a no-GPS photo on a STAY defaults to the PLACE you're staying, not the
//     nearest clock event;
//   * the implicit base ("At [the cabin]") is a first-class card in the
//     reconcile editor, carrying those photos.
//
// Headless fixtures can't carry EXIF, so the one stubbed seam is
// window.__RT_BACKFILL_EXIF (PhotoBackfillTriage#readExifWithTestOverride),
// here feeding capturedAt with NO lat/lng = no GPS. Everything else is the
// production path (matcher → reconcileDraft → reconcileApply → the editor).
import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache } from './_fixtures/withTrip.js'
import { redPhotoFile } from './_fixtures/photoFixtures.js'
import { resolvePersona } from './_fixtures/persona.js'

const PERSONA = resolvePersona('helen')

// A destination-less cabin STAY: geocoded lodging (so the trip has a located
// implicit base), one dinner-out planned on day 1, nothing else.
const STAY_TRIP = {
  id: 'stay-place-2026',
  status: 'planning',
  title: 'Cabin Stay',
  subtitle: 'fixture',
  dateRange: 'May 22 – 24, 2026',
  dateRangeStart: '2026-05-22',
  dateRangeEnd: '2026-05-24',
  startCity: 'Belmont, MA',
  endCity: 'Peru, VT',
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
  lodging: { name: 'Jessica & Yoav’s cabin', address: 'Peru, VT', lat: 43.2398, lng: -72.9051 },
  days: [
    {
      n: 1, date: 'Fri May 22', isoDate: '2026-05-22', title: 'At the cabin',
      drive: { from: '', to: '', hours: '', miles: 0 }, lodging: '',
      stops: [
        { id: 'dinner', time: '7:00 PM', name: 'Dinner out', kind: 'food', for: ['jonathan', 'helen', 'aurelia', 'rafa'], note: '', address: '' },
      ],
    },
    {
      n: 2, date: 'Sat May 23', isoDate: '2026-05-23', title: 'Around the lake',
      drive: { from: '', to: '', hours: '', miles: 0 }, lodging: '', stops: [],
    },
  ],
}

// Two photos on day 1 with capturedAt but NO lat/lng → no GPS. 3pm/4:30pm — one
// is even inside the evening, but with no GPS on a stay they default to the
// place, never the 7:00 dinner.
const BACKFILL_EXIF = {
  'cabin-1.png': { capturedAt: '2026-05-22T15:00:00Z' },
  'cabin-2.png': { capturedAt: '2026-05-22T16:30:00Z' },
}
const FILES = [redPhotoFile('cabin-1.png'), redPhotoFile('cabin-2.png')]

async function mockUploads(page) {
  await page.route(/workers\.dev\/assets\/photo/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ key: 'k', url: 'https://example.test/p', mime: 'image/jpeg' }) }))
  await page.route(/workers\.dev\/memories/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
}

test('no-GPS photos on a stay file to the place; the implicit base is a first-class card in the reconcile editor', async ({ page }) => {
  await seedTripIntoCache(page, STAY_TRIP)
  await mockUploads(page)
  await page.addInitScript((map) => {
    window.__RT_BACKFILL_EXIF = map
    window.__RT_IMPORT_FORCE_CONFIRM = true // force confirm → "Review in detail"
  }, BACKFILL_EXIF)
  await page.goto(`/?person=${PERSONA}&trip=stay-place-2026&nosw=1`)

  await page.getByTestId(`${PERSONA}-photos-entry`).click()
  await page.getByTestId('import-file-input').setInputFiles(FILES)
  await page.getByTestId('import-confirm-review').click()
  await expect(page.getByRole('button', { name: /Save · upload|Save changes/i })).toBeVisible({ timeout: 10000 })

  // The place is surfaced as its own card (the implicit base, first-class).
  const cabinCard = page.locator('section').filter({ hasText: 'Jessica & Yoav’s cabin' })
  await expect(cabinCard).toBeVisible()
  // …and it carries the photos — NOT the empty-state text.
  await expect(cabinCard.getByText('No photos matched this stop')).toHaveCount(0)

  // The 7:00 dinner got NO photos — the place won over the clock.
  const dinnerCard = page.locator('section').filter({ hasText: 'Dinner out' })
  await expect(dinnerCard.getByText('No photos matched this stop')).toBeVisible()
})
