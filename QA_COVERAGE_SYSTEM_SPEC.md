# QA_COVERAGE_SYSTEM_SPEC.md

A coverage-and-capture system for the roadtrip PWA: find the bugs already in the app, make the gaps legible, and keep UI / functionality / security from regressing as features ship.

This **extends `TEST_STRATEGY_SPEC.md`** — it does not replace it. The four-tier model in that spec is the foundation; this adds the coordination layer on top: a coverage matrix that shows where the tiers do and don't reach, two new capture tiers (accessibility, dead-code), a security tier and a security regression gate, instrumentation harvesting, and the workflow that turns findings into the existing `KNOWN_BUGS` catalog.

Grounded against the tree at the current HEAD. Where a design decision depends on a fact about the current architecture that hasn't been read yet, it is marked **[ground in Phase 1]** — the audit confirms it before the design is final, exactly as `TEST_STRATEGY_SPEC.md` was grounded in a capability inventory and stream trace.

---

## 0. Governing rule (inherited, with two extensions)

**Tests check the work. They never become the shape of the work.** (Inherited verbatim from `TEST_STRATEGY_SPEC.md §0`. It remains the kill-criterion.)

Two things in this spec could *look* like scope inversion. They are in-bounds, and here is exactly why — and exactly where their bound is:

- **The comprehensive persona axis** (every surface walked as all four travelers) is justified by a real, repeating bug class — surfaces built and tested as one persona, shipping wrong for the other three (the Claude-in-app theme bug is the proof; the principal reports many more uncaught stray bugs of this kind). It traces to "find the bugs that have been falling through," not to admiring coverage. **Bound:** the matrix records *whether a cell is covered and what broke there.* It does not become a catalog of phrasings, a fuzzer, or a model-eval.

- **The security tier and gate** trace to a deliverable the principal asked for directly: no UI / functionality / **security** regressions as features ship. **Bound:** it guards the specific security properties this app already relies on — the auth boundary, no-secret-in-bundle, render sanitization. It is not a pentest, an OWASP sweep, or a generic vulnerability hunt. A security check that grows past a property the app already depends on is scope inversion and gets cut.

When in doubt, the inherited test applies: a check that must be maintained independently of the thing it guards is a side-project.

---

## 1. What this is, and the honest cost

This is **the largest single piece of infrastructure scoped for this project** — larger than the six-unit test foundation. It is a matrix, three-to-four new tools, an instrumentation-harvest layer, a capture run, and a standing gate. Phase 2 (building the tooling) is the bulk of the work and is multiple sessions of Code build on its own.

That size is the reason for the phasing in §6. Every piece is **independently shippable**, the way the six units were: the matrix ships first and is useful alone (it is the map); each tool ships independently and adds one capture tier; the capture run is last and uses whatever tools exist. An interruption at any boundary leaves a usable artifact, never a half-built monolith.

The honest framing matches the foundation's: this is **smoother, not faster.** What it buys is the principal out of the bug-hunting seat (the automated tiers capture everything they can reach), the existing pile of unreported stray bugs made legible and triageable, and a regression gate so that future features can't silently break what already works.

---

## 2. The system: overlapping coverage, no primary catcher

**There is no primary catcher.** This is the load-bearing principle and it shapes everything below. Coverage comes from **overlap and redundancy** — where one tier is blind, another sees; a bug caught by two tiers is corroborated, not duplicated. No tier is ranked above another and none is relied on as the catch of record. A "gap" is precisely a place where too few tiers reach.

The system has three layers:

**Layer 1 — the coverage matrix (the spine).** Surface × state × persona, every cell tagged with which tiers reach it. It is what makes this a system rather than a set of unrelated tool runs: it shows where coverage *overlaps* (trustworthy), where it is *single-tier* (thin), and where it is *empty* (gap). It tells every tier where to walk, and it is the one view in which the principal can *see* the holes instead of inferring them. Detailed in §3.

**Layer 2 — the tiers, overlapping.** Each reaches a layer the others can't, with deliberate redundancy. Detailed in §4. The existing four (Playwright, miniflare-worker, Simulator, Claude-in-Chrome, + human) from `TEST_STRATEGY_SPEC.md`, plus the new ones this spec adds: accessibility, dead-code, security, and the instrumentation harvest.

