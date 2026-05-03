-- Roadtrip sync schema. Single canonical store for memories + trips,
-- replacing CloudKit. D1 (SQLite) — soft-delete model so syncs see
-- tombstones via updated_at > since.

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  trip_id TEXT,
  stop_id TEXT,
  author_traveler TEXT NOT NULL,
  visibility TEXT NOT NULL,                 -- 'shared' | 'private'
  kind TEXT,                                -- 'text' | 'voice' | 'photo'
  text TEXT,
  caption TEXT,
  transcript TEXT,
  transcript_lang TEXT,
  transcription_status TEXT,
  duration_seconds REAL,
  mood TEXT,
  reactions_json TEXT,
  audio_r2_key TEXT,
  audio_mime TEXT,
  photo_r2_key TEXT,
  photo_mime TEXT,
  photo_r2_keys_json TEXT,                  -- JSON array of {key, mime} for photoRefs[] albums
  photo_external_urls_json TEXT,
  created_at INTEGER NOT NULL,              -- epoch ms
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_memories_trip ON memories(trip_id);
CREATE INDEX IF NOT EXISTS idx_memories_updated ON memories(updated_at);
CREATE INDEX IF NOT EXISTS idx_memories_author_visibility ON memories(author_traveler, visibility);

CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY,
  title TEXT,
  date_range_start TEXT,
  date_range_end TEXT,
  end_city TEXT,
  data_json TEXT NOT NULL,                  -- whole trip object
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_trips_updated ON trips(updated_at);
