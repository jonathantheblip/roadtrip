// Tests for the create_trip card → trip record mapping. Pure logic:
// traveler name→id, slug id, category→kind, date formatting, and the
// full card→trip shape with skip handling.

import { test } from 'node:test'
import assert from 'node:assert/strict'

const {
  travelerNameToId,
  travelerIdsFrom,
  tripIdFromTitle,
  categoryToKind,
  humanDayLabel,
  humanDateRange,
  cardToTrip,
  enumerateDays,
  deriveCalendarTripTitle,
  scaffoldTripFromCalendar,
} = await import('../../src/lib/createTripCard.js')
const { eventsToMultiCard } = await import('../../src/lib/calendarImport.js')
const { applyCardToTrip } = await import('../../src/lib/claudeCardApply.js')

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

// ─── Feature A: enumerateDays ───────────────────────────────────────

test('enumerateDays lists each inclusive day in the window', () => {
  assert.deepEqual(enumerateDays('2026-10-09', '2026-10-12'), [
    '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12',
  ])
})

test('enumerateDays crosses a month boundary correctly (UTC-stepped)', () => {
  assert.deepEqual(enumerateDays('2026-10-30', '2026-11-02'), [
    '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02',
  ])
})

test('enumerateDays tolerates datetime strings and slices to the day', () => {
  assert.deepEqual(enumerateDays('2026-10-09T09:00:00', '2026-10-10T23:00:00'), [
    '2026-10-09', '2026-10-10',
  ])
})

test('enumerateDays: missing/invalid end → just the start day; end<start → start', () => {
  assert.deepEqual(enumerateDays('2026-10-09', null), ['2026-10-09'])
  assert.deepEqual(enumerateDays('2026-10-09', 'nope'), ['2026-10-09'])
  assert.deepEqual(enumerateDays('2026-10-09', '2026-10-05'), ['2026-10-09'])
  assert.deepEqual(enumerateDays(null, '2026-10-12'), [])
})

test('enumerateDays caps a runaway window at 60 days', () => {
  const days = enumerateDays('2026-01-01', '2027-01-01') // ~366 days
  assert.equal(days.length, 60)
  assert.equal(days[0], '2026-01-01')
})

// ─── Feature A: deriveCalendarTripTitle ─────────────────────────────

test('deriveCalendarTripTitle uses the most-common city + month/year', () => {
  const events = [
    { address: '288 Fore St, Portland, ME 04101, USA' },
    { address: '7 Congress Sq, Portland, ME 04101, USA' },
    { address: '12 Captain Strout Cir, Cape Elizabeth, ME, USA' },
  ]
  assert.equal(
    deriveCalendarTripTitle(events, { start: '2026-10-09', end: '2026-10-12' }),
    'Portland · October 2026'
  )
})

test('deriveCalendarTripTitle falls back to "Trip · Month Year" with no usable city', () => {
  const events = [{ location: 'Fore Street' }, { location: 'PMA' }] // single-segment → no city
  assert.equal(
    deriveCalendarTripTitle(events, { start: '2026-10-09', end: '2026-10-12' }),
    'Trip · October 2026'
  )
})

test('deriveCalendarTripTitle handles a 2-part address (no state/country)', () => {
  assert.equal(
    deriveCalendarTripTitle([{ address: 'Cúrate, Asheville' }], { start: '2026-10-09' }),
    'Asheville · October 2026'
  )
})

test('deriveCalendarTripTitle degrades to "Trip" when there is no date at all', () => {
  assert.equal(deriveCalendarTripTitle([], {}), 'Trip')
})

// ─── Feature A: scaffoldTripFromCalendar ────────────────────────────

