// learn/index.js — the ONE fold that composes the three upper-altitude LEARNING-SPINE
// modules (DESIGN_THE_HEALING_MODEL.md §16c) into a single learned-structure object,
// mirroring lattice/index.js's composer exactly.
//
// §16c specifies SIX altitudes of lesson extraction per digested decision. Altitudes 1
// (instance/filing) and 2 (exemplar/vision corpus) are the machine itself, already built.
// The three UPPER altitudes are the tuner-organs this module composes:
//   • 3 ATTENTION — error-driven, surprise-weighted per-witness credit vs the machine's
//     lean (Rescorla-Wagner/ALCOVE); folds altitude-4 CONTEXT (partial pooling). An
//     INSTRUMENT (§15b): it emits a per-witness reliability read + a report for Jonathan's
//     holistic judgment; it re-weights nothing.
//   • 5 SCHEMA — kind-shaped gestalt induction: an ANSWER becomes a durable, whisper-
//     strength, lattice-shaped HYPOTHESIS (christenings POSTABLE to places, structure to
//     rhythms, calibrations to devices) — never auto-posted.
//   • 6 CLASS TRUST → RETIREMENT — per-class×context confirm rates (consumed from the
//     lattice's META branch, re-derived) + the graded/moving/reversible retirement signal
//     the projection may consult (with a whisper, so retirement is never concealment).
//
// This composer, like the lattice's, DECIDES NOTHING and writes nothing — it routes the
// ledgers + opts to the three altitude folds and collects their native results. Every
// spine invariant is a property of the folds it calls, preserved here by adding no state:
//
//   • PURE REPLAY (§16c keystone): each altitude is recomputed from the ledgers; there is
//     zero stored state. This composer holds none either.
//   • DETERMINISTIC: the clock is NEVER read here. `now` comes from opts and is threaded,
//     unchanged, to every altitude (each needs it for decay). No Date.now, no Math.random —
//     the whole spine is a pure function of its inputs + opts. Two runs over the same
//     ledgers with the same `now` are byte-identical.
//   • HETEROGENEOUS SEEDS (§13): every altitude owns its OWN seed constants (ATTENTION_/
//     SCHEMA_/CLASS_TRUST_DEFAULTS); NONE is shared. So the shared `opts` forwards only the
//     global clock (`now`); per-altitude tuning rides an optional per-altitude sub-object
//     (`opts.attention`, `opts.schema`, `opts.classTrust`) — one altitude is never
//     re-seeded by another's override. (classTrust's own `opts.meta` sub-forward for the
//     META branch it rests on rides inside `opts.classTrust`, untouched.)
//   • WORKER-AUTHORITATIVE (A3): the spine folds the answer ledger, so it is derived on the
//     worker; the client uses FIXTURE spines only (parity tests). This module is mirrored
//     byte-identical into worker/src/learn/ like the lattice + the O1 engine libs.
//   • DERIVED-TIER / INERT (§15b): the composer wires NOTHING into the live settle or
//     projection. It changes no measured constant; SETTLE_DEFAULTS is untouched. Consuming
//     the spine (which reliability nudges which judgment, which retirement auto-applies) is
//     the Integrate phase + Jonathan's activation gate — this module only returns facts.
//
// SIGNATURE — the ledgers a MATURE spine folds, honest about what the CURRENT three
// altitudes read (the same precedent meta.js/classTrust.js set with trips/memories:
// "accepted for the uniform fold signature; this reads NEITHER directly"):
//   • `feedback` — the §W3 answer ledger. Consumed by ALL THREE altitudes; it also carries
//     the ask-time challenger lean (`lean.hm`) each row was answered against, which is the
//     machine's decision-of-record for that moment — so ATTENTION reads its lean from here.
//   • `decisions` — the digested-decision ledger. Accepted for the uniform spine-fold
//     signature + forward-compat; the three BUILT altitudes do not read a separate decision
//     ledger (attention reads the lean embedded per feedback row, above), so it is carried,
//     not folded, until an altitude consumes it. NOT invented into a fold it isn't in.
//   • `lattice` — the already-built world-model fact lattice (buildLattice output). SCHEMA's
//     hypotheses are POSTABLE into its branches and CLASS TRUST rests on its META branch —
//     but classTrust RE-DERIVES meta from `feedback` itself (never trusting a possibly-stale
//     injected meta), and posting is the Integrate phase. So the lattice is carried for the
//     spine's shape + that later wiring; given a lattice built from the SAME feedback + now,
//     `lattice.meta` equals the meta classTrust re-derives (meta is a pure feedback fold),
//     so the spine is internally consistent with the lattice it is handed. Read by no fold
//     here — carried, not folded.

