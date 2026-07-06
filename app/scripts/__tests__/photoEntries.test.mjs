import { test } from 'node:test'
import assert from 'node:assert/strict'

const {
  flattenPhotoEntries,
  groupByStop,
  groupAcrossTrips,
  refIdbAssetKey,
} = await import('../../src/lib/photoEntries.js')
const { implicitBaseIdForDay } = await import('../../src/lib/photoMatch.js')
const { photosForDay } = await import('../../src/lib/evidence.js')

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
// uses for sorting. `tz` (optional) pins the trip's zone so the
// self-healing day/band assertions are deterministic on ANY runner
// TZ (the CI box is UTC, dev machines are US-local — see the
// deploy-verify TZ lesson).
function trip({ id, title, dateRangeStart, days, tz }) {
  return {
    id,
    title,
    dateRangeStart,
    ...(tz ? { tz } : {}),
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

// ─── location label vs section header: no doubled text ────────────────────
// The lightbox meta line renders stopName AND locationLabel, and the tile's
// label sits directly under the section header — so a label that merely
// repeats the stop name printed the same text twice ("690 COMMERCIAL ST…"
// doubled). The rule: a label that trim/case-insensitively equals the stop
// name is suppressed; anything genuinely different is kept.

test('groupByStop suppresses a location label that equals the stop name (the doubled-address bug)', () => {
  const t = trip({
    id: 't',
    title: 'T',
    dateRangeStart: '2026-05-22',
    days: [
      {
        n: 1,
        date: 'May 22',
        isoDate: '2026-05-22',
        stops: [
          // A stop NAMED by its street address, as screenshot/AI-created
          // stops often are — its address repeats its name modulo case.
          { id: 'addr', name: '690 Commercial St, Provincetown', address: '690 COMMERCIAL ST, PROVINCETOWN ' },
          // A stop with NO address at all — the label chain falls through to
          // the stop name itself, which is the header verbatim.
          { id: 'bare', name: 'The Cottage' },
          // A normal stop where name and address genuinely differ.
          { id: 'named', name: 'Mohegan Sun', address: 'New London, CT' },
        ],
      },
    ],
  })
  const entries = flattenPhotoEntries([
    photoMem({ id: 'dupAddr', tripId: 't', stopId: 'addr', refs: ['u://1'], capturedAt: '2026-05-22T10:00:00.000Z' }),
    photoMem({ id: 'dupName', tripId: 't', stopId: 'bare', refs: ['u://2'], capturedAt: '2026-05-22T11:00:00.000Z' }),
    photoMem({ id: 'kept', tripId: 't', stopId: 'named', refs: ['u://3'], capturedAt: '2026-05-22T12:00:00.000Z' }),
    // Per-photo EXIF label that only differs by case from the stop name —
    // still an echo of the header, still suppressed.
    photoMem({
      id: 'dupExif',
      tripId: 't',
      stopId: 'named',
      refs: [{ url: 'u://4', locationLabel: 'MOHEGAN SUN' }],
      capturedAt: '2026-05-22T13:00:00.000Z',
    }),
    // Per-photo EXIF label that is genuinely different — kept untouched.
    photoMem({
      id: 'keptExif',
      tripId: 't',
      stopId: 'named',
      refs: [{ url: 'u://5', locationLabel: 'the back terrace' }],
      capturedAt: '2026-05-22T14:00:00.000Z',
    }),
  ])
  const label = {}
  for (const g of groupByStop(entries, t)) {
    for (const e of g.entries) label[e.memoryId] = e.locationLabel
  }
  // Equal (trim/case-insensitive) → suppressed: the header already says it.
  assert.equal(label.dupAddr, null)
  assert.equal(label.dupName, null)
  assert.equal(label.dupExif, null)
  // Distinct address vs name → both kept (header says the name, tile says where).
  assert.equal(label.kept, 'New London, CT')
  // A distinct per-photo label always survives.
  assert.equal(label.keptExif, 'the back terrace')
})

// ─── Self-healing filing: every dateable photo lands in its day ────────────
// Settled rule (live-trip 2026-07-05 + VISION §1 order-independence): "In
// transit" is never a junk drawer. An in-transit photo files BETWEEN its two
// stops; without two true (clock-timed) stops it files CHRONOLOGICALLY into
// its day; only genuinely undateable photos remain at the bottom. Healing is
// render-time against TODAY's plan, so a bracket that died (stop deleted /
// re-timed) is recomputed and keeps healing as the plan changes.

// A day whose stops carry real clock times — the re-bracket substrate.
function clockDayTrip({ tz = 'UTC' } = {}) {
  return trip({
    id: 't',
    title: 'T',
    dateRangeStart: '2026-04-21',
    tz,
    days: [
      {
        n: 1,
        date: 'Apr 21',
        isoDate: '2026-04-21',
        stops: [
          { id: 'x', name: 'Aquarium', time: '10:00 AM' },
          { id: 'y', name: 'Lobster Shack', time: '2:00 PM' },
        ],
      },
    ],
  })
}

// A stay-ish trip whose days have NO clock-timed stops (loose or none) —
// the chronological-fallback substrate. NY zone on purpose: the leg-local
// day pick must differ from the UTC calendar for the evening photos.
function looseDaysTrip() {
  return trip({
    id: 't',
    title: 'T',
    dateRangeStart: '2026-07-01',
    tz: 'America/New_York',
    days: [
      { n: 1, date: 'Jul 1', isoDate: '2026-07-01', stops: [{ id: 'd1', name: 'Beach day', time: 'Morning' }] },
      { n: 2, date: 'Jul 2', isoDate: '2026-07-02', stops: [{ id: 'd2', name: 'Lazy day', time: '' }] },
      { n: 3, date: 'Jul 3', isoDate: '2026-07-03', stops: [] },
    ],
  })
}

test('RE-BRACKET AT RENDER: a dead bracket pair is recomputed from today\'s clock-timed stops (files between them, not at the bottom)', () => {
  const t = clockDayTrip()
  const entries = flattenPhotoEntries([
    photoMem({ id: 'atX', tripId: 't', stopId: 'x', refs: ['u://x'], capturedAt: '2026-04-21T10:30:00.000Z' }),
    // Saved brackets point at stops that no longer exist (the plan changed).
    photoMem({
      id: 'street',
      tripId: 't',
      stopId: null,
      refs: ['u://street'],
      capturedAt: '2026-04-21T12:00:00.000Z',
      interstitial: { before: 'gone-a', after: 'gone-b' },
    }),
    photoMem({ id: 'atY', tripId: 't', stopId: 'y', refs: ['u://y'], capturedAt: '2026-04-21T14:30:00.000Z' }),
  ])
  const groups = groupByStop(entries, t)
  // Healed: noon sits between the 10 AM and 2 PM stops of TODAY's plan.
  assert.deepEqual(
    groups.map((g) => g.stopName),
    ['Aquarium', 'From Aquarium to Lobster Shack', 'Lobster Shack']
  )
  const healed = groups[1]
  // The bucket is keyed by the DERIVED (live) pair — so it merges with any
  // still-valid saved bucket of the same pair, and never by the dead ids.
  assert.equal(healed.stopKey, '__interstitial:x__y')
  assert.equal(healed.dayLabel, 'Apr 21')
  assert.equal(healed.timeLabel, '') // bracketed sections keep the bare eyebrow
  assert.equal(healed.entries[0].memoryId, 'street')
})

test('RE-BRACKET AT RENDER: a surviving one-sided bracket still re-brackets by the CURRENT plan (order-independence)', () => {
  // Saved "before Breakfast" (the after-bracket is alive), but the photo's own
  // clock now falls after Castle — the plan changed around it. The photo's
  // capturedAt against today's clock stops wins over the stale saved bracket.
  const t = trip({
    id: 't',
    title: 'T',
    dateRangeStart: '2026-04-21',
    tz: 'UTC',
    days: [
      {
        n: 1,
        date: 'Apr 21',
        isoDate: '2026-04-21',
        stops: [
          { id: 'b', name: 'Breakfast', time: '9:00 AM' },
          { id: 'c', name: 'Castle', time: '2:00 PM' },
        ],
      },
    ],
  })
  const entries = flattenPhotoEntries([
    photoMem({
      id: 'late',
      tripId: 't',
      stopId: null,
      refs: ['u://late'],
      capturedAt: '2026-04-21T15:00:00.000Z',
      interstitial: { before: null, after: 'b' },
    }),
  ])
  const [g] = groupByStop(entries, t)
  assert.equal(g.stopName, 'After Castle')
  assert.equal(g.stopKey, '__interstitial:c__end')
})

test('DAY-ANCHORED FALLBACK: no clock stops → files chronologically into its LEG-LOCAL day with a day + hour-band eyebrow (UTC would misfile)', () => {
  const t = looseDaysTrip()
  const entries = flattenPhotoEntries([
    photoMem({ id: 'lazy', tripId: 't', stopId: 'd2', refs: ['u://lazy'], capturedAt: '2026-07-02T16:00:00.000Z' }),
    // 9:30 PM in New York on Jul 2 — already Jul 3 by the UTC calendar. The
    // one-clock rule: this is TONIGHT's photo, not tomorrow's.
    photoMem({
      id: 'smores',
      tripId: 't',
      stopId: null,
      refs: ['u://smores'],
      capturedAt: '2026-07-03T01:30:00.000Z',
      interstitial: { before: 'gone-a', after: 'gone-b' },
    }),
  ])
  const groups = groupByStop(entries, t)
  const healed = groups.find((g) => g.stopName === 'In transit')
  assert.ok(healed, 'the orphan renders as an In transit section')
  // Day-scoped key, JUL 2 — not the UTC calendar's Jul 3.
  assert.equal(healed.stopKey, '__interstitial:2026-07-02:start__end')
  assert.equal(healed.dayLabel, 'Jul 2')
  // spanWords voice: one instant collapses to "around N" (9:30 PM → around 9).
  assert.equal(healed.timeLabel, 'around 9')
  // It sorts INSIDE its day — after Jul 2's own stop section, before nothing
  // in Jul 3 (which has no photos), never in a bottom drawer.
  assert.deepEqual(groups.map((g) => g.stopName), ['Lazy day', 'In transit'])
})

test('DAY-SCOPED KEYS: two days\' orphans never merge into one bucket (each day gets its own section + band)', () => {
  const t = looseDaysTrip()
  const entries = flattenPhotoEntries([
    // Producer 1's exact shape: saved with both brackets null.
    photoMem({
      id: 'day1',
      tripId: 't',
      stopId: null,
      refs: ['u://one'],
      capturedAt: '2026-07-01T14:00:00.000Z', // Jul 1, 10 AM NY
      interstitial: { before: null, after: null },
    }),
    photoMem({
      id: 'day2',
      tripId: 't',
      stopId: null,
      refs: ['u://two'],
      capturedAt: '2026-07-02T18:00:00.000Z', // Jul 2, 2 PM NY
      interstitial: { before: null, after: null },
    }),
  ])
  const groups = groupByStop(entries, t).filter((g) => g.stopName === 'In transit')
  assert.equal(groups.length, 2, 'one section per day — never one merged drawer')
  assert.deepEqual(
    groups.map((g) => g.stopKey),
    ['__interstitial:2026-07-01:start__end', '__interstitial:2026-07-02:start__end']
  )
  assert.deepEqual(groups.map((g) => g.dayLabel), ['Jul 1', 'Jul 2'])
  assert.deepEqual(groups.map((g) => g.timeLabel), ['around 10', 'around 2'])
})

test('UNFILED, DAY-ANCHORED: dead-stopId and unassigned photos with a dateable capture merge into their day\'s one "Unfiled" section', () => {
  const t = looseDaysTrip()
  const entries = flattenPhotoEntries([
    // A stopId that resolves to nothing (the stop was deleted / edited away).
    photoMem({ id: 'ghost', tripId: 't', stopId: 'ghost-stop', refs: ['u://g'], capturedAt: '2026-07-01T14:00:00.000Z' }), // 10 AM NY
    // A plain unassigned photo (stopId null, no interstitial identity).
    photoMem({ id: 'loose', tripId: 't', stopId: null, refs: ['u://l'], capturedAt: '2026-07-01T18:30:00.000Z' }), // 2:30 PM NY
  ])
  const groups = groupByStop(entries, t)
  const unfiled = groups.filter((g) => g.stopName === 'Unfiled')
  assert.equal(unfiled.length, 1, 'the two producers share the day\'s one Unfiled section')
  assert.equal(unfiled[0].stopKey, '__unfiled:2026-07-01')
  assert.equal(unfiled[0].dayLabel, 'Jul 1')
  assert.equal(unfiled[0].timeLabel, '10–2') // spanWords band across first→last
  assert.equal(unfiled[0].entries.length, 2)
})

test('TRUE RESIDUE: only genuinely undateable photos stay at the bottom — "Unfiled"/"In transit", empty eyebrow, after every day', () => {
  const t = looseDaysTrip()
  const entries = flattenPhotoEntries([
    photoMem({ id: 'inDay', tripId: 't', stopId: 'd1', refs: ['u://d'], capturedAt: '2026-07-01T15:00:00.000Z' }),
    // capturedAt outside every trip day → nothing honest to anchor to.
    photoMem({ id: 'scan', tripId: 't', stopId: null, refs: ['u://s'], capturedAt: '2027-03-01T12:00:00.000Z' }),
    // Dead brackets AND no capturedAt: falls back to createdAt (2026-05-24,
    // outside the trip) → the in-transit residue, keyed WITHOUT a day.
    photoMem({
      id: 'mystery',
      tripId: 't',
      stopId: null,
      refs: ['u://m'],
      interstitial: { before: 'gone-a', after: 'gone-b' },
    }),
  ])
  const groups = groupByStop(entries, t)
  const residueUnfiled = groups.find((g) => g.stopKey === '__unassigned')
  const residueTransit = groups.find((g) => g.stopKey === '__interstitial:start__end')
  assert.ok(residueUnfiled && residueTransit, 'both residue buckets exist')
  assert.equal(residueUnfiled.stopName, 'Unfiled')
  assert.equal(residueTransit.stopName, 'In transit')
  for (const g of [residueUnfiled, residueTransit]) {
    assert.equal(g.dayLabel, '') // honest empty eyebrow — no fake day
    assert.equal(g.timeLabel, '')
  }
  // Residue renders after every real-day section.
  assert.equal(groups[0].stopName, 'Beach day')
  assert.ok(
    groups.indexOf(residueUnfiled) > 0 && groups.indexOf(residueTransit) > 0,
    'residue never outranks a day section'
  )
})

test('DETERMINISTIC ORDER: two same-day loose sections sort chronologically by their first entry, whichever kind comes first', () => {
  const t = looseDaysTrip()
  const at = (iso) => iso
  const mk = ({ transitAt, unfiledAt }) =>
    groupByStop(
      flattenPhotoEntries([
        photoMem({
          id: 'it',
          tripId: 't',
          stopId: null,
          refs: ['u://it'],
          capturedAt: at(transitAt),
          interstitial: { before: null, after: null },
        }),
        photoMem({ id: 'uf', tripId: 't', stopId: 'ghost-stop', refs: ['u://uf'], capturedAt: at(unfiledAt) }),
      ]),
      t
    ).map((g) => g.stopName)
  // In-transit at 10 AM NY, Unfiled at 2 PM NY → transit first…
  assert.deepEqual(
    mk({ transitAt: '2026-07-01T14:00:00.000Z', unfiledAt: '2026-07-01T18:00:00.000Z' }),
    ['In transit', 'Unfiled']
  )
  // …and the mirror-image times flip the order: chronology, not section kind.
  assert.deepEqual(
    mk({ transitAt: '2026-07-01T18:00:00.000Z', unfiledAt: '2026-07-01T14:00:00.000Z' }),
    ['Unfiled', 'In transit']
  )
})

test('G5 PIN: a both-brackets-resolve interstitial keeps today\'s exact key, label, eyebrow, and slot', () => {
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
    photoMem({
      id: 'mid',
      tripId: 't',
      stopId: null,
      refs: ['u://mid'],
      capturedAt: '2026-04-20T16:00:00.000Z',
      interstitial: { before: 'mccomb', after: 'terrell' },
    }),
  ])
  const [g] = groupByStop(entries, t)
  // Byte-identical to the pre-healing render: the legacy (un-day-scoped) key,
  // the same phrasing, the bounding day's eyebrow, no time band.
  assert.equal(g.stopKey, '__interstitial:mccomb__terrell')
  assert.equal(g.stopName, 'From McComb to Terrell')
  assert.equal(g.dayLabel, 'Apr 20')
  assert.equal(g.timeLabel, '')
  assert.equal(g._dayN, 1)
  assert.equal(g._stopOrder, 0.5)
})

