import { test } from './_fixtures/clockStub.js'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'
import { redPhotoFile } from './_fixtures/photoFixtures.js'
import { WEBKIT_IDB_BLOB_REASON } from './_fixtures/webkitIdbBlobGate.js'
import { resolvePersona } from './_fixtures/persona.js'

// Honors RT_PERSONA (Phase 2 build-list item 1); defaults to 'helen' when
// unset so existing runs stay byte-identical to before.
const PERSONA = resolvePersona('helen')

// Capture the album's sync pill (pending upload) — driven through the one
// importer now that Stage 3 retired the dispatch composer. A single photo
// imports cleanly (smart-skip), its upload fails (500) so it parks in the
// queue, and the pill renders in the album header. (The composer pick /
// preview / Bucket-C captures went with the composer.)

const SHOT_DIR = 'tests/e2e/screenshots'

test.describe('Importer photo path — visual capture', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => indexedDB.deleteDatabase('roadtrip-upload-queue'))
  })

  test('album with sync pill — pending upload', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', WEBKIT_IDB_BLOB_REASON)
    await seedTripIntoCache(page, FIXTURE_TRIP)
    // Force the upload to fail so the pending (queued) state shows.
    await page.route(
      /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/assets\/photo/,
      (route) => route.fulfill({ status: 500, body: '{"error":"down"}' })
    )
    await page.route(
      /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/(memories|trips)/,
      (route) => route.fulfill({ status: 200, body: '{}' })
    )
    // One photo, cleanly at the Saturday match stop (vb2-3) → smart-skip, no
    // confirm screen, straight to the album where the queued pill shows.
    await page.addInitScript((map) => { window.__RT_BACKFILL_EXIF = map }, {
      'queued.png': { capturedAt: '2026-05-23T19:45:00Z', lat: 41.4923, lng: -72.0934 },
    })
    await page.goto(`/?person=${PERSONA}&trip=volleyball-2026&nosw=1`)
    await page.getByTestId(`${PERSONA}-photos-entry`).click()
    await page.getByTestId('import-file-input').setInputFiles([redPhotoFile('queued.png')])
    await page.waitForSelector('[data-testid="sync-pill"]')
    await page.screenshot({ path: `${SHOT_DIR}/m2-sync-pill.png`, fullPage: true })
  })
})
