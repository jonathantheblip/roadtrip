// The push-vs-delete race at the memory upsert — tombstone stamp regression.
//
// postMemory stamps updated_at BEFORE its awaits; a DELETE landing between the
// guard's stored-row read and the upsert used to hit the ON CONFLICT arm,
// which preserved deleted_at (no resurrection) but still overwrote every
// content column and wrote the push's EARLIER stamp over the tombstone's —
// updated_at went BACKWARD. getMemories is an `updated_at > since` delta: any
// device whose cursor had already passed the regressed stamp would never be
// handed the tombstone, so the delete silently never propagated. This is the
// A-3 live-channel prerequisite: a delta pull is only trustworthy if a
// tombstone's stamp can never regress.
//
// The race is reproduced at its exact seam: the guard read is stubbed to see
// the row still LIVE (exactly what the racing push saw), while the real D1 row
// is already tombstoned by the time the real upsert executes. The tombstone's
// stamp is pushed 10 minutes into the future first, so the racing push's
// Date.now() stamp is strictly OLDER — the regression direction the wild race
// produces.
//
// NON-VACUOUS: on the old upsert (no WHERE arm, no changes check) the racing
// push returns 200, the tombstone's caption is overwritten, its updated_at
// regresses, and the since-delta stops delivering it — every assertion below
// goes red without the fix.

import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import worker from '../src/index.js'
import { applySchema } from './helpers/schema.js'
import { seedSession } from './helpers/auth.js'

const TOKENS = { jonathan: 'tok-jonathan' }
function authEnv(overrides = {}) {
  return { ...env, DB: env.DB, FAMILY_TOKEN_JONATHAN: TOKENS.jonathan, ...overrides }
}

async function call(path, { method = 'GET', token, body, dbOverride } = {}) {
  const headers = { Origin: 'http://localhost:5173' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['content-type'] = 'application/json'
  const req = new Request('https://worker.test' + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, authEnv(dbOverride ? { DB: dbOverride } : {}), ctx)
  await waitOnExecutionContext(ctx)
  return res
}

const BASE = {
  id: 'm-race',
  tripId: 't1',
  kind: 'note',
  visibility: 'shared',
}

function storedRow() {
  return env.DB.prepare('SELECT deleted_at, updated_at, caption FROM memories WHERE id = ?')
    .bind(BASE.id)
    .first()
}

// Wrap the real D1 so the FIRST guard read (`SELECT updated_at, deleted_at
// FROM memories`) reports the row still LIVE at `liveStamp` — the snapshot the
// racing push took before the delete landed. Every other statement (including
// the post-upsert re-read, which reuses the same SQL) hits the real database.
function raceDB(liveStamp) {
  let intercepted = false
  return new Proxy(env.DB, {
    get(target, prop) {
      if (prop === 'prepare') {
        return (sql) => {
          if (!intercepted && /SELECT updated_at, deleted_at FROM memories/.test(sql)) {
            intercepted = true
            return {
              bind: () => ({
                first: async () => ({ updated_at: liveStamp, deleted_at: null }),
              }),
            }
          }
          return target.prepare(sql)
        }
      }
      const v = Reflect.get(target, prop, target)
      return typeof v === 'function' ? v.bind(target) : v
    },
  })
}

describe('memory push-vs-delete race — the tombstone stamp never regresses', () => {
  let liveStamp // the row's stamp while it was still alive (the racer's snapshot)
  let tombStamp // the tombstone's stamp (deliberately in the future — see header)

  beforeEach(async () => {
    await applySchema(env.DB)
    await seedSession(env.DB, TOKENS.jonathan, 'jonathan')
    await env.DB.prepare('DELETE FROM memories').run()

    const created = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: { ...BASE, text: 'original', caption: 'original' },
    })
    expect(created.status).toBe(200)
    liveStamp = Number((await storedRow()).updated_at)

    const del = await call(`/memories/${BASE.id}`, { method: 'DELETE', token: TOKENS.jonathan })
    expect(del.status).toBe(200)
    // Push the tombstone's stamp 10 minutes ahead so the racing push (stamped
    // Date.now() inside the handler) is strictly OLDER — the wild race's shape,
    // where the delete stamped AFTER the push had already taken its stamp.
    await env.DB.prepare('UPDATE memories SET updated_at = updated_at + 600000 WHERE id = ?')
      .bind(BASE.id)
      .run()
    tombStamp = Number((await storedRow()).updated_at)
    expect((await storedRow()).deleted_at).not.toBeNull()
  })

  it('refuses the racing push with the delete signal; the tombstone keeps its stamp and content', async () => {
    const res = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: { ...BASE, text: 'racer', caption: 'racer', baseUpdatedAt: liveStamp },
      dbOverride: raceDB(liveStamp),
    })
    expect(res.status).toBe(409)
    const out = await res.json()
    expect(out.deleted).toBe(true)
    expect(out.storedUpdatedAt).toBe(tombStamp)

    const row = await storedRow()
    expect(row.deleted_at).not.toBeNull()
    expect(Number(row.updated_at)).toBe(tombStamp) // never regressed
    expect(row.caption).toBe('original') // never overwritten
  })

  it('a since-delta cursor past the racing stamp still receives the tombstone', async () => {
    await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: { ...BASE, text: 'racer', caption: 'racer', baseUpdatedAt: liveStamp },
      dbOverride: raceDB(liveStamp),
    })
    // A device whose cursor sits just below the tombstone's stamp — i.e. it has
    // already pulled everything the racing push could have stamped. On the old
    // code the tombstone's stamp regressed beneath this cursor and vanished
    // from the delta forever.
    const res = await call(`/memories?since=${tombStamp - 1}`, { token: TOKENS.jonathan })
    expect(res.status).toBe(200)
    const rows = await res.json()
    const tomb = rows.find((r) => r.id === BASE.id)
    expect(tomb).toBeTruthy()
    expect(tomb.deletedAt).toBeTruthy()
  })

  it('the WHERE arm never blocks an ordinary live-row update', async () => {
    // A fresh, never-deleted memory: the guarded update arm must apply exactly
    // as before (this pins that the race fix cannot over-block normal saves).
    const first = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: { id: 'm-live', tripId: 't1', kind: 'note', visibility: 'shared', text: 'v1', caption: 'v1' },
    })
    expect(first.status).toBe(200)
    const base = Number(
      (await env.DB.prepare('SELECT updated_at FROM memories WHERE id = ?').bind('m-live').first())
        .updated_at
    )
    const second = await call('/memories', {
      method: 'POST',
      token: TOKENS.jonathan,
      body: { id: 'm-live', tripId: 't1', kind: 'note', visibility: 'shared', text: 'v2', caption: 'v2', baseUpdatedAt: base },
    })
    expect(second.status).toBe(200)
    const row = await env.DB.prepare('SELECT caption, deleted_at FROM memories WHERE id = ?')
      .bind('m-live')
      .first()
    expect(row.caption).toBe('v2')
    expect(row.deleted_at).toBeNull()
  })
})
