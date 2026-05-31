# Carryover — QA coverage system, Phase 3, Slice C3b (dispatch/upload/encode — the HOT ZONE)

Stopping at the **C3a-complete** boundary. C3b is the heaviest sub-slice of the
heaviest cluster — the dispatch/upload/encode hot zone where the R1–R6 + J-series
bugs lived — and the most likely place in the whole walk to surface real findings.
It deserves a fresh window. This memo is the state handoff. **Do NOT treat this as a
spec.** Governing spec: `QA_COVERAGE_SYSTEM_SPEC.md`. Living grid: `COVERAGE_MATRIX.md`.
Findings catalog: `KNOWN_BUGS.md`.

## State at handoff
- Branch `main`, **HEAD `634e859`** (the C3a commit), **local == origin** — verify with a
  read first: `git rev-parse HEAD` == `git rev-parse origin/main`, ahead/behind `0 0`.
- All Phase-3 commits are pushed; each is root `.md` only → deploy-inert.

## Phase 3 progress (Slice 0 → C3a done; C3b next)

| Slice | Commit | What it did |
|---|---|---|
| **Slice 0** | `d107f77` | Doc-consistency: corrected 2 rotated tier SHAs in KNOWN_BUGS (A11Y-1 → `fcf691a`, DEADCODE-1 → `14ab6a0`); refreshed `COVERAGE_MATRIX` §1 Status + spec-note to post-Phase-2 truth. |
| **C1 — themed spine** | `21425f9` | S1 Trips index · S2 Trip home · S3 Stop detail ×4 personas. **No new `[real]` bugs — the spine themes correctly per-persona** (S1 axe ×4 green; S2 visual ×4 green). 3 gaps: C1-GAP-1 (S3 zero walked coverage), C1-GAP-2 (axe not wired on S2 body), C1-GAP-3 (sim doesn't walk the spine per-persona). |
| **C2 — Claude family** | `a5b498d` | O1 panel + O2 cards (6 types) ×4 personas. **P3-01 `[real, S2 — deferred M6]`: wrong-theme bleed confirmed at source** — `ClaudeChat.jsx:43-54` + `ConfirmCard.jsx:27-48` hardcode Helen's `T` palette via inline styles (no `data-theme`), so jonathan/aurelia/rafa get Helen's colors. Render-sanitization **clean** (no `rehype-raw`; markdown-path-guard 4/4). 1 gap: C2-GAP-1 (instrument not wired on cards). |
| **C3a — photos browse/render** | `634e859` | S8 Photos (render-states) · S9 All-photos · O7 Lightbox · O8 Backfill ×4 personas, **render/display half only**. **No new `[real]` bugs — photos theme correctly per-persona on BOTH engines** (pw chromium 45/45 + webkit-mobile 45/45; per-persona visual baselines `album-{persona}` ×4 + `all-photos-{persona}` ×4). **sim `photo-render` NON-BLACK** full-res iPhone JPEG on real iOS (iPhone 17 / iOS 26.5) → the **founding black-photo bug class does NOT reproduce** (structural guard holds; the hardware memory-pressure *symptom* remains real-device-only, Jonathan's). **O8 is NOT a gap** — `reconcile-archive.spec.js` renders the real `PhotoBackfillTriage` (overturns the Phase-1 audit's "no coverage"). 2 gaps: C3a-GAP-1 (axe scans no photos surface, like C1-GAP-2), C3a-GAP-2 (O8 walked helen-only). |

**Matrix: 9 of 19 surface rows captured** (S1/S2/S3, O1/O2, S8/S9/O7/O8). **NO new
`[real]` bugs across any slice so far** — the single confirmed finding is **P3-01** (the
known, bounded, M6-deferred Claude-in-app wrong-theme bleed). The S8 row is annotated
**"render-states C3a / write-states C3b."**

## The slicing plan (surface-cluster C1→C5; C3 sub-sliced C3a→C3b)
- Walk **all 4 personas** (jonathan/helen/aurelia/rafa) within each surface cluster.
- **Existing tiers ONLY.** Run the harnesses that already exist. **Where a cell has no
  existing spec coverage, log it as a GAP** (capability noted, `walked = none`). **Do NOT
  author new specs to reach a gap** — spec-authoring is a later triage decision (Jonathan's
  call, deferred). Recording a gap IS a valid Phase-3 output (spec §3).
- **One matrix + findings commit per slice**, root `.md` → **deploy-inert**.
  **STOP for review after each slice.**
- Order: C1 ✓ → C2 ✓ → C3a ✓ → **C3b (next)** → C4 → C5.

## What C3b IS — dispatch/upload/encode (the HOT ZONE)
Surfaces (all ×4 personas): **O3 Dispatch composer · S8 Photos write-states
(uploading / offline-queued / dispatch-composer-open).** This is the slice where the
**R1–R6 + J-series** bugs lived → **the highest likelihood of real findings in the whole
walk.** Walk carefully; surface everything via COLLECT.

- **Tiers ×4:**
  - **Playwright (DOM/flow, both engines):** `photos-dispatch`, `photos-offline`,
    `photos-video`, `photos-auto-downscale`, `photos-screenshots-m2`, `photos-screenshots-m4`.
    These ride the **RT_PERSONA-parameterized `withTrip` fixture** (verified in C3a) →
    `RT_PERSONA=<persona> npx playwright test … --project=chromium` (and `--project=webkit-mobile`).
  - **sim (real iOS WebKit):** **`video-encode`** (WebCodecs) + **`offline-drain`** (IDB+Blob).
    Run **these two** — `photo-render` was the C3a render assertion, do not re-run it for C3b.
  - **instrument (`instrumentation-harvest`) in COLLECT:** the **`rt_upload_log_v1` HOT ZONE**
    (the most active instrument surface; the log is failure-only). Use **`harvestDevLog`** and
    **surface every trace as a finding** — do **NOT** use `expectNoSilentFailures` as a gate
    (it would fail the walk instead of cataloging). The spec hardcodes `?person=helen` (direct
    goto, not the withTrip fixture); the upload-log content is failure-codes → **persona-invariant**,
    so the helen harvest covers the finding (×4 is bookkeeping, like C2-GAP-1).

## CONFIRMED usable for C3b (don't re-derive)
- **The photo sim specs ARE RT_PERSONA-parameterized** — verified in C3a by reading
  `photo-render.test.mjs` (`resolvePersona('helen')` threaded into the seed + goto URL). This
  is **unlike the spine sim** (C1-GAP-3, which is persona-agnostic). So `video-encode` /
  `offline-drain` **can run ×4 if warranted** via `RT_PERSONA`. **Caveat:** several sim
  assertions are persona-invariant (e.g. the non-black readback, the encode success/IDB
  round-trip), so ×4 is **partly bookkeeping** — exercise judgment; helen + one cross-persona
  spot-check may suffice unless a write-state surface themes.
- **The iPhone 17 / iOS 26.5 sim was BOOTED** in the C3a window (`xcrun simctl list devices
  booted`). **Confirm it's bootable/booted in the new window** before claiming sim coverage;
  if down, `xcrun simctl boot <udid>` (udid `1DE9F75F-8C28-4E66-BA8A-224A4C879655` in the C3a
  window — re-list to confirm).
- **Server:** Playwright auto-starts vite on **:5181** (`reuseExistingServer`, baseURL
  `http://localhost:5181`). The sim runner (`node tests/simulator/runner.mjs`) **shares :5181**
  (reuses if up). To run a single sim spec without the full runner: stand up vite yourself
  (`npx vite --port 5181 --strictPort`, wait for listen via `curl --retry … --retry-connrefused`,
  **no foreground `sleep`**), then `node --test tests/simulator/<spec>.test.mjs`. The runner
  runs ALL sim specs (incl. `photo-render`) — for C3b you want only `video-encode` + `offline-drain`.

## Inherited WebKit gates — CONFIRM, do NOT re-litigate
These are **already-characterized `[test]`-class skips** (full write-ups in `KNOWN_BUGS.md`):
- **R3 / R3c** — WebCodecs: `photos-video.spec.js` gated (R3a webkit skip; R3c chromium+webkit
  skip at `:43` on the cold-cache vite/encode-worker race). iOS-real coverage lives in sim
  `video-encode`.
- **R4 / R5 / R6 / R2 / J1 / J2 / J4** — IDB+Blob downstream: Playwright WebKit fails
  `IDBObjectStore.put({...blob})`, so the sync-pill / dispatch-retry / offline / auto-downscale
  tests skip on webkit via the shared `WEBKIT_IDB_BLOB_REASON` gate. iOS-real coverage lives in
  sim `offline-drain`.

**C3b's job:** confirm these **still reproduce as characterized** (the skips fire for the
documented reason) and the **sim specs still pass on the booted iPhone** — it does **NOT** try
to un-gate, re-fix, or re-classify them. Note any drift as a finding; otherwise cross-reference.

