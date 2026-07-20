// PARITY: the LEARNING SPINE (§16c) — the three upper-altitude tuner folds
// (attention / schema / classTrust) + the one composer (learn/index.js) — are
// byte-identical mirrors: worker/src/learn/*.js ≡ app/src/lib/learn/*.js, exactly like
// the world-model lattice (lattice-parity.test.js) and the O1 engine libs. The spine fold
// is WORKER-AUTHORITATIVE (A3: it folds the answer ledger); the client uses FIXTURE spines
// only. This test runs ONE shared corpus through buildLearningSpine via BOTH copies and
// asserts the whole spine is deep-equal — so a future edit to one copy that isn't mirrored
// fails here, exactly like the established lattice + HM-engine parity gates.
//
// It also asserts NON-TRIVIAL output (every altitude learned something), so parity can
// never pass vacuously on empty output; and pins the composer's INERT contract for the two
// carried-not-folded inputs (`decisions`, `lattice`): passing rich ones must equal passing
// null (neither is read by the three built altitudes) — a guard against a future edit that
// silently starts folding them without updating the contract.

import { describe, it, expect } from 'vitest'

import { buildLearningSpine as wBuildSpine, SPINE_ALTITUDES as wAlts } from '../src/learn/index.js'
import { buildLattice as wBuildLattice } from '../src/lattice/index.js'

import { buildLearningSpine as cBuildSpine, SPINE_ALTITUDES as cAlts } from '../../app/src/lib/learn/index.js'

const at = (h, m = 0) => Date.UTC(2026, 6, 4, h, m)
const NOW = Date.UTC(2026, 6, 10)

// A CONFIRM row whose challenger top IS the served (and confirmed) guess — a backer of
// that top is credited RIGHT (attention). Class-tagged (meta / classTrust).
const confirm = (id, place, wit, kind = 'A', trip = 't1') => ({
  id, trip_id: trip, action: 'confirmed', kind, at: at(21), guessed_place_id: place,
  lean: { engine: 'hm', guessed: { id: place }, hm: { top: place, m: 0.6, wit } },
})
// A CORRECTION to a REAL stop `to` whose challenger top WAS `to` — the challenger won
// where v1 lost, so its backer is credited RIGHT (attention divergence datum).
const correctToStop = (id, to, wit, kind = 'A', trip = 't1') => ({
  id, trip_id: trip, action: 'corrected', kind, at: at(21), corrected_place_id: to,
  lean: { engine: 'hm', guessed: { id: 's1' }, hm: { top: to, m: 0.6, wit } },
})
// A CHRISTENING correction — a name off every list (non-filable id) → schema PLACES.
const christen = (id, name, kind = 'B', trip = 't1') => ({
  id, trip_id: trip, action: 'corrected', kind, at: at(21),
  corrected_place_name: name, corrected_place_id: null,
})

// A corpus shaped to make EVERY altitude learn:
//  • ATTENTION: `gps` backs borne-out confirms; `lookalike` backs a correction whose top
//    was the corrected stop (challenger win).
//  • SCHEMA: a kind-B christening (PLACES), a kind-D grouping (RHYTHMS split), a kind-C
//    when-correction whose leaned channel is `time` (DEVICES calibration).
//  • CLASS TRUST: class-tagged A/B/C/D confirms+corrections across two trips → per-class
//    family + per-trip retirement facts, with a fresh correction moving a bar.
const FEEDBACK = [
  confirm(1, 's1', { gps: { n: 1, g: 0.9, t: 'o' } }, 'A', 't1'),
  confirm(2, 's1', { gps: { n: 1, g: 0.9, t: 'o' } }, 'A', 't1'),
  confirm(3, 's1', { gps: { n: 1, g: 0.9, t: 'o' } }, 'A', 't2'),
  correctToStop(4, 's2', { lookalike: { n: 1, g: 0.8, t: 'd' } }, 'A', 't1'),
  christen(5, "Nonna's kitchen", 'B', 't1'),
  { id: 6, trip_id: 't1', action: 'corrected', kind: 'D', at: at(21) }, // grouping → rhythm split
  { id: 7, trip_id: 't1', action: 'corrected', kind: 'C', at: at(21), // when → devices calibration on `time`
    lean: { engine: 'hm', hm: { top: 'sX', m: 0.7, wit: { time: { n: 2, g: 0.8, t: 'o' }, sequence: { n: 2, g: 0.3, t: 'd' } } } } },
  { id: 8, trip_id: 't1', action: 'aside', kind: 'A', at: at(21) }, // absence: counted, induces nothing
]

