-- Synced "Not now" dismissals for the self-healing-photos SUGGESTION channel
-- (Stage 0c of "document the trip we had" — app/docs/design/self-healing-photos/
-- SPEC.md §5 D "Suggestions").
--
-- WHY THIS EXISTS. The matcher's STRICT auto gate is deliberately conservative:
-- a near-miss (right day, right area, but ambiguous margin / split memory /
-- time-only) never auto-moves — it becomes a SUGGESTION an adult can accept or
-- decline. SPEC §5 D requires that decline to be SYNCED and FAMILY-WIDE: "one
-- 'Not now' quiets all devices." Nothing in the schema records that a suggestion
-- was declined, so without this table a dismissed near-miss would re-surface on
-- every device on every pull — noise the whole point of the strict gate is to
-- avoid.
--
-- SHAPE. One row per DISMISSED suggestion, written worker-side when an adult taps
-- "Not now". A suggestion's identity is (memory_id, to_stop) — "the machine
-- thinks THIS memory belongs at THAT place." The UNIQUE(memory_id, to_stop) +
-- INSERT OR IGNORE makes a dismissal idempotent (a double-tap, or a second
-- device racing the same decline, is a no-op). Suppression is FAMILY-WIDE: the
-- suggestion serve-path excludes any (memory_id, to_stop) present here regardless
-- of who dismissed it; `dismissed_by` is kept for audit + a possible future
-- "you dismissed this" note, NOT for scoping the suppression. A dismissal of
-- "move X to Y" does NOT suppress a later, genuinely-different suggestion "move X
-- to Z" (different to_stop → different identity → still offered). No foreign key
-- to memories: like memory_stop_moves (017), the record outlives a deleted memory
-- (a stale dismissal row is simply never joined against once the suggestion is
-- gone) and a delete must not need to fan out into this table.
--
-- APPLY ORDER IS LOAD-BEARING (same posture as 017). Apply this migration to prod
-- D1 MANUALLY FIRST — it is safe under the CURRENTLY-DEPLOYED worker (a new,
-- unread table changes nothing the live code reads or writes). Only AFTER it is
-- applied may the suggestion-channel worker be pushed. deploy-worker.yml does NOT
-- run migrations. D1 schema changes need the explicit D1-Edit token (error 10000
-- without it) and Jonathan's explicit sign-off (given 2026-07-07).
--
-- Idempotency. CREATE TABLE/INDEX are IF NOT EXISTS (safe to re-run, like
-- 014/016/017). There is no ALTER, so this migration is fully re-runnable against
-- prod; the test harness (worker/test/helpers/schema.js) applies it in the
-- IF-NOT-EXISTS group.

CREATE TABLE IF NOT EXISTS memory_suggestion_dismissals (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,  -- monotonic; audit order
  memory_id    TEXT NOT NULL,                      -- the memory the suggestion was about (no FK — outlives a delete)
  to_stop      TEXT NOT NULL,                      -- the suggested target stopId; (memory_id,to_stop) IS the suggestion identity
  dismissed_by TEXT,                               -- traveler id who tapped "Not now" (audit; suppression is family-wide)
  at           INTEGER NOT NULL,                   -- when it was dismissed (epoch ms, server clock)
  UNIQUE (memory_id, to_stop)                      -- idempotent: a re-dismiss / racing device is a no-op (INSERT OR IGNORE)
);
CREATE INDEX IF NOT EXISTS idx_suggestion_dismissals_memory ON memory_suggestion_dismissals(memory_id);
