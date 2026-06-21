// Migration 010 — Surprises masking survives the round-trip AND the server is
// the secret-keeper: GET /memories strips/substitutes per recipient BEFORE
// anything leaves the worker. This drives the REAL worker through a REAL
// (miniflare) D1 binding.
//
// NON-VACUOUS: the recipient-leak assertions search the FULL serialized
// response for the secret string — without the server-side mask in getMemories,
// the real title is right there and every recipient case goes red. The
// masked-projection guard can only pass if postMemory refuses a masked:true body
// (otherwise its null text clobbers the real row and the re-read loses it).

import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import worker from '../src/index.js'
import { applySchema } from './helpers/schema.js'
import { seedSession } from './helpers/auth.js'

const TOKENS = { jonathan: 'tok-j', helen: 'tok-h', aurelia: 'tok-a', rafa: 'tok-r' }
function authEnv() {
  return {
    ...env,
    DB: env.DB,
    FAMILY_TOKEN_JONATHAN: TOKENS.jonathan,
    FAMILY_TOKEN_HELEN: TOKENS.helen,
    FAMILY_TOKEN_AURELIA: TOKENS.aurelia,
    FAMILY_TOKEN_RAFA: TOKENS.rafa,
  }
}

async function call(path, { method = 'GET', token, body, origin = 'http://localhost:5173' } = {}) {
  const headers = { Origin: origin }
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['content-type'] = 'application/json'
  const req = new Request('https://worker.test' + path, {
    method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, authEnv(), ctx)
  await waitOnExecutionContext(ctx)
  return res
}

const SECRET_TITLE = 'FAO Schwarz — the giant floor piano'
const SECRET_DETAIL = 'Secret detour Saturday before the show.'

async function memsAs(token) {
  const res = await call('/memories', { token })
  expect(res.status).toBe(200)
  return res.json()
}

async function saveTeaser(over = {}) {
  return call('/memories', {
    method: 'POST', token: TOKENS.jonathan,
    body: {
      id: 'sp-teaser', tripId: 't1', stopId: null, authorTraveler: 'jonathan',
      visibility: 'shared', kind: 'text',
      hideFrom: ['rafa'], reveal: { type: 'date', at: 'June 15' }, conceal: 'teaser',
      surprise: { what: 'A photo', icon: '🖼️', title: SECRET_TITLE, detail: SECRET_DETAIL, tint: '#5C4A52' },
      ...over,
    },
  })
}

async function saveCover(over = {}) {
  return call('/memories', {
    method: 'POST', token: TOKENS.jonathan,
    body: {
      id: 'sp-cover', tripId: 't1', stopId: null, authorTraveler: 'jonathan',
      visibility: 'shared', kind: 'text',
      hideFrom: ['rafa', 'aurelia'], reveal: { type: 'arrival', at: '5th Avenue' }, conceal: 'cover',
      cover: { icon: '🚶', title: 'A walk down Fifth Avenue', loc: '5th Avenue', time: 'Sat · 1:00 PM', weather: 'Cold & windy', packing: 'Warm coats' },
      surprise: { what: 'A stop', icon: '🎹', title: SECRET_TITLE, detail: SECRET_DETAIL, tint: '#C24B2E' },
      ...over,
    },
  })
}

describe('migration 010 — Surprises masking is enforced server-side', () => {
  beforeEach(async () => {
    await applySchema(env.DB)
    await seedSession(env.DB, TOKENS.jonathan, 'jonathan')
    await seedSession(env.DB, TOKENS.helen, 'helen')
    await seedSession(env.DB, TOKENS.aurelia, 'aurelia')
    await seedSession(env.DB, TOKENS.rafa, 'rafa')
    await env.DB.prepare('DELETE FROM memories').run()
  })

  it('round-trips the masking fields to the AUTHOR (echo + GET), in full', async () => {
    const res = await saveTeaser()
    expect(res.status).toBe(200)
    const echo = await res.json()
    expect(echo.hideFrom).toEqual(['rafa'])
    expect(echo.conceal).toBe('teaser')
    expect(echo.reveal).toEqual({ type: 'date', at: 'June 15' })
    expect(echo.surprise.title).toBe(SECRET_TITLE)
    // GET as author → still full.
    const mine = (await memsAs(TOKENS.jonathan)).find((m) => m.id === 'sp-teaser')
    expect(mine.surprise.title).toBe(SECRET_TITLE)
  })

  it('TEASER: a recipient gets a stripped stub — the real title NEVER leaks', async () => {
    await saveTeaser()
    const all = await memsAs(TOKENS.rafa)
    const stub = all.find((m) => m.id === 'sp-teaser')
    expect(stub).toBeTruthy()
    expect(stub.masked).toBe(true)
    expect(stub.conceal).toBe('teaser')
    expect(stub.surprise).toEqual({ what: 'A photo' }) // ONLY the kind, no title/detail
    expect(stub.text).toBeUndefined()
    // The load-bearing assertion: the secret is nowhere in the recipient response.
    expect(JSON.stringify(all)).not.toContain(SECRET_TITLE)
    expect(JSON.stringify(all)).not.toContain(SECRET_DETAIL)
  })

  it('COVER: a recipient gets the stand-in (cover fields, real title NEVER)', async () => {
    await saveCover()
    const all = await memsAs(TOKENS.rafa)
    const sub = all.find((m) => m.id === 'sp-cover')
    expect(sub).toBeTruthy()
    expect(sub.isCover).toBe(true)
    expect(sub.masked).toBe(true)
    expect(sub.cover.weather).toBe('Cold & windy') // real constraint carried forward
    expect(sub.cover.title).toBe('A walk down Fifth Avenue')
    expect(sub.surprise).toBeUndefined()
    expect(JSON.stringify(all)).not.toContain(SECRET_TITLE)
    expect(JSON.stringify(all)).not.toContain(SECRET_DETAIL)
  })

  it('a NON-targeted family member sees the real row', async () => {
    await saveTeaser() // hidden from rafa only
    const helen = (await memsAs(TOKENS.helen)).find((m) => m.id === 'sp-teaser')
    expect(helen.surprise.title).toBe(SECRET_TITLE)
    expect(helen.masked).toBeUndefined()
  })

  it('REVEALED: once revealed_at is set, the recipient sees the real row', async () => {
    await saveTeaser()
    // Author re-saves with the reveal stamp (the manual "Reveal now").
    await saveTeaser({ revealed: '2026-06-15T12:00:00.000Z' })
    const rafa = (await memsAs(TOKENS.rafa)).find((m) => m.id === 'sp-teaser')
    expect(rafa.surprise.title).toBe(SECRET_TITLE)
    expect(rafa.masked).toBeUndefined()
  })

  it("hideFrom:['everyone'] masks every non-author", async () => {
    await call('/memories', {
      method: 'POST', token: TOKENS.helen,
      body: {
        id: 'sp-all', tripId: 't1', authorTraveler: 'helen', visibility: 'shared', kind: 'text',
        hideFrom: ['everyone'], conceal: 'teaser',
        surprise: { what: 'A memory', icon: '🎁', title: SECRET_TITLE, detail: '', tint: '#444' },
      },
    })
    expect((await memsAs(TOKENS.jonathan)).find((m) => m.id === 'sp-all').masked).toBe(true)
    expect((await memsAs(TOKENS.rafa)).find((m) => m.id === 'sp-all').masked).toBe(true)
    expect((await memsAs(TOKENS.helen)).find((m) => m.id === 'sp-all').surprise.title).toBe(SECRET_TITLE) // author
  })

  it('GUARD: a masked-projection push is refused and never clobbers the real row', async () => {
    await saveTeaser() // real row with the secret
    // Simulate a recipient device re-pushing the stub it received (masked:true).
    const res = await call('/memories', {
      method: 'POST', token: TOKENS.rafa,
      body: { id: 'sp-teaser', tripId: 't1', authorTraveler: 'jonathan', visibility: 'shared', masked: true, conceal: 'teaser', hideFrom: ['rafa'], surprise: { what: 'A photo' } },
    })
    expect(res.status).toBe(200)
    expect((await res.json()).skipped).toBe('masked-projection')
    // The author's real row is intact.
    const mine = (await memsAs(TOKENS.jonathan)).find((m) => m.id === 'sp-teaser')
    expect(mine.surprise.title).toBe(SECRET_TITLE)
  })

  it('COALESCE: a later content-only save keeps the surprise (no silent un-hide)', async () => {
    await saveTeaser()
    // Re-save the same id with NO masking fields (a stale caption edit).
    await call('/memories', {
      method: 'POST', token: TOKENS.jonathan,
      body: { id: 'sp-teaser', tripId: 't1', authorTraveler: 'jonathan', visibility: 'shared', kind: 'text', caption: 'edited' },
    })
    // Still masked for rafa.
    const rafa = (await memsAs(TOKENS.rafa)).find((m) => m.id === 'sp-teaser')
    expect(rafa.masked).toBe(true)
    expect(JSON.stringify(await memsAs(TOKENS.rafa))).not.toContain(SECRET_TITLE)
  })

  it('a legacy row (pre-010 NULL columns) deserializes with no masking keys', async () => {
    await env.DB.prepare(
      `INSERT INTO memories (id, trip_id, author_traveler, visibility, kind, text, created_at, updated_at)
       VALUES ('m-legacy', 't1', 'jonathan', 'shared', 'text', 'plain note', 1000, 1000)`
    ).run()
    const legacy = (await memsAs(TOKENS.jonathan)).find((m) => m.id === 'm-legacy')
    expect('hideFrom' in legacy).toBe(false)
    expect('conceal' in legacy).toBe(false)
    expect('masked' in legacy).toBe(false)
    expect(legacy.text).toBe('plain note')
  })
})
