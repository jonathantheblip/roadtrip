// Tests for the surgical-edit helpers in fetchHeroImages.mjs.
//
// These pin down the brace-scoped behavior of applyHeroBlock and
// applyHoursStructured. Without the scoping fix shipped with v1.5,
// a helper called for activity A could mutate activity B's hero
// or hoursStructured field because the regex/indexOf walked past
// A's closing brace. The cascading-bug tests below should fail if
// either helper reverts to unbounded scanning.
//
// Run from repo root:
//   node --test app/scripts/__tests__/*.test.mjs
// Or from inside app/:
//   npm test

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  applyHeroBlock,
  applyHoursStructured,
} from '../fetchHeroImages.mjs'

// Two-activity fixture. Whitespace matters — the helpers do
// byte-precise string replacement and re-indent against the
// surrounding newline, so we keep this fixture shaped like a real
// seed file.
function twoActivityFixture({ hoursA, hoursB, heroA, heroB }) {
  const aBlock = [
    '  {',
    '    "id": "alpha",',
    '    "name": "Alpha",',
    hoursA == null ? null : `    "hoursStructured": ${JSON.stringify(hoursA)},`,
    `    "heroImage": ${JSON.stringify(heroA)}`,
    '  }',
  ].filter(Boolean).join('\n')
  const bBlock = [
    '  {',
    '    "id": "beta",',
    '    "name": "Beta",',
    hoursB == null ? null : `    "hoursStructured": ${JSON.stringify(hoursB)},`,
    `    "heroImage": ${JSON.stringify(heroB)}`,
    '  }',
  ].filter(Boolean).join('\n')
  return `[\n${aBlock},\n${bBlock}\n]\n`
}

// Pluck the substring between `"id": "<id>"` and the next `}` (i.e.
// the activity object's tail) for use in byte-for-byte equality checks.
function sliceActivityTail(raw, id) {
  const anchor = raw.indexOf(`"id": ${JSON.stringify(id)}`)
  assert.ok(anchor !== -1, `expected to find id ${id} in fixture`)
  const close = raw.indexOf('}', anchor)
  return raw.slice(anchor, close + 1)
}

// --- applyHeroBlock --------------------------------------------------

test('applyHeroBlock: no hero block on anchor → no-op, neighbor untouched', () => {
  // alpha has no heroImage field at all; beta has one. The helper
  // must NOT reach across into beta's hero block.
  const raw = [
    '[',
    '  {',
    '    "id": "alpha",',
    '    "name": "Alpha"',
    '  },',
    '  {',
    '    "id": "beta",',
    '    "name": "Beta",',
    '    "heroImage": "./activities/beta.webp",',
    '    "heroImageSource": "places",',
    '    "heroImageCredit": "Bob"',
    '  }',
    ']',
    '',
  ].join('\n')
  const betaBefore = sliceActivityTail(raw, 'beta')

  const r = applyHeroBlock(raw, 'alpha', {
    heroImage: './activities/alpha.webp',
    heroImageSource: 'places',
    heroImageCredit: 'Alice',
  })

  assert.equal(r.applied, false, 'expected no-op for missing hero block')
  // raw should be returned unchanged
  assert.equal(r.raw, raw)
  // beta's bytes specifically must be intact
  assert.equal(sliceActivityTail(r.raw, 'beta'), betaBefore)
})

test('applyHeroBlock: both activities have heroes → only anchor changes', () => {
  const raw = twoActivityFixture({
    hoursA: null,
    hoursB: null,
    heroA: './activities/alpha-old.webp',
    heroB: './activities/beta.webp',
  })
  const betaBefore = sliceActivityTail(raw, 'beta')

  const r = applyHeroBlock(raw, 'alpha', {
    heroImage: './activities/alpha-new.webp',
    heroImageSource: 'places',
    heroImageCredit: 'Alice',
  })

  assert.equal(r.applied, true)
  // alpha's hero block now reflects new value
  const alphaAfter = sliceActivityTail(r.raw, 'alpha')
  assert.match(alphaAfter, /alpha-new\.webp/)
  assert.doesNotMatch(alphaAfter, /alpha-old\.webp/)
  // beta unchanged byte-for-byte
  assert.equal(sliceActivityTail(r.raw, 'beta'), betaBefore)
})

// --- applyHoursStructured -------------------------------------------

test('applyHoursStructured: anchor has no hours field, value=null → no-op, neighbor untouched', () => {
  // The classic cascading-bug shape: alpha has no hoursStructured,
  // beta does. Calling applyHoursStructured('alpha', null) must not
  // delete beta's hoursStructured.
  const hoursB = {
    weekday: ['Sunday: Closed'],
    periods: [{ open: { day: 1, hour: 9, minute: 0 } }],
  }
  const raw = twoActivityFixture({
    hoursA: null,
    hoursB,
    heroA: null,
    heroB: './activities/beta.webp',
  })
  const betaBefore = sliceActivityTail(raw, 'beta')

  const r = applyHoursStructured(raw, 'alpha', null)

  assert.equal(r.applied, false)
  assert.equal(r.raw, raw)
  assert.equal(sliceActivityTail(r.raw, 'beta'), betaBefore)
})

test('applyHoursStructured: anchor has hours, neighbor also has hours → only anchor updates', () => {
  const hoursA = {
    weekday: ['Sunday: 9-5'],
    periods: [{ open: { day: 0, hour: 9, minute: 0 }, close: { day: 0, hour: 17, minute: 0 } }],
  }
  const hoursB = {
    weekday: ['Sunday: 10-6'],
    periods: [{ open: { day: 0, hour: 10, minute: 0 }, close: { day: 0, hour: 18, minute: 0 } }],
  }
  const raw = twoActivityFixture({
    hoursA,
    hoursB,
    heroA: null,
    heroB: null,
  })
  const betaBefore = sliceActivityTail(raw, 'beta')

  const newHoursA = {
    weekday: ['Sunday: 8-4'],
    periods: [{ open: { day: 0, hour: 8, minute: 0 }, close: { day: 0, hour: 16, minute: 0 } }],
  }
  const r = applyHoursStructured(raw, 'alpha', newHoursA)

  assert.equal(r.applied, true)
  // alpha now carries the new value
  const alphaAfter = sliceActivityTail(r.raw, 'alpha')
  assert.match(alphaAfter, /"hour":8/)
  assert.doesNotMatch(alphaAfter, /"hour":9/)
  // beta unchanged byte-for-byte
  assert.equal(sliceActivityTail(r.raw, 'beta'), betaBefore)
})

// --- applyHoursStructured deletion path (also brace-scoped) ----------

test('applyHoursStructured: anchor has hours, neighbor has hours, value=null → only anchor deleted', () => {
  // Without scoping, calling with value=null could fall through to a
  // delete that grabs the wrong block. This test pins the deletion
  // path specifically.
  const hoursA = {
    weekday: ['Sunday: 9-5'],
    periods: [{ open: { day: 0, hour: 9, minute: 0 } }],
  }
  const hoursB = {
    weekday: ['Sunday: 10-6'],
    periods: [{ open: { day: 0, hour: 10, minute: 0 } }],
  }
  const raw = twoActivityFixture({
    hoursA,
    hoursB,
    heroA: null,
    heroB: null,
  })
  const betaBefore = sliceActivityTail(raw, 'beta')

  const r = applyHoursStructured(raw, 'alpha', null)

  assert.equal(r.applied, true)
  const alphaAfter = sliceActivityTail(r.raw, 'alpha')
  assert.doesNotMatch(alphaAfter, /hoursStructured/)
  assert.equal(sliceActivityTail(r.raw, 'beta'), betaBefore)
})
