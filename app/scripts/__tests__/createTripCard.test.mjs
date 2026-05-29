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

