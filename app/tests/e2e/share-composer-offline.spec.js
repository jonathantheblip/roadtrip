// Share-out E3 — the HARD GATE: importing BRAND-NEW media into a "moment" while
// the Worker is unreachable must (a) not be lost, (b) not mint a broken link, and
// (c) once back online, drain to real R2 urls so a recipient never gets a blob:.
//
// This is strictly stronger than photos-import-offline.spec.js (which stops at
// "the sync pill empties"): here we follow the imported media all the way into
// the COMPOSED SHARE and assert the album the recipient would load carries only
// R2 urls — for a photo AND a video (with an R2 poster).
//
// Seams stubbed for headless (inert in production):
//   • window.__RT_BACKFILL_EXIF       — EXIF read (no GPS/date in fixtures)
//   • window.__RT_COMPOSER_FAKE_ENCODE — WebCodecs video encode (not in headless)
// The outage is the /assets route returning 503, then flipped to 200 — the same
// deterministic "attempted then succeeded" signal the bulk-import gate uses.
//
// COVERAGE NOTE: these run Chromium-only (the webkit skip is a real bundled-
// WebKit IDB+Blob bug). The simulator offline-drain test covers the BULK
// importer, NOT the composer — so the composer's import→queue→drain→share seam
// has no iOS automated coverage yet (a device-walk gap; the underlying queue +
// drain engine is shared with the bulk path and is iOS-proven there).
import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, seedMemoriesIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'
import { redPhotoFile, mp4FileForRejection } from './_fixtures/photoFixtures.js'
import { WEBKIT_IDB_BLOB_REASON } from './_fixtures/webkitIdbBlobGate.js'

const sharedMemories = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('rt_memories_shared_v1') || '[]'))