## Tier modes (LOCKED)
- **Instrumentation = COLLECT** (`harvestDevLog` → surface every dev-log trace as findings; do
  NOT gate with `expectNoSilentFailures`). Worker console is not harvestable in-test (workerd →
  stdout, no queryable array); the in-test worker signal is the error RESPONSE; deployed =
  `wrangler tail` (manual, Jonathan's).
- **axe contrast allowlisted to A11Y-1** — but note **axe reaches no photos/dispatch surface**
  (C3a-GAP-1 / C1-GAP-2; `a11y-axe.spec.js` scans only trips-index + the Claude panel). O3/S8
  axe is a gap, not a walked tier.
- **knip non-gating** while the 78 orphans stand (DEADCODE-1).

## Findings schema
`KNOWN_BUGS.md`, **P3-NN scheme**: ID · `[real|test, severity]` · **Surface×persona** ·
**Tiers caught** (list EVERY tier that sees a given issue) · **Reproducer** (exact command) ·
**Non-vacuous** note. Fill the matrix **Walked / Findings** cells for **O3** + the **S8
write-states** half of S8's row. Latest ID issued: **P3-01** (C2). C3a issued none (clean).
**C3b likely issues P3-02+** — it's the hot zone.

## Remaining after C3b
- **C4 — creation/editing:** S5 New-trip · S6 Trip editor · S7 Activities · S10 Share-in.
  **NOTE (Jonathan's standing call): the new-trip exit affordance AND the all-photos
  back-blank edge are findings-to-CONFIRM in this cluster, NOT gaps to defer** — the code read
  in `COVERAGE_MATRIX` §5 flagged both, and C3a left the all-photos back-blank edge for C4 by
  design; confirm them empirically during C4.
- **C5 — settings + persona-specific overlays:** S4 Settings · O4 Leave-when ·
  O5 Nearby (J-only) · O6 Postcard (A-only) · O9 Flight status (H-only) — the thin /
  persona-specific cells.

## Standing environment facts (don't re-learn)
- Repo at **`~/dev/roadtrip`**, off iCloud. Use absolute paths; **confirm HEAD +
  local==origin with a read** before walking.
- **This project has produced garbled/fabricated tool outputs repeatedly — second-read any
  load-bearing fact, never trust a single output for an irreversible claim.** (Slice 0 itself
  corrected two rotated tier SHAs a prior window had garbled into KNOWN_BUGS.)
- **Do NOT relaunch the parallel subagent workflow** — it dies on an MCP schema the API
  rejects (`oneOf/allOf/anyOf` at top level). Work directly; do not fan out.
- **Context self-estimates are UNRELIABLE BOTH DIRECTIONS** (a prior window thought ~67% at
  ~42%; another ~57% at ~25%). **Do NOT trust the self-gauge** for stop/continue — **stop at a
  clean slice boundary regardless**, and **defer to Jonathan's actual-percentage read.**
- The `CARRYOVER_*` / `PUNCHLIST_*` / etc. files at repo root are pre-existing untracked
  clutter — **never sweep them into a commit; stage named files only.**

## Deploy posture
- **Client** auto-deploys on **`app/**` push** (`deploy-client.yml`, e2e-gated). **Worker**
  deploys on **`worker/**` push** (`deploy-worker.yml`) — worker deploys/secrets are **Jonathan's**.
- Capture-run commits (`COVERAGE_MATRIX.md`, `KNOWN_BUGS.md`, this carryover) are **root `.md`
  → deploy-inert.** The ONLY way a slice trips a deploy is if it authors a new spec under
  `app/**` — exactly the deferred gap-closing case (don't, without a triage decision).

## Suggested first move (C3b)
1. Confirm HEAD `634e859` + local==origin + read this memo + `COVERAGE_MATRIX.md` (the O3 + S8
   rows + §5 nav) + the **P3-01**, **R2/R3/R3c/R4/R5/R6**, **J1/J2/J4**, **A11Y-1**, **DEADCODE-1**
   entries in `KNOWN_BUGS.md`. Confirm the sim is bootable/booted.
2. Walk **O3 + S8 write-states ×4 personas**, existing tiers, **instrument in COLLECT**. Run the
   `photos-dispatch` / `-offline` / `-video` / `-auto-downscale` / `-screenshots-m2` / `-screenshots-m4`
   e2e (both engines) and the booted-sim **`video-encode` + `offline-drain`**. **Harvest the
   dev-log; surface every trace as a finding.** Confirm the inherited WebKit gates still fire as
   characterized; do NOT re-fix them.
3. Record P3-NN findings (real/test, severity, surface×persona, tiers-caught, reproducer,
   non-vacuous), fill the matrix cells (O3 + S8 write-states), **one commit, push (deploy-inert),
   STOP for review.** C3b is the likely-many-findings slice — pace it; carryover at a clean
   boundary if you near the context limit mid-cluster.
