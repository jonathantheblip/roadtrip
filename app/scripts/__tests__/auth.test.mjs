import { test } from 'node:test'
import assert from 'node:assert/strict'

// Browser globals the client auth module touches. Shimmed BEFORE import so the
// session store + context detection have something to talk to under node:test.
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}
globalThis.window = { matchMedia: () => ({ matches: false }) }
// Node 24 defines navigator as a read-only getter, so override it writably.
function setNavigator(nav) {
  Object.defineProperty(globalThis, 'navigator', { value: nav, writable: true, configurable: true })
}
setNavigator({ userAgent: 'node-test' })

const { tokenFromInput, getSession, setSession, clearSession, enrolledTravelers, hasSession, isStandalone, defaultDeviceLabel } =
  await import('../../src/lib/auth.js')

test('tokenFromInput accepts a bare opaque token', () => {
  const t = 'abcDEF123_-ghiJKL456mnoPQR789'
  assert.equal(tokenFromInput(t), t)
})

test('tokenFromInput extracts the token from a full enroll URL', () => {
  assert.equal(
    tokenFromInput('https://jonathantheblip.github.io/roadtrip/?enroll=AbC_123-def456ghi789jkl'),
    'AbC_123-def456ghi789jkl'
  )
})

test('tokenFromInput trims surrounding whitespace (pasted text often has it)', () => {
  assert.equal(tokenFromInput('   AbC_123-def456ghi789jkl   '), 'AbC_123-def456ghi789jkl')
})

test('tokenFromInput rejects junk / empty / too-short', () => {
  assert.equal(tokenFromInput(''), '')
  assert.equal(tokenFromInput('   '), '')
  assert.equal(tokenFromInput('hello world'), '') // has a space
  assert.equal(tokenFromInput('short'), '') // under 20 chars
  assert.equal(tokenFromInput(undefined), '')
  assert.equal(tokenFromInput(null), '')
  assert.equal(tokenFromInput(12345), '')
})

test('session store is isolated per traveler (no cross-contamination)', () => {
  store.clear()
  setSession('helen', 'sess-helen')
  setSession('rafa', 'sess-rafa')
  assert.equal(getSession('helen'), 'sess-helen')
  assert.equal(getSession('rafa'), 'sess-rafa')
  assert.equal(getSession('jonathan'), '') // never set → empty, not another's
  assert.equal(hasSession('helen'), true)
  assert.equal(hasSession('jonathan'), false)
})

test('enrolledTravelers reflects exactly who has a session, in canonical order', () => {
  store.clear()
  setSession('rafa', 'r')
  setSession('jonathan', 'j')
  // canonical order is jonathan, helen, aurelia, rafa — not insertion order
  assert.deepEqual(enrolledTravelers(), ['jonathan', 'rafa'])
})

test('clearSession removes only that traveler', () => {
  store.clear()
  setSession('helen', 'h')
  setSession('aurelia', 'a')
  clearSession('helen')
  assert.equal(getSession('helen'), '')
  assert.equal(getSession('aurelia'), 'a')
  assert.deepEqual(enrolledTravelers(), ['aurelia'])
})

test('isStandalone is false in a normal browser tab', () => {
  globalThis.window = { matchMedia: () => ({ matches: false }) }
  assert.equal(isStandalone(), false)
})

test('isStandalone is true when display-mode is standalone (installed PWA)', () => {
  globalThis.window = { matchMedia: (q) => ({ matches: q.includes('standalone') }) }
  assert.equal(isStandalone(), true)
})

test('isStandalone honors iOS navigator.standalone', () => {
  globalThis.window = { matchMedia: () => ({ matches: false }), navigator: { standalone: true } }
  assert.equal(isStandalone(), true)
})

test('defaultDeviceLabel reads a recognizable label from the UA', () => {
  setNavigator({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' })
  assert.equal(defaultDeviceLabel(), 'iPhone')
  setNavigator({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0)' })
  assert.equal(defaultDeviceLabel(), 'iPad')
  setNavigator({}) // unknown → safe fallback, never throws
  assert.equal(defaultDeviceLabel(), 'this device')
})
