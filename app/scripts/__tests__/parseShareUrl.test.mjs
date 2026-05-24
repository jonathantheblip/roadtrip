import { test } from 'node:test'
import assert from 'node:assert/strict'

const { parseShareUrl, isResolvableShortHost, ALLOWED_HOSTS } = await import(
  '../../src/lib/shareIn/parseShareUrl.js'
)

test('parseShareUrl returns kind=unknown for empty / invalid input', () => {
  assert.equal(parseShareUrl(undefined).kind, 'unknown')
  assert.equal(parseShareUrl('').kind, 'unknown')
  assert.equal(parseShareUrl('not a url').kind, 'unknown')
})

test('parseShareUrl extracts name + coords from a Google /maps/place/ URL', () => {
  const r = parseShareUrl(
    'https://www.google.com/maps/place/Sift+Bake+Shop/@41.3722,-71.9667,17z'
  )
  assert.equal(r.kind, 'long')
  assert.equal(r.name, 'Sift Bake Shop')
  assert.ok(Math.abs(r.lat - 41.3722) < 1e-6)
  assert.ok(Math.abs(r.lng + 71.9667) < 1e-6)
})

test('parseShareUrl prefers !3d/!4d place coords over the @ map-center coords', () => {
  const r = parseShareUrl(
    'https://www.google.com/maps/place/Spot/@41.0000,-72.0000,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d41.5000!4d-72.5000'
  )
  assert.equal(r.kind, 'long')
  assert.equal(r.lat, 41.5)
  assert.equal(r.lng, -72.5)
})

test('parseShareUrl parses the ?q= + ?ll= short form on maps.google.com', () => {
  const r = parseShareUrl('https://maps.google.com/?q=Hugo%27s&ll=29.7424,-95.4096')
  assert.equal(r.kind, 'long')
  assert.equal(r.name, "Hugo's")
  assert.equal(r.lat, 29.7424)
  assert.equal(r.lng, -95.4096)
})

test('parseShareUrl flags short URLs as kind=short for Worker resolve', () => {
  const a = parseShareUrl('https://maps.app.goo.gl/abc123')
  const b = parseShareUrl('https://goo.gl/maps/xyz')
  assert.equal(a.kind, 'short')
  assert.equal(b.kind, 'short')
  assert.equal(a.hostname, 'maps.app.goo.gl')
  assert.equal(b.hostname, 'goo.gl')
})

test('parseShareUrl handles Apple Maps q + ll', () => {
  const r = parseShareUrl(
    'https://maps.apple.com/?q=Sift+Bake+Shop&ll=41.3722,-71.9667'
  )
  assert.equal(r.kind, 'apple')
  assert.equal(r.name, 'Sift Bake Shop')
  assert.equal(r.lat, 41.3722)
  assert.equal(r.lng, -71.9667)
})

test('parseShareUrl handles Apple Maps coordinate + name', () => {
  const r = parseShareUrl(
    'https://maps.apple.com/place?coordinate=41.3722,-71.9667&name=Sift+Bake+Shop&address=5+Water+St'
  )
  assert.equal(r.kind, 'apple')
  assert.equal(r.name, 'Sift Bake Shop')
  assert.equal(r.address, '5 Water St')
  assert.equal(r.lat, 41.3722)
})

test('parseShareUrl returns kind=unknown for unrelated hosts', () => {
  const r = parseShareUrl('https://www.example.com/some/page')
  assert.equal(r.kind, 'unknown')
})

test('parseShareUrl drops out-of-range coords (parser sanity-checks)', () => {
  const r = parseShareUrl('https://www.google.com/maps/place/X/@9999,-9999,17z')
  // Both values are out of range so they normalize to null.
  assert.equal(r.lat, null)
  assert.equal(r.lng, null)
})

test('isResolvableShortHost matches both supported short hosts (case-insensitive)', () => {
  assert.equal(isResolvableShortHost('maps.app.goo.gl'), true)
  assert.equal(isResolvableShortHost('GOO.GL'), true)
  assert.equal(isResolvableShortHost('example.com'), false)
})

test('ALLOWED_HOSTS exposes the same hosts the Worker allowlist must mirror', () => {
  assert.ok(ALLOWED_HOSTS.short.includes('maps.app.goo.gl'))
  assert.ok(ALLOWED_HOSTS.long.includes('maps.google.com'))
  assert.ok(ALLOWED_HOSTS.apple.includes('maps.apple.com'))
})
