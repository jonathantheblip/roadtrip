// Security tier — CHECK 1 (auth boundary) + CHECK 4 (private-memory isolation).
// QA_COVERAGE_SYSTEM_SPEC.md §5, build-list item 5. Runs on the existing
// miniflare scaffold (Unit 1) against a REAL D1 binding.
//
// NON-VACUOUS (the "no vacuous green" rule): each check is proven to FAIL on a
// planted violation, not merely pass clean. Recorded red-then-green:
//   - Auth: neutering the gate at worker/src/index.js:74 (`if (!traveler)`)
//     makes the no-token routes return 200/404 → the 401 assertions go red.
//   - Isolation: widening the getMemories WHERE clause (worker/src/index.js:196,
//     e.g. `OR 1=1`) leaks Jonathan's private memory to Helen → red.
//
// AUTH-BOUNDARY FORM (design decision): the worker's auth gate
// (worker/src/index.js:73-76) is a SINGLE chokepoint that runs BEFORE route
// matching, and GET /assets/:key (handled at :53, above the gate) is the only
// pre-gate handler. So without a valid token EVERY other path — including
// unknown ones that would otherwise 404 — must 401. We assert that across the
// full handled route set PLUS adversarial unknown paths, and assert /assets is
// reachable unauthenticated. True complement-enumeration ("the set of
// public routes == {GET /assets/:key}") isn't feasible against an imperative
// if-chain — a brand-new handler placed above the gate wouldn't be in our probe
// list — so this is the strongest feasible form: it catches any weakening of
// the chokepoint and any of the known routes losing its gate.

import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import worker from '../src/index.js'
import { applySchema } from './helpers/schema.js'
import { seedSession } from './helpers/auth.js'

// FAMILY_TOKEN_* are wrangler secrets (NOT in wrangler.toml), so the test
// runtime has none by default — every request would 401 regardless of the gate,
// which would make the auth test vacuously pass. Inject two travelers' tokens so
// authenticate() can actually map a valid token to a traveler.
const TOKENS = { jonathan: 'tok-jonathan', helen: 'tok-helen' }
function authEnv() {
  return {
    ...env,
    DB: env.DB,
    FAMILY_TOKEN_JONATHAN: TOKENS.jonathan,
    FAMILY_TOKEN_HELEN: TOKENS.helen,
  }
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

// Every route the worker handles behind the gate, plus adversarial unknown
// paths. None of these is GET /assets/:key, so all must 401 without a token.
const GATED = [
  { method: 'GET', path: '/memories' },
  { method: 'POST', path: '/memories' },
  { method: 'DELETE', path: '/memories/x' },
  { method: 'GET', path: '/trips' },
  { method: 'POST', path: '/trips' },
  { method: 'DELETE', path: '/trips/x' },
  { method: 'POST', path: '/assets/photo/x' }, // upload (POST) IS gated; only GET /assets is public
  { method: 'POST', path: '/assets/video/x' }, // video upload — same gate as photo/audio
  { method: 'POST', path: '/leave-when' },
  { method: 'POST', path: '/places/nearby' },
  { method: 'GET', path: '/resolve' },
  { method: 'POST', path: '/draft' },
  { method: 'POST', path: '/claude/chat' },
  { method: 'GET', path: '/claude/conversations' },
  { method: 'POST', path: '/claude/conversations' },
  { method: 'GET', path: '/claude/conversations/abc/messages' },
  { method: 'GET', path: '/' },
  // Adversarial: an ungated NEW endpoint would behave like one of these.
  { method: 'GET', path: '/admin' },
  { method: 'POST', path: '/internal/secret' },
  { method: 'GET', path: '/assetsX/not-the-public-prefix' },
]

describe('CHECK 1 — auth boundary', () => {
  beforeEach(async () => {
    await applySchema(env.DB)
    await seedSession(env.DB, TOKENS.jonathan, 'jonathan')
    await seedSession(env.DB, TOKENS.helen, 'helen')
  })

  it('rejects every gated route with NO token (401)', async () => {
    for (const r of GATED) {
      const res = await call(r.path, { method: r.method })
      expect(res.status, `${r.method} ${r.path} (no token) should 401`).toBe(401)
    }
  })

  it('rejects every gated route with a BAD token (401)', async () => {
    for (const r of GATED) {
      const res = await call(r.path, { method: r.method, token: 'wrong-token-value' })
      expect(res.status, `${r.method} ${r.path} (bad token) should 401`).toBe(401)
    }
  })

  it('accepts a gated route with a VALID token (200, maps to the traveler)', async () => {
    const res = await call('/', { token: TOKENS.jonathan })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, traveler: 'jonathan' })
  })

  it('GET /assets/:key is the ONE public route — reachable WITHOUT a token', async () => {
    // Opaque R2 key, no object present → fetchAsset returns 404. The point of
    // this assertion is that it is NOT 401: this route is intentionally
    // pre-gate so <img>/<audio> tags render. If this ever 401s, the public
    // contract broke; if a DIFFERENT path becomes non-401, the gate weakened.
    const res = await call('/assets/jonathan/mem1/photo-abc123', {})
    expect(res.status).not.toBe(401)
  })
})

// ─── CHECK 4 — private-memory isolation ───────────────────────────────────
// The one real per-traveler data boundary (worker/src/index.js:196):
// getMemories returns `visibility='shared' OR author_traveler = <caller>`.
// Shared memories are visible to everyone; private memories only to their
// author. Seed directly into D1 (controlled author/visibility) and fetch
// through the real worker as each traveler.

async function seedMemory({ id, author, visibility, updatedAt = 1000 }) {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO memories
       (id, author_traveler, visibility, kind, text, created_at, updated_at)
     VALUES (?, ?, ?, 'text', ?, ?, ?)`
  ).bind(id, author, visibility, `mem ${id}`, updatedAt, updatedAt).run()
}

async function memoryIdsAs(token) {
  const res = await call('/memories', { token })
  expect(res.status).toBe(200)
  const arr = await res.json()
  return arr.map((m) => m.id)
}

describe('CHECK 4 — private-memory isolation', () => {
  beforeEach(async () => {
    await applySchema(env.DB)
    await seedSession(env.DB, TOKENS.jonathan, 'jonathan')
    await seedSession(env.DB, TOKENS.helen, 'helen')
    await env.DB.prepare('DELETE FROM memories').run() // clean slate per test
    await seedMemory({ id: 'm-shared', author: 'jonathan', visibility: 'shared' })
    await seedMemory({ id: 'm-priv-jonathan', author: 'jonathan', visibility: 'private' })
    await seedMemory({ id: 'm-priv-helen', author: 'helen', visibility: 'private' })
  })

  it('Helen sees shared + her own private, NOT Jonathan’s private', async () => {
    const ids = await memoryIdsAs(TOKENS.helen)
    expect(ids).toContain('m-shared')
    expect(ids).toContain('m-priv-helen')
    expect(ids).not.toContain('m-priv-jonathan') // THE boundary
  })

  it('Jonathan sees shared + his own private, NOT Helen’s private', async () => {
    const ids = await memoryIdsAs(TOKENS.jonathan)
    expect(ids).toContain('m-shared')
    expect(ids).toContain('m-priv-jonathan')
    expect(ids).not.toContain('m-priv-helen')
  })
})
