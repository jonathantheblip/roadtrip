// Duplicate-activities check. Walks every <tripId>.json seed file under
// app/src/data/sideActivities/, computes each activity's canonical key,
// and reports collisions. Two activities sharing a key are duplicates
// (they refer to the same real-world place) and at least one should
// either be removed or have its identifying fields corrected.
//
// Usage:
//   npm run check-duplicates              # scan every seed file
//   npm run check-duplicates volleyball-2026   # scan one trip's file
//
// Exit codes:
//   0 = no collisions found
//   1 = collisions exist (also prints them)
//   2 = invalid invocation / file read error

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonicalKey } from '../src/data/sideActivities/canonical.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const SEED_DIR = join(__dirname, '..', 'src', 'data', 'sideActivities')

function loadSeedFile(filePath) {
  const raw = readFileSync(filePath, 'utf8')
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) {
    throw new Error(`${filePath}: not a JSON array`)
  }
  return parsed
}

// Returns an array of collision groups (each group is 2+ activities
// that share the same canonical key). Activities with a null key are
// reported separately as `nullKeys` — they're not duplicates per se,
// but they can't be de-duplicated and that's worth flagging.
export function findDuplicates(activities) {
  const byKey = new Map()
  const nullKeys = []
  for (const a of activities) {
    const k = canonicalKey(a)
    if (k == null) {
      nullKeys.push(a)
      continue
    }
    if (!byKey.has(k)) byKey.set(k, [])
    byKey.get(k).push(a)
  }
  const collisions = []
  for (const [key, group] of byKey) {
    if (group.length > 1) collisions.push({ key, group })
  }
  return { collisions, nullKeys }
}

function main() {
  const onlyTripId = process.argv[2] || null
  const files = readdirSync(SEED_DIR)
    .filter((f) => f.endsWith('.json'))
    .filter((f) => !onlyTripId || basename(f, '.json') === onlyTripId)
    .map((f) => join(SEED_DIR, f))

  if (files.length === 0) {
    console.error(
      onlyTripId
        ? `no seed file found for tripId="${onlyTripId}"`
        : `no .json seed files in ${SEED_DIR}`
    )
    process.exit(2)
  }

  let totalCollisions = 0
  let totalNullKeys = 0
  for (const file of files) {
    let activities
    try {
      activities = loadSeedFile(file)
    } catch (e) {
      console.error(`error reading ${file}: ${e.message}`)
      process.exit(2)
    }
    const { collisions, nullKeys } = findDuplicates(activities)
    const tripId = basename(file, '.json')
    if (collisions.length === 0 && nullKeys.length === 0) {
      console.log(`✓ ${tripId} — ${activities.length} activities, no duplicates`)
      continue
    }
    console.log(`\n${tripId} (${activities.length} activities):`)
    for (const { key, group } of collisions) {
      totalCollisions += 1
      console.log(`  ✕ collision on key ${key}`)
      for (const a of group) {
        console.log(`      - ${a.id} (${a.name || '<no name>'})`)
      }
    }
    for (const a of nullKeys) {
      totalNullKeys += 1
      console.log(`  ? un-keyable: ${a.id} (${a.name || '<no name>'}) — missing both placeId/placeIdOverride AND name+coords`)
    }
  }

  if (totalCollisions > 0) {
    console.log(`\n${totalCollisions} collision group${totalCollisions === 1 ? '' : 's'} found.`)
    process.exit(1)
  }
  if (totalNullKeys > 0) {
    console.log(`\n${totalNullKeys} un-keyable activit${totalNullKeys === 1 ? 'y' : 'ies'} — review and add identifying fields.`)
  }
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (invokedDirectly) main()
