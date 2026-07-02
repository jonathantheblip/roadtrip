// mapsLink — the per-traveler Maps/Waze deep link. The vague-address class
// (live bug, Provincetown 2026-07-01): a NAMED stop whose address is
// bare-city ("Provincetown, MA") and has NO coords used to search the bare
// city — the town center, not the venue. The fix: the no-coords fallback is
// a name-anchored SEARCH ("The Canteen, Provincetown, MA"). Coords, when
// PRESENT, still outrank the name: hand-pinned and API-sourced stops carry
// precise coords under descriptive names ("Aurelia pickup — …") that would
// search as junk — an adversarial review caught the name-first version
// flipping 11 real seed stops off their exact pins.
import test from 'node:test'
import assert from 'node:assert/strict'

import { mapsLink } from '../../src/lib/mapsLink.js'

const CANTEEN = {
  name: 'The Canteen',
  address: 'Provincetown, MA', // bare city — no street number
}

test('mapsLink: a vague address + a name + NO coords → name-anchored search, not the bare city', () => {
  const waze = mapsLink(CANTEEN, 'jonathan') // Jonathan → Waze
  assert.match(waze, /waze\.com/)
  assert.match(decodeURIComponent(waze), /The Canteen, Provincetown, MA/)

  const apple = mapsLink(CANTEEN, 'helen') // others → Apple Maps
  assert.match(apple, /maps\.apple\.com/)
  assert.match(decodeURIComponent(apple), /The Canteen, Provincetown, MA/)
})

test('mapsLink: PRECISE coords outrank the name — a descriptive-name pinned stop keeps its exact pin', () => {
  // Real seed shape: "Aurelia pickup — Rindge Avenue Upper Campus" carries
  // the school's own coords; searching that sentence would be junk.
  const pickup = {
    name: 'Aurelia pickup — Rindge Avenue Upper Campus',
    address: 'Rindge Avenue Upper Campus, Cambridge, MA', // no street number → vague by heuristic
    lat: 42.3925,
    lng: -71.1262,
  }
  assert.match(mapsLink(pickup, 'jonathan'), /ll=42\.3925,-71\.1262/)
  assert.match(mapsLink(pickup, 'helen'), /daddr=42\.3925,-71\.1262/)
})

test('mapsLink: a FULL street address still wins over everything (unchanged)', () => {
  const stop = { ...CANTEEN, address: '225 Commercial St, Provincetown, MA' }
  assert.match(decodeURIComponent(mapsLink(stop, 'jonathan')), /225 Commercial St/)
  assert.match(decodeURIComponent(mapsLink(stop, 'helen')), /225 Commercial St/)
})

test('mapsLink: a nameless vague-address stop keeps the coords fallback (better than a bare-city search)', () => {
  const stop = { address: 'Provincetown, MA', lat: 42.0526, lng: -70.1849 }
  assert.match(mapsLink(stop, 'jonathan'), /ll=42\.0526,-70\.1849/)
  assert.match(mapsLink(stop, 'helen'), /daddr=42\.0526,-70\.1849/)
})

test('mapsLink: no address, no coords → searches the name (unchanged last resort)', () => {
  const stop = { name: 'Spiritus Pizza' }
  assert.match(decodeURIComponent(mapsLink(stop, 'jonathan')), /Spiritus Pizza/)
  assert.match(decodeURIComponent(mapsLink(stop, 'helen')), /Spiritus Pizza/)
})
