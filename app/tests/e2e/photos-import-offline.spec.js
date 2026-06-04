import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache } from './_fixtures/withTrip.js'
import { redPhotoFile } from './_fixtures/photoFixtures.js'
import { WEBKIT_IDB_BLOB_REASON } from './_fixtures/webkitIdbBlobGate.js'
import { resolvePersona } from './_fixtures/persona.js'

const PERSONA = resolvePersona('helen')

// Importer Stage 2 — the HARD stop-condition: a photo imported through the
// BULK importer while the Worker is unreachable must still upload on
// reconnect via the sync-pill drain, exactly the way a single dispatch
// does. This is the gate that lets Stage 3 retire the single-photo
// dispatch as the sole offline path.
//
// We drive the REAL pipeline (readExif → matcher → reconcileDraft →
// reconcileApply → uploadBackfillPhotos → uploadQueue). Headless fixtures
// can't carry GPS EXIF, so the one stubbed seam is window.__RT_BACKFILL_EXIF
// (see PhotoBackfillTriage#readExifWithTestOverride). The offline outage is
// simulated by failing the /assets route (503) and then flipping it to 200,
// which gives a deterministic "the upload was attempted and failed / then
// succeeded" signal.
//
// One of the two imported photos is an INTERSTITIAL ("from Alpha to Beta")
// — its between-stops identity (migration 007) is a memory-level field that
// the drain's re-save must NOT erase. That it still files under "From Alpha
// to Beta" after the drain proves saveMemory's preserve-on-undefined carries
// the identity through the offline → queue → reconnect round-trip.

// A single driving day: two planned stops far apart. One photo sits AT
// Alpha (→ filed to the stop); one sits mid-day, off-route between the two
// (→ a lone interstitial). Window straddles the stubbed clock (2026-05-23).
const IMPORT_TRIP = {
  id: 'import-offline-2026',
  status: 'planning',
  title: 'Import Offline Roadtrip',
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

const BACKFILL_EXIF = {
  'at-alpha.png': { capturedAt: '2026-05-23T09:15:00Z', lat: 40.0, lng: -75.0 },
  'between.png': { capturedAt: '2026-05-23T13:00:00Z', lat: 40.5, lng: -74.5 },
  'at-beta.png': { capturedAt: '2026-05-23T18:15:00Z', lat: 41.0, lng: -74.0 },
}

// Three photos → a "messy" batch (one is a between-stops interstitial), so the
// importer shows the confirm summary rather than smart-skipping. That lets the
// gate exercise the confirm → Import path AND offline survival in one run.
const IMPORT_FILES = [
  redPhotoFile('at-alpha.png'),
  redPhotoFile('between.png'),
  redPhotoFile('at-beta.png'),
]

test.describe('Importer Stage 2 — offline import survives to upload', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => indexedDB.deleteDatabase('roadtrip-upload-queue'))
  })

  test('bulk import offline → queued → reconnect drains → uploaded, interstitial intact', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'webkit', WEBKIT_IDB_BLOB_REASON)
    await seedTripIntoCache(page, IMPORT_TRIP)
    await page.addInitScript((map) => {
      window.__RT_BACKFILL_EXIF = map
    }, BACKFILL_EXIF)

    // Worker mocks. /assets starts "offline" (503); /memories + /trips
    // succeed so the local-first save path resolves. Installed before the
    // catch-all 404 from seedTripIntoCache (Playwright routing is LIFO).
    let assetCalls = 0
    let assetStatus = 503
    await page.route(
      /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/assets\/(photo|video)/,
      async (route) => {
        assetCalls += 1
        if (assetStatus >= 500) {
          await route.fulfill({ status: assetStatus, body: '{"error":"offline simulated"}' })
          return
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            key: `helen/import/drain-${assetCalls}`,
            url: `https://example.test/import-drain-${assetCalls}`,
            mime: 'image/jpeg',
          }),
        })
      }
    )
    await page.route(
      /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/(memories|trips)/,
      (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    )

    await page.goto(`/?person=${PERSONA}&trip=import-offline-2026&nosw=1`)

    // Open the importer (PhotosView is the importer's home post-Stage-1).
    await page.getByTestId(`${PERSONA}-photos-entry`).click()
    await page.getByTestId('import-file-input').setInputFiles(IMPORT_FILES)

    // Stage 2: the bulk pick analyzes, then shows the lightweight confirm
    // summary (this batch has a between-stops shot → not smart-skipped).
    await expect(page.getByTestId('import-confirm')).toBeVisible({ timeout: 10000 })
    const attemptsBeforeSave = assetCalls
    // Import — every /assets attempt 503s, so each photo is parked in the queue.
    await page.getByTestId('import-confirm-go').click()

    // Back on the album (no done screen — the smart-skip feel). The sync pill
    // shows all three photos pending; the upload was genuinely attempted.
    await expect(page.getByTestId('sync-pill')).toBeVisible({ timeout: 12000 })
    await expect(page.getByTestId('sync-pill')).toContainText(/3 syncing/i)
    expect(assetCalls).toBeGreaterThan(attemptsBeforeSave)

    // Even before the drain, the interstitial renders under its between-stops
    // section (pending ref carries the 007 identity + an object URL).
    await expect(page.getByText('From Alpha to Beta')).toBeVisible({ timeout: 8000 })

    // Signal returns. Flip the mock to 200 and tap the pill to drain.
    assetStatus = 200
    const callsBeforeDrain = assetCalls
    await page.getByTestId('sync-pill').click()

    // Queue drains to empty — the parked photos uploaded on reconnect.
    await expect(page.getByTestId('sync-pill')).toHaveCount(0, { timeout: 10000 })
    // The drain genuinely retried the upload.
    expect(assetCalls).toBeGreaterThan(callsBeforeDrain)

    // And the interstitial identity SURVIVED the drain's re-save: the photo
    // still files under "From Alpha to Beta" (not dropped to an unfiled
    // group). This is the saveMemory preserve-on-undefined guarantee.
    await expect(page.getByText('From Alpha to Beta')).toBeVisible({ timeout: 8000 })
    // Alpha + "From Alpha to Beta" + Beta = three sections.
    await expect(page.getByTestId('stop-group')).toHaveCount(3, { timeout: 8000 })
  })
})
