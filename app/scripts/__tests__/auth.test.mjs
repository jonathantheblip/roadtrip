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

const { tokenFromInput, getSession, setSession, clearSession, enrolledTravelers, hasSession, isStandalone, defaultDeviceLabel, switcherList, subscribeAuth } =
  await import('../../src/lib/auth.js')

const ORDER = ['jonathan', 'helen', 'aurelia', 'rafa']

test('subscribeAuth fires on setSession and clearSession, and unsubscribe stops it', () => {
  let fires = 0
  const unsub = subscribeAuth(() => { fires += 1 })
  setSession('rafa', 'sess-1')
  assert.equal(fires, 1, 'setSession notifies (live-refresh the switcher)')
  clearSession('rafa')
  assert.equal(fires, 2, 'clearSession notifies')
  unsub()
  setSession('rafa', 'sess-2')
  assert.equal(fires, 2, 'no notification after unsubscribe')
  clearSession('rafa')
})

test('subscribeAuth: a throwing listener does not break the auth write or other listeners', () => {
  let good = 0
  const unsubBad = subscribeAuth(() => { throw new Error('listener bug') })
  const unsubGood = subscribeAuth(() => { good += 1 })
  setSession('helen', 'sess-h') // must not throw despite the bad listener
  assert.equal(getSession('helen'), 'sess-h', 'the session was still written')
  assert.equal(good, 1, 'the well-behaved listener still fired')
  unsubBad()
  unsubGood()
  clearSession('helen')
})

test('switcherList: ALL credentialed (pre-cutover + the e2e/axe matrix) → all pills, no add (unchanged dock)', () => {
  const { ids, canAdd } = switcherList(ORDER, () => true)
  assert.deepEqual(ids, ORDER)
  assert.equal(canAdd, false)
})

test('switcherList: NONE credentialed (a truly fresh device — no tokens, no sessions) → all pills, no add (never empty)', () => {
  const { ids, canAdd } = switcherList(ORDER, () => false)
  assert.deepEqual(ids, ORDER)
  assert.equal(canAdd, false)
})

test('switcherList: SOME credentialed (post-cutover) → narrows to enrolled + offers add', () => {
  const enrolled = new Set(['jonathan', 'helen'])
  const { ids, canAdd } = switcherList(ORDER, (t) => enrolled.has(t))
  assert.deepEqual(ids, ['jonathan', 'helen']) // aurelia + rafa hidden — the leak fix
  assert.equal(canAdd, true)
})

test('switcherList: a single enrolled persona → just them + add (shared-device first enroll)', () => {
  const { ids, canAdd } = switcherList(ORDER, (t) => t === 'rafa')
  assert.deepEqual(ids, ['rafa'])
  assert.equal(canAdd, true)
})

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