**Layer 3 — the catalog (the output).** Everything writes into the existing `KNOWN_BUGS` schema — `real-vs-test`, severity, reproducer, and **which tiers caught it.** A finding corroborated by multiple tiers is marked as such; a gap no tier covers is recorded as a gap. This is what the principal triages from. No new format — it fills the schema that already exists (`KNOWN_BUGS.md`, `KNOWN_BUGS_HELEN_SURFACE.md`).

---

## 3. The coverage matrix

### Shape

A **living, committed document** (`COVERAGE_MATRIX.md` at repo root). Primary grid is **surface × persona**; **state** is recorded within each cell (a cell lists the states covered: empty / populated / loading / error / offline, as applicable to that surface). Each cell records the **tiers that reach it** and **findings logged there**.

Cell notation (illustrative):
```
Trips index │ Jonathan │ tiers: sim, pw, axe, chrome │ states: empty✓ populated✓ offline✓ │ findings: —
Trips index │ Rafa     │ tiers: sim, pw              │ states: populated✓ empty✗            │ findings: BUG-014 (theme)
```
- **2+ tiers** → trustworthy overlap.
- **1 tier** → thin; flagged for a second tier or accepted with a reason.
- **0 tiers** → gap; recorded as a gap finding in the catalog.

### Persona axis — comprehensive, no assumptions (principal's call)

Every surface is walked as **all four travelers** (Jonathan / Helen / Aurelia / Rafa). For this first run, **no surface is assumed persona-invariant.** The theme bug proves that "this one's probably the same for everyone" is exactly the assumption that ships bugs. After this run, with the matrix populated, persona-invariance can be *recorded as a finding* ("verified identical across all four") rather than *assumed up front* — but the first pass earns that knowledge by walking it.

### Surfaces and states — enumerated in Phase 1

The authoritative surface and state list is **[ground in Phase 1]** — the audit reads the app and enumerates them rather than this spec guessing. Illustrative, non-authoritative surfaces: trips index, trip view, stop detail, photos grid, lightbox, all-photos cross-trip, Claude-in-app chat, Claude confirm/settings cards, new-trip flow, trip-settings edit, share-in paste, dispatch composer, profile/settings, archived-trip view, leave-when/logistics surface.

### Living, not one-shot (principal's call)

The matrix is **updated by the capture phase** and **checked before any future feature** — it is the durable map, not a one-time output. It extends the `TEST_STRATEGY_SPEC.md §4` "milestones bring their own coverage" model: a milestone updates the matrix cells it touches (§7).

---

## 4. The tiers (each bounded; described by reach and overlap, not rank)

Existing tiers (from `TEST_STRATEGY_SPEC.md §2`) carry forward unchanged in role. New tiers below. None is primary.

