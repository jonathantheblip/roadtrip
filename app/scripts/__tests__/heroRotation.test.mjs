// Unit tests for the per-visit rotating trip hero (pure lib).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { heroRotationExtras, pickRotatingHero } from '../../src/lib/heroRotation.js'

test('heroRotationExtras: the Juneteenth trip gets the two deck images', () => {
  const extras = heroRotationExtras({ title: 'Vermont Juneteenth Weekend' })
  assert.equal(extras.length, 2)
  assert.ok(extras.every((p) => p.startsWith('./images/vermont-deck-')))
})

test('heroRotationExtras: match is case-insensitive + substring (robust to title tweaks)', () => {
  assert.equal(heroRotationExtras({ title: 'JUNETEENTH in Vermont' }).length, 2)
  assert.equal(heroRotationExtras({ title: 'A Vermont juneteenth trip' }).length, 2)
})

test('heroRotationExtras: other / missing / non-string titles get nothing', () => {
  assert.deepEqual(heroRotationExtras({ title: 'The Jackson Family Drive' }), [])
  assert.deepEqual(heroRotationExtras({ title: '' }), [])
  assert.deepEqual(heroRotationExtras({}), [])
  assert.deepEqual(heroRotationExtras(null), [])
  assert.deepEqual(heroRotationExtras({ title: 42 }), [])
})

test('pickRotatingHero: a seed gives a deterministic, in-range pick', () => {
  const c = ['a', 'b', 'c']
  assert.equal(pickRotatingHero(c, 0), 'a')
  assert.equal(pickRotatingHero(c, 0.5), 'b')
  assert.equal(pickRotatingHero(c, 0.99), 'c')
})

test('pickRotatingHero: drops falsy candidates (e.g. a null current hero)', () => {
  assert.equal(pickRotatingHero([null, 'x', 'y'], 0), 'x')
  assert.equal(pickRotatingHero([undefined, '', 'only'], 0.9), 'only')
})

test('pickRotatingHero: no candidates → null', () => {
  assert.equal(pickRotatingHero([], 0.5), null)
  assert.equal(pickRotatingHero([null, '', undefined], 0.5), null)
})

test('pickRotatingHero: every seed in [0,1) stays within bounds', () => {
  const c = ['a', 'b', 'c']
  for (let s = 0; s < 1; s += 0.05) {
    assert.ok(c.includes(pickRotatingHero(c, s)))
  }
})
