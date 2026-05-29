// Unit tests for the Calendar Pull client helpers + their round-trip
// through the existing stop-add path (applyCardToTrip). Run via
// `node --test`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'

const {
  decodeCalendarPayload,
  isoDateOf,
  formatEventTime,
  formatEventWhen,
  dayNForDate,
  eventsToMultiCard,
} = await import('../../src/lib/calendarImport.js')
const { applyCardToTrip } = await import('../../src/lib/claudeCardApply.js')

const b64 = (obj) => Buffer.from(JSON.stringify(obj), 'utf8').toString('base64')

const TRIP = {
  id: 'asheville-2026',
  title: 'Asheville',
  dateRangeStart: '2026-10-09',
  dateRangeEnd: '2026-10-11',
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
  days: [
    { n: 1, isoDate: '2026-10-09', title: 'Arrive', stops: [] },
    { n: 2, isoDate: '2026-10-10', title: 'Mountains', stops: [] },
    { n: 3, isoDate: '2026-10-11', title: 'Home', stops: [] },
  ],
}

// ── decode ─────────────────────────────────────────────────────────

test('decodeCalendarPayload round-trips a UTF-8 JSON payload', () => {
  const payload = { matched: true, tripId: 'asheville-2026', events: [{ title: 'Cúrate' }] }
  const out = decodeCalendarPayload(b64(payload))
  assert.deepEqual(out, payload)
})

test('decodeCalendarPayload tolerates URL-safe base64 and junk', () => {
  const urlSafe = b64({ a: 1 }).replace(/\+/g, '-').replace(/\//g, '_')
  assert.deepEqual(decodeCalendarPayload(urlSafe), { a: 1 })
  assert.equal(decodeCalendarPayload('@@@@@@'), null)
  assert.equal(decodeCalendarPayload(''), null)
  assert.equal(decodeCalendarPayload(null), null)
})

test('decodeCalendarPayload restores + from the space URLSearchParams produces', () => {
  // The Shortcut emits STANDARD base64 (with +); dropped into ?data=
  // unencoded, URLSearchParams.get turns each + into a space. Build a
  // payload whose base64 definitely contains a '+' (emoji bytes reliably
  // encode to one), simulate the mangling, and confirm it round-trips.
  let payload
  let standard = ''
  for (let i = 1; i <= 50 && !standard.includes('+'); i++) {
    payload = { matched: true, tripId: 'asheville-2026', note: '😀'.repeat(i) }
    standard = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')
  }
  assert.ok(standard.includes('+'), 'precondition: produced a base64 containing +')
  const mangled = standard.replace(/\+/g, ' ') // what the browser hands back
  assert.deepEqual(decodeCalendarPayload(mangled), payload)
})

test('decodeCalendarPayload handles URL-safe base64 with stripped padding', () => {
  const payload = { a: 'b', n: 5, s: 'café' }
  const std = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')
  const urlSafeNoPad = std.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  assert.deepEqual(decodeCalendarPayload(urlSafeNoPad), payload)
})

// ── time / date formatting ─────────────────────────────────────────

test('formatEventTime reads the wall clock; treats midnight + no-time as all-day', () => {
  assert.equal(formatEventTime('2026-10-10T19:00:00'), '7:00 PM')
  assert.equal(formatEventTime('2026-10-10T09:30:00'), '9:30 AM')
  assert.equal(formatEventTime('2026-10-10T00:15:00'), '12:15 AM') // 12:15 AM is a real time
  assert.equal(formatEventTime('2026-10-10T12:00:00'), '12:00 PM')
  assert.equal(formatEventTime('2026-07-04T00:00:00'), '') // midnight → all-day, not "12:00 AM"
  assert.equal(formatEventTime('2026-10-11'), '') // date only → all-day
})

test('formatEventWhen composes date + time, or "all day" for midnight/date-only', () => {
  assert.equal(formatEventWhen({ start: '2026-10-10T19:00:00' }), 'Oct 10 · 7:00 PM')
  assert.equal(formatEventWhen({ start: '2026-10-11' }), 'Oct 11 · all day')
  assert.equal(formatEventWhen({ start: '2026-07-04T00:00:00' }), 'Jul 4 · all day')
})

test('isoDateOf slices the date', () => {
  assert.equal(isoDateOf('2026-10-10T19:00:00'), '2026-10-10')
  assert.equal(isoDateOf('2026-10-10'), '2026-10-10')
  assert.equal(isoDateOf(null), '')
})

// ── day matching ───────────────────────────────────────────────────

test('dayNForDate matches exact isoDate, else closest, else day 1', () => {
  assert.equal(dayNForDate(TRIP, '2026-10-10'), 2)
  assert.equal(dayNForDate(TRIP, '2026-10-09'), 1)
  // A day just outside the authored range snaps to the closest day.
  assert.equal(dayNForDate(TRIP, '2026-10-12'), 3)
  assert.equal(dayNForDate({ days: [] }, '2026-10-10'), 1)
})

// ── events → stops via the existing add path ───────────────────────

test('eventsToMultiCard + applyCardToTrip creates stops on the right days with time/address/coords', () => {
  const events = [
    { title: 'Dinner at Cúrate', start: '2026-10-10T19:00:00', end: '2026-10-10T21:00:00', location: 'Cúrate, Asheville', address: '13 Biltmore Ave, Asheville, NC', lat: 35.5951, lng: -82.5515 },
    { title: 'Biltmore Estate', start: '2026-10-09T10:00:00', end: '2026-10-09T13:00:00', location: 'Biltmore', address: '1 Lodge St, Asheville, NC', lat: 35.5401, lng: -82.5515 },
  ]
  const card = eventsToMultiCard(TRIP, events)
  const next = applyCardToTrip(TRIP, card)

  const d1 = next.days.find((d) => d.n === 1)
  const d2 = next.days.find((d) => d.n === 2)
  assert.equal(d2.stops.length, 1)
  assert.equal(d1.stops.length, 1)

  const dinner = d2.stops[0]
  assert.equal(dinner.name, 'Dinner at Cúrate')
  assert.equal(dinner.time, '7:00 PM')
  assert.equal(dinner.address, '13 Biltmore Ave, Asheville, NC')
  assert.equal(dinner.lat, 35.5951)
  assert.equal(dinner.lng, -82.5515)
  // who defaults to the full family, editable afterward.
  assert.deepEqual(dinner.for, ['jonathan', 'helen', 'aurelia', 'rafa'])

  const biltmore = d1.stops[0]
  assert.equal(biltmore.time, '10:00 AM')
  assert.equal(biltmore.lat, 35.5401)
})

test('an all-day event becomes a stop with no clock time', () => {
  const card = eventsToMultiCard(TRIP, [
    { title: 'Family vacation', start: '2026-10-09T00:00:00', end: '2026-10-12T00:00:00', location: 'Asheville', address: 'Asheville, NC', lat: 35.5951, lng: -82.5515 },
  ])
  const next = applyCardToTrip(TRIP, card)
  const stop = next.days.find((d) => d.n === 1).stops[0]
  assert.equal(stop.name, 'Family vacation')
  assert.equal(stop.time, '') // all-day → no "12:00 AM"
})

test('an event with no coords yields a stop with null lat/lng (not 0,0)', () => {
  const card = eventsToMultiCard(TRIP, [
    { title: 'Mystery', start: '2026-10-10T12:00:00', location: 'Somewhere', address: 'Somewhere' },
  ])
  const next = applyCardToTrip(TRIP, card)
  const stop = next.days.find((d) => d.n === 2).stops[0]
  assert.equal(stop.lat, null)
  assert.equal(stop.lng, null)
})
