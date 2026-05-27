// Unit tests for applyCardToTrip — the pure function that maps a
// confirmation-card payload (post user edits) to a next-trip snapshot.
// Pure: no I/O, no React, no globals beyond a faked crypto.randomUUID
// for stable add-stop IDs. The e2e suite covers the same shapes against
// a live render; this spec pins the data math on its own so a card-shape
// regression surfaces here first, before exercising the full surface.

import test from 'node:test'
import assert from 'node:assert/strict'

import { applyCardToTrip } from '../../src/lib/claudeCardApply.js'

// A fixture trip with the same shape as the production seed: id, days
// array with .n + .stops. Keep it minimal — three days, one stop each —
// so the diff in each test stays readable.
function fixtureTrip() {
  return {
    id: 'volleyball-2026',
    title: 'Fun @ the Sun',
    days: [
      {
        n: 1,
        date: 'Fri May 22',
        stops: [{ id: 'vb1-3', time: 'Evening', name: 'Beach Bungalow', kind: 'lodging' }],
      },
      {
        n: 2,
        date: 'Sat May 23',
        stops: [{ id: 'vb2-3', time: '3:45 PM', name: 'vs BEV 13 Empire', kind: 'tournament', address: 'Court 1, Mohegan Sun' }],
      },
      {
        n: 3,
        date: 'Sun May 24',
        stops: [{ id: 'vb3-4', time: '4:00 PM', name: 'Match 1 vs Northeast 13.2', kind: 'tournament' }],
      },
    ],
  }
}

test('applyCardToTrip — add appends a new stop to the named day', () => {
  const trip = fixtureTrip()
  const card = {
    action: 'add',
    id: 'c-add-sift',
    title: 'Sift Bake Shop',
    fields: [
      { name: 'time', value: '8:00 AM' },
      { name: 'address', value: '5 Water St, Mystic CT' },
      { name: 'kind', value: 'breakfast' },
    ],
    target: { tripId: 'volleyball-2026', dayN: 3, position: 'end' },
  }
  const next = applyCardToTrip(trip, card)
  const day3 = next.days.find((d) => d.n === 3)
  assert.equal(day3.stops.length, 2, 'day 3 gains one stop')
  const added = day3.stops[1]
  assert.equal(added.name, 'Sift Bake Shop')
  assert.equal(added.time, '8:00 AM')
  assert.equal(added.address, '5 Water St, Mystic CT')
  assert.equal(added.kind, 'breakfast', 'kind is lowercased canonical')
  assert.equal(added.source, 'claude', 'claude-authored marker for the album/audit')
  assert.equal(added.claudeMeta.cardId, 'c-add-sift', 'cardId stamp persists for re-load detection')
  // Original trip untouched (purity).
  assert.equal(trip.days.find((d) => d.n === 3).stops.length, 1)
})

test('applyCardToTrip — add throws when target.dayN is not on the trip', () => {
  const trip = fixtureTrip()
  const card = {
    action: 'add',
    id: 'c-bad-day',
    title: 'Nowhere stop',
    fields: [{ name: 'time', value: '9:00 AM' }],
    target: { tripId: 'volleyball-2026', dayN: 99 },
  }
  assert.throws(() => applyCardToTrip(trip, card), /day 99 not found/)
})

test('applyCardToTrip — move updates the targeted stop in place', () => {
  const trip = fixtureTrip()
  const card = {
    action: 'move',
    id: 'c-move-sat',
    title: 'Reschedule Saturday match',
    fields: [
      { name: 'time', value: '11:00 AM', previousValue: '3:45 PM' },
      { name: 'address', value: 'Court 3, Mohegan Sun', previousValue: 'Court 1, Mohegan Sun' },
    ],
    target: { tripId: 'volleyball-2026', stopId: 'vb2-3', dayN: 2 },
  }
  const next = applyCardToTrip(trip, card)
  const day2 = next.days.find((d) => d.n === 2)
  const moved = day2.stops.find((s) => s.id === 'vb2-3')
  assert.equal(moved.time, '11:00 AM')
  assert.equal(moved.address, 'Court 3, Mohegan Sun')
  assert.equal(moved.name, 'vs BEV 13 Empire', 'unmodified fields stay intact')
  assert.equal(moved.claudeMeta.cardId, 'c-move-sat')
  // The match is still on day 2 (no cross-day move requested).
  assert.equal(day2.stops.length, 1)
})

