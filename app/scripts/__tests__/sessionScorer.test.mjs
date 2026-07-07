// Unit tests for sessionScorer.js — the v2 decision heart. Focus: the genuinely
// NEW logic (evidence-tier, time-confirm, agenda-time inference, conservative
// bar). GPS-to-place tolerance is a placeholder here (synthetic 0m coords); the
// production GPS pass reuses v1's tuned nearestLocatedStops margin — see the
// module header + the wiring step.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scoreDay } from '../../src/lib/sessionScorer.js'

const sess = (o) => ({ photoIds: ['p'], memoryIds: ['m'], count: 1, location: null, ...o })
const place = (o) => ({ lat: null, lng: null, timeMin: null, kind: 'stop', ...o })

test('GPS session → AUTO to the located place (inheritance flagged)', () => {
  const s = sess({ id: 's', location: { lat: 0, lng: 0 }, medianMin: 900, count: 4, locatedCount: 1 })
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
  const s1 = sess({ id: 's1', photoIds: ['a'], location: { lat: 0, lng: 0 }, medianMin: 660 })
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
  const anchor = sess({ id: 'anchor', photoIds: ['z'], location: { lat: 0, lng: 0 }, medianMin: 660 })
  const s = sess({ id: 's', photoIds: ['p'], medianMin: 665 })
  const A = place({ id: 'A', name: 'A', lat: 0, lng: 0, timeMin: 660, kind: 'stop' })
  const B = place({ id: 'B', name: 'B', lat: 5, lng: 5, timeMin: 700, kind: 'stop' })
  const out = scoreDay([anchor, s], [A, B])
  const d = out.find((x) => x.photoIds[0] === 'p')
  assert.equal(d.place.id, 'A')
  assert.equal(d.tier, 'confirm') // evidenced + close, but runner-up too near
})

test('a GPS session at the BASE reads "at the base", auto', () => {
  const s = sess({ id: 's', location: { lat: 0, lng: 0 }, medianMin: 1200 })
  const base = place({ id: '__trip_base__:x', name: 'the base', lat: 0, lng: 0, timeMin: null, kind: 'base' })
  const [d] = scoreDay([s], [base])
  assert.equal(d.tier, 'auto')
  assert.equal(d.signals.placeKind, 'base')
})
