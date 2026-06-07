-- Migration 008 — stored nightly weaves (WEAVE_SCOPE slice 3, auto-weave).
--
-- The on-screen Weave is assembled on the CLIENT on demand. The nightly
-- cron (worker `scheduled` handler → runNightlyWeave) pre-assembles the
-- active trip's freshest day into ONE stored narrative so the page is
-- "already woven" when the family opens the app — instant, no per-open
-- Claude call. One row per (trip, day); the cron upserts it.
--
-- Idempotent — CREATE IF NOT EXISTS so re-running is safe (matches 006).
-- Applied to the test D1 via test/helpers/schema.js.

CREATE TABLE IF NOT EXISTS weaves (
  id TEXT PRIMARY KEY,              -- `${trip_id}::${day_iso}`
  trip_id TEXT NOT NULL,
  day_iso TEXT NOT NULL,
  title TEXT NOT NULL,
  opening TEXT NOT NULL,
  closing TEXT NOT NULL,
  stat TEXT,                        -- light framing stat ("Day 2 · 4 stops")
  beats_json TEXT,                  -- the [{who,kind,snippet}] used (provenance)
  beat_signature TEXT,              -- content fingerprint; unchanged → skip re-gen
  generated_at INTEGER NOT NULL,    -- epoch ms; bumped ONLY when content changed
  updated_at INTEGER NOT NULL       -- epoch ms; every write
);
CREATE INDEX IF NOT EXISTS idx_weaves_trip ON weaves(trip_id, day_iso);
