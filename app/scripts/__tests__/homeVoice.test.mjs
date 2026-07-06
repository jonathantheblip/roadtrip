// Unit tests for homeVoice (src/lib/homeVoice.js) — the per-lens VOICE map.
// Helen is the warm base; Jonathan warm+direct (a few overrides, sentence case);
// Aurelia lowercase + casual (the lc() transform + casual overrides).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { homeVoice, BASE } from '../../src/lib/homeVoice.js'

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

test('homeVoice: the return is COMPLETE — every BASE field resolves for every lens (no undefined render)', () => {
  // The return is an explicit allowlist, not a spread. A field added to BASE but
  // forgotten in the return renders `undefined` on screen (the R4c settle-sheet bug).
  for (const lens of ['helen', 'jonathan', 'aurelia', 'someone']) {
    const v = homeVoice(lens)
    for (const k of Object.keys(BASE)) {
      assert.notEqual(v[k], undefined, `homeVoice('${lens}').${k} is missing from the return allowlist`)
    }
  }
})

test('homeVoice: the settle-verbs strings (FIX 2–7) resolve per lens', () => {
  const h = homeVoice('helen')
  assert.equal(h.settlePoolSubTwo, 'The last two days — quiet ones?')
  assert.equal(h.settlePoolCtaTwo, 'Keep them both')
  assert.equal(h.settleKeptDoor, 'Add a name')
  assert.equal(h.sheetLeaveOut, 'Leave this out')
  assert.equal(h.sheetTuck, 'Tuck it into the day')

  const j = homeVoice('jonathan')
  assert.equal(j.settlePoolSubTwo, 'Two quiet days. Sign them off together?')
  assert.equal(j.settlePoolCtaTwo, 'Sign them off')
  assert.equal(j.settleKeptDoor, 'Add to the record')
  assert.equal(j.sheetLeaveOut, 'Leave it out')
  assert.equal(j.sheetTuck, 'Put it on the record')
  assert.equal(j.sheetListen, 'Listen', 'base where not overridden')

  const a = homeVoice('aurelia')
  assert.equal(a.settlePoolSubTwo, 'two floaty days. keep ’em?')
  assert.equal(a.settleKeptDoor, 'name one more?')
  assert.equal(a.sheetLeaveOut, 'not this one')
  assert.equal(a.sheetPutBack, 'undo')
  assert.equal(a.sheetRafaTold, a.sheetRafaTold.toLowerCase(), 'her lens lowercases even base strings')

  // The {n} templates carry the placeholder for the render-time count.
  for (const lens of ['helen', 'jonathan', 'aurelia']) {
    assert.match(homeVoice(lens).settlePoolSub, /\{n\}/)
    assert.match(homeVoice(lens).settleRiderMany, /\{n\}/)
  }
})
