// Tests for the EXIF parser, trip-range filter, and stop-time parser
// behind the photo backfill flow. exifr itself is exercised via a
// pure helper that takes parsed-EXIF-shaped objects, so we don't
// need real photo bytes to test the contract.

import { test } from 'node:test'
import assert from 'node:assert/strict'

const {
  parseExifData,
  filterByTripRange,
  parseStopTime,
} = await import('../../src/lib/photoBackfill.js')

// ─── parseExifData ────────────────────────────────────────────────

test('parseExifData picks DateTimeOriginal first when present', () => {
  const result = parseExifData(
    {
      DateTimeOriginal: new Date('2026-04-17T15:32:11Z'),
      CreateDate: new Date('2026-04-17T15:32:12Z'),
      ModifyDate: new Date('2026-04-20T00:00:00Z'),
    },
    null
  )
  assert.equal(result.capturedAt, '2026-04-17T15:32:11.000Z')
  assert.equal(result.capturedAtSource, 'exif-original')
})

test('parseExifData falls back to CreateDate when DateTimeOriginal absent', () => {
  const result = parseExifData(
    { CreateDate: new Date('2026-04-17T15:32:12Z') },
    null
  )
  assert.equal(result.capturedAt, '2026-04-17T15:32:12.000Z')
  assert.equal(result.capturedAtSource, 'exif-create')
})

test('parseExifData falls back to ModifyDate when both original and create absent', () => {
  const result = parseExifData(
    { ModifyDate: new Date('2026-04-20T00:00:00Z') },
    null
  )
  assert.equal(result.capturedAt, '2026-04-20T00:00:00.000Z')
  assert.equal(result.capturedAtSource, 'exif-modify')
})

test('parseExifData falls back to file.lastModified when EXIF dates absent', () => {
  const lastModified = Date.parse('2026-04-18T09:15:00Z')
  const file = { lastModified, type: 'image/jpeg', size: 100 }
  const result = parseExifData({}, file)
  assert.equal(result.capturedAt, '2026-04-18T09:15:00.000Z')
  assert.equal(result.capturedAtSource, 'file-mtime')
})

test('parseExifData accepts ISO string dates from exifr', () => {
  const result = parseExifData(
    { DateTimeOriginal: '2026-04-17T15:32:11Z' },
    null
  )
  assert.equal(result.capturedAt, '2026-04-17T15:32:11.000Z')
})

test('parseExifData returns null capturedAt when nothing usable', () => {
  const result = parseExifData(null, null)
  assert.equal(result.capturedAt, null)
  assert.equal(result.capturedAtSource, null)
})

test('parseExifData rejects an invalid Date object', () => {
  const result = parseExifData({ DateTimeOriginal: new Date('not-a-date') }, null)
  assert.equal(result.capturedAt, null)
})

test('parseExifData reads GPS coordinates as numbers', () => {
  const result = parseExifData(
    { GPSLatitude: 42.3437, GPSLongitude: -73.6062 },
    null
  )
  assert.equal(result.lat, 42.3437)
  assert.equal(result.lng, -73.6062)
})

test('parseExifData ignores non-finite GPS values', () => {
  const result = parseExifData(
    { GPSLatitude: 'not-a-number', GPSLongitude: NaN },
    null
  )
  assert.equal(result.lat, null)
  assert.equal(result.lng, null)
})

test('parseExifData reads orientation 1-8', () => {
  const r1 = parseExifData({ Orientation: 1 }, null)
  const r6 = parseExifData({ Orientation: 6 }, null)
  assert.equal(r1.orientation, 1)
  assert.equal(r6.orientation, 6)
})

test('parseExifData parses negative offset minutes', () => {
  const result = parseExifData(
    { OffsetTimeOriginal: '-05:00' },
    null
  )
  assert.equal(result.offsetMinutes, -300)
})

test('parseExifData parses positive offset minutes', () => {
  const result = parseExifData(
    { OffsetTimeOriginal: '+09:30' },
    null
  )
  assert.equal(result.offsetMinutes, 570)
})

test('parseExifData ignores malformed offset strings', () => {
  const result = parseExifData(
    { OffsetTimeOriginal: 'PST' },
    null
  )
  assert.equal(result.offsetMinutes, null)
})

// ─── filterByTripRange ────────────────────────────────────────────

function photo(id, iso) {
  return { id, capturedAt: iso }
}

