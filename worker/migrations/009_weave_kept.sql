-- Migration 009 — "keep this page" → the little book (WEAVE_SCOPE slice 3, part 2).
--
-- A kept weave is one the family chose to put in the trip's book. The book is
-- SHARED (one per trip): anyone keeps a page → everyone sees it. We mark it on
-- the existing per-(trip,day) weaves row rather than a separate table, since a
-- day has exactly one shared weave. kept_at NULL = not kept; non-null = the ms
-- it was kept (also gives a stable "added to the book" order if wanted).
--
-- SQLite ALTER TABLE ADD COLUMN has no IF NOT EXISTS — applied once to prod D1;
-- test/helpers/schema.js swallows the duplicate-column error on re-run (007
-- pattern).

ALTER TABLE weaves ADD COLUMN kept_at INTEGER;
