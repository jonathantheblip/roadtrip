# OVERNIGHT_REPORT_HM — Opus autonomous run (2026-07-19 → 20)

> Read WORKING_AGREEMENT.md first; this report is a pointer, not truth. Living doc,
> appended per slice. Everything below is LOCAL on `feat/self-healing-photos`; nothing
> pushed/deployed, all `PHOTO_*` knobs OFF, migration 021 unapplied.

## The envelope Jonathan set (kickoff)
- **Priorities:** foundation-first — O1 → O2+A1 → O4/O5/O7/O8.
- **Commits:** commit-per-reviewed-slice; **push the feat branch for a morning PR**
  (verified deploy-safe: `deploy-worker.yml`/`deploy-client.yml` trigger only on
  `branches: [main]`).
- **3am rule:** best defensible call + a REVISIT flag; keep moving.
- **Rigor:** full 4-lens fresh-agent review + §16e sweep per substantive slice.
- **Parallelism:** parallelize independent leaves; critical path stays sequential.
- **§15b LAW (Jonathan corrected a live drift):** measurements are INSTRUMENTS, not
  gates. No autonomous constant changes; `SETTLE_DEFAULTS` FROZEN at F5. The
  71/20/2.6 triple is a coarse readout, never an objective. O3 measures the WHOLE and
  reports ONE readout for Jonathan.
- **Walls that stay Jonathan's:** migration-021 apply, every knob, the deploy, O5's
  felt-whole gate.

## Pre-flight findings (before O1)
1. **§15b pinned** (`7934c19`) — the measurements-are-instruments correction, after I
   drifted into metric-hillclimbing at kickoff. Plan §15b + HM_WEEK rail + memory.
2. **NUL-byte corruption fixed** (`8db976a`) — `settlingEngine.js` `pairKey` and
   `SuggestionBanner.jsx` `sugKey` each held a U+0000 where a space belonged (inside a
   key-builder template literal). Behaviour-neutral (both keys are Map/Set keys, never
   split/rendered) but `settlingEngine.js` classified as binary `data` — invisible to
   grep and every grep-based review tool. Found by a repo-wide scan (now 0 NUL across
   746 tracked files). ⚠ The `Read` tool renders NUL as an invisible space, which is
   how it survived authoring + the F6 review.

## Slice log
### O1 — worker mirrors + parity gate ✅ (`5a58204`)
6 byte-identical mirrors (evidenceBench/settlingEngine/worldModel/imputation/
visionPlacement/healLoop) into worker/src + `hm-engine-parity.test.js` (whole ladder
through both copies, deep-equal every stage, non-triviality asserts). worker 1241/1241,
app 1332/1332. Inert — nothing in worker/src imports them yet (only the test).
- **REVISIT:** O1's adversarial review is folded into O2's — a byte-identical `cp` has
  no behaviour to attack; the mirrors' real risk (bundling + runtime behaviour in the
  worker) only materialises when O2 wires them in. O2's review covers both.

### O2 — shadow-ledger wiring ✅ (`6a42f17`) — reviewed, 4 findings fixed
**Adversarial 4-lens review found 1 MED + 3 LOW; all handled before commit:**
- **F1 (MED, real bug the net caught):** `hm` was keyed on the decision's `memoryIds`,
  re-expanded to the memory's WHOLE-trip photos — so a memory split across moments/days
  contaminated each decision's shadow read with the other moments' photos. Fixed: key on
  the decision's own `photoIds`. Regression test added (a memory split across two days →
  each day's summary scoped to its own photo).
- **F2 (LOW):** adapter now reads `name || title` like the incumbent.
- **F4 (LOW):** the fixture trip is excluded from the shadow world model.
- **F3 (LOW):** O(N²) other-trips re-read per sweep — documented minor cost (knob-gated,
  tiny N); not refactored (would need a healSweep signature change for no real gain now).
- Review CLEARED: inertness, additive-only (every served column byte-identical), WHOLE-
  or-abort, keying, offset, all four lenses. worker 1255→1260, app 1332.
