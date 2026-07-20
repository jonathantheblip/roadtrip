import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildWorldModel, worldModelPrior, WORLD_DEFAULTS } from '../../src/lib/worldModel.js'
import { buildEvidenceBench } from '../../src/lib/evidenceBench.js'
import { settle } from '../../src/lib/settlingEngine.js'

const trip = (id, endMs, stops) => ({ id, endMs, stops })
const at = (h, m = 0) => Date.UTC(2026, 6, 4, h, m)
const NOW = Date.UTC(2026, 6, 10)
const recurring = (name) => [trip('t1', at(0), [{ name, lat: 42, lng: -70 }]), trip('t2', at(0), [{ name, lat: 42, lng: -70 }]), trip('t3', at(0), [{ name, lat: 42, lng: -70 }])]

test('recurrence grows the prior smoothly — no ≥N-trips cutoff; seen once still whispers', () => {
  const wm = buildWorldModel([
    trip('t1', at(0), [{ name: 'Beach house', lat: 42, lng: -70 }]),
    trip('t2', at(0), [{ name: 'Beach house', lat: 42, lng: -70 }]),
    trip('t3', at(0), [{ name: 'Beach house', lat: 42, lng: -70 }, { name: 'Diner', lat: 42.1, lng: -70.1 }]),
  ])
  const beach = worldModelPrior(wm, { name: 'Beach house' }, NOW)
  const diner = worldModelPrior(wm, { name: 'Diner' }, NOW)
  assert.ok(beach > diner && diner > 0, 'seen-thrice beats seen-once, and seen-once is still nonzero')
})

test('CLAMP: the prior is capped far below certainty no matter how often a place recurs', () => {
  const trips = Array.from({ length: 50 }, (_, i) => trip('t' + i, at(0), [{ name: 'Beach house', lat: 42, lng: -70 }]))
  const m = worldModelPrior(buildWorldModel(trips), { name: 'Beach house' }, NOW)
  assert.ok(m <= WORLD_DEFAULTS.priorCeiling + 1e-9 && m < 0.55, 'a prior nudges; it never asserts')
})

test('DECAY: a place unseen for years quietly loses its voice', () => {
  const wm = buildWorldModel([
    trip('t1', Date.UTC(2020, 0, 1), [{ name: 'Old cabin', lat: 42, lng: -70 }]),
    trip('t2', Date.UTC(2020, 0, 8), [{ name: 'Old cabin', lat: 42, lng: -70 }]),
  ])
  const fresh = worldModelPrior(wm, { name: 'Old cabin' }, Date.UTC(2020, 0, 20))
  const stale = worldModelPrior(wm, { name: 'Old cabin' }, Date.UTC(2026, 0, 1))
  assert.ok(stale < fresh * 0.2, 'six years on, a dead pattern has all but faded')
})

test('matched by NAME, not coordinates — stacked places stay DISTINCT (Provincetown)', () => {
  const wm = buildWorldModel([
    trip('t1', at(0), [{ name: 'The cottage', lat: 42.05, lng: -70.18 }, { name: 'Town beach', lat: 42.05, lng: -70.18 }]),
    trip('t2', at(0), [{ name: 'The cottage', lat: 42.05, lng: -70.18 }, { name: 'Town beach', lat: 42.05, lng: -70.18 }]),
  ])
  assert.equal(wm.places.length, 2, 'two names on one spot stay two places — coordinates never merge them')
})

test('prior alone can HEAL softly but NEVER file silently (interactive-activation guard)', () => {
  const places = [{ id: 'X', name: 'Beach house', lat: 42, lng: -70, timeMin: null }]
  const bench = buildEvidenceBench([{ id: 'p', at: at(14) }], places, { worldModel: buildWorldModel(recurring('Beach house')), now: NOW })
  const p = settle(bench, places).photos.get('p')
  assert.equal(p.top, 'X', 'the prior places it')
  assert.notEqual(p.destination, 'file', 'but a prior alone must never file silently')
  assert.equal(p.tier, 'derived', 'prior support is non-observed')
})

test('a strong prior does NOT drag an off-rhythm photo away from its observed evidence', () => {
  const places = [
    { id: 'A', name: 'Beach house', lat: 42, lng: -70 },
    { id: 'B', name: 'The museum', lat: 42.3, lng: -70.5 }, // not recurring; the photo is really here
  ]
  const bench = buildEvidenceBench([{ id: 'p', at: at(14), lat: 42.3, lng: -70.5, provGps: 'exif' }], places, { worldModel: buildWorldModel(recurring('Beach house')), now: NOW })
  const p = settle(bench, places).photos.get('p')
  assert.equal(p.top, 'B', 'observed evidence for the off-rhythm place wins; the prior does not overrule it')
})

test('emergent channel: the world-model witness abstains in the same grammar when absent', () => {
  const places = [{ id: 'X', name: 'Beach house', lat: 42, lng: -70 }]
  const pts = [{ id: 'p', at: at(14), lat: 42, lng: -70, provGps: 'exif' }]
  const without = buildEvidenceBench(pts, places).placement.filter((e) => e.witness === 'worldModel')
  const withWM = buildEvidenceBench(pts, places, { worldModel: buildWorldModel(recurring('Beach house')), now: NOW }).placement.filter((e) => e.witness === 'worldModel')
  assert.equal(without.length, 0, 'no world model → the channel abstains, exactly like a missing signal')
  assert.ok(withWM.length > 0 && withWM[0].tier === 'prior', 'supplied → it speaks, tier prior')
})
