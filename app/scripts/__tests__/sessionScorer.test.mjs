// Unit tests for sessionScorer.js — the v2 decision heart. Focus: the genuinely
// NEW logic (evidence-tier, time-confirm, agenda-time inference, conservative
// bar). GPS is PRE-RESOLVED by the adapter (via v1's tuned matcher) and arrives
// as `gpsPlaceId`; the scorer carries no geo-tuning.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scoreDay } from '../../src/lib/sessionScorer.js'

const sess = (o) => ({ photoIds: ['p'], memoryIds: ['m'], count: 1, gpsPlaceId: null, ...o })
const place = (o) => ({ lat: null, lng: null, timeMin: null, kind: 'stop', ...o })

test('GPS-resolved session → AUTO to the located place (inheritance flagged)', () => {
  const s = sess({ id: 's', gpsPlaceId: 'trucks', medianMin: 900, count: 4, locatedCount: 1 })
  const p = place({ id: 'trucks', name: 'Monster Trucks', lat: 0, lng: 0, timeMin: 870, kind: 'stop' })
  const [d] = scoreDay([s], [p])
  assert.equal(d.tier, 'auto')
  assert.equal(d.place.id, 'trucks')
  assert.equal(d.signals.evidence, 'gps')
  assert.equal(d.signals.inheritedGps, true) // 1 of 4 had GPS
})

test('no-GPS session time-fitting a PLANNED stop → CONFIRM, never silent auto (corrected Pillar 1)', () => {
  const s = sess({ id: 's', medianMin: 660, count: 16 })
  const p = place({ id: 'parade', name: 'Parade', lat: 1, lng: 1, timeMin: 660, kind: 'stop' })
  const [d] = scoreDay([s], [p])
  assert.equal(d.tier, 'confirm')
  assert.equal(d.place.id, 'parade')
  assert.equal(d.signals.evidence, 'time-only')
})

test('no-GPS session near a NAMED RECORD moment → auto-eligible (record is evidence)', () => {
  const s = sess({ id: 's', medianMin: 660 })
  const p = place({ id: '__record__:x', name: 'the parade', lat: 1, lng: 1, timeMin: 660, kind: 'record' })
  const [d] = scoreDay([s], [p])
  assert.equal(d.tier, 'auto')
  assert.equal(d.signals.evidence, 'record')
})

test('no evidenced moment fits the time → LEAVE (base/unfiled)', () => {
  const s = sess({ id: 's', medianMin: 1080 }) // 6pm
  const p = place({ id: 'parade', name: 'Parade', lat: 1, lng: 1, timeMin: 660, kind: 'stop' }) // 11am
  const [d] = scoreDay([s], [p])
  assert.equal(d.tier, 'leave')
  assert.equal(d.place, null)
})

test('agenda-time inference: a GPS session gives a vague place its time; a later no-GPS session confirms (inferred → not auto)', () => {
  const s1 = sess({ id: 's1', photoIds: ['a'], gpsPlaceId: 'vague', medianMin: 660 })
  const s2 = sess({ id: 's2', photoIds: ['b'], medianMin: 665 })
  const p = place({ id: 'vague', name: 'Parade', lat: 0, lng: 0, timeMin: null, kind: 'stop' }) // "Afternoon"
  const out = scoreDay([s1, s2], [p])
  const d1 = out.find((d) => d.photoIds[0] === 'a')
  const d2 = out.find((d) => d.photoIds[0] === 'b')
  assert.equal(d1.tier, 'auto') // GPS-anchored
  assert.equal(d2.place.id, 'vague') // time-matched to the INFERRED time
  assert.equal(d2.tier, 'confirm') // inferred time → never a silent auto
  assert.equal(d2.signals.inferredTime, true)
})

test('conservative bar: an evidenced place with a nearby runner-up → CONFIRM, not auto', () => {
  // A is gps-evidenced (a session lands on it) with time 660; B time 700. A
  // no-GPS session at 665 is 5m from A, 35m from B → margin 30 < 60 → confirm.
  const anchor = sess({ id: 'anchor', photoIds: ['z'], gpsPlaceId: 'A', medianMin: 660 })
  const s = sess({ id: 's', photoIds: ['p'], medianMin: 665 })
  const A = place({ id: 'A', name: 'A', lat: 0, lng: 0, timeMin: 660, kind: 'stop' })
  const B = place({ id: 'B', name: 'B', lat: 5, lng: 5, timeMin: 700, kind: 'stop' })
  const out = scoreDay([anchor, s], [A, B])
  const d = out.find((x) => x.photoIds[0] === 'p')
  assert.equal(d.place.id, 'A')
  assert.equal(d.tier, 'confirm') // evidenced + close, but runner-up too near
})

