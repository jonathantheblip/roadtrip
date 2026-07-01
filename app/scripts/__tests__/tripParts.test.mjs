import { test } from 'node:test'
import assert from 'node:assert/strict'

const { getParts, deriveTripShape, partCount, hasExplicitParts, partsWithDays, PART_TYPES, currentPart, nextTimedStop, clockMinutes, currentPartCoords, isCompositeTrip, partPlaceLabel, partCoords, deriveCurrentLeg, legStatus } =
  await import('../../src/lib/tripParts.js')

function legacyStay() {
  return {
    id: 'cabin1',
    shape: 'stay', // explicit so inferTripShape is deterministic in the test
    title: 'A weekend at the cabin',
    dateRangeStart: '2026-07-03',
    dateRangeEnd: '2026-07-06',
    days: [{ isoDate: '2026-07-03', title: 'Arrive', stops: [] }],
  }
}
function legacyRoute() {
  return {
    id: 'drive1',
    shape: 'route',
    title: 'The big drive',
    dateRangeStart: '2026-04-17',
    dateRangeEnd: '2026-04-24',
    days: [{ isoDate: '2026-04-17', title: 'Day 1', stops: [] }],
  }
}
function composite() {
  return {
    id: 'italy1',
    title: 'Italy, summer',
    parts: [
      { id: 'p1', type: 'flight', title: 'Fly Boston → Rome', dateStart: '2026-07-01' },
      { id: 'p2', type: 'city', title: 'Three nights in Rome', dateStart: '2026-07-01', dateEnd: '2026-07-04' },
      { id: 'p3', type: 'stay', title: 'A Tuscan villa', dateStart: '2026-07-04', dateEnd: '2026-07-11' },
    ],
  }
}

test('a legacy stay derives to ONE part wrapping the whole trip (non-breaking)', () => {
  const parts = getParts(legacyStay())
  assert.equal(parts.length, 1)
  assert.equal(parts[0].type, 'stay')
  assert.equal(parts[0].derived, true)
  assert.equal(parts[0].dateStart, '2026-07-03')
  assert.equal(parts[0].dateEnd, '2026-07-06')
  assert.equal(parts[0].days.length, 1) // the legacy days live inside the one part
})

test('a legacy route derives to one DRIVE part', () => {
  const parts = getParts(legacyRoute())
  assert.equal(parts.length, 1)
  assert.equal(parts[0].type, 'drive')
  assert.equal(parts[0].derived, true)
})

test('an explicit composite returns its real parts, untouched', () => {
  const t = composite()
  const parts = getParts(t)
  assert.equal(parts.length, 3)
  assert.equal(parts[0].type, 'flight')
  assert.equal(parts[2].type, 'stay')
  assert.equal(parts[0].derived, undefined) // real, not a synthetic wrapper
})

test('deriveTripShape: legacy → its shape; composite → bigger; single explicit part → its type', () => {
  assert.equal(deriveTripShape(legacyStay()), 'stay')
  assert.equal(deriveTripShape(legacyRoute()), 'route')
  assert.equal(deriveTripShape(composite()), 'bigger')
  assert.equal(deriveTripShape({ id: 'x', parts: [{ id: 'a', type: 'city' }] }), 'city')
})

test('an explicit trip.shape always wins', () => {
  assert.equal(deriveTripShape({ id: 'x', shape: 'route', parts: composite().parts }), 'route')
})

test('partCount: 0 for legacy, N for a composite', () => {
  assert.equal(partCount(legacyStay()), 0)
  assert.equal(partCount(composite()), 3)
})

test('hasExplicitParts + PART_TYPES', () => {
  assert.equal(hasExplicitParts(legacyStay()), false)
  assert.equal(hasExplicitParts(composite()), true)
  assert.ok(PART_TYPES.includes('stay') && PART_TYPES.includes('flight') && PART_TYPES.includes('cruise'))
})

test('never throws on null / garbage', () => {
  assert.deepEqual(getParts(null), [])
  assert.deepEqual(getParts(undefined), [])
  assert.equal(deriveTripShape(null), 'route')
  assert.equal(partCount(null), 0)
  assert.equal(hasExplicitParts(null), false)
})

// ── partsWithDays (real timed days, derived) ───────────────────────────────

