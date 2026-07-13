-- Presence BREADCRUMB TRAIL (Build W5, BUILD_PLAN_WITNESS_FLEET_2.md) — the
-- strongest forward witness: "your phone was at the parade at 2:03, so this
-- 2:05 photo belongs there." An APPEND-ONLY history, deliberately separate
-- from migration 015's `presence` (latest-position-only, overwritten every
-- heartbeat) — the whole point of this table is to REMEMBER where an adult's
-- phone has been across a trip, which 015 was built to explicitly NOT do.
--
-- WHY THIS REVERSES TWO SETTLED PRIVACY PROPERTIES (named, not silently
-- crossed). 015's header describes presence as ephemeral/latest-only and
-- "isolated by construction — nothing else in the worker reads this table."
-- This table breaks BOTH: it accumulates a HISTORY, and the heal engine
-- (worker/src/presenceWitness.js) is now the ONE named exception that reads
-- location data server-side. Both reversals are CONSENTED — Jonathan,
-- 2026-07-12, speaking for both adults: "we are both comfortable retiring
-- the promise about storing locations, given that this is an app for our
-- family only that is being overseen by me personally." The consented shape,
-- exactly what ships:
--   • ADULTS-ONLY rows — the SAME double gate as 015 (a non-adult's
--     coordinates are refused before they ever reach a body the server
--     trusts; sanitizePresence's `precise` flag, reused verbatim by
--     appendPresenceTrail in presence.js — no new kid-check invented here).
--   • READABLE BY NOBODY over HTTP — there is no GET route for this table,
--     ever. Not a screen, not a device sync, not Claude, not the weave, not
--     surprises. The ONLY reader is the nightly heal sweep's
--     presenceWitness.js, matching a still-unlocated photo against its own
--     author's crumbs and writing `prov.gps='inferred-presence'` back onto
--     the memory it belongs to — never re-exposing a raw crumb anywhere.
--   • RETENTION = trip + 14 days, then purged (worker/src/presence.js's
--     runPresencePurge, extended in the same build that adds this table) —
--     a tunable Jonathan can revisit later; trip+14d is the shipped default.
--   • MANUAL PER-ADULT WIPE — a future operational lever; not built as a
--     route in the build that adds this table (outside its file allowlist);
--     Jonathan can DELETE rows directly via D1 in the meantime.
--
-- THE SCOPE BOUNDARY THIS MIGRATION SHIPS UNDER. Written in the SAME commit
-- as the code that would read/write it, but deliberately NOT APPLIED to prod
-- D1 by that commit — applying a migration needs the explicit D1-Edit token
-- + Jonathan's sign-off (WORKING_AGREEMENT.md §3), done as its own, separate
-- step. Until it is applied, the worker's OWN knob (env.PHOTO_PRESENCE_MODE,
-- presence.js's photoPresenceMode) defaults OFF, and OFF is the load-bearing
-- inertness property: with it off, NEITHER the trail-write (presence.js's
-- appendPresenceTrail) NOR the witness-read (presenceWitness.js) ever issues
-- a SINGLE query against this table — so the currently-deployed worker is
-- safe to ship BEFORE this migration is applied (same "safe under the
-- currently-deployed worker" posture as 017/018/019's own headers, achieved
-- here via the mode gate rather than an unread column/table). APPLY ORDER
-- once Jonathan is ready to promote past off: apply this migration to prod
-- D1 FIRST (an unused table changes nothing the CURRENTLY-DEPLOYED worker
-- reads or writes), exactly like every migration before it —
-- deploy-worker.yml does NOT run migrations.
--
-- SHAPE. One row per adult GPS fix, ever (append, never overwritten/updated —
-- the opposite of 015's ON CONFLICT upsert). No foreign key to trips (outlives
-- a trip like every other append-only ledger in this schema — 017/018/019);
-- a trip's rows are found by trip_id and pruned by the purge sweep instead of
-- a cascade. Idempotent (IF NOT EXISTS), same posture as 015/016/017/018/019.
CREATE TABLE IF NOT EXISTS presence_trail (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,  -- monotonic; append order
  trip_id    TEXT NOT NULL,                      -- the trip this crumb belongs to
  traveler   TEXT NOT NULL,                      -- who — ADULTS ONLY (the double gate, enforced in presence.js)
  lat        REAL NOT NULL,                      -- a real fix only; no coarse-only rows here (see appendPresenceTrail)
  lng        REAL NOT NULL,
  accuracy   REAL,                               -- GPS fix accuracy (m) — the witness refuses anything worse than 100m
  at         INTEGER NOT NULL                    -- when this fix was posted (epoch ms, server clock)
);
CREATE INDEX IF NOT EXISTS idx_presence_trail_lookup ON presence_trail(trip_id, traveler, at);