test('groupAcrossTrips inherits the healed day-anchored section (AllPhotosView needs no separate fix)', () => {
  const t = looseDaysTrip()
  const sections = groupAcrossTrips([
    {
      trip: t,
      memories: [
        photoMem({
          id: 'orphan',
          tripId: 't',
          stopId: null,
          refs: ['u://o'],
          capturedAt: '2026-07-02T18:00:00.000Z',
          interstitial: { before: 'gone-a', after: 'gone-b' },
        }),
      ],
    },
  ])
  const names = sections[0].stops.map((s) => s.stopName)
  assert.deepEqual(names, ['In transit'])
  assert.equal(sections[0].stops[0].stopKey, '__interstitial:2026-07-02:start__end')
  assert.equal(sections[0].stops[0].timeLabel, 'around 2')
})

// ── Cross-zone composite: the day's OWN leg zone judges membership ─────────
// The reviewer-executed counterexample (C1): Tokyo leg Jul 1–3 (Asia/Tokyo,
// UTC+9) → Honolulu leg Jul 4–8 (Pacific/Honolulu, UTC−10). A half-mirror that
// picks a provisional leg from the DEVICE's calendar files the same photo
// differently on a Tokyo phone vs a New-York phone, and compares Tokyo wall
// minutes against Honolulu-authored stop times (19h frame skew). The fix:
// each day is judged in the zone of the leg that OWNS it — the exact
// membership test the evidence engine runs — so placement is identical on
// every device. This test must pass under the full runner-TZ matrix
// (TZ=UTC / America/New_York / Pacific/Auckland).
function crossZoneTrip() {
  return {
    id: 't',
    title: 'Pacific hop',
    dateRangeStart: '2026-07-01',
    dateRangeEnd: '2026-07-08',
    parts: [
      { id: 'leg-tokyo', type: 'city', title: 'Tokyo', tz: 'Asia/Tokyo', dateStart: '2026-07-01', dateEnd: '2026-07-03' },
      { id: 'leg-hnl', type: 'city', title: 'Honolulu', tz: 'Pacific/Honolulu', dateStart: '2026-07-04', dateEnd: '2026-07-08' },
    ],
    days: [
      // Tokyo days — no clock-timed stops (loose), so a Tokyo orphan takes
      // the chronological fallback in TOKYO hours.
      { n: 2, date: 'Jul 2', isoDate: '2026-07-02', title: '', stops: [{ id: 'tk-walk', name: 'Shrine walk', time: 'Morning' }] },
      { n: 3, date: 'Jul 3', isoDate: '2026-07-03', title: '', stops: [] },
      // Honolulu day — a clock stop AUTHORED IN HONOLULU WALL TIME.
      { n: 4, date: 'Jul 4', isoDate: '2026-07-04', title: '', stops: [{ id: 'luau', name: 'Luau', time: '6:00 PM' }] },
    ],
  }
}

