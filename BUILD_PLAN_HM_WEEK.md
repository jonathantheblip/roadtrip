# BUILD_PLAN_HM_WEEK — dividing the Healing-Model workload (Fable today / Opus this week)

> Read WORKING_AGREEMENT.md first; this plan is a pointer, not truth. Status 2026-07-19.
> Context: the whole HM arc (HM-1..6) is BUILT, measured on real trips, all LOCAL and
> uncommitted; knobs OFF. The Glance design round is returning with Jonathan's additions.
> Split criterion: **Fable = judgment density** (cheap to state, expensive to get wrong —
> semantics, calibration, architecture forks, family-visible experience). **Opus =
> execution verifiable by construction** (parity tests, lesson-asserting tests, specs
> pinned today). Importance alone does NOT make a task Fable-class.

## TODAY — Fable-class (with Jonathan; each produces a pinned spec Opus builds against)

F1. **Process the returning Glance design round + Jonathan's brief additions.** Fold the
    outputs into settled experience decisions: the ripple treatment, stack-vs-drip, the
    show mode's firm-core/soft-edges, copy system across the palette kinds. (My worst
    drift territory — family-visible, altitude-sensitive; his additions may reshape it.)
    → produces: the settled Glance spec for O5.
F2. **"Somewhere else" + christening semantics (closed-world escape).** What the answer
    CREATES (a discovered place? a filed entity?), where photos file, what it teaches,
    how it interacts with the D13 lock and provenance. Truth-critical write semantics.
    → produces: the entity-creation spec for O4.
F3. **Calibration-question semantics.** One answer re-weights a channel corpus-wide —
    the most powerful write in the system. Define: what may be asked, what the answer is
    allowed to change, bounds (a calibration answer must re-grade, never silence a
    channel — §13), reversibility.
    → produces: the calibration spec for O4.
F4. **Engine-integration architecture.** How the new machine coexists with sessionScorer
    in the shadow ledger (replace / run beside / A-B in shadow). One decision, made once
    (the two-pass online-vs-batch posture rides on it).
    → produces: the integration spec for O2.
F5. **Ablation-driven re-weighting. ✅ DONE 2026-07-19.** Fitted by grid ×
    declared criterion (recovery − 0.75·ask − 1.0·misfile — Jonathan's asymmetry: asks
    taxed as failure-to-learn, misfiles penalized but not crushingly) on the honest
    harness; least-demotion plateau point chosen (§13): `weights: { placeType: 0.6,
    worldModel: 0.2 }` in SETTLE_DEFAULTS (worldModel at the 0.2 floor — lowered,
    never silenced). **THE F5 BASELINE (Opus must not regress): recovery 71% ·
    ask-rate 20% · silent-misfile 2.6%** (whole trips held out, filing masked; fit
    tool: app/scripts/healFit.mjs; suite 1332/1332). Both §13 guards verified: misfile
    did not rise, recovery did not fall, no channel below the 0.2 floor.
F6. **Commit narrative for the gate.** Slice the HM arc into reviewable commits
    (bench / settle / world / impute / vision / loop / harnesses / docs), Jonathan
    approves what lands and when. Nothing pushes without him.

## THIS WEEK — Opus-class (specs from today; the pinned docs are the guardrails)

O1. **Worker mirrors + parity tests** for evidenceBench, settlingEngine, worldModel,
    imputation, visionPlacement, healLoop (the established byte-identical pattern;
    parity gates make drift impossible).
O2. **Wire the engine into the shadow ledger** per F4 (memory_heal_decisions posture,
    read-only for the family; PHOTO knobs untouched).
O3. **Fitting harness**: ex-Gaussian / two-component gap fits + Q-Q readouts against the
    real corpus; kernel scales become fitted (report, don't self-apply — §13 re-grading
    cites measurements).
O4. **New engine outcomes** per F2/F3 specs: somewhere-else as first-class, christening,
    structure questions ("together or split up?"), calibration asks. Lesson-asserting
    tests for each (closed-world escape must be a peer, never a buried fallback).
