import { test } from 'node:test'
import assert from 'node:assert/strict'

const {
  flattenPhotoEntries,
  groupByStop,
  groupAcrossTrips,
} = await import('../../src/lib/photoEntries.js')

// Synthesize a minimal photo memory shape — only the fields the
// helpers actually read. tripId is required for groupAcrossTrips's
// per-trip aggregator since memory records carry their parent trip.
function photoMem({ id, tripId, stopId, author = 'helen', caption = '', refs, capturedAt, createdAt, interstitial }) {
  return {
    id,
    tripId,
    stopId,
    authorTraveler: author,
    visibility: 'shared',
    kind: 'photo',
    caption,
    interstitial,
    capturedAt: capturedAt ?? null,
    photoRefs: refs.map((u) =>
      // A ref may be a bare URL string, or a full object carrying
      // lat/lng/locationLabel for the label-precedence tests.
      typeof u === 'string'
        ? { storage: 'external', url: u, capturedAt: null }
        : { storage: 'external', capturedAt: null, ...u }
    ),
    photoExternalURLs: [],
    reactions: [],
    createdAt: createdAt || '2026-05-24T00:00:00.000Z',
    updatedAt: createdAt || '2026-05-24T00:00:00.000Z',
  }
}

// Trip skeleton — only days + stops + the metadata groupAcrossTrips
// uses for sorting.
function trip({ id, title, dateRangeStart, days }) {
  return {
    id,
    title,
    dateRangeStart,
    days: days.map((d) => ({
      n: d.n,
      date: d.date,
      isoDate: d.isoDate,
      title: d.title || '',
      stops: d.stops.map((s) => ({
        id: s.id,
        name: s.name,
        address: s.address,
        time: s.time || '',
      })),
    })),
  }
}

test('flattenPhotoEntries marks per-memory index + count for multi-photo memories', () => {
  const mems = [
    photoMem({
      id: 'm1',
      tripId: 't1',
      stopId: 's1',
      caption: 'one caption',
      refs: ['u://a', 'u://b', 'u://c'],
      capturedAt: '2026-05-23T10:00:00.000Z',
    }),
  ]
  const entries = flattenPhotoEntries(mems)
  assert.equal(entries.length, 3)
  assert.deepEqual(
    entries.map((e) => `${e.photoIndexInMemory + 1}/${e.photoCountInMemory}`),
    ['1/3', '2/3', '3/3']
  )
  // The caption is on every entry — the tile component is responsible
  // for suppressing it on siblings; the helper just hands the raw data.
  for (const e of entries) assert.equal(e.caption, 'one caption')
})

test('groupAcrossTrips orders trips newest-first by dateRangeStart, drops empty trips', () => {
  const older = trip({
    id: 'older',
    title: 'Older trip',
    dateRangeStart: '2025-08-01',
    days: [{ n: 1, date: 'Aug 1', isoDate: '2025-08-01', stops: [{ id: 'os1', name: 'Beach' }] }],
  })
  const newer = trip({
    id: 'newer',
    title: 'Newer trip',
    dateRangeStart: '2026-05-22',
    days: [{ n: 1, date: 'May 22', isoDate: '2026-05-22', stops: [{ id: 'ns1', name: 'Bungalow' }] }],
  })
  const empty = trip({
    id: 'empty',
    title: 'Trip with no photos',
    dateRangeStart: '2026-04-01',
    days: [{ n: 1, date: 'Apr 1', isoDate: '2026-04-01', stops: [{ id: 'es1', name: 'Nowhere' }] }],
  })
  const sections = groupAcrossTrips([
    { trip: older, memories: [photoMem({ id: 'mo', tripId: 'older', stopId: 'os1', refs: ['u://o'] })] },
    { trip: newer, memories: [photoMem({ id: 'mn', tripId: 'newer', stopId: 'ns1', refs: ['u://n'] })] },
    { trip: empty, memories: [] },
  ])
  assert.equal(sections.length, 2)
  // Newer first.
  assert.deepEqual(sections.map((s) => s.tripId), ['newer', 'older'])
  // Each section carries the title for the lightbox + section eyebrow.
  assert.equal(sections[0].tripTitle, 'Newer trip')
  assert.equal(sections[1].tripTitle, 'Older trip')
})

test('groupAcrossTrips threads tripId + tripTitle through every entry so the lightbox can render the trip name', () => {
  const t = trip({
    id: 't',
    title: 'Volleyball weekend',
    dateRangeStart: '2026-05-22',
    days: [
      { n: 1, date: 'May 22', isoDate: '2026-05-22', stops: [{ id: 'a', name: 'Bungalow' }] },
    ],
  })
  const sections = groupAcrossTrips([
    { trip: t, memories: [photoMem({ id: 'm', tripId: 't', stopId: 'a', refs: ['u://x'] })] },
  ])
  const [entry] = sections[0].stops[0].entries
  assert.equal(entry.tripId, 't')
  assert.equal(entry.tripTitle, 'Volleyball weekend')
})

