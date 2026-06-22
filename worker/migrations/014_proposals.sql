-- Propose → decide (slice 6) — the family's daily "what should we do?" loop.
--
-- Anyone (even a kid) proposes a "We could…" spot for OPEN time; non-deciders
-- add a soft "I'm in"; the DECIDERS (the adults — jonathan/helen, the same list
-- auth keys off) accept or decline. Booked plans are never proposed; surprises
-- never enter (a proposal references a nearby SPOT, not a memory, so the
-- surprise-masking boundary is untouched).
--
-- ONE TABLE: proposals. Each row is one pending/decided idea for a trip. The
-- proposer / voters / decider identities are written from the request's SESSION
-- (worker/src/proposals.js takes `traveler`), NEVER a body-supplied id — same
-- posture as memories/auth. `spot_json` snapshots the proposed card's display
-- data (title/place/photo/travel/category) so every family device renders the
-- same card without re-fetching the per-device nearby list.
--
-- Idempotent (CREATE TABLE/INDEX IF NOT EXISTS) like 013, safe to apply more
-- than once. Applied to prod D1 manually via the Cloudflare dashboard console.
-- The worker ops (proposals.js) degrade to empty / 503 if this table is absent,
-- so deploying the worker before this is applied never 500s or locks anyone out.

CREATE TABLE IF NOT EXISTS proposals (
  id              TEXT PRIMARY KEY,                 -- client-generated (like memories)
  trip_id         TEXT NOT NULL,                    -- the trip this idea is for
  spot_id         TEXT NOT NULL,                    -- the proposed "We could…" spot (a place id)
  spot_json       TEXT,                             -- snapshot of the spot's display data
  proposed_by     TEXT NOT NULL,                    -- proposer's traveler — from the SESSION, never the body
  recipients_json TEXT NOT NULL DEFAULT '[]',       -- "send to" travelers
  note            TEXT,                             -- optional note (length-capped in the op)
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted | declined
  votes_json      TEXT NOT NULL DEFAULT '[]',       -- soft "I'm in" votes (travelers)
  decided_by      TEXT,                             -- which adult decided (null until decided)
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_proposals_trip ON proposals(trip_id);
