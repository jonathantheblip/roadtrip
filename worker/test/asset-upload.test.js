// Asset upload route — Unit 2 (worker layer).
//
// Regression guard for a real shipped-broken gap: the client uploads
// photos, audio, AND video to POST /assets/<kind>/:id (the importer's
// uploadOrQueueVideo and the single-photo dispatch path both POST
// /assets/video/:id), but the worker's upload route only matched
// (audio|photo) — so every video 404'd into the catch-all and stuck in
// the offline upload queue forever (retrying every 20s, never draining).
//
// NON-VACUOUS (the "no vacuous green" rule): the video case below was
// confirmed to FAIL (404) against the (audio|photo)-only regex BEFORE the
// fix, and pass (200 + R2 round-trip) after widening it to
// (audio|photo|video). The photo case is the working-path guard (G5) —
// it must keep passing. The bogus-kind case proves the widened regex
// stays a closed allow-list, not a wildcard.

import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import worker from '../src/index.js'
import { applySchema } from './helpers/schema.js'

// FAMILY_TOKEN_* are wrangler secrets (absent from the test runtime), so inject
// one so authenticate() can map a valid token → traveler 'jonathan' (the key
// prefix uploadAsset writes). Mirrors security-auth-isolation.test.js.
const TOKEN = 'tok-jonathan'
function authEnv() {
  return { ...env, DB: env.DB, FAMILY_TOKEN_JONATHAN: TOKEN }
}

async function postAsset(path, { body, contentType, token = TOKEN } = {}) {
  const headers = { Origin: 'http://localhost:5173' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (contentType) headers['Content-Type'] = contentType
  const req = new Request('https://worker.test' + path, { method: 'POST', headers, body })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, authEnv(), ctx)
  await waitOnExecutionContext(ctx)
  return res
}

describe('asset upload route', () => {
  beforeEach(async () => {
    await applySchema(env.DB)
  })

  it('POST /assets/video/:id is routed — stores the blob and round-trips from R2', async () => {
    // Arbitrary ftyp/mp42 header bytes — content is opaque to uploadAsset.
    const bytes = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32])
    const res = await postAsset('/assets/video/mem_vid_test', {
      body: bytes,
      contentType: 'video/mp4',
    })
    expect(res.status, 'video upload must be routed (it 404d into the catch-all)').toBe(200)
    const out = await res.json()
    expect(out.mime).toBe('video/mp4')
    expect(out.key).toMatch(/^jonathan\/mem_vid_test\/video-/)
    expect(typeof out.url).toBe('string')

    // Round-trip: the bytes + content-type survive into R2 and back out.
    const stored = await env.ASSETS.get(out.key)
    expect(stored, 'object should exist in R2 after upload').not.toBeNull()
    expect(stored.httpMetadata?.contentType).toBe('video/mp4')
    const back = new Uint8Array(await stored.arrayBuffer())
    expect(Array.from(back)).toEqual(Array.from(bytes))
  })

  it('POST /assets/photo/:id still works (working-path guard, G5)', async () => {
    const res = await postAsset('/assets/photo/mem_photo_test', {
      body: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
      contentType: 'image/jpeg',
    })
    expect(res.status).toBe(200)
    const out = await res.json()
    expect(out.key).toMatch(/^jonathan\/mem_photo_test\/photo-/)
    expect(out.mime).toBe('image/jpeg')
  })

  it('POST /assets/bogus/:id is NOT a route — the allow-list stays closed (404)', async () => {
    const res = await postAsset('/assets/bogus/mem_x', {
      body: new Uint8Array([1]),
      contentType: 'application/octet-stream',
    })
    expect(res.status).toBe(404)
  })
})
