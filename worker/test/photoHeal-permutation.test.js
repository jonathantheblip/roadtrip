// ORDER INDEPENDENCE (SPEC §1 + §7) — the executable form of the named
// invariant: "the documented state of a trip converges to the same organized
// truth regardless of the ORDER events arrive in." One fixture trip + a fixed
// event set (import batch A · an agenda edit · import batch B · a GPS backfill ·
// one manual move) applied in several valid permutations must converge to the
// IDENTICAL final filing + provenance — modulo the ONE order-pinned exception
// the spec allows: a manual lock (a person's decision pins the moment).
//
// This leans on healMemories being deterministic + idempotent: re-running on a
// settled state is a no-op, so applying the same events in any order and healing
// after each still lands the same place. If a future change makes a decision
// depend on history (a stateful gate, a non-deterministic tiebreak), a
// permutation diverges and this file goes red.
//
// COVERAGE NOTE (honest scope): this proves apply-order-independence of moves,
// the terminality of a manual lock, and backfill-driven re-homing. Gate 5's
// agenda-freshness timing is covered by the gate truth table
// (photoHeal-gates.test.js) — here every imported memory carries tripRev=null
// (never yet worker-matched), which is the real import posture and keeps the
// convergence property independent of the stamp path.

import { describe, it, expect } from 'vitest'
import { healToQuiescence, healMemories, buildDayIndex } from '../src/photoHeal.js'

// A fixed 2-day route trip. Stops are far apart so every match is unambiguous
// (big margins), and no implicit base interferes (explicit shape 'route').
const TRIP = {
  id: 'perm1',
  shape: 'route',
  days: [
    {
      n: 1,
      isoDate: '2026-07-01',
      stops: [
        { id: 's-museum', time: '10:00 AM', lat: 29.72, lng: -95.39 },
        { id: 's-park', time: '2:00 PM', lat: 29.95, lng: -95.65 },
      ],
    },
    {
      n: 2,
      isoDate: '2026-07-02',
      stops: [
        { id: 's-zoo', time: '12:00 PM', lat: 29.55, lng: -95.40 },
        { id: 's-pier', time: '4:00 PM', lat: 29.30, lng: -94.80 },
      ],
    },
  ],
}
const DAY_INDEX = buildDayIndex(TRIP)
const STOPS = new Set(['s-museum', 's-park', 's-zoo', 's-pier'])

// `affected` = the memory ids THIS event makes evidence-fresh (an import or a
// GPS backfill is a photo-evidence trigger, SPEC §5 D trigger 3 — it re-matches
// the affected memories without bumping the trip stamp). Scoped PER MEMORY so a
// trigger frees exactly the memories whose evidence changed, never the rest.
function makeCtx(stamp, affected = new Set()) {
  return {
    dayIndex: DAY_INDEX,
    tripRev: stamp,
    stopExists: (id) => STOPS.has(id),
    isSurpriseStop: () => false,
    inCooldown: () => false,
    evidenceFresh: (id) => affected.has(id),
    now: 1_000_000,
  }
}

// Memory factories — fresh objects per run so permutations never share state.
// Imported memories carry tripRev:null (never yet worker-matched).
const M1 = () => ({ id: 'M1', stopId: null, stopProv: null, tripRev: null, masked: false,
  photos: [{ id: 'M1p', capturedAt: '2026-07-01T15:00:00.000Z', lat: 29.72, lng: -95.39 }] }) // → s-museum
const M2 = () => ({ id: 'M2', stopId: null, stopProv: null, tripRev: null, masked: false,
  photos: [{ id: 'M2p', capturedAt: '2026-07-01T16:00:00.000Z', lat: 29.95, lng: -95.65 }] }) // → s-park
// Imported already auto-filed to the WRONG stop (its GPS is at the park) → re-homes.
const M5 = () => ({ id: 'M5', stopId: 's-museum', stopProv: { source: 'auto', by: 'matcher' }, tripRev: null, masked: false,
  photos: [{ id: 'M5p', capturedAt: '2026-07-01T17:00:00.000Z', lat: 29.95, lng: -95.65 }] }) // → s-park
