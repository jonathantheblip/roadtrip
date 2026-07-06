// The import sound-loss surfaces, pinned end-to-end (the e2e-pins backlog from
// the video-sound arc): when a clip's source HAD audio but the saved copy
// won't carry it, the family must SEE that before it lands — the confirm sheet
// can never smart-skip past a silent clip, the amber banner says the loss out
// loud, and the completion toast carries the honest "· N without its sound"
// suffix. All of this shipped with the packet-copy pipeline; nothing pinned it
// in a browser until now (only importToastProps had unit coverage).
//
// Rides the prod-inert __RT_VIDEO_ENCODE_STUB seam (cfg.sound drives the
// honesty verdict) like photos-import-video.spec.js, so the pick → shrink →
// confirm → save path runs headlessly on both engines. No idb blobs are read
// back, so no webkit gate is needed.
import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache } from './_fixtures/withTrip.js'

// PINNED persona (not RT_PERSONA-driven, same as re-upload-sound.spec.js):
// the assertions below are helen's lens copy, and the banner/suffix are
// deliberately ABSENT on Rafa's lens — a persona-matrix override would flip
// this spec's meaning, not exercise it.
const PERSONA = 'helen'

// Same one-day fixture shape as the video import spec: the stubbed clock is
// 2026-05-23, and the stubbed clip's capturedAt lands inside the trip window.
const TRIP = {
  id: 'import-sound-2026',
  status: 'planning',
  title: 'Import Sound Roadtrip',
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
const fakeVideoFile = () => ({ name: 'clip.mp4', mimeType: 'video/mp4', buffer: Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]) })

test('a clip importing without its sound: no smart-skip, the amber banner says it, and the toast carries the honest suffix', async ({ page }) => {
  await seedTripIntoCache(page, TRIP)
  // The encode "succeeds" but the sound could not come along — the exact
  // verdict the real pipeline produces when the source track can't be carried.
  await page.addInitScript((capturedAt) => {
    window.__RT_VIDEO_ENCODE_STUB = { blobBytes: 900_000, durationMs: 9_000, capturedAt, sound: 'lost' }
  }, STUB_CAPTURED_AT)

  await page.route(
    /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/assets\/(photo|video)/,
    (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ key: 'helen/vid/sound-loss-1', url: 'https://example.test/v1', mime: 'video/mp4' }),
    })
  )
  await page.route(
    /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/(memories|trips)/,
    (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  )

  await page.goto(`/?person=${PERSONA}&trip=import-sound-2026&nosw=1`)
  await page.getByTestId(`${PERSONA}-photos-entry`).click()
  await page.getByTestId('import-file-input').setInputFiles([fakeVideoFile()])

  // A single CLEAN video smart-skips the confirm — a single SILENT one must
  // not: the family has to see the loss before it lands.
  await expect(page.getByTestId('import-confirm')).toBeVisible({ timeout: 20000 })
  const banner = page.getByTestId('import-sound-lost')
  await expect(banner).toBeVisible()
  // Helen's voice for n=1 (“This one’s sound couldn’t come along.”) + the
  // no-blame body — asserted loosely enough to survive punctuation, tightly
  // enough that a missing count or wrong lens fails.
  await expect(banner).toContainText(/sound couldn.t come along/i)
  await expect(banner).toContainText(/camera roll still has its sound/i)

  // Confirm the import — the completion toast must carry the honest suffix,
  // not a clean "1 photo added".
  await page.getByTestId('import-confirm-go').click()
  const toast = page.getByTestId('import-toast')
  await expect(toast).toBeVisible({ timeout: 20000 })
  await expect(toast).toContainText(/1 photo added · 1 without its sound/)
})
