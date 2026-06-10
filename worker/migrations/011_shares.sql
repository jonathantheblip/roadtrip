-- Share-out (Slice 1) — public share links for a single memory.
--
-- A "share" is a row that maps an unguessable token → one memory. The public
-- page GET /m/:token resolves the token to its memory, RE-DERIVES the masking
-- from the LIVE memory row (never trusts this record), and serves only the
-- safe public fields. Minting refuses a memory that is a surprise hidden from
-- anyone (unless revealed) or deleted; resolving refuses the same on the live
-- row — so a moment that becomes a secret AFTER a link was made stops being
-- public. See worker/src/share.js (the pure rule) + the §6 red-team tests.
--
-- The memory's photos are already public (GET /assets/:key bypasses auth, like
-- the legacy CloudKit asset URLs) — this table only adds the token→memory map
-- and the page that frames them. No memory data is duplicated here.
--
-- revoked_at is a forward kill-switch: a non-null value makes the link 404
-- without deleting the row (so the token can't be re-minted to something else).
--
-- Idempotent (CREATE TABLE/INDEX IF NOT EXISTS), so it joins the schema-helper's
-- sequential block like 008 and is safe to apply more than once.

CREATE TABLE IF NOT EXISTS shares (
  token            TEXT PRIMARY KEY,   -- unguessable; the public link is /m/<token>
  memory_id        TEXT NOT NULL,      -- the one memory this link reveals
  trip_id          TEXT,               -- denormalized for convenience (nullable)
  author_traveler  TEXT NOT NULL,      -- who minted the link
  created_at       INTEGER NOT NULL,
  revoked_at       INTEGER             -- nullable kill-switch; non-null => link is dead
);
CREATE INDEX IF NOT EXISTS idx_shares_memory ON shares(memory_id);
