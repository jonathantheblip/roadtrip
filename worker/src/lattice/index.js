// lattice/index.js — the ONE fold that composes the six world-model FACT-LATTICE
// branches (DESIGN_THE_HEALING_MODEL.md §16d) into a single family fact object.
//
// §16d specifies the world model as a fact LATTICE, not a place list: six branches
// (PEOPLE / PLACES / RHYTHMS / DEVICES / LEXICON / META), every one derived by the SAME
// pure-replay fold over the ledgers the app already keeps (trips + memories + the answer
// ledger). This module runs all six and returns them under one roof, so the Integrate
// phase (evidenceBench.js's opts.lattice seam) can compose each branch into its witness
// from a single call.
//
//   • PURE REPLAY (§16c keystone): each branch is recomputed from the ledgers; there is
//     zero stored state. This composer holds none either — it only routes the three
//     ledgers + opts to the six folds and collects their results.
//   • DETERMINISTIC: the clock is NEVER read here. `now` comes from opts and is threaded,
//     unchanged, to every branch (each branch needs it for decay). No Date.now, no
//     Math.random — the whole lattice is a pure function of (trips, memories, feedback,
//     opts). Two runs over the same ledgers with the same `now` are byte-identical.
//   • HETEROGENEOUS SEEDS (§13/§16d): every branch owns its OWN seed constants; NONE is
//     shared. So the shared `opts` forwards only the global clock (`now`); per-branch
//     tuning rides an optional per-branch sub-object (`opts.people`, `opts.places`, …) —
//     one branch is never re-seeded by another branch's override.
//   • WORKER-AUTHORITATIVE (A3): the lattice fold needs the answer ledgers, so it is
//     derived on the worker; the client uses FIXTURE lattices only (parity tests). This
//     module is mirrored byte-identical into worker/src/lattice/ like the O1 engine libs.
//
// This composer DECIDES NOTHING and writes nothing — it returns facts. Composition into
// the bench (which branch nudges which witness, at what clamped seed weight) lives behind
// evidenceBench.js's `opts.lattice` seam and is INERT until a lattice is explicitly
// supplied (the live heal path passes none). No schema, no migration — a local artifact.

import buildPeopleFacts from './people.js'
import buildPlacesFacts from './places.js'
import { foldRhythms } from './rhythms.js'
import buildDeviceFacts from './devices.js'
import { buildLexicon } from './lexicon.js'
import metaFacts from './meta.js'

// The six branch names, in the fixed order the lattice object exposes them.
export const LATTICE_BRANCHES = ['people', 'places', 'rhythms', 'devices', 'lexicon', 'meta']

// buildLattice(trips, memories, feedback, opts) => { people, places, rhythms, devices,
//                                                    lexicon, meta }
//   trips/memories/feedback: the SAME three ledgers every branch folds (each branch reads
//                            defensively the subset it needs; some ignore one or two).
//   opts:  { now?, people?, places?, rhythms?, devices?, lexicon?, meta? }
//     - `now`: the deterministic clock (ms). REQUIRED for decay; threaded to every branch.
//              Never read from the real clock here (§16c pure-replay determinism).
//     - a per-branch sub-object (e.g. opts.places) supplies THAT branch's seed overrides
//       only — heterogeneity: no branch is ever re-seeded by a sibling's knob (§13).
//   Returns each branch's native result: five fact arrays plus lexicon's { facts, byStop }
//   (byStop powers aliasesForStop for the Integrate phase). META is included in the
//   lattice (§16d) but is a hypothesis-class TRUST ledger for O7's auto-apply bar — it is
//   deliberately NOT wired to a bench placement/affinity witness (it grades question
//   CLASSES, not photos).
export function buildLattice(trips, memories, feedback, opts = {}) {
  const now = Number.isFinite(opts.now) ? opts.now : null // deterministic: no Date.now fallback

  // Per-branch opts = the shared clock + that branch's own optional sub-overrides. A
  // branch's DEFAULTS fill everything else; nothing global (other than `now`) blankets
  // across branches, so each stays seeded like ITSELF (§16d heterogeneity).
  const branchOpts = (name) => {
    const sub = opts[name] && typeof opts[name] === 'object' ? opts[name] : {}
    // the fold's single threaded clock WINS — a per-branch sub carries seed overrides only, never
    // its own `now` (determinism contract §16d): spread sub FIRST so a stray sub.now can't shadow it.
    return now != null ? { ...sub, now } : { ...sub }
  }

  return {
    people: buildPeopleFacts(trips, memories, feedback, branchOpts('people')),
    places: buildPlacesFacts(trips, memories, feedback, branchOpts('places')),
    rhythms: foldRhythms(trips, memories, feedback, branchOpts('rhythms')),
    devices: buildDeviceFacts(trips, memories, feedback, branchOpts('devices')),
    lexicon: buildLexicon(trips, memories, feedback, branchOpts('lexicon')),
    meta: metaFacts(trips, memories, feedback, branchOpts('meta')),
  }
}

export default buildLattice