const PORTLAND_PULL = {
  dateRange: { start: '2026-10-09', end: '2026-10-11' },
  events: [
    { title: 'Dinner at Fore Street', start: '2026-10-10T19:00:00', end: '2026-10-10T21:00:00', location: 'Fore Street', address: '288 Fore St, Portland, ME', lat: 43.6571, lng: -70.2495 },
    { title: 'Portland Head Light', start: '2026-10-09T16:00:00', end: '2026-10-09T17:00:00', location: 'Head Light', address: '12 Captain Strout Cir, Cape Elizabeth, ME', lat: 43.6231, lng: -70.2079 },
  ],
}

test('scaffoldTripFromCalendar builds a renderer-safe trip spanning the window', () => {
  const trip = scaffoldTripFromCalendar(PORTLAND_PULL)
  assert.equal(trip.draft, false)
  assert.equal(trip.status, 'planning')
  assert.equal(trip.source, 'calendar')
  assert.equal(trip.title, 'Portland · October 2026')
  assert.equal(trip.dateRange, 'October 9 – 11, 2026')
  assert.equal(trip.dateRangeStart, '2026-10-09')
  assert.equal(trip.dateRangeEnd, '2026-10-11')
  assert.deepEqual(trip.travelers, ['jonathan', 'helen', 'aurelia', 'rafa'])
  // EVERY day present (empty stops) — unlike cardToTrip, scaffolds keep
  // empty days so the events have somewhere to land on confirm.
  assert.equal(trip.days.length, 3)
  assert.deepEqual(trip.days.map((d) => d.isoDate), ['2026-10-09', '2026-10-10', '2026-10-11'])
  assert.deepEqual(trip.days.map((d) => d.n), [1, 2, 3])
  assert.equal(trip.days[0].date, 'Fri Oct 9')
  assert.ok(trip.days.every((d) => Array.isArray(d.stops) && d.stops.length === 0))
})

test('scaffoldTripFromCalendar id is deterministic (idempotent re-pull)', () => {
  const a = scaffoldTripFromCalendar(PORTLAND_PULL)
  const b = scaffoldTripFromCalendar(PORTLAND_PULL)
  assert.equal(a.id, b.id)
  assert.ok(a.id.startsWith('portland-october-2026'))
})

test('scaffoldTripFromCalendar honors an explicit title override', () => {
  const trip = scaffoldTripFromCalendar({ ...PORTLAND_PULL, title: 'Leaf Peeping' })
  assert.equal(trip.title, 'Leaf Peeping')
  assert.ok(trip.id.startsWith('leaf-peeping'))
})

test('scaffolded trip + eventsToMultiCard + applyCardToTrip lands stops on the right days', () => {
  // The create+confirm integration: scaffold a trip, then push the pulled
  // events through the SAME stop-add path the matched flow uses.
  const trip = scaffoldTripFromCalendar(PORTLAND_PULL)
  const card = eventsToMultiCard(trip, PORTLAND_PULL.events)
  const next = applyCardToTrip(trip, card)

  const d1 = next.days.find((d) => d.n === 1) // Oct 9
  const d2 = next.days.find((d) => d.n === 2) // Oct 10
  assert.equal(d2.stops.length, 1)
  assert.equal(d1.stops.length, 1)

  const dinner = d2.stops[0]
  assert.equal(dinner.name, 'Dinner at Fore Street')
  assert.equal(dinner.time, '7:00 PM')
  assert.equal(dinner.address, '288 Fore St, Portland, ME')
  assert.equal(dinner.lat, 43.6571)
  assert.deepEqual(dinner.for, ['jonathan', 'helen', 'aurelia', 'rafa'])

  const lighthouse = d1.stops[0]
  assert.equal(lighthouse.name, 'Portland Head Light')
  assert.equal(lighthouse.time, '4:00 PM')
})

test('scaffoldTripFromCalendar tolerates an empty events list (dates-only trip)', () => {
  const trip = scaffoldTripFromCalendar({ dateRange: { start: '2026-10-09', end: '2026-10-10' }, events: [] })
  assert.equal(trip.title, 'Trip · October 2026')
  assert.equal(trip.days.length, 2)
  assert.ok(trip.days.every((d) => d.stops.length === 0))
})
