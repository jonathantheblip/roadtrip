import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache } from './_fixtures/withTrip.js'
import { redPhotoFile } from './_fixtures/photoFixtures.js'
import { resolvePersona } from './_fixtures/persona.js'

const PERSONA = resolvePersona('helen')

// Importer Stage 2 — the new ImportFlow orchestrator: a clean batch
// SMART-SKIPS the review and saves silently with a toast (the Apple/Google
// Photos feel); a "messy" batch (between-stops shots / off-route clusters /
// duplicates / large count) shows the lightweight CONFIRM summary first.
//
// Real pipeline; the one stubbed seam is window.__RT_BACKFILL_EXIF (headless
// fixtures can't carry GPS EXIF). Worker mocked to 200 so the save resolves.

const TRIP = {
  id: 'import-flow-2026',
  status: 'planning',
  title: 'Import Flow Roadtrip',
  subtitle: 'fixture',
  dateRange: 'May 22 – 24, 2026',
  dateRangeStart: '2026-05-22',
  dateRangeEnd: '2026-05-24',
  startCity: 'Alpha',
  endCity: 'Beta',
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
  homeBase: { lat: 40.0, lng: -75.0, label: 'Home' },
  days: [
    {
      n: 1, date: 'Sat May 23', isoDate: '2026-05-23', title: 'The haul',
      drive: { from: 'Alpha', to: 'Beta', hours: '6h', miles: 300 }, lodging: '',
      stops: [
        { id: 'alpha', time: '9:00 AM', name: 'Alpha', kind: 'fuel', for: ['jonathan', 'helen', 'aurelia', 'rafa'], note: '', address: 'Alpha', lat: 40.0, lng: -75.0 },
        { id: 'beta', time: '6:00 PM', name: 'Beta', kind: 'fuel', for: ['jonathan', 'helen', 'aurelia', 'rafa'], note: '', address: 'Beta', lat: 41.0, lng: -74.0 },
      ],
    },
  ],
}

let uploadSeq = 0
async function mockWorker200(page) {
  uploadSeq = 0
  await page.route(
    /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/assets\/(photo|video)/,
    (route) => {
      // Each upload gets a UNIQUE r2 key, exactly as the real worker does
      // (traveler/memoryId/kind-rand). Distinct photos must never share a key,
      // or the library grid's same-key dedup would fold them into one tile.
      const n = ++uploadSeq
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ key: `helen/flow/photo-${n}`, url: `https://example.test/flow-photo-${n}`, mime: 'image/jpeg' }),
      })
    }
  )
  await page.route(
    /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/(memories|trips)/,
    (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  )
}

async function openImporter(page, exifMap) {
  await seedTripIntoCache(page, TRIP)
  await mockWorker200(page)
  await page.addInitScript((map) => {
    window.__RT_BACKFILL_EXIF = map
  }, exifMap)
  await page.goto(`/?person=${PERSONA}&trip=import-flow-2026&nosw=1`)
  await page.getByTestId(`${PERSONA}-photos-entry`).click()
}

test.describe('Importer Stage 2 — ImportFlow (smart-skip + confirm)', () => {
  test('clean batch smart-skips review → saves silently with a toast', async ({ page }) => {
    // One photo, cleanly at a stop → no confirm screen, just a toast.
    await openImporter(page, {
      'solo.png': { capturedAt: '2026-05-23T09:15:00Z', lat: 40.0, lng: -75.0 },
    })
    await page.getByTestId('import-file-input').setInputFiles([redPhotoFile('solo.png')])

    // The quiet confirmation toast appears — and we're back on the album
    // (the Import button is visible) WITHOUT ever tapping a confirm button.
    await expect(page.getByTestId('import-toast')).toContainText(/1 photo added/i, { timeout: 12000 })
    await expect(page.getByTestId('import-photos')).toBeVisible()
    // The photo landed in the album.
    await expect(page.getByTestId('photo-tile')).toHaveCount(1, { timeout: 8000 })
  })

  test('messy batch shows the confirm summary with the right counts', async ({ page }) => {
    // Three photos: two filed to stops, one between them (interstitial) →
    // "messy" → confirm summary, not smart-skipped.
    await openImporter(page, {
      'a.png': { capturedAt: '2026-05-23T09:15:00Z', lat: 40.0, lng: -75.0 },
      'mid.png': { capturedAt: '2026-05-23T13:00:00Z', lat: 40.5, lng: -74.5 },
      'b.png': { capturedAt: '2026-05-23T18:15:00Z', lat: 41.0, lng: -74.0 },
    })
    await page.getByTestId('import-file-input').setInputFiles([
      redPhotoFile('a.png'),
      redPhotoFile('mid.png'),
      redPhotoFile('b.png'),
    ])

    const confirm = page.getByTestId('import-confirm')
    await expect(confirm).toBeVisible({ timeout: 10000 })
    // Summary reads the real matcher result: photos to stops + one on the road.
    await expect(confirm).toContainText(/filed to stops/i)
    await expect(confirm).toContainText(/on the road/i)
    // Primary action carries the total import count (2 stops + 1 interstitial).
    await expect(page.getByTestId('import-confirm-go')).toContainText(/Import 3/i)

    // Import → saved → back on the album with all three filed.
    await page.getByTestId('import-confirm-go').click()
    await expect(page.getByTestId('import-toast')).toContainText(/3 photos added/i, { timeout: 12000 })
    // Alpha + "From Alpha to Beta" + Beta = three sections.
    await expect(page.getByTestId('stop-group')).toHaveCount(3, { timeout: 8000 })
  })

  test('imported photo is downscaled to JPEG before upload (worker receives image/jpeg)', async ({ page }) => {
    // The importer runs the same preparePhotoForUpload downscale the retired
    // dispatch composer did — a picked PNG reaches the Worker as a JPEG, not
    // the original PNG. (Relocated from the retired photos-dispatch happy-path
    // test, whose JPEG-downscale-mime proof must survive on the one importer.)
    // Playwright route interception doesn't reliably surface Blob request
    // bodies, so the Content-Type header is the proof the downscale ran.
    const uploadedMimes = []
    await seedTripIntoCache(page, TRIP)
    await page.route(
      /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/assets\/photo/,
      async (route) => {
        uploadedMimes.push((await route.request().headerValue('content-type')) || '')
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ key: 'helen/flow/jpeg', url: 'https://example.test/flow-jpeg', mime: 'image/jpeg' }),
        })
      }
    )
    await page.route(
      /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/(memories|trips)/,
      (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    )
    await page.addInitScript((map) => { window.__RT_BACKFILL_EXIF = map }, {
      'downscale.png': { capturedAt: '2026-05-23T09:15:00Z', lat: 40.0, lng: -75.0 },
    })
    await page.goto(`/?person=${PERSONA}&trip=import-flow-2026&nosw=1`)
    await page.getByTestId(`${PERSONA}-photos-entry`).click()
    await page.getByTestId('import-file-input').setInputFiles([redPhotoFile('downscale.png')])

    // Clean batch → smart-skip → toast; the upload fired during the save.
    await expect(page.getByTestId('import-toast')).toContainText(/1 photo added/i, { timeout: 12000 })
    await expect.poll(() => uploadedMimes.length, { timeout: 8000 }).toBeGreaterThan(0)
    // The downscale ran end-to-end: the Worker got a JPEG, not the source PNG.
    expect(uploadedMimes[0]).toMatch(/jpeg/i)
  })
})
