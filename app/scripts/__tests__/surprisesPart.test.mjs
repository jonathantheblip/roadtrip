// "Surprises by sentence" Slice 1 — the CLIENT per-part masking mirror (defense in
// depth; the worker mirror is the real boundary). Proves the client mask hides a
// secret part AND its days, with day-ownership taken from partsWithDays — the SAME
// derivation PartsTripView renders — so the mask can never diverge from the render.
//
// NON-VACUOUS: the leak assertions search the viewer's projection for the secret
// part's title/place AND its days' stop names — drop the mask and they're there.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  isPartSurprise,
  isPartMaskedFrom,
  maskTripParts,
  maskTripForViewer,
} from '../../src/lib/surprises.js'

const villaPart = () => ({
  id: 'p-villa', type: 'stay', title: 'Secret cliffside villa', place: 'Positano',
  dateStart: '2026-08-04', dateEnd: '2026-08-06',
  surprise: { author: 'jonathan', hideFrom: ['helen'], conceal: 'cover', reveal: { type: 'manual' }, cover: { title: 'A few quiet days on the coast', loc: 'the coast' } },
})
const trip = () => ({
  id: 't1',
  parts: [
    { id: 'p-rome', type: 'city', title: 'Three days in Rome', place: 'Rome', dateStart: '2026-08-01', dateEnd: '2026-08-03' },
    villaPart(),
  ],
  days: [
    { isoDate: '2026-08-01', stops: [{ id: 's1', name: 'Colosseum tour' }] }, // Rome — visible
    { isoDate: '2026-08-05', stops: [{ id: 's2', name: 'Villa pool & cliff views' }] }, // villa — SECRET
  ],
})

test('predicates', () => {
  assert.equal(isPartSurprise(villaPart()), true)
  assert.equal(isPartMaskedFrom(villaPart(), 'helen'), true)
  assert.equal(isPartMaskedFrom(villaPart(), 'jonathan'), false) // author
  assert.equal(isPartMaskedFrom(villaPart(), 'rafa'), false) // not targeted
})

test('author + non-targeted see the real part (referential stability)', () => {
  const t = trip()
  assert.equal(maskTripForViewer(t, 'jonathan'), t)
  assert.equal(maskTripForViewer(t, 'rafa'), t)
})

test('the recipient never sees the secret part NOR its days; the cover stands in', () => {
  const forHelen = maskTripForViewer(trip(), 'helen')
  const json = JSON.stringify(forHelen)
  assert.ok(!json.includes('Secret cliffside villa'))
  assert.ok(!json.includes('Villa pool & cliff views')) // the secret day's stop is gone too
  assert.ok(json.includes('A few quiet days on the coast')) // cover
  assert.ok(json.includes('Colosseum tour')) // visible day intact
  assert.equal(forHelen.days.length, 1)
  assert.equal(forHelen.days[0].isoDate, '2026-08-01')
})

test('a no-dateEnd hidden part strips days up to the next part (ownership via partsWithDays)', () => {
  const t = {
    id: 't',
    parts: [
      { id: 'p1', type: 'flight', title: 'Secret flight', dateStart: '2026-09-01', surprise: { author: 'jonathan', hideFrom: ['helen'], conceal: 'teaser', reveal: { type: 'manual' } } },
      { id: 'p2', type: 'city', title: 'Rome', dateStart: '2026-09-03', dateEnd: '2026-09-05' },
    ],
    days: [
      { isoDate: '2026-09-01', stops: [{ id: 'a', name: 'SECRET takeoff' }] },
      { isoDate: '2026-09-02', stops: [{ id: 'b', name: 'SECRET layover' }] }, // clamped to p1
      { isoDate: '2026-09-03', stops: [{ id: 'c', name: 'Colosseum' }] },
    ],
  }
  const json = JSON.stringify(maskTripForViewer(t, 'helen'))
  assert.ok(!json.includes('SECRET takeoff'))
  assert.ok(!json.includes('SECRET layover'))
  assert.ok(json.includes('Colosseum'))
})

test('a legacy trip (no parts) is untouched', () => {
  const legacy = { id: 't', days: [{ isoDate: 'd', stops: [{ id: 's', name: 'Lunch' }] }] }
  assert.equal(maskTripParts(legacy, 'helen'), legacy)
})