test('applyCardToTrip — move relocates across days when target.dayN differs', () => {
  const trip = fixtureTrip()
  const card = {
    action: 'move',
    id: 'c-relocate',
    title: 'Move Sunday match to Saturday',
    fields: [{ name: 'time', value: '5:00 PM', previousValue: '4:00 PM' }],
    target: { tripId: 'volleyball-2026', stopId: 'vb3-4', dayN: 2 },
  }
  const next = applyCardToTrip(trip, card)
  const day2 = next.days.find((d) => d.n === 2)
  const day3 = next.days.find((d) => d.n === 3)
  assert.equal(day3.stops.length, 0, 'stop removed from old day')
  assert.equal(day2.stops.length, 2, 'stop appended to new day')
  const moved = day2.stops.find((s) => s.id === 'vb3-4')
  assert.equal(moved.time, '5:00 PM')
})

test('applyCardToTrip — move throws when stopId is missing or unknown', () => {
  const trip = fixtureTrip()
  assert.throws(
    () => applyCardToTrip(trip, { action: 'move', target: {} }),
    /target\.stopId required/
  )
  assert.throws(
    () => applyCardToTrip(trip, { action: 'move', target: { stopId: 'ghost' } }),
    /stop ghost not found/
  )
})

test('applyCardToTrip — cancel removes the stop from its day', () => {
  const trip = fixtureTrip()
  const card = {
    action: 'cancel',
    id: 'c-cancel-sun',
    title: 'Remove Sunday match',
    target: { tripId: 'volleyball-2026', stopId: 'vb3-4' },
  }
  const next = applyCardToTrip(trip, card)
  const day3 = next.days.find((d) => d.n === 3)
  assert.equal(day3.stops.length, 0)
  // Other days untouched.
  assert.equal(next.days.find((d) => d.n === 2).stops.length, 1)
})

test('applyCardToTrip — multi applies each non-skipped sub-edit', () => {
  const trip = fixtureTrip()
  const card = {
    action: 'multi',
    id: 'c-multi-weekend',
    edits: [
      {
        action: 'move',
        title: 'Saturday match earlier',
        target: { tripId: 'volleyball-2026', stopId: 'vb2-3' },
        fields: [{ name: 'time', value: '10:00 AM', previousValue: '3:45 PM' }],
      },
      {
        action: 'cancel',
        title: 'Sunday match',
        target: { tripId: 'volleyball-2026', stopId: 'vb3-4' },
      },
    ],
    target: { tripId: 'volleyball-2026' },
  }
  const next = applyCardToTrip(trip, card)
  assert.equal(next.days.find((d) => d.n === 2).stops.find((s) => s.id === 'vb2-3').time, '10:00 AM')
  assert.equal(next.days.find((d) => d.n === 3).stops.length, 0)
})

test('applyCardToTrip — multi honors `skipped: true` on a sub-edit', () => {
  const trip = fixtureTrip()
  const card = {
    action: 'multi',
    id: 'c-multi-skip',
    edits: [
      {
        action: 'move',
        title: 'Saturday earlier',
        target: { tripId: 'volleyball-2026', stopId: 'vb2-3' },
        fields: [{ name: 'time', value: '10:00 AM' }],
      },
      {
        action: 'cancel',
        title: 'Sunday match (skipped)',
        target: { tripId: 'volleyball-2026', stopId: 'vb3-4' },
        skipped: true,
      },
    ],
  }
  const next = applyCardToTrip(trip, card)
  assert.equal(next.days.find((d) => d.n === 2).stops.find((s) => s.id === 'vb2-3').time, '10:00 AM')
  assert.equal(
    next.days.find((d) => d.n === 3).stops.length,
    1,
    'skipped cancel did not run'
  )
})

test('applyCardToTrip — unknown action throws', () => {
  const trip = fixtureTrip()
  assert.throws(
    () => applyCardToTrip(trip, { action: 'mutate-everything', target: {} }),
    /unknown action/
  )
})

test('applyCardToTrip — works against trip.data.days shape (D1 row format)', () => {
  // The Worker returns trips with a nested `data.days` shape;
  // applyCardToTrip must handle both seed-shape (root .days) and
  // D1-shape (.data.days).
  const trip = {
    id: 'volleyball-2026',
    data: fixtureTrip(),
  }
  const card = {
    action: 'cancel',
    id: 'c-cancel-d1',
    target: { tripId: 'volleyball-2026', stopId: 'vb1-3' },
  }
  const next = applyCardToTrip(trip, card)
  assert.ok(next.data, 'data branch preserved')
  assert.equal(next.data.days.find((d) => d.n === 1).stops.length, 0)
})
