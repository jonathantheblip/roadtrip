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

test('importToastProps: a clip that imported WITHOUT its sound shows in the summary line', () => {
  assert.deepEqual(importToastProps({ ok: 3, queued: 0, reattached: 0, failed: 0, soundLost: 1 }), {
    message: '3 photos added · 1 without its sound',
    syncing: 0,
  })
  assert.deepEqual(importToastProps({ ok: 2, queued: 1, reattached: 0, failed: 0, soundLost: 2 }), {
    message: '2 photos added · 2 without their sound',
    syncing: 1,
  })
  assert.deepEqual(importToastProps({ ok: 1, queued: 0, reattached: 0, failed: 0, soundLost: 1 }), {
    message: '1 photo added · 1 without its sound',
    syncing: 0,
  })
})

test("importToastProps: Rafa's lens never meets the sound-loss suffix — same rule as the banner and tile chip", () => {
  // Rafa gets the classic count shape even when the batch lost sound; the
  // count itself stays honest for the parent lenses.
  assert.deepEqual(importToastProps({ ok: 3, queued: 1, reattached: 0, failed: 0, soundLost: 1 }, 'rafa'), {
    count: 3,
    noun: 'photos',
    syncing: 1,
  })
  // Every other lens (and a caller passing no traveler) keeps the honest line.
  assert.deepEqual(importToastProps({ ok: 3, queued: 0, reattached: 0, failed: 0, soundLost: 1 }, 'helen'), {
    message: '3 photos added · 1 without its sound',
    syncing: 0,
  })
  assert.deepEqual(importToastProps({ ok: 3, queued: 0, reattached: 0, failed: 0, soundLost: 1 }), {
    message: '3 photos added · 1 without its sound',
    syncing: 0,
  })
})

test('importToastProps: a mixed batch names photos AND videos, never calls a video a photo', () => {
  // Live bug (2026-07-07, Rafa's 5th-birthday upload): "N photos added" even
  // when some of the N were videos. `r.ok` is the combined count; `r.videos`
  // carries the split.
  assert.deepEqual(importToastProps({ ok: 4, queued: 0, reattached: 0, failed: 0, videos: 1 }), {
    message: '3 photos · 1 video added',
    syncing: 0,
  })
  assert.deepEqual(importToastProps({ ok: 5, queued: 2, reattached: 0, failed: 0, videos: 2 }), {
    message: '3 photos · 2 videos added',
    syncing: 2,
  })
})

test('importToastProps: a videos-only batch says videos, not photos', () => {
  assert.deepEqual(importToastProps({ ok: 2, queued: 0, reattached: 0, failed: 0, videos: 2 }), {
    message: '2 videos added',
    syncing: 0,
  })
  assert.deepEqual(importToastProps({ ok: 1, queued: 0, reattached: 0, failed: 0, videos: 1 }), {
    message: '1 video added',
    syncing: 0,
  })
})

test('importToastProps: a single silent VIDEO reads "1 video added · …" (the e2e-pinned wrong-noun bug)', () => {
  // Mirrors tests/e2e/photos-import-sound-loss.spec.js end-to-end: one video
  // that lost its sound. It must NOT read "1 photo added" (calling a video a
  // photo) — the 2026-07-07 field report.
  assert.deepEqual(importToastProps({ ok: 1, queued: 0, reattached: 0, failed: 0, videos: 1, soundLost: 1 }), {
    message: '1 video added · 1 without its sound',
    syncing: 0,
  })
})

test('importToastProps: a photos-only batch keeps the classic shape even with videos:0', () => {
  assert.deepEqual(importToastProps({ ok: 3, queued: 0, reattached: 0, failed: 0, videos: 0 }), {
    count: 3,
    noun: 'photos',
    syncing: 0,
  })
})

test('importToastProps: the video count is clamped to ok (a partial-failure batch never over-counts videos)', () => {
  // If more items were videos in the batch than actually saved (some failed),
  // never show more videos than `ok` — clamp so photos can't go negative.
  assert.deepEqual(importToastProps({ ok: 1, queued: 0, reattached: 0, failed: 2, videos: 3 }), {
    message: '1 video added',
    syncing: 0,
  })
})

test('importToastProps: a mixed batch that also lost sound names both kinds AND the sound loss', () => {
  assert.deepEqual(importToastProps({ ok: 3, queued: 0, reattached: 0, failed: 0, videos: 2, soundLost: 1 }), {
    message: '1 photo · 2 videos added · 1 without its sound',
    syncing: 0,
  })
  // Rafa still never meets the sound-loss suffix, but the honest photo/video
  // count is not a notice — he gets the plain split.
  assert.deepEqual(importToastProps({ ok: 4, queued: 0, reattached: 0, failed: 0, videos: 1, soundLost: 1 }, 'rafa'), {
    message: '3 photos · 1 video added',
    syncing: 0,
  })
})

test('importToastProps: soundLost absent or zero keeps the classic count shape byte-identical', () => {
  assert.deepEqual(importToastProps({ ok: 3, queued: 0, reattached: 0, failed: 0, soundLost: 0 }), {
    count: 3,
    noun: 'photos',
    syncing: 0,
  })
  // Callers that predate the field (no soundLost key at all) are unchanged.
  assert.deepEqual(importToastProps({ ok: 2, queued: 0, reattached: 0, failed: 0 }), {
    count: 2,
    noun: 'photos',
    syncing: 0,
  })
})
