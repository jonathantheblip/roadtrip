import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

// ── Pure masking logic (DOM-free) ────────────────────────────────────────────
import {
  maskForViewer,
  isMaskedFrom,
  isSurprise,
  coverStandIn,
  authoredSurprises,
  teasersMaskedFrom,
  surprisesMaskedFrom,
  displayName,
  revealLabel,
  formatRevealDate,
  pendingArrivalSurprises,
  unseenRevealsForViewer,
  revealedForViewer,
  coverToStop,
  mergeCoverStops,
  isTripSurprise,
  isTripMaskedFrom,
  maskTripsForViewer,
  tripSurprisesKeptBy,
} from '../../src/lib/surprises.js'

const SECRET_TITLE = 'FAO Schwarz — the giant floor piano'
const SECRET_DETAIL = 'Secret detour Saturday before the show.'

function teaser(over = {}) {
  return {
    id: 'sp_teaser',
    tripId: 'trip1',
    authorTraveler: 'aurelia',
    visibility: 'shared',
    kind: 'text',
    hideFrom: ['jonathan'],
    reveal: { type: 'date', at: 'June 15' },
    conceal: 'teaser',
    surprise: { what: 'A photo', icon: '🖼️', title: SECRET_TITLE, detail: SECRET_DETAIL, tint: '#5C4A52' },
    createdAt: '2026-06-01T00:00:00.000Z',
    ...over,
  }
}

function cover(over = {}) {
  return {
    id: 'sp_cover',
    tripId: 'trip1',
    authorTraveler: 'jonathan',
    visibility: 'shared',
    kind: 'text',
    hideFrom: ['rafa', 'aurelia'],
    reveal: { type: 'arrival', at: '5th Avenue' },
    conceal: 'cover',
    cover: { icon: '🚶', title: 'A walk down Fifth Avenue', loc: '5th Avenue', time: 'Sat · 1:00 PM', weather: 'Cold & windy', packing: 'Warm coats' },
    surprise: { what: 'A stop', icon: '🎹', title: SECRET_TITLE, detail: SECRET_DETAIL, tint: '#C24B2E' },
    createdAt: '2026-06-01T00:00:00.000Z',
    ...over,
  }
}

const plain = { id: 'm1', tripId: 'trip1', authorTraveler: 'helen', visibility: 'shared', kind: 'text', text: 'a normal note', createdAt: '2026-06-01T00:00:00.000Z' }

// ── The contract ─────────────────────────────────────────────────────────────

test('teaser is ABSENT from the recipient read — title never leaks', () => {
  const recipient = maskForViewer([plain, teaser()], 'jonathan')
  assert.equal(recipient.length, 1)
  assert.equal(recipient[0].id, 'm1')
  // The load-bearing assertion: the secret is nowhere in what the recipient gets.
  assert.ok(!JSON.stringify(recipient).includes(SECRET_TITLE))
  assert.ok(!JSON.stringify(recipient).includes(SECRET_DETAIL))
})

test('cover is SUBSTITUTED for the recipient — cover fields present, real title never', () => {
  const recipient = maskForViewer([cover()], 'rafa')
  assert.equal(recipient.length, 1)
  const r = recipient[0]
  assert.equal(r.isCover, true)
  assert.equal(r.cover.weather, 'Cold & windy') // the real constraint carried forward
  assert.equal(r.cover.title, 'A walk down Fifth Avenue')
  // The secret real title/detail must never appear, anywhere in the substituted row.
  assert.ok(!JSON.stringify(r).includes(SECRET_TITLE))
  assert.ok(!JSON.stringify(r).includes(SECRET_DETAIL))
})

test('author always sees their own surprise in full', () => {
  const asAuthor = maskForViewer([cover()], 'jonathan')
  assert.equal(asAuthor.length, 1)
  assert.equal(asAuthor[0].surprise.title, SECRET_TITLE)
  assert.ok(!asAuthor[0].isCover)
})

test('a non-targeted third party sees the real row', () => {
  // cover() hides from rafa+aurelia; Helen is neither author nor hidden-from.
  const asHelen = maskForViewer([cover()], 'helen')
  assert.equal(asHelen.length, 1)
  assert.equal(asHelen[0].surprise.title, SECRET_TITLE)
})

