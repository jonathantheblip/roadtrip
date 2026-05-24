// Tests for canonicalKey + findExisting + the seed-file duplicate check.
// Run via `npm test` (node --test scripts/__tests__/*.test.mjs).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  canonicalKey,
  findExisting,
} from '../../src/data/sideActivities/canonical.js'
import { findDuplicates } from '../checkDuplicates.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SEED_DIR = join(__dirname, '..', '..', 'src', 'data', 'sideActivities')

test('canonicalKey: placeId wins over override + name', () => {
  const k = canonicalKey({
    placeId: 'ChIJ_pid_observed',
    placeIdOverride: 'ChIJ_pid_asserted',
    name: 'Some Place',
    lat: 41.5,
    lng: -72.1,
  })
  assert.equal(k, 'place:ChIJ_pid_observed')
})

test('canonicalKey: placeIdOverride wins when no placeId', () => {
  const k = canonicalKey({
    placeIdOverride: 'ChIJ_asserted',
    name: 'Some Place',
    lat: 41.5,
    lng: -72.1,
  })
  assert.equal(k, 'place:ChIJ_asserted')
})

test('canonicalKey: falls back to name + rounded coords', () => {
  const k = canonicalKey({
    name: 'Ocean Beach Park',
    lat: 41.30972222,
    lng: -72.10312345,
  })
  assert.equal(k, 'nm:ocean beach park|41.3097,-72.1031')
})

test('canonicalKey: normalizes name whitespace + case', () => {
  const k1 = canonicalKey({ name: '  Ocean   BEACH Park ', lat: 41.31, lng: -72.10 })
  const k2 = canonicalKey({ name: 'Ocean Beach Park', lat: 41.31, lng: -72.10 })
  assert.equal(k1, k2)
})

test('canonicalKey: coords with same 4-decimal rounding hash equal', () => {
  // Two points that round to the same 4-decimal grid cell should hash
  // equal. Real-world points that fall on opposite sides of a grid
  // boundary will hash differently — that's an accepted limitation of
  // grid-based fuzzing, traded off for cheap deterministic hashing.
  const k1 = canonicalKey({ name: 'X', lat: 41.31001, lng: -72.10001 })
  const k2 = canonicalKey({ name: 'X', lat: 41.31004, lng: -72.10004 })
  assert.equal(k1, 'nm:x|41.3100,-72.1000')
  assert.equal(k2, 'nm:x|41.3100,-72.1000')
})

test('canonicalKey: empty/null inputs return null', () => {
  assert.equal(canonicalKey(null), null)
  assert.equal(canonicalKey(undefined), null)
  assert.equal(canonicalKey({}), null)
  assert.equal(canonicalKey({ name: '' }), null)
})

test('canonicalKey: name-only without coords still keys', () => {
  // Name alone is weaker but valid — useful for Share-In candidates
  // that haven't been geocoded yet.
  const k = canonicalKey({ name: 'Mystic Pizza' })
  assert.equal(k, 'nm:mystic pizza|,')
})

test('findExisting: matches on placeId', () => {
  const list = [
    { id: 'a', placeId: 'ChIJ1', name: 'A', lat: 1, lng: 1 },
    { id: 'b', placeId: 'ChIJ2', name: 'B', lat: 2, lng: 2 },
  ]
  const hit = findExisting(list, { placeId: 'ChIJ2', name: 'Different Name' })
  assert.equal(hit?.id, 'b')
})

test('findExisting: matches a name+coords candidate against a placeId-keyed activity', () => {
  // Different key shapes intentionally do NOT match — placeId vs name
  // are distinct namespaces. This prevents a fuzzy name match from
  // accidentally suppressing a legitimately different venue.
  const list = [{ id: 'a', placeId: 'ChIJ1', name: 'Ocean Beach Park', lat: 41.31, lng: -72.10 }]
  const hit = findExisting(list, { name: 'Ocean Beach Park', lat: 41.31, lng: -72.10 })
  assert.equal(hit, null)
})

test('findExisting: returns null on empty / unkeyable inputs', () => {
  assert.equal(findExisting([], { placeId: 'X' }), null)
  assert.equal(findExisting([{ id: 'a', placeId: 'X' }], {}), null)
  assert.equal(findExisting(null, { placeId: 'X' }), null)
})

test('seed files: no duplicate activities', () => {
  // Catches the real-world failure mode this whole feature is for:
  // Share-In + manual seed edits drifting into two cards for the same
  // venue. Runs against every seed file under sideActivities/.
  const files = readdirSync(SEED_DIR).filter((f) => f.endsWith('.json'))
  assert.ok(files.length > 0, 'expected at least one seed file')
  for (const file of files) {
    const raw = readFileSync(join(SEED_DIR, file), 'utf8')
    const activities = JSON.parse(raw)
    const { collisions } = findDuplicates(activities)
    if (collisions.length > 0) {
      const detail = collisions
        .map(({ key, group }) => `${key} → ${group.map((a) => a.id).join(', ')}`)
        .join('\n')
      assert.fail(`${basename(file)} has duplicate activities:\n${detail}`)
    }
  }
})