test('a GPS session at the BASE reads "at the base", auto', () => {
  const s = sess({ id: 's', gpsPlaceId: '__trip_base__:x', medianMin: 1200 })
  const base = place({ id: '__trip_base__:x', name: 'the base', lat: 0, lng: 0, timeMin: null, kind: 'base' })
  const [d] = scoreDay([s], [base])
  assert.equal(d.tier, 'auto')
  assert.equal(d.signals.placeKind, 'base')
})

test('the base never gets an INFERRED time — a later no-GPS session does not spuriously match it', () => {
  // regression: a GPS-at-base session used to give the base a time, then other
  // sessions "time-fit" the base ("64m from base"). The base is all-day.
  const atBase = sess({ id: 'b', photoIds: ['z'], gpsPlaceId: '__trip_base__:x', medianMin: 1130 })
  const later = sess({ id: 'l', photoIds: ['p'], medianMin: 1135 }) // 5m later, no GPS
  const base = place({ id: '__trip_base__:x', name: 'base', lat: 0, lng: 0, timeMin: null, kind: 'base' })
  const out = scoreDay([atBase, later], [base])
  const d = out.find((x) => x.photoIds[0] === 'p')
  assert.equal(d.tier, 'leave') // no inferred base time → nothing to match → base by default
  assert.equal(d.place, null)
})

test('agenda-free spine: a GPS burst at a DISCOVERED spot → auto, evidence gps (no stop entered)', () => {
  const s = sess({ id: 's', gpsPlaceId: '__discovered__:d:0', medianMin: 800, count: 5, locatedCount: 1 })
  const p = place({ id: '__discovered__:d:0', name: 'a place near 42.0621, -70.1634', lat: 42.0621, lng: -70.1634, timeMin: 800, kind: 'discovered' })
  const [d] = scoreDay([s], [p])
  assert.equal(d.tier, 'auto')
  assert.equal(d.place.id, '__discovered__:d:0')
  assert.equal(d.signals.evidence, 'gps')
  assert.equal(d.signals.placeKind, 'discovered')
})

test('a no-GPS burst time-fitting a DISCOVERED spot → CONFIRM, never auto (evidence-over-plan on the agenda-free spine)', () => {
  // s1 GPS-anchors the discovered spot at 800 (→ auto); s2 has no GPS and sits 5m
  // later — close + unambiguous, yet a discovered spot reached by TIME ONLY still
  // earns a one-tap, exactly like a planned stop would.
  const s1 = sess({ id: 's1', photoIds: ['a'], gpsPlaceId: '__discovered__:d:0', medianMin: 800 })
  const s2 = sess({ id: 's2', photoIds: ['b'], medianMin: 805 })
  const p = place({ id: '__discovered__:d:0', name: 'a place near 42.0621, -70.1634', lat: 42.0621, lng: -70.1634, timeMin: 800, kind: 'discovered' })
  const out = scoreDay([s1, s2], [p])
  const d1 = out.find((d) => d.photoIds[0] === 'a')
  const d2 = out.find((d) => d.photoIds[0] === 'b')
  assert.equal(d1.tier, 'auto') // GPS-anchored this burst
  assert.equal(d2.place.id, '__discovered__:d:0')
  assert.equal(d2.tier, 'confirm') // time-only reach → one-tap, not silent auto
})

test('naming state surfaces the "give this moment a name" work: discovered → needs-name, named → named, leave → null', () => {
  const disc = sess({ id: 's1', photoIds: ['a'], gpsPlaceId: '__discovered__:d:0', medianMin: 800 })
  const named = sess({ id: 's2', photoIds: ['b'], gpsPlaceId: 'trucks', medianMin: 900 })
  const far = sess({ id: 's3', photoIds: ['c'], medianMin: 100 }) // no GPS, hours from any place
  const pDisc = place({ id: '__discovered__:d:0', name: 'a place near 1.0, 2.0', lat: 1, lng: 2, timeMin: 800, kind: 'discovered' })
  const pNamed = place({ id: 'trucks', name: 'Monster Trucks', lat: 0, lng: 0, timeMin: 900, kind: 'stop' })
  const out = scoreDay([disc, named, far], [pDisc, pNamed])
  const d1 = out.find((d) => d.photoIds[0] === 'a')
  const d2 = out.find((d) => d.photoIds[0] === 'b')
  const d3 = out.find((d) => d.photoIds[0] === 'c')
  assert.equal(d1.naming, 'needs-name') // a GPS-proven spot with only coordinates
  assert.equal(d1.signals.naming, 'needs-name') // persisted for the surface (no migration)
  assert.equal(d2.naming, 'named') // a real place already has words
  assert.equal(d3.tier, 'leave')
  assert.equal(d3.naming, null) // nothing filed → nothing to name
})
