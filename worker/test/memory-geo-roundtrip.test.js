// LEG-C — per-photo EXIF location + capture date survive the sync round-trip.
//
// Before this, postMemory serialized photoRefs[] as {key, mime} only
// (worker/src/index.js), so lat/lng/capturedAt were dropped server-side and a
// device's own next pull (memoryStore.mergeFromRemote wholesale-replace) could
// erase its locally-correct GPS + capture date. This drives the REAL worker
// through a REAL (miniflare) D1 binding and asserts the full contract.
//
// NON-VACUOUS: on the OLD serialize (`.map((r) => ({ key, mime }))`) the
// round-tripped photoRefs[0] has lat === undefined, so the equality assertions
// go red. The test can only pass if the data actually survives D1.

import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import worker from '../src/index.js'
import { applySchema } from './helpers/schema.js'

const TOKENS = { jonathan: 'tok-jonathan' }
function authEnv() {
  return { ...env, DB: env.DB, FAMILY_TOKEN_JONATHAN: TOKENS.jonathan }
}

async function call(path, { method = 'GET', token, body, origin = 'http://localhost:5173' } = {}) {
  const headers = { Origin: origin }
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['content-type'] = 'application/json'
  const req = new Request('https://worker.test' + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, authEnv(), ctx)
  await waitOnExecutionContext(ctx)
  return res
}

const LOC = { lat: 41.4943, lng: -72.09163, capturedAt: '2026-05-24T17:02:29.000Z' }

describe('LEG-C — photoRefs lat/lng/capturedAt survive postMemory → rowToMemory', () => {
  beforeEach(async () => {
    await applySchema(env.DB)
    await env.DB.prepare('DELETE FROM memories').run()
  })

  it('round-trips a photo with GPS + capture date through real D1', async () => {
    const res = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: {
        id: 'm-geo',
        tripId: 't1',
        kind: 'photo',
        visibility: 'shared',
        photoRefs: [
          { storage: 'r2', key: 'jonathan/m-geo/p0', mime: 'image/jpeg', ...LOC },
          // A sibling photo with NO GPS — must come back as {key, mime} only,
          // never lat:null/lng:null (the client treats null as "no fallback").
          { storage: 'r2', key: 'jonathan/m-geo/p1', mime: 'image/jpeg' },
        ],
      },
    })
    expect(res.status).toBe(200)
    const mem = await res.json()
    expect(mem.photoRefs).toHaveLength(2)

    const [withGps, without] = mem.photoRefs
    expect(withGps.lat).toBe(LOC.lat)
    expect(withGps.lng).toBe(LOC.lng)
    expect(withGps.capturedAt).toBe(LOC.capturedAt)
    expect(withGps.lng).toBeLessThan(0) // sign preserved, not abs()'d

    expect('lat' in without).toBe(false)
    expect('lng' in without).toBe(false)
    expect('capturedAt' in without).toBe(false)
  })

  it('deserializes a legacy {key, mime} row written before LEG-C (back-compat)', async () => {
    // A row stored by the OLD serialize — no lat/lng/capturedAt in the JSON.
    await env.DB.prepare(
      `INSERT INTO memories
         (id, author_traveler, visibility, kind, photo_r2_keys_json, created_at, updated_at)
       VALUES (?, 'jonathan', 'shared', 'photo', ?, 1000, 1000)`
    ).bind('m-old', JSON.stringify([{ key: 'jonathan/m-old/p0', mime: 'image/jpeg' }])).run()

    const res = await call('/memories', { token: TOKENS.jonathan })
    expect(res.status).toBe(200)
    const old = (await res.json()).find((m) => m.id === 'm-old')
    expect(old).toBeTruthy()
    expect(old.photoRefs[0].key).toBe('jonathan/m-old/p0')
    expect(old.photoRefs[0].mime).toBe('image/jpeg')
    expect('lat' in old.photoRefs[0]).toBe(false) // no null pollution
  })

  it('mirrors a single-photo dispatch ref WITH coords into photoRefs[] (cross-device, no migration)', async () => {
    // Dispatch (AddDispatchModal) sends a lone photoRef, not photoRefs[] — its
    // scalar columns drop coords. The mirror puts them in the JSON column so a
    // SECOND device pulling this memory still gets the location + date.
    const res = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: {
        id: 'm-disp',
        tripId: 't1',
        kind: 'photo',
        visibility: 'shared',
        photoRef: { storage: 'r2', key: 'jonathan/m-disp/p', mime: 'image/jpeg', ...LOC },
      },
    })
    expect(res.status).toBe(200)
    const mem = await res.json()
    expect(mem.photoRefs).toHaveLength(1)
    expect(mem.photoRefs[0].lat).toBe(LOC.lat)
    expect(mem.photoRefs[0].lng).toBe(LOC.lng)
    expect(mem.photoRefs[0].capturedAt).toBe(LOC.capturedAt)
  })

  it('does NOT create photoRefs[] for a coordless single photo (stays scalar-only)', async () => {
    const res = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: {
        id: 'm-plain',
        tripId: 't1',
        kind: 'photo',
        visibility: 'shared',
        photoRef: { storage: 'r2', key: 'jonathan/m-plain/p', mime: 'image/jpeg' },
      },
    })
    expect(res.status).toBe(200)
    const mem = await res.json()
    expect(mem.photoRef).toBeTruthy()
    expect(mem.photoRefs).toBeUndefined() // no mirror when there is nothing to preserve
  })
})
