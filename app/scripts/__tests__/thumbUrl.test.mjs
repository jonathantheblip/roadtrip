// Unit tests for app/src/lib/thumbUrl.js. The helper is only safe
// to call from any photo render path if it:
//  - Passes through non-string / falsy / non-Worker URLs unchanged
//  - Respects an existing ?w= so a caller that already chose a
//    width isn't second-guessed
//  - Survives URLs that already carry other query parameters
//  - Rounds float widths to a clean integer

import test from 'node:test'
import assert from 'node:assert/strict'

import { thumbUrl } from '../../src/lib/thumbUrl.js'

const WORKER = 'https://roadtrip-sync.jonathan-d-jackson.workers.dev'
const PHOTO = `${WORKER}/assets/helen/mem_x/photo-abcd1234`

test('appends ?w= to a worker photo URL', () => {
  assert.equal(thumbUrl(PHOTO, 2048), `${PHOTO}?w=2048`)
})

test('uses & when the URL already has a query parameter', () => {
  const u = `${PHOTO}?download=1`
  assert.equal(thumbUrl(u, 512), `${PHOTO}?download=1&w=512`)
})

test('respects an existing w= and does not double-append', () => {
  const u = `${PHOTO}?w=1024`
  assert.equal(thumbUrl(u, 2048), u)
  const v = `${PHOTO}?foo=bar&w=512`
  assert.equal(thumbUrl(v, 2048), v)
})

test('rounds float widths to an integer', () => {
  assert.equal(thumbUrl(PHOTO, 1023.7), `${PHOTO}?w=1024`)
})

test('passes through URLs that are not served by the sync Worker', () => {
  for (const u of [
    'https://example.com/photo.jpg',
    'https://cdn.example.com/x.png?w=10',
    'blob:https://app/abc-123',
    'data:image/png;base64,iVBORw0KGgo',
    '/local/relative.jpg',
  ]) {
    assert.equal(thumbUrl(u, 2048), u, `should pass through ${u}`)
  }
})

test('passes through falsy or non-string inputs', () => {
  assert.equal(thumbUrl(null, 2048), null)
  assert.equal(thumbUrl(undefined, 2048), undefined)
  assert.equal(thumbUrl('', 2048), '')
  assert.equal(thumbUrl(42, 2048), 42)
  assert.deepEqual(thumbUrl({ url: PHOTO }, 2048), { url: PHOTO })
})

test('passes through when width is not a positive finite number', () => {
  assert.equal(thumbUrl(PHOTO, 0), PHOTO)
  assert.equal(thumbUrl(PHOTO, -10), PHOTO)
  assert.equal(thumbUrl(PHOTO, NaN), PHOTO)
  assert.equal(thumbUrl(PHOTO, Infinity), PHOTO)
  assert.equal(thumbUrl(PHOTO, null), PHOTO)
  assert.equal(thumbUrl(PHOTO, '2048'), PHOTO) // string width — caller bug, pass through
})

test('also matches non-default workers.dev subdomains', () => {
  // The regex is intentionally subdomain-tolerant so a future
  // Worker name change doesn't quietly disable thumbnailing.
  const url = 'https://other-worker.workers.dev/assets/x/y/photo-z'
  assert.equal(thumbUrl(url, 2048), `${url}?w=2048`)
})
