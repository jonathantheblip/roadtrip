// The auto-apply gate truth table (SPEC §5 D + §7). Each test crafts one memory
// + a resolved trip context and pins the decision — move / suggest / none — and
// its reason. This is where the prime directive ("a wrong silent move is worse
// than no move; auto never overwrites manual") is proven gate by gate.

import { describe, it, expect } from 'vitest'
import {
  decideMemoryHeal,
  marginQualifies,
  buildDayIndex,
  MARGIN_FLOOR_METERS,
} from '../src/photoHeal.js'
import { implicitBaseIdForDay } from '../src/dayStopIds.js'

// A route trip whose stops are engineered for gate control. Kept far apart so a
// photo AT one stop clears the margin gate cleanly; the close-pair case that
// FAILS the margin gate lives in its own TRIP_CLOSE below.
//   s-A   (30.0, -90.0)     — the usual target
//   s-far (30.0, -89.98)    — ~1.9km east of A → large margin, distinct target
//   s-C   (31.0, -91.0)     — a distant "currently filed" stop
const TRIP = {
  id: 'g1',
  shape: 'route',
  days: [
    {
      n: 1,
      isoDate: '2026-07-01',
      stops: [
        { id: 's-A', time: '10:00 AM', lat: 30.0, lng: -90.0 },
        { id: 's-far', time: '2:00 PM', lat: 30.0, lng: -89.98 },
        { id: 's-C', time: '6:00 PM', lat: 31.0, lng: -91.0 },
      ],
    },
  ],
}
const DAY_INDEX = buildDayIndex(TRIP)
const RESOLVED = new Set(['s-A', 's-far', 's-C', implicitBaseIdForDay('2026-07-01')])

// A default context: everything resolves, no surprise, no cooldown, fresh agenda.
function ctx(over = {}) {
  return {
    dayIndex: DAY_INDEX,
    tripRev: 200,
    stopExists: (id) => RESOLVED.has(id),
    isSurpriseStop: () => false,
    inCooldown: () => false,
    now: 1_000_000,
    ...over,
  }
}

// A photo essentially AT s-A (matcher assigns s-A, runner-up s-far ~1.9km → margin OK).
const photoAtA = { id: 'ph', capturedAt: '2026-07-01T15:00:00.000Z', lat: 30.0, lng: -90.0 }
// A photo essentially AT s-far (for the split / unanimity case).
const photoAtFar = { id: 'ph2', capturedAt: '2026-07-01T15:05:00.000Z', lat: 30.0, lng: -89.98 }

// A separate trip with a CLOSE stop pair for the margin gate: s-A + s-B ~96m apart.
const TRIP_CLOSE = {
  id: 'g1c', shape: 'route',
  days: [{ n: 1, isoDate: '2026-07-01', stops: [
    { id: 's-A', time: '10:00 AM', lat: 30.0, lng: -90.0 },
    { id: 's-B', time: '11:00 AM', lat: 30.0, lng: -89.999 },
  ] }],
}
const CLOSE_INDEX = buildDayIndex(TRIP_CLOSE)
const CLOSE_RESOLVED = new Set(['s-A', 's-B', 's-C', implicitBaseIdForDay('2026-07-01')])
// Between A and B (assigns A at ~10m, runner-up B ~86m → margin < 100m floor → fails).
const photoNearAB = { id: 'ph', capturedAt: '2026-07-01T15:00:00.000Z', lat: 30.0, lng: -89.9999 }

function mem(over = {}) {
  return {
    id: 'm1',
    stopId: 's-C',
    stopProv: { source: 'auto', by: 'matcher' },
    tripRev: 100,
    masked: false,
    photos: [photoAtA],
    ...over,
  }
}

describe('marginQualifies (gate 3 math)', () => {
  it('single candidate (runnerUp null) always clears', () => {
    expect(marginQualifies(30, null)).toBe(true)
  })
  it('clears when the gap beats max(100m, 25%)', () => {
    expect(marginQualifies(10, 2000)).toBe(true) // gap 1990 ≥ 500
  })
  it('fails on the 100m floor (small absolute gap)', () => {
    expect(marginQualifies(0, 96)).toBe(false) // gap 96 < 100 floor
    expect(marginQualifies(0, MARGIN_FLOOR_METERS - 1)).toBe(false)
  })
  it('fails on the 25% fraction (large distances, thin relative gap)', () => {
    expect(marginQualifies(900, 1000)).toBe(false) // gap 100 ≥ floor but < 250 (25% of 1000)
  })
  it('non-finite winner never clears', () => {
    expect(marginQualifies(Infinity, 1000)).toBe(false)
  })
})

