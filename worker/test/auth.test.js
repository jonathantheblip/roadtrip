// Magic-link auth (013) — the §6 red-team. Runs on the miniflare scaffold
// against a REAL D1 binding, through the real worker.fetch, exactly like
// security-auth-isolation.test.js.
//
// NON-VACUOUS by construction: every check would FAIL if the rule it guards
// were removed —
//   - a forged/random session token is REJECTED (drop lookupSession's revoked/
//     unknown guards → it would leak in);
//   - a redeemed link CANNOT be redeemed twice (drop the atomic used_at claim →
//     replay mints a 2nd session);
//   - an EXPIRED link is refused (drop the expiry check → it redeems);
//   - dual-auth accepts BOTH a bundled family token AND a session (remove the
//     session fallback → the session 401s; remove the family branch → the
//     bundled token 401s);
//   - revoke kills a session (drop revoked_at filter → the dead token still works);
//   - only ADULTS mint links (drop isAdult → rafa mints);
//   - a session resolves to the LINK's traveler, never a body-supplied one
//     (trust the body → identity spoof);
//   - a missing table degrades to null, but ONLY for "no such table" (widen the
//     swallow → real D1 errors get hidden).

import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeEach, describe, it, expect } from 'vitest'
import worker from '../src/index.js'
import { applySchema } from './helpers/schema.js'
import { lookupSession, linkRejectionReason, newToken, LINK_TTL_MS, adminSweepSessions, pruneExpiredLinks } from '../src/auth.js'

