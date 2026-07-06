-- Memory stop-filing PROVENANCE + an append-only move ledger (Stage B of the
-- self-healing-photos arc — app/docs/design/self-healing-photos/SPEC.md §4).
--
-- WHY THIS EXISTS. Photos file themselves to a day's places and named moments,
-- and the coming worker-side matcher will re-file them automatically when the
-- plan changes or GPS resolves. Two facts have to be storable before ANY of
-- that is safe:
--   1. WHO filed a photo where, and whether that was the machine or a person.
--      Nothing in the schema distinguishes "the algorithm guessed this" from
--      "a person deliberately moved it here." Without that distinction an
--      auto-move would silently overwrite a human's correction — the same
--      failure shape as the sync-honesty family (memory/memory-sync-lww.md).
--      `stop_prov_json` is the single slot that carries it (source auto|manual,
--      the human labels snapshotted at decision time, the reason, and the
--      auto-only match evidence). Manual outranks the machine; the lock lives
--      here.
--   2. A full HISTORY of every accepted move, so a bad matcher release is
--      diagnosable and reversible afterward. `stop_prov_json` only holds the
--      LATEST state — the next move overwrites it. `memory_stop_moves` is the
--      append-only ledger that never forgets. (D1 Time Travel — 30-day PITR —
--      is the disaster backstop; this table is the everyday one.)
--
-- SHAPE (both faithful to SPEC §4).
--   • memories.stop_prov_json TEXT — NULL for every existing row (legacy:
--     neither auto nor manual, repair-eligible only). Same NULL-back-compat
--     posture as 007's interstitial_json: rowToMemory omits `stopProv` when the
--     column is NULL, so old rows deserialize byte-identically and the worker
--     stays inert until the client/matcher starts writing the field.
--   • memory_stop_moves — one row per ACCEPTED stop change, written worker-side.
--     Columns are SPEC §4's set (memory_id, from_stop, to_stop, source, reason,
--     trip_rev, at, by) plus a surrogate `id` PK and the snapshotted
--     from_label/to_label — because the table's whole purpose is post-hoc
--     diagnosis and an orphaned move's old stop id may no longer resolve to a
--     name later (the same reason stop_prov_json snapshots labels rather than
--     resolving them live). No foreign key to memories: the ledger deliberately
--     OUTLIVES a deleted memory (a delete must not erase the history of how it
--     was filed).
--
-- APPLY ORDER IS LOAD-BEARING (SPEC §4). Apply this migration to prod D1
-- MANUALLY FIRST — it is safe under the CURRENTLY-DEPLOYED worker (an added
-- NULL column and an unused table change nothing the live code reads or writes).
-- Only AFTER it is applied may the provenance-aware worker be pushed: new code
-- that reads/writes stop_prov_json against an unmigrated DB would 500 every
-- memory write. deploy-worker.yml does NOT run migrations. D1 schema changes
-- need the explicit D1-Edit token (error 10000 without it) and Jonathan's
-- explicit sign-off.
--
-- Idempotency. The CREATE TABLE/INDEX are IF NOT EXISTS (safe to re-run, like
-- 014/016). The ALTER TABLE ... ADD COLUMN has no IF NOT EXISTS in SQLite, so
-- this migration is meant to run EXACTLY ONCE against prod (re-running throws
-- "duplicate column name"); the test harness (worker/test/helpers/schema.js)
-- applies it under a duplicate-column guard so per-test setup stays idempotent.

ALTER TABLE memories ADD COLUMN stop_prov_json TEXT;

CREATE TABLE IF NOT EXISTS memory_stop_moves (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,  -- monotonic; ledger order
  memory_id  TEXT NOT NULL,                      -- the moved memory (no FK — outlives a delete)
  from_stop  TEXT,                               -- prior stopId (null = was unfiled)
  to_stop    TEXT,                               -- new stopId (null = moved to unfiled)
  from_label TEXT,                               -- human label snapshotted at decision time
  to_label   TEXT,                               -- human label snapshotted at decision time
  source     TEXT NOT NULL,                      -- 'auto' | 'manual'
  reason     TEXT,                               -- reason code: named|plan|gps|catchup|hand|import|orphan-repair
  trip_rev   INTEGER,                            -- the trip's SERVER row stamp at decision time (auto moves)
  by         TEXT,                               -- traveler id | 'matcher' | null (inferred, never a person)
  at         INTEGER NOT NULL                    -- when the move was accepted (epoch ms, server clock)
);
CREATE INDEX IF NOT EXISTS idx_stop_moves_memory ON memory_stop_moves(memory_id);