test('revealed → everyone sees the real row', () => {
  const revealedTeaser = teaser({ revealed: '2026-06-02T00:00:00.000Z' })
  const asRecipient = maskForViewer([revealedTeaser], 'jonathan')
  assert.equal(asRecipient.length, 1)
  assert.equal(asRecipient[0].surprise.title, SECRET_TITLE)
})

test("hideFrom:['everyone'] hides from every non-author", () => {
  const everyoneTeaser = teaser({ authorTraveler: 'helen', hideFrom: ['everyone'] })
  assert.equal(maskForViewer([everyoneTeaser], 'jonathan').length, 0)
  assert.equal(maskForViewer([everyoneTeaser], 'rafa').length, 0)
  assert.equal(maskForViewer([everyoneTeaser], 'helen').length, 1) // author
})

test('non-surprise memories pass through untouched (no regression to normal reads)', () => {
  const out = maskForViewer([plain], 'rafa')
  assert.deepEqual(out, [plain])
  assert.equal(isSurprise(plain), false)
})

test('predicates + classification reads', () => {
  const recs = [plain, teaser(), cover()]
  assert.equal(isMaskedFrom(teaser(), 'jonathan'), true)
  assert.equal(isMaskedFrom(teaser(), 'aurelia'), false) // author
  // authoredSurprises
  assert.deepEqual(authoredSurprises(recs, 'jonathan').map((s) => s.id), ['sp_cover'])
  assert.deepEqual(authoredSurprises(recs, 'aurelia').map((s) => s.id), ['sp_teaser'])
  // surprisesMaskedFrom rafa = the cover only; teasersMaskedFrom rafa = none (cover excluded)
  assert.deepEqual(surprisesMaskedFrom(recs, 'rafa').map((s) => s.id), ['sp_cover'])
  assert.deepEqual(teasersMaskedFrom(recs, 'rafa').map((s) => s.id), [])
  // teaser is hidden from jonathan and surfaces as a teaser card
  assert.deepEqual(teasersMaskedFrom(recs, 'jonathan').map((s) => s.id), ['sp_teaser'])
})

test('cover stand-in carries only the cover, never the real fields', () => {
  const stand = coverStandIn(cover())
  assert.equal(stand.id, 'sp_cover') // structural identity preserved
  assert.equal(stand.cover.packing, 'Warm coats')
  assert.equal(stand.surprise, undefined)
  assert.equal(stand.text, 'A walk down Fifth Avenue')
})

test('displayName + revealLabel', () => {
  assert.equal(displayName('jonathan', 'rafa'), 'Papa')
  assert.equal(displayName('helen', 'aurelia'), 'Mom')
  assert.equal(displayName('aurelia', 'jonathan'), 'Aurelia')
  assert.equal(displayName('everyone', 'rafa'), 'everyone')
  assert.equal(displayName('rafa', 'rafa'), 'you')
  assert.equal(revealLabel({ type: 'arrival', at: '5th Avenue' }), 'when you arrive at 5th Avenue')
  assert.equal(revealLabel({ type: 'date', at: 'June 15' }), 'on June 15')
  // Copy fix (2026-06-13): manual reveal no longer reads "when they choose to"
  // (it's the author who reveals); recipient/default view → "when the moment's right".
  assert.equal(revealLabel({ type: 'manual' }), "when the moment's right")
  assert.equal(revealLabel({ type: 'manual' }, true), 'until you reveal it')
})

// ── Slice 2: reveal targets, geofence, cue ──────────────────────────────────

test('formatRevealDate: ISO → "Month D"; passes non-ISO through', () => {
  assert.equal(formatRevealDate('2026-06-15'), 'June 15')
  assert.equal(formatRevealDate('2026-12-01'), 'December 1')
  assert.equal(formatRevealDate('June 15'), 'June 15') // already friendly
  assert.equal(formatRevealDate(''), 'a date')
})

test('revealLabel: arrival uses the place label; date formats ISO', () => {
  assert.equal(revealLabel({ type: 'arrival', at: 's1', label: 'The Met' }), 'when you arrive at The Met')
  assert.equal(revealLabel({ type: 'date', at: '2026-06-15' }), 'on June 15')
})