| Tier | Reaches (its unique angle) | Overlaps | Bound |
|---|---|---|---|
| **Simulator** | Real iOS WebKit rendering; the persona/theme matrix on a real engine | Playwright (DOM), Chrome (live), axe (render) | render correctness per surface×persona; not pixel-fidelity scoring |
| **Playwright** (both projects) | Deterministic DOM: flow, exits, navigation, mode/state | Sim, axe (focus/exit), security (sanitized render) | the assertions the feature needs; not exploration |
| **axe-core** (NEW) | a11y: contrast, labels, focus traps, keyboard dead-ends | Playwright/navigation (focus-trap = exit bug); sim (contrast) | WCAG-class automated findings; not a manual a11y audit |
| **Claude-in-Chrome** | The **live deployed** site — does the shipped app behave in the wild | every tier, as a production cross-check | live-site confirmation of findings; not a substitute for logic tests |
| **Dev-log + worker logs** (instrument) | Silent / swallowed failures underneath the visual & DOM layers, during *any* walk | every walking tier | capture channel, on during walks; harvested, not new behavior |
| **Static / dead-code** (NEW) | Structural gaps nothing that walks live code can see — orphaned/half-built surfaces, dead routes, the known stale root-level `index.html`/`sw.js` | — (reaches what walking can't) | reachability/dead-code; not a full lint-rule project |
| **Security** (NEW) | Auth boundary, no-secret-in-bundle, render sanitization — see §5 | Playwright (sanitized render), worker tests (auth) | the three properties the app relies on; not a pentest |
| **Human (Jonathan)** | Only what no tier reaches: real-device-physical residue (memory ceiling, thermal, standalone-PWA back gesture, Universal-Links handoff) + **triage** | — | milestone-closeout + device residue + triage decisions; never a bug-hunt |

The instrumentation tier is the one to underline: the **dev-mode upload log (`rt_upload_log_v1`)** and **worker logs (`wrangler tail` / dashboard)** are already built. Turned on during every walk, they catch the class where the UI looks fine but a save queued silently or the worker rejected something. They cost nothing new — they get *harvested* into the catalog rather than left to be noticed.

---

## 5. Security: the new tier and the standing gate

Two distinct things, both concrete to this app.

### The security *tier* (capture, runs in the matrix walk)

Three checks, each guarding a property the app already relies on:

1. **No-secret-in-bundle.** A build-time assertion (the same shape as the anti-sync-disabled grep already in the client pipeline) that scans the built bundle and **fails the deploy** if a real backend secret appears. Critical distinction: `VITE_FAMILY_TOKEN_*` and `VITE_WORKER_URL` are **client-public by design** (established when the client pipeline was built) and are *allowed*. `GOOGLE_PLACES_API_KEY`, any Cloudflare token, any worker-only secret must **never** ship to the client. The check is an all-list (the known VITE_ public values) + a deny-scan for secret-shaped strings and the known backend key patterns. **[ground in Phase 1: the exact set of "must-never-ship" secrets and their patterns.]**

2. **Auth boundary.** Worker-layer tests (miniflare, the existing scaffold) asserting that endpoints require the family token and **reject requests without it.** The regression this guards: a *new* endpoint added during a future feature that forgets the auth check. **[ground in Phase 1: the current auth mechanism and which endpoints enforce it — read before asserting.]**

3. **Render sanitization.** Assertions that user-controlled strings — trip names, stop notes, Claude-in-app message content, pasted share-in content — render **escaped, not executed.** This is why the `react-markdown` (locked) → `marked + dompurify` drift is a *security* item, not a style one: an unsanitized markdown path is an XSS vector. The sanitization check overlaps the markdown-library rollback already pending. **[ground in Phase 1: every surface that renders user/model-supplied strings.]**

### The open question (principal's ground truth, or Phase 1)

**Are the four family tokens scoped to per-traveler data, or do all four see the whole family's data?** This determines whether **persona isolation** is a real security boundary (token A must not read B's private data) or only a theme/content concern. This spec does **not** assume an answer — it is a seam for the principal's ground truth or a Phase-1 read. If isolation is a real boundary, it becomes a fourth security check; if all tokens are family-wide by design, persona stays purely a UI axis and this check is dropped.

### The security regression *gate* (runs as features ship)

Folds into `TEST_STRATEGY_SPEC.md §4`. A milestone is not done until — in addition to its UI and functionality coverage — the three security checks pass for anything it touches: the bundle still ships no backend secret, any new endpoint enforces auth, any new user-string render is sanitized. This is the "no security regression" half of the principal's requirement. UI-regression and functionality-regression are already gated by the existing tiers (visual baselines + sim; Playwright + worker tests); security is the gate that did not exist.

---

## 6. The three phases — independently shippable

### Phase 1 — Audit + build the matrix (read-only)

Code reads the app and produces:
- the authoritative **surface × state** enumeration,
- the **coverage matrix** (`COVERAGE_MATRIX.md`) with every cell tagged by which tier *can* reach it (not yet walked — capability, not results),
- confirmation and root-cause of the known bugs (theme-per-persona, missing new-trip exit, suspected navigation) and whether each is isolated or a class,
- the **grounding** for §4/§5: current auth mechanism, the must-never-ship secret set, every user-string render surface, the persona-isolation answer,
- a **build-list**: which tiers need constructing before capture can run (see Phase 2).

Read-only. No fixes, no test-writing, no commits beyond the matrix document itself. **Done =** the matrix exists as a committed living document, the known bugs are root-caused, and §4/§5's grounding seams are closed. Useful alone: it is the map even if nothing else is built.

### Phase 2 — Build the missing tooling (each ships independently)

