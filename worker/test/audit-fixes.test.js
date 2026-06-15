// Audit fixes (unit A-worker) — identity-from-token, conversation isolation,
// author stamping, public-share surprise masking, and postTrip optimistic
// concurrency. All driven through the REAL worker against a REAL (miniflare) D1
// binding.
//
// NON-VACUOUS (the "no vacuous green" rule): every security case is constructed
// so the LEAK / clobber happens without the fix —
//   · conversation read: planting a foreign user_id, then reading as the wrong
//     traveler, returns the messages without the ownership check.
//   · author stamping: a write claiming someone else's authorTraveler would (a)
//     read back under the spoofed author and (b) on upsert re-author the row,
//     exempting it from masking — both refused here.
//   · public share: a surprise TRIP / STOP would leak its real name/dates to a
//     no-auth viewer without the extended isShareable gate.
//   · postTrip 409: a stale full-trip push silently clobbers a newer edit without
//     the base-version compare.

import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import worker from '../src/index.js'
import { applySchema } from './helpers/schema.js'

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

// ─── Identity from token: conversation ownership ──────────────────────────────

describe('ROOT 1 — conversation identity comes from the token, not the body', () => {
  beforeEach(async () => {
    await applySchema(env.DB)
    await env.DB.prepare('DELETE FROM conversations').run()
    await env.DB.prepare('DELETE FROM conversation_messages').run()
  })

  it('POST /claude/conversations stamps the AUTHENTICATED traveler, ignoring a spoofed user_id', async () => {
    // Rafa authenticates but tries to create a conversation owned by jonathan.
    const res = await call('/claude/conversations', {
      method: 'POST', token: TOKENS.rafa, body: { id: 'c-spoof', user_id: 'jonathan' },
    })
    expect(res.status).toBe(200)
    expect((await res.json()).user_id).toBe('rafa') // token wins, not the body
    // And the stored row is owned by rafa.
    const row = await env.DB.prepare('SELECT user_id FROM conversations WHERE id = ?').bind('c-spoof').first()
    expect(row.user_id).toBe('rafa')
  })

  it('GET /claude/conversations lists only the CALLER’s chats, never another id’s', async () => {
    // Two conversations, one each for jonathan and rafa.
    const now = new Date().toISOString()
    await env.DB.prepare('INSERT INTO conversations (id, user_id, trip_id, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)')
      .bind('c-jon', 'jonathan', now, now).run()
    await env.DB.prepare('INSERT INTO conversations (id, user_id, trip_id, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)')
      .bind('c-rafa', 'rafa', now, now).run()
    // Rafa asks for jonathan's list (spoofed query param) — must get only HIS.
    const res = await call('/claude/conversations?user_id=jonathan', { token: TOKENS.rafa })
    expect(res.status).toBe(200)
    const ids = (await res.json()).map((c) => c.id)
    expect(ids).toContain('c-rafa')
    expect(ids).not.toContain('c-jon') // THE boundary: jonathan's chat never leaks to rafa
  })

  it('GET /claude/conversations/:id/messages REFUSES another traveler’s conversation (404)', async () => {
    const now = new Date().toISOString()
    await env.DB.prepare('INSERT INTO conversations (id, user_id, trip_id, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)')
      .bind('c-jon', 'jonathan', now, now).run()
    await env.DB.prepare('INSERT INTO conversation_messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind('msg1', 'c-jon', 'user', 'jonathan secret question', now).run()

    // Author reads their own — 200 with the message.
    const mine = await call('/claude/conversations/c-jon/messages', { token: TOKENS.jonathan })
    expect(mine.status).toBe(200)
    expect((await mine.json()).length).toBe(1)

    // Rafa reads jonathan's conversation — 404, and the secret never appears.
    const theirs = await call('/claude/conversations/c-jon/messages', { token: TOKENS.rafa })
    expect(theirs.status).toBe(404)
    expect(await theirs.text()).not.toContain('jonathan secret question')
  })
})

// ─── Author stamped from token ────────────────────────────────────────────────

describe('postMemory stamps the author from the token, never the body', () => {
  beforeEach(async () => {
    await applySchema(env.DB)
    await env.DB.prepare('DELETE FROM memories').run()
  })

  async function saveMemory(token, body) {
    return call('/memories', { method: 'POST', token, body })
  }

  it('a write claiming someone else’s authorTraveler is stored under the CALLER', async () => {
    // Helen authenticates but claims jonathan as the author.
    const res = await saveMemory(TOKENS.helen, {
      id: 'm-spoof', visibility: 'shared', kind: 'text', text: 'hi', authorTraveler: 'jonathan',
    })
    expect(res.status).toBe(200)
    const row = await env.DB.prepare('SELECT author_traveler FROM memories WHERE id = ?').bind('m-spoof').first()
    expect(row.author_traveler).toBe('helen') // token wins
  })

  it('a non-owner CANNOT re-author an existing memory on upsert (author is immutable)', async () => {
    // Jonathan creates a shared memory.
    await saveMemory(TOKENS.jonathan, { id: 'm-own', visibility: 'shared', kind: 'text', text: 'original' })
    // Rafa upserts the same id, claiming himself as author (the spoof that would
    // exempt a hidden surprise from masking on the next read).
    const res = await saveMemory(TOKENS.rafa, { id: 'm-own', visibility: 'shared', kind: 'text', text: 'hijacked', authorTraveler: 'rafa' })
    expect(res.status).toBe(200)
    const row = await env.DB.prepare('SELECT author_traveler FROM memories WHERE id = ?').bind('m-own').first()
    expect(row.author_traveler).toBe('jonathan') // original author preserved
  })
})

// ─── Public share masks a surprise TRIP / STOP ───────────────────────────────

describe('public share refuses a memory whose parent TRIP or STOP is a secret', () => {
  beforeEach(async () => {
    await applySchema(env.DB)
    await env.DB.prepare('DELETE FROM memories').run()
    await env.DB.prepare('DELETE FROM trips').run()
    await env.DB.prepare('DELETE FROM shares').run()
  })

  // A normal (non-surprise) shared photo by aurelia on stop s1 of trip t1.
  async function savePhoto(over = {}) {
    return call('/memories', {
      method: 'POST', token: TOKENS.aurelia,
      body: {
        id: 'm-photo', tripId: 't1', stopId: 's1', authorTraveler: 'aurelia',
        visibility: 'shared', kind: 'photo', caption: 'a real tall ship',
        photoRefs: [{ storage: 'r2', key: 'aurelia/m-photo/p', mime: 'image/jpeg' }],
        ...over,
      },
    })
  }

  async function seedTrip(trip) {
    await env.DB.prepare('INSERT INTO trips (id, title, data_json, updated_at) VALUES (?, ?, ?, ?)')
      .bind(trip.id, trip.title, JSON.stringify(trip), 1000).run()
  }

  it('a SURPRISE-TRIP memory cannot be minted (409) and an existing link goes dark (410)', async () => {
    // Plain trip first → mint succeeds and resolves (working path).
    await seedTrip({ id: 't1', title: 'New England', days: [{ isoDate: '2026-06-03', stops: [{ id: 's1', name: 'Mystic Seaport' }] }] })
    await savePhoto()
    const { token } = await (await call('/share', { method: 'POST', token: TOKENS.aurelia, body: { memoryId: 'm-photo' } })).json()
    expect((await call(`/m/${token}`)).status).toBe(200)

    // The trip BECOMES a whole-trip surprise on the live row.
    await env.DB.prepare(
      `UPDATE trips SET data_json = json_set(data_json, '$.surprise', json(?)) WHERE id = 't1'`
    ).bind(JSON.stringify({ author: 'jonathan', hideFrom: ['everyone'], reveal: { type: 'manual' }, conceal: 'teaser' })).run()

    // The already-minted link now refuses to resolve — the secret trip never leaks.
    const page = await call(`/m/${token}?format=json`)
    expect(page.status).toBe(410)
    expect(await page.text()).not.toContain('New England')

    // And a fresh mint for a memory under the now-secret trip is refused.
    await savePhoto({ id: 'm-photo2' })
    const mint = await call('/share', { method: 'POST', token: TOKENS.aurelia, body: { memoryId: 'm-photo2' } })
    expect(mint.status).toBe(409)
  })

  it('a memory on a SURPRISE STOP cannot be shared (the stop name never leaks)', async () => {
    // s1 is an unrevealed per-stop surprise; the memory sits on it.
    await seedTrip({
      id: 't1', title: 'New England',
      days: [{ isoDate: '2026-06-03', stops: [{
        id: 's1', name: 'Cinderella Castle',
        surprise: { author: 'jonathan', hideFrom: ['everyone'], reveal: { type: 'manual' }, conceal: 'teaser' },
      }] }],
    })
    await savePhoto()
    const mint = await call('/share', { method: 'POST', token: TOKENS.aurelia, body: { memoryId: 'm-photo' } })
    expect(mint.status).toBe(409) // refused: the stop is a secret
    expect((await mint.json()).error).toBe('not-shareable')
  })

  it('a memory on a NON-surprise stop of a NON-surprise trip still shares (working path)', async () => {
    await seedTrip({ id: 't1', title: 'New England', days: [{ isoDate: '2026-06-03', stops: [{ id: 's1', name: 'Mystic Seaport' }] }] })
    await savePhoto()
    const { token } = await (await call('/share', { method: 'POST', token: TOKENS.aurelia, body: { memoryId: 'm-photo' } })).json()
    const view = await (await call(`/m/${token}?format=json`)).json()
    expect(view.tripName).toBe('New England')
    expect(view.place).toBe('Mystic Seaport')
  })
})

// ─── postTrip optimistic concurrency ─────────────────────────────────────────

describe('ROOT 3 — postTrip optimistic concurrency (409 on a stale base)', () => {
  beforeEach(async () => {
    await applySchema(env.DB)
    await env.DB.prepare('DELETE FROM trips').run()
  })

  async function pushTrip(trip, token = TOKENS.helen) {
    return call('/trips', { method: 'POST', token, body: trip })
  }

  it('a stale base (older than the stored updated_at) is refused with 409', async () => {
    // Initial save → capture the server-stamped updatedAt.
    const first = await pushTrip({ id: 'tc', title: 'v1', days: [] })
    const { updatedAt: base } = await first.json()
    expect(base).toBeGreaterThan(0)

    // Someone else saves in between → the stored row moves on. Force the stored
    // updated_at strictly past `base` so the test never flakes on a same-ms
    // Date.now() (the equal-base case is intentionally ALLOWED — see the fresh-base
    // test below; this case is specifically "the stored row is NEWER").
    await env.DB.prepare("UPDATE trips SET data_json = json_set(data_json, '$.title', 'v2'), updated_at = ? WHERE id = 'tc'")
      .bind(base + 1000).run()

    // A stale push carrying the ORIGINAL base is refused — it can't clobber v2.
    const stale = await pushTrip({ id: 'tc', title: 'v1-stale-edit', days: [], baseUpdatedAt: base })
    expect(stale.status).toBe(409)
    // v2 is intact in D1 (the stale edit never landed).
    const row = await env.DB.prepare('SELECT data_json FROM trips WHERE id = ?').bind('tc').first()
    expect(JSON.parse(row.data_json).title).toBe('v2')
  })

  it('a FRESH base is accepted (the up-to-date editor saves)', async () => {
    const first = await pushTrip({ id: 'tc', title: 'v1', days: [] })
    const { updatedAt: base } = await first.json()
    const ok = await pushTrip({ id: 'tc', title: 'v2', days: [], baseUpdatedAt: base })
    expect(ok.status).toBe(200)
    const row = await env.DB.prepare('SELECT data_json FROM trips WHERE id = ?').bind('tc').first()
    expect(JSON.parse(row.data_json).title).toBe('v2')
    // The transport-only base must NOT leak into stored trip data.
    expect(JSON.parse(row.data_json).baseUpdatedAt).toBeUndefined()
  })

  it('BACKWARD COMPATIBLE: no base supplied keeps last-write-wins (old clients unaffected)', async () => {
    await pushTrip({ id: 'tc', title: 'v1', days: [] })
    // A client that sends NO baseUpdatedAt always wins, even over a newer row.
    await pushTrip({ id: 'tc', title: 'v2', days: [] })
    const res = await pushTrip({ id: 'tc', title: 'v3-no-base', days: [] })
    expect(res.status).toBe(200)
    const row = await env.DB.prepare('SELECT data_json FROM trips WHERE id = ?').bind('tc').first()
    expect(JSON.parse(row.data_json).title).toBe('v3-no-base')
  })
})

// ─── getTrips never serves a draft ───────────────────────────────────────────

describe('getTrips defensively never serves a draft trip', () => {
  beforeEach(async () => {
    await applySchema(env.DB)
    await env.DB.prepare('DELETE FROM trips').run()
  })

  it('a draft:true trip is filtered out of the pull', async () => {
    await env.DB.prepare('INSERT INTO trips (id, title, data_json, updated_at) VALUES (?, ?, ?, ?)')
      .bind('t-draft', 'Draft', JSON.stringify({ id: 't-draft', title: 'Draft', draft: true, heroResolved: { key: 'x' } }), 1000).run()
    await env.DB.prepare('INSERT INTO trips (id, title, data_json, updated_at) VALUES (?, ?, ?, ?)')
      .bind('t-real', 'Real', JSON.stringify({ id: 't-real', title: 'Real', heroResolved: { key: 'x' } }), 1000).run()
    const res = await call('/trips', { token: TOKENS.jonathan })
    const ids = (await res.json()).map((t) => t.id)
    expect(ids).toContain('t-real')
    expect(ids).not.toContain('t-draft')
  })
})

// ─── ROOT 1 — deletes respect authorship + surprise masking ──────────────────

describe('ROOT 1 — deletes are authorship / surprise scoped', () => {
  beforeEach(async () => {
    await applySchema(env.DB)
    await env.DB.prepare('DELETE FROM memories').run()
    await env.DB.prepare('DELETE FROM trips').run()
  })

  it('a NON-author cannot delete another member’s memory (no-op, row survives); the author can', async () => {
    await call('/memories', { method: 'POST', token: TOKENS.jonathan, body: { id: 'm-del', visibility: 'shared', kind: 'text', text: 'mine' } })
    // Rafa (not the author) tries to delete → reported 0 rows changed, row untouched.
    const res = await call('/memories/m-del', { method: 'DELETE', token: TOKENS.rafa })
    expect(res.status).toBe(200)
    expect((await res.json()).deleted).toBe(0)
    const row = await env.DB.prepare('SELECT deleted_at FROM memories WHERE id = ?').bind('m-del').first()
    expect(row.deleted_at).toBeNull()
    // The author CAN delete it.
    const mine = await call('/memories/m-del', { method: 'DELETE', token: TOKENS.jonathan })
    expect((await mine.json()).deleted).toBe(1)
    const after = await env.DB.prepare('SELECT deleted_at FROM memories WHERE id = ?').bind('m-del').first()
    expect(after.deleted_at).not.toBeNull()
  })

  it('a member a SURPRISE trip is hidden FROM cannot delete it (they only saw the cover); the author can', async () => {
    const trip = { id: 't-secret', title: 'Disney', surprise: { author: 'jonathan', hideFrom: ['everyone'], reveal: { type: 'manual' }, conceal: 'cover' }, days: [] }
    await env.DB.prepare('INSERT INTO trips (id, title, data_json, updated_at) VALUES (?, ?, ?, ?)')
      .bind('t-secret', 'Disney', JSON.stringify(trip), 1000).run()
    // Helen (hidden-from) tries to delete → refused (no-op), the trip survives.
    const res = await call('/trips/t-secret', { method: 'DELETE', token: TOKENS.helen })
    expect((await res.json()).deleted).toBe(0)
    const row = await env.DB.prepare('SELECT deleted_at FROM trips WHERE id = ?').bind('t-secret').first()
    expect(row.deleted_at).toBeNull()
    // The author can delete their own surprise.
    await call('/trips/t-secret', { method: 'DELETE', token: TOKENS.jonathan })
    const after = await env.DB.prepare('SELECT deleted_at FROM trips WHERE id = ?').bind('t-secret').first()
    expect(after.deleted_at).not.toBeNull()
  })
})
