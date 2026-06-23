// Cross-device "Wave hi!" (016) — the rules that must hold server-side, run
// against a REAL D1 binding through worker.fetch (like proposals/presence).
//
// NON-VACUOUS: every check fails if the rule it guards breaks —
//   - the SENDER is the SESSION, never a body-supplied id (trust the body → spoof);
//   - a viewer only ever sees / dismisses waves addressed to THEM (drop the
//     to-filter → cross-read someone else's waves);
//   - you can't wave yourself; a wave carries no location/content;
//   - the cron purges SEEN waves + stale unseen;
//   - a missing table degrades (GET → [], writes → 503), never 500s.

import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import worker from '../src/index.js'
import { applySchema } from './helpers/schema.js'
import { seedSession } from './helpers/auth.js'
import { listUnseenWaves, runWavePurge } from '../src/waves.js'

const TOK = { jonathan: 'tok-jonathan', helen: 'tok-helen', aurelia: 'tok-aurelia', rafa: 'tok-rafa' }
beforeEach(async () => {
  await applySchema(env.DB)
  for (const t of Object.keys(TOK)) await seedSession(env.DB, TOK[t], t)
  await env.DB.prepare('DELETE FROM waves').run()
})

async function call(path, { method = 'GET', token, body } = {}) {
  const headers = { Origin: 'http://localhost:5173' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['content-type'] = 'application/json'
  const req = new Request('https://worker.test' + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, env, ctx)
  await waitOnExecutionContext(ctx)
  return res
}

function wave(token, over = {}) {
  return call('/waves', { method: 'POST', token, body: { id: over.id || `w-${Math.random().toString(36).slice(2)}`, tripId: 'trip-1', to: 'helen', ...over } })
}
const unseenFor = (token, trip = 'trip-1') => call(`/waves?tripId=${trip}`, { token }).then((r) => r.json())

describe('waves — send + receive', () => {
  it('rafa waves mama; she receives it; the SENDER is the session, not the body', async () => {
    const res = await wave(TOK.rafa, { id: 'w1', to: 'helen', from: 'aurelia' }) // body lies "from aurelia"
    expect(res.status).toBe(200)
    const hers = await unseenFor(TOK.helen)
    expect(hers).toHaveLength(1)
    expect(hers[0]).toMatchObject({ id: 'w1', from: 'rafa', to: 'helen' }) // session sender, not body's "aurelia"
    // no location / content leaked — just identities + a timestamp
    expect(Object.keys(hers[0]).sort()).toEqual(['createdAt', 'from', 'id', 'seenAt', 'to', 'tripId'])
  })

  it('a viewer only sees waves addressed to THEM', async () => {
    await wave(TOK.rafa, { id: 'a', to: 'helen' })
    await wave(TOK.rafa, { id: 'b', to: 'jonathan' })
    expect((await unseenFor(TOK.helen)).map((w) => w.id)).toEqual(['a'])
    expect((await unseenFor(TOK.jonathan)).map((w) => w.id)).toEqual(['b'])
    expect(await unseenFor(TOK.aurelia)).toEqual([])
  })

  it('bidirectional — mama can wave rafa right back', async () => {
    await wave(TOK.helen, { id: 'back', to: 'rafa' })
    expect((await unseenFor(TOK.rafa)).map((w) => w.id)).toEqual(['back'])
  })

  it('you cannot wave yourself (400)', async () => {
    const res = await wave(TOK.rafa, { to: 'rafa' })
    expect(res.status).toBe(400)
  })

  it('rejects an unknown recipient + a missing id (400)', async () => {
    expect((await wave(TOK.rafa, { to: 'nobody' })).status).toBe(400)
    expect((await call('/waves', { method: 'POST', token: TOK.rafa, body: { tripId: 'trip-1', to: 'helen' } })).status).toBe(400)
  })

  it('an unauthenticated request is rejected (401)', async () => {
    expect((await call('/waves?tripId=trip-1')).status).toBe(401)
  })
})

describe('waves — seen (shows once)', () => {
  it('marking seen drops it from the unseen list — and only the recipient can', async () => {
    await wave(TOK.rafa, { id: 'w1', to: 'helen' })
    // jonathan (not the recipient) can't dismiss helen's wave
    await call('/waves/seen', { method: 'POST', token: TOK.jonathan, body: { ids: ['w1'] } })
    expect((await unseenFor(TOK.helen)).map((w) => w.id)).toEqual(['w1']) // still there
    // helen marks her own seen
    const r = await (await call('/waves/seen', { method: 'POST', token: TOK.helen, body: { ids: ['w1'] } })).json()
    expect(r.seen).toBe(1)
    expect(await unseenFor(TOK.helen)).toEqual([])
  })
})

describe('waves — cron purge', () => {
  it('drops SEEN waves + STALE unseen, keeps fresh unseen', async () => {
    const now = Date.now()
    await wave(TOK.rafa, { id: 'fresh', to: 'helen' })
    await wave(TOK.rafa, { id: 'seen', to: 'jonathan' })
    await call('/waves/seen', { method: 'POST', token: TOK.jonathan, body: { ids: ['seen'] } })
    // a stale unseen wave (created 100h ago)
    await env.DB.prepare('INSERT INTO waves (id, trip_id, from_traveler, to_traveler, created_at) VALUES (?,?,?,?,?)')
      .bind('stale', 'trip-1', 'rafa', 'aurelia', now - 100 * 3600 * 1000).run()

    const res = await runWavePurge(env.DB, { now })
    expect(res.purged).toBe(2) // seen + stale
    expect((await unseenFor(TOK.helen)).map((w) => w.id)).toEqual(['fresh']) // fresh survives
    expect(await listUnseenWaves(env.DB, 'trip-1', 'aurelia')).toEqual([]) // stale gone
  })
})

describe('waves — pre-migration degrade', () => {
  it('listUnseenWaves returns [] when the table is missing', async () => {
    const db = { prepare() { return { bind() { return { all() { throw new Error('D1_ERROR: no such table: waves') } } } } } }
    await expect(listUnseenWaves(db, 'trip-1', 'helen')).resolves.toEqual([])
  })
  it('a non-table error still propagates (narrow swallow)', async () => {
    const db = { prepare() { return { bind() { return { all() { throw new Error('D1_ERROR: disk full') } } } } } }
    await expect(listUnseenWaves(db, 'trip-1', 'helen')).rejects.toThrow(/disk full/)
  })
})
