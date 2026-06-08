-- Surprises & Masking (Slice 1) — the masking layer on memories.
--
-- A "surprise" is an ordinary memory the author has hidden from specific people
-- (or everyone), revealed manually / on arrival / on a date. The masking is the
-- contract: for a viewer it's hidden from, the server must emit NOTHING real —
-- a teaser is stripped to a "something's coming" stub, a cover is swapped for
-- its believable stand-in — so the secret never reaches the wrong device or
-- Claude (the server, not the UI, is the security boundary). See
-- app/src/lib/surprises.js (client) and worker/src/surprises.js (server mirror).
--
-- Columns (all nullable, NULL on every existing row — back-compat, inert until
-- the client writes them; rowToMemory omits each when NULL so legacy rows
-- deserialize byte-identically, exactly like 007):
--   hide_from_json TEXT   -- JSON array of traveler ids, OR ["everyone"]. Its
--                            presence MARKS the memory a surprise.
--   reveal_json    TEXT   -- {"type":"manual|arrival|date","at":"<place|date>"}
--   conceal        TEXT   -- 'teaser' (default) | 'cover'
--   cover_json     TEXT   -- iff conceal='cover': the believable stand-in
--                            {icon,title,loc,time,weather,packing} — carries the
--                            REAL timing+weather so the recipient still plans right.
--   surprise_json  TEXT   -- the card's display identity {what,icon,title,detail,tint}
--   revealed_at    TEXT   -- ISO timestamp once unwrapped; until then the mask holds.
--
-- Idempotency: SQLite ALTER TABLE ... ADD COLUMN has no IF NOT EXISTS, so this
-- runs EXACTLY ONCE against prod D1 (`wrangler d1 migrations apply roadtrip-db`,
-- or single `wrangler d1 execute`s). Re-running throws "duplicate column name".
-- The test harness (worker/test/helpers/schema.js) applies it with the
-- duplicate-column guard so per-test setup stays idempotent.

ALTER TABLE memories ADD COLUMN hide_from_json TEXT;
ALTER TABLE memories ADD COLUMN reveal_json TEXT;
ALTER TABLE memories ADD COLUMN conceal TEXT;
ALTER TABLE memories ADD COLUMN cover_json TEXT;
ALTER TABLE memories ADD COLUMN surprise_json TEXT;
ALTER TABLE memories ADD COLUMN revealed_at TEXT;