test('CROSS-ZONE PIN (C1): each day claims a photo in its OWN leg zone — identical on every device, agreeing with photosForDay', () => {
  const t = crossZoneTrip()
  const mems = [
    // Inside Tokyo's Jul 2 (12:00 Tokyo wall). GPS so photosForDay engages.
    photoMem({
      id: 'tokyo-noon',
      tripId: 't',
      stopId: null,
      refs: [{ url: 'u://tk', lat: 35.68, lng: 139.69 }],
      capturedAt: '2026-07-02T03:00:00.000Z',
      interstitial: { before: 'gone-a', after: 'gone-b' },
    }),
    // THE SEAM: 10:00 Jul 4 in Tokyo, but 15:00 Jul 3 in Honolulu — Tokyo's
    // calendar has left its leg, Honolulu's hasn't reached this date yet.
    // NEITHER day's own zone claims it (the westward dateline gap): honestly
    // unattributable → residue, never a per-device coin flip.
    photoMem({
      id: 'seam',
      tripId: 't',
      stopId: null,
      refs: [{ url: 'u://seam', lat: 25.0, lng: -170.0 }],
      capturedAt: '2026-07-04T01:00:00.000Z',
      interstitial: { before: 'gone-a', after: 'gone-b' },
    }),
    // Properly inside Honolulu's Jul 4 (02:00 Honolulu wall) → re-brackets
    // against the Luau in HONOLULU minutes (2:00 AM < 6:00 PM → "Before").
    photoMem({
      id: 'hnl-night',
      tripId: 't',
      stopId: null,
      refs: [{ url: 'u://hnl', lat: 21.3, lng: -157.85 }],
      capturedAt: '2026-07-04T12:00:00.000Z',
      interstitial: { before: 'gone-a', after: 'gone-b' },
    }),
  ]
  const groups = groupByStop(flattenPhotoEntries(mems), t)
  // Same three sections in the same slots on EVERY device (runner-TZ matrix):
  // Tokyo's orphan in Tokyo's Jul 2 (Tokyo hours), the Honolulu photo
  // re-bracketed before the Luau, and the seam photo in the honest residue.
  assert.deepEqual(
    groups.map((g) => [g.stopKey, g.stopName]),
    [
      ['__interstitial:2026-07-02:start__end', 'In transit'],
      ['__interstitial:start__luau', 'Before Luau'],
      ['__interstitial:start__end', 'In transit'],
    ]
  )
  const byKey = Object.fromEntries(groups.map((g) => [g.stopKey, g]))
  // Band in TOKYO hours (12:00 wall), not the device's or the other leg's.
  assert.equal(byKey['__interstitial:2026-07-02:start__end'].timeLabel, 'around 12')
  assert.equal(byKey['__interstitial:2026-07-02:start__end'].entries[0].memoryId, 'tokyo-noon')
  assert.equal(byKey['__interstitial:start__luau'].entries[0].memoryId, 'hnl-night')
  assert.equal(byKey['__interstitial:start__end'].entries[0].memoryId, 'seam')
  assert.equal(byKey['__interstitial:start__end'].dayLabel, '')

  // Album ↔ evidence agreement: photosForDay with each day's OWN leg zone
  // (deriveCurrentLeg hands the settle card exactly these zones) attributes
  // the same instants to the same days — including refusing the seam photo
  // for BOTH days, which is the album's residue.
  const ids = (isoDate, tz) => photosForDay(mems, isoDate, { tz }).map((p) => p.memoryId)
  assert.deepEqual(ids('2026-07-02', 'Asia/Tokyo'), ['tokyo-noon'])
  assert.deepEqual(ids('2026-07-04', 'Pacific/Honolulu'), ['hnl-night'])
  assert.equal(ids('2026-07-03', 'Asia/Tokyo').includes('seam'), false)
  assert.equal(ids('2026-07-04', 'Pacific/Honolulu').includes('seam'), false)
})