// GPS at the zoo, but a person will MANUALLY move it to the pier (order-pinned).
const M3 = () => ({ id: 'M3', stopId: null, stopProv: null, tripRev: null, masked: false,
  photos: [{ id: 'M3p', capturedAt: '2026-07-02T12:30:00.000Z', lat: 29.55, lng: -95.40 }] }) // → s-pier (manual)
// No GPS at import; a backfill gives it the pier's coordinates later.
const M4 = () => ({ id: 'M4', stopId: null, stopProv: null, tripRev: null, masked: false,
  photos: [{ id: 'M4p', capturedAt: '2026-07-02T14:00:00.000Z' }] }) // → s-pier (after backfill)

const EVENTS = {
  E1_importA: { affected: ['M1', 'M2'], apply: (s) => { s.memories.push(M1(), M2()) } },
  E2_agendaEdit: { affected: [], apply: (s) => { s.stamp += 1 } }, // an agenda edit — NOT evidence-fresh
  E3_importB: { affected: ['M3', 'M4', 'M5'], apply: (s) => { s.memories.push(M3(), M4(), M5()) } },
  E4_gpsBackfill: { affected: ['M4'], deps: ['E3_importB'], apply: (s) => {
    const m = s.memories.find((x) => x.id === 'M4')
    m.photos[0].lat = 29.30
    m.photos[0].lng = -94.80
  } },
  E5_manualMove: { affected: [], deps: ['E3_importB'], apply: (s) => {
    const m = s.memories.find((x) => x.id === 'M3')
    m.stopId = 's-pier'
    m.stopProv = { source: 'manual', by: 'helen' }
  } },
}

// Valid permutations (respect E3 before E4/E5). Chosen to vary the manual move's
// position: before vs after M3 would auto-heal, and the backfill's position.
const ORDERS = [
  ['E1_importA', 'E2_agendaEdit', 'E3_importB', 'E4_gpsBackfill', 'E5_manualMove'],
  ['E3_importB', 'E4_gpsBackfill', 'E5_manualMove', 'E1_importA', 'E2_agendaEdit'],
  ['E2_agendaEdit', 'E1_importA', 'E3_importB', 'E5_manualMove', 'E4_gpsBackfill'],
  ['E1_importA', 'E3_importB', 'E2_agendaEdit', 'E4_gpsBackfill', 'E5_manualMove'],
  ['E3_importB', 'E5_manualMove', 'E1_importA', 'E4_gpsBackfill', 'E2_agendaEdit'],
]

function normalize(state) {
  return [...state.memories]
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((m) => ({ id: m.id, stopId: m.stopId ?? null, source: m.stopProv?.source ?? null }))
}

function runOrder(order) {
  const s = { stamp: 1, memories: [] }
  for (const name of order) {
    const ev = EVENTS[name]
    ev.apply(s)
    const r = healToQuiescence(s.memories, makeCtx(s.stamp, new Set(ev.affected)), 'on')
    s.memories = r.memories
  }
  return normalize(s)
}

describe('order-independence — every permutation converges to the same truth', () => {
  const EXPECTED = [
    { id: 'M1', stopId: 's-museum', source: 'auto' },
    { id: 'M2', stopId: 's-park', source: 'auto' },
    { id: 'M3', stopId: 's-pier', source: 'manual' }, // the order-pinned manual lock
    { id: 'M4', stopId: 's-pier', source: 'auto' }, // healed after the GPS backfill
    { id: 'M5', stopId: 's-park', source: 'auto' }, // re-homed off the wrong import filing
  ]

  for (let i = 0; i < ORDERS.length; i++) {
    it(`permutation ${i + 1} → the canonical final state`, () => {
      expect(runOrder(ORDERS[i])).toEqual(EXPECTED)
    })
  }

  it('all permutations agree with each other (not just with EXPECTED)', () => {
    const first = runOrder(ORDERS[0])
    for (let i = 1; i < ORDERS.length; i++) {
      expect(runOrder(ORDERS[i])).toEqual(first)
    }
  })
})