describe('decideMemoryHeal — the gate truth table', () => {
  it('MOVE: auto + gps+time + big margin + unanimous + fresh agenda + clean', () => {
    const d = decideMemoryHeal(mem(), ctx())
    expect(d.action).toBe('move')
    expect(d.toStopId).toBe('s-A')
    expect(d.fromStopId).toBe('s-C')
    expect(d.reason).toBe('agenda-change')
    expect(d.prov.source).toBe('auto')
    expect(d.prov.by).toBe('matcher')
  })

  it('gate 2 (manual lock): a hand-filed memory never moves AND never suggests', () => {
    const d = decideMemoryHeal(mem({ stopProv: { source: 'manual', by: 'helen' } }), ctx())
    expect(d.action).toBe('none')
    expect(d.reason).toBe('manual-lock')
  })

  it('gate 6 (masked): a masked memory surfaces nothing (no surprise leak)', () => {
    const d = decideMemoryHeal(mem({ masked: true }), ctx())
    expect(d.action).toBe('none')
    expect(d.reason).toBe('masked')
  })

  it('gate 6 (surprise target): target is an unrevealed surprise stop → silent', () => {
    const d = decideMemoryHeal(mem(), ctx({ isSurpriseStop: (id) => id === 's-A' }))
    expect(d.action).toBe('none')
    expect(d.reason).toBe('surprise-target')
  })

  it('gate 6 (cooldown): inside the direction-flip cooldown → silent', () => {
    const d = decideMemoryHeal(mem(), ctx({ inCooldown: () => true }))
    expect(d.action).toBe('none')
    expect(d.reason).toBe('cooldown')
  })

  it('gate 1 (time-only): a no-GPS stay photo downgrades to a suggestion', () => {
    // A stay trip so a no-GPS photo defaults to the day base (matchType 'time').
    const stay = {
      id: 'g2', shape: 'stay',
      lodging: { name: 'Cabin', lat: 45.0, lng: -93.0 },
      homeBase: { lat: 45.0, lng: -93.0, label: 'Cabin' },
      days: [{ n: 1, isoDate: '2026-07-01', stops: [{ id: 's-x', time: '1:00 PM', lat: 45.5, lng: -93.5 }] }],
    }
    const idx = buildDayIndex(stay)
    const baseId = implicitBaseIdForDay('2026-07-01')
    const resolved = new Set(['s-x', baseId])
    const d = decideMemoryHeal(
      { id: 'm', stopId: 's-x', stopProv: { source: 'auto', by: 'matcher' }, tripRev: 100, photos: [{ id: 'p', capturedAt: '2026-07-01T18:00:00.000Z' }] },
      { dayIndex: idx, tripRev: 200, stopExists: (id) => resolved.has(id), isSurpriseStop: () => false, inCooldown: () => false, now: 1 }
    )
    expect(d.action).toBe('suggest')
    expect(d.toStopId).toBe(baseId)
    expect(d.reason).toBe('weak-match')
  })

  it('gate 3 (margin): a photo between two near stops downgrades to a suggestion', () => {
    const closeCtx = ctx({ dayIndex: CLOSE_INDEX, stopExists: (id) => CLOSE_RESOLVED.has(id) })
    const d = decideMemoryHeal(mem({ photos: [photoNearAB] }), closeCtx)
    expect(d.action).toBe('suggest')
    expect(d.toStopId).toBe('s-A')
    expect(d.reason).toBe('ambiguous')
  })

  it('gate 4 (unanimity): two photos at different stops downgrade to a suggestion', () => {
    const d = decideMemoryHeal(mem({ photos: [photoAtA, photoAtFar] }), ctx())
    expect(d.action).toBe('suggest')
    expect(d.reason).toBe('split')
    expect(d.unanimous).toBe(false)
  })

  it('gate 5 (stale agenda): strict match but agenda not fresher → suggestion', () => {
    const d = decideMemoryHeal(mem({ tripRev: 200 }), ctx({ tripRev: 200 }))
    expect(d.action).toBe('suggest')
    expect(d.reason).toBe('stale-agenda')
  })

  it('legacy repair: null prov + currently UNFILED + strict → MOVE (orphan-repair)', () => {
    const d = decideMemoryHeal(mem({ stopId: null, stopProv: null, tripRev: null }), ctx())
    expect(d.action).toBe('move')
    expect(d.eligibility).toBe('unfiled')
    expect(d.reason).toBe('orphan-repair')
  })

  it('legacy repair: null prov + currently ORPHANED stop + strict → MOVE', () => {
    const d = decideMemoryHeal(mem({ stopId: 's-deleted', stopProv: null, tripRev: null }), ctx())
    expect(d.action).toBe('move')
    expect(d.eligibility).toBe('legacy-repair')
  })

  it('legacy filed-valid: null prov + currently filed to a REAL stop → SUGGEST only', () => {
    const d = decideMemoryHeal(mem({ stopId: 's-C', stopProv: null, tripRev: null }), ctx())
    expect(d.action).toBe('suggest')
    expect(d.eligibility).toBe('legacy-suggest')
  })

  it('already filed at the target → NONE (idempotent no-op)', () => {
    const d = decideMemoryHeal(mem({ stopId: 's-A' }), ctx())
    expect(d.action).toBe('none')
    expect(d.reason).toBe('already-filed')
  })

  // ── Regression tests for the adversarial review findings ──────────────────

  it('BLOCKER: gate 6 SOURCE surprise — a photo filed AT an unrevealed surprise stop never moves out (movedFrom would leak the secret)', () => {
    // Memory auto-filed at s-C; its GPS is at s-A; s-C is an unrevealed surprise.
    const d = decideMemoryHeal(mem({ stopId: 's-C' }), ctx({ isSurpriseStop: (id) => id === 's-C' }))
    expect(d.action).toBe('none')
    expect(d.reason).toBe('surprise-source')
  })

  it('MAJOR: manual lock FAILS CLOSED on a raw JSON-string stopProv (unparsed D1 TEXT)', () => {
    const asString = decideMemoryHeal(mem({ stopProv: '{"source":"manual","by":"helen"}' }), ctx())
    expect(asString.action).toBe('none')
    expect(asString.reason).toBe('manual-lock')
    // And an unparseable / non-object truthy prov also locks (never unlocks).
    expect(decideMemoryHeal(mem({ stopProv: 'not json' }), ctx()).reason).toBe('manual-lock')
    expect(decideMemoryHeal(mem({ stopProv: 12345 }), ctx()).reason).toBe('manual-lock')
  })

  it('MAJOR: missing safety callbacks FAIL CLOSED — no move when isSurpriseStop/inCooldown are absent', () => {
    const bareCtx = { dayIndex: DAY_INDEX, tripRev: 200, stopExists: (id) => RESOLVED.has(id), now: 1 }
    const d = decideMemoryHeal(mem(), bareCtx) // would MOVE with the callbacks present
    expect(d.action).toBe('none') // absent isSurpriseStop → assume surprise → suppressed
  })

  it('MAJOR: an unrevealed surprise MEMORY (hideFrom set, not masked bool) self-suppresses', () => {
    const hidden = decideMemoryHeal(mem({ masked: false, hideFrom: ['rafa'] }), ctx())
    expect(hidden.action).toBe('none')
    expect(hidden.reason).toBe('masked')
    // Once REVEALED it heals normally (public again).
    const revealed = decideMemoryHeal(mem({ masked: false, hideFrom: ['rafa'], revealed: true }), ctx())
    expect(revealed.action).toBe('move')
  })

  it('reason consistency: auto move off an ORPHANED stop labels BOTH the decision and the prov "orphan-repair"', () => {
    const d = decideMemoryHeal(mem({ stopId: 's-gone', stopProv: { source: 'auto', by: 'matcher' } }), ctx())
    expect(d.action).toBe('move')
    expect(d.reason).toBe('orphan-repair')
    expect(d.prov.reason).toBe('orphan-repair') // used to diverge to 'agenda-change'
  })

  it('gate 5 exemption: an ORPHANED auto memory repairs even at an EQUAL trip stamp', () => {
    // memRev == ctx.tripRev (no fresher agenda), but the current stop vanished →
    // repair must not wait for a stamp advance.
    const d = decideMemoryHeal(
      mem({ stopId: 's-gone', stopProv: { source: 'auto', by: 'matcher' }, tripRev: 200 }),
      ctx({ tripRev: 200 })
    )
    expect(d.action).toBe('move')
    expect(d.reason).toBe('orphan-repair')
  })

  it('gate 5 exemption: an explicit fresh-EVIDENCE trigger heals at an equal stamp (GPS backfill)', () => {
    const stale = decideMemoryHeal(mem({ tripRev: 200 }), ctx({ tripRev: 200 }))
    expect(stale.action).toBe('suggest') // no fresher agenda, no evidence flag → suggestion
    const fresh = decideMemoryHeal(mem({ tripRev: 200 }), ctx({ tripRev: 200, evidenceFresh: true }))
    expect(fresh.action).toBe('move') // fresh evidence at the same stamp → move
    // Per-memory evidenceFresh: only the named memory is freed.
    const scoped = decideMemoryHeal(mem({ tripRev: 200 }), ctx({ tripRev: 200, evidenceFresh: (id) => id === 'other' }))
    expect(scoped.action).toBe('suggest')
  })

  it('BLOCKER: real-shape auto memory (stamp in stopProv.tripRev, NO top-level tripRev) does NOT silently move on a non-fresher agenda', () => {
    // The shape rowToMemory actually produces: the agenda stamp lives INSIDE
    // stopProv, never a top-level memory.tripRev. Gate 5 must read it there, or a
    // filed auto memory silently re-moves on any re-run (the wrong-field bug).
    const realShape = () => ({ id: 'm1', stopId: 's-C', masked: false, photos: [photoAtA],
      stopProv: { source: 'auto', by: 'matcher', tripRev: 200 } }) // no top-level tripRev
    const stale = decideMemoryHeal(realShape(), ctx({ tripRev: 200 }))
    expect(stale.action).toBe('suggest')
    expect(stale.reason).toBe('stale-agenda')
    // A genuinely fresher agenda DOES let it move.
    expect(decideMemoryHeal(realShape(), ctx({ tripRev: 201 })).action).toBe('move')
    // An OLDER stamp certainly must not move it either.
    expect(decideMemoryHeal(realShape(), ctx({ tripRev: 199 })).action).toBe('suggest')
  })
})
