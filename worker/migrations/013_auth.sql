-- Magic-link logins (close the tokens-in-bundle hole) — ROOT 2 of the audit.
--
-- Today the four family bearer tokens (FAMILY_TOKEN_<TRAVELER>) ship inside the
-- public client bundle, so anyone with the URL can act as any family member.
-- This migration adds the storage for a per-DEVICE session model that replaces
-- that: opening your personal one-time LINK on a device mints a SESSION bound to
-- you, stored only on that device. Requests then carry the session, so the
-- worker learns who is really acting without any secret living in the bundle.
--
-- TWO TABLES:
--   auth_links    — one-time enrollment links. An already-authed adult mints one
--                   for {traveler, device}; it is valid once, for 24h. Redeeming
--                   it stamps used_at (one-time) and creates a session.
--   auth_sessions — long-lived per-device sessions. A request's Bearer token is
--                   looked up here; a non-revoked row resolves to its traveler.
--                   Sessions don't expire (revocable only — revoked_at).
--
-- The traveler column holds the SAME lowercase id the rest of the worker keys
-- authz off (jonathan / helen / aurelia / rafa) — a session MUST resolve to that
-- exact value or surprise-masking / author-scoping / deletes break. See
-- worker/src/auth.js (the pure rule) + worker/test/auth.test.js (the §6 red-team).
--
-- Idempotent (CREATE TABLE/INDEX IF NOT EXISTS), so it joins the schema-helper's
-- sequential block like 008/011 and is safe to apply more than once.
--
-- STAGED CUTOVER: while this is live, authenticate() accepts a session token OR
-- the old bundled family token (dual-auth) so the family is never locked out.
-- The bundled tokens are removed only in a later, separate "close the door" push
-- after every device is enrolled. Until this table exists the session lookup
-- degrades to "no session" (never a 500), so deploy ordering can't lock anyone out.

CREATE TABLE IF NOT EXISTS auth_links (
  token        TEXT PRIMARY KEY,   -- unguessable; the enrollment link is /?enroll=<token>
  traveler     TEXT NOT NULL,      -- who this link enrolls (jonathan/helen/aurelia/rafa)
  device_label TEXT,               -- optional human label ("Rafa's iPad"), nullable
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,   -- created_at + 24h; redeeming past this is refused
  used_at      INTEGER             -- one-time: non-null => already redeemed, refuse
);
CREATE INDEX IF NOT EXISTS idx_auth_links_traveler ON auth_links(traveler);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token        TEXT PRIMARY KEY,   -- the per-device bearer; long, opaque, unguessable
  traveler     TEXT NOT NULL,      -- the identity this session acts as
  device_label TEXT,               -- carried from the link, nullable
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER,            -- set at creation; future "your devices" UI may bump it
  revoked_at   INTEGER             -- nullable kill-switch; non-null => session is dead
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_traveler ON auth_sessions(traveler);
