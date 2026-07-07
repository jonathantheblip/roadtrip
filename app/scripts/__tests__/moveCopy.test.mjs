// Ch3 photo-move copy — VERBATIM per lens (copy_deck.md). Rafa is excluded by
// the caller (no variant here); Aurelia is all-lowercase incl. names.
import { test } from 'node:test'
import assert from 'node:assert/strict'

const {
  moveActionLabel, moveSheetTitle, unfiledRowLabel, lockedLine,
  UNFILED_SUB, HERE_NOW, ROW_PLACE, ROW_MOMENT,
} = await import('../../src/lib/moveCopy.js')

test('the lightbox action label — Aurelia lowercase', () => {
  assert.equal(moveActionLabel('jonathan'), 'Move to…')
  assert.equal(moveActionLabel('helen'), 'Move to…')
  assert.equal(moveActionLabel('aurelia'), 'move to…')
})

test('the Move-to sheet title, per lens (verbatim)', () => {
  assert.equal(moveSheetTitle('jonathan'), 'Move to…')
  assert.equal(moveSheetTitle('helen'), 'Move this photo to…')
  assert.equal(moveSheetTitle('aurelia'), 'move this to…')
})

test('the leave-unfiled row label, per lens (verbatim)', () => {
  assert.equal(unfiledRowLabel('jonathan'), 'Leave unfiled')
  assert.equal(unfiledRowLabel('helen'), 'Leave it unfiled')
  assert.equal(unfiledRowLabel('aurelia'), 'leave it unfiled')
  assert.equal(UNFILED_SUB, 'not tied to a moment')
  assert.equal(HERE_NOW, 'here now')
  assert.equal(ROW_PLACE, 'A PLACE')
  assert.equal(ROW_MOMENT, 'A NAMED MOMENT')
})

test('the LOCKED line — {n} is "you" on the mover\'s own device, else their name, per lens', () => {
  // Helen viewing her own move.
  assert.equal(lockedLine({ source: 'manual', by: 'helen' }, 'helen'), 'Placed here by you — stays put.')
  // Jonathan viewing Helen's move.
  assert.equal(lockedLine({ source: 'manual', by: 'helen' }, 'jonathan'), 'Placed by Helen. Locked.')
  // Aurelia's lens — all lowercase, incl. the mover's name.
  assert.equal(lockedLine({ source: 'manual', by: 'jonathan' }, 'aurelia'), 'jonathan put it here — it stays.')
  // Aurelia viewing her own move.
  assert.equal(lockedLine({ source: 'manual', by: 'aurelia' }, 'aurelia'), 'you put it here — it stays.')
})
