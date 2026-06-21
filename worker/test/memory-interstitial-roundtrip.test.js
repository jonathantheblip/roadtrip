// Migration 007 — the memory-level "from stop A to stop B" interstitial
// identity survives the sync round-trip (postMemory → rowToMemory).
//
// Before 007 the worker had no column for it, so an interstitial photo
// round-tripped with `interstitial === undefined` and the album rendered it
// "Unfiled." This drives the REAL worker through a REAL (miniflare) D1
// binding and asserts the full contract.
//
// NON-VACUOUS: without the new column + serialize, every `interstitial`
// assertion below reads undefined and the test goes red. The COALESCE case
// can only pass if ON CONFLICT preserves the stored identity across a
// re-save that omits the field (a stale cached client editing a caption).

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

// A photo memory needs a renderable source or postMemory rejects it (400);
// every case here carries a single photoRef so the interstitial field is the
// only variable under test.
const REF = { storage: 'r2', key: 'jonathan/m/p0', mime: 'image/jpeg' }

describe('migration 007 — memory.interstitial survives postMemory → rowToMemory', () => {
  beforeEach(async () => {
    await applySchema(env.DB)
    await seedSession(env.DB, TOKENS.jonathan, 'jonathan')
    await env.DB.prepare('DELETE FROM memories').run()
  })

  it('round-trips {before, after} stop ids; stopId stays null (not a stop)', async () => {
    const res = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: {
        id: 'm-int',
        tripId: 't1',
        kind: 'photo',
        visibility: 'shared',
        stopId: null,
        photoRef: { ...REF, key: 'jonathan/m-int/p0' },
        interstitial: { before: 's1', after: 's2' },
      },
    })
    expect(res.status).toBe(200)
    const mem = await res.json()
    expect(mem.interstitial).toEqual({ before: 's1', after: 's2' })
    // The photo is genuinely at no stop — the identity rides ALONGSIDE a
    // null stop, it does not masquerade as one.
    expect(mem.stopId).toBeUndefined()
  })

  it('preserves a null day-edge endpoint (before null, after set)', async () => {
    const res = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: {
        id: 'm-edge',
        tripId: 't1',
        kind: 'photo',
        visibility: 'shared',
        photoRef: { ...REF, key: 'jonathan/m-edge/p0' },
        interstitial: { before: null, after: 's2' },
      },
    })
    expect(res.status).toBe(200)
    const mem = await res.json()
    expect(mem.interstitial).toEqual({ before: null, after: 's2' })
  })

  it('a non-interstitial memory comes back with NO interstitial key (no pollution)', async () => {
    const res = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: {
        id: 'm-plain',
        tripId: 't1',
        kind: 'photo',
        visibility: 'shared',
        stopId: 's1',
        photoRef: { ...REF, key: 'jonathan/m-plain/p0' },
      },
    })
    expect(res.status).toBe(200)
    const mem = await res.json()
    expect('interstitial' in mem).toBe(false)
    expect(mem.stopId).toBe('s1')
  })

  it('deserializes a legacy row written before 007 (NULL column → no interstitial)', async () => {
    await env.DB.prepare(
      `INSERT INTO memories
         (id, author_traveler, visibility, kind, photo_r2_key, created_at, updated_at)
       VALUES (?, 'jonathan', 'shared', 'photo', ?, 1000, 1000)`
    ).bind('m-legacy', 'jonathan/m-legacy/p0').run()

    const res = await call('/memories', { token: TOKENS.jonathan })
    expect(res.status).toBe(200)
    const legacy = (await res.json()).find((m) => m.id === 'm-legacy')
    expect(legacy).toBeTruthy()
    expect('interstitial' in legacy).toBe(false)
  })

  it('ON CONFLICT COALESCE preserves the identity when a later save omits it', async () => {
    // First save: the reconcile pass sets the interstitial identity.
    await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: {
        id: 'm-keep',
        tripId: 't1',
        kind: 'photo',
        visibility: 'shared',
        photoRef: { ...REF, key: 'jonathan/m-keep/p0' },
        interstitial: { before: 's1', after: 's2' },
      },
    })
    // Second save of the SAME id WITHOUT the field — e.g. a caption edit from
    // a stale cached client that predates 007. COALESCE must keep the stored
    // identity rather than letting the NULL erase it.
    const res = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: {
        id: 'm-keep',
        tripId: 't1',
        kind: 'photo',
        visibility: 'shared',
        caption: 'edited later',
        photoRef: { ...REF, key: 'jonathan/m-keep/p0' },
      },
    })
    expect(res.status).toBe(200)
    const mem = await res.json()
    expect(mem.caption).toBe('edited later')
    expect(mem.interstitial).toEqual({ before: 's1', after: 's2' })
  })
})