test('pendingArrivalSurprises: authored, unrevealed, arrival-typed, with coords', () => {
  const recs = [
    { id: 'a', authorTraveler: 'jonathan', hideFrom: ['rafa'], reveal: { type: 'arrival', at: 's1', lat: 41.5, lng: -72 } },
    { id: 'b', authorTraveler: 'jonathan', hideFrom: ['rafa'], reveal: { type: 'arrival', at: 's2' } }, // no coords → excluded
    { id: 'c', authorTraveler: 'jonathan', hideFrom: ['rafa'], reveal: { type: 'date', at: '2026-06-15' } }, // not arrival
    { id: 'd', authorTraveler: 'helen', hideFrom: ['rafa'], reveal: { type: 'arrival', at: 's3', lat: 1, lng: 2 } }, // not authored by viewer
    { id: 'e', authorTraveler: 'jonathan', hideFrom: ['rafa'], revealed: 'x', reveal: { type: 'arrival', at: 's4', lat: 1, lng: 2 } }, // already revealed
  ]
  assert.deepEqual(pendingArrivalSurprises(recs, 'jonathan').map((s) => s.id), ['a'])
})

test('coverToStop: maps a cover stand-in to an itinerary stop shape', () => {
  const m = { id: 'sp9', isCover: true, cover: { title: 'A walk down Fifth Avenue', loc: '5th Ave', time: 'Sat · 1 PM', weather: 'Cold', packing: 'Coats', dayIso: '2026-05-22' } }
  const stop = coverToStop(m)
  assert.equal(stop.id, 'cover_sp9')
  assert.equal(stop.name, 'A walk down Fifth Avenue')
  assert.equal(stop.time, 'Sat · 1 PM')
  assert.equal(stop.note, 'Cold · Coats') // weather + packing surfaced as the stop note
  assert.equal(stop._cover, true)
})

test('mergeCoverStops: injects cover stops into the matching day; no-op otherwise', () => {
  const trip = {
    id: 't', days: [
      { isoDate: '2026-05-22', stops: [{ id: 's1', name: 'Real stop' }] },
      { isoDate: '2026-05-23', stops: [] },
    ],
  }
  const covers = [
    { id: 'c1', isCover: true, cover: { title: 'Cover stop', dayIso: '2026-05-22' } },
    { id: 'c2', isCover: true, cover: { title: 'No day cover' } }, // no dayIso → not placed
    { id: 'm1', kind: 'text', text: 'a normal memory' }, // not a cover
  ]
  const merged = mergeCoverStops(trip, covers)
  assert.equal(merged.days[0].stops.length, 2) // real + cover
  assert.equal(merged.days[0].stops[1].id, 'cover_c1')
  assert.equal(merged.days[1].stops.length, 0) // untouched
  // No covers / no trip → referential no-op.
  assert.equal(mergeCoverStops(trip, []), trip)
  assert.equal(mergeCoverStops(trip, [{ id: 'x', kind: 'text' }]), trip)
  assert.equal(mergeCoverStops(null, covers), null)
})

test('mergeCoverStops: positions a cover by time, keeping real stops in order', () => {
  const trip = {
    id: 't', days: [
      { isoDate: '2026-05-22', stops: [
        { id: 'r1', name: 'Breakfast', time: '8:00 AM' },
        { id: 'r2', name: 'Dinner', time: 'evening' },
      ] },
    ],
  }
  const covers = [
    { id: 'cv', isCover: true, cover: { title: 'Surprise lunch', time: '1 PM', dayIso: '2026-05-22' } },
  ]
  const stops = mergeCoverStops(trip, covers).days[0].stops
  // '1 PM' (hour, no minutes) sorts after 8 AM and before 'evening'; reals keep order.
  assert.deepEqual(stops.map((s) => s.id), ['r1', 'cover_cv', 'r2'])
})

// ── Slice 3b: whole-trip masking ────────────────────────────────────────────

const SECRET_TRIP = {
  id: 'trip-secret',
  title: 'Disney World surprise!',
  dateRange: 'Aug 1 – 5',
  dateRangeStart: '2026-08-01',
  dateRangeEnd: '2026-08-05',
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
  days: [{ isoDate: '2026-08-01', title: 'Magic Kingdom', stops: [{ id: 's', name: 'Cinderella Castle' }] }],
  surprise: { author: 'jonathan', hideFrom: ['rafa', 'aurelia'], reveal: { type: 'manual' }, conceal: 'cover', cover: { title: 'Visiting Grandma', loc: "Grandma's house" } },
}
const PLAIN_TRIP = { id: 'trip-plain', title: 'Beach weekend', dateRangeStart: '2026-07-01', days: [] }

