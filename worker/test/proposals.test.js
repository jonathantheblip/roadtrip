// Propose → decide (014) — the rules that must hold server-side, run against a
// REAL D1 binding through the real worker.fetch (like auth.test.js).
//
// NON-VACUOUS by construction: every check fails if the rule it guards is
// removed —
//   - the proposer is the SESSION traveler, never a body-supplied one (trust the
//     body → identity spoof);
//   - only the DECIDERS (adults) can accept/decline; a kid's decide is 403
//     (drop canDecide → rafa decides);
//   - decide is atomic on status='pending' (drop the WHERE → a decided idea
//     re-flips / two adults double-decide);
//   - "I'm in" toggles (vote twice → back to none);
//   - a missing table degrades to [] for reads (widen/remove the swallow → a
//     pre-migration deploy 500s).

import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import worker from '../src/index.js'
import { applySchema } from './helpers/schema.js'
import { seedSession } from './helpers/auth.js'
import { listProposals } from '../src/proposals.js'

const TOK = { jonathan: 'tok-jonathan', helen: 'tok-helen', aurelia: 'tok-aurelia', rafa: 'tok-rafa' }

beforeEach(async () => {
  await applySchema(env.DB)
  for (const t of Object.keys(TOK)) await seedSession(env.DB, TOK[t], t)
  // Clean slate so counts/lists are deterministic across the persistent store.
  await env.DB.prepare('DELETE FROM proposals').run()
})

async function call(path, { method = 'GET', token, body } = {}) {
  const headers = { Origin: 'http://localhost:5173' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['content-type'] = 'application/json'
  const req = new Request('https://worker.test' + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, env, ctx)
  await waitOnExecutionContext(ctx)
  return res
}

const SPOT = { id: 'place-1', title: 'JJ Hapgood Store', cat: 'meal', travel: { mode: 'drive', minutes: 8 } }

async function propose(token, over = {}) {
  return call('/proposals', {
    method: 'POST',
    token,
    body: { id: over.id || `prop-${Math.random().toString(36).slice(2)}`, tripId: 'trip-1', spotId: 'place-1', spot: SPOT, ...over },
  })
}

describe('proposals — create + list', () => {
  it('a child can propose; the proposer is the SESSION, never the body', async () => {
    // Rafa proposes but LIES in the body that helen proposed it.
    const res = await propose(TOK.rafa, { id: 'p1', proposedBy: 'helen', by: 'helen' })
    expect(res.status).toBe(200)

    const list = await (await call('/proposals?tripId=trip-1', { token: TOK.jonathan })).json()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('p1')
    expect(list[0].proposedBy).toBe('rafa') // the session, not the body's "helen"
    expect(list[0].status).toBe('pending')
    expect(list[0].spot.title).toBe('JJ Hapgood Store')
  })

  it('lists only the asked trip; empty trip → []', async () => {
    await propose(TOK.jonathan, { id: 'a', tripId: 'trip-1' })
    await propose(TOK.jonathan, { id: 'b', tripId: 'trip-2' })
    const one = await (await call('/proposals?tripId=trip-1', { token: TOK.helen })).json()
    expect(one.map((p) => p.id)).toEqual(['a'])
    const none = await (await call('/proposals?tripId=trip-none', { token: TOK.helen })).json()
    expect(none).toEqual([])
  })

  it('rejects a create with no id', async () => {
    const res = await call('/proposals', { method: 'POST', token: TOK.helen, body: { tripId: 'trip-1', spotId: 'x' } })
    expect(res.status).toBe(400)
  })
})

describe('proposals — vote ("I\'m in")', () => {
  it('toggles the voter on and back off', async () => {
    await propose(TOK.jonathan, { id: 'p1' })
    let r = await (await call('/proposals/p1/vote', { method: 'POST', token: TOK.rafa })).json()
    expect(r.votes).toContain('rafa')
    r = await (await call('/proposals/p1/vote', { method: 'POST', token: TOK.rafa })).json()
    expect(r.votes).not.toContain('rafa')
  })

  it('voting an unknown proposal → 404', async () => {
    const res = await call('/proposals/nope/vote', { method: 'POST', token: TOK.aurelia })
    expect(res.status).toBe(404)
  })
})

describe('proposals — decide (ADULTS ONLY, the load-bearing rule)', () => {
  it('an adult accepts → status accepted, decidedBy set', async () => {
    await propose(TOK.aurelia, { id: 'p1' })
    const res = await call('/proposals/p1/decide', { method: 'POST', token: TOK.jonathan, body: { decision: 'accepted' } })
    expect(res.status).toBe(200)
    const list = await (await call('/proposals?tripId=trip-1', { token: TOK.aurelia })).json()
    expect(list[0].status).toBe('accepted')
    expect(list[0].decidedBy).toBe('jonathan')
  })

  it('a CHILD cannot decide → 403, status unchanged', async () => {
    await propose(TOK.jonathan, { id: 'p1' })
    for (const kid of [TOK.aurelia, TOK.rafa]) {
      const res = await call('/proposals/p1/decide', { method: 'POST', token: kid, body: { decision: 'accepted' } })
      expect(res.status).toBe(403)
    }
    const list = await (await call('/proposals?tripId=trip-1', { token: TOK.jonathan })).json()
    expect(list[0].status).toBe('pending')
  })

  it('cannot double-decide (atomic on pending) → 409 the second time', async () => {
    await propose(TOK.rafa, { id: 'p1' })
    const first = await call('/proposals/p1/decide', { method: 'POST', token: TOK.helen, body: { decision: 'accepted' } })
    expect(first.status).toBe(200)
    const second = await call('/proposals/p1/decide', { method: 'POST', token: TOK.jonathan, body: { decision: 'declined' } })
    expect(second.status).toBe(409)
    const list = await (await call('/proposals?tripId=trip-1', { token: TOK.helen })).json()
    expect(list[0].status).toBe('accepted') // the first decision stands
  })

  it('rejects a bad decision value → 400', async () => {
    await propose(TOK.jonathan, { id: 'p1' })
    const res = await call('/proposals/p1/decide', { method: 'POST', token: TOK.helen, body: { decision: 'maybe' } })
    expect(res.status).toBe(400)
  })
})

describe('proposals — auth gate', () => {
  it('an unauthenticated request is rejected', async () => {
    const res = await call('/proposals?tripId=trip-1') // no token
    expect(res.status).toBe(401)
  })
})

describe('proposals — pre-migration degrade', () => {
  it('listProposals returns [] when the table is missing (no 500)', async () => {
    const throwingDb = {
      prepare() {
        return {
          bind() {
            return { all() { throw new Error('D1_ERROR: no such table: proposals') } }
          },
        }
      },
    }
    await expect(listProposals(throwingDb, 'trip-1')).resolves.toEqual([])
  })

  it('a NON-table D1 error still propagates (the swallow is narrow)', async () => {
    const throwingDb = {
      prepare() {
        return { bind() { return { all() { throw new Error('D1_ERROR: disk full') } } } }
      },
    }
    await expect(listProposals(throwingDb, 'trip-1')).rejects.toThrow(/disk full/)
  })
})
