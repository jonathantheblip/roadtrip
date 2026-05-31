# Carryover — QA coverage system, Phase 3, Slice C3 (photos/media — the heaviest)

Stopping at the **C2-complete** boundary. C3 is the heaviest slice (photos/media:
sim WebCodecs/IDB+Blob + the instrumentation hot-zone) and wants a fresh window —
context was **~57% real** at handoff. This memo is the state handoff. **Do NOT treat
this as a spec.** Governing spec: `QA_COVERAGE_SYSTEM_SPEC.md`. Living grid:
`COVERAGE_MATRIX.md`. Findings catalog: `KNOWN_BUGS.md`.

## State at handoff
- Branch `main`, **HEAD `a5b498d`** (the C2 commit), **local == origin** — verify with a
  read first: `git rev-parse HEAD` == `git rev-parse origin/main`, ahead/behind `0 0`.
- All three Phase-3 commits are pushed; each is root `.md` only → deploy-inert.

## Phase 3 progress (Slice 0 → C2 done; C3 next)

| Slice | Commit | What it did |
|---|---|---|
| **Slice 0** | `d107f77` | Doc-consistency: corrected 2 rotated tier SHAs in KNOWN_BUGS (A11Y-1 → `fcf691a`, DEADCODE-1 → `14ab6a0`); refreshed `COVERAGE_MATRIX` §1 Status column + spec-note to post-Phase-2 truth. |
| **C1 — themed spine** | `21425f9` | S1 Trips index · S2 Trip home · S3 Stop detail ×4 personas, existing tiers. **No new `[real]` bugs — the spine themes correctly per-persona** (S1 axe ×4 green incl. Aurelia/Rafa newly scanned; S2 visual ×4 green vs per-persona baselines). 3 gaps: **C1-GAP-1** (S3 zero walked coverage — no spec renders it), **C1-GAP-2** (axe not wired on S2 body), **C1-GAP-3** (sim doesn't walk the spine per-persona). |
| **C2 — Claude family** | `a5b498d` | O1 panel + O2 cards (6 types) ×4 personas. **P3-01 `[real, S2 — deferred M6]`: wrong-theme bleed confirmed at source** — `ClaudeChat.jsx:43-54` + `ConfirmCard.jsx:27-48` hardcode Helen's `T` palette via inline styles (no `data-theme`), so jonathan/aurelia/rafa get Helen's colors; axe 4.48:1 panel contrast (A11Y-1) corroborates. Render-sanitization **clean** (`security-render-xss` inert + `markdown-path-guard` 4/4, no `rehype-raw`). O1/O2 behavior **22 passed**. 1 gap: **C2-GAP-1** (instrument-harvest not wired on the card surface). |

**Matrix: 5 of 19 surface rows captured** (S1/S2/S3, O1/O2). `Walked` / `Findings` filled per row.

## The slicing plan (surface-cluster C1→C5)
- Walk **all 4 personas** (jonathan/helen/aurelia/rafa) within each surface cluster.
- **Existing tiers ONLY.** Run the harnesses that already exist. **Where a cell has no
  existing spec coverage, log it as a GAP** (capability noted, `walked = none`). **Do NOT
  author new specs to reach a gap** — spec-authoring is a later triage decision (Jonathan's
  call, deferred). Recording a gap IS a valid Phase-3 output (spec §3).
- **One matrix + findings commit per slice**, root `.md` → **deploy-inert**.
  **STOP for review after each slice.**
- Order: C1 ✓ → C2 ✓ → **C3 (next)** → C4 → C5.

## What C3 IS — photos/media (the heaviest slice)
Surfaces (all ×4 personas): **S8 Photos (per-trip) · S9 All-photos (cross-trip) ·
O3 Dispatch composer · O7 Photo lightbox · O8 Photo backfill triage.**

- **Tiers:** Playwright (DOM/flow) · **sim** (real iOS WebKit — **WebCodecs / IDB+Blob**,
  where the founding black-photo / memory-pressure bug class lived) · **instrumentation in
  COLLECT mode** (`harvestDevLog` — **this is the upload-log HOT ZONE**, the most active
  instrument surface; `rt_upload_log_v1` is failure-only) · **axe**.
- **This is where R1–R6 + the J-series bugs lived** → the highest likelihood of real
  findings in the whole walk. Walk carefully; surface everything via COLLECT.
- The booted **iPhone 17 / iOS 26.5** sim makes the real-iOS tier reachable. Existing sim
  specs here: `photo-render`, `offline-drain`, `video-encode` (Helen-seeded by default,
  `RT_PERSONA`-parameterizable). Existing e2e here: `photos-*` (lazy-load, dispatch,
  offline, video, screenshots{,-m2,-m4}, capturedAt, multi-photo-tile, auto-downscale,
  lightbox-swipe, view), `all-photos`, `instrumentation-harvest`.
- **Inherited WebKit gates** (KNOWN_BUGS R3/R4 IDB+Blob, R3c vite cold-cache) are
  already-characterized `[test]`-class skips — the C3 walk **confirms/extends, does not
  re-litigate** them. The iOS-real coverage for the gated surfaces lives in the sim specs.
- **O8 Backfill triage had NO dedicated spec at the Phase-1 audit** (matrix §3) → it will
  most likely **log as a gap** (capability `pw`, walked = none) unless an existing spec
  reaches it. Don't author one to close it.

## Tier modes (LOCKED)
- **Instrumentation = COLLECT** (`harvestDevLog` → surface every dev-log trace as findings;
  do NOT use `expectNoSilentFailures` as a gate — it would fail the walk instead of
  cataloging). Worker console is not harvestable in-test (workerd → stdout, no queryable
  array); the in-test worker signal is the error RESPONSE; deployed = `wrangler tail`
  (manual, Jonathan's).
- **axe contrast allowlisted to A11Y-1** (`allow: ['color-contrast']`) — the tier stays
  green and still gates every other serious/critical rule.
- **knip non-gating** while the 78 orphans stand (DEADCODE-1).

## Findings schema
`KNOWN_BUGS.md`, **P3-NN scheme**: ID · `[real|test, severity]` · **Surface×persona** ·
**Tiers caught** (no primary catcher — list EVERY tier that sees a given issue) ·
**Reproducer** (exact command) · **Non-vacuous** note. Fill the matrix **Walked / Findings**
cells per surface. Latest ID issued: **P3-01** (C2) → C3 continues **P3-02…**.

## Remaining after C3
- **C4 — creation/editing:** S5 New-trip · S6 Trip editor · S7 Activities · S10 Share-in.
  **NOTE (Jonathan's standing call): the new-trip exit affordance and the all-photos
  back-blank edge are findings-to-CONFIRM in this cluster, NOT gaps to defer** — the code
  read in `COVERAGE_MATRIX` §5 flagged both; confirm them empirically during C4.
- **C5 — settings + persona-specific overlays:** S4 Settings · O4 Leave-when ·
  O5 Nearby (J-only) · O6 Postcard (A-only) · O9 Flight status (H-only) — the thin /
  persona-specific cells.

## Standing environment facts (don't re-learn)
- Repo at **`~/dev/roadtrip`**, off iCloud. Use absolute paths; **confirm HEAD +
  local==origin with a read** before walking.
- **This project has produced garbled/fabricated tool outputs repeatedly — second-read any
  load-bearing fact, never trust a single output for an irreversible claim.** (Slice 0
  itself corrected two rotated tier SHAs a prior window had garbled into KNOWN_BUGS.)
- **Do NOT relaunch the parallel subagent workflow** — it dies on an MCP schema the API
  rejects (`oneOf/allOf/anyOf` at top level). Work directly; do not fan out.
- **Context self-estimates run LOW here** (a prior window thought ~67% at ~42%; this
  handoff's 57% was real). Check honestly; **stop at a clean slice boundary, never
  mid-walk.**
- The `CARRYOVER_*` / `PUNCHLIST_*` / etc. files at repo root are pre-existing untracked
  clutter — **never sweep them into a commit; stage named files only.**

## Deploy posture
- **Client** auto-deploys on **`app/**` push** (`deploy-client.yml`, e2e-gated, runs
  `npm run build`). **Worker** deploys on **`worker/**` push** (`deploy-worker.yml`) —
  worker deploys/secrets are **Jonathan's** to run.
- Capture-run commits (`COVERAGE_MATRIX.md`, `KNOWN_BUGS.md`, this carryover) are **root
  `.md` → trip no deploy filter.** The ONLY way a slice trips a deploy is if it authors a
  new spec under `app/**` — which is exactly the deferred gap-closing case (don't, without
  a triage decision).

## Suggested first move (C3)
1. Confirm HEAD `a5b498d` + local==origin + read this memo + `COVERAGE_MATRIX.md` (the
   S8/S9/O3/O7/O8 rows + §6 dead-code) + the A11Y-1 / DEADCODE-1 / R3–R6 entries in
   `KNOWN_BUGS.md`.
2. Walk S8/S9/O3/O7/O8 ×4 personas, existing tiers, **instrument in COLLECT**. Run the
   `photos-*` + `all-photos` e2e and the booted-sim photo specs (`RT_PERSONA` ×4). Harvest
   the dev-log; surface every trace as a finding.
3. Record P3-NN findings (real/test, severity, reproducer, tiers-caught), fill the matrix
   cells, **one commit, push (deploy-inert), STOP for review.** C3 is many findings — pace
   it; carryover at a clean boundary if you near the context limit mid-cluster.
