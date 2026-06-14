// Slice 2 — per-stop masking (hide ONE place on a trip). Tests the PURE contract
// in app/src/lib/surprises.js. The worker mirrors this (worker/test) — that
// mirror is the real boundary; this proves the shared logic is correct.
//
// NON-VACUOUS: the leak assertions check that a masked stop's real name/place
// NEVER appear in the viewer's projection — drop the mask and they're right there.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  isStopSurprise,
  isStopMaskedFrom,
  stopCoverStandIn,
  stopTeaserStub,
  maskStopForViewer,
  maskTripStops,
  stopSurprisesKeptBy,
  pendingArrivalStopSurprises,
} from '../../src/lib/surprises.js'

// A real stop carrying a teaser surprise (arrival reveal at the SECRET place).
const TEASER_STOP = {
  id: 'st-candy', name: 'Mo\'s Candy Emporium', kind: 'browse', time: '3:00 PM',
  address: '12 Sweet St', for: ['rafa'], note: 'the big surprise',
  lat: 41.49, lng: -72.09,
  surprise: {
    author: 'jonathan', hideFrom: ['rafa'], conceal: 'teaser',
    reveal: { type: 'arrival', at: 'st-candy', label: "Mo's Candy Emporium", lat: 41.49, lng: -72.09 },
  },
}

// A real stop carrying a COVER surprise.
const COVER_STOP = {
  id: 'st-jewel', name: 'Tiffany & Co (ring pickup)', kind: 'shopping', time: '11:00 AM',
  address: '727 5th Ave', note: 'the proposal ring',
  surprise: {
    author: 'jonathan', hideFrom: ['helen'], conceal: 'cover',
    reveal: { type: 'manual' },
    cover: { icon: '☕', title: 'Coffee at Blue Bottle', loc: 'Bryant Park', time: '11:00 AM', weather: 'cool', packing: 'a light jacket' },
  },
}

const PLAIN_STOP = { id: 'st-lunch', name: 'Lunch at the deli', kind: 'lunch', time: '1:00 PM' }

test('isStopSurprise — only a non-empty hideFrom marks a stop a surprise', () => {
  assert.equal(isStopSurprise(TEASER_STOP), true)
  assert.equal(isStopSurprise(COVER_STOP), true)
  assert.equal(isStopSurprise(PLAIN_STOP), false)
  assert.equal(isStopSurprise({ surprise: { hideFrom: [] } }), false)
  assert.equal(isStopSurprise(null), false)
})

test('isStopMaskedFrom — author + revealed + non-targeted are never masked', () => {
  assert.equal(isStopMaskedFrom(TEASER_STOP, 'rafa'), true) // targeted
  assert.equal(isStopMaskedFrom(TEASER_STOP, 'jonathan'), false) // author sees own
  assert.equal(isStopMaskedFrom(TEASER_STOP, 'helen'), false) // non-targeted
  // 'everyone' masks every non-author.
  const everyone = { ...TEASER_STOP, surprise: { ...TEASER_STOP.surprise, hideFrom: ['everyone'] } }
  assert.equal(isStopMaskedFrom(everyone, 'rafa'), true)
  assert.equal(isStopMaskedFrom(everyone, 'helen'), true)
  assert.equal(isStopMaskedFrom(everyone, 'jonathan'), false)
  // revealed → visible to everyone.
  const revealed = { ...TEASER_STOP, surprise: { ...TEASER_STOP.surprise, revealed: '2026-05-01T00:00:00Z' } }
  assert.equal(isStopMaskedFrom(revealed, 'rafa'), false)
})

test('stopCoverStandIn — only the cover survives; the real stop never leaks', () => {
  const c = stopCoverStandIn(COVER_STOP)
  assert.equal(c.id, 'st-jewel') // structural id preserved (React key / stop resolve)
  assert.equal(c.name, 'Coffee at Blue Bottle')
  assert.equal(c.kind, 'Bryant Park') // cover loc rides as kind (mirrors coverToStop)
  assert.match(c.note, /cool/)
  assert.match(c.note, /light jacket/)
  assert.equal(c.masked, true)
  // The real thing is GONE.
  const s = JSON.stringify(c)
  assert.ok(!s.includes('Tiffany'))
  assert.ok(!s.includes('727 5th Ave'))
  assert.ok(!s.includes('proposal'))
})

test('stopTeaserStub — sanitized: no real name, no place name, no coords', () => {
  const t = stopTeaserStub(TEASER_STOP)
  assert.equal(t.id, 'st-candy')
  assert.equal(t.name, "🎁 Something's coming")
  assert.equal(t.time, '3:00 PM') // time slot kept so the day reads in order
  assert.equal(t.masked, true)
  assert.equal(t._teaser, true)
  // CRITICAL: the arrival reveal's place name + coords must NOT leak (they'd name
  // the secret). Arrival → a generic "reveals when you arrive", no place.
  const s = JSON.stringify(t)
  assert.ok(!s.includes('Candy'))
  assert.ok(!s.includes('Sweet St'))
  assert.ok(!s.includes('41.49'))
  assert.ok(!s.includes('-72.09'))
  assert.match(t.note, /reveals/)
})