test('groupAcrossTrips preserves the per-trip groupByStop ordering inside each trip', () => {
  const t = trip({
    id: 't',
    title: 'Two-day trip',
    dateRangeStart: '2026-05-22',
    days: [
      { n: 1, date: 'May 22', isoDate: '2026-05-22', stops: [{ id: 'a', name: 'Morning' }] },
      { n: 2, date: 'May 23', isoDate: '2026-05-23', stops: [{ id: 'b', name: 'Evening' }] },
    ],
  })
  const sections = groupAcrossTrips([
    {
      trip: t,
      memories: [
        photoMem({ id: 'mB', tripId: 't', stopId: 'b', refs: ['u://b'], capturedAt: '2026-05-23T19:00:00.000Z' }),
        photoMem({ id: 'mA', tripId: 't', stopId: 'a', refs: ['u://a'], capturedAt: '2026-05-22T09:00:00.000Z' }),
      ],
    },
  ])
  const stops = sections[0].stops
  // Day 1 stop appears before day 2 stop.
  assert.deepEqual(stops.map((s) => s.stopKey), ['a', 'b'])
})

test('groupAcrossTrips with a single trip + no memories produces an empty result', () => {
  const t = trip({ id: 't', title: 'Just made it', dateRangeStart: '2026-05-22', days: [] })
  const sections = groupAcrossTrips([{ trip: t, memories: [] }])
  assert.equal(sections.length, 0)
})

test('groupByStop is unchanged from its per-trip contract', () => {
  // Regression — the photoEntries split moved this helper, but its
  // shape stays the same. Single trip, two stops on different days.
  const t = trip({
    id: 't',
    title: 'T',
    dateRangeStart: '2026-05-22',
    days: [
      { n: 1, date: 'May 22', isoDate: '2026-05-22', stops: [{ id: 'a', name: 'A' }] },
      { n: 2, date: 'May 23', isoDate: '2026-05-23', stops: [{ id: 'b', name: 'B' }] },
    ],
  })
  const entries = flattenPhotoEntries([
    photoMem({ id: 'mA', tripId: 't', stopId: 'a', refs: ['u://a'], capturedAt: '2026-05-22T09:00:00.000Z' }),
    photoMem({ id: 'mB', tripId: 't', stopId: 'b', refs: ['u://b'], capturedAt: '2026-05-23T19:00:00.000Z' }),
  ])
  const groups = groupByStop(entries, t)
  assert.deepEqual(groups.map((g) => g.stopKey), ['a', 'b'])
})

test('groupByStop label precedence: stored label → stop → raw coords (a GPS fix never replaces a stop name with a decimal pair)', () => {
  // This is the regression guard for the EXIF/GPS pass: once photos carry
  // finite lat/lng, the album must NOT show "41.494, -72.092" in place of
  // the friendly stop name. Coordinates are the last resort only.
  const t = trip({
    id: 't',
    title: 'T',
    dateRangeStart: '2026-05-22',
    days: [
      {
        n: 1,
        date: 'May 22',
        isoDate: '2026-05-22',
        stops: [{ id: 'a', name: 'Mohegan Sun', address: 'New London, CT' }],
      },
    ],
  })
  const entries = flattenPhotoEntries([
    // Filed to a stop AND carrying EXIF GPS → must show the stop, not coords.
    photoMem({
      id: 'filed',
      tripId: 't',
      stopId: 'a',
      refs: [{ url: 'u://1', lat: 41.4943, lng: -72.09163 }],
      capturedAt: '2026-05-22T17:00:00.000Z',
    }),
    // A human/stored label on the ref outranks both stop and coords.
    photoMem({
      id: 'labeled',
      tripId: 't',
      stopId: 'a',
      refs: [{ url: 'u://2', lat: 41.0, lng: -72.0, locationLabel: "Grandma's porch" }],
      capturedAt: '2026-05-22T18:00:00.000Z',
    }),
    // Unfiled (no matching stop) but has GPS → coords are the last resort.
    photoMem({
      id: 'unfiled',
      tripId: 't',
      stopId: 'no-such-stop',
      refs: [{ url: 'u://3', lat: 41.32245, lng: -72.09434 }],
      capturedAt: '2026-05-22T19:00:00.000Z',
    }),
  ])
  const label = {}
  for (const g of groupByStop(entries, t)) {
    for (const e of g.entries) label[e.memoryId] = e.locationLabel
  }
  // The stop address wins over the photo's own coordinates.
  assert.equal(label.filed, 'New London, CT')
  // A stored label wins over everything.
  assert.equal(label.labeled, "Grandma's porch")
  // Only a photo with nowhere to file falls back to coordinates (3dp, signed).
  assert.equal(label.unfiled, '41.322, -72.094')
})