// FAMILY_TOKEN_* are wrangler secrets (absent in the test runtime by default).
// Inject all four so authenticate() can map a bundled token to its traveler —
// AND so we can mint as an adult (jonathan) and prove a child (rafa) cannot.
const TOK = {
  jonathan: 'tok-jonathan',
  helen: 'tok-helen',
  aurelia: 'tok-aurelia',
  rafa: 'tok-rafa',
}
function authEnv() {
  return {
    ...env,
    DB: env.DB,
    FAMILY_TOKEN_JONATHAN: TOK.jonathan,
    FAMILY_TOKEN_HELEN: TOK.helen,
    FAMILY_TOKEN_AURELIA: TOK.aurelia,
    FAMILY_TOKEN_RAFA: TOK.rafa,
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

// Mint a link via the real route (as an adult) → its token.
async function mintLink(asToken, target, deviceLabel) {
  const res = await call('/auth/link', { method: 'POST', token: asToken, body: { traveler: target, deviceLabel } })
  expect(res.status, 'mint should 200').toBe(200)
  const data = await res.json()
  return data
}

// Redeem a link token via the public route → { sessionToken, traveler } (+status).
async function redeem(linkToken, extra = {}) {
  const res = await call('/auth/redeem', { method: 'POST', body: { linkToken, ...extra } })
  const data = await res.json().catch(() => null)
  return { status: res.status, data }
}

// Insert a link row directly (controlled expiry/used_at for edge cases).
async function seedLink({ token, traveler, expiresAt, usedAt = null, createdAt = 1000 }) {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO auth_links (token, traveler, device_label, created_at, expires_at, used_at)
     VALUES (?, ?, NULL, ?, ?, ?)`
  ).bind(token, traveler, createdAt, expiresAt, usedAt).run()
}

beforeEach(async () => {
  await applySchema(env.DB)
  await env.DB.prepare('DELETE FROM auth_links').run()
  await env.DB.prepare('DELETE FROM auth_sessions').run()
})

// ─── Enroll → session → authenticated request ─────────────────────────────
describe('enrollment happy path', () => {
  it('an adult mints a link, a new device redeems it, the session authenticates as that traveler', async () => {
    const { token, url } = await mintLink(TOK.jonathan, 'rafa', "Rafa's iPad")
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThanOrEqual(32)
    expect(url).toContain(`/?enroll=${token}`)

    const { status, data } = await redeem(token)
    expect(status).toBe(200)
    expect(data.traveler).toBe('rafa')
    expect(typeof data.sessionToken).toBe('string')

    // The session token now authenticates — and resolves to RAFA, the identity
    // the rest of the worker authorizes against.
    const me = await call('/', { token: data.sessionToken })
    expect(me.status).toBe(200)
    expect(await me.json()).toEqual({ ok: true, traveler: 'rafa' })
  })

  it('the session works on a real data route (not just the ping)', async () => {
    const { token } = await mintLink(TOK.helen, 'helen')
    const { data } = await redeem(token)
    const res = await call('/memories', { token: data.sessionToken })
    expect(res.status).toBe(200) // gated route reachable with a session token
  })
})

// ─── Dual-auth (the cutover safety net) ───────────────────────────────────
describe('dual-auth during cutover', () => {
  it('accepts a bundled family token (legacy path unchanged)', async () => {
    const res = await call('/', { token: TOK.jonathan })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, traveler: 'jonathan' })
  })

  it('accepts a session token (new path) — both work simultaneously', async () => {
    const { token } = await mintLink(TOK.jonathan, 'aurelia')
    const { data } = await redeem(token)
    const viaSession = await call('/', { token: data.sessionToken })
    const viaBundled = await call('/', { token: TOK.aurelia })
    expect(viaSession.status).toBe(200)
    expect(viaBundled.status).toBe(200)
    expect((await viaSession.json()).traveler).toBe('aurelia')
    expect((await viaBundled.json()).traveler).toBe('aurelia')
  })
})

// ─── Forgery / replay / expiry ────────────────────────────────────────────
describe('attacks are refused', () => {
  it('a forged/random session token is unauthorized (401)', async () => {
    const res = await call('/memories', { token: newToken() }) // never issued
    expect(res.status).toBe(401)
  })

  it('a link is ONE-TIME — a second redeem of the same token fails', async () => {
    const { token } = await mintLink(TOK.jonathan, 'rafa')
    const first = await redeem(token)
    expect(first.status).toBe(200)
    const second = await redeem(token)
    expect(second.status).toBe(400) // replay refused
    expect(second.data.error).toMatch(/invalid or expired/i)
  })

  it('an EXPIRED link is refused', async () => {
    await seedLink({ token: 'expired-link', traveler: 'helen', expiresAt: 1, createdAt: 0 })
    const res = await redeem('expired-link')
    expect(res.status).toBe(400)
  })

  it('an unknown link token is refused with the SAME opaque error (no probing)', async () => {
    const res = await redeem('this-link-was-never-minted')
    expect(res.status).toBe(400)
    expect(res.data.error).toMatch(/invalid or expired/i)
  })

  it('redeem CANNOT spoof identity via the body — the session is the LINK’s traveler', async () => {
    const { token } = await mintLink(TOK.jonathan, 'rafa')
    const { status, data } = await redeem(token, { traveler: 'jonathan' }) // adversarial body
    expect(status).toBe(200)
    expect(data.traveler).toBe('rafa') // body ignored
    const me = await call('/', { token: data.sessionToken })
    expect((await me.json()).traveler).toBe('rafa')
  })
})

// ─── Authorization on the routes themselves ───────────────────────────────
describe('route authorization', () => {
  it('/auth/redeem is PUBLIC (reachable without a token) but /auth/link and /auth/revoke are gated', async () => {
    const redeemNoTok = await call('/auth/redeem', { method: 'POST', body: { linkToken: 'x' } })
    expect(redeemNoTok.status).not.toBe(401) // public (400 for the bad token, not 401)
    const linkNoTok = await call('/auth/link', { method: 'POST', body: { traveler: 'rafa' } })
    expect(linkNoTok.status).toBe(401)
    const revokeNoTok = await call('/auth/revoke', { method: 'POST', body: { all: true } })
    expect(revokeNoTok.status).toBe(401)
  })

  it('minting rules: ANYONE may self-mint; only adults may mint for someone ELSE', async () => {
    // Self-mint (target === caller) is allowed for a teen/child — they already
    // authenticated as themselves, so it grants no new identity.
    const rafaSelf = await call('/auth/link', { method: 'POST', token: TOK.rafa, body: { traveler: 'rafa' } })
    expect(rafaSelf.status).toBe(200)
    const aureliaSelf = await call('/auth/link', { method: 'POST', token: TOK.aurelia, body: { traveler: 'aurelia' } })
    expect(aureliaSelf.status).toBe(200)
    // A non-adult minting for SOMEONE ELSE is forbidden (no provisioning others).
    const rafaForOther = await call('/auth/link', { method: 'POST', token: TOK.rafa, body: { traveler: 'jonathan' } })
    expect(rafaForOther.status).toBe(403)
    // An adult may mint for anyone (self or others).
    const helenForRafa = await call('/auth/link', { method: 'POST', token: TOK.helen, body: { traveler: 'rafa' } })
    expect(helenForRafa.status).toBe(200)
    const helenSelf = await call('/auth/link', { method: 'POST', token: TOK.helen, body: { traveler: 'helen' } })
    expect(helenSelf.status).toBe(200)
  })

  it('minting for an unknown traveler is rejected (400)', async () => {
    const res = await call('/auth/link', { method: 'POST', token: TOK.jonathan, body: { traveler: 'mallory' } })
    expect(res.status).toBe(400)
  })
})

// ─── Revocation (lost device) ─────────────────────────────────────────────
describe('revocation', () => {
  it('revoking a session kills it — subsequent requests 401', async () => {
    const { token } = await mintLink(TOK.jonathan, 'jonathan')
    const { data } = await redeem(token)
    const sess = data.sessionToken
    expect((await call('/', { token: sess })).status).toBe(200)

    const rev = await call('/auth/revoke', { method: 'POST', token: sess, body: { sessionToken: sess } })
    expect(rev.status).toBe(200)
    expect((await rev.json()).revoked).toBe(1)

    expect((await call('/', { token: sess })).status).toBe(401) // dead now
  })

  it('a caller cannot revoke ANOTHER traveler’s session (403)', async () => {
    const { token: rafaLink } = await mintLink(TOK.jonathan, 'rafa')
    const rafaSess = (await redeem(rafaLink)).data.sessionToken
    // Helen (a different traveler) tries to revoke Rafa's session.
    const res = await call('/auth/revoke', { method: 'POST', token: TOK.helen, body: { sessionToken: rafaSess } })
    expect(res.status).toBe(403)
    expect((await call('/', { token: rafaSess })).status).toBe(200) // still alive
  })

  it('"all" revokes every session for the caller’s traveler, with an optional except', async () => {
    const a = (await redeem((await mintLink(TOK.jonathan, 'jonathan')).token)).data.sessionToken
    const b = (await redeem((await mintLink(TOK.jonathan, 'jonathan')).token)).data.sessionToken
    // Revoke all jonathan sessions EXCEPT b (the current device).
    const res = await call('/auth/revoke', { method: 'POST', token: b, body: { all: true, except: b } })
    expect(res.status).toBe(200)
    expect((await call('/', { token: a })).status).toBe(401) // a killed
    expect((await call('/', { token: b })).status).toBe(200) // b preserved
  })
})

// ─── Admin session sweep + cron link prune (close-the-door step 3) ──────────
async function seedSession({ token, traveler, createdAt, revokedAt = null }) {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO auth_sessions (token, traveler, device_label, created_at, last_seen_at, revoked_at)
     VALUES (?, ?, NULL, ?, ?, ?)`
  ).bind(token, traveler, createdAt, createdAt, revokedAt).run()
}

describe('admin session sweep (cutover hygiene)', () => {
  it('an adult sweeps every session created before a cutoff, across ALL travelers', async () => {
    await seedSession({ token: 's-old-rafa', traveler: 'rafa', createdAt: 1000 })
    await seedSession({ token: 's-old-aur', traveler: 'aurelia', createdAt: 2000 })
    await seedSession({ token: 's-new-jon', traveler: 'jonathan', createdAt: 9000 })
    const res = await call('/auth/revoke', { method: 'POST', token: TOK.jonathan, body: { sweep: true, beforeDate: 5000 } })
    expect(res.status).toBe(200)
    expect((await res.json()).revoked).toBe(2)
    expect(await lookupSession(env.DB, 's-old-rafa')).toBe(null) // swept
    expect(await lookupSession(env.DB, 's-old-aur')).toBe(null) // swept — crosses traveler scope
    expect(await lookupSession(env.DB, 's-new-jon')).toBe('jonathan') // newer than the cutoff, survives
  })

  it('the sweep is ADULT-only — a child is refused (403), nothing revoked', async () => {
    await seedSession({ token: 's-old', traveler: 'helen', createdAt: 1000 })
    const res = await call('/auth/revoke', { method: 'POST', token: TOK.rafa, body: { sweep: true, beforeDate: 5000 } })
    expect(res.status).toBe(403)
    expect(await lookupSession(env.DB, 's-old')).toBe('helen')
  })

  it('the sweep REQUIRES beforeDate — no accidental wipe-all (400)', async () => {
    await seedSession({ token: 's', traveler: 'helen', createdAt: 1000 })
    const res = await call('/auth/revoke', { method: 'POST', token: TOK.jonathan, body: { sweep: true } })
    expect(res.status).toBe(400)
    expect(await lookupSession(env.DB, 's')).toBe('helen')
    // function-level guard too
    expect((await adminSweepSessions(env.DB, { beforeDate: undefined, now: 9999 })).error).toBe('beforeDate required')
  })

  it('the sweep can be scoped to one traveler', async () => {
    await seedSession({ token: 's-rafa', traveler: 'rafa', createdAt: 1000 })
    await seedSession({ token: 's-helen', traveler: 'helen', createdAt: 1000 })
    const res = await call('/auth/revoke', { method: 'POST', token: TOK.jonathan, body: { sweep: true, beforeDate: 5000, traveler: 'rafa' } })
    expect(res.status).toBe(200)
    expect((await res.json()).revoked).toBe(1)
    expect(await lookupSession(env.DB, 's-rafa')).toBe(null) // swept
    expect(await lookupSession(env.DB, 's-helen')).toBe('helen') // out of scope, survives
  })

  it('a FUTURE beforeDate is refused (400) — can never catch a just-enrolled device', async () => {
    await seedSession({ token: 's', traveler: 'helen', createdAt: 1000 })
    const res = await call('/auth/revoke', { method: 'POST', token: TOK.jonathan, body: { sweep: true, beforeDate: Date.now() + 86_400_000 } })
    expect(res.status).toBe(400)
    expect(await lookupSession(env.DB, 's')).toBe('helen') // untouched
  })

  it('a present-but-UNKNOWN traveler scope fails loudly (400) — never silently widens to all', async () => {
    await seedSession({ token: 's-rafa', traveler: 'rafa', createdAt: 1000 })
    await seedSession({ token: 's-helen', traveler: 'helen', createdAt: 1000 })
    const res = await call('/auth/revoke', { method: 'POST', token: TOK.jonathan, body: { sweep: true, beforeDate: 5000, traveler: 'nobody' } })
    expect(res.status).toBe(400)
    expect(await lookupSession(env.DB, 's-rafa')).toBe('rafa') // NOT widened to all
    expect(await lookupSession(env.DB, 's-helen')).toBe('helen')
  })
})

describe('cron link prune', () => {
  it('deletes used + expired links, keeps live ones, never touches sessions', async () => {
    const now = 10_000
    await seedLink({ token: 'l-used', traveler: 'rafa', expiresAt: now + 1000, usedAt: 5000 })
    await seedLink({ token: 'l-expired', traveler: 'rafa', expiresAt: now - 1000, usedAt: null })
    await seedLink({ token: 'l-live', traveler: 'rafa', expiresAt: now + 1000, usedAt: null })
    await seedSession({ token: 's-keep', traveler: 'rafa', createdAt: 1000 })

    const { pruned } = await pruneExpiredLinks(env.DB, now)
    expect(pruned).toBe(2) // the used one + the expired one

    const live = await env.DB.prepare(`SELECT token FROM auth_links`).all()
    expect(live.results.map((r) => r.token)).toEqual(['l-live'])
    expect(await lookupSession(env.DB, 's-keep')).toBe('rafa') // sessions untouched
  })
})

// ─── Pure-unit guards ─────────────────────────────────────────────────────
describe('pure rules', () => {
  it('linkRejectionReason: not-found / used / expired / ok', () => {
    const now = 1_000_000
    expect(linkRejectionReason(null, now)).toBe('not-found')
    expect(linkRejectionReason({ used_at: 5, expires_at: now + 1 }, now)).toBe('used')
    expect(linkRejectionReason({ used_at: null, expires_at: now - 1 }, now)).toBe('expired')
    expect(linkRejectionReason({ used_at: null, expires_at: now + LINK_TTL_MS }, now)).toBe(null)
  })

  it('newToken is long, URL-safe, and effectively unique', () => {
    const a = newToken()
    const b = newToken()
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(a.length).toBeGreaterThanOrEqual(40) // 32 bytes → ~43 base64url chars
    expect(a).not.toBe(b)
  })

  it('lookupSession swallows ONLY "no such table" (degrades), and rethrows other D1 errors', async () => {
    const noTable = {
      prepare: () => ({ bind: () => ({ first: async () => { throw new Error('D1_ERROR: no such table: auth_sessions') } }) }),
    }
    expect(await lookupSession(noTable, 'anything')).toBe(null) // pre-migration → null, not a throw

    const otherErr = {
      prepare: () => ({ bind: () => ({ first: async () => { throw new Error('D1_ERROR: database is locked') } }) }),
    }
    await expect(lookupSession(otherErr, 'anything')).rejects.toThrow(/database is locked/) // narrow swallow
  })
})

// ─── CORS / cross-origin readability of the token-minting route ────────────
// Previously untested (the suite hard-coded one origin). The 013 /auth/redeem
// route returns a session token in its BODY, so WHO may read that response
// cross-origin is load-bearing: a wildcard *.github.io would let any GitHub
// Pages site read it. Assert the exact-allowlist policy, not just status.
describe('CORS — only the exact app origin may read responses', () => {
  const APP = 'https://jonathantheblip.github.io' // the real prod origin (ALLOWED_ORIGINS)
  const FOREIGN = 'https://mallory.github.io' // a different github.io — must NOT be reflected

  async function acao(path, { method = 'GET', token, body, origin } = {}) {
    const res = await call(path, { method, token, body, origin })
    return res.headers.get('Access-Control-Allow-Origin')
  }

  it('reflects the exact prod origin and localhost, but NOT a foreign github.io', async () => {
    expect(await acao('/', { token: TOK.jonathan, origin: APP })).toBe(APP)
    expect(await acao('/', { token: TOK.jonathan, origin: 'http://localhost:5173' })).toBe('http://localhost:5173')
    // Foreign github.io → falls back to the first allowed origin, never reflected.
    expect(await acao('/', { token: TOK.jonathan, origin: FOREIGN })).not.toBe(FOREIGN)
  })

  it('/auth/redeem (public, returns a token) does NOT reflect a foreign github.io origin', async () => {
    const got = await acao('/auth/redeem', { method: 'POST', body: { linkToken: 'x' }, origin: FOREIGN })
    expect(got).not.toBe(FOREIGN) // a stranger's page cannot read a redeem response
  })

  it('OPTIONS preflight from a foreign origin is not reflected', async () => {
    const res = await call('/auth/redeem', { method: 'OPTIONS', origin: FOREIGN })
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).not.toBe(FOREIGN)
  })
})