The tiers that do not yet exist for this purpose. Each is one shippable piece; light verification only (principal's call — see below):

- **Persona-parameterized Simulator harness.** The sim currently seeds a fixed persona; this parameterizes it to drive all four travelers and capture a screenshot per surface×persona. This is the spine of the comprehensive-persona walk. *(Real build, not a config flag.)*
- **axe-core integration** into the Playwright run — a11y findings on every walked surface.
- **Dead-code / reachability scan** — orphaned surfaces, dead routes, the known stale root files.
- **Instrumentation harvest** — a way to *collect* the dev-log and worker-log output produced during a walk into the catalog, rather than leaving it to be eyeballed.
- **Security tier** — the no-secret-in-bundle build assert (extends the existing pipeline assert), the auth-boundary worker tests, the sanitization assertions.

**Light verification (principal's call):** each tool is verified just enough to trust it — the persona harness runs green and produces the four-persona screenshot set; axe produces output on a known-bad surface *and* a known-good one; the secret-scan fails on a planted secret and passes clean; the dead-code scan flags the known stale root files. **Not** a full test suite for the instruments — over-testing the instruments is the recursion the kill-criterion forbids. **Done =** each tool runs and its light-verification passes; tools land independently.

### Phase 3 — Execute the capture, populate the catalog

Run every tier across the matrix, overlaps intact, instrumentation on. Each writes findings into `KNOWN_BUGS` (real-vs-test, severity, reproducer, which-tiers-caught-it) and updates the matrix cells (tiers walked, states covered, findings). Output:
- the **populated catalog** — the legible pile, triage-ready,
- the **filled matrix** — where coverage actually landed vs. where gaps remain,
- the **short device-only residue** for the principal — only what no tier could reach.

**Done =** the catalog is populated, the matrix is filled, the residue list is handed over. Then the principal triages — severity and fix order are decisions, and they are the principal's.

---

## 7. How features ship into this afterward (extends `TEST_STRATEGY_SPEC.md §4`)

Once the system exists, every milestone:
- brings UI coverage (visual baseline / sim per surface×persona for surfaces it adds),
- brings functionality coverage (Playwright; worker-layer tests — no shipping worker code on a vacuous green),
- passes the **security regression gate** (no backend secret in bundle; new endpoints enforce auth; new user-string renders sanitized),
- **updates the coverage matrix** for the cells it touches — the matrix stays current as the durable map,
- runs the narrow human checkpoint (milestone-closeout, platform surfaces, device residue only — never a bug-hunt).

The matrix and the security gate are the additions; the rest carries forward from the foundation.

---

## 8. Standing rules (carried forward + this spec's additions)

- **No primary catcher.** Overlapping coverage, redundancy is the strength. No tier ranked or relied on as the catch of record. (This spec's central principle — do not let it erode into a hierarchy.)
- **The matrix is living and committed.** It is updated by capture and by every subsequent feature; it is checked before new work. Not a one-shot artifact.
- "Pushed" ≠ "committed" ≠ "deployed." Distinguish in every report.
- Helen is never the tester. The kids are never testers. Jonathan is the tester only for milestone-closeout on platform surfaces and the device-physical residue — never bug-hunting. The point of this system is to shrink that residue to the irreducible.
- Repo at `~/dev/roadtrip`, off iCloud. Use absolute paths; confirm HEAD before reading. **This session has produced fabricated/garbled tool outputs more than once — re-verify any load-bearing state with a second read; never trust a single tool output for anything irreversible.**
- The parallel subagent workflow dies on an MCP schema the API rejects (`oneOf/allOf/anyOf` at top level). Work directly; do not fan out.
- Worker deploys and secrets are Jonathan's. The client pipeline auto-deploys on `app/**` push (gated on e2e); the worker pipeline gates but the deploy is Jonathan's. Distinguish which a change triggers.
- Code writes its own carryover at ~67% context to a `CARRYOVER_*.md`; this is a multi-session build, so stop at a phase or tool boundary (each independently safe) and hand off rather than pushing a half-built piece.
- Inherited bound (`TEST_STRATEGY_SPEC.md §0`): any check that must be maintained independently of the thing it guards is a side-project. Cut it or fold it back.
