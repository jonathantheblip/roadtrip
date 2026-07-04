import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache } from './_fixtures/withTrip.js'
import { resolvePersona } from './_fixtures/persona.js'
import { WEBKIT_IDB_BLOB_REASON } from './_fixtures/webkitIdbBlobGate.js'

const PERSONA = resolvePersona('helen')

// The importer's VIDEO path, end to end, HEADLESSLY — the coverage that was
// missing when a bulk-imported video silently never uploaded (ImportFlow dropped
// the encoded blob from the payload → uploadOrQueueVideo got no blob → a
// render-only pending ref that was never queued or POSTed). The iOS-Simulator
// gate exercises the REAL WebCodecs encode but stops at the confirm; nothing
// headless proved the encoded blob reaches the outbox / R2. This does, via the
// prod-inert __RT_VIDEO_ENCODE_STUB seam (videoPipeline.encodeVideo +
// videoMeta.extractVideoCreationDate) so the whole pick → shrink → file → queue →
// drain path runs without a WebCodecs-capable browser.

// A single driving day straddling the stubbed clock (2026-05-23), matching the
// offline photo spec so the seeded video's capturedAt lands in-window.
const VIDEO_TRIP = {
  id: 'import-video-2026',
  status: 'planning',
  title: 'Import Video Roadtrip',
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

const STUB_CAPTURED_AT = '2026-05-23T12:00:00Z'
// A fake picked "video" file — its bytes are opaque (the encode is stubbed); only
// the video/* mime matters (ImportFlow partitions by type).
const fakeVideoFile = () => ({ name: 'clip.mp4', mimeType: 'video/mp4', buffer: Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]) })

test.describe('Importer — video reaches the outbox and uploads (the "lost video" fix)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => indexedDB.deleteDatabase('roadtrip-upload-queue'))
  })

  test('bulk video: the encoded blob is queued offline, then uploads on reconnect', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', WEBKIT_IDB_BLOB_REASON)
    await seedTripIntoCache(page, VIDEO_TRIP)
    // Stub the encode: a 7.5 MB shrunk mp4, 0:12 long, dated in-window.
    await page.addInitScript((capturedAt) => {
      window.__RT_VIDEO_ENCODE_STUB = { blobBytes: 7_500_000, durationMs: 12_000, capturedAt }
    }, STUB_CAPTURED_AT)

    // /assets starts offline (503) so the upload is attempted then parked; flips
    // to 200 for the drain. /memories + /trips succeed so the local-first save resolves.
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
          body: JSON.stringify({ key: `helen/vid/drain-${assetCalls}`, url: `https://example.test/v-${assetCalls}`, mime: 'video/mp4' }),
        })
      }
    )
    await page.route(
      /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/(memories|trips)/,
      (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    )

    await page.goto(`/?person=${PERSONA}&trip=import-video-2026&nosw=1`)
    await page.getByTestId(`${PERSONA}-photos-entry`).click()
    await page.getByTestId('import-file-input').setInputFiles([fakeVideoFile()])

    // A single clean video smart-skips the confirm → saves silently. THE FIX: the
    // encoded blob is carried into the payload, so /assets/video is POSTed (503 →
    // parked) and the pill shows. Before the fix there was NO blob → NO attempt, NO
    // queue, NO pill — the clip vanished with a poster shown locally.
    await expect(page.getByTestId('sync-pill')).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('sync-pill')).toContainText(/1 uploading/i)
    expect(assetCalls, 'the encoded video blob must actually be POSTed (the fix)').toBeGreaterThan(0)

    // The saved tile reads honestly as "on its way" — never a bare done tile.
    await expect(page.getByTestId('tile-video-uploading')).toBeVisible({ timeout: 8000 })

    // Reconnect → drain → the clip uploads for real; the pill clears and the tile
    // shows its shrunk-size proof chip (7.5 MB rides ref.bytes through the drain).
    assetStatus = 200
    const before = assetCalls
    await page.getByTestId('sync-pill').click()
    await expect(page.getByTestId('sync-pill')).toHaveCount(0, { timeout: 12000 })
    expect(assetCalls, 'the drain genuinely re-attempted the upload').toBeGreaterThan(before)
    await expect(page.getByTestId('tile-video-size')).toContainText(/7\.5 MB/i, { timeout: 8000 })
    await expect(page.getByTestId('tile-video-uploading')).toHaveCount(0)
  })
})

test.describe('Importer — the honest video notices on the confirm (L3)', () => {
  test('a too-long clip shows the "trim it" boundary — shown, named, never silently dropped', async ({ page }) => {
    await seedTripIntoCache(page, VIDEO_TRIP)
    // 6:12 — over the 3:00 cap. The stub throws 'video-too-long' exactly like the
    // real encoder, so ImportFlow collects it and forces the confirm.
    await page.addInitScript(() => {
      window.__RT_VIDEO_ENCODE_STUB = { durationMs: 372_000 }
    })

    await page.goto(`/?person=${PERSONA}&trip=import-video-2026&nosw=1`)
    await page.getByTestId(`${PERSONA}-photos-entry`).click()
    await page.getByTestId('import-file-input').setInputFiles([fakeVideoFile()])

    const confirm = page.getByTestId('import-confirm')
    await expect(confirm).toBeVisible({ timeout: 15000 })
    await expect(confirm).toContainText('6:12')
    await expect(confirm).toContainText(/3 minutes/i)
    // The trim hand-off (no built-in trimmer — design "not now").
    await expect(page.getByRole('button', { name: /how to trim/i })).toBeVisible()
  })

  test('a clip that fails to shrink shows the warm "couldn\'t add" banner, and retry recovers it', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', WEBKIT_IDB_BLOB_REASON)
    await seedTripIntoCache(page, VIDEO_TRIP)
    await page.addInitScript((capturedAt) => {
      window.__RT_VIDEO_ENCODE_STUB = { fail: true, capturedAt }
    }, STUB_CAPTURED_AT)
    // Assets succeed so a recovered clip can upload; memories/trips too.
    await page.route(
      /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/assets\/(photo|video)/,
      (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ key: 'helen/vid/ok', url: 'https://example.test/ok', mime: 'video/mp4' }) })
    )
    await page.route(
      /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/(memories|trips)/,
      (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    )

    await page.goto(`/?person=${PERSONA}&trip=import-video-2026&nosw=1`)
    await page.getByTestId(`${PERSONA}-photos-entry`).click()
    await page.getByTestId('import-file-input').setInputFiles([fakeVideoFile()])

    const confirm = page.getByTestId('import-confirm')
    await expect(confirm).toBeVisible({ timeout: 15000 })
    await expect(confirm).toContainText(/couldn.t be added/i)
    const retry = page.getByRole('button', { name: /try it again/i })
    await expect(retry).toBeVisible()

    // Flip the stub to succeed, then retry: the clip recovers (re-shrinks against
    // the original still on the phone), the banner clears, and it joins the count.
    await page.evaluate((capturedAt) => {
      window.__RT_VIDEO_ENCODE_STUB = { blobBytes: 7_500_000, durationMs: 12_000, capturedAt }
    }, STUB_CAPTURED_AT)
    await retry.click()
    await expect(page.getByTestId('import-confirm-go')).toContainText(/Import\s+1/i, { timeout: 10000 })
    await expect(confirm).not.toContainText(/couldn.t be added/i)
  })
})
