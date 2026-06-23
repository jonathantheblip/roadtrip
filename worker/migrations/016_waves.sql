-- Cross-device "Wave hi!" (slice — Rafa's wave, made real + bidirectional).
--
-- A wave is a tiny DIRECTED ping — who waved, at whom, on which trip, when — and
-- nothing else (no location, no message). Family-internal; never enters Claude or
-- the weave. The sender (from_traveler) is written from the request's SESSION,
-- never a body-supplied id (same posture as proposals/presence). `seen_at` stays
-- NULL until the recipient's device has shown the wave once, so a wave survives
-- until they're next online and shows exactly once. Auto-purged on the nightly
-- cron (seen waves + stale unseen) so the table can't grow without bound.
--
-- Idempotent (IF NOT EXISTS) like 014/015; the worker degrades (GET -> [],
-- writes -> 503) if this table is absent, so deploying before it's applied never 500s.

CREATE TABLE IF NOT EXISTS waves (
  id            TEXT PRIMARY KEY,                 -- client-generated (idempotent retry)
  trip_id       TEXT NOT NULL,
  from_traveler TEXT NOT NULL,                    -- sender — from the SESSION, never the body
  to_traveler   TEXT NOT NULL,                    -- recipient
  created_at    INTEGER NOT NULL,
  seen_at       INTEGER                           -- NULL until the recipient has seen it
);
CREATE INDEX IF NOT EXISTS idx_waves_to ON waves(trip_id, to_traveler);
