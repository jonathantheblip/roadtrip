// confirmCopy.js — the S1 copy deck (spec 05 verbatim). Pins the truth-critical
// strings (the "true promise"), the phrasebook selector, the fill/lc render, and
// a fail-closed scan proving no engine jargon leaked into family copy.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CONFIRM_DECK, renderConfirm, confirmFill, evidenceKeyOf } from '../../src/lib/confirmCopy.js'

test('renderConfirm: fills slots, lowercases only for Aurelia, blank for a non-adult lens', () => {
  const f = { n: 9, moment: 'the walk into town', place: 'Angel Foods' }
  assert.equal(
    renderConfirm('jonathan', CONFIRM_DECK.question.A, f),
    'These 9 photos look like the walk into town — at Angel Foods. Right?'
  )
  // Aurelia lowercases the WHOLE rendered string, proper names included.
  assert.equal(
    renderConfirm('aurelia', CONFIRM_DECK.question.A, f),
    'these 9 look like the walk into town — at angel foods, yeah?'
  )
  assert.equal(renderConfirm('rafa', CONFIRM_DECK.question.A, f), '') // no Rafa column → fail-closed blank
})

test('sentence-initial {Moment} capitalizes the descriptor lead; mid-sentence stays lowercase; Aurelia lowercases both', () => {
  const f = { moment: 'the walk into town', place: 'Angel Foods', n: 9 }
  // settled fact starts a sentence → capital lead
  assert.equal(renderConfirm('jonathan', CONFIRM_DECK.settledPlace, f), 'The walk into town, at Angel Foods.')
  // "Saved. {Moment} …" starts a new sentence after the period → capital
  assert.equal(
    renderConfirm('jonathan', CONFIRM_DECK.savedPlace.A, f),
    'Saved. The walk into town is on the record — and the rest of the day settles around it.'
  )
  // mid-sentence (the question) stays warm-lowercase
  assert.match(renderConfirm('jonathan', CONFIRM_DECK.question.A, f), /look like the walk into town — at Angel Foods/)
  // Aurelia's whole-string lc() lowercases the sentence-initial slot too
  assert.equal(renderConfirm('aurelia', CONFIRM_DECK.settledPlace, f), 'the walk into town, at angel foods.')
})

test('the saved promise is warm + true — object is the TRIP, never "we\'ll remember"', () => {
  const helen = renderConfirm('helen', CONFIRM_DECK.savedPlace.A, { moment: 'the walk into town' })
  assert.equal(helen, 'Saved — the walk into town is part of the trip now, and it helps the rest of the day fall into place.')
  // The banned register must not appear anywhere in the saved-promise family.
  const savedStrings = [
    ...Object.values(CONFIRM_DECK.savedPlace).flatMap((v) => Object.values(v)),
    ...Object.values(CONFIRM_DECK.savedPicked), ...Object.values(CONFIRM_DECK.savedName),
    ...Object.values(CONFIRM_DECK.savedTextPlace), ...Object.values(CONFIRM_DECK.savedTextTime),
  ]
  for (const s of savedStrings) assert.doesNotMatch(s, /we’ll remember|we will remember/i)
})

test('the afternote is generic (no count) — recorded call #2', () => {
  assert.equal(renderConfirm('jonathan', CONFIRM_DECK.afternote), 'A few nearby moments fell in line with it.')
  for (const s of Object.values(CONFIRM_DECK.afternote)) assert.doesNotMatch(s, /\d/) // never a number
})

test('evidenceKeyOf: the §3 phrasebook selector', () => {
  assert.equal(evidenceKeyOf({ dims: ['time', 'gps'] }), 'multi')
  assert.equal(evidenceKeyOf({ inheritedGps: true }), 'gps')
  assert.equal(evidenceKeyOf({ evidence: 'gps' }), 'gps')
  assert.equal(evidenceKeyOf({ visionName: 'A-House' }), 'vision')
  assert.equal(evidenceKeyOf({ timeFitMin: 4 }), 'timeFit')
  assert.equal(evidenceKeyOf({ cohesion: 0.9 }), 'cohesion')
  assert.equal(evidenceKeyOf({}), null) // nothing translatable → no line (fail-closed)
  assert.equal(evidenceKeyOf(null), null)
})

test('confirmFill leaves unknown slots untouched, never throws', () => {
  assert.equal(confirmFill('at {place}', {}), 'at {place}')
  assert.equal(confirmFill('{a}-{b}', { a: 1, b: 2 }), '1-2')
})

test('FAIL-CLOSED: no engine jargon anywhere in the deck', () => {
  const leaves = []
  const walk = (v) => {
    if (typeof v === 'string') leaves.push(v)
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(CONFIRM_DECK)
  // Unambiguous jargon that never has an innocent use in warm family copy.
  // (NB: "match" is deliberately NOT banned — "That match your memory?" is the
  // family's own word, not the engine's; the spec's ban is on the jargon sense.)
  const banned = /confidence|\btier\b|\bscore\b|\bsignal\b|auto-file|\bshadow\b|re-heal|re-sort|\bweight\b|%/i
  for (const s of leaves) assert.doesNotMatch(s, banned, `jargon leaked: "${s}"`)
})
