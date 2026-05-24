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
function photoMem({ id, tripId, stopId, author = 'helen', caption = '', refs, capturedAt, createdAt }) {
  return {
    id,
    tripId,
    stopId,
    authorTraveler: author,
    visibility: 'shared',
    kind: 'photo',
    caption,
    capturedAt: capturedAt ?? null,
    photoRefs: refs.map((u, i) => ({ storage: 'external', url: u, capturedAt: refs.length > 1 ? null : null })),
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