test('KEEP SIDE of the deviation rule: a surviving one-sided bracket on a clock-less day (photo agrees on the day) keeps its stop-named render', () => {
  // The counterpart to the "re-brackets by the CURRENT plan" test: when the
  // photo's own day AGREES with the surviving bracket's day and that day has
  // no true clock stops, the live stop NAME is kept — "After Sunset Point"
  // says more than a bare "In transit" band ever could.
  const t = trip({
    id: 't',
    title: 'T',
    dateRangeStart: '2026-04-20',
    tz: 'UTC',
    days: [
      {
        n: 1,
        date: 'Apr 20',
        isoDate: '2026-04-20',
        // Loose times only — nothing to re-bracket against.
        stops: [
          { id: 'first', name: 'First Stop', time: 'Morning' },
          { id: 'last', name: 'Sunset Point', time: 'Evening' },
        ],
      },
    ],
  })
  const entries = flattenPhotoEntries([
    // before=null / after=alive → keeps "Before First Stop", slotted ahead.
    photoMem({
      id: 'pre',
      tripId: 't',
      stopId: null,
      refs: ['u://pre'],
      capturedAt: '2026-04-20T06:00:00.000Z',
      interstitial: { before: null, after: 'first' },
    }),
    // before=alive / after=null → keeps "After Sunset Point", slotted after.
    photoMem({
      id: 'post',
      tripId: 't',
      stopId: null,
      refs: ['u://post'],
      capturedAt: '2026-04-20T22:00:00.000Z',
      interstitial: { before: 'last', after: null },
    }),
  ])
  const groups = groupByStop(entries, t)
  assert.deepEqual(
    groups.map((g) => [g.stopKey, g.stopName]),
    [
      ['__interstitial:start__first', 'Before First Stop'],
      ['__interstitial:last__end', 'After Sunset Point'],
    ]
  )
  // Kept renders carry the day eyebrow and NO time band (they are
  // stop-named sections, not chronological fallbacks).
  for (const g of groups) {
    assert.equal(g.dayLabel, 'Apr 20')
    assert.equal(g.timeLabel, '')
  }
})