test('stopTeaserStub — a DATE reveal keeps the date (safe to show)', () => {
  const dated = { ...TEASER_STOP, surprise: { ...TEASER_STOP.surprise, reveal: { type: 'date', at: '2026-06-15' } } }
  const t = stopTeaserStub(dated)
  assert.match(t.note, /June 15/)
})

test('maskStopForViewer — cover→stand-in, teaser→stub, else untouched (same ref)', () => {
  assert.equal(maskStopForViewer(PLAIN_STOP, 'rafa'), PLAIN_STOP) // referential stability
  assert.equal(maskStopForViewer(TEASER_STOP, 'jonathan'), TEASER_STOP) // author untouched
  assert.equal(maskStopForViewer(TEASER_STOP, 'rafa')._teaser, true)
  assert.equal(maskStopForViewer(COVER_STOP, 'helen')._cover, true)
})

test('maskTripStops — masks per viewer; the real secrets never reach the recipient', () => {
  const trip = {
    id: 't1',
    days: [
      { isoDate: '2026-05-22', stops: [PLAIN_STOP, COVER_STOP] },
      { isoDate: '2026-05-23', stops: [TEASER_STOP] },
    ],
  }
  // Author sees the real trip, UNCHANGED REFERENCE (no needless re-render).
  assert.equal(maskTripStops(trip, 'jonathan'), trip)

  // Helen: cover stop substituted; teaser (hidden from rafa, not her) untouched.
  const forHelen = maskTripStops(trip, 'helen')
  assert.notEqual(forHelen, trip)
  assert.equal(forHelen.days[0].stops[1].name, 'Coffee at Blue Bottle')
  assert.equal(forHelen.days[1].stops[0].name, "Mo's Candy Emporium") // not hidden from her

  // Rafa: teaser stub; cover (hidden from helen, not him) untouched.
  const forRafa = maskTripStops(trip, 'rafa')
  assert.equal(forRafa.days[1].stops[0].name, "🎁 Something's coming")
  assert.equal(forRafa.days[0].stops[1].name, 'Tiffany & Co (ring pickup)') // not hidden from him

  // Whole-trip leak sweep per recipient.
  const helenStr = JSON.stringify(forHelen)
  assert.ok(!helenStr.includes('Tiffany'))
  assert.ok(!helenStr.includes('proposal'))
  const rafaStr = JSON.stringify(forRafa)
  assert.ok(!rafaStr.includes('Candy'))
  assert.ok(!rafaStr.includes('Sweet St'))
})

test('maskTripStops — never throws on empty / malformed trips', () => {
  assert.equal(maskTripStops(null, 'rafa'), null)
  assert.equal(maskTripStops({ id: 'x' }, 'rafa').id, 'x')
  const noStops = { id: 'x', days: [{ isoDate: 'd' }] }
  assert.equal(maskTripStops(noStops, 'rafa'), noStops)
})

test('stopSurprisesKeptBy — every stop-surprise this author owns, with location', () => {
  const trips = [
    { id: 't1', days: [{ isoDate: '2026-05-22', stops: [PLAIN_STOP, COVER_STOP] }, { isoDate: '2026-05-23', stops: [TEASER_STOP] }] },
    { id: 't2', days: [{ isoDate: '2026-07-01', stops: [PLAIN_STOP] }] },
  ]
  const kept = stopSurprisesKeptBy(trips, 'jonathan')
  assert.equal(kept.length, 2)
  assert.deepEqual(kept.map((k) => k.stop.id).sort(), ['st-candy', 'st-jewel'])
  const candy = kept.find((k) => k.stop.id === 'st-candy')
  assert.equal(candy.tripId, 't1')
  assert.equal(candy.dayIso, '2026-05-23')
  // Helen authored none.
  assert.equal(stopSurprisesKeptBy(trips, 'helen').length, 0)
})

test('pendingArrivalStopSurprises — only the author\'s unrevealed arrival stops with coords', () => {
  const trips = [{ id: 't1', days: [{ isoDate: 'd', stops: [TEASER_STOP, COVER_STOP] }] }]
  const pend = pendingArrivalStopSurprises(trips, 'jonathan')
  assert.equal(pend.length, 1) // TEASER_STOP (arrival+coords); COVER_STOP is manual
  assert.equal(pend[0].stop.id, 'st-candy')
  // Revealed → no longer pending.
  const revealed = { ...TEASER_STOP, surprise: { ...TEASER_STOP.surprise, revealed: 'x' } }
  assert.equal(pendingArrivalStopSurprises([{ id: 't', days: [{ stops: [revealed] }] }], 'jonathan').length, 0)
})