import { foldAttention } from './attention.js'
import { schemaFacts } from './schema.js'
import { classTrust } from './classTrust.js'

// The three composed altitude names, in the fixed order the spine object exposes them.
export const SPINE_ALTITUDES = ['attention', 'schema', 'classTrust']

// buildLearningSpine(decisions, feedback, lattice, opts) => { attention, schema, classTrust }
//   decisions/feedback/lattice: the ledgers + world model described in the header. `feedback`
//                    is the only one the three built altitudes fold; `decisions` and `lattice`
//                    are carried for the uniform spine-fold signature + the Integrate phase.
//   opts:  { now?, attention?, schema?, classTrust? }
//     - `now`: the deterministic clock (ms). REQUIRED for decay; threaded to every altitude.
//              Never read from the real clock here (§16c pure-replay determinism); absent ⇒
//              each altitude's own neutral decay (recencyDecay 1), never a silent zero.
//     - a per-altitude sub-object (e.g. opts.classTrust) supplies THAT altitude's seed
//       overrides only — heterogeneity: no altitude is ever re-seeded by a sibling's knob.
//   Returns each altitude's NATIVE result:
//     - attention: foldAttention's { facts, report } — the per-witness reliability facts AND
//       the instrument report (the failure-to-learn tax, the witness summary). The whole
//       instrument is returned, losing neither the reads nor the report.
//     - schema:    schemaFacts's hypotheses[] — lattice-shaped, POSTABLE (never auto-posted).
//     - classTrust: classTrust's retirements[] — the per-class×context retirement signal
//       (retired?/applyStrength/margin) + whisper, resting on META's re-derived rates.
export function buildLearningSpine(decisions, feedback, lattice, opts = {}) {
  const now = Number.isFinite(opts.now) ? opts.now : null // deterministic: no Date.now fallback

  // Per-altitude opts = the shared clock + that altitude's own optional sub-overrides. An
  // altitude's DEFAULTS fill everything else; nothing global (other than `now`) blankets
  // across altitudes, so each stays seeded like ITSELF (§13 heterogeneity).
  const altitudeOpts = (name) => {
    const raw = opts[name] && typeof opts[name] === 'object' ? opts[name] : {}
    // the fold's single threaded clock WINS — a per-altitude sub carries seed overrides only,
    // NEVER its own `now` (determinism contract). Strip sub.now entirely so it can't shadow the
    // global even in the null branch (the verify caught the now==null leak; mirrors the same fix
    // now applied to lattice/index.js branchOpts).
    const { now: _subNow, ...sub } = raw
    return now != null ? { ...sub, now } : { ...sub }
  }

  return {
    // ATTENTION reads its per-witness lean from the feedback rows' ask-time `lean.hm`.
    attention: foldAttention(feedback, altitudeOpts('attention')),
    // SCHEMA folds the answer ledger into POSTABLE hypotheses.
    schema: schemaFacts(feedback, altitudeOpts('schema')),
    // CLASS TRUST re-derives META from feedback (trips/memories read by neither → []), then
    // adds the retirement geometry. `opts.classTrust.meta` (if any) forwards to metaFacts.
    classTrust: classTrust([], [], feedback, altitudeOpts('classTrust')),
  }
}

export default buildLearningSpine
