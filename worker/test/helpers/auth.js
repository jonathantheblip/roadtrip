// Test auth helpers for the post-"close-the-door" world (013): the bundled
// FAMILY_TOKEN_* path is gone, so a request authenticates ONLY with a per-device
// SESSION token that lookupSession() finds in auth_sessions.
//
// Most tests just need "a token that authenticates as <traveler>". They already
// send a fixed string (e.g. 'tok-jonathan'); seedSession() makes that exact
// string a real session row, so every existing call-site keeps working with no
// rewrite. Call it in beforeEach AFTER applySchema(env.DB).
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import worker from '../../src/index.js'
import { newToken, LINK_TTL_MS } from '../../src/auth.js'

// Insert a valid (non-revoked) session row so `Bearer <token>` authenticates as
// `traveler`. Returns the token for convenience.
export async function seedSession(db, token, traveler, { now = Date.now() } = {}) {
  await db
    .prepare(
      `INSERT OR REPLACE INTO auth_sessions (token, traveler, device_label, created_at, last_seen_at, revoked_at)
       VALUES (?, ?, NULL, ?, ?, NULL)`
    )
    .bind(token, traveler, now, now)
    .run()
  return token
}

// Mint a session the REAL way — seed a one-time link, redeem it via the PUBLIC
// /auth/redeem route (no prior auth needed, exactly how a fresh device enrolls).
// Use this where a test wants an authentically-minted session (e.g. auth.test).
export async function sessionFor(env, traveler, { now = Date.now() } = {}) {
  const linkToken = newToken()
  await env.DB.prepare(
    `INSERT OR REPLACE INTO auth_links (token, traveler, device_label, created_at, expires_at, used_at)
     VALUES (?, ?, NULL, ?, ?, NULL)`
  ).bind(linkToken, traveler, now, now + LINK_TTL_MS).run()
  const req = new Request('https://worker.test/auth/redeem', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Origin: 'http://localhost:5173' },
    body: JSON.stringify({ linkToken }),
  })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, env, ctx)
  await waitOnExecutionContext(ctx)
  if (res.status !== 200) {
    const text = await res.text().catch(() => '')
    throw new Error(`sessionFor(${traveler}) redeem failed: ${res.status} ${text}`)
  }
  const data = await res.json()
  return data.sessionToken
}
