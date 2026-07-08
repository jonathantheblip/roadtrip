-- The v2 self-healing SHADOW LEARNING ledger — app/docs/design/self-healing-photos/
-- SPEC_V2_TIME_AND_EVIDENCE.md (Phase 1). Records, per photo SESSION, the v2
-- engine's would-decision AND its reasoning, so Jonathan can WATCH the engine
-- decide before it is ever allowed to act (his decision #1: the shadow ledger is
-- a learning tool, not just an audit — it must explain *why* each call fires).
--
-- WHY A NEW TABLE (not extending memory_stop_moves). The 017 ledger records
-- ACCEPTED MOVES of a single memory (append-only audit of what happened). The v2
-- shadow ledger records PROPOSED decisions of a whole SESSION (a burst of photos),
-- most of which are NOT moves at all (tier 'confirm' or 'leave') and carry
-- confidence + a signal bundle 017 has no shape for. Overloading memory_stop_moves
-- would blur "a move was applied" with "here's what the engine is thinking",
-- confuse the LIVE suggestion/move code that reads 017, and force a column set
-- neither use wants. A separate table keeps 017's meaning intact and this one free
-- to evolve as the scorer's signals do. No FK to memories/trips (like 017/018 —
-- the record outlives a deleted memory/trip; a stale row is simply never read).
--
-- SHAPE. One row per SESSION decision. `memory_ids` is the JSON array of the
-- session's memories (a decision covers the whole burst). `place_id` NULL = the
-- 'leave' tier (rest at base/unfiled). `signals_json` is the scorer's full signal
-- bundle (evidence kind, GPS-inherited?, time-fit minutes, runner-up, inferred
-- time…) — the "why" the learning view renders. `mode` stamps whether the row was
-- written in shadow or on. The runner REPLACES a trip's rows each run (scoped
-- DELETE trip_id → INSERT) so the table always shows the CURRENT would-state, not
-- an unbounded history; the index serves that per-trip read.
--
-- APPLY ORDER IS LOAD-BEARING (same posture as 017/018). Apply to prod D1 FIRST —
-- it is safe under the CURRENTLY-DEPLOYED worker (a new, unread table changes
-- nothing live code reads or writes). Only AFTER it is applied may the v2 shadow
-- runner be pushed. deploy-worker.yml does NOT run migrations. D1 schema changes
-- need the explicit D1-Edit token + Jonathan's sign-off (given 2026-07-07 for this).
--
-- Idempotency. CREATE TABLE/INDEX are IF NOT EXISTS; no ALTER → fully re-runnable
-- against prod, and the test harness applies it in the IF-NOT-EXISTS group.

CREATE TABLE IF NOT EXISTS memory_heal_decisions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,  -- monotonic; write order
  trip_id      TEXT NOT NULL,                      -- the trip (no FK — outlives a delete)
  iso_date     TEXT NOT NULL,                      -- the local day the session belongs to
  memory_ids   TEXT NOT NULL,                      -- JSON array of the session's memory ids
  photo_count  INTEGER NOT NULL,                   -- photos in the session (burst size)
  place_id     TEXT,                               -- would-target stop/base/record id; NULL = 'leave'
  place_name   TEXT,                               -- human label snapshotted at decision time
  tier         TEXT NOT NULL,                      -- 'auto' | 'confirm' | 'leave'
  confidence   REAL,                               -- 0..1
  evidence     TEXT,                               -- 'gps' | 'record' | 'base' | 'time-only' | 'none'
  signals_json TEXT,                               -- the scorer's full signal bundle (the "why")
  reason       TEXT,                               -- human-readable one-liner
  mode         TEXT NOT NULL,                      -- 'shadow' | 'on' at write time
  run_at       INTEGER NOT NULL                    -- when this run decided (epoch ms, server clock)
);
CREATE INDEX IF NOT EXISTS idx_heal_decisions_trip ON memory_heal_decisions(trip_id, run_at DESC);
