import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache } from './_fixtures/withTrip.js'
import { redPhotoFile } from './_fixtures/photoFixtures.js'

// Bulk photo import is launchable from the trip's TOP PAGE (the ⋯ menu),
// without first navigating into the Photos tab. The ⋯ "Add photos" clicks a
// shell-level file input; once files are picked the same ImportFlow that the
// Photos tab uses takes over and saves. (Jonathan: the importer was "buried"
// — only reachable from the Photos tab.)

const STAY = {
  id: 'home-import-2026',
  status: 'planning',
  title: 'Cabin Stay',
  subtitle: 'fixture',
  dateRange: 'May 22 – 24, 2026',
  dateRangeStart: '2026-05-22',
  dateRangeEnd: '2026-05-24',
  startCity: 'Belmont, MA',
  endCity: 'Peru, VT',
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
  // A geocoded cabin stay (lodging coords, no stops) — the proven stay shape:
  // one located anchor → inferTripShape 'stay', so the 4-tab shell shows.
  lodging: { name: 'Our Cabin', address: 'Peru, VT', lat: 43.2398, lng: -72.9051 },
  days: [
    { n: 1, date: 'Fri May 22', isoDate: '2026-05-22', title: 'At the cabin', drive: { from: '', to: '', hours: '', miles: 0 }, lodging: '', stops: [] },
    { n: 2, date: 'Sat May 23', isoDate: '2026-05-23', title: 'Around the lake', drive: { from: '', to: '', hours: '', miles: 0 }, lodging: '', stops: [] },
  ],
}

// Only the upload + memories endpoints are mocked here; seedTripIntoCache owns
// /trips (mocking it would clobber the seeded trip and drop the stay shell).
async function mockWorker200(page) {
  let seq = 0
  await page.route(/workers\.dev\/assets\/(photo|video)/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ key: `jonathan/home/photo-${++seq}`, url: `https://example.test/home-${seq}`, mime: 'image/jpeg' }),
    }),
  )
  await page.route(/workers\.dev\/(memories|places\/nearby)/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  )
}

test.describe('Bulk import from the trip top page', () => {
  test('the ⋯ menu offers "Add photos" on the trip top page', async ({ page }) => {
    await seedTripIntoCache(page, STAY)
    await mockWorker200(page)
    await page.goto('/?person=jonathan&trip=home-import-2026&nosw=1')
    await expect(page.getByTestId('stay-tabbar')).toBeVisible({ timeout: 10000 })
    // No need to leave the top page — the importer is reachable right here.
    await page.getByRole('button', { name: 'More' }).click()
    await expect(page.getByRole('menuitem', { name: /Add photos/i })).toBeVisible()
  })

  test('Add photos → the shell ImportFlow runs and saves (no Photos-tab detour)', async ({ page }) => {
    await seedTripIntoCache(page, STAY)
    await mockWorker200(page)
    await page.addInitScript((map) => { window.__RT_BACKFILL_EXIF = map }, {
      'cabin.png': { capturedAt: '2026-05-22T10:15:00Z', lat: 43.2398, lng: -72.9051 },
    })
    await page.goto('/?person=jonathan&trip=home-import-2026&nosw=1')
    await expect(page.getByTestId('stay-tabbar')).toBeVisible({ timeout: 10000 })

    // The picker input lives in the shell (the ⋯ item clicks it). Drive it
    // directly — a clean single photo at a stop smart-skips to a toast.
    await page.getByTestId('home-import-file-input').setInputFiles([redPhotoFile('cabin.png')])
    await expect(page.getByTestId('import-toast')).toContainText(/1 photo added/i, { timeout: 12000 })
  })
})
