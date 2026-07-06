// Sound honesty — a video ref's per-clip sound verdict ('carried' | 'none' |
// 'lost') survives the sync round-trip.
//
// Before this, postMemory's photoEntry whitelist (key/mime/lat/lng/capturedAt/
// posterKey) STRIPPED `sound` on the way in, so the honest "no sound" label a
// device showed at import time evaporated after the first push → pull. Policy:
// nobody is ever asked to re-import — a silent video is honestly labeled
// FOREVER, on every device, which requires the flag to be durable here.
//
// NON-VACUOUS: on the pre-fix serialize each round-tripped ref has
// sound === undefined, so the equality assertions go red (verified by running
// this file against the pre-fix worker/src/index.js).

import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import worker from '../src/index.js'
import { applySchema } from './helpers/schema.js'
import { seedSession } from './helpers/auth.js'

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

describe('sound honesty — ref.sound survives postMemory → rowToMemory', () => {
  beforeEach(async () => {
    await applySchema(env.DB)
    await seedSession(env.DB, TOKENS.jonathan, 'jonathan')
    await env.DB.prepare('DELETE FROM memories').run()
  })

  it('round-trips a video ref with sound:"lost" (and a "none"/"carried" sibling) via photoRefs[]', async () => {
    const res = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: {
        id: 'm-snd',
        tripId: 't1',
        kind: 'photo',
        visibility: 'shared',
        photoRefs: [
          { storage: 'r2', key: 'jonathan/m-snd/v0', mime: 'video/mp4', posterKey: 'jonathan/m-snd/v0-poster', sound: 'lost' },
          { storage: 'r2', key: 'jonathan/m-snd/v1', mime: 'video/mp4', posterKey: 'jonathan/m-snd/v1-poster', sound: 'none' },
          { storage: 'r2', key: 'jonathan/m-snd/v2', mime: 'video/mp4', posterKey: 'jonathan/m-snd/v2-poster', sound: 'carried' },
        ],
      },
    })
    expect(res.status).toBe(200)
    const mem = await res.json()
    expect(mem.photoRefs).toHaveLength(3)
    expect(mem.photoRefs[0].sound).toBe('lost')
    expect(mem.photoRefs[1].sound).toBe('none')
    expect(mem.photoRefs[2].sound).toBe('carried')

    // And a SECOND device's pull (GET, a fresh rowToMemory) sees it too.
    const pull = await call('/memories', { token: TOKENS.jonathan })
    expect(pull.status).toBe(200)
    const pulled = (await pull.json()).find((m) => m.id === 'm-snd')
    expect(pulled.photoRefs[0].sound).toBe('lost')
  })

  it('round-trips sound on a video PIECE (E4 heterogeneous moment)', async () => {
    // Videos ride pieces[] too (pieceEntry reuses photoEntry) — the mixed
    // moment path must carry the verdict the same way.
    const res = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: {
        id: 'm-piece',
        tripId: 't1',
        kind: 'photo',
        visibility: 'shared',
        pieces: [
          { kind: 'video', storage: 'r2', key: 'jonathan/m-piece/v', mime: 'video/mp4', posterKey: 'jonathan/m-piece/v-poster', sound: 'lost' },
          { kind: 'note', text: 'the waterfall was louder in person' },
        ],
      },
    })
    expect(res.status).toBe(200)
    const mem = await res.json()
    expect(mem.pieces[0].sound).toBe('lost')
    expect(mem.photoRefs[0].sound).toBe('lost') // the photo/video subset carries it too
  })

  it('mirrors a LONE poster-less video ref into photoRefs[] on sound alone (single-video path)', async () => {
    // A poster generation failure leaves a single video with no posterKey, no
    // coords, no date — the JSON mirror must still fire on `sound` or the
    // honest label dies cross-device (the scalar columns keep no flag).
    const res = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: {
        id: 'm-lone',
        tripId: 't1',
        kind: 'photo',
        visibility: 'shared',
        photoRef: { storage: 'r2', key: 'jonathan/m-lone/v', mime: 'video/mp4', sound: 'lost' },
      },
    })
    expect(res.status).toBe(200)
    const mem = await res.json()
    expect(mem.photoRefs).toHaveLength(1)
    expect(mem.photoRefs[0].sound).toBe('lost')
  })

  it('drops an invalid sound value — never persisted, never served', async () => {
    const res = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: {
        id: 'm-bad',
        tripId: 't1',
        kind: 'photo',
        visibility: 'shared',
        photoRefs: [
          { storage: 'r2', key: 'jonathan/m-bad/v', mime: 'video/mp4', posterKey: 'jonathan/m-bad/p', sound: 'yes' },
        ],
      },
    })
    expect(res.status).toBe(200)
    const mem = await res.json()
    expect('sound' in mem.photoRefs[0]).toBe(false)
    // The stored JSON itself never took the garbage value either.
    const row = await env.DB.prepare('SELECT photo_r2_keys_json FROM memories WHERE id = ?').bind('m-bad').first()
    expect(JSON.parse(row.photo_r2_keys_json)[0].sound).toBeUndefined()
  })

  it('keeps a soundless ref byte-identical to the legacy stored shape (no null pollution)', async () => {
    const res = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: {
        id: 'm-legacy',
        tripId: 't1',
        kind: 'photo',
        visibility: 'shared',
        photoRefs: [{ storage: 'r2', key: 'jonathan/m-legacy/p0', mime: 'image/jpeg' }],
      },
    })
    expect(res.status).toBe(200)
    const mem = await res.json()
    expect('sound' in mem.photoRefs[0]).toBe(false)
    // Stored JSON is exactly the pre-sound shape — an old client deserializes
    // it unchanged.
    const row = await env.DB.prepare('SELECT photo_r2_keys_json FROM memories WHERE id = ?').bind('m-legacy').first()
    expect(row.photo_r2_keys_json).toBe(JSON.stringify([{ key: 'jonathan/m-legacy/p0', mime: 'image/jpeg' }]))
  })
})
