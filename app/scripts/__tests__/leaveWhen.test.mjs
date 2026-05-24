// Tests for the leave-when iteration loop. Lives at the app level (not
// the worker dir) so `npm test` from app/ runs it alongside the fetcher
// tests. Imports from worker/src/leaveWhen.js — both directories sit
// under the same repo and Node ESM resolves the relative path fine.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  iterateLeaveBy,
  straightLineMinutes,
} from '../../../worker/src/leaveWhen.js'

// Build a callRoutes mock that returns canned durations and counts calls.
function mockRoutes(durationsMin) {
  const calls = []
  let i = 0
  return {
    calls,
    fn: async (departureISO) => {
      calls.push(departureISO)
      const d = durationsMin[Math.min(i, durationsMin.length - 1)]
      i += 1
      return { durationMinutes: d }
    },
  }
}

// Fixed "now" anchor so tests don't drift with wall clock. Friday May 22
// 2026, 9:00 AM local. All targets are later the same day.
const NOW = new Date('2026-05-22T09:00:00').getTime()
const target = (hhmm) => new Date(`2026-05-22T${hhmm}:00`)

// ─── Convergence ───────────────────────────────────────────────────────

test('iterateLeaveBy: converges in 1 call when seed matches actual', async () => {
  const t = target('13:00')
  const m = mockRoutes([20])
  const r = await iterateLeaveBy({
    targetArrival: t,
    seedDurationMinutes: 20,
    callRoutes: m.fn,
    now: NOW,
  })
  assert.equal(r.iterations, 1)
  assert.equal(r.durationMinutes, 20)
  // leave-by should be exactly 20 min before target
  const deltaMs = t.getTime() - new Date(r.leaveByISO).getTime()
  assert.equal(deltaMs, 20 * 60 * 1000)
})

test('iterateLeaveBy: converges in 2 calls when seed is off', async () => {
  // Seed says 20, actual at that departure says 30. Then we adjust by
  // the 10-min delta and re-call; the 2nd call still says 30 → done
  // (within tolerance because the new departure leaves room).
  const m = mockRoutes([30, 30])
  const r = await iterateLeaveBy({
    targetArrival: target('13:00'),
    seedDurationMinutes: 20,
    callRoutes: m.fn,
    now: NOW,
  })
  assert.equal(r.iterations, 2)
  assert.equal(r.durationMinutes, 30)
})

test('iterateLeaveBy: caps at maxIterations even if never converging', async () => {
  // Pathological case — durations alternate so we never settle.
  const m = mockRoutes([30, 20, 30, 20, 30])
  const r = await iterateLeaveBy({
    targetArrival: target('13:00'),
    seedDurationMinutes: 25,
    callRoutes: m.fn,
    now: NOW,
    maxIterations: 3,
  })
  assert.equal(r.iterations, 3)
  assert.equal(m.calls.length, 3)
})

// ─── Traffic note ──────────────────────────────────────────────────────

test('iterateLeaveBy: sets trafficNote when actual > 1.25 × seed', async () => {
  const m = mockRoutes([45, 45]) // seed 20, actual 45 → 2.25× — flag it
  const r = await iterateLeaveBy({
    targetArrival: target('13:00'),
    seedDurationMinutes: 20,
    callRoutes: m.fn,
    now: NOW,
  })
  assert.ok(r.trafficNote)
  assert.match(r.trafficNote, /20 min/)
})

test('iterateLeaveBy: trafficNote is null when actual ≈ seed', async () => {
  const m = mockRoutes([21])
  const r = await iterateLeaveBy({
    targetArrival: target('13:00'),
    seedDurationMinutes: 20,
    callRoutes: m.fn,
    now: NOW,
  })
  assert.equal(r.trafficNote, null)
})

// ─── Edge cases ────────────────────────────────────────────────────────

test('iterateLeaveBy: throws on past targetArrival', async () => {
  await assert.rejects(
    iterateLeaveBy({
      targetArrival: new Date(NOW - 60_000),
      seedDurationMinutes: 20,
      callRoutes: async () => ({ durationMinutes: 20 }),
      now: NOW,
    }),
    /already past|invalid/i
  )
})

test('iterateLeaveBy: throws on non-finite seed', async () => {
  await assert.rejects(
    iterateLeaveBy({
      targetArrival: target('13:00'),
      seedDurationMinutes: 'lots',
      callRoutes: async () => ({ durationMinutes: 20 }),
      now: NOW,
    }),
    /positive/i
  )
})

test('iterateLeaveBy: snaps departure to now+30s when seed would put it in the past', async () => {
  // Target is 5 min from now but seed says 30 → naive departure is 25
  // min ago. Should snap forward and produce a sensible result instead
  // of asking Routes about a past time.
  const m = mockRoutes([5])
  const r = await iterateLeaveBy({
    targetArrival: new Date(NOW + 5 * 60_000),
    seedDurationMinutes: 30,
    callRoutes: m.fn,
    now: NOW,
  })
  // First call should have used now+30s as departure
  assert.equal(
    new Date(m.calls[0]).getTime(),
    NOW + 30_000
  )
  assert.ok(r.iterations >= 1)
})

// ─── Straight-line fallback ────────────────────────────────────────────

test('straightLineMinutes: New London to Mohegan Sun ≈ realistic', () => {
  // New London bungalow (41.3225, -72.0943) → Mohegan Sun (41.4934, -72.0904)
  // is ~12 mi by air. At 30 mph that's ~24 min. (Actual driving via
  // I-395 is ~20-25 min.)
  const m = straightLineMinutes(41.3225, -72.0943, 41.4934, -72.0904)
  assert.ok(m >= 18 && m <= 28, `expected ~24 min, got ${m}`)
})

test('straightLineMinutes: same point → 1 min floor (never 0)', () => {
  assert.equal(straightLineMinutes(41.0, -72.0, 41.0, -72.0), 1)
})
