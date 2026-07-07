// Per-lens SUGGESTION copy (Stage 0c) — VERBATIM from copy_deck.md §"The
// suggestion (machine unsure)". Suggestions are adults-only; the Aurelia form
// exists for parity but is unreached behind the isAdult gate.
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { suggestLens, suggestLine, suggestMoveLabel, suggestDismissLabel } =
  await import('../../src/lib/suggestCopy.js')

test('suggestLens maps travelers (default jonathan)', () => {
  assert.equal(suggestLens('helen'), 'helen')
  assert.equal(suggestLens('aurelia'), 'aurelia')
  assert.equal(suggestLens('jonathan'), 'jonathan')
  assert.equal(suggestLens('whoever'), 'jonathan')
})

test('suggestLine — verbatim per-lens forms', () => {
  assert.equal(suggestLine(3, "Rosa's", 'jonathan'), "3 photos may belong at Rosa's.")
  assert.equal(suggestLine(3, "Rosa's", 'helen'), "These 3 might belong at Rosa's.")
  assert.equal(suggestLine(3, "rosa's", 'aurelia'), "these 3 might be from rosa's.")
  // Jonathan singularizes the noun.
  assert.equal(suggestLine(1, 'the pier', 'jonathan'), '1 photo may belong at the pier.')
})

test('button labels — verbatim', () => {
  assert.equal(suggestMoveLabel('jonathan'), 'Move')
  assert.equal(suggestMoveLabel('helen'), 'Move them')
  assert.equal(suggestMoveLabel('aurelia'), 'move them')
  assert.equal(suggestDismissLabel('jonathan'), 'Not now')
  assert.equal(suggestDismissLabel('helen'), 'Not now')
  assert.equal(suggestDismissLabel('aurelia'), 'not now')
})
