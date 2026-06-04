import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bucketForCode } from '../../src/lib/dispatchErrors.js'

// bucketForCode is all that survives of the retired dispatch error
// policy — it labels a logged upload-failure code 'A' (silent / auto-
// queued) or 'C' (surfaced to the user) for the dev-mode upload log
// (uploadLog.js). The single-photo dispatch composer and its three
// plain-language error panels were retired in importer Stage 3.

test('hard size-cap codes label as C (surfaced)', () => {
  assert.equal(bucketForCode('video-too-large'), 'C')
  assert.equal(bucketForCode('still-too-large'), 'C')
})

test('silent / auto-queued codes label as A', () => {
  for (const code of ['network', 'worker-5xx', 'storage-quota', 'video-encode-failed']) {
    assert.equal(bucketForCode(code), 'A', `${code} should be silent (A)`)
  }
})

test('unknown / unmapped codes default to A', () => {
  assert.equal(bucketForCode('something-new'), 'A')
  assert.equal(bucketForCode(undefined), 'A')
})
