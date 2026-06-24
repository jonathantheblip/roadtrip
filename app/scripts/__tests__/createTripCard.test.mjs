// Tests for the create_trip card → trip record mapping. Pure logic:
// traveler name→id, slug id, category→kind, date formatting, and the
// full card→trip shape with skip handling.

import { test } from 'node:test'
import assert from 'node:assert/strict'

const {
  travelerNameToId,
  travelerIdsFrom,
  tripIdFromTitle,
  uniqueTripId,
  categoryToKind,
  humanDayLabel,
  humanDateRange,
  sanitizePartSurprise,
  cardToTrip,
} = await import('../../src/lib/createTripCard.js')

// ─── travelerNameToId / travelerIdsFrom ───────────────────────────

test('travelerNameToId maps display names to ids', () => {
  assert.equal(travelerNameToId('Helen'), 'helen')
  assert.equal(travelerNameToId('JONATHAN'), 'jonathan')
  assert.equal(travelerNameToId('  Aurelia  '), 'aurelia')
})

test('travelerNameToId drops unknown names', () => {
  assert.equal(travelerNameToId('Grandma'), null)
  assert.equal(travelerNameToId(42), null)
})

test('travelerIdsFrom maps a list, dropping unknowns', () => {
  assert.deepEqual(travelerIdsFrom(['Helen', 'Aurelia', 'Grandma']), ['helen', 'aurelia'])
})

test('travelerIdsFrom falls back to full family on empty/invalid', () => {
  assert.deepEqual(travelerIdsFrom([]), ['jonathan', 'helen', 'aurelia', 'rafa'])
  assert.deepEqual(travelerIdsFrom(['Nobody']), ['jonathan', 'helen', 'aurelia', 'rafa'])
  assert.deepEqual(travelerIdsFrom(null), ['jonathan', 'helen', 'aurelia', 'rafa'])
})

// ─── tripIdFromTitle ───────────────────────────────────────────────

test('tripIdFromTitle slugs title + year-month', () => {
  assert.equal(
    tripIdFromTitle('Asheville Long Weekend', '2026-10-09'),
    'asheville-long-weekend-2026-10'
  )
})

test('tripIdFromTitle strips punctuation and collapses spaces', () => {
  assert.equal(
    tripIdFromTitle("Rafa's 6th Birthday!!!", '2026-12-01'),
    'rafa-s-6th-birthday-2026-12'
  )
})

test('tripIdFromTitle handles missing date', () => {
  assert.equal(tripIdFromTitle('Weekend Trip', null), 'weekend-trip')
})

test('tripIdFromTitle is deterministic for same title + month (idempotent re-save)', () => {
  assert.equal(
    tripIdFromTitle('Asheville Long Weekend', '2026-10-09'),
    tripIdFromTitle('Asheville Long Weekend', '2026-10-12')
  )
})

test('tripIdFromTitle handles empty title', () => {
  assert.equal(tripIdFromTitle('', '2026-10-09'), 'untitled-trip-2026-10')
})

// ─── uniqueTripId (slug-collision guard) ────────────────────────────

test('uniqueTripId returns the base id when nothing collides', () => {
  assert.equal(uniqueTripId('asheville-2026-10', []), 'asheville-2026-10')
  assert.equal(uniqueTripId('asheville-2026-10', ['other-2026-10']), 'asheville-2026-10')
})

test('uniqueTripId suffixes when the base id is already taken', () => {
  assert.equal(
    uniqueTripId('asheville-2026-10', ['asheville-2026-10']),
    'asheville-2026-10-2'
  )
})

test('uniqueTripId walks the suffix until it finds a free id', () => {
  assert.equal(
    uniqueTripId('asheville-2026-10', ['asheville-2026-10', 'asheville-2026-10-2']),
    'asheville-2026-10-3'
  )
})

test('uniqueTripId accepts a Set as well as an array', () => {
  const taken = new Set(['asheville-2026-10'])
  assert.equal(uniqueTripId('asheville-2026-10', taken), 'asheville-2026-10-2')
})