test('trip masking: predicates', () => {
  assert.equal(isTripSurprise(SECRET_TRIP), true)
  assert.equal(isTripSurprise(PLAIN_TRIP), false)
  assert.equal(isTripMaskedFrom(SECRET_TRIP, 'rafa'), true)
  assert.equal(isTripMaskedFrom(SECRET_TRIP, 'jonathan'), false) // author
  assert.equal(isTripMaskedFrom(SECRET_TRIP, 'helen'), false) // not targeted
})

test('trip masking: a recipient gets the COVER stand-in — real title/itinerary NEVER', () => {
  const forRafa = maskTripsForViewer([PLAIN_TRIP, SECRET_TRIP], 'rafa')
  assert.equal(forRafa.length, 2)
  const stand = forRafa.find((t) => t.id === 'trip-secret')
  assert.equal(stand.title, 'Visiting Grandma') // the cover
  assert.equal(stand.dateRangeStart, '2026-08-01') // real dates kept so they don't double-book
  assert.deepEqual(stand.days, []) // no real itinerary
  assert.equal(stand.masked, true)
  // The load-bearing assertion: nothing secret leaks into the recipient's trip.
  assert.ok(!JSON.stringify(stand).includes('Disney'))
  assert.ok(!JSON.stringify(stand).includes('Cinderella'))
  assert.ok(!JSON.stringify(stand).includes('Magic Kingdom'))
})

test('trip masking: author + revealed + non-targeted see the real trip', () => {
  assert.equal(maskTripsForViewer([SECRET_TRIP], 'jonathan')[0].title, 'Disney World surprise!') // author
  assert.equal(maskTripsForViewer([SECRET_TRIP], 'helen')[0].title, 'Disney World surprise!') // not targeted
  const revealed = { ...SECRET_TRIP, surprise: { ...SECRET_TRIP.surprise, revealed: 'x' } }
  assert.equal(maskTripsForViewer([revealed], 'rafa')[0].title, 'Disney World surprise!') // revealed
})

test('trip masking: a teaser trip substitutes a wrapped-trip card (dates kept)', () => {
  const teaserTrip = { ...SECRET_TRIP, surprise: { author: 'jonathan', hideFrom: ['everyone'], reveal: { type: 'manual' }, conceal: 'teaser' } }
  const stand = maskTripsForViewer([teaserTrip], 'rafa')[0]
  assert.equal(stand.title, '🎁 A surprise trip')
  assert.equal(stand.dateRangeStart, '2026-08-01')
  assert.ok(!JSON.stringify(stand).includes('Disney'))
})

test('trip masking: tripSurprisesKeptBy returns the author\'s whole-trip surprises', () => {
  assert.deepEqual(tripSurprisesKeptBy([PLAIN_TRIP, SECRET_TRIP], 'jonathan').map((t) => t.id), ['trip-secret'])
  assert.deepEqual(tripSurprisesKeptBy([PLAIN_TRIP, SECRET_TRIP], 'rafa'), [])
})

test('reveal cue: unseen reveals for the viewer; revealedForViewer ignores seen', () => {
  const recs = [
    { id: 'r1', authorTraveler: 'jonathan', hideFrom: ['rafa'], revealed: 'x' }, // revealed to rafa
    { id: 'r2', authorTraveler: 'jonathan', hideFrom: ['everyone'], revealed: 'y' }, // revealed to everyone
    { id: 'r3', authorTraveler: 'jonathan', hideFrom: ['rafa'] }, // not revealed
    { id: 'r4', authorTraveler: 'rafa', hideFrom: ['helen'], revealed: 'z' }, // rafa authored → not "for rafa"
  ]
  assert.deepEqual(revealedForViewer(recs, 'rafa').map((s) => s.id), ['r1', 'r2'])
  assert.deepEqual(unseenRevealsForViewer(recs, 'rafa', []).map((s) => s.id), ['r1', 'r2'])
  assert.deepEqual(unseenRevealsForViewer(recs, 'rafa', ['r1']).map((s) => s.id), ['r2'])
  assert.deepEqual(revealedForViewer(recs, 'helen').map((s) => s.id), ['r2', 'r4'])
})

// ── Integration through the real store ───────────────────────────────────────

class MemStorage {
  constructor() { this.map = new Map() }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null }
  setItem(k, v) { this.map.set(k, String(v)) }
  removeItem(k) { this.map.delete(k) }
  clear() { this.map.clear() }
}
globalThis.localStorage = new MemStorage()

