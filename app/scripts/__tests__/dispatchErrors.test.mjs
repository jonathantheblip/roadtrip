import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ALL_CODES,
  classifyUploadError,
  copyForError,
} from '../../src/lib/dispatchErrors.js'

test('every code has a copy entry', () => {
  for (const code of ALL_CODES) {
    const c = copyForError(code)
    assert.ok(c.title, `${code} missing title`)
    assert.ok(c.body, `${code} missing body`)
    assert.ok(c.action?.kind, `${code} missing action.kind`)
    assert.ok(c.action?.label, `${code} missing action.label`)
  }
})

test('unknown code → safe fallback (never raw error.toString())', () => {
  const c = copyForError('this-code-does-not-exist')
  assert.ok(c.title)
  assert.ok(c.body)
  assert.ok(c.action.label)
  // The fallback must not contain "Error:" or technical jargon
  assert.equal(/error:/i.test(c.body), false)
})

test('null / undefined codes also fall back safely', () => {
  assert.ok(copyForError(null).title)
  assert.ok(copyForError(undefined).title)
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