test('uniqueTripId treats a re-save of the same trip as NOT a collision', () => {
  // selfId === baseId: refining the same trip keeps its id (idempotent re-save).
  assert.equal(
    uniqueTripId('asheville-2026-10', ['asheville-2026-10'], { selfId: 'asheville-2026-10' }),
    'asheville-2026-10'
  )
})

// ─── categoryToKind ─────────────────────────────────────────────────

test('categoryToKind lowercases known categories', () => {
  assert.equal(categoryToKind('LODGING'), 'lodging')
  assert.equal(categoryToKind('ACTIVITY'), 'activity')
  assert.equal(categoryToKind('FOOD'), 'food')
})

test('categoryToKind defaults to activity for missing', () => {
  assert.equal(categoryToKind(undefined), 'activity')
  assert.equal(categoryToKind(''), 'activity')
})

// ─── date formatting ────────────────────────────────────────────────

test('humanDayLabel formats an ISO date as "Fri Oct 9"', () => {
  assert.equal(humanDayLabel('2026-10-09'), 'Fri Oct 9')
})

test('humanDayLabel returns empty for invalid input', () => {
  assert.equal(humanDayLabel('not-a-date'), '')
  assert.equal(humanDayLabel(null), '')
})

test('humanDateRange formats same-month range', () => {
  assert.equal(humanDateRange('2026-10-09', '2026-10-12'), 'October 9 – 12, 2026')
})

test('humanDateRange formats cross-month range', () => {
  assert.equal(humanDateRange('2026-10-30', '2026-11-02'), 'October 30 – November 2, 2026')
})

test('humanDateRange handles single date', () => {
  assert.equal(humanDateRange('2026-10-09', null), 'October 9, 2026')
})

test('humanDateRange returns TBD for invalid start', () => {
  assert.equal(humanDateRange(null, '2026-10-12'), 'TBD')
})

// ─── cardToTrip (full shape) ────────────────────────────────────────

const SAMPLE_CARD = {
  type: 'create_trip',
  trip: {
    title: 'Asheville Long Weekend',
    subtitle: 'Art, mountains, and good food',
    startCity: 'Belmont, MA',
    endCity: 'Belmont, MA',
    dateRangeStart: '2026-10-09',
    dateRangeEnd: '2026-10-12',
    travelers: ['Jonathan', 'Helen', 'Aurelia', 'Rafa'],
    days: [
      {
        dayNumber: 1,
        title: 'Friday — Settle In',
        date: '2026-10-09',
        stops: [
          {
            id: 'ash-1-1',
            time: '2:00 PM',
            name: 'Check in at The Foundry Hotel',
            address: '51 S Market St, Asheville, NC 28801',
            category: 'LODGING',
            description: 'Boutique hotel in a converted warehouse.',
            who: ['Jonathan', 'Helen', 'Aurelia', 'Rafa'],
            driveFromPrevious: null,
          },
          {
            id: 'ash-1-2',
            time: '4:00 PM',
            name: 'River Arts District',
            address: 'Riverview Station, Asheville, NC',
            category: 'ACTIVITY',
            description: 'Open studios along the French Broad.',
            who: ['Helen', 'Aurelia'],
            driveFromPrevious: '8 min',
          },
        ],
      },
    ],
  },
}

test('cardToTrip produces a renderer-safe trip record', () => {
  const trip = cardToTrip(SAMPLE_CARD)
  assert.equal(trip.id, 'asheville-long-weekend-2026-10')
  assert.equal(trip.draft, false)
  assert.equal(trip.status, 'planning')
  assert.equal(trip.title, 'Asheville Long Weekend')
  assert.equal(trip.subtitle, 'Art, mountains, and good food')
  assert.equal(trip.dateRange, 'October 9 – 12, 2026')
  assert.deepEqual(trip.travelers, ['jonathan', 'helen', 'aurelia', 'rafa'])
  assert.equal(trip.days.length, 1)
})

