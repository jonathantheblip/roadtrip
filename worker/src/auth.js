// Magic-link auth (migration 013) — the pure rule + the D1 ops that back it.
//
// Model: opening a personal one-time LINK on a device mints a per-device
// SESSION. Every request carries the session token; the worker looks it up here
// and learns the real traveler. This replaces the four bundled FAMILY_TOKEN_*
// secrets that currently ship in the public client bundle (the one critical
// audit hole, ROOT 2).
//
// This module is deliberately thin and side-effect-light:
//   - token generation + traveler/role predicates are PURE (unit-tested directly).
//   - the four DB ops take `db` (env.DB) explicitly and contain all the SQL, so
//     index.js stays a thin router and the rules are tested in one place.
//
// SECURITY POSTURE (see worker/test/auth.test.js for the red-team):
//   - Tokens are 256-bit (32 random bytes, base64url) — brute force is infeasible,
//     so an unguessable token IS the access-control on the public redeem route.
//   - Links are ONE-TIME (atomic used_at claim, replay-safe under concurrency)
//     and expire (24h).
//   - Sessions resolve to the SAME lowercase traveler id the rest of the worker
//     authorizes against — never a body-supplied identity.
//   - A missing table (pre-migration) degrades the hot-path session lookup to
//     "no session" instead of a 500. Now that the door is closed (no bundled-token
//     fallback) this means the worker FAIL-CLOSES: every request 401s until
//     migration 013 (auth_sessions/auth_links) is applied. 013 IS applied on prod.

export const TRAVELERS = ['jonathan', 'helen', 'aurelia', 'rafa']
// Only adults mint enrollment links (a teen/child never sets up a device alone).
export const ADULTS = ['jonathan', 'helen']
export const LINK_TTL_MS = 24 * 60 * 60 * 1000 // 24h

export function isTraveler(t) {
  return typeof t === 'string' && TRAVELERS.includes(t)
}
export function isAdult(t) {
  return typeof t === 'string' && ADULTS.includes(t)
}

