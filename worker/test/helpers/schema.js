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
}
