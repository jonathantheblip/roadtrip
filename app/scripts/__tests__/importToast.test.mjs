// Unit tests for importToastProps (lib/importToast.js) — the summary line for
// a photo/video import batch, shared by PhotosView and App.jsx's bulk
// importer. Live bug (2026-07-04): a batch where EVERY item failed read
// EXACTLY like "nothing new to import" — the family had no way to tell "it
// tried and lost" from "you didn't pick anything." `failed` must win over
// the generic fallback whenever it's present.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { importToastProps } from '../../src/lib/importToast.js'

test('importToastProps: nothing picked at all', () => {
  assert.deepEqual(importToastProps({ ok: 0, queued: 0, reattached: 0, failed: 0, nothingNew: true }), {
    message: 'Nothing new to import',
  })
})

test('importToastProps: a successful batch counts + notes anything still syncing', () => {
  assert.deepEqual(importToastProps({ ok: 3, queued: 1, reattached: 0, failed: 0 }), {
    count: 3,
    noun: 'photos',
    syncing: 1,
  })
  assert.deepEqual(importToastProps({ ok: 1, queued: 0, reattached: 0, failed: 0 }), {
    count: 1,
    noun: 'photo',
    syncing: 0,
  })
})

test('importToastProps: a pure re-attach batch (no new saves)', () => {
  assert.deepEqual(importToastProps({ ok: 0, queued: 0, reattached: 2, failed: 0 }), {
    message: '2 re-attached',
  })
})

test('importToastProps: EVERY item failing must NOT read as "nothing new" — the live bug', () => {
  assert.deepEqual(importToastProps({ ok: 0, queued: 0, reattached: 0, failed: 1, errors: [{ name: 'clip.mp4', message: 'boom' }] }), {
    message: "Couldn't add that one — try again",
  })
  assert.deepEqual(importToastProps({ ok: 0, queued: 0, reattached: 0, failed: 3, errors: [] }), {
    message: "Couldn't add 3 of those — try again",
  })
})

test('importToastProps: a PARTIAL failure still counts the real successes (ok wins)', () => {
  assert.deepEqual(importToastProps({ ok: 2, queued: 0, reattached: 0, failed: 1 }), {
    count: 2,
    noun: 'photos',
    syncing: 0,
  })
})

test('importToastProps: never fabricates on null/undefined input', () => {
  assert.equal(importToastProps(null), null)
  assert.equal(importToastProps(undefined), null)
})
