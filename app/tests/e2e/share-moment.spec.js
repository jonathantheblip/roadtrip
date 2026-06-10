// Share-out slice 3 — the in-app "Share this moment" affordance.
// Open a photo in the lightbox → Share → the sheet mints a link (POST /share,
// stubbed) and shows it with the masking-respect reassurance. Also proves the
// worker's refusal of a hidden surprise (409) surfaces as a calm message, not a
// crash — the §6 masking contract reaching the UI.
import { test, expect } from './_fixtures/clockStub.js'
import { FIXTURE_TRIP, TINY_RED_PNG_DATA_URL } from './_fixtures/withTrip.js'

const PHOTO_MEM = {
  id: 'm-share-1',
  tripId: 'volleyball-2026',
  stopId: 'vb2-3',
  authorTraveler: 'helen',
  visibility: 'shared',
  kind: 'photo',
  caption: 'The tall ship',
  photoRef: { storage: 'external', url: TINY_RED_PNG_DATA_URL + '#s1' },
  photoExternalURLs: [],
  reactions: [],
  createdAt: '2026-05-23T19:50:00.000Z',
  updatedAt: '2026-05-23T19:55:00.000Z',
}

async function seed(page, { shareStatus = 200 } = {}) {
  await page.addInitScript(({ trip, mem }) => {
    const KEYS = [
      'rt_trips_cache_v1', 'rt_memories_shared_v1',
      'rt_memories_private_jonathan_v1', 'rt_memories_private_helen_v1',
      'rt_memories_private_aurelia_v1', 'rt_memories_private_rafa_v1',
    ]
    for (const k of KEYS) localStorage.removeItem(k)
    localStorage.setItem('rt_trips_cache_v1', JSON.stringify([trip]))
    localStorage.setItem('rt_memories_shared_v1', JSON.stringify([mem]))
    localStorage.setItem('rt_person_v2', 'helen')
  }, { trip: FIXTURE_TRIP, mem: PHOTO_MEM })

  await page.route(/workers\.dev\/(memories|trips)(\?|$)/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route(/\/share$/, (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    if (shareStatus === 200) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ token: 'abc-mystic', url: 'https://roadtrip-sync.test/m/abc-mystic' }) })
    }
    return route.fulfill({ status: shareStatus, contentType: 'application/json', body: JSON.stringify({ error: 'not-shareable' }) })
  })
}

async function openLightbox(page) {
  await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
  await page.getByTestId('helen-all-photos-entry').click()
  await expect(page.getByText('All photos', { exact: true })).toBeVisible()
  await page.getByTestId('photo-tile').first().click()
  await expect(page.getByTestId('photo-lightbox')).toBeVisible()
}

test('lightbox → Share → sheet mints and shows the link', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await seed(page)
  await openLightbox(page)

  await page.getByTestId('lightbox-share').click()
  const sheet = page.getByTestId('share-moment-sheet')
  await expect(sheet).toBeVisible()
  await expect(page.getByTestId('share-link')).toHaveText('roadtrip-sync.test/m/abc-mystic')
  await expect(sheet).toContainText('Nothing hidden is included')
  await expect(sheet.getByText('Copy link')).toBeVisible() // the primary action
  expect(errors, errors.join(' | ')).toEqual([])
})

test('a refused (hidden surprise → 409) share shows a calm message, not a crash', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await seed(page, { shareStatus: 409 })
  await openLightbox(page)

  await page.getByTestId('lightbox-share').click()
  await expect(page.getByTestId('share-error')).toContainText(/surprise/i)
  // The reassurance still shows; no link row.
  await expect(page.getByTestId('share-moment-sheet')).toContainText('Nothing hidden is included')
  await expect(page.getByTestId('share-link')).toHaveCount(0)
  expect(errors, errors.join(' | ')).toEqual([])
})