test('cardToTrip maps day + stop fields to canonical shape', () => {
  const trip = cardToTrip(SAMPLE_CARD)
  const day = trip.days[0]
  assert.equal(day.n, 1)
  assert.equal(day.isoDate, '2026-10-09')
  assert.equal(day.date, 'Fri Oct 9')
  assert.equal(day.title, 'Friday — Settle In')
  assert.equal(day.stops.length, 2)
  const lodging = day.stops[0]
  assert.equal(lodging.id, 'ash-1-1')
  assert.equal(lodging.kind, 'lodging')
  assert.equal(lodging.note, 'Boutique hotel in a converted warehouse.')
  assert.deepEqual(lodging.for, ['jonathan', 'helen', 'aurelia', 'rafa'])
  assert.equal(lodging.driveFromPrevious, null)
  const arts = day.stops[1]
  assert.deepEqual(arts.for, ['helen', 'aurelia'])
  assert.equal(arts.driveFromPrevious, '8 min')
})

test('cardToTrip excludes skipped stops', () => {
  const card = structuredClone(SAMPLE_CARD)
  card.trip.days[0].stops[1].skipped = true
  const trip = cardToTrip(card)
  assert.equal(trip.days[0].stops.length, 1)
  assert.equal(trip.days[0].stops[0].id, 'ash-1-1')
})

test('cardToTrip drops days left empty after skipping all stops', () => {
  const card = structuredClone(SAMPLE_CARD)
  card.trip.days[0].stops.forEach((s) => (s.skipped = true))
  const trip = cardToTrip(card)
  assert.equal(trip.days.length, 0)
})

test('cardToTrip reuses existingId when provided (refinement re-save)', () => {
  const trip = cardToTrip(SAMPLE_CARD, { existingId: 'asheville-long-weekend-2026-10' })
  assert.equal(trip.id, 'asheville-long-weekend-2026-10')
})

test('cardToTrip synthesizes stop ids when the card omits them', () => {
  const card = structuredClone(SAMPLE_CARD)
  delete card.trip.days[0].stops[0].id
  const trip = cardToTrip(card)
  assert.ok(trip.days[0].stops[0].id, 'should have a generated id')
  assert.match(trip.days[0].stops[0].id, /asheville-long-weekend-2026-10-1-1/)
})

test('cardToTrip tolerates an empty / missing trip block', () => {
  const trip = cardToTrip({ type: 'create_trip' })
  assert.equal(trip.title, 'Untitled trip')
  assert.deepEqual(trip.travelers, ['jonathan', 'helen', 'aurelia', 'rafa'])
  assert.equal(trip.days.length, 0)
})

// ─── cardToTrip slug-collision (existingIds) ────────────────────────

test('cardToTrip keeps the derived id when it does not collide', () => {
  const trip = cardToTrip(SAMPLE_CARD, { existingIds: ['some-other-trip-2026-01'] })
  assert.equal(trip.id, 'asheville-long-weekend-2026-10')
})

test('cardToTrip uniquifies a NEW trip whose id collides with a different trip', () => {
  // A second trip with the same title in the same month would otherwise reuse
  // 'asheville-long-weekend-2026-10' and silently overwrite the first. With the
  // existing id passed in, the new trip gets a unique suffix instead.
  const trip = cardToTrip(SAMPLE_CARD, { existingIds: ['asheville-long-weekend-2026-10'] })
  assert.equal(trip.id, 'asheville-long-weekend-2026-10-2')
})

test('cardToTrip refinement (existingId) is NOT uniquified even if the id is "taken"', () => {
  // A refine re-save passes existingId; it must keep its own id so it re-saves
  // the same row rather than forking a -2 duplicate.
  const trip = cardToTrip(SAMPLE_CARD, {
    existingId: 'asheville-long-weekend-2026-10',
    existingIds: ['asheville-long-weekend-2026-10'],
  })
  assert.equal(trip.id, 'asheville-long-weekend-2026-10')
})