test('flattenPhotoEntries surfaces the ref sound outcome; unknown/legacy values become null', () => {
  const entries = flattenPhotoEntries([
    photoMem({ id: 'lost', tripId: 't', stopId: 's', refs: [{ url: 'u://l', kind: 'video', mime: 'video/mp4', sound: 'lost' }] }),
    photoMem({ id: 'silent', tripId: 't', stopId: 's', refs: [{ url: 'u://n', kind: 'video', mime: 'video/mp4', sound: 'none' }] }),
    photoMem({ id: 'ok', tripId: 't', stopId: 's', refs: [{ url: 'u://c', kind: 'video', mime: 'video/mp4', sound: 'carried' }] }),
    photoMem({ id: 'legacy', tripId: 't', stopId: 's', refs: [{ url: 'u://x', kind: 'video', mime: 'video/mp4' }] }),
    photoMem({ id: 'garbage', tripId: 't', stopId: 's', refs: [{ url: 'u://g', kind: 'video', mime: 'video/mp4', sound: 'yes???' }] }),
  ])
  const byMem = Object.fromEntries(entries.map((e) => [e.memoryId, e.sound]))
  assert.equal(byMem.lost, 'lost')
  assert.equal(byMem.silent, 'none')
  assert.equal(byMem.ok, 'carried')
  assert.equal(byMem.legacy, null) // unknown is unknown — never a guessed tag
  assert.equal(byMem.garbage, null)
})
