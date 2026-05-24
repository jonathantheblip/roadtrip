import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

// Polyfill localStorage for Node so the upload log can be exercised
// outside the browser. The module reads/writes the global; this fake
// stays in-process and resets between tests.
class MemStorage {
  constructor() {
    this.map = new Map()
  }
  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null
  }
  setItem(k, v) {
    this.map.set(k, String(v))
  }
  removeItem(k) {
    this.map.delete(k)
  }
  clear() {
    this.map.clear()
  }
}
globalThis.localStorage = new MemStorage()

const {
  clearUploadLog,
  isDevModeEnabled,
  logUploadEvent,
  readUploadLog,
  uploadLogAsText,
  uploadLogHistogram,
} = await import('../../src/lib/uploadLog.js')

beforeEach(() => {
  globalThis.localStorage.clear()
  clearUploadLog()
})

test('logUploadEvent persists structured entries', () => {
  logUploadEvent({
    code: 'network',
    message: 'fetch failed',
    fileMeta: { name: 'beach.heic', size: 4_000_000, type: 'image/heic' },
    attempt: 1,
  })
  const log = readUploadLog()
  assert.equal(log.length, 1)
  assert.equal(log[0].code, 'network')
  assert.equal(log[0].bucket, 'A')
  assert.equal(log[0].fileMeta.name, 'beach.heic')
  assert.ok(log[0].ts.startsWith('20')) // ISO timestamp
})

test('histogram groups by code', () => {
  logUploadEvent({ code: 'network' })
  logUploadEvent({ code: 'network' })
  logUploadEvent({ code: 'storage-quota' })
  const hist = uploadLogHistogram()
  assert.equal(hist.network, 2)
  assert.equal(hist['storage-quota'], 1)
})

test('uploadLogAsText assembles a maintainer-readable dump', () => {
  logUploadEvent({
    code: 'worker-5xx',
    message: 'worker 500',
    fileMeta: { name: 'p.jpg', size: 12345, type: 'image/jpeg' },
  })
  const text = uploadLogAsText()
  assert.match(text, /Upload log/)
  assert.match(text, /worker-5xx/)
  assert.match(text, /worker 500/)
  assert.match(text, /name=p\.jpg/)
})

test('isDevModeEnabled honors the localStorage flag', () => {
  assert.equal(isDevModeEnabled(), false)
  globalThis.localStorage.setItem('rt_dev_mode', 'true')
  assert.equal(isDevModeEnabled(), true)
  globalThis.localStorage.setItem('rt_dev_mode', 'false')
  assert.equal(isDevModeEnabled(), false)
})

test('ring buffer trims to most recent 200 entries', () => {
  for (let i = 0; i < 250; i++) {
    logUploadEvent({ code: 'network', message: `entry ${i}` })
  }
  const log = readUploadLog()
  assert.equal(log.length, 200)
  // Oldest 50 dropped; newest entry should be the last one logged.
  assert.equal(log[log.length - 1].message, 'entry 249')
  // The first surviving entry was index 50 in the original sequence.
  assert.equal(log[0].message, 'entry 50')
})