O5. **Build the Glance** per F1's settled spec: card evolution + ripple + copy system
    (all four lenses) + show-mode album treatment; e2e + axe to the S1 bar; ships inert.
O6. **Housekeeping**: settle-door rider (task #57), ESLint 81-warning triage + worker
    lint, divergence-readout doc for Jonathan's review (evidence, never verdicts).
O8. **The World-Model lattice** (plan §16d): extend the pure fold from places-only to
    the six branches (people / places+character+relations w/ stacked-place
    dimension-signatures / rhythms / devices / lexicon / meta), each graded + decaying +
    clamped + source-cited; each branch feeds its SPECIFIC witnesses (person→uploader &
    routing; rhythm→time & boundary priors; device→per-source channel grading;
    signature→stacked-place disambiguation; lexicon→signage/lookalike). Lesson-asserting
    tests incl.: a lattice fact never asserts alone (clamp holds lattice-wide); the
    off-rhythm photo beats the rhythm prior; stacked places disambiguate by SIGNATURE
    (never proximity); every fact traces to source rows; deleting rows unlearns facts.
O7. **The Learning Spine** (plan §16c; spec'd F5-adjacent, built pure): the
    replay-fold tuner — per-decision lesson extraction at all six altitudes (attention
    credit vs the lean, context hierarchy w/ partial pooling, schema induction from
    kind-shaped answers, hypothesis-class trust w/ soft auto-apply + question
    retirement). Lesson-asserting tests incl.: a divergence datum is never discarded;
    a lesson never crosses a lock or silent-files; deleting a ledger row unlearns its
    lesson; a trusted class retires its question for that context and the show mode
    whispers the assumption; the asymmetry (asks scored as failure-to-learn tax) is in
    the fit criterion, not prose.

## Standing rails (both classes, all week)

- Gates are Jonathan's, per action: commit, push, migration 021, every knob.
- The pinned docs govern: DESIGN_THE_HEALING_MODEL.md §0–§17 (esp. §13 no-demotion,
  §14 emergent routing, §15 whole-not-parts, §16b THE FOUR REVIEW LENSES, §17 the
  question space) + DESIGN_PROMPT_THE_GLANCE.md (post-additions version).
- **Every O-item is reviewed through ALL FOUR lenses (§16b)** — truth-critical,
  multidimensional-critical, heterogeneous-data-critical, gestalt-critical — not truth
  alone. A single-dimension collapse, a hard-gated channel, or a fragment-level act is a
  finding, same severity as a lying write.
- No fragment evaluations; the honest harness — **WHOLE TRIPS held out** (filing
  masked; per-day candidate scoping *within* a held-out trip) — is the only scoreboard;
  Opus reports numbers, never tunes weights by feel. Sanctioned exception (§15/AUDIT-1):
  measurement ablations (whole-minus-one-channel) as instruments, results to the local
  harness report only.
- BUILD_SPECS_GLANCE_ENGINE.md (F2/F3/F4 + A1–A15) joins the governing docs.
  AUDIT-1's ownership deltas: O2 owns A1's three deliverables + per-trip TAUGHT
  attribution; O7 owns A10 (derived-vouch enforcement + imputeConfidence consumption);
  O8 owns A9 (multidimensional entity identity) + footprint/typical-timing; **O4/O5
  build kinds 1–2 + calibration ONLY — kinds 3/5/6 are descoped until F7** (the next
  Fable session: structure/gift/spot-check write semantics at F2/F3 rigor).
- Real data stays in the session scratchpad, never committed.
- **Measurements are INSTRUMENTS, not gates (§15b).** No autonomous constant changes;
  `SETTLE_DEFAULTS` is FROZEN at F5's values all week. O3 measures the WHOLE machine and
  produces ONE holistic readout for Jonathan — never a per-slice scoreboard. No slice is
  gated on a metric delta; the triple is a readout, never an objective to hill-climb. A
  build forcing a new constant uses a DECLARED SEED, reported, never fitted-and-applied.
