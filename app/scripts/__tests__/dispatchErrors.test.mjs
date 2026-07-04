import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bucketForCode } from '../../src/lib/dispatchErrors.js'

// bucketForCode is all that survives of the retired dispatch error
// policy — it labels a logged upload-failure code 'A' (silent / auto-
// queued) or 'C' (surfaced to the user) for the dev-mode upload log
// (uploadLog.js). The single-photo dispatch composer and its three
// plain-language error panels were retired in importer Stage 3.

test('surfaced-to-the-user codes label as C', () => {
  assert.equal(bucketForCode('video-too-large'), 'C')
  assert.equal(bucketForCode('still-too-large'), 'C')
  // Foolproof-video (#2/#4): the importer's video failures are no longer silent
  // skips — a clip that won't decode/encode surfaces the "couldn't add" confirm
  // banner, and an over-3:00 clip the "trim it" boundary. All shown to the family
  // (the DOM tier can see them), so all are Bucket C now.
  assert.equal(bucketForCode('decode-failed'), 'C')
  assert.equal(bucketForCode('video-encode-failed'), 'C')
  assert.equal(bucketForCode('video-too-long'), 'C')
})

test('silent / auto-queued codes label as A', () => {
  for (const code of ['network', 'worker-5xx', 'storage-quota', 'purged-raw-leftover']) {
    assert.equal(bucketForCode(code), 'A', `${code} should be silent (A)`)
  }
})

test('unknown / unmapped codes default to A', () => {
  assert.equal(bucketForCode('something-new'), 'A')
  assert.equal(bucketForCode(undefined), 'A')
})