test('filterByTripRange includes photos inside the window', () => {
  const photos = [
    photo('a', '2026-04-17T08:00:00Z'),
    photo('b', '2026-04-20T23:59:00Z'),
    photo('c', '2026-04-24T20:00:00Z'),
  ]
  const { included, excluded } = filterByTripRange(photos, '2026-04-17', '2026-04-24')
  assert.deepEqual(included.map((p) => p.id), ['a', 'b', 'c'])
  assert.equal(excluded.length, 0)
})

test('filterByTripRange excludes photos before and after the window', () => {
  const photos = [
    photo('before', '2026-04-16T23:59:00Z'),
    photo('on-start', '2026-04-17T00:00:00Z'),
    photo('on-end', '2026-04-24T23:59:59Z'),
    photo('after', '2026-04-25T00:00:01Z'),
  ]
  const { included, excluded } = filterByTripRange(photos, '2026-04-17', '2026-04-24')
  assert.deepEqual(included.map((p) => p.id), ['on-start', 'on-end'])
  assert.deepEqual(excluded.map((p) => p.id), ['before', 'after'])
})

test('filterByTripRange excludes photos with no capturedAt', () => {
  const photos = [photo('null', null), photo('valid', '2026-04-18T12:00:00Z')]
  const { included, excluded } = filterByTripRange(photos, '2026-04-17', '2026-04-24')
  assert.deepEqual(included.map((p) => p.id), ['valid'])
  assert.deepEqual(excluded.map((p) => p.id), ['null'])
})

test('filterByTripRange reports invalid range', () => {
  const photos = [photo('x', '2026-04-18T12:00:00Z')]
  const { included, excluded, reason } = filterByTripRange(photos, 'nope', '2026-04-24')
  assert.equal(included.length, 0)
  assert.equal(excluded.length, 1)
  assert.equal(reason, 'invalid-range')
})

test('filterByTripRange reports inverted range', () => {
  const photos = [photo('x', '2026-04-18T12:00:00Z')]
  const { reason } = filterByTripRange(photos, '2026-04-24', '2026-04-17')
  assert.equal(reason, 'invalid-range')
})

// ─── parseStopTime ────────────────────────────────────────────────

test('parseStopTime handles 11:00 AM', () => {
  const { at, loose } = parseStopTime('11:00 AM', '2026-04-17')
  assert.equal(at, Date.parse('2026-04-17T11:00:00Z'))
  assert.equal(loose, false)
})

test('parseStopTime handles 9:30 AM', () => {
  const { at, loose } = parseStopTime('9:30 AM', '2026-04-18')
  assert.equal(at, Date.parse('2026-04-18T09:30:00Z'))
  assert.equal(loose, false)
})

test('parseStopTime handles 12:00 PM as noon', () => {
  const { at } = parseStopTime('12:00 PM', '2026-04-17')
  assert.equal(at, Date.parse('2026-04-17T12:00:00Z'))
})

test('parseStopTime handles 12:00 AM as midnight', () => {
  const { at } = parseStopTime('12:00 AM', '2026-04-17')
  assert.equal(at, Date.parse('2026-04-17T00:00:00Z'))
})

test('parseStopTime handles 7:15 PM', () => {
  const { at, loose } = parseStopTime('7:15 PM', '2026-04-17')
  assert.equal(at, Date.parse('2026-04-17T19:15:00Z'))
  assert.equal(loose, false)
})

test('parseStopTime handles 24-hour format 14:00', () => {
  const { at, loose } = parseStopTime('14:00', '2026-04-17')
  assert.equal(at, Date.parse('2026-04-17T14:00:00Z'))
  assert.equal(loose, false)
})

test('parseStopTime marks loose-time labels as loose', () => {
  for (const label of ['Evening', 'Morning', 'Late', 'Overnight', 'AM', 'PM']) {
    const { loose } = parseStopTime(label, '2026-04-17')
    assert.equal(loose, true, `expected '${label}' to parse as loose`)
  }
})

test('parseStopTime returns NaN for invalid day', () => {
  const { at } = parseStopTime('11:00 AM', 'not-a-date')
  assert.ok(Number.isNaN(at))
})

test('parseStopTime treats unknown labels as the default bucket', () => {
  const { at, loose } = parseStopTime('whenever', '2026-04-17')
  assert.equal(at, Date.parse('2026-04-17T12:00:00Z'))
  assert.equal(loose, true)
})
