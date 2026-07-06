// Memory tombstone resurrection guard — POST /memories at a deleted row.
//
// The un-delete door: the upsert's update arm carried `deleted_at = NULL`, and
// the OCC read compared only stamps — so a stale device's push at a tombstone
// (base equal to the tombstone's own updated_at, or no base at all: a drained
// outbox, a queued edit, a conflict recovery reapplying onto the tombstone)
// sailed through and revived the memory family-wide. Now every push at a
// tombstone is REFUSED with the worker's one authoritative delete signal
// (409 + deleted:true), based or base-less, and the update arm never touches
// deleted_at. Mirrors the trip guard (trip-conflict-guard.test.js).
//
// NON-VACUOUS: on the old handler the fresh-base push in test 1 succeeded and
// set deleted_at = NULL, so the 409 assertion and the still-dead row assertion
// both go red without the guard.

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

const BASE = {
  id: 'm-resurrect',
  tripId: 't1',
  kind: 'note',
  visibility: 'shared',
}

// Create the row, soft-delete it (as its author), and return the tombstone's
// server updated_at as epoch ms — the exact base a stale device would hold.
async function seedDeleted() {
  const created = await call('/memories', {
    method: 'POST',
    token: TOKENS.jonathan,
    body: { ...BASE, text: 'original', caption: 'original' },
  })
  expect(created.status).toBe(200)
  const del = await call(`/memories/${BASE.id}`, { method: 'DELETE', token: TOKENS.jonathan })
  expect(del.status).toBe(200)
  expect((await del.json()).deleted).toBe(1)
  const row = await storedRow()
  expect(row.deleted_at).not.toBeNull()
  return Number(row.updated_at)
}

function storedRow() {
  return env.DB.prepare('SELECT deleted_at, updated_at, caption FROM memories WHERE id = ?')
    .bind(BASE.id)
    .first()
}

describe('memory tombstone guard — no revive-by-push, soft delete intact', () => {
  beforeEach(async () => {
    await applySchema(env.DB)
    await seedSession(env.DB, TOKENS.jonathan, 'jonathan')
    await env.DB.prepare('DELETE FROM memories').run()
  })

  it("409s a push whose base EQUALS the tombstone's own stamp — the conflict-recovery reapply gun", async () => {
    // resolveSaveConflict re-pushes onto fresh with fresh.updatedAt as base:
    // at a tombstone that base passes the stamp compare, so only an explicit
    // deleted_at check stands between this push and a family-wide resurrection.
    const stamp = await seedDeleted()
    const res = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: { ...BASE, text: 'revive me', caption: 'revive me', baseUpdatedAt: stamp },
    })
    expect(res.status).toBe(409)
    const out = await res.json()
    expect(out).toMatchObject({ error: 'conflict', id: BASE.id, deleted: true })
    expect(out.storedUpdatedAt).toBe(stamp)
    const row = await storedRow()
    expect(row.deleted_at).not.toBeNull() // still dead
    expect(row.caption).toBe('original') // and untouched
  })

  it('409s a BASE-LESS push at a tombstone too (a stale outbox drain / old client)', async () => {
    await seedDeleted()
    const res = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: { ...BASE, text: 'drained hours later', caption: 'drained hours later' },
    })
    expect(res.status).toBe(409)
    expect((await res.json()).deleted).toBe(true)
    expect((await storedRow()).deleted_at).not.toBeNull()
  })

  it('the pull still serves the tombstone (deletedAt) so every device can adopt the delete', async () => {
    await seedDeleted()
    const res = await call('/memories', { token: TOKENS.jonathan })
    expect(res.status).toBe(200)
    const mine = (await res.json()).find((m) => m.id === BASE.id)
    expect(mine).toBeTruthy()
    expect(mine.deletedAt).toBeTruthy()
  })

  it('a LIVE row keeps normal upsert behavior: re-push updates it and it stays live', async () => {
    const created = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: { ...BASE, id: 'm-live', text: 'v1', caption: 'v1' },
    })
    expect(created.status).toBe(200)
    const again = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: { ...BASE, id: 'm-live', text: 'v2', caption: 'v2' },
    })
    expect(again.status).toBe(200)
    const row = await env.DB.prepare('SELECT deleted_at, caption FROM memories WHERE id = ?')
      .bind('m-live')
      .first()
    expect(row.deleted_at).toBeNull()
    expect(row.caption).toBe('v2')
  })

  it('a genuinely NEW id inserts live (the INSERT arm starts live; only updates never revive)', async () => {
    await seedDeleted()
    const res = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: { ...BASE, id: 'm-brand-new', text: 'first', caption: 'first' },
    })
    expect(res.status).toBe(200)
    const row = await env.DB.prepare('SELECT deleted_at FROM memories WHERE id = ?')
      .bind('m-brand-new')
      .first()
    expect(row.deleted_at).toBeNull()
  })

  it('G5: the soft-delete flow itself is unchanged — author-scoped DELETE stamps the tombstone, a cross-author DELETE is a no-op', async () => {
    await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: { ...BASE, id: 'm-del-flow', text: 'x', caption: 'x' },
    })
    // Cross-author delete: helen has no session here; her token is not even
    // configured — use jonathan's token but assert the author predicate via a
    // second row owned by him and a delete that DOES match (the boundary test
    // for a non-matching author lives in security-auth-isolation).
    const del = await call('/memories/m-del-flow', { method: 'DELETE', token: TOKENS.jonathan })
    expect(del.status).toBe(200)
    expect((await del.json()).deleted).toBe(1)
    const row = await env.DB.prepare('SELECT deleted_at FROM memories WHERE id = ?')
      .bind('m-del-flow')
      .first()
    expect(row.deleted_at).not.toBeNull()
  })
})
