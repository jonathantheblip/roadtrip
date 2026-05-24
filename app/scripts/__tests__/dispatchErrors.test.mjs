import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ALL_CODES,
  BANNED_VOCABULARY,
  BUCKET_C_OUTCOMES,
  bucketForCode,
  classifyUploadError,
  containsBannedVocabulary,
  copyForOutcome,
  userFacingErrorForOutcome,
} from '../../src/lib/dispatchErrors.js'

// The error-surface policy (carryover §3) is asserted here. The
// previous test file checked that every internal code had its own
// distinct copy; that test is gone because the surface is now exactly
// three plain-language strings, no per-code variation.

test('all classify codes have a known bucket', () => {
  for (const code of ALL_CODES) {
    const bucket = bucketForCode(code)
    assert.ok(bucket === 'A' || bucket === 'C', `${code} has unknown bucket ${bucket}`)
  }
})

test('Bucket A codes do NOT produce a user-facing outcome', () => {
  const aCodes = ALL_CODES.filter((c) => bucketForCode(c) === 'A')
  assert.ok(aCodes.length > 0, 'expected at least one Bucket A code in the table')
  for (const code of aCodes) {
    const outcome = userFacingErrorForOutcome({ code })
    assert.equal(
      outcome,
      null,
      `${code} should be silent (Bucket A) but returned ${outcome}`
    )
  }
})

test('decode/encode failures upgrade to photo-unreadable on attempt 2', () => {
  for (const code of ['decode-failed', 'heic-decode-failed', 'canvas-encode-failed']) {
    assert.equal(
      userFacingErrorForOutcome({ code, context: { attempt: 1 } }),
      null,
      `${code} attempt 1 should be silent`
    )
    assert.equal(
      userFacingErrorForOutcome({ code, context: { attempt: 2 } }),
      'photo-unreadable',
      `${code} attempt 2 should upgrade to photo-unreadable`
    )
  }
})

test('still-too-large surfaces as photo-too-large immediately', () => {
  assert.equal(
    userFacingErrorForOutcome({ code: 'still-too-large' }),
    'photo-too-large'
  )
})

test('video-too-large surfaces as video-too-long immediately', () => {
  assert.equal(
    userFacingErrorForOutcome({ code: 'video-too-large' }),
    'video-too-long'
  )
})

test('Bucket C outcomes are exactly three', () => {
  const keys = Object.keys(BUCKET_C_OUTCOMES).sort()
  assert.deepEqual(keys, ['photo-too-large', 'photo-unreadable', 'video-too-long'])
})

test('every Bucket C copy has a title and body', () => {
  for (const [outcome, copy] of Object.entries(BUCKET_C_OUTCOMES)) {
    assert.ok(copy.title, `${outcome} missing title`)
    assert.ok(copy.body, `${outcome} missing body`)
  }
})

test('no banned vocabulary appears in Bucket C copy', () => {
  for (const [outcome, copy] of Object.entries(BUCKET_C_OUTCOMES)) {
    for (const field of ['title', 'body']) {
      const flagged = containsBannedVocabulary(copy[field])
      assert.equal(
        flagged,
        null,
        `${outcome}.${field} contains banned word '${flagged}': "${copy[field]}"`
      )
    }
  }
})

test('containsBannedVocabulary spots banned terms with word boundaries', () => {
  for (const word of BANNED_VOCABULARY) {
    const probe = `Please retry the ${word} again.`
    assert.equal(
      containsBannedVocabulary(probe),
      word,
      `expected to flag '${word}' in "${probe}"`
    )
  }
})

test('containsBannedVocabulary does not false-flag substrings', () => {
  // "remember" contains the bytes 'mb' but should not flag 'MB'.
  assert.equal(containsBannedVocabulary('Please remember to share.'), null)
  // "synchronous" contains 'sync' but should not flag 'sync' as a word.
  assert.equal(containsBannedVocabulary('The synchronous version.'), null)
})

test('copyForOutcome throws on unknown outcomes — wiring-bug guard', () => {
  assert.throws(
    () => copyForOutcome('not-a-real-outcome'),
    /unknown outcome/
  )
})

test('classifyUploadError: .code wins when set + known', () => {
  assert.equal(classifyUploadError({ code: 'heic-decode-failed' }), 'heic-decode-failed')
})

test('classifyUploadError: quota message → storage-quota', () => {
  assert.equal(classifyUploadError(new Error('QuotaExceededError: quota')), 'storage-quota')
})

test('classifyUploadError: fetch failure → network', () => {
  assert.equal(classifyUploadError(new Error('Failed to fetch')), 'network')
  assert.equal(classifyUploadError(new Error('Load failed')), 'network')
  assert.equal(classifyUploadError(new Error('NetworkError when attempting')), 'network')
})

test('classifyUploadError: worker 401/403 → worker-auth', () => {
  assert.equal(classifyUploadError(new Error('worker 401: unauthorized')), 'worker-auth')
  assert.equal(classifyUploadError(new Error('worker 403: forbidden')), 'worker-auth')
})

test('classifyUploadError: worker 5xx → worker-5xx', () => {
  assert.equal(classifyUploadError(new Error('worker 500: internal')), 'worker-5xx')
  assert.equal(classifyUploadError(new Error('worker 503: down')), 'worker-5xx')
})

test('classifyUploadError: generic 4xx → worker-5xx (treated as transient)', () => {
  assert.equal(classifyUploadError(new Error('worker 422: bad payload')), 'worker-5xx')
})

test('classifyUploadError: unrecognized → null (caller falls back)', () => {
  assert.equal(classifyUploadError(new Error('something random')), null)
  assert.equal(classifyUploadError(null), null)
})
