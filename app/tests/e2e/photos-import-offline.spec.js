import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'
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
    // Per-person pill copy (foolproof-video L5): "3 uploading"/"3 queued"/"saving…"
    // by lens (was the generic "3 syncing"); tolerant across the RT_PERSONA sweep,
    // matching its sibling offline specs.
    await expect(page.getByTestId('sync-pill')).toContainText(/(?:3\s+(?:uploading|queued))|saving/i)
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

// The relaunch HARD GATE (whole-app-audit deferred #1). The earlier attempt at
// this fix shipped untested and was reverted because it persisted the blob but
// never read it back. This proves the real picture renders after an OFFLINE
// relaunch: import offline → reload while STILL offline → the tile shows the
// decoded image, not the skeleton/icon fallback. A single clean photo at the
// Saturday match stop smart-skips review (like photos-offline.spec), so the
// gate stays focused on the persist → reload → hydrate → render path.
const RELAUNCH_EXIF = {
  'relaunch.png': { capturedAt: '2026-05-23T19:45:00Z', lat: 41.4923, lng: -72.0934 },
}

test.describe('Importer offline — tile survives an OFFLINE relaunch', () => {
  test.beforeEach(async ({ page }) => {
    // One-shot reset: clear the queue on the FIRST load only. addInitScript
    // re-runs on the in-test reload, and a naive delete there would wipe the
    // just-queued item — masking whether the queue (and the idb-backed tile)
    // genuinely survive a relaunch. The localStorage guard persists across the
    // reload, so the queue is cleared once and then left to survive.
    await page.addInitScript(() => {
      if (!localStorage.getItem('__rt_queue_wiped_once')) {
        indexedDB.deleteDatabase('roadtrip-upload-queue')
        localStorage.setItem('__rt_queue_wiped_once', '1')
      }
    })
  })

  test('photo imported offline shows its real picture after reloading while STILL offline', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'webkit', WEBKIT_IDB_BLOB_REASON)
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.addInitScript((map) => {
      window.__RT_BACKFILL_EXIF = map
    }, RELAUNCH_EXIF)

    // /assets stays OFFLINE (503) for the ENTIRE test — we never reconnect, so
    // the queue never drains and the only way the tile can show the picture is
    // the idb read-back. /memories + /trips succeed so the local-first save
    // resolves.
    await page.route(
      /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/assets\/(photo|video)/,
      (route) => route.fulfill({ status: 503, body: '{"error":"offline simulated"}' })
    )
    await page.route(
      /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/(memories|trips)/,
      (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    )

    await page.goto(`/?person=${PERSONA}&trip=volleyball-2026&nosw=1`)
    await page.getByTestId(`${PERSONA}-photos-entry`).click()
    await page.getByTestId('import-file-input').setInputFiles([redPhotoFile('relaunch.png')])

    // Parked in the queue (offline). In-session the tile already renders.
    await expect(page.getByTestId('sync-pill')).toBeVisible({ timeout: 12000 })
    await expect
      .poll(
        async () => {
          const img = page.locator('[data-testid="photo-tile"] img').first()
          if ((await img.count()) === 0) return 0
          return img.evaluate((el) => el.naturalWidth).catch(() => 0)
        },
        { timeout: 12000 }
      )
      .toBeGreaterThan(0)

    // localStorage persists across a REAL relaunch — but seedTripIntoCache's
    // init-script HARD-CLEARS the memory keys on every navigation (test
    // isolation), which the reload below would wrongly re-trigger, wiping the
    // very memory under test. Capture the persisted memory now and re-inject it
    // AFTER that clear (this init-script is registered later, so it runs later),
    // reconstructing the genuine post-relaunch state: the pending memory in
    // localStorage + its blob still in idb (idb is never cleared). The product
    // path is unchanged — only the harness's artificial wipe is neutralized.
    const memSnapshot = await page.evaluate(() =>
      localStorage.getItem('rt_memories_shared_v1')
    )
    await page.addInitScript((snap) => {
      if (snap) localStorage.setItem('rt_memories_shared_v1', snap)
    }, memSnapshot)

    // RELAUNCH while STILL offline. The session object URL minted at import time
    // is dead now; only the idb read-back can repaint the real picture.
    await page.reload()
    await page.getByTestId(`${PERSONA}-photos-entry`).click()

    // The pill is still up (nothing drained — we're still offline), proving the
    // queue survived the relaunch too.
    await expect(page.getByTestId('sync-pill')).toBeVisible({ timeout: 12000 })

    // THE GATE: the tile shows the REAL, decoded image — not the skeleton or the
    // broken-image icon fallback.
    await expect
      .poll(
        async () => {
          const img = page.locator('[data-testid="photo-tile"] img').first()
          if ((await img.count()) === 0) return 0
          return img.evaluate((el) => el.naturalWidth).catch(() => 0)
        },
        { timeout: 15000 }
      )
      .toBeGreaterThan(0)
    await expect(page.getByTestId('tile-image-fallback')).toHaveCount(0)
  })

  // VIDEO poster path (review finding #4). Headless can't run the WebCodecs
  // encode, so we seed the genuine post-relaunch state directly: a pending
  // VIDEO memory whose ref carries an idb posterKey + a DEAD session posterUrl,
  // and the real poster jpeg sitting in the idb asset store under that key.
  // This is the case that broke without the fix: a video's entry.key tracks
  // ref.url (the .mp4), so when hydration flips the poster dead→live the tile is
  // NOT remounted — a sticky imgFailed kept it on the broken-image icon forever.
  const PNG_1PX_RED =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  const POSTER_KEY = 'photo_synthetic_poster_relaunch'
  const VIDEO_MEMORY = {
    id: 'mem_synthetic_video_relaunch',
    tripId: 'volleyball-2026',
    stopId: 'vb2-3',
    authorTraveler: 'helen',
    visibility: 'shared',
    kind: 'photo',
    caption: '',
    photoRef: {
      kind: 'video',
      mime: 'video/mp4',
      storage: 'pending',
      posterKey: POSTER_KEY,
      posterUrl: 'blob:http://localhost/dead-poster-relaunch',
      url: 'blob:http://localhost/dead-video-relaunch',
      capturedAt: '2026-05-23T19:45:00Z',
    },
    photoExternalURLs: [],
    reactions: [],
    capturedAt: '2026-05-23T19:45:00Z',
    createdAt: '2026-05-23T19:45:00.000Z',
    updatedAt: '2026-05-23T19:45:00.000Z',
  }

  test('offline video poster repaints from idb after relaunch (not stuck on the broken icon)', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'webkit', WEBKIT_IDB_BLOB_REASON)
    await seedTripIntoCache(page, FIXTURE_TRIP)
    // Re-seed the synthetic video memory on EVERY navigation (after
    // seedTripIntoCache's per-nav memory wipe), reconstructing the post-relaunch
    // state where localStorage holds the pending video and idb holds the poster.
    await page.addInitScript((mem) => {
      localStorage.setItem('rt_memories_shared_v1', JSON.stringify([mem]))
    }, VIDEO_MEMORY)
    await page.route(
      /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/assets\/(photo|video)/,
      (route) => route.fulfill({ status: 503, body: '{"error":"offline simulated"}' })
    )
    await page.route(
      /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/(memories|trips)/,
      (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    )

    await page.goto(`/?person=${PERSONA}&trip=volleyball-2026&nosw=1`)
    // Write the real poster jpeg into the idb asset store under POSTER_KEY — it
    // persists across the reload below (only the upload queue is ever cleared).
    await page.evaluate(
      async ({ b64, key }) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
        const blob = new Blob([bytes], { type: 'image/png' })
        await new Promise((resolve, reject) => {
          const req = indexedDB.open('roadtrip-mem-assets', 1)
          req.onupgradeneeded = () => {
            const db = req.result
            if (!db.objectStoreNames.contains('photo')) db.createObjectStore('photo', { keyPath: 'key' })
            if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio', { keyPath: 'key' })
          }
          req.onsuccess = () => {
            const db = req.result
            const t = db.transaction('photo', 'readwrite')
            t.objectStore('photo').put({ key, blob, mime: 'image/png', savedAt: Date.now() })
            t.oncomplete = () => resolve()
            t.onerror = () => reject(t.error)
          }
          req.onerror = () => reject(req.error)
        })
      },
      { b64: PNG_1PX_RED, key: POSTER_KEY }
    )

    // Relaunch: the seeded posterUrl is dead, only the idb read-back can repaint.
    await page.reload()
    await page.getByTestId(`${PERSONA}-photos-entry`).click()

    // The tile is recognized as a video (play badge always overlays) AND its
    // poster repaints from idb (the fix) instead of sticking on the icon.
    await expect(page.getByTestId('tile-video-badge')).toBeVisible({ timeout: 12000 })
    await expect
      .poll(
        async () => {
          const img = page.locator('[data-testid="photo-tile"] img').first()
          if ((await img.count()) === 0) return 0
          return img.evaluate((el) => el.naturalWidth).catch(() => 0)
        },
        { timeout: 15000 }
      )
      .toBeGreaterThan(0)
    await expect(page.getByTestId('tile-image-fallback')).toHaveCount(0)
  })
})
