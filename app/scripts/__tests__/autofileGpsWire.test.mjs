// AUTO-FILING WIRE — proves real EXIF GPS now drives photo→stop matching
// end-to-end (the parking-lot "confirm AUTO-FILING is WIRED" item, made
// runtime-true rather than asserted).
//
// PhotoBackfillTriage (rendered in Settings) extracts EXIF via readPhotoExif
// and feeds { id, capturedAt, lat, lng } into matchPhotosToStops. BEFORE the
// GPS pass, lat/lng were never finite (exifr returned a DMS array), so every
// photo fell through to time-only / unmatched and the whole gps+time / GPS-
// deviation branch of the matcher was dead code in practice. This composes the
// REAL reader with the REAL matcher over a REAL fixture and asserts a gps+time
// file — and that moving the stop >500m away flips it to interstitial, proving
// GPS (not merely the time window) decides the match.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { readPhotoExif } from '../../src/lib/photoBackfill.js'
import { matchPhotosToStops } from '../../src/lib/photoMatch.js'

const here = dirname(fileURLToPath(import.meta.url))
const MEDIA = resolve(here, '../../tests/fixtures/media')
function fixtureBlob(name, type) {
  return new Blob([readFileSync(resolve(MEDIA, name))], { type })
}

// One-day, one-stop trip with the stop AT (lat,lng). Stop time '12:00 AM' →
// the matcher's UTC-frame day window is [00:00, EOD], so the photo (any
// time-of-day on `isoDate`) is always inside it regardless of the runner's
// timezone — isolating the assertion to the GPS decision, not clock alignment.
function tripWithStopAt(isoDate, lat, lng) {
  return {
    id: 't',
    title: 'T',
    dateRangeStart: isoDate,
    days: [
      {
        n: 1,
        isoDate,
        date: isoDate,
        title: '',
        stops: [{ id: 'stop', name: 'Here', time: '12:00 AM', lat, lng }],
      },
    ],
  }
}

test('real HEIC GPS files to a co-located stop as gps+time (auto-filing wire is live)', async () => {
  const exif = await readPhotoExif(fixtureBlob('iphone-heic-with-gps.heic', 'image/heic'))
  assert.ok(
    Number.isFinite(exif.lat) && Number.isFinite(exif.lng),
    `fixture must decode finite GPS, got lat=${exif.lat} lng=${exif.lng}`
  )
  const day = exif.capturedAt.slice(0, 10)
  const photo = { id: 'p', capturedAt: exif.capturedAt, lat: exif.lat, lng: exif.lng }

  // Stop sits on the photo's own coordinates → within the 500m GPS threshold.
  const onSite = matchPhotosToStops([photo], tripWithStopAt(day, exif.lat, exif.lng))
  assert.equal(onSite.matches[0].matchType, 'gps+time')
  assert.equal(onSite.matches[0].stopId, 'stop')

  // Same photo + same time window, but the stop is ~250km away → GPS rejects
  // the time-window stop, demoting it to interstitial. Proves GPS decides
  // (with time alone, the photo would still "match" the only stop on the day).
  const offSite = matchPhotosToStops([photo], tripWithStopAt(day, exif.lat + 2, exif.lng - 2))
  assert.equal(offSite.matches[0].matchType, 'interstitial')
  assert.equal(offSite.matches[0].stopId, null)
})

test('real JPEG GPS also files gps+time through the same wire', async () => {
  const exif = await readPhotoExif(fixtureBlob('iphone-jpeg-fullres.jpg', 'image/jpeg'))
  assert.ok(Number.isFinite(exif.lat) && Number.isFinite(exif.lng))
  const day = exif.capturedAt.slice(0, 10)
  const photo = { id: 'p', capturedAt: exif.capturedAt, lat: exif.lat, lng: exif.lng }
  const { matches } = matchPhotosToStops([photo], tripWithStopAt(day, exif.lat, exif.lng))
  assert.equal(matches[0].matchType, 'gps+time')
  assert.equal(matches[0].stopId, 'stop')
})