const { saveMemory, listMemoriesForTrip, listTripSurpriseRecords, revealSurprise } = await import('../../src/lib/memoryStore.js')

beforeEach(() => { globalThis.localStorage.clear() })

test('store: a teaser saved by Jonathan is absent from Rafa, present for Jonathan, until revealed', () => {
  saveMemory({
    id: 'sx1', tripId: 'tA', stopId: null, authorTraveler: 'jonathan', visibility: 'shared',
    hideFrom: ['rafa'], reveal: { type: 'manual' }, conceal: 'teaser',
    surprise: { what: 'A memory', icon: '🧁', title: SECRET_TITLE, detail: SECRET_DETAIL, tint: '#7A5A3A' },
  })
  // Rafa: gone. And no leak in the serialized read.
  const rafaRead = listMemoriesForTrip('tA', 'rafa')
  assert.equal(rafaRead.find((m) => m.id === 'sx1'), undefined)
  assert.ok(!JSON.stringify(rafaRead).includes(SECRET_TITLE))
  // Jonathan (author): present, in full.
  const jonRead = listMemoriesForTrip('tA', 'jonathan')
  assert.equal(jonRead.find((m) => m.id === 'sx1')?.surprise.title, SECRET_TITLE)
  // Reveal → Rafa now sees it.
  revealSurprise('sx1')
  const rafaAfter = listMemoriesForTrip('tA', 'rafa')
  assert.equal(rafaAfter.find((m) => m.id === 'sx1')?.surprise.title, SECRET_TITLE)
})

test('store: a cover saved by Jonathan substitutes for Rafa (cover only), never the secret', () => {
  saveMemory({
    id: 'sx2', tripId: 'tA', stopId: null, authorTraveler: 'jonathan', visibility: 'shared',
    hideFrom: ['rafa', 'aurelia'], reveal: { type: 'arrival', at: '5th Avenue' }, conceal: 'cover',
    cover: { icon: '🚶', title: 'A walk down Fifth Avenue', loc: '5th Avenue', time: 'Sat · 1:00 PM', weather: 'Cold & windy', packing: 'Warm coats' },
    surprise: { what: 'A stop', icon: '🎹', title: SECRET_TITLE, detail: SECRET_DETAIL, tint: '#C24B2E' },
  })
  const rafaRead = listMemoriesForTrip('tA', 'rafa')
  const sub = rafaRead.find((m) => m.id === 'sx2')
  assert.ok(sub, 'cover stand-in present for recipient')
  assert.equal(sub.isCover, true)
  assert.equal(sub.cover.weather, 'Cold & windy')
  assert.ok(!JSON.stringify(rafaRead).includes(SECRET_TITLE))
  assert.ok(!JSON.stringify(rafaRead).includes(SECRET_DETAIL))
})

test('store: editing a surprise\'s caption preserves its masking (no silent un-hide)', () => {
  saveMemory({
    id: 'sx3', tripId: 'tA', stopId: null, authorTraveler: 'jonathan', visibility: 'shared',
    hideFrom: ['rafa'], conceal: 'teaser',
    surprise: { what: 'A memory', icon: '🧁', title: SECRET_TITLE, detail: '', tint: '#7A5A3A' },
  })
  // A later content-only patch (no masking params at all).
  saveMemory({ id: 'sx3', tripId: 'tA', stopId: null, authorTraveler: 'jonathan', visibility: 'shared', caption: 'tweaked' })
  // Still hidden from Rafa.
  assert.equal(listMemoriesForTrip('tA', 'rafa').find((m) => m.id === 'sx3'), undefined)
  // Still a surprise record.
  assert.equal(listTripSurpriseRecords('tA').length, 1)
})

test('store: listTripSurpriseRecords returns only surprises, raw (unmasked)', () => {
  saveMemory({ id: 'n1', tripId: 'tA', stopId: null, authorTraveler: 'helen', visibility: 'shared', kind: 'text', text: 'note' })
  saveMemory({ id: 's1', tripId: 'tA', stopId: null, authorTraveler: 'helen', visibility: 'shared', hideFrom: ['everyone'], conceal: 'teaser', surprise: { what: 'A photo', icon: '🎁', title: SECRET_TITLE, detail: '', tint: '#444' } })
  const recs = listTripSurpriseRecords('tA')
  assert.equal(recs.length, 1)
  assert.equal(recs[0].id, 's1')
})
