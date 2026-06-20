// Memory-sync conflict guard — optimistic concurrency on POST /memories.
//
// Before this, postMemory was blind last-write-wins: a STALE background push
// (poster-retry / capturedAt / reveal firing on a copy that had gone stale) got
// a brand-new server updated_at and reverted a newer edit made on another device.
// The guard mirrors postTrip: when the client sends `baseUpdatedAt` (the server
// updated_at it last saw) and the stored row has moved on, refuse with 409 and
// leave the stored row UNCHANGED.
//
// NON-VACUOUS: on the OLD blind-LWW handler the stale POST in test 1 would
// succeed and overwrite the caption, so the 409 assertion + the
// caption-unchanged assertion both go red. They can only pass if the guard
// actually rejects the stale write before the upsert.

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

const BASE = {
  id: 'm-conflict',
  tripId: 't1',
  kind: 'note',
  visibility: 'shared',
}

// Create the row and return the server-stamped updated_at as epoch ms.
async function seed(caption) {
  const res = await call('/memories', {
    method: 'POST',
    token: TOKENS.jonathan,
    body: { ...BASE, text: caption, caption },
  })
  expect(res.status).toBe(200)
  const row = await res.json()
  return Date.parse(row.updatedAt) // rowToMemory returns ISO; convert to epoch
}

async function storedCaption() {
  const res = await call('/memories', { token: TOKENS.jonathan })
  expect(res.status).toBe(200)
  const all = await res.json()
  return all.find((m) => m.id === BASE.id)?.caption ?? null
}

describe('POST /memories optimistic-concurrency (409) guard', () => {
  beforeEach(async () => {
    await applySchema(env.DB)
    await env.DB.prepare('DELETE FROM memories').run()
  })

  it('refuses a STALE push (base < stored) with 409 and leaves the row unchanged', async () => {
    const stored = await seed('original caption')
    // Someone else is "behind": they edit against a base 1ms older than stored.
    const res = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: { ...BASE, text: 'STALE clobber', caption: 'STALE clobber', baseUpdatedAt: stored - 1 },
    })
    expect(res.status).toBe(409)
    const err = await res.json()
    expect(err.error).toBe('conflict')
    expect(err.id).toBe(BASE.id)
    expect(err.storedUpdatedAt).toBe(stored)
    // The stale write must NOT have landed.
    expect(await storedCaption()).toBe('original caption')
  })

  it('accepts a push with NO base (old client → last-write-wins unchanged)', async () => {
    await seed('original caption')
    const res = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: { ...BASE, text: 'new', caption: 'new' }, // no baseUpdatedAt
    })
    expect(res.status).toBe(200)
    expect(await storedCaption()).toBe('new')
  })

  it('accepts a push whose base EQUALS stored (a self re-push is not a conflict)', async () => {
    const stored = await seed('original caption')
    const res = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: { ...BASE, text: 'edited', caption: 'edited', baseUpdatedAt: stored },
    })
    expect(res.status).toBe(200)
    expect(await storedCaption()).toBe('edited')
  })

  it('strips baseUpdatedAt so it never lands as memory data', async () => {
    const stored = await seed('original caption')
    const res = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: { ...BASE, text: 'edited', caption: 'edited', baseUpdatedAt: stored },
    })
    const row = await res.json()
    expect(row.baseUpdatedAt).toBeUndefined()
  })

  it('accepts a base GREATER than stored (clock/replay anomaly → no false-conflict)', async () => {
    const stored = await seed('original caption')
    const res = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: { ...BASE, text: 'ahead', caption: 'ahead', baseUpdatedAt: stored + 1000 },
    })
    expect(res.status).toBe(200)
    expect(await storedCaption()).toBe('ahead')
  })

  it('creates a NEW row even when a (leftover) base is sent (storedRow null → no false-conflict)', async () => {
    const res = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: { ...BASE, id: 'm-fresh', text: 'first', caption: 'first', baseUpdatedAt: 1 },
    })
    expect(res.status).toBe(200)
    const all = await (await call('/memories', { token: TOKENS.jonathan })).json()
    expect(all.find((m) => m.id === 'm-fresh')?.caption).toBe('first')
  })

  it('a non-finite base is ignored (treated as no base → proceeds)', async () => {
    await seed('original caption')
    const res = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: { ...BASE, text: 'new', caption: 'new', baseUpdatedAt: 'not-a-number' },
    })
    expect(res.status).toBe(200)
    expect(await storedCaption()).toBe('new')
  })
})
