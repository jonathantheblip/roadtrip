import { test } from 'node:test'
import assert from 'node:assert/strict'

const {
  flattenPhotoEntries,
  groupByStop,
  groupAcrossTrips,
  refIdbAssetKey,
} = await import('../../src/lib/photoEntries.js')
const { implicitBaseIdForDay } = await import('../../src/lib/photoMatch.js')

// refIdbAssetKey — the single source of truth for "which idb blob renders this
// ref" (offline-imported photos/videos). Used by the hydration hook AND the
// thread/postcard loaders, so its cases must be exact.
test('refIdbAssetKey: pending photo → its key', () => {
  assert.equal(refIdbAssetKey({ storage: 'pending', key: 'photo_abc' }), 'photo_abc')
})
test('refIdbAssetKey: idb (re-attach) photo → its key', () => {
  assert.equal(refIdbAssetKey({ storage: 'idb', key: 'photo_xyz' }), 'photo_xyz')
})
test('refIdbAssetKey: pending video → its posterKey (the renderable still)', () => {
  assert.equal(
    refIdbAssetKey({ storage: 'pending', kind: 'video', posterKey: 'photo_poster', key: 'ignored' }),
    'photo_poster'
  )
})
test('refIdbAssetKey: r2 ref → null (renders from its durable url)', () => {
  assert.equal(refIdbAssetKey({ storage: 'r2', key: 'helen/x', url: 'https://r2/x' }), null)
})
test('refIdbAssetKey: external/legacy ref with a url but no storage → null', () => {
  assert.equal(refIdbAssetKey({ url: 'https://cdn/x.jpg' }), null)
})
test('refIdbAssetKey: pending photo missing a key → null (nothing to load)', () => {
  assert.equal(refIdbAssetKey({ storage: 'pending', url: 'blob:dead' }), null)
})
test('refIdbAssetKey: pending video missing a posterKey → null', () => {
  assert.equal(refIdbAssetKey({ storage: 'pending', kind: 'video', url: 'blob:dead' }), null)
})
test('refIdbAssetKey: null / non-object → null', () => {
  assert.equal(refIdbAssetKey(null), null)
  assert.equal(refIdbAssetKey('blob:dead'), null)
})

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
        kind: s.kind,
        isBase: s.isBase,
        baseRadiusMeters: s.baseRadiusMeters,
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

test('groupByStop marks a base (a place you stay) with isBase and drops its time label', () => {
  // A lodging stop is a base by default → it renders as an "At [place]"
  // section: isBase true, the clock time suppressed (it's a place, not an event).
  const t = trip({
    id: 't',
    title: 'T',
    dateRangeStart: '2026-06-14',
    days: [
      {
        n: 1,
        date: 'Jun 14',
        isoDate: '2026-06-14',
        stops: [
          { id: 'cabin', name: 'The Cabin', kind: 'lodging', time: '6:00 PM' },
          { id: 'dinner', name: 'Dinner', kind: 'food', time: '7:30 PM' },
        ],
      },
    ],
  })
  const entries = flattenPhotoEntries([
    photoMem({ id: 'm1', tripId: 't', stopId: 'cabin', refs: ['u://1'], capturedAt: '2026-06-14T20:00:00.000Z' }),
    photoMem({ id: 'm2', tripId: 't', stopId: 'dinner', refs: ['u://2'], capturedAt: '2026-06-14T23:30:00.000Z' }),
  ])
  const byKey = Object.fromEntries(groupByStop(entries, t).map((g) => [g.stopKey, g]))
  assert.equal(byKey.cabin.isBase, true)
  assert.equal(byKey.cabin.timeLabel, '') // time dropped for a base
  assert.equal(byKey.cabin.stopName, 'The Cabin')
  // The dinner stop is a normal timed event — not a base, keeps its time.
  assert.equal(byKey.dinner.isBase, false)
  assert.equal(byKey.dinner.timeLabel, '7:30 PM')
})

