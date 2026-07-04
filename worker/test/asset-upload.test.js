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
import { seedSession } from './helpers/auth.js'

// FAMILY_TOKEN_* are wrangler secrets (absent from the test runtime), so inject
// one so authenticate() can map a valid token → traveler 'jonathan' (the key
// prefix uploadAsset writes). Mirrors security-auth-isolation.test.js.
const TOKEN = 'tok-jonathan'
function authEnv() {
  return { ...env, DB: env.DB, FAMILY_TOKEN_JONATHAN: TOKEN }
}

async function postAsset(path, { body, contentType, token = TOKEN, env: envOverride } = {}) {
  const headers = { Origin: 'http://localhost:5173' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (contentType) headers['Content-Type'] = contentType
  const req = new Request('https://worker.test' + path, { method: 'POST', headers, body })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, { ...authEnv(), ...(envOverride || {}) }, ctx)
  await waitOnExecutionContext(ctx)
  return res
}

describe('asset upload route', () => {
  beforeEach(async () => {
    await applySchema(env.DB)
    await seedSession(env.DB, TOKEN, 'jonathan')
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

  it('POST /assets/video/:id with a RAW container (video/quicktime) is REFUSED (415) — storage firewall #1', async () => {
    // The exact class of the stranded 168MB clip: a raw .mov that never went
    // through the shrinker. It must never be stored. NON-VACUOUS: the identical
    // bytes labeled video/mp4 store fine (the routed-video test above).
    const bytes = new Uint8Array([0, 0, 0, 0x14, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20])
    const res = await postAsset('/assets/video/mem_raw_vid', {
      body: bytes,
      contentType: 'video/quicktime',
    })
    expect(res.status, 'a raw video must be refused, never stored').toBe(415)
    const listed = await env.ASSETS.list({ prefix: 'jonathan/mem_raw_vid/' })
    expect(listed.objects.length, 'nothing is stored for a refused raw video').toBe(0)
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

  it('POST /assets with an EMPTY body fails loud (400) — no 0-byte asset reported as stored', async () => {
    // A 0-byte body (a failed/aborted local encode, an empty File) used to return
    // 200 {key,url}: the client recorded a synced r2 ref that NEVER re-queued, so the
    // family later saw a broken/blank tile while the sync pill read "done". Now it
    // 400s (mirrors /transcribe's empty-audio guard) so the upload stays queued.
    // NON-VACUOUS: before the size guard this returned 200 with a key.
    const res = await postAsset('/assets/photo/mem_empty_test', {
      body: new Uint8Array([]), // 0 bytes
      contentType: 'image/jpeg',
    })
    expect(res.status, 'an empty upload must fail loud, not report success').toBe(400)
    // The phantom empty object was cleaned up, not left behind as a broken tile.
    const listed = await env.ASSETS.list({ prefix: 'jonathan/mem_empty_test/' })
    expect(listed.objects.length, 'no empty object should remain in R2').toBe(0)
  })

  it('POST /assets/video/:id over the size ceiling is REFUSED (413) — storage firewall #4, nothing stored', async () => {
    // Clips are 3:00-capped on-device, so a shrunk mp4 is size-bounded; the Worker
    // is the authoritative backstop against a pathologically large one (a hand-rolled
    // request / future encode bug). Inject a tiny ceiling so a small fixture trips it.
    // NON-VACUOUS: the identical bytes under the generous default ceiling store fine
    // (the routed-video test above returns 200).
    const bytes = new Uint8Array(64).fill(0x6d) // 64 bytes > the injected 10-byte ceiling
    const res = await postAsset('/assets/video/mem_big_over', {
      body: bytes,
      contentType: 'video/mp4',
      env: { VIDEO_MAX_STORED_BYTES: '10' },
    })
    expect(res.status, 'an over-ceiling video must be refused, never stored').toBe(413)
    const listed = await env.ASSETS.list({ prefix: 'jonathan/mem_big_over/' })
    expect(listed.objects.length, 'nothing stored for a refused over-ceiling video').toBe(0)
  })

  it('the size ceiling is VIDEO-ONLY — a photo over the same threshold still stores (working path, G5)', async () => {
    // The ceiling exists because a video is length-bounded; photos are not gated by
    // it. A 64-byte photo with the tiny video ceiling injected must still 200, or the
    // backstop would be a silent photo-import regression.
    const res = await postAsset('/assets/photo/mem_photo_big', {
      body: new Uint8Array(64).fill(0xff),
      contentType: 'image/jpeg',
      env: { VIDEO_MAX_STORED_BYTES: '10' },
    })
    expect(res.status, 'the video ceiling must not touch photos').toBe(200)
  })
})

// Multipart upload (large videos over CF's ~100MB single-POST cap): create → part(s)
// → complete, all through the R2 binding. NON-VACUOUS: proves parts stitch into one
// R2 object of the summed size, that a key outside the caller's prefix is refused, and
// that a bad create is rejected.
describe('multipart asset upload', () => {
  beforeEach(async () => {
    await applySchema(env.DB)
    await seedSession(env.DB, TOKEN, 'jonathan')
  })

  async function mpu(step, { method = 'POST', body, json: isJson = false, query = '', token = TOKEN, env: envOverride } = {}) {
    const headers = { Origin: 'http://localhost:5173' }
    if (token) headers.Authorization = `Bearer ${token}`
    if (isJson) headers['Content-Type'] = 'application/json'
    const req = new Request('https://worker.test/assets/mpu/' + step + query, { method, headers, body })
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, { ...authEnv(), ...(envOverride || {}) }, ctx)
    await waitOnExecutionContext(ctx)
    return res
  }

  it('create → parts → complete stitches a multi-part video into one R2 object', async () => {
    const cRes = await mpu('create', { json: true, body: JSON.stringify({ kind: 'video', memoryId: 'mem_big_vid', contentType: 'video/mp4' }) })
    expect(cRes.status).toBe(200)
    const { key, uploadId } = await cRes.json()
    expect(key, 'key is minted under the caller prefix').toMatch(/^jonathan\/mem_big_vid\/video-/)
    expect(typeof uploadId).toBe('string')

    // R2 requires each non-last part >= 5MB; part 1 is 5MB, part 2 is the small tail.
    const partA = new Uint8Array(5 * 1024 * 1024).fill(0x41)
    const partB = new Uint8Array([0x42, 0x42, 0x42])
    const q = (n) => `?key=${encodeURIComponent(key)}&uploadId=${encodeURIComponent(uploadId)}&partNumber=${n}`
    const p1 = await (await mpu('part', { method: 'PUT', body: partA, query: q(1) })).json()
    const p2 = await (await mpu('part', { method: 'PUT', body: partB, query: q(2) })).json()
    expect(p1.partNumber).toBe(1)
    expect(typeof p1.etag).toBe('string')

    const compRes = await mpu('complete', { json: true, body: JSON.stringify({ key, uploadId, parts: [p1, p2] }) })
    expect(compRes.status).toBe(200)
    const out = await compRes.json()
    expect(out.key).toBe(key)
    expect(out.mime).toBe('video/mp4')

    // The assembled object is in R2 at the summed size + right content-type.
    const stored = await env.ASSETS.get(key)
    expect(stored, 'the stitched object exists in R2').not.toBeNull()
    expect(stored.size).toBe(partA.length + partB.length)
    expect(stored.httpMetadata?.contentType).toBe('video/mp4')
  })

  it('a part for a key OUTSIDE the caller prefix is forbidden (403)', async () => {
    const { uploadId } = await (await mpu('create', { json: true, body: JSON.stringify({ kind: 'video', memoryId: 'mem_x', contentType: 'video/mp4' }) })).json()
    const foreignKey = 'helen/mem_x/video-deadbeef00'
    const q = `?key=${encodeURIComponent(foreignKey)}&uploadId=${encodeURIComponent(uploadId)}&partNumber=1`
    const res = await mpu('part', { method: 'PUT', body: new Uint8Array([1, 2, 3]), query: q })
    expect(res.status).toBe(403)
  })

  it('multipart create for a RAW video (video/quicktime) is REFUSED (415) — storage firewall #1', async () => {
    // A raw container must not even be able to BEGIN a multipart upload.
    // NON-VACUOUS: the identical create with video/mp4 succeeds (the stitch test above).
    const res = await mpu('create', {
      json: true,
      body: JSON.stringify({ kind: 'video', memoryId: 'mem_raw_mpu', contentType: 'video/quicktime' }),
    })
    expect(res.status).toBe(415)
  })

  it('create with a bad kind is rejected (400)', async () => {
    const res = await mpu('create', { json: true, body: JSON.stringify({ kind: 'bogus', memoryId: 'm' }) })
    expect(res.status).toBe(400)
  })

  it('complete over the size ceiling is REFUSED (413) + the stitched object is deleted — storage firewall #4', async () => {
    // The assembled size is only knowable at complete (parts arrive separately), so
    // the ceiling is enforced there: the just-stitched object is deleted and the
    // client keeps its queued copy (never records a bogus success). Inject a tiny
    // ceiling; the ~5MB stitch trips it. NON-VACUOUS: the same stitch under the
    // default ceiling 200s (the create→parts→complete test above).
    const tiny = { VIDEO_MAX_STORED_BYTES: '10' }
    const { key, uploadId } = await (await mpu('create', {
      json: true,
      body: JSON.stringify({ kind: 'video', memoryId: 'mem_mpu_over', contentType: 'video/mp4' }),
      env: tiny,
    })).json()
    const partA = new Uint8Array(5 * 1024 * 1024).fill(0x41)
    const partB = new Uint8Array([0x42, 0x42, 0x42])
    const q = (n) => `?key=${encodeURIComponent(key)}&uploadId=${encodeURIComponent(uploadId)}&partNumber=${n}`
    const p1 = await (await mpu('part', { method: 'PUT', body: partA, query: q(1), env: tiny })).json()
    const p2 = await (await mpu('part', { method: 'PUT', body: partB, query: q(2), env: tiny })).json()
    const compRes = await mpu('complete', {
      json: true,
      body: JSON.stringify({ key, uploadId, parts: [p1, p2] }),
      env: tiny,
    })
    expect(compRes.status, 'an over-ceiling assembled video must be refused').toBe(413)
    const stored = await env.ASSETS.get(key)
    expect(stored, 'the over-ceiling stitched object is deleted, not left behind').toBeNull()
  })
})