test.describe('Share composer — import new media survives offline', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => indexedDB.deleteDatabase('roadtrip-upload-queue'))
  })

  test('photo + video imported offline → queued → reconnect drains → shared album is all R2 (never blob:)', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', WEBKIT_IDB_BLOB_REASON)
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))

    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.addInitScript(() => {
      window.__RT_BACKFILL_EXIF = { 'moment.png': { capturedAt: '2026-05-23T15:00:00Z', lat: null, lng: null } }
      window.__RT_COMPOSER_FAKE_ENCODE = true
    })

    // /assets: 503 ("offline") then flipped to 200, returning a real R2 url.
    let assetCalls = 0
    let assetStatus = 503
    const assetUrls = []
    await page.route(/workers\.dev\/assets\/(photo|video)/, async (route) => {
      assetCalls += 1
      assetUrls.push(route.request().url())
      if (assetStatus >= 500) {
        await route.fulfill({ status: assetStatus, body: '{"error":"offline simulated"}' })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ key: `helen/compose/r2-${assetCalls}`, url: `https://example.test/r2-${assetCalls}`, mime: 'image/jpeg' }),
      })
    })
    await page.route(/workers\.dev\/(memories|trips)\b/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    )
    const shareBodies = []
    await page.route(/workers\.dev\/share\b/, async (route) => {
      try { shareBodies.push(route.request().postDataJSON()) } catch { shareBodies.push(null) }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'tok-1', url: 'https://share.test/m/tok-1' }) })
    })

    await page.goto('/?person=helen&trip=volleyball-2026&compose=1&nosw=1')
    await expect(page.getByTestId('share-composer')).toBeVisible()

    // Import a photo + a video via the composer's native picker, while offline.
    await page.getByRole('button', { name: 'Add new' }).click()
    await page.getByTestId('composer-file-input').setInputFiles([
      redPhotoFile('moment.png'),
      mp4FileForRejection('clip.mp4'),
    ])

    // Both imported + auto-selected; the upload was genuinely ATTEMPTED (not a
    // silent local-only save) and 503'd into the queue.
    await expect(page.getByText(/2 selected/i)).toBeVisible({ timeout: 12000 })
    // Each piece genuinely attempted ITS OWN upload offline (not a silent local
    // save) — the photo hit /assets/photo and the video hit /assets/video.
    expect(assetUrls.some((u) => /\/assets\/photo\//.test(u)), 'photo upload attempted offline').toBe(true)
    expect(assetUrls.some((u) => /\/assets\/video\//.test(u)), 'video upload attempted offline').toBe(true)

    // Arrange step — Share is GATED while the imports are still uploading.
    await page.getByRole('button', { name: /Next . Arrange/i }).click()
    await expect(page.getByRole('button', { name: /Uploading 2/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Share this moment$/i })).toHaveCount(0)
    await expect(page.getByText(/ready once they finish uploading/i)).toBeVisible()

    // Reconnect: flip the mock to 200 and fire the window 'online' event that
    // App's drain listens for. The queue drains; refs flip pending → R2.
    const callsBeforeDrain = assetCalls
    assetStatus = 200
    await page.evaluate(() => window.dispatchEvent(new Event('online')))

    // Share lights up only once every piece is uploaded (R2).
    await expect(page.getByRole('button', { name: /Share this moment/i })).toBeEnabled({ timeout: 15000 })
    expect(assetCalls).toBeGreaterThan(callsBeforeDrain) // drain genuinely retried

    await page.getByRole('button', { name: /Share this moment/i }).click()
    await expect(page.getByText('https://share.test/m/tok-1')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/Shared to the family/i)).toBeVisible()

    // THE GATE: the composed album the recipient loads carries only R2 urls —
    // never a session-only blob: object URL — and the video carries an R2 poster.
    const sharedId = shareBodies.find((b) => b?.memoryId)?.memoryId
    expect(sharedId, 'POST /share was called with the album id').toBeTruthy()
    const album = (await sharedMemories(page)).find((m) => m.id === sharedId)
    expect(album, 'the composed album memory exists').toBeTruthy()
    expect(album.photoRefs).toHaveLength(2)
    for (const ref of album.photoRefs) {
      expect(ref.storage).toBe('r2')
      expect(ref.url, 'no blob: url reaches the recipient').not.toMatch(/^blob:/)
      expect(ref.url).toContain('example.test')
    }
    const videoRef = album.photoRefs.find((r) => (r.mime || '').startsWith('video') || r.kind === 'video')
    expect(videoRef, 'the album includes the imported video').toBeTruthy()
    expect(videoRef.posterUrl, 'the video has an R2 poster (not a fallback icon)').toContain('example.test')
    expect(videoRef.posterUrl).not.toMatch(/^blob:/)

    expect(errors, errors.join(' | ')).toHaveLength(0)
  })

  test('online: imported photo uploads immediately → Share works right away with an R2 ref', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', WEBKIT_IDB_BLOB_REASON)
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))

    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.addInitScript(() => {
      window.__RT_BACKFILL_EXIF = { 'moment.png': { capturedAt: '2026-05-23T15:00:00Z', lat: null, lng: null } }
    })
    let n = 0
    await page.route(/workers\.dev\/assets\/(photo|video)/, (route) => {
      n += 1
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ key: `helen/c/r2-${n}`, url: `https://example.test/r2-${n}`, mime: 'image/jpeg' }) })
    })
    await page.route(/workers\.dev\/(memories|trips)\b/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
    const shareBodies = []
    await page.route(/workers\.dev\/share\b/, async (route) => {
      try { shareBodies.push(route.request().postDataJSON()) } catch { shareBodies.push(null) }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'tok-2', url: 'https://share.test/m/tok-2' }) })
    })

    await page.goto('/?person=helen&trip=volleyball-2026&compose=1&nosw=1')
    await expect(page.getByTestId('share-composer')).toBeVisible()
    await page.getByRole('button', { name: 'Add new' }).click()
    await page.getByTestId('composer-file-input').setInputFiles([redPhotoFile('moment.png')])
    await expect(page.getByText(/1 selected/i)).toBeVisible({ timeout: 12000 })

    await page.getByRole('button', { name: /Next . Arrange/i }).click()
    // Online → the import is already R2, so Share is enabled immediately (no gate).
    await expect(page.getByRole('button', { name: /Share this moment/i })).toBeEnabled()
    await page.getByRole('button', { name: /Share this moment/i }).click()
    await expect(page.getByText('https://share.test/m/tok-2')).toBeVisible({ timeout: 10000 })

    const sharedId = shareBodies.find((b) => b?.memoryId)?.memoryId
    const album = (await sharedMemories(page)).find((m) => m.id === sharedId)
    expect(album.photoRefs).toHaveLength(1)
    expect(album.photoRefs[0].storage).toBe('r2')
    expect(album.photoRefs[0].url).toContain('example.test')
    expect(errors, errors.join(' | ')).toHaveLength(0)
  })

  test('a not-yet-uploaded trip photo is NOT offered for sharing (only uploaded pieces)', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [
      { id: 'ready1', tripId: 'volleyball-2026', stopId: 'vb1-3', authorTraveler: 'helen', visibility: 'shared', kind: 'photo', caption: 'uploaded',
        photoRefs: [{ storage: 'r2', key: 'k-ready', url: 'https://example.test/ready.png' }], createdAt: '2026-05-22T18:00:00.000Z' },
      { id: 'pending1', tripId: 'volleyball-2026', stopId: null, authorTraveler: 'helen', visibility: 'shared', kind: 'photo', caption: 'still uploading',
        photoRefs: [{ storage: 'pending', url: 'https://example.test/should-not-show.png' }], createdAt: '2026-05-22T18:05:00.000Z' },
    ])
    await page.goto('/?person=helen&trip=volleyball-2026&compose=1&nosw=1')
    await expect(page.getByTestId('share-composer')).toBeVisible()
    // 'On this trip' is the default tab; only the uploaded (r2) photo is offered —
    // the pending one is filtered out so it can't ship a non-r2 ref into a share.
    await expect(page.getByRole('button', { name: 'Select photo' })).toHaveCount(1)
  })

  test('video imported online with a FAILING poster still shares (degraded, never a blob: poster)', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', WEBKIT_IDB_BLOB_REASON)
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.addInitScript(() => { window.__RT_COMPOSER_FAKE_ENCODE = true })
    // The video uploads fine; its poster (a /assets/photo POST) always fails.
    let v = 0
    await page.route(/workers\.dev\/assets\/video/, (route) => { v += 1; route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ key: `helen/v/r2-${v}`, url: `https://example.test/v-${v}`, mime: 'video/mp4' }) }) })
    await page.route(/workers\.dev\/assets\/photo/, (route) => route.fulfill({ status: 503, body: '{}' }))
    await page.route(/workers\.dev\/(memories|trips)\b/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
    const shareBodies = []
    await page.route(/workers\.dev\/share\b/, async (route) => {
      try { shareBodies.push(route.request().postDataJSON()) } catch { shareBodies.push(null) }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'tok-3', url: 'https://share.test/m/tok-3' }) })
    })

    await page.goto('/?person=helen&trip=volleyball-2026&compose=1&nosw=1')
    await expect(page.getByTestId('share-composer')).toBeVisible()
    await page.getByRole('button', { name: 'Add new' }).click()
    await page.getByTestId('composer-file-input').setInputFiles([mp4FileForRejection('clip.mp4')])
    await expect(page.getByText(/1 selected/i)).toBeVisible({ timeout: 12000 })
    await page.getByRole('button', { name: /Next . Arrange/i }).click()
    // The video itself uploaded (r2), so Share is enabled even though the poster
    // failed — poster is best-effort by design (album falls back to an icon).
    await expect(page.getByRole('button', { name: /Share this moment/i })).toBeEnabled()
    await page.getByRole('button', { name: /Share this moment/i }).click()
    await expect(page.getByText('https://share.test/m/tok-3')).toBeVisible({ timeout: 10000 })

    const sharedId = shareBodies.find((b) => b?.memoryId)?.memoryId
    const ref = (await sharedMemories(page)).find((m) => m.id === sharedId).photoRefs[0]
    expect(ref.storage).toBe('r2')
    expect(ref.url).toContain('example.test')
    expect(ref.posterUrl || '', 'a failed poster must never leave a blob: url').not.toMatch(/^blob:/)
    expect(errors, errors.join(' | ')).toHaveLength(0)
  })
})
