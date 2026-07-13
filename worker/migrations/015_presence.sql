-- "Who's around" (slice 8) — live family presence during an ACTIVE trip.
-- One row per (trip, traveler), overwritten on each update (latest position only).
-- PRIVACY (settled): adults store precise lat/lng; KIDS NEVER DO — the write op
-- refuses to store coordinates for a non-adult, so a kid's row only ever carries
-- the coarse bucket. Identity is the SESSION traveler, never a body-supplied id.
-- Idempotent (IF NOT EXISTS) like 013/014; the worker degrades (GET -> [],
-- writes -> 503) if this table is absent, so deploying before it's applied never 500s.
--
-- ★ AMENDED 2026-07-12 (Build W5, BUILD_PLAN_WITNESS_FLEET_2.md) — THIS
-- TABLE's own promise is UNCHANGED (still latest-position-only, overwritten
-- every heartbeat, purged at trip-end/staleness — nothing above this line is
-- stale). What changed is a SEPARATE, new table: migration 020's
-- presence_trail, an append-only HISTORY of the same adults-only fixes this
-- table already receives. Read 020's header for the full consented design
-- (Jonathan, 2026-07-12, for both adults) — this note exists here only so
-- nobody reads THIS file in isolation and assumes it's still the whole
-- story.

CREATE TABLE IF NOT EXISTS presence (
  trip_id      TEXT NOT NULL,                 -- the trip this presence is for
  traveler     TEXT NOT NULL,                 -- who — from the SESSION, never the body
  precise      INTEGER NOT NULL DEFAULT 0,    -- 1 = row carries real lat/lng (adults only); 0 = coarse-only (kids)
  lat          REAL,                          -- adults only; ALWAYS NULL for kids (server refuses to store it)
  lng          REAL,                          -- adults only; ALWAYS NULL for kids
  accuracy     REAL,                          -- GPS fix accuracy (m), adults only — sizes the map dot
  place_bucket TEXT,                          -- coarse status everyone shares: 'at_place' | 'out' | 'unknown'
  note         TEXT,                          -- optional manual status ("at the beach"); NULL = show the auto bucket
  updated_at   INTEGER NOT NULL,              -- last refresh — powers the idle dot AND the trip-end purge
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (trip_id, traveler)             -- one latest row per person per trip; also indexes trip lookups
);