// 256-bit opaque token, URL-safe. crypto.getRandomValues + btoa are both in the
// Workers runtime. Used for both link tokens and session tokens.
export function newToken(bytes = 32) {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  let bin = ''
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// PURE: why a link can't be redeemed, or null if it's good.
//   'not-found' | 'used' | 'expired' | null(ok)
// The route collapses all of these into one opaque "invalid or expired link"
// so a caller can't probe which links exist.
export function linkRejectionReason(row, now) {
  if (!row) return 'not-found'
  if (row.used_at != null) return 'used'
  if (typeof row.expires_at === 'number' && now > row.expires_at) return 'expired'
  return null
}

// Mint a one-time enrollment link row. Returns { token, expiresAt }.
export async function createAuthLink(db, { traveler, deviceLabel, now, ttlMs = LINK_TTL_MS }) {
  const token = newToken()
  const expiresAt = now + ttlMs
  await db
    .prepare(
      `INSERT INTO auth_links (token, traveler, device_label, created_at, expires_at, used_at)
       VALUES (?, ?, ?, ?, ?, NULL)`
    )
    .bind(token, traveler, deviceLabel || null, now, expiresAt)
    .run()
  return { token, expiresAt }
}

// Redeem a link → a new session. Returns { sessionToken, traveler } or { error }.
//
// Replay safety: after the predicate check we claim the link with
// `UPDATE ... WHERE used_at IS NULL`. If a concurrent request claimed it first,
// changes===0 and we refuse — so one link can NEVER mint two sessions, even if
// two devices POST the same token at the same moment.
export async function redeemAuthLink(db, { linkToken, deviceLabel, now }) {
  const row = await db.prepare(`SELECT * FROM auth_links WHERE token = ?`).bind(linkToken).first()
  const reason = linkRejectionReason(row, now)
  if (reason) return { error: reason }

  const claim = await db
    .prepare(`UPDATE auth_links SET used_at = ? WHERE token = ? AND used_at IS NULL`)
    .bind(now, linkToken)
    .run()
  if ((claim?.meta?.changes ?? 0) === 0) return { error: 'used' } // lost the race

  const sessionToken = newToken()
  await db
    .prepare(
      `INSERT INTO auth_sessions (token, traveler, device_label, created_at, last_seen_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, NULL)`
    )
    .bind(sessionToken, row.traveler, deviceLabel || row.device_label || null, now, now)
    .run()
  return { sessionToken, traveler: row.traveler }
}

// Resolve a session token → traveler, or null. THE hot path (every request) —
// and, since the door is closed, the ONLY auth path. A revoked or unknown token
// → null. A missing table (pre-migration) → null (narrow swallow, matching
// getStoredWeave / schema.js) → the request 401s (fail-closed) rather than 500ing.
export async function lookupSession(db, sessionToken) {
  if (!sessionToken || typeof sessionToken !== 'string') return null
  try {
    const row = await db
      .prepare(`SELECT traveler, revoked_at FROM auth_sessions WHERE token = ?`)
      .bind(sessionToken)
      .first()
    if (!row) return null
    if (row.revoked_at != null) return null
    if (!isTraveler(row.traveler)) return null
    return row.traveler
  } catch (e) {
    if (/no such table/i.test(String(e?.message || e))) return null
    throw e
  }
}

// Revoke a session (lost device) or all of a traveler's sessions ("sign out my
// other devices"). A caller may only revoke sessions for THEIR OWN traveler.
// Returns { revoked } (count) or { revoked:0, error }.
//   { sessionToken }          → revoke that one (must belong to `traveler`)
//   { all:true }              → revoke every session for `traveler`
//   { all:true, except }      → ...except the current device's session token
export async function revokeSession(db, { sessionToken, all, traveler, except, now }) {
  if (all) {
    const sql = except
      ? `UPDATE auth_sessions SET revoked_at = ? WHERE traveler = ? AND token != ? AND revoked_at IS NULL`
      : `UPDATE auth_sessions SET revoked_at = ? WHERE traveler = ? AND revoked_at IS NULL`
    const stmt = except
      ? db.prepare(sql).bind(now, traveler, except)
      : db.prepare(sql).bind(now, traveler)
    const r = await stmt.run()
    return { revoked: r?.meta?.changes ?? 0 }
  }
  if (sessionToken) {
    const row = await db.prepare(`SELECT traveler FROM auth_sessions WHERE token = ?`).bind(sessionToken).first()
    if (!row) return { revoked: 0, error: 'not-found' }
    if (row.traveler !== traveler) return { revoked: 0, error: 'forbidden' } // not yours
    const r = await db
      .prepare(`UPDATE auth_sessions SET revoked_at = ? WHERE token = ? AND revoked_at IS NULL`)
      .bind(now, sessionToken)
      .run()
    return { revoked: r?.meta?.changes ?? 0 }
  }
  return { revoked: 0, error: 'nothing-to-revoke' }
}

// ADMIN sweep — revoke every session created before a cutoff, across ALL
// travelers (or one named traveler). This is the cutover-hygiene tool: before
// the bundled tokens are removed, an adult wipes any sessions that shouldn't
// exist (a device set up by mistake, a stale enrollment) so only the intended
// devices survive the door closing. It deliberately crosses traveler scope —
// unlike revokeSession's self-only rule — so the ROUTE that calls it MUST gate
// on isAdult. `beforeDate` is REQUIRED (no default) so a sweep can never
// accidentally revoke everything. Returns { revoked } (count) or { error }.
export async function adminSweepSessions(db, { beforeDate, traveler, now }) {
  if (typeof beforeDate !== 'number' || !Number.isFinite(beforeDate)) {
    return { revoked: 0, error: 'beforeDate required' }
  }
  const scoped = isTraveler(traveler)
  const sql = scoped
    ? `UPDATE auth_sessions SET revoked_at = ? WHERE created_at < ? AND traveler = ? AND revoked_at IS NULL`
    : `UPDATE auth_sessions SET revoked_at = ? WHERE created_at < ? AND revoked_at IS NULL`
  const stmt = scoped
    ? db.prepare(sql).bind(now, beforeDate, traveler)
    : db.prepare(sql).bind(now, beforeDate)
  const r = await stmt.run()
  return { revoked: r?.meta?.changes ?? 0 }
}

// Cron hygiene — delete one-time links that are spent (used) or past their 24h
// expiry. Sessions are NOT touched (revoked_at is their audit trail); only the
// short-lived auth_links table is pruned so it can't grow without bound. A
// missing table (pre-migration) is a no-op, never a 500. Returns { pruned }.
export async function pruneExpiredLinks(db, now) {
  try {
    const r = await db
      .prepare(`DELETE FROM auth_links WHERE used_at IS NOT NULL OR expires_at < ?`)
      .bind(now)
      .run()
    return { pruned: r?.meta?.changes ?? 0 }
  } catch (e) {
    if (/no such table/i.test(String(e?.message || e))) return { pruned: 0 }
    throw e
  }
}