// ─── composite parts (the "bigger trip") ────────────────────────────
test('cardToTrip carries an emitted parts[] (composite trip), validated + id-stamped', () => {
  const card = {
    type: 'create_trip',
    trip: {
      ...SAMPLE_CARD.trip,
      title: 'Italy, summer',
      parts: [
        { type: 'flight', title: 'Fly Boston → Rome', dateStart: '2026-07-01' },
        { type: 'city', title: '3 nights in Rome', place: 'Rome', dateStart: '2026-07-01', dateEnd: '2026-07-04' },
        { type: 'bogus', title: 'A villa' }, // unknown type → defaults to 'stay'
      ],
    },
  }
  const trip = cardToTrip(card)
  assert.equal(trip.parts.length, 3)
  assert.equal(trip.parts[0].type, 'flight')
  assert.equal(trip.parts[1].type, 'city')
  assert.equal(trip.parts[2].type, 'stay') // unknown 'bogus' validated down to 'stay'
  assert.ok(trip.parts[0].id, 'each part gets a stable id')
})

test('cardToTrip omits parts for a simple trip (no parts field at all)', () => {
  const trip = cardToTrip(SAMPLE_CARD)
  assert.equal('parts' in trip, false) // a one-place trip stays parts-less; getParts derives one
})

// ── "Surprises by sentence" Slice 2 — cardToTrip carries a SAFE, author-stamped surprise ──
test('sanitizePartSurprise: author from session (never Claude), hideFrom validated, teaser default', () => {
  const s = sanitizePartSurprise({ hideFrom: ['Helen'], conceal: 'cover', cover: { title: 'Quiet coast', loc: 'Amalfi' } }, 'jonathan')
  assert.equal(s.author, 'jonathan') // stamped from the session arg, not the payload
  assert.deepEqual(s.hideFrom, ['helen'])
  assert.equal(s.conceal, 'cover')
  assert.equal(s.cover.title, 'Quiet coast')
})
test('sanitizePartSurprise: no trustworthy author ⇒ NO surprise (fail-safe)', () => {
  assert.equal(sanitizePartSurprise({ hideFrom: ['Helen'] }, null), null)
  assert.equal(sanitizePartSurprise({ hideFrom: ['Helen'] }, 'nobody'), null)
})
test('sanitizePartSurprise: an author can never be hidden from their own surprise', () => {
  assert.equal(sanitizePartSurprise({ hideFrom: ['Jonathan'] }, 'jonathan'), null) // self-only → no audience
  const s = sanitizePartSurprise({ hideFrom: ['Jonathan', 'Helen'] }, 'jonathan')
  assert.deepEqual(s.hideFrom, ['helen']) // self dropped
})
test('sanitizePartSurprise: unknown names dropped; "everyone" kept; empty audience ⇒ null', () => {
  assert.deepEqual(sanitizePartSurprise({ hideFrom: ['everyone'] }, 'jonathan').hideFrom, ['everyone'])
  assert.equal(sanitizePartSurprise({ hideFrom: ['Nobody', 'ghost'] }, 'jonathan'), null)
  assert.equal(sanitizePartSurprise({ conceal: 'cover' }, 'jonathan'), null) // no hideFrom
})
test('cardToTrip: a suggested part surprise rides on the saved part, author-stamped from the session', () => {
  const card = {
    type: 'create_trip',
    trip: {
      title: 'Italy', dateRangeStart: '2026-08-01', dateRangeEnd: '2026-08-07', travelers: ['Jonathan', 'Helen'],
      days: [],
      parts: [
        { type: 'city', title: 'Rome', dateStart: '2026-08-01', dateEnd: '2026-08-03' },
        { type: 'stay', title: 'Secret villa', place: 'Positano', dateStart: '2026-08-04', dateEnd: '2026-08-06', surprise: { hideFrom: ['Helen'], conceal: 'teaser', author: 'helen' /* spoof attempt */ } },
      ],
    },
  }
  const trip = cardToTrip(card, { authorTraveler: 'jonathan' })
  assert.equal(trip.parts.length, 2)
  assert.equal(trip.parts[0].surprise, undefined) // Rome isn't a surprise
  assert.equal(trip.parts[1].surprise.author, 'jonathan') // session wins over the spoofed payload author
  assert.deepEqual(trip.parts[1].surprise.hideFrom, ['helen'])
  assert.equal(trip.parts[1].surprise.conceal, 'teaser')
})
