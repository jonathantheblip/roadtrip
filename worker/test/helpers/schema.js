// Apply the worker's full D1 schema into a miniflare-bound D1 database.
//
// TEST_STRATEGY_SPEC Unit 1: "Seed D1 schema into the miniflare D1
// binding for tests that touch persistence (the conversations /
// conversation_messages tables, and trips for Unit 6)."
//
// The canonical schema lives in two files:
//   - ../../schema.sql                          (memories, trips — baseline)
//   - ../../migrations/006_claude_conversations.sql
//       (conversations, conversation_messages, family_profiles + seed)
// Both are imported as raw strings (?raw) so they inline at bundle time
// and need no filesystem access inside the workers runtime.
//
// Usage (in a beforeAll/beforeEach, with `env` from 'cloudflare:test'):
//   import { applySchema } from './helpers/schema.js'
//   await applySchema(env.DB)
import baseSchema from '../../schema.sql?raw'
import conversationsMigration from '../../migrations/006_claude_conversations.sql?raw'
import interstitialMigration from '../../migrations/007_memory_interstitial.sql?raw'
import weavesMigration from '../../migrations/008_weaves.sql?raw'
import weaveKeptMigration from '../../migrations/009_weave_kept.sql?raw'
import surprisesMigration from '../../migrations/010_memory_surprises.sql?raw'
import sharesMigration from '../../migrations/011_shares.sql?raw'
import shareLayoutMigration from '../../migrations/012_share_layout.sql?raw'
import authMigration from '../../migrations/013_auth.sql?raw'
import proposalsMigration from '../../migrations/014_proposals.sql?raw'

// Split a .sql file into individually-executable statements. D1's
// prepare() runs one statement at a time, so we can't hand it a whole
// file. A naive split on ";" is wrong: the 006 seed contains a string
// literal with a semicolon inside it
// ('...~2:30 per leg; both adults share driving.'), which a dumb split
// cuts in half. So this is a small character scanner that only treats
// ";" as a separator when NOT inside a '...' string literal, honours
// SQLite's '' escape for an embedded quote, and strips -- line comments
// (whose contents may themselves contain ' or ;).
function splitStatements(sql) {
  const statements = []
  let current = ''
  let inString = false
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]
    const next = sql[i + 1]
    if (inString) {
      if (ch === "'" && next === "'") {
        // Escaped quote inside a literal — consume both, stay in string.
        current += "''"
        i++
      } else if (ch === "'") {
        inString = false
        current += ch
      } else {
        current += ch
      }
      continue
    }
    if (ch === '-' && next === '-') {
      // Line comment — skip to (but not past) end of line; the newline
      // is preserved by the next iteration so statements stay readable.
      while (i < sql.length && sql[i] !== '\n') i++
      continue
    }
    if (ch === "'") {
      inString = true
      current += ch
    } else if (ch === ';') {
      statements.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) statements.push(current)
  return statements.map((s) => s.trim()).filter((s) => s.length > 0)
}

const STATEMENTS = [
  ...splitStatements(baseSchema),
  ...splitStatements(conversationsMigration),
  // 008 is CREATE TABLE/INDEX IF NOT EXISTS, so it's idempotent like the
  // baseline and joins the sequential block directly (unlike 007's ALTER).
  ...splitStatements(weavesMigration),
  // 011 (shares) is also CREATE TABLE/INDEX IF NOT EXISTS — idempotent.
  ...splitStatements(sharesMigration),
  // 013 (auth_links / auth_sessions) is CREATE TABLE/INDEX IF NOT EXISTS too.
  ...splitStatements(authMigration),
  // 014 (proposals) — CREATE TABLE/INDEX IF NOT EXISTS, idempotent.
  ...splitStatements(proposalsMigration),
]

export async function applySchema(db) {
  // Sequential rather than db.batch() — keeps DDL + seed INSERTs
  // obviously correct (no batch-transaction-around-DDL question) and
  // the cost is irrelevant for test setup. Every CREATE uses
  // IF NOT EXISTS and the seed uses INSERT OR REPLACE, so this is
  // idempotent and safe to call more than once.
  for (const stmt of STATEMENTS) {
    await db.prepare(stmt).run()
  }
  // 007 + 009 are ALTER TABLE ... ADD COLUMN, which SQLite gives no
  // IF NOT EXISTS for. applySchema runs once per beforeEach against
  // persistent miniflare storage, so applying them unconditionally would
  // throw "duplicate column name" on the second call. Swallow exactly
  // that error to keep this idempotent like the CREATE IF NOT EXISTS
  // statements above — any other failure still propagates.
  for (const migration of [interstitialMigration, weaveKeptMigration, surprisesMigration, shareLayoutMigration]) {
    for (const stmt of splitStatements(migration)) {
      try {
        await db.prepare(stmt).run()
      } catch (e) {
        if (!/duplicate column name/i.test(String(e?.message || e))) throw e
      }
    }
  }
}
