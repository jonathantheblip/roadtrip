// The settle RHYTHM (FIX 6) — Jonathan's settled pick: quiet days POOL.
// A rich day keeps its evening card; a lone quiet evening mid-trip is SILENT;
// 2+ pending quiet days are offered together; a single quiet day surfaces only
// on the trip's last day or riding a rich day's card. The table is the spec.
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  settleRhythm,
  quietPendingIsos,
  isQuietDay,
  dayPhotoCount,
  isoPlusDays,
  poolIsContiguous,
} from '../../src/lib/settleRhythm.js'

// ── the state table ──────────────────────────────────────────────────────────
const BASE = { live: true, todayKept: false, isEvening: true, todayRich: false, isLastDay: false, todayIso: '2026-07-04', pendingQuiet: [] }

test('settleRhythm: the state table', () => {
  // not live → nothing, ever (the card only exists while today is day N)
  assert.equal(settleRhythm({ ...BASE, live: false, todayRich: true }), null)
  // kept beats everything — the gold confirmation shows any hour, and pending
  // quiets RIDE it (C2: without the rider, keeping the trip's last evening
  // would strand them — the card is showing anyway, a line is not an ask)
  assert.deepEqual(
    settleRhythm({ ...BASE, todayKept: true, pendingQuiet: ['2026-07-02', '2026-07-03'] }),
    { kind: 'kept', rider: ['2026-07-02', '2026-07-03'] }
  )
  assert.deepEqual(settleRhythm({ ...BASE, todayKept: true, isEvening: false }), { kind: 'kept', rider: [] })
  assert.deepEqual(
    settleRhythm({ ...BASE, todayKept: true, isLastDay: true, pendingQuiet: ['2026-07-03'] }),
    { kind: 'kept', rider: ['2026-07-03'] },
    'the last-evening keep no longer swallows the pending quiet day'
  )
  // before evening nothing initiates (the one-ask-a-day settle moment)
  assert.equal(settleRhythm({ ...BASE, isEvening: false, todayRich: true }), null)
  assert.equal(settleRhythm({ ...BASE, isEvening: false, pendingQuiet: ['2026-07-02', '2026-07-03'] }), null)
  // a RICH day keeps its evening card as-is; past quiets ride it as the rider
  assert.deepEqual(settleRhythm({ ...BASE, todayRich: true }), { kind: 'keep', rider: [] })
  assert.deepEqual(settleRhythm({ ...BASE, todayRich: true, pendingQuiet: ['2026-07-03'] }), { kind: 'keep', rider: ['2026-07-03'] })
  // THE new silence: a lone quiet evening mid-trip no longer asks
  assert.equal(settleRhythm({ ...BASE }), null)
  // …but the trip's LAST evening still offers the single nothing-day tap
  assert.deepEqual(settleRhythm({ ...BASE, isLastDay: true }), { kind: 'nothing' })
  // quiet days POOL: yesterday pending + a quiet today → offered together
  assert.deepEqual(settleRhythm({ ...BASE, pendingQuiet: ['2026-07-03'] }), { kind: 'pool', isos: ['2026-07-03', '2026-07-04'] })
  // three pool just the same; pool wins over the last-day single face
  assert.deepEqual(
    settleRhythm({ ...BASE, isLastDay: true, pendingQuiet: ['2026-07-02', '2026-07-03'] }),
    { kind: 'pool', isos: ['2026-07-02', '2026-07-03', '2026-07-04'] }
  )
})

// ── quiet-day classification ─────────────────────────────────────────────────
const TZ = { tz: 'UTC' }
function photoMem(id, iso, hhmm, { lat, lng, author = 'helen', hideFrom } = {}) {
  const at = `${iso}T${hhmm}:00.000Z`
  return {
    id, kind: 'photo', authorTraveler: author, capturedAt: at, createdAt: at,
    ...(hideFrom ? { hideFrom } : {}),
    photoRefs: [{ url: 'x', ...(lat != null ? { lat, lng } : {}), capturedAt: at }],
  }
}