test('groupByStop renders the trip IMPLICIT base ("At [lodging]") for a photo filed to it (no planned stop)', () => {
  // A destination-less stay: only a dinner is planned, but a cabin photo was filed
  // to the trip's implicit base (the lodging anchor). It must resolve to an "At
  // [place]" section, not "Unfiled".
  const baseId = implicitBaseIdForDay('2026-06-19')
  const t = {
    id: 't', title: 'Vermont weekend', dateRangeStart: '2026-06-19',
    lodging: { name: 'The Cabin', address: '613 Forest Mtn Rd' },
    homeBase: { lat: 43.21, lng: -72.9, label: '613 Forest Mtn Rd' },
    days: [
      { n: 1, date: 'Jun 19', isoDate: '2026-06-19', stops: [{ id: 'dinner', name: 'Dinner out', kind: 'food', time: '7:00 PM' }] },
      { n: 2, date: 'Jun 20', isoDate: '2026-06-20', stops: [] },
    ],
  }
  const entries = flattenPhotoEntries([
    photoMem({ id: 'm1', tripId: 't', stopId: baseId, refs: ['u://1'], capturedAt: '2026-06-19T20:00:00.000Z' }),
    photoMem({ id: 'm2', tripId: 't', stopId: 'dinner', refs: ['u://2'], capturedAt: '2026-06-19T23:30:00.000Z' }),
  ])
  const byKey = Object.fromEntries(groupByStop(entries, t).map((g) => [g.stopKey, g]))
  assert.ok(byKey[baseId], 'the implicit-base group resolves (not Unfiled)')
  assert.equal(byKey[baseId].isBase, true)
  assert.equal(byKey[baseId].timeLabel, '') // a place, not a timed event
  assert.equal(byKey[baseId].stopName, 'The Cabin')
  assert.equal(byKey.dinner.isBase, false)
})

