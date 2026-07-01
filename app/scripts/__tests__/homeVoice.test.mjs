// Unit tests for homeVoice (src/lib/homeVoice.js) — the per-lens VOICE map.
// Helen is the warm base; Jonathan warm+direct (a few overrides, sentence case);
// Aurelia lowercase + casual (the lc() transform + casual overrides).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { homeVoice } from '../../src/lib/homeVoice.js'

test('homeVoice: Helen is the warm base — no overrides, not lowercased', () => {
  const v = homeVoice('helen')
  assert.equal(v.low, false)
  assert.equal(v.lc('On The Agenda'), 'On The Agenda') // identity for everyone but Aurelia
  assert.equal(v.weaveKicker, 'The Weave')
  assert.match(v.weaveDuring, /^The day’s story appears here/)
  assert.equal(v.agendaEmptyKicker, 'Nothing planned — and that’s allowed')
})

test('homeVoice: Jonathan is warm + direct — a few overrides, sentence case', () => {
  const v = homeVoice('jonathan')
  assert.equal(v.low, false)
  assert.equal(v.agendaEmptyKicker, 'Nothing planned today — take it easy')
  assert.equal(v.nearbyLine, 'A few things worth heading out for')
  assert.match(v.weaveDuring, /worth telling\.$/)
  assert.doesNotMatch(v.agendaEmptyKicker, /whole point/) // no Claude-ism
  assert.equal(v.weaveKicker, 'The Weave') // base where not overridden
})

test('homeVoice: Aurelia is lowercase — lc() transforms + casual overrides', () => {
  const v = homeVoice('aurelia')
  assert.equal(v.low, true)
  assert.equal(v.lc('On The Agenda'), 'on the agenda') // lowercases her prose
  assert.equal(v.weaveKicker, 'the weave')
  assert.equal(v.nearbyLine, 'stuff we could go do')
  assert.equal(v.agendaEmptyKicker, 'nothing planned — and that’s kinda the vibe')
  // even a base field (no override) comes out lowercase for her
  assert.equal(v.photosGather, v.photosGather.toLowerCase())
})

test('homeVoice: an unknown lens falls back to the warm base', () => {
  const v = homeVoice('someone')
  assert.equal(v.low, false)
  assert.equal(v.weaveKicker, 'The Weave')
  assert.equal(v.agendaEmptyKicker, 'Nothing planned — and that’s allowed')
})