(details of the built shape retained below)
- **O2a** `worker/src/healChallenger.js` — worker-only orchestration: adapts trip+memory
  rows into engine points/places (adapter faithful to the proven healShadow reference;
  real stops use `.name`, verified 85/0), runs the WHOLE ladder per-day with PRODUCTION
  semantics (filing NOT held out — that's the O3 instrument, per §15b), returns a compact
  per-decision `hm` summary (modal top / dest / mean membership / conflict / ignorance).
  Unit tests `heal-challenger.test.js` 9/9.
- **O2b** wired into `recordHealDecisions`: the `hm` summary rides ADDITIVELY inside each
  decision's `signals_json`, behind the new `PHOTO_DECISION_ENGINE` knob
  (`decisionEngineMode`, default **'off' = fully inert**). Integration test
  `heal-challenger-wiring.test.js` 4/4 proves: inert-by-default (no hm), opted-in
  (hm rides + served fields byte-identical = additive-only), sibling-trip tolerated.
  WHOLE-or-abort: any challenger throw → hmRead=null → no partial hm. wrangler knob doc
  added. worker 1254/1254, app 1332/1332.
- **REVISIT (3am call):** F4 named engine states 'v1'|'hm'; I added an explicit **'off'
  default** (nothing runs until Jonathan opts in) — more conservative than F4's
  shadow-always. And **'hm' currently behaves as 'shadow'** (annotate, incumbent still
  serves) — the actual serving-swap is the promotion step (post-measurement, Jonathan's
  gate), deliberately NOT wired tonight so the served path stays 100% incumbent.
- **REVISIT:** exemplars are built from THIS trip's filed photos only; cross-trip
  exemplars are a future enrichment.
- Adversarial 4-lens review: IN FLIGHT (fresh agent). Commit follows review + fixes.

### A1 — lean_json snapshot ✅ (`b790036`) — reviewed, 1 finding fixed structurally
Adversarial review found a real 500-risk: a D1 carrying an EARLIER 021 (12-column table)
would 500 the 13-value INSERT ("has no column named lean_json"), breaking the
never-blocks-the-answer invariant. Fixed structurally — `isNoTable()` now treats
"no such column"/"has no column" as schema-not-ready → inert. ⚠ My FIRST regex fix missed
the real SQLite INSERT error string ("has no column named", not "no such column"); the
schema-skew test (which exercises the REAL error against a hand-built 12-column table)
caught it. Migration note corrected (in-place add safe only because 021 is unapplied);
guessed label now strictly server-sourced. worker 1261/1261.

## ✅ FOUNDATION COMPLETE — O1 → O2 → A1 (the hardest, most truth-critical third)
The whole engine is mirrored + parity-gated (O1), runs as an inert shadow read in the
heal ledger (O2), and the ask-time lean is captured for the learning loop (A1). Each
slice got a fresh-agent 4-lens adversarial review that caught a REAL defect (net's
perfect record holds: O2 keying-contamination, A1 schema-skew-500). All inert: knobs off,
021 unapplied, no engine constant touched, nothing pushed. 5 commits (`7934c19` §15b →
`8db976a` hygiene → `5a58204` O1 → `6a42f17` O2 → `b790036` A1), local, on
feat/self-healing-photos (42 ahead of origin/main).

### Remaining O-week leaves (queued, foundation now unblocks them)
- **O3** — fitting harness (report-only measurement instrument, §15b: one holistic
  readout for Jonathan; independent leaf).
- **O4** — christening + calibration + somewhere-else outcomes (per F2/F3; kinds 1–2 +
  calibration only — 3/5/6 descoped to F7).
- **O5** — build the Glance (per F1 settled spec; ships inert, awaiting Jonathan's
  felt-whole gate).
- **O6** — housekeeping (settle-door rider #57, ESLint 81-warning triage, worker lint).
- **O7** — the Learning Spine (now unblocked by A1's lean_json; enrich the ledger hm with
  per-witness reads when built).
- **O8** — the world-model lattice (the six branches per §16d).
- Migration 021 amended in place (unapplied in prod, verified) → `lean_json TEXT`.
- `readMomentLean` (confirmFeedback.js) reads the current decisions ledger
  SERVER-AUTHORITATIVELY, finds the decision whose memory_ids OVERLAP the answered moment
  (most-overlap wins), snapshots its `hm` + served proposal + question class into
  `lean_json` at confirm time — before the next sweep overwrites the ledger (the exact
  AUDIT-1 fix). Best-effort: any failure → row still writes, lean null. `engine` is 'hm'
  only when a real challenger read exists; else lean_json stays NULL (no dead weight).
  `listHealFeedbackForTrip` now exposes the parsed `lean` for O7.
- Tests `heal-lean.test.js` 5/5 (capture, overlap-match, most-overlap-wins, never-blocks,
  null-when-no-shadow); confirm-feedback regression 23/23; worker 1260/1260.
- **REVISIT:** the compact `hm` is a real lean but not per-witness; O7's attention credit
  needs per-witness reads — enrich the ledger `hm` when O7 (the consumer) is built.
- Adversarial review: IN FLIGHT. Commit follows review + fixes.

### A1 — original grounding (kept for reference)
Grounded plan (prerequisite of O7): (1) amend `021_memory_heal_feedback.sql` in place
(unapplied in prod, verified) to add `lean_json TEXT`; (2) at `/heal-confirm` write time
(`writeHealFeedback`, confirmFeedback.js:72), capture the ask-time lean
**SERVER-AUTHORITATIVELY from the ledger** — read the matching decision's
`signals_json.hm` from memory_heal_decisions (O2 already stores it) + the engine id +
the question classId + the incumbent's guess. No client-supplied lean (no spoof surface),
no recompute. (3) The projection contract gains `classId` per question.
- **Design note:** AUDIT-1's A1 widening wants per-witness bench reads for O7's
  attention credit. The compact `hm` (top/dest/m/conflict/ignorance/n) is a real lean but
  not per-witness. DECISION (REVISIT): store the compact server-authoritative lean now;
  enrich the ledger `hm` with per-witness contributions when O7 (the consumer) is built —
  keeps this slice honest and avoids speculative schema. Blocked on O2 commit (the hm is
  the lean source).

## REVISIT flags (for Jonathan's morning pass)
- O1 review folded into O2 (above).

## Parked gates (Jonathan's calls)
- migration 021 apply · every PHOTO_* knob · the deploy · O5 felt-whole gate.

## Measurement (deferred to the WHOLE machine — §15b)
- Baseline to beat is the F5 readout (71/20/2.6). NOT re-measured per-slice; O3 will
  produce ONE holistic readout of the whole machine for Jonathan.