test('groupByStop: isBase:false opts a lodging stop out of the base section', () => {
  const t = trip({
    id: 't',
    title: 'T',
    dateRangeStart: '2026-06-14',
    days: [
      {
        n: 1,
        date: 'Jun 14',
        isoDate: '2026-06-14',
        stops: [{ id: 'hotel', name: 'Airport Inn', kind: 'lodging', isBase: false, time: '11:00 PM' }],
      },
    ],
  })
  const entries = flattenPhotoEntries([
    photoMem({ id: 'm1', tripId: 't', stopId: 'hotel', refs: ['u://1'], capturedAt: '2026-06-14T23:30:00.000Z' }),
  ])
  const [g] = groupByStop(entries, t)
  assert.equal(g.isBase, false)
  assert.equal(g.timeLabel, '11:00 PM') // ordinary stop keeps its time
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

// ─── Stage 3: video entries carry isVideo + posterUrl for the album render ───

test('flattenPhotoEntries flags a video ref (isVideo + posterUrl) and leaves photos alone', () => {
  const entries = flattenPhotoEntries([
    photoMem({ id: 'vid', tripId: 't', stopId: 's', refs: [{ url: 'u://video.mp4', mime: 'video/mp4', posterUrl: 'u://poster.jpg' }] }),
    photoMem({ id: 'pic', tripId: 't', stopId: 's', refs: [{ url: 'u://photo.jpg', mime: 'image/jpeg' }] }),
  ])
  const byMem = Object.fromEntries(entries.map((e) => [e.memoryId, e]))
  assert.equal(byMem.vid.isVideo, true)
  assert.equal(byMem.vid.posterUrl, 'u://poster.jpg')
  // entry.url stays the video itself — the lightbox <video src> needs the mp4,
  // and the tile uses posterUrl for its <img>.
  assert.equal(byMem.vid.url, 'u://video.mp4')
  assert.equal(byMem.pic.isVideo, false)
  assert.equal(byMem.pic.posterUrl, null)
})

test('flattenPhotoEntries detects a video by posterUrl alone (cross-device ref may omit mime)', () => {
  const entries = flattenPhotoEntries([
    photoMem({ id: 'vid', tripId: 't', stopId: 's', refs: [{ url: 'u://v', posterUrl: 'u://p' }] }),
  ])
  assert.equal(entries[0].isVideo, true)
  assert.equal(entries[0].posterUrl, 'u://p')
})

// ─── Foolproof video import (#2/#4): the saved-tile proof rides the entry ───

test('flattenPhotoEntries surfaces a video ref\'s shrunk bytes + length + pending state onto the entry (drives the saved-tile chips)', () => {
  const entries = flattenPhotoEntries([
    // A synced clip: carries its shrunk size + length; not pending → the tile
    // shows the size chip (proof) + duration, no in-flight state.
    photoMem({ id: 'saved', tripId: 't', stopId: 's', refs: [{ url: 'u://v.mp4', mime: 'video/mp4', storage: 'r2', bytes: 7_500_000, durationMs: 42_000 }] }),
    // A not-yet-uploaded clip: storage 'pending' → the tile reads "on its way"
    // (never "saved"); size/length still ride so they're ready when it lands.
    photoMem({ id: 'pending', tripId: 't', stopId: 's', refs: [{ url: 'u://v2.mp4', mime: 'video/mp4', storage: 'pending', bytes: 3_100_000, durationMs: 12_000, posterUrl: 'u://p2' }] }),
    // A plain photo carries none of these — the chips must never render for it.
    photoMem({ id: 'pic', tripId: 't', stopId: 's', refs: [{ url: 'u://photo.jpg', mime: 'image/jpeg', storage: 'r2' }] }),
  ])
  const byMem = Object.fromEntries(entries.map((e) => [e.memoryId, e]))
  assert.equal(byMem.saved.videoBytes, 7_500_000)
  assert.equal(byMem.saved.durationMs, 42_000)
  assert.equal(byMem.saved.pending, false)
  assert.equal(byMem.pending.videoBytes, 3_100_000)
  assert.equal(byMem.pending.durationMs, 12_000)
  assert.equal(byMem.pending.pending, true, 'a pending video ref reads as not-yet-backed-up')
  // A photo: no size/length proof, never pending-as-video.
  assert.equal(byMem.pic.videoBytes, null)
  assert.equal(byMem.pic.durationMs, null)
  assert.equal(byMem.pic.pending, false)
})

// ─── Composed share-moments: each photo shows once in the library grid ───

test('groupByStop collapses a composed moment that re-uses existing photos (each photo once, the original tile wins)', () => {
  const t = trip({
    id: 't',
    title: 'T',
    dateRangeStart: '2026-05-22',
    days: [{ n: 1, date: 'May 22', isoDate: '2026-05-22', stops: [{ id: 'a', name: 'Bungalow' }] }],
  })
  // Two original single-photo memories filed to the stop. Synced refs carry an
  // R2 key — that key is the identity, not the URL.
  const orig1 = photoMem({ id: 'orig1', tripId: 't', stopId: 'a', refs: [{ url: 'u://p1', key: 'photo-1' }], capturedAt: '2026-05-22T10:00:00.000Z', createdAt: '2026-05-22T10:00:00.000Z' })
  const orig2 = photoMem({ id: 'orig2', tripId: 't', stopId: 'a', refs: [{ url: 'u://p2', key: 'photo-2' }], capturedAt: '2026-05-22T11:00:00.000Z', createdAt: '2026-05-22T11:00:00.000Z' })
  // ...and a composed album made LATER that re-uses the same keyed refs. Filed
  // to the same stop so the duplicate would survive grouping if dedup were gone
  // (i.e. this test fails the moment the collapse stops working).
  const composed = photoMem({ id: 'composed', tripId: 't', stopId: 'a', refs: [{ url: 'u://p1', key: 'photo-1' }, { url: 'u://p2', key: 'photo-2' }], createdAt: '2026-06-14T09:00:00.000Z' })

  // Raw flatten is honest: 2 originals + 2 re-uses = 4 entries.
  const entries = flattenPhotoEntries([orig1, orig2, composed])
  assert.equal(entries.length, 4)

  // The library grid collapses by stored-object key → each photo once, kept on
  // its ORIGINAL (older) memory, not the composed grouping.
  const grouped = groupByStop(entries, t).flatMap((g) => g.entries)
  assert.equal(grouped.length, 2)
  const byKey = Object.fromEntries(grouped.map((e) => [e.refKey, e]))
  assert.equal(byKey['photo-1'].memoryId, 'orig1')
  assert.equal(byKey['photo-2'].memoryId, 'orig2')
  // The survivors render as standalone photos (count 1), not "1 of 2".
  assert.equal(byKey['photo-1'].photoCountInMemory, 1)
})

test('groupByStop does NOT collapse distinct photos that merely share a URL (no key, or different keys)', () => {
  // The precision guard: identity is the stored-object KEY, never the URL. Two
  // memories reusing one placeholder URL (keyless, like every test fixture) are
  // two real tiles; only a genuine same-key composed re-use collapses.
  const t = trip({
    id: 't',
    title: 'T',
    dateRangeStart: '2026-05-22',
    days: [{ n: 1, date: 'May 22', isoDate: '2026-05-22', stops: [{ id: 'a', name: 'A' }] }],
  })
  const entries = flattenPhotoEntries([
    photoMem({ id: 'm1', tripId: 't', stopId: 'a', refs: ['u://same'], capturedAt: '2026-05-22T10:00:00.000Z' }),
    photoMem({ id: 'm2', tripId: 't', stopId: 'a', refs: ['u://same'], capturedAt: '2026-05-22T11:00:00.000Z' }),
    photoMem({ id: 'm3', tripId: 't', stopId: 'a', refs: [{ url: 'u://same', key: 'k-a' }], capturedAt: '2026-05-22T12:00:00.000Z' }),
    photoMem({ id: 'm4', tripId: 't', stopId: 'a', refs: [{ url: 'u://same', key: 'k-b' }], capturedAt: '2026-05-22T13:00:00.000Z' }),
  ])
  // All four survive: shared URL is not identity; the two keyed ones differ.
  const grouped = groupByStop(entries, t).flatMap((g) => g.entries)
  assert.equal(grouped.length, 4)
})