// ─── Step 2: interstitial photos render as a "From A to B" section ─────

test('flattenPhotoEntries surfaces memory.interstitial onto every entry of the memory', () => {
  const entries = flattenPhotoEntries([
    photoMem({ id: 'm', tripId: 't', stopId: null, refs: ['u://1', 'u://2'], interstitial: { before: 'a', after: 'b' } }),
  ])
  assert.equal(entries.length, 2)
  for (const e of entries) assert.deepEqual(e.interstitial, { before: 'a', after: 'b' })
})

test('groupByStop renders an interstitial photo as "From A to B", ordered between the two stops', () => {
  const t = trip({
    id: 't',
    title: 'T',
    dateRangeStart: '2026-04-20',
    days: [
      {
        n: 1,
        date: 'Apr 20',
        isoDate: '2026-04-20',
        stops: [
          { id: 'mccomb', name: 'McComb' },
          { id: 'terrell', name: 'Terrell' },
        ],
      },
    ],
  })
  const entries = flattenPhotoEntries([
    photoMem({ id: 'a', tripId: 't', stopId: 'mccomb', refs: ['u://a'], capturedAt: '2026-04-20T14:00:00.000Z' }),
    photoMem({
      id: 'mid',
      tripId: 't',
      stopId: null,
      refs: ['u://mid'],
      capturedAt: '2026-04-20T16:00:00.000Z',
      interstitial: { before: 'mccomb', after: 'terrell' },
    }),
    photoMem({ id: 'b', tripId: 't', stopId: 'terrell', refs: ['u://b'], capturedAt: '2026-04-20T20:00:00.000Z' }),
  ])
  const groups = groupByStop(entries, t)
  // McComb (order 0) → the interstitial (0.5) → Terrell (1).
  assert.deepEqual(groups.map((g) => g.stopName), ['McComb', 'From McComb to Terrell', 'Terrell'])
  const section = groups.find((g) => g.stopKey.startsWith('__interstitial'))
  assert.equal(section.entries.length, 1)
  assert.equal(section.entries[0].memoryId, 'mid')
  assert.equal(section.dayLabel, 'Apr 20') // eyebrow inherits the bounding day
})

test('a leading day-edge interstitial (before=null) renders "Before B" and sorts ahead of B', () => {
  const t = trip({
    id: 't',
    title: 'T',
    dateRangeStart: '2026-04-20',
    days: [{ n: 1, date: 'Apr 20', isoDate: '2026-04-20', stops: [{ id: 'first', name: 'First Stop' }] }],
  })
  const entries = flattenPhotoEntries([
    photoMem({ id: 'pre', tripId: 't', stopId: null, refs: ['u://pre'], capturedAt: '2026-04-20T06:00:00.000Z', interstitial: { before: null, after: 'first' } }),
    photoMem({ id: 'at', tripId: 't', stopId: 'first', refs: ['u://at'], capturedAt: '2026-04-20T10:00:00.000Z' }),
  ])
  const groups = groupByStop(entries, t)
  assert.deepEqual(groups.map((g) => g.stopName), ['Before First Stop', 'First Stop'])
})

test('a real stopId wins over a stale interstitial field (files under the stop, not in transit)', () => {
  const t = trip({
    id: 't',
    title: 'T',
    dateRangeStart: '2026-04-20',
    days: [{ n: 1, date: 'Apr 20', isoDate: '2026-04-20', stops: [{ id: 's', name: 'Real Stop' }] }],
  })
  const entries = flattenPhotoEntries([
    photoMem({ id: 'p', tripId: 't', stopId: 's', refs: ['u://p'], capturedAt: '2026-04-20T10:00:00.000Z', interstitial: { before: 'x', after: 'y' } }),
  ])
  const groups = groupByStop(entries, t)
  assert.deepEqual(groups.map((g) => g.stopName), ['Real Stop'])
  assert.equal(groups[0].stopKey, 's')
})

test('groupAcrossTrips inherits the interstitial section in the cross-trip album', () => {
  const t = trip({
    id: 't',
    title: 'Trip',
    dateRangeStart: '2026-04-20',
    days: [{ n: 1, date: 'Apr 20', isoDate: '2026-04-20', stops: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }],
  })
  const sections = groupAcrossTrips([
    {
      trip: t,
      memories: [
        photoMem({ id: 'mid', tripId: 't', stopId: null, refs: ['u://mid'], capturedAt: '2026-04-20T16:00:00.000Z', interstitial: { before: 'a', after: 'b' } }),
      ],
    },
  ])
  assert.ok(sections[0].stops.map((s) => s.stopName).includes('From A to B'))
})
