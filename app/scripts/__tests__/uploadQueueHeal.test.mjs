// Unit coverage for the upload-queue self-heal discriminator (guarantee #3).
// The purge's whole safety claim is ZERO false positives — it must delete raw
// leftovers (like the stranded 168MB clip) and NEVER a legitimately-shrunk clip.
// isDoomedVideoItem is pure (reads only .kind + blob.type/.size), so we exercise
// it with plain blob-shaped objects — no real IndexedDB or Blob needed.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isDoomedVideoItem,
  isStuckItem,
  STUCK_AFTER_ATTEMPTS,
} from '../../src/lib/uploadQueue.js'

const MB = 1024 * 1024
const vid = (type, size) => ({ kind: 'video', blob: type == null ? undefined : { type, size } })

test('isDoomedVideoItem KEEPS every valid mp4 clip, regardless of size (zero false positives)', () => {
  // A real shrunk clip is ALWAYS a video/mp4, and must survive at ANY size: the
  // shrinker has no duration cap, so a long home video legitimately encodes to a
  // LARGE mp4 — and a large-but-valid clip that's only queued because its upload
  // failed is the family's ONLY copy. Deleting it on size would be data loss.
  assert.equal(isDoomedVideoItem(vid('video/mp4', 7.5 * MB)), false, 'tiny shrunk clip')
  assert.equal(isDoomedVideoItem(vid('video/mp4', 15 * MB)), false, 'typical shrunk clip')
  assert.equal(isDoomedVideoItem(vid('video/mp4', 48 * MB)), false, '~3-min shrunk clip')
  // REGRESSION (adversarial review, critical): a ~6-min recital → ~91MB valid mp4.
  // An earlier size-ceiling would have SILENTLY DELETED this real family video.
  assert.equal(isDoomedVideoItem(vid('video/mp4', 91 * MB)), false, '~6-min legit clip — MUST be kept')
  assert.equal(isDoomedVideoItem(vid('video/mp4', 500 * MB)), false, 'a huge but valid mp4 is never deleted on size')
})

test('isDoomedVideoItem PURGES raw leftovers (never went through the shrinker)', () => {
  // The actual stranded ghost: a 168MB raw QuickTime original.
  assert.equal(isDoomedVideoItem(vid('video/quicktime', 168 * MB)), true, 'raw .mov container (the real ghost)')
  assert.equal(isDoomedVideoItem(vid('video/quicktime', 12 * MB)), true, 'a raw container is doomed at ANY size, not just when big')
  assert.equal(isDoomedVideoItem(vid('', 10 * MB)), true, 'empty/unknown type is not a shrunk mp4')
  assert.equal(isDoomedVideoItem(vid(null)), true, 'video item with no blob is dead weight')
})

test('isDoomedVideoItem NEVER touches photos or malformed items', () => {
  // Photos are always tiny + legitimate — even a (hypothetical) huge one is left alone.
  assert.equal(isDoomedVideoItem({ kind: 'photo', blob: { type: 'image/jpeg', size: 500 * MB } }), false)
  assert.equal(isDoomedVideoItem({ kind: 'photo', blob: { type: 'video/quicktime', size: 500 * MB } }), false, 'kind gates it, not blob type')
  assert.equal(isDoomedVideoItem(null), false)
  assert.equal(isDoomedVideoItem(undefined), false)
  assert.equal(isDoomedVideoItem({}), false, 'no kind → not a video → untouched')
})

test('isStuckItem flags persistently-failing items for the honest surface (never abandons)', () => {
  // This only drives the "clip couldn't upload" report — the item is STILL
  // retried, so a below/at-threshold check must be exact, not an off-by-one.
  assert.equal(isStuckItem({ attempts: 0 }), false)
  assert.equal(isStuckItem({ attempts: STUCK_AFTER_ATTEMPTS - 1 }), false, 'one below → not yet reported')
  assert.equal(isStuckItem({ attempts: STUCK_AFTER_ATTEMPTS }), true, 'at threshold → surfaced')
  assert.equal(isStuckItem({ attempts: STUCK_AFTER_ATTEMPTS + 5 }), true)
  assert.equal(isStuckItem({}), false, 'missing attempts counts as 0')
  assert.equal(isStuckItem(null), false)
})