test('isQuietDay: kept or named days are never quiet; rich evidence is not quiet; thin is', () => {
  const keptDay = { isoDate: '2026-07-02', record: { state: 'kept', entries: [] } }
  assert.equal(isQuietDay(keptDay, [], '2026-07-02', TZ), false, 'a kept day is settled, not pending')
  const namedDay = { isoDate: '2026-07-02', record: [{ id: 'r1', name: 'Race Point' }] }
  assert.equal(isQuietDay(namedDay, [], '2026-07-02', TZ), false, 'a named day is rich — retro-settle owns it, not the pool')
  // Two distinct GPS clusters on the day → rich evidence → not quiet.
  const mems = [
    photoMem('a', '2026-07-02', '15:00', { lat: 42.05, lng: -70.24 }),
    photoMem('b', '2026-07-02', '18:00', { lat: 42.06, lng: -70.24 }),
  ]
  assert.equal(isQuietDay(null, mems, '2026-07-02', TZ), false, 'rich-but-unkept stays "Still loose", never pooled')
  assert.equal(isQuietDay(null, [photoMem('c', '2026-07-02', '15:00')], '2026-07-02', TZ), true, 'a photo or two with no places is a quiet day')
  assert.equal(isQuietDay(null, [], '2026-07-02', TZ), true, 'a genuinely empty day is quiet')
})

test('dayPhotoCount: counts the leg-local day’s photos; a hidden surprise never counts for its hidden-from viewer', () => {
  const mems = [
    photoMem('a', '2026-07-02', '15:00'),
    photoMem('b', '2026-07-03', '15:00'), // another day
    photoMem('s', '2026-07-02', '16:00', { author: 'jonathan', hideFrom: ['helen'] }),
  ]
  assert.equal(dayPhotoCount(mems, '2026-07-02', TZ), 2, 'viewer-less count is raw')
  assert.equal(dayPhotoCount(mems, '2026-07-02', { tz: 'UTC', viewer: 'helen' }), 1, 'the secret does not make helen’s day look full')
  assert.equal(dayPhotoCount(mems, '2026-07-02', { tz: 'UTC', viewer: 'jonathan' }), 2, 'the author counts his own')
})

test('isQuietDay: a day made rich ONLY by a hidden surprise reads QUIET to its hidden-from viewer', () => {
  // Six photos, all one unrevealed surprise hidden from helen → for her the day
  // is thin (quiet); for the author it is rich. Per-viewer, not global.
  const mems = Array.from({ length: 6 }, (_, i) =>
    photoMem(`s${i}`, '2026-07-02', `1${i}:00`, { author: 'jonathan', hideFrom: ['helen'] }))
  assert.equal(isQuietDay(null, mems, '2026-07-02', { tz: 'UTC', viewer: 'helen' }), true)
  assert.equal(isQuietDay(null, mems, '2026-07-02', { tz: 'UTC', viewer: 'jonathan' }), false)
})

test('quietPendingIsos: past un-kept quiet days, ascending — kept, named, and rich days excluded', () => {
  const trip = {
    dateRangeStart: '2026-07-01', dateRangeEnd: '2026-07-06',
    days: [
      { isoDate: '2026-07-01', record: { state: 'kept', entries: [], nothing: true } }, // kept → out
      { isoDate: '2026-07-02', record: [{ id: 'r1', name: 'The dunes' }] }, // named → out
      // 07-03 never written by the trip (a hangout date) → quiet
    ],
  }
  const mems = [
    // 07-03: one photo (thin) — still quiet
    photoMem('a', '2026-07-03', '15:00'),
  ]
  assert.deepEqual(quietPendingIsos(trip, mems, '2026-07-04', TZ), ['2026-07-03'])
  // today (07-04) is never in the PENDING list — the table adds it when quiet
  assert.deepEqual(quietPendingIsos(trip, [], '2026-07-02', TZ), [], 'a kept yesterday leaves nothing pending')
  assert.deepEqual(quietPendingIsos({ ...trip, dateRangeStart: '' }, mems, '2026-07-04', TZ), [], 'no start date → nothing to walk')
})

test('isoPlusDays / poolIsContiguous: the "last two days" phrasing may only claim a real run', () => {
  assert.equal(isoPlusDays('2026-07-03', 1), '2026-07-04')
  assert.equal(isoPlusDays('2026-12-31', 1), '2027-01-01', 'year rollover, UTC-safe')
  assert.equal(poolIsContiguous(['2026-07-03', '2026-07-04']), true)
  assert.equal(poolIsContiguous(['2026-07-01', '2026-07-04']), false, 'a gapped pool is not "the last two days"')
  assert.equal(poolIsContiguous([]), false)
})
