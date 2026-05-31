# Carryover — QA coverage system, Phase 3 (the capture run)

Stopping at the **Phase 2 COMPLETE** boundary. Phase 3 is the heavy capture run
and wants a fresh window — this memo is the handoff. **Do NOT treat this as a
spec; the governing spec is `QA_COVERAGE_SYSTEM_SPEC.md`.**

## State at handoff
- Branch `main`, **HEAD `b27b4e0`**, local == origin (verify with a read first).
- Governing docs at repo root: **`QA_COVERAGE_SYSTEM_SPEC.md`** (committed
  `352f752`) and **`COVERAGE_MATRIX.md`** (committed `1aa7f20`, the living
  surface×persona×state×tier grid). Phase 3 fills the matrix's **Walked /
  Findings** columns.
- Findings catalog: **`KNOWN_BUGS.md`** (tracked) — Phase 3 appends to it.

## Phase 2 — COMPLETE (all 5 tiers built + proven non-vacuous)

| # | Tier | Commit(s) | What it does | How to invoke |
|---|---|---|---|---|
| 1 | **Persona-parameterized harness** | `a876757` | One `RT_PERSONA` env knob drives BOTH harnesses (e2e + iOS sim) via a shared resolver; defaults preserved (e2e→jonathan, sim→helen) | `resolvePersona(fallback)` in `app/tests/e2e/_fixtures/persona.js`; run `RT_PERSONA=aurelia npx playwright test …` / `RT_PERSONA=rafa npm run test:simulator`. e2e's authoritative channel is the `?person=` URL; `seedTripIntoCache`'s localStorage seed covers no-`?person=` specs |
| 2 | **Security tier** (3 checks) | `24a1b7e`, `cf096da`, `fd75e51` | auth-boundary + private-memory isolation (worker/miniflare); no-secret-in-bundle (build); render-sanitization XSS-inert + markdown-path guard (client) | `cd worker && npx vitest run` (auth/isolation: `worker/test/security-auth-isolation.test.js`); `npm run build` → `postbuild` runs `app/scripts/checkNoSecrets.mjs`; `npx playwright test security-render-xss` + `npm test` runs `app/scripts/__tests__/markdown-path-guard.test.mjs` |
| 3 | **axe-core a11y** | `fcf691a` | WCAG-2 AA serious+critical scan, animations settled, persona-aware | `expectNoSeriousA11y()` in `app/tests/e2e/_fixtures/axe.js`; `npx playwright test a11y-axe` (wired on trips index + Claude panel) |
| 4 | **Dead-code scan (knip)** | `14ab6a0` | Module-graph reachability — unmounted components / unimported modules / unused exports | `cd app && npm run deadcode` (config `app/knip.json`) |
| 5 | **Instrumentation harvest** | `b27b4e0` | Reads the client dev-log (`rt_upload_log_v1`, failure-only) out of the page after a walk; surfaces SILENT (Bucket-A) failures the UI swallowed | `harvestDevLog(page)` (COLLECT) + `expectNoSilentFailures(page,{allow})` (ASSERT) in `app/tests/e2e/_fixtures/instrumentation.js` |

Existing suites at this HEAD: worker **31/31**, app `npm test` **276/276**, full
chromium e2e **110 passed / 2 skipped** (the 2 skips are the video/sim-delegated
gates).

## What Phase 3 IS

Walk the `COVERAGE_MATRIX.md` grid **across all 4 personas × every surface ×
every tier**, instrumentation in **COLLECT** mode, and:
- write findings into **`KNOWN_BUGS.md`** — each with: `[real]` vs `[test]`,
  severity, a reproducer command, and **which tier(s) caught it** (the matrix is
  overlapping coverage — there is **no single primary catcher**; record every
  tier that sees a given issue);
- fill the matrix's **Walked / Findings** cells.

**The persona axis is comprehensive** — Jonathan's call: **no surface is
assumed persona-invariant**. Walk each of jonathan / helen / aurelia / rafa
through each surface, because theme/contrast/persona-specific widgets differ
(the persona harness from tier 1 is exactly what makes this reachable; pre-tier-1
the walks were single-persona — e2e jonathan, sim helen — so aurelia/rafa were
zero-coverage).

This is a large run. Pace it; a fresh window per persona-batch or per
surface-cluster is reasonable. It is **capture + triage**, not fixing — fixes
are their own cycle (M6 for the theme/contrast work).

