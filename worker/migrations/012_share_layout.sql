-- Share-out (Phase 2, E2) — the chosen collage LAYOUT for a composed share.
--
-- A composed-collage share (created by the in-app Composer) carries an author-
-- chosen layout: 'wall' | 'mosaic' | 'stack' | 'filmstrip'. The public page
-- GET /m/:token reads it and renders the collage accordingly. NULL = the default
-- 'wall' — so every EXISTING share (and every single-photo / note / voice share)
-- is unaffected: the column is inert for them. Nullable, no backfill, no data
-- risk. Layout is a presentation choice of the SHARE (not the memory), so it
-- lives here, not on memories.
--
-- ALTER TABLE ... ADD COLUMN (SQLite gives no IF NOT EXISTS for it); the test
-- schema helper swallows "duplicate column name" so this stays idempotent.

ALTER TABLE shares ADD COLUMN layout TEXT;
