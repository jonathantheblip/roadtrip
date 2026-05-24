-- Claude-in-App M1.2 — conversation persistence + family profiles.
--
-- The chat endpoint (`POST /claude/chat`) writes one user message and
-- one assistant message into `conversation_messages` per round trip;
-- the parent `conversations` row is upserted on the first message of a
-- new id so the client can mint a fresh conversation by just sending
-- with a new uuid.
--
-- `family_profiles` is the seed of context Claude is given on every
-- call: who the readers are, what they like, what they avoid. Helen +
-- Jonathan are full rows; Aurelia + Rafa are present so reader-identity
-- still resolves cleanly if either kid is ever switched to as the
-- active traveler. Fields are sparse on purpose — we add as we learn.
--
-- Numbering: this is the first file in the new `migrations/` directory.
-- The existing `worker/schema.sql` remains the baseline (memories +
-- trips). 006 carries over the conceptual numbering from the build
-- prompt (Worker has shipped /leave-when, /places/nearby, /resolve,
-- /draft, /assets — Claude conversations is the next surface).
--
-- Idempotent — every CREATE uses IF NOT EXISTS so re-running this is
-- safe. INSERTs use INSERT OR REPLACE so seed updates land on re-run.

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  trip_id TEXT,                             -- NULL for trips-list-level chats
  created_at TEXT NOT NULL,                 -- ISO 8601
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conversations_user_trip
  ON conversations(user_id, trip_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  role TEXT NOT NULL,                       -- 'user' | 'assistant'
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,                 -- ISO 8601
  usage_input_tokens INTEGER,
  usage_output_tokens INTEGER
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON conversation_messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS family_profiles (
  user_id TEXT PRIMARY KEY,                 -- 'jonathan' | 'helen' | 'aurelia' | 'rafa'
  display_name TEXT NOT NULL,
  age TEXT,                                 -- string ("4", "13", "Mom", "Dad") — kept loose
  role TEXT,                                -- "ops" | "archive" | "her stuff" | "mission"
  dietary TEXT,                             -- short free-text, e.g. "vegetarian"
  interests TEXT,                           -- short free-text
  tolerances TEXT,                          -- rules ("no plans past 9 PM with Rafa")
  notes TEXT,                               -- anything else worth seeding into the prompt
  updated_at TEXT NOT NULL
);

-- Seed the four family members. Profiles are deliberately sparse — the
-- M1 prompt instructs Claude to ground in what's here and ask Helen
-- rather than invent specifics.
INSERT OR REPLACE INTO family_profiles
  (user_id, display_name, age, role, dietary, interests, tolerances, notes, updated_at)
VALUES
  ('jonathan', 'Jonathan', 'Dad', 'ops',
   NULL,
   'Driving logistics, podcasts, dad-paced city exploring.',
   'Family driving limit ~2:30 per leg; both adults share driving.',
   'Plans the operational layer (drives, parking, fuel, timing).',
   datetime('now')),
  ('helen', 'Helen', 'Mom', 'archive',
   NULL,
   'Photography, food/restaurants, museums, family memory-keeping.',
   'Prefers no plans past 9 PM with Rafa.',
   'Owns the archive; writes most of the trip narrative.',
   datetime('now')),
  ('aurelia', 'Aurelia', '13', 'her stuff',
   NULL,
   'Photography, teen-photogenic content, food, volleyball.',
   NULL,
   'Plays competitive volleyball; tournament weekends are non-negotiable anchors.',
   datetime('now')),
  ('rafa', 'Rafa', '4', 'mission',
   NULL,
   'Monster trucks, hands-on exhibits, levers and buttons.',
   'No plans past 9 PM; needs snack + bathroom cadence.',
   'Five years old this spring; the day rhythm bends around him.',
   datetime('now'));