## Findings Phase 3 triage INHERITS (already recorded)

- **KNOWN_BUGS A11Y-1** (from the axe tier): real `color-contrast` failures.
  - **Claude-in-app panel — 4.48:1 for ALL personas** (muted ink `#696F68` on
    linen `#F2EFE7`). It's Helen's M1 palette, which every persona inherits
    because the panel is hardcoded Helen → **axe corroborates the wrong-theme
    bug from the contrast angle** (tier overlap: a11y ↔ the theme finding).
  - **Trips index — persona-variant**: jonathan 2.92:1, aurelia 3.13:1, helen
    4.48:1, **rafa clean**.
  - Deferred to M6. Phase 3 should confirm/extend across the other surfaces.
- **KNOWN_BUGS DEADCODE-1** (from knip): a **78-file dead subgraph** orphaned by
  the `1fc7a9f` "four refined themed views" refactor (components/data/hooks/utils
  + RoadSearch). Flagged **RESTORE-vs-DELETE, not resolved**:
  - **`useTheme.js`** — its per-person PWA manifest/icon/theme-color swap logic
    isn't running (App.jsx sets only `data-theme`) → possible silent PWA-install
    regression → likely a **RESTORE**, not a delete.
  - **Map cluster** (`RouteMap*`/`MapCard` + deps `leaflet`/`react-leaflet`) — a
    whole map feature went dark; restore-vs-delete.
  - Cataloging was the job; **deletion/restoration is the triage decision** (do
    not delete blind).

## Tier modes for Phase 3
- **Instrumentation = COLLECT.** Use `harvestDevLog()` to surface every dev-log
  trace into findings; do NOT use `expectNoSilentFailures()` as a gate during
  the capture walk (it would fail the walk instead of cataloging). Worker
  console is not harvestable in-test (workerd→stdout, no queryable array); the
  in-test worker signal is the error RESPONSE, deployed is `wrangler tail`
  (manual).
- **axe contrast is allowlisted to A11Y-1** — the a11y tests stay green
  (`allow: ['color-contrast']` on the index + panel); M6 removes the allow to
  re-gate contrast. The tier still gates every other serious/critical rule.
- **knip is non-gating** — it catalogs the 78 orphans; it becomes a gate only
  after triage clears them (don't wire it into CI red while the 78 stand).

## Standing environment facts (don't re-learn)
- Repo at **`~/dev/roadtrip`**, off iCloud. Use absolute paths; **confirm HEAD +
  local==origin with a read** before building.
- **This session had garbled/fabricated tool outputs repeatedly — second-read
  any load-bearing fact, never trust a single output for an irreversible
  claim.**
- **Do NOT relaunch the parallel subagent workflow** (it dies on the MCP
  schema). Work directly.
- **Context self-estimates ran low all session** (thought ~67% at ~42%) — check
  honestly; don't stop early on a misread, but DO carryover at a clean commit
  boundary when genuinely near the limit.
- The `?? CARRYOVER_*` / `PUNCHLIST_*` / etc. files at repo root are pre-existing
  untracked clutter — never sweep them into a commit; stage named files only.

## Deploy posture
- **Client** auto-deploys on **`app/**` push** via `deploy-client.yml`
  (e2e-gated, runs `npm run build`). Test-only pushes under `app/**` produce a
  **byte-identical bundle** — harmless re-publish, but the **full e2e gate must
  stay green** (both Chromium + WebKit-mobile in CI).
- **Worker** deploys on **`worker/**` push** via `deploy-worker.yml` (worker
  tests + e2e gated); worker deploys/secrets are **Jonathan's** to run.
- `KNOWN_BUGS.md` and other root `.md` files trip **no** deploy filter.

## Suggested first move (Phase 3)
1. Confirm HEAD `b27b4e0` (or later) + local==origin + read this memo +
   `COVERAGE_MATRIX.md` + the A11Y-1 / DEADCODE-1 entries in `KNOWN_BUGS.md`.
2. Pick the matrix walk order (e.g. per-persona batches, or per surface-cluster
   across the 4 personas). Instrumentation in COLLECT.
3. Walk, record findings (real/test, severity, reproducer, tiers-caught), fill
   the matrix cells, commit per coherent batch. Stop and carryover at clean
   boundaries — Phase 3 is many windows, not one.