// The carried-not-folded inputs, given real (non-null) values to prove they are tolerated
// identically across mirrors AND are inert (below).
const DECISIONS = [{ id: 'd1', trip_id: 't1', moment: 'x' }]
const LATTICE = wBuildLattice([], [], FEEDBACK, { now: NOW })

const wSpine = wBuildSpine(DECISIONS, FEEDBACK, LATTICE, { now: NOW })
const cSpine = cBuildSpine(DECISIONS, FEEDBACK, LATTICE, { now: NOW })

describe('learning-spine worker↔client parity (byte-identical mirrors, behaviour-identical)', () => {
  it('the altitude roster is identical', () => {
    expect(cAlts).toEqual(wAlts)
    expect(wAlts).toEqual(['attention', 'schema', 'classTrust'])
  })

  it('buildLearningSpine output is identical and non-empty in every altitude', () => {
    expect(cSpine).toEqual(wSpine)
    // ATTENTION returns the whole instrument: per-witness reliability facts + the report.
    expect(Array.isArray(wSpine.attention.facts)).toBe(true)
    expect(wSpine.attention.facts.length).toBeGreaterThan(0)
    expect(typeof wSpine.attention.report).toBe('object')
    expect(wSpine.attention.report.moments).toBeGreaterThan(0)
    // SCHEMA induced at least the christening + split + calibration hypotheses.
    expect(wSpine.schema.length).toBeGreaterThanOrEqual(3)
    expect(wSpine.schema.map((h) => h.subject)).toEqual(
      expect.arrayContaining(['place:christened:nonna\'s kitchen', 'rhythm:split', 'pattern:calibration:time']),
    )
    // CLASS TRUST produced per-class×context retirement facts.
    expect(wSpine.classTrust.length).toBeGreaterThan(0)
    expect(wSpine.classTrust.every((r) => r.subject.fact === 'class-trust-retirement')).toBe(true)
  })

  it('CARRIED-NOT-FOLDED contract: decisions & lattice are inert — rich vs null give identical output (both mirrors)', () => {
    const wNull = wBuildSpine(null, FEEDBACK, null, { now: NOW })
    const cNull = cBuildSpine(null, FEEDBACK, null, { now: NOW })
    expect(cNull).toEqual(wNull)
    // the two carried inputs change nothing the three built altitudes read
    expect(wNull).toEqual(wSpine)
  })

  it('DETERMINISTIC pure replay: same corpus + now → byte-identical repeats (both mirrors)', () => {
    expect(wBuildSpine(DECISIONS, FEEDBACK, LATTICE, { now: NOW })).toEqual(wSpine)
    expect(cBuildSpine(DECISIONS, FEEDBACK, LATTICE, { now: NOW })).toEqual(cSpine)
  })

  it('the empty ledger folds to zero in every altitude (both mirrors), and the spine is internally meta-consistent with the lattice', () => {
    const wEmpty = wBuildSpine([], [], null, { now: NOW })
    const cEmpty = cBuildSpine([], [], null, { now: NOW })
    expect(cEmpty).toEqual(wEmpty)
    expect(wEmpty.attention.facts).toEqual([])
    expect(wEmpty.schema).toEqual([])
    expect(wEmpty.classTrust).toEqual([])

    // classTrust re-derives META from feedback; its `trust` must equal the lattice's META
    // confirm rate built from the SAME feedback + now (meta is a pure feedback fold).
    const famA = LATTICE.meta.find((f) => f.subject.key === 'class-trust:A:family')
    const ctA = wSpine.classTrust.find((r) => r.subject.key === 'class-trust-retirement:A:family')
    expect(ctA.trust).toBe(famA.value)
  })
})
