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

  // ONE catch-all on the worker domain so the test is fully hermetic. This matters
  // post-"close the door": the e2e seeds per-device SESSIONS (playwright.config
  // storageState), and an unmocked endpoint would hit the REAL worker, 401 the fake
  // session, and trigger workerFetch's self-heal (clear + retry) churn — which
  // flaked the lightbox/share flow. 404 (not 401) for unknown paths avoids it.
  await page.route(/roadtrip-sync\.jonathan-d-jackson\.workers\.dev/, (route) => {
    const p = new URL(route.request().url()).pathname
    if (p === '/share' && route.request().method() === 'POST') {
      if (shareStatus === 200) {
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ token: 'abc-mystic', url: 'https://roadtrip-sync.test/m/abc-mystic' }) })
      }
      return route.fulfill({ status: shareStatus, contentType: 'application/json', body: JSON.stringify({ error: 'not-shareable' }) })
    }
    if (p === '/memories' || p.startsWith('/memories/') || p === '/trips' || p.startsWith('/trips/')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"not found"}' })
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

// Reach-gap close: a TEXT (or voice) memory can be shared from its thread
// bubble too — the worker share page already renders non-photo memories. Only
// a SHARED moment gets the affordance; a private note does not.
const SHARED_TEXT = {
  id: 'm-text-shared', tripId: 'volleyball-2026', stopId: 'vb2-3', authorTraveler: 'helen',
  visibility: 'shared', kind: 'text', text: 'a shared note', createdAt: '2026-05-23T19:50:00.000Z',
}
const PRIVATE_TEXT = {
  id: 'm-text-priv', tripId: 'volleyball-2026', stopId: 'vb2-3', authorTraveler: 'jonathan',
  visibility: 'private', kind: 'text', text: 'a private note', createdAt: '2026-05-23T19:51:00.000Z',
}

test('a shared TEXT memory shares from the thread; a private one cannot', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript(({ trip, shared, priv }) => {
    for (const k of [
      'rt_trips_cache_v1', 'rt_memories_shared_v1',
      'rt_memories_private_jonathan_v1', 'rt_memories_private_helen_v1',
      'rt_memories_private_aurelia_v1', 'rt_memories_private_rafa_v1',
    ]) localStorage.removeItem(k)
    localStorage.setItem('rt_trips_cache_v1', JSON.stringify([trip]))
    localStorage.setItem('rt_memories_shared_v1', JSON.stringify([shared]))
    localStorage.setItem('rt_memories_private_jonathan_v1', JSON.stringify([priv]))
    localStorage.setItem('rt_person_v2', 'jonathan')
  }, { trip: FIXTURE_TRIP, shared: SHARED_TEXT, priv: PRIVATE_TEXT })
  // Hermetic catch-all (see seed()): a seeded fake session must never reach the
  // real worker, 401, and trip workerFetch's self-heal churn. 404 unknown paths.
  await page.route(/roadtrip-sync\.jonathan-d-jackson\.workers\.dev/, (route) => {
    const p = new URL(route.request().url()).pathname
    if (p === '/share' && route.request().method() === 'POST') {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ token: 't-text', url: 'https://roadtrip-sync.test/m/t-text' }) })
    }
    if (p === '/memories' || p.startsWith('/memories/') || p === '/trips' || p.startsWith('/trips/')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"not found"}' })
  })

  await page.goto('/?person=jonathan&trip=volleyball-2026&nosw=1')
  // Open day-2's stop → its memory thread (the dock ledge also shows the stop
  // name, but it renders last in the DOM, so .first() is the stop button).
  // SETTLE BEFORE THE TAP: the stop button's label gains a memory-derived
  // "N ENTRIES" badge only after the memory store hydrates the seeded notes.
  // Tapping in that hydration frame is the transient that flaked this once on
  // webkit-mobile (it cleared on CI retry). Wait for the settled button — the
  // "ENTRIES" badge IS the "memories are loaded" signal this test depends on
  // anyway — so the tap can't blow past the re-render.
  const stopBtn = page.getByRole('button', { name: /vs BEV 13 Empire/i }).first()
  await expect(stopBtn).toContainText(/ENTR(Y|IES)/i)
  await stopBtn.click()
  await expect(page.getByText('a shared note')).toBeVisible()
  await expect(page.getByText('a private note')).toBeVisible()
  // Only the shared note carries a Share affordance.
  await expect(page.getByTestId('thread-share')).toHaveCount(1)
  await page.getByTestId('thread-share').click()
  await expect(page.getByTestId('share-moment-sheet')).toBeVisible()
  await expect(page.getByTestId('share-link')).toHaveText('roadtrip-sync.test/m/t-text')
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