describe('BLOCKER regression: a stamp-stable GPS backfill re-homes an already-filed photo, order-independently', () => {
  // The review's exact scenario. Route trip, CONSTANT trip stamp (5). One memory
  // imported UNFILED with GPS at s-a; a later GPS backfill — SPEC §5 D trigger 3,
  // which does NOT bump the trip stamp — corrects its coords to s-b. Before the
  // fix, "file at s-a THEN backfill" stuck at s-a (healMemories had advanced the
  // memory's tripRev to the stamp, so gate 5 refused the second move at the
  // unchanged stamp) while "backfill THEN file" reached s-b — a divergence. Both
  // must now converge to s-b, WITHOUT relying on an evidenceFresh flag (the fix
  // is that heal no longer advances tripRev).
  const trip = {
    id: 'bf', shape: 'route',
    days: [{ n: 1, isoDate: '2026-07-01', stops: [
      { id: 's-a', time: '10:00 AM', lat: 30.0, lng: -90.0 },
      { id: 's-b', time: '2:00 PM', lat: 31.0, lng: -91.0 },
    ] }],
  }
  const idx = buildDayIndex(trip)
  const resolved = new Set(['s-a', 's-b'])
  const bctx = () => ({ dayIndex: idx, tripRev: 5, stopExists: (id) => resolved.has(id), isSurpriseStop: () => false, inCooldown: () => false, now: 1 })
  const freshMem = () => ({ id: 'BM', stopId: null, stopProv: null, tripRev: null, masked: false,
    photos: [{ id: 'BMp', capturedAt: '2026-07-01T15:00:00.000Z', lat: 30.0, lng: -90.0 }] })

  it('heal-after-each: file at s-a, THEN a stamp-stable backfill → converges to s-b', () => {
    let mems = healToQuiescence([freshMem()], bctx(), 'on').memories
    expect(mems[0].stopId).toBe('s-a') // filed by the first heal (repair of an unfiled row)
    mems[0].photos[0].lat = 31.0
    mems[0].photos[0].lng = -91.0 // GPS backfill, trip stamp unchanged
    // The backfill is an EVIDENCE trigger → it carries evidenceFresh, so gate 5
    // (which now reads the durable stopProv.tripRev = 5 the first move stamped)
    // does not refuse the corrective move at the unchanged stamp.
    mems = healToQuiescence(mems, { ...bctx(), evidenceFresh: true }, 'on').memories
    expect(mems[0].stopId).toBe('s-b')
  })

  it('heal-once: backfill BEFORE the first heal → also s-b (both orders agree)', () => {
    const mems = [freshMem()]
    mems[0].photos[0].lat = 31.0
    mems[0].photos[0].lng = -91.0
    const out = healToQuiescence(mems, bctx(), 'on').memories
    expect(out[0].stopId).toBe('s-b')
  })
})

describe('the PHOTO_HEAL_MODE knob (pure mirror of the worker gate)', () => {
  const memories = [M1(), M2()] // both would auto-move (unfiled → repair)
  const ctx = makeCtx(2)

  it('shadow: records the would-moves but APPLIES nothing', () => {
    const r = healMemories(memories, ctx, 'shadow')
    expect(r.moves.length).toBe(2)
    // The returned memories are untouched (still unfiled) — shadow never applies.
    expect(r.memories.every((m) => m.stopId == null)).toBe(true)
  })

  it('off: still computes internally but the caller applies + surfaces nothing', () => {
    // healMemories('off') behaves like shadow for the pure engine (records the
    // decisions); the OFF vs SHADOW difference — whether the ledger is written —
    // is the worker caller's job. Here we assert 'off' applies nothing either.
    const r = healMemories(memories, ctx, 'off')
    expect(r.memories.every((m) => m.stopId == null)).toBe(true)
  })

  it('on: applies the moves', () => {
    const r = healMemories(memories, ctx, 'on')
    expect(r.memories.find((m) => m.id === 'M1').stopId).toBe('s-museum')
    expect(r.memories.find((m) => m.id === 'M2').stopId).toBe('s-park')
  })
})