test('partsWithDays: a legacy trip is untouched — one part holding all its days', () => {
  const t = legacyStay() // days: one day 2026-07-03
  const wd = partsWithDays(t)
  assert.equal(wd.length, 1)
  assert.equal(wd[0].derived, true)
  assert.equal(wd[0].days.length, 1)
  assert.equal(wd[0].days[0].isoDate, '2026-07-03')
  assert.equal(wd[0].dayCount, 1)
  // The day objects are the trip's own — nothing rewritten.
  assert.equal(wd[0].days[0], t.days[0])
})

test('partsWithDays: a city part enumerates its window — real days fill, the rest are loose', () => {
  const trip = {
    id: 'rome1',
    parts: [{ id: 'p', type: 'city', title: 'Rome', dateStart: '2026-07-01', dateEnd: '2026-07-04' }],
    days: [
      { isoDate: '2026-07-01', stops: [{ name: 'Colosseum' }] },
      { isoDate: '2026-07-03', stops: [{ name: 'Vatican' }] },
    ],
  }
  const [rome] = partsWithDays(trip)
  assert.equal(rome.days.length, 4) // 01,02,03,04 — every date in the window
  assert.deepEqual(rome.days.map((d) => d.isoDate), ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04'])
  assert.equal(rome.days[0].loose, undefined) // real
  assert.equal(rome.days[1].loose, true) // open space
  assert.equal(rome.days[1].stops.length, 0)
  assert.equal(rome.days[2].stops[0].name, 'Vatican')
  assert.equal(rome.days[3].loose, true)
})

test('partsWithDays: a shared travel day lands in the ARRIVING part only — never doubled or dropped', () => {
  const trip = {
    id: 'italy2',
    parts: [
      { id: 'p1', type: 'flight', title: 'Fly BOS→Rome', dateStart: '2026-07-01' }, // shares Rome's start
      { id: 'p2', type: 'city', title: 'Rome', dateStart: '2026-07-01', dateEnd: '2026-07-04' },
      { id: 'p3', type: 'stay', title: 'Tuscan villa', dateStart: '2026-07-04', dateEnd: '2026-07-06' },
    ],
    days: [
      { isoDate: '2026-07-01', stops: [{ name: 'Arrive Rome' }] },
      { isoDate: '2026-07-04', stops: [{ name: 'Drive to Tuscany' }] }, // the boundary/travel day
      { isoDate: '2026-07-05', stops: [{ name: 'Pool' }] },
    ],
  }
  const [flight, rome, villa] = partsWithDays(trip)
  // The flight shares Rome's start date → its window collapses → a pure marker.
  assert.equal(flight.days.length, 0)
  // Rome owns 07-01..07-03 (clamped to the day before the villa begins).
  assert.deepEqual(rome.days.map((d) => d.isoDate), ['2026-07-01', '2026-07-02', '2026-07-03'])
  assert.equal(rome.days[0].stops[0].name, 'Arrive Rome')
  // The 07-04 travel day belongs to the villa (the arriving part), not Rome.
  assert.deepEqual(villa.days.map((d) => d.isoDate), ['2026-07-04', '2026-07-05', '2026-07-06'])
  assert.equal(villa.days[0].stops[0].name, 'Drive to Tuscany')
  assert.equal(villa.days[1].stops[0].name, 'Pool')
  // Every real day survives exactly once across all parts.
  const realCount = [flight, rome, villa].flatMap((p) => p.days).filter((d) => !d.loose).length
  assert.equal(realCount, 3)
})

test('partsWithDays: a dateless or out-of-window day is never lost (appended)', () => {
  const trip = {
    id: 'edge1',
    parts: [{ id: 'p', type: 'city', title: 'Town', dateStart: '2026-08-01', dateEnd: '2026-08-02' }],
    days: [
      { isoDate: '2026-08-01', stops: [{ name: 'A' }] },
      { isoDate: null, stops: [{ name: 'undated' }] }, // no date → still kept
      { isoDate: '2026-08-09', stops: [{ name: 'stray' }] }, // outside the window → still kept
    ],
  }
  const [town] = partsWithDays(trip)
  const names = town.days.flatMap((d) => d.stops.map((s) => s.name))
  assert.ok(names.includes('A') && names.includes('undated') && names.includes('stray'))
})

test('partsWithDays: never throws on null / empty', () => {
  assert.deepEqual(partsWithDays(null), [])
  // No parts + no days → one derived wrapper part holding zero days (legacy path).
  const wd = partsWithDays({ id: 'x' })
  assert.equal(wd.length, 1)
  assert.equal(wd[0].derived, true)
  assert.equal(wd[0].dayCount, 0)
})

// ── currentPart / nextTimedStop / clockMinutes (the living-heart shape helpers) ──
// These feed a complex trip's living heart: the part it's in NOW (the hero) and
// the soonest timed thing (the just-in-time "Next up" ticket). Pure + tested.

test('currentPart: the part whose window contains today', () => {
  const t = composite() // p2 Rome 07-01..07-04, p3 villa 07-04..07-11
  assert.equal(currentPart(t, '2026-07-02').id, 'p2') // mid-Rome
  assert.equal(currentPart(t, '2026-07-08').id, 'p3') // mid-villa
})

test('currentPart: before the trip → soonest upcoming part; after → the last dated part', () => {
  const t = composite()
  assert.equal(currentPart(t, '2026-06-01').id, 'p1') // before → first upcoming (flight 07-01)
  assert.equal(currentPart(t, '2026-12-01').id, 'p3') // after everything → last dated part
})

test('currentPart: a legacy trip → its one derived wrapper; null → null', () => {
  assert.equal(currentPart(legacyStay(), '2026-07-04').derived, true)
  assert.equal(currentPart(null, '2026-07-04'), null)
})

test('clockMinutes: 12h + 24h + garbage', () => {
  assert.equal(clockMinutes('9:00 AM'), 540)
  assert.equal(clockMinutes('3:00 PM'), 900)
  assert.equal(clockMinutes('12:00 AM'), 0) // midnight
  assert.equal(clockMinutes('12:30 PM'), 750) // noon-thirty
  assert.equal(clockMinutes('17:05'), 1025) // 24h
  assert.equal(clockMinutes(''), null)
  assert.equal(clockMinutes('soon'), null)
})

test('nextTimedStop: the soonest non-lodging stop at/after now', () => {
  const trip = {
    id: 'n1',
    days: [
      { n: 1, isoDate: '2026-07-01', date: 'Wed', stops: [
        { id: 'a', time: '9:00 AM', name: 'Breakfast' },
        { id: 'b', time: '7:00 PM', name: 'Dinner' },
      ] },
      { n: 2, isoDate: '2026-07-02', date: 'Thu', stops: [
        { id: 'c', kind: 'lodging', name: 'Hotel' }, // lodging is skipped
        { id: 'd', time: '10:00 AM', name: 'Museum' },
      ] },
    ],
  }
  // Mid-day-1 (noon): 9am is past → the 7pm dinner is next.
  assert.equal(nextTimedStop(trip, { todayIso: '2026-07-01', nowMinutes: 12 * 60 }).stop.name, 'Dinner')
  // Day 1 fully past → next day's Museum (the lodging row is skipped).
  assert.equal(nextTimedStop(trip, { todayIso: '2026-07-01', nowMinutes: 23 * 60 }).stop.name, 'Museum')
  // After everything → null (honest: nothing upcoming).
  assert.equal(nextTimedStop(trip, { todayIso: '2026-07-09', nowMinutes: 0 }), null)
  // No today → the trip's very first timed thing.
  assert.equal(nextTimedStop(trip, {}).stop.name, 'Breakfast')
})

test('nextTimedStop: never throws on null / empty', () => {
  assert.equal(nextTimedStop(null), null)
  assert.equal(nextTimedStop({ id: 'x' }), null)
})

// ── currentPartCoords — per-part "where are we now" anchor (Phase 2 foundation) ──

const ROME = { name: 'Rome', lat: 41.9028, lng: 12.4964 }
const FLORENCE = { name: 'Florence', lat: 43.7696, lng: 11.2558 }

function italyComposite() {
  return {
    id: 'italy', shape: 'route', title: 'Italy', dateRangeStart: '2026-06-01', dateRangeEnd: '2026-06-06',
    lodging: { name: 'Rome hotel', lat: ROME.lat, lng: ROME.lng },
    parts: [
      { id: 'p-rome', type: 'city', title: 'Rome', place: { ...ROME }, dateStart: '2026-06-01', dateEnd: '2026-06-03' },
      { id: 'p-flor', type: 'city', title: 'Florence', place: { ...FLORENCE }, dateStart: '2026-06-04', dateEnd: '2026-06-06' },
    ],
  }
}

test('currentPartCoords: anchors to the CURRENT city on a multi-city trip', () => {
  const trip = italyComposite()
  const inRome = currentPartCoords(trip, '2026-06-02')
  assert.equal(inRome.label, 'Rome')
  assert.ok(Math.abs(inRome.lat - ROME.lat) < 1e-6)
  // Once the family is in Florence, the anchor MOVES — not stuck on Rome.
  const inFlorence = currentPartCoords(trip, '2026-06-05')
  assert.equal(inFlorence.label, 'Florence')
  assert.ok(Math.abs(inFlorence.lat - FLORENCE.lat) < 1e-6)
})

test('currentPartCoords: composite part with NO coords falls back to the trip anchor', () => {
  const trip = italyComposite()
  trip.parts[1].place = { name: 'Florence' } // no lat/lng on the active part
  const coords = currentPartCoords(trip, '2026-06-05')
  // Falls back to trip.lodging (Rome coords) rather than returning null.
  assert.ok(Math.abs(coords.lat - ROME.lat) < 1e-6)
})

test('currentPartCoords: a non-composite stay returns exactly stayPlaceCoords (byte-identical path)', () => {
  const trip = { id: 'cabin', shape: 'stay', title: 'Cabin', lodging: { name: 'The Cabin', lat: 43.2, lng: -72.9 } }
  const coords = currentPartCoords(trip, '2026-06-05')
  assert.equal(coords.lat, 43.2)
  assert.equal(coords.lng, -72.9)
})

test('currentPartCoords: never throws on null / coords-less trip', () => {
  assert.equal(currentPartCoords(null, '2026-06-05'), null)
  assert.equal(currentPartCoords({ id: 'x' }, '2026-06-05'), null)
})

// ── isCompositeTrip — the "render the complex home?" gate (Design 4c) ──────────
// The bug it kills: every manually-created trip carries ONE synthetic part, and
// keying the complex home off "has a parts[] array" made a plain stay render
// "In [place]" + "The plan". Composite = ≥2 REAL legs, not a lone part.

test('isCompositeTrip: a legacy trip (no parts) is NOT composite', () => {
  assert.equal(isCompositeTrip(legacyStay()), false)
  assert.equal(isCompositeTrip(legacyRoute()), false)
})

test('isCompositeTrip: a ONE-part trip (the manual-create case) is NOT composite — renders simple', () => {
  const oneP = { id: 'p1', title: 'A weekend', parts: [{ id: 'a', type: 'stay', title: 'The cabin' }] }
  assert.equal(hasExplicitParts(oneP), true, 'it does have a parts array…')
  assert.equal(isCompositeTrip(oneP), false, '…but one part is NOT composite (the 4c fix)')
})

test('isCompositeTrip: a 2+-leg trip IS composite', () => {
  assert.equal(isCompositeTrip(composite()), true) // 3 parts
  const twoP = { id: 't', parts: [{ id: 'a', type: 'city' }, { id: 'b', type: 'city' }] }
  assert.equal(isCompositeTrip(twoP), true)
})

test('isCompositeTrip: never throws on null / garbage', () => {
  assert.equal(isCompositeTrip(null), false)
  assert.equal(isCompositeTrip({ id: 'x' }), false)
})

// ── partPlaceLabel / partCoords — object-safe place readers (the keystone fix) ──
// `place` is a STRING in composite trips (NewTripComposite + the worker prompt)
// but an OBJECT { name, address, lat, lng } in a single-part NewTrip stay. Every
// display + coord read goes through these so an object place never renders as
// "[object Object]" and a coords-bearing string-place leg still anchors.

test('partPlaceLabel: reads a STRING place, an OBJECT place, and degrades to ""', () => {
  assert.equal(partPlaceLabel({ place: 'Rome' }), 'Rome')
  assert.equal(partPlaceLabel({ place: '  Florence  ' }), 'Florence') // trimmed
  assert.equal(partPlaceLabel({ place: { name: 'Rome', lat: 41.9, lng: 12.5 } }), 'Rome')
  assert.equal(partPlaceLabel({ place: { address: '10 Via Roma' } }), '10 Via Roma') // name-less → address
  assert.equal(partPlaceLabel({ place: {} }), '') // empty object → ''
  assert.equal(partPlaceLabel({ title: 'A leg' }), '') // no place → '' (caller falls back to title)
  assert.equal(partPlaceLabel(null), '')
  assert.equal(partPlaceLabel(undefined), '')
})

test('partCoords: coords slot, object place, precedence, and null cases', () => {
  // Explicit coords slot (canonical) — lets a STRING-place leg carry coordinates.
  assert.deepEqual(partCoords({ place: 'Rome', coords: { lat: 41.9, lng: 12.5 } }), { lat: 41.9, lng: 12.5 })
  // An object place's own lat/lng.
  assert.deepEqual(partCoords({ place: { name: 'Rome', lat: 41.9, lng: 12.5 } }), { lat: 41.9, lng: 12.5 })
  // The coords slot WINS over an object place's own coords (canonical override).
  assert.deepEqual(partCoords({ coords: { lat: 1, lng: 2 }, place: { lat: 9, lng: 9 } }), { lat: 1, lng: 2 })
  // A string place with no coords slot → null (no coordinates to anchor on).
  assert.equal(partCoords({ place: 'Rome' }), null)
  // An object place without finite lat/lng → null.
  assert.equal(partCoords({ place: { name: 'Rome' } }), null)
  assert.equal(partCoords(null), null)
})

// ── deriveCurrentLeg — the current leg + resolved orientation context ─────────
// tz/currency/locale/members are the leg model's forward slots: leg field →
// trip-level default → null (members is the leg's own roster or null=everyone).
// Greenfield today, so a leg/trip without them yields nulls (byte-identical home).
// Takes an INSTANT (Date) — noon-UTC instants keep the selected day host-agnostic.

test('deriveCurrentLeg: resolves the active leg + its own tz/currency/locale/members', () => {
  const trip = {
    id: 'eu',
    parts: [
      { id: 'a', type: 'city', place: 'Rome', tz: 'Europe/Rome', currency: 'EUR', locale: 'it-IT', members: ['jonathan'], dateStart: '2026-05-01', dateEnd: '2026-05-03' },
      { id: 'b', type: 'city', place: 'Paris', dateStart: '2026-05-04', dateEnd: '2026-05-06' },
    ],
  }
  const inRome = deriveCurrentLeg(trip, new Date('2026-05-02T12:00:00.000Z'))
  assert.equal(inRome.part.id, 'a')
  assert.equal(inRome.tz, 'Europe/Rome')
  assert.equal(inRome.currency, 'EUR')
  assert.equal(inRome.locale, 'it-IT')
  assert.deepEqual(inRome.members, ['jonathan'])
  assert.equal(inRome.todayIso, '2026-05-02') // today in the leg's own zone
  // Leg b carries NONE of the fields → all null (no trip-level default here).
  const inParis = deriveCurrentLeg(trip, new Date('2026-05-05T12:00:00.000Z'))
  assert.equal(inParis.part.id, 'b')
  assert.equal(inParis.tz, null)
  assert.equal(inParis.currency, null)
  assert.equal(inParis.members, null) // null = everyone, not an empty roster
})

test('deriveCurrentLeg: a trip-level default fills a leg that omits the field', () => {
  const trip = {
    id: 'us', tz: 'America/New_York',
    parts: [
      { id: 'a', type: 'city', place: 'NYC', dateStart: '2026-05-01', dateEnd: '2026-05-03' },
      { id: 'b', type: 'city', place: 'Boston', dateStart: '2026-05-04', dateEnd: '2026-05-06' },
    ],
  }
  assert.equal(deriveCurrentLeg(trip, new Date('2026-05-02T12:00:00.000Z')).tz, 'America/New_York') // leg has none → trip default
})

test('deriveCurrentLeg: a legacy stay (no leg tz) yields nulls — the home stays device-local', () => {
  const ctx = deriveCurrentLeg(legacyStay(), new Date('2026-07-04T12:00:00.000Z'))
  assert.equal(ctx.part.derived, true) // the one wrapper
  assert.equal(ctx.tz, null)
  assert.equal(ctx.currency, null)
  assert.equal(ctx.locale, null)
  assert.equal(ctx.members, null)
})

test('deriveCurrentLeg: at a cross-tz leg boundary, part + tz + todayIso all speak for ONE leg', () => {
  // The split-brain bug: a two-variable version read the zone from the
  // device-today leg but the hero/agenda from the leg-today leg, so at a cross-tz
  // handoff the clock named one city while the screen showed another (~12h wide,
  // on ordinary multi-day legs). This pins that ONE leg drives everything.
  const trip = {
    id: 'rm',
    parts: [
      { id: 'rome', type: 'city', place: 'Rome', tz: 'Europe/Rome', dateStart: '2026-05-20', dateEnd: '2026-05-23' },
      { id: 'maui', type: 'city', place: 'Maui', tz: 'Pacific/Honolulu', dateStart: '2026-05-24', dateEnd: '2026-05-28' },
    ],
  }
  // 2026-05-24T08:00Z: 10:00 in Rome on the 24th, 22:00 in Honolulu on the 23rd.
  const ctx = deriveCurrentLeg(trip, new Date('2026-05-24T08:00:00.000Z'))
  assert.ok(ctx.part)
  // The zone reported is the CHOSEN part's own zone — never a different leg's.
  assert.equal(ctx.tz, ctx.part.tz)
  // todayIso selects that SAME part — part and "today" are one leg, not two.
  assert.equal(currentPart(trip, ctx.todayIso).id, ctx.part.id)
})

test('deriveCurrentLeg: never throws on null', () => {
  const ctx = deriveCurrentLeg(null, new Date('2026-05-02T12:00:00.000Z'))
  assert.equal(ctx.part, null)
  assert.equal(ctx.tz, null)
  assert.equal(ctx.members, null)
})

test('currentPartCoords: a STRING-place leg with a coords slot anchors to those coords', () => {
  // The forward path the leg model unlocks: a composite leg whose place stays a
  // string (city name) but which carries geocoded coords — the hero/We-could/Map
  // anchor to it, labelled by the string place (not "[object Object]").
  const trip = {
    id: 'eu', title: 'Europe',
    parts: [
      { id: 'p1', type: 'city', title: 'Paris days', place: 'Paris', coords: { lat: 48.8566, lng: 2.3522 }, dateStart: '2026-05-01', dateEnd: '2026-05-03' },
      { id: 'p2', type: 'city', title: 'Rome days', place: 'Rome', coords: { lat: 41.9028, lng: 12.4964 }, dateStart: '2026-05-04', dateEnd: '2026-05-06' },
    ],
  }
  const inRome = currentPartCoords(trip, '2026-05-05')
  assert.ok(Math.abs(inRome.lat - 41.9028) < 1e-6)
  assert.equal(inRome.label, 'Rome') // the string place, read object-safely
})

// ── legStatus (the journey rail's done/now/upcoming) ─────────────────────────
test('legStatus: the current leg is "now" — even if its own dates look ambiguous', () => {
  const rome = { id: 'p-rome', dateStart: '2026-05-20', dateEnd: '2026-05-22' }
  assert.equal(legStatus(rome, rome, '2026-05-21'), 'now')
  // "now" wins even when curPart is passed as a different-but-equal-id object
  // (deriveCurrentLeg returns its OWN part object, not always the same ref).
  assert.equal(legStatus({ ...rome }, rome, '2026-05-20'), 'now')
})

test('legStatus: a leg whose window ended before today is "done"', () => {
  const rome = { id: 'p-rome', dateStart: '2026-05-20', dateEnd: '2026-05-22' }
  const florence = { id: 'p-flor', dateStart: '2026-05-23', dateEnd: '2026-05-24' }
  assert.equal(legStatus(rome, florence, '2026-05-23'), 'done')
})

test('legStatus: a leg whose window is still ahead is "upcoming"', () => {
  const florence = { id: 'p-flor', dateStart: '2026-05-23', dateEnd: '2026-05-24' }
  const venice = { id: 'p-ven', dateStart: '2026-05-25', dateEnd: '2026-05-26' }
  assert.equal(legStatus(venice, florence, '2026-05-23'), 'upcoming')
})

test('legStatus: a dateless leg is never mistaken for done', () => {
  const flight = { id: 'p-fly' } // a transit marker with no window
  assert.equal(legStatus(flight, { id: 'p-rome' }, '2026-05-23'), 'upcoming')
})

test('legStatus: null part → "upcoming" (never throws)', () => {
  assert.equal(legStatus(null, { id: 'p-rome' }, '2026-05-23'), 'upcoming')
})
