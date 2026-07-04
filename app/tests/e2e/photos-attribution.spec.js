import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache } from './_fixtures/withTrip.js'
import { redPhotoFile } from './_fixtures/photoFixtures.js'
import { WEBKIT_IDB_BLOB_REASON } from './_fixtures/webkitIdbBlobGate.js'

// Close-the-door prep — the shared-iPad CREDIT bug. A photo queued offline by one
// persona must upload CREDITED TO ITS AUTHOR, not whoever is active when the queue
// drains. The worker stamps the author from the AUTH TOKEN, so the proof is the
// Authorization header the drain sends: it must carry the AUTHOR's credential even
// though a different persona is active at drain time.

const TRIP = {
  id: 'attrib-2026',
  status: 'planning',
  title: 'Attribution Roadtrip',
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

// Three photos (one between-stops) → the importer shows the confirm summary rather
// than smart-skipping, the same deterministic path the offline spec drives.
const BACKFILL_EXIF = {
  'a-alpha.png': { capturedAt: '2026-05-23T09:15:00Z', lat: 40.0, lng: -75.0 },
  'a-between.png': { capturedAt: '2026-05-23T13:00:00Z', lat: 40.5, lng: -74.5 },
  'a-beta.png': { capturedAt: '2026-05-23T18:15:00Z', lat: 41.0, lng: -74.0 },
}
const IMPORT_FILES = [redPhotoFile('a-alpha.png'), redPhotoFile('a-between.png'), redPhotoFile('a-beta.png')]

test.describe('Upload attribution — drains as the author, not the active persona', () => {
  // NOTE: do NOT delete the upload-queue IDB via addInitScript — it re-runs on
  // EVERY navigation, so the cross-persona reload below would wipe the queue. A
  // fresh Playwright context already starts with an empty queue.
  test('a photo Aurelia queued offline uploads under Aurelia even when Jonathan drains', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', WEBKIT_IDB_BLOB_REASON)
    await seedTripIntoCache(page, TRIP)
    // Give each persona a per-device SESSION so authHeader resolves deterministically
    // to a session token we can recognize — independent of whether the test build
    // carries bundled family tokens.
    await page.addInitScript(() => {
      localStorage.setItem('rt_session_aurelia', 'AUR_SESSION')
      localStorage.setItem('rt_session_jonathan', 'JON_SESSION')
    })
    await page.addInitScript((map) => { window.__RT_BACKFILL_EXIF = map }, BACKFILL_EXIF)

    let assetStatus = 503 // start "offline" so the import queues
    const assetAuths = []
    await page.route(/roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/assets\/(photo|video)/, async (route) => {
      assetAuths.push(route.request().headers()['authorization'] || '')
      if (assetStatus >= 500) {
        await route.fulfill({ status: assetStatus, body: '{"error":"offline"}' })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ key: `aurelia/attrib/k${assetAuths.length}`, url: `https://example.test/k${assetAuths.length}`, mime: 'image/jpeg' }),
      })
    })
    await page.route(/roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/(memories|trips)/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    )

    // ── Import AS AURELIA, offline → the photos park in the queue as her work ──
    await page.goto('/?person=aurelia&trip=attrib-2026&nosw=1')
    await page.getByTestId('aurelia-photos-entry').click()
    await page.getByTestId('import-file-input').setInputFiles(IMPORT_FILES)
    await expect(page.getByTestId('import-confirm')).toBeVisible({ timeout: 10000 })
    await page.getByTestId('import-confirm-go').click()
    // Per-person pill copy (foolproof-video L5); aurelia reads "3 uploading" — tolerant across lenses.
    await expect(page.getByTestId('sync-pill')).toContainText(/(?:3\s+(?:uploading|queued))|saving/i, { timeout: 12000 })

    // Signal returns BEFORE Jonathan takes over, so his drain succeeds + clears.
    assetStatus = 200
    const callsBeforeJonathan = assetAuths.length

    // ── Now JONATHAN is the active persona (shared iPad). His cold-load auto-drain
    // (App runDrain) attempts the queued items; an `online` event nudges it too. ──
    await page.goto('/?person=jonathan&trip=attrib-2026&nosw=1')
    await page.waitForLoadState('domcontentloaded')
    await page.evaluate(() => window.dispatchEvent(new Event('online')))

    // Wait for the drain to attempt + clear the queued uploads.
    await expect.poll(() => assetAuths.length, { timeout: 15000 }).toBeGreaterThan(callsBeforeJonathan)
    await expect.poll(async () => page.evaluate(() => new Promise((resolve) => {
      const r = indexedDB.open('roadtrip-upload-queue', 1)
      r.onsuccess = () => { try { const c = r.result.transaction('pending', 'readonly').objectStore('pending').count(); c.onsuccess = () => { resolve(c.result); r.result.close() } } catch { resolve(-1) } }
      r.onerror = () => resolve(-1)
    })), { timeout: 15000 }).toBe(0)

    // THE PROOF: every drain upload (made while JONATHAN is active) authenticated as
    // AURELIA (the author), never as Jonathan — so the worker stamps the photos under
    // their real author, not whoever happened to be on the shared iPad at drain.
    const drainAuths = assetAuths.slice(callsBeforeJonathan)
    expect(drainAuths.length).toBeGreaterThan(0)
    expect(drainAuths).toContain('Bearer AUR_SESSION')
    expect(drainAuths).not.toContain('Bearer JON_SESSION')
  })
})
