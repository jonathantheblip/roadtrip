-- The confirm-surface FEEDBACK ledger (S1, BUILD_PLAN_WITNESS_FLEET_2.md §W3 +
-- the Claude Design bundle spec 03 §6). Records the family's answer to the once-
-- a-day confirm card: a confirm (D13 — the strongest evidence the system holds),
-- a correction (a picked alternate place, a retyped name, or free-text words —
-- D15 human words + a normal-weight NEGATIVE signal against the rejected guess),
-- or a permanent set-aside ("leave it as a guess" — durable card suppression,
-- NO negative signal, recorded call #3).
--
-- WHY A NEW TABLE (not memory_heal_decisions / not memory_suggestion_dismissals).
-- 019's heal-decisions ledger is the ENGINE's would-state: DELETE+re-INSERT per
-- trip on every sweep, so it holds no stable per-decision key and cannot carry a
-- human's durable answer (the next sweep would erase it). 018's dismissals are a
-- per-(memory,to_stop) SUPPRESSION for the v1 suggestion channel — a hard "don't
-- offer this," the opposite of S1's NORMAL-weight negative dimension, and it has
-- no shape for a confirm or free-text words. This table is APPEND-ONLY human
-- feedback that OUTLIVES any sweep; the scorer + the projection read the LATEST
-- terminal action per moment. No FK to memories/trips (like 017/018/019 — the
-- record outlives a deleted memory/trip; a stale row is simply never matched).
--
-- SHAPE. One row per terminal card action. A moment's identity is its SET of
-- memory ids (`memory_ids`, JSON — the same identity 019 uses for a session),
-- matched by overlap against a re-swept moment (membership can drift by a photo
-- between sweeps, so the consumer matches on intersection, never exact equality).
-- `action` is the enum. `guessed_*` is the engine's proposal the family answered
-- (the REJECTED place on a 'corrected' row — the target of the negative signal).
-- `corrected_*` is a picked alternate (a 'corrected'-by-pick). `words` is the
-- free-text D15 words, or the retyped name (kind B). `by_traveler` is the session
-- identity (adults only, enforced at the route — never taken from the body).
-- Append-only: a double-tap or a second device racing the same answer just writes
-- another row; the consumer takes max(at) per moment, so latest-wins is harmless
-- (no UNIQUE, so nothing to conflict — the audit trail is preserved intact).
-- 'confirmed'/'corrected' also fire runHealForTrip so the trip re-settles now;
-- 'aside' fires nothing (pure card suppression). 'skip' is NOT stored here at all
-- — it is a client-local, per-device deferral that writes nothing anywhere.
--
-- APPLY ORDER IS LOAD-BEARING (same posture as 017/018/019/020). The worker's own
-- knob (env.PHOTO_CONFIRM_MODE, confirmFeedback.js's photoConfirmMode) defaults
-- OFF, and OFF is the load-bearing inertness property: with it off the /heal-
-- confirm route is inert and issues NO query against this table, so the currently-
-- deployed worker is safe to ship BEFORE this migration is applied (the same
-- mode-gated inertness W5/020 uses). APPLY ORDER once ready to promote past off:
-- apply this migration to prod D1 FIRST (an unused table changes nothing the
-- deployed worker reads or writes) — deploy-worker.yml does NOT run migrations;
-- D1 schema changes need the explicit D1-Edit token + Jonathan's sign-off.
--
-- Idempotency. CREATE TABLE/INDEX are IF NOT EXISTS; no ALTER → fully re-runnable
-- against prod, and the test harness applies it in the IF-NOT-EXISTS group.
CREATE TABLE IF NOT EXISTS memory_heal_feedback (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,  -- monotonic; append/audit order
  trip_id              TEXT NOT NULL,                      -- the trip (no FK — outlives a delete)
  iso_date             TEXT,                               -- the moment's local day (snapshot; day-scope match)
  memory_ids           TEXT NOT NULL,                      -- JSON array of the moment's memory ids — the moment identity
  action               TEXT NOT NULL,                      -- 'confirmed' | 'corrected' | 'aside'
  kind                 TEXT,                               -- 'A'|'B'|'C'|'D' the question variant (audit / why)
  guessed_place_id     TEXT,                               -- the engine's guess the family answered (REJECTED on 'corrected')
  guessed_place_name   TEXT,                               -- snapshot label of the guess
  corrected_place_id   TEXT,                               -- picked alternate stop/base id (a 'corrected' place pick)
  corrected_place_name TEXT,                               -- snapshot label of the corrected place
  words                TEXT,                               -- free-text D15 words, or the retyped name (kind B); NULL otherwise
  by_traveler          TEXT,                               -- who acted (adults only, enforced at the route; from the session)
  at                   INTEGER NOT NULL                    -- when (epoch ms, server clock)
);
CREATE INDEX IF NOT EXISTS idx_heal_feedback_trip ON memory_heal_feedback(trip_id, at DESC);
