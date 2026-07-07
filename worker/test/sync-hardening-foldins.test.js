// The three A-3-review Stage-B hardening fold-ins, worker half:
//  1. postTrip push-vs-delete race (the twin of the shipped memory fix).
//  2. Live-row stamp MONOTONICITY on both memory + trip upserts — a stored
//     stamp can never regress, so a stuck-stale wedge is impossible.
// (The client half — mergeFromRemote skip-pending-intent — is in the app unit
// suite.)
//
// NON-VACUOUS: against the pre-fold-in upsert the postTrip race test 200s +
// revives/regresses the tombstone, and the monotonicity tests see the stamp go
// BACKWARD to the racing/earlier value.

import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import worker from '../src/index.js'
import { applySchema } from './helpers/schema.js'
import { seedSession } from './helpers/auth.js'

const TOK = 'tok-jonathan'
function authEnv(dbOverride) {
  return { ...env, DB: dbOverride || env.DB, FAMILY_TOKEN_JONATHAN: TOK }
}
async function call(path, { method = 'GET', body, dbOverride } = {}) {
  const headers = { Origin: 'http://localhost:5173', Authorization: `Bearer ${TOK}` }
  if (body !== undefined) headers['content-type'] = 'application/json'
  const req = new Request('https://worker.test' + path, {
    method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, authEnv(dbOverride), ctx)
  await waitOnExecutionContext(ctx)
  return res
}

const TRIP = { id: 't-hard', title: 'Cabin', dateRangeStart: '2026-08-01', dateRangeEnd: '2026-08-02', days: [], heroImage: 'https://example.test/h.jpg' }

// Stub the FIRST postTrip guard read (SELECT data_json, updated_at, deleted_at
// FROM trips) to report the row still LIVE — the snapshot the racing push took
// before the delete landed — while the real row is already tombstoned.
function raceDB(liveStamp) {
  let done = false
  return new Proxy(env.DB, {
    get(target, prop) {
      if (prop === 'prepare') {
        return (sql) => {
          if (!done && /SELECT data_json, updated_at, deleted_at FROM trips/.test(sql)) {
            done = true
            return { bind: () => ({ first: async () => ({ data_json: '{}', updated_at: liveStamp, deleted_at: null }) }) }
          }
          return target.prepare(sql)
        }
      }
      const v = Reflect.get(target, prop, target)
      return typeof v === 'function' ? v.bind(target) : v
    },
  })
}

describe('A-3 fold-ins — postTrip race + live-row stamp monotonicity', () => {
  beforeEach(async () => {
    await applySchema(env.DB)
    await seedSession(env.DB, TOK, 'jonathan')
    await env.DB.prepare('DELETE FROM trips').run()
    await env.DB.prepare('DELETE FROM memories').run()
  })

  it('postTrip refuses a racing push at a trip tombstone; the tombstone keeps its stamp + stays deleted', async () => {
    const created = await call('/trips', { method: 'POST', body: TRIP })
    const liveStamp = (await created.json()).updatedAt
    await call('/trips/t-hard', { method: 'DELETE' })
    // Push the tombstone's stamp into the future so a regression would be visible.
    await env.DB.prepare('UPDATE trips SET updated_at = updated_at + 600000 WHERE id = ?').bind('t-hard').run()
    const tombStamp = Number((await env.DB.prepare('SELECT updated_at FROM trips WHERE id=?').bind('t-hard').first()).updated_at)

    const res = await call('/trips', { method: 'POST', body: { ...TRIP, title: 'racer', baseUpdatedAt: liveStamp }, dbOverride: raceDB(liveStamp) })
    expect(res.status).toBe(409)
    expect((await res.json()).deleted).toBe(true)
    const row = await env.DB.prepare('SELECT updated_at, deleted_at, data_json FROM trips WHERE id=?').bind('t-hard').first()
    expect(row.deleted_at).not.toBeNull() // still deleted
    expect(Number(row.updated_at)).toBe(tombStamp) // stamp never regressed
    expect(row.data_json).not.toContain('racer') // content never overwritten
  })

  it('a MEMORY stamp never regresses: a save onto a future-stamped row advances past it, not back to now', async () => {
    await call('/memories', { method: 'POST', body: { id: 'mm', tripId: 't', kind: 'note', visibility: 'shared', text: 'a' } })
    // Simulate a concurrent write that stamped this row far in the future.
    const future = Date.now() + 3_600_000
    await env.DB.prepare('UPDATE memories SET updated_at = ? WHERE id = ?').bind(future, 'mm').run()
    // A normal save now (server stamps Date.now() < future). Monotonicity must
    // carry the stored stamp to future+1, never back to the earlier now.
    const res = await call('/memories', { method: 'POST', body: { id: 'mm', tripId: 't', kind: 'note', visibility: 'shared', text: 'b' } })
    const returned = await res.json()
    const stored = Number((await env.DB.prepare('SELECT updated_at FROM memories WHERE id=?').bind('mm').first()).updated_at)
    expect(stored).toBe(future + 1)
    expect(stored).toBeGreaterThan(future) // never regressed
    expect(Date.parse(returned.updatedAt)).toBe(stored) // client gets the ACTUAL stamp as its OCC base
  })

  it('a TRIP stamp never regresses, and the response carries the actual advanced stamp', async () => {
    const created = await call('/trips', { method: 'POST', body: TRIP })
    const base = (await created.json()).updatedAt
    const future = Date.now() + 3_600_000
    await env.DB.prepare('UPDATE trips SET updated_at = ? WHERE id = ?').bind(future, 't-hard').run()
    const res = await call('/trips', { method: 'POST', body: { ...TRIP, title: 'v2', baseUpdatedAt: future } })
    const returned = await res.json()
    const stored = Number((await env.DB.prepare('SELECT updated_at FROM trips WHERE id=?').bind('t-hard').first()).updated_at)
    expect(stored).toBe(future + 1)
    expect(returned.updatedAt).toBe(stored) // NOT Date.now() — the client's next OCC base must match the row
    expect(base).toBeLessThan(stored)
  })
})
