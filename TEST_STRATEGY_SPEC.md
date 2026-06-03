# TEST_STRATEGY_SPEC.md

Foundation-first test infrastructure for the roadtrip PWA, built before Claude-in-app M3–M6 ship into it.

Grounded in the capability inventory and the Anthropic→Worker→client stream trace taken at HEAD `460372c`. Paths in this spec are verified against that tree: the Worker handler is `worker/src/index.js`; the client SSE consumer is `app/src/lib/claudeChat.js` (`streamClaudeChat`); card rendering is in `app/src/components/ClaudeChat.jsx`.

---

## 0. Governing rule (first principle AND kill-criterion)

**Tests check the work. They never become the shape of the work.**

Every check in this suite traces to a deliverable Helen asked for, or a regression that has already bitten this project. No check exists to explore the app's behavior for its own sake.

This is a kill-criterion, not a slogan. Any check that grows past the deliverable it guards is scope inversion and gets cut:

- The record/replay harness records a **canonical, fixed set** of request→response pairs and stops. It does not become a model-evaluation suite, a coverage matrix of phrasings, or a fuzzer.
- The iOS photo assertion checks **non-black render** and stops. It does not become a pixel-fidelity or photo-quality suite.
- The worker-layer harness asserts **translation correctness, persistence, and the truncation flag** and stops. It does not become a full Anthropic-API contract suite.

When in doubt: a test that would need to be maintained independently of the feature it guards is a side-project. Delete it or fold it back into the feature.

---

## 1. Why now, and the honest cost framing

This is **infrastructure work with real upfront cost and a compounding payoff — not a speedup.**

The first feature milestone shipping after this foundation (M3) will likely be **slower** than M2 was, because the foundation is built as its own push and M3 then ships into it. What the foundation buys is **smoother, not always faster**: fewer real-device surprises, the principal removed from the bug-hunting seat, regressions caught before they reach Helen, and — critically — no half-built harness that future milestones have to keep returning to.

The decision to go foundation-first was made under a specific condition: **no near-term trips are planned.** That removes the one real threat to a pure-infrastructure stretch — a mid-trip Helen request needing immediate delivery. With no trip on the board, a Helen request becomes a **queue item**, not an interrupt. If a trip gets scheduled mid-build, re-evaluate sequencing.

---

## 2. The four-tier model (with deliberate modest overlap)

Each tier is blind to something. The overlap is the seam-coverage that keeps a bug from falling through every net at once. The chain is designed so each link makes the next link's job smaller — so the human checkpoint is a 90-second confirmation, never a hunt.

| Tier | Engine / target | Owns | Structurally blind to |
|---|---|---|---|
| **Playwright e2e** | Bundled Chromium + bundled WebKit, dev server | Deterministic client logic & plumbing: card render, mode detection, confirm→cache, photo pipeline on the bundled engine | iOS Safari rendering reality; the real backend; model-decided output |
| **Worker (miniflare)** | miniflare — real Workers runtime, real D1 bindings | Worker SSE assembly, the 3-type dialect translation, `stop_reason`/truncation, D1 persistence | Client UI; real iOS rendering |
| **Xcode Simulator gate** | Real iOS Safari (WKWebView, real sim runtime) via safaridriver + webdriverio + node:test | The iOS bug classes — photo rendering under real decode; the only tier that reaches real WebKit | Real-device memory ceiling, thermal, Universal Links handoff (those stay human) |
| **Claude-in-Chrome (agent)** | Agent-driven real Chrome, **deployed** GitHub Pages build | Post-deploy live-site sanity: does the shipped app actually work end-to-end in the wild | Logic correctness (that's Playwright's job); iOS reality |
| **Human (Jonathan)** | Real phone | **Exactly what no tier reaches**: real-iOS Universal-Links/external-app handoff (the TikTok-Safari class), milestone-closeout smoke on platform surfaces | — |

Critical precision from the inventory: Playwright's `webkit-mobile` project is **bundled WebKit-on-macOS, NOT iOS Safari.** It is blind to the iOS-rendering bug class by construction — which is why 13 tests across 8 specs already `skip` on webkit and delegate to the sim gate. Only the Simulator gate runs real iOS WebKit.

The human checkpoint is **narrowly scoped and well-defined**: it fires at milestone closeout, only for surfaces that touch the platform, and only for the two classes no automated tier can reach (real-iOS handoff; final on-device smoke). It is never a bug-hunt.

---

## 3. The foundation — six independently-completable units

**Build order note:** these are sequenced so each reaches green on its own. An interruption (or a queued Helen request) leaves N finished units and a clean stopping point — never a half-built monolith. Units 1→2→3 have a dependency chain (scaffold → seam → worker-layer tests need both). Units 4, 5, 6 are independent and can land in any order relative to each other.

Each unit's "Done =" line is its completion gate. A unit is not done until its Done line is true and the relevant gate is green.

### Unit 1 — Worker test scaffold (miniflare)

There is no `worker/test/` directory today; `worker/package.json`'s `test` script matches nothing; the worker unit suite is empty (the standing flag from prior carryovers, now confirmed dir-absent).

Stand up a miniflare-based worker test runtime. miniflare chosen deliberately over a lighter `node:test`+fetch-monkeypatch harness: it emulates the real Workers runtime with **real D1 bindings**, so the worker-layer tests (Unit 2/4) and the D1 integration leg (Unit 6) assert against something close to production rather than mocks. This is the foundation-first, don't-revisit choice.

- Add `@cloudflare/vitest-pool-workers` (or the current miniflare-vitest integration), a `vitest.config` for the worker, and a `worker/test/` dir.
- Wire `worker/package.json`'s `test` script to actually run it.
- Seed D1 schema into the miniflare D1 binding for tests that touch persistence (the `conversations` / `conversation_messages` tables, and `trips` for Unit 6).
- **Done =** the scaffold runs, one trivial worker test passes against a miniflare-bound Worker, and `npm test` (worker) executes it. The "empty worker suite" flag is closed by this unit.

### Unit 2 — Fetch seam in the Worker's Anthropic call

The Worker calls Anthropic via a **hard-coded URL string literal** (`fetch('https://api.anthropic.com/v1/messages')` at ~`worker/src/index.js:1080`, and a second call at ~`:915`). There is no injected fetch, no base-URL env var. This is a prerequisite for any worker-layer Anthropic test, AND it is a thing worth fixing regardless — a hard-coded third-party endpoint with no injection point is a liability independent of tests.

**This is a change to the live Anthropic request path. Approved as such — it gets reviewed as its own unit.**

- Introduce a seam the test runtime can redirect: an `ANTHROPIC_BASE_URL` read from `env` (defaulting to `https://api.anthropic.com` so production behavior is byte-for-byte unchanged when the var is unset), applied at **both** call sites (`:1080` and `:915`).
- Behavior-preserving: with the var unset, the request is identical to today. Confirm via the existing deploy path that nothing about the live call changes.
- **Done =** the seam exists at both call sites, production behavior is unchanged with the var unset, and a miniflare test can point the call at a local stub. Reviewed as a discrete commit so the live-path edit is visible, not buried.

### Unit 3 — Browser-layer record/replay harness (card semantics)

This is the unit that **answers the card-semantics question that could not be resolved by inspection**: does one request produce one card with no spurious duplicates, and what shape does a multi-change request produce.

The inventory confirmed this is currently **uncovered and not feasible without net-new work** — every Anthropic reply in the suite is author-fabricated; card shape is chosen by the mock, never decided by a model. The trace confirmed the attach point: the client consumes the Worker's **3-type dialect** (`text_delta`/`done`/`error`), and the client's `parseSseBatch` path (`app/src/lib/claudeChat.js:95`) is **explicitly built for replayed non-stream SSE bodies** ("Some test harnesses replay a non-stream body"). `mockClaudeChatWorker` already proves this layer works.

- Record a **small, canonical** set of real Anthropic responses (captured once, by hand, against the real model) for the request types that matter:
  - single move
  - single cancel
  - single add
  - multi-change ("move the 11am match, cancel the 2pm, add dinner at 7")
  - a guidance-mode (non-card) reply
- Store them as client-facing fixtures (the recorded `text_delta` text + terminal `done`), replayed via `page.route` in the dialect the client already consumes.
- Assert, against the **replayed-but-model-authored** card output:
  - single-change request → **exactly one** `<ConfirmCard>` (`toHaveCount(1)` — note: the only existing count assertion is on create_trip supersede; add/move/cancel currently assert visibility but NOT count, so duplicate-prevention is unverified for them today).
  - multi-change request → assert the actual shape the model produces (one `multi` card carrying `edits[]`, vs. N separate cards). **The spec does not pre-decide which is correct** — the test pins whatever the recorded canonical response actually yields, so the behavior is locked and regression-guarded going forward. If the recorded shape surprises us, that surprise is itself the finding.
- **Bounded:** canonical pairs only. Not a phrasing matrix, not model evaluation. (Governing rule.)
- **Done =** the canonical fixtures exist, card count/shape is asserted against model-authored output, single-change duplicate-prevention is pinned for add/move/cancel, and the suite is green.

### Unit 4 — Worker-layer harness (the `stop_reason` / truncation gap)

The trace established the decisive architecture fact: **the Worker re-emits rather than passes through.** It parses Anthropic's native SSE, translates to the 3-type dialect, assembles text, and persists to D1 — all in `worker/src/index.js:~1117–1192`. A browser-layer fixture (Unit 3) is authored in the Worker's *output* dialect and therefore **cannot test any of this.** The two layers are complementary and meet exactly at the Worker's emitted-frame boundary — which is the line the `stop_reason` gap sits behind.

The truncation gap (standing flag across multiple carryovers): the `message_delta` branch (~`:1155`) reads only `event.usage.{input,output}_tokens` and **never inspects `event.delta.stop_reason`.** A reply hitting the 8192 ceiling emits a normal `done` and persists truncated text with nothing flagged. M2+ is conversational; long replies are exactly where the cut lands.

Using Unit 1's miniflare scaffold and Unit 2's fetch seam:

- Fixtures here contain **native Anthropic SSE** (`message_start` → `content_block_delta`/`text_delta` → `message_delta` with `usage` **and `stop_reason`** → `message_stop`) — because the point is to exercise the Worker's own parse/translate/assemble/persist loop.
- Assert:
  - the Worker correctly translates native SSE → the 3-type dialect the client expects.
  - assembled text is persisted to D1 (real miniflare D1 binding).
  - a fixture with `stop_reason: "max_tokens"` is **detected and surfaced** — into the `done` frame and/or the D1 row. **This requires implementing the detection that does not exist today** (the gap closes as part of this unit, not just gets tested). Define the surfaced shape: at minimum a `truncated: true` flag on the `done` frame.
- **Bounded:** translation correctness, persistence, truncation flag. Not a full Anthropic contract suite.
- **Done =** native-SSE fixtures drive the handler under miniflare, translation + D1 persistence are asserted, AND `stop_reason: "max_tokens"` is detected and surfaced (gap closed + tested). The standing truncation flag is resolved by this unit.

### Unit 5 — Sim-gate photo-injection (the founding bug class)

The bug-trap exists **because** of this class: real photos (2.6–5MB, 4032×3024 / 5712×4284) blew the iOS per-tab graphics budget at the volleyball tournament and rendered black — a bug headless Chromium structurally could not see. The inventory confirmed this class is **still uncovered**: visual-baselines use a 1×1 synthetic data-URL on bundled WebKit; the sim gate displays a *video* preview, never a real full-res *photo* with a non-black assertion.

The Simulator gate is the **only** tier that reaches real iOS WebKit, and it already proves it can drive the app interactively (boot → navigate → inject a real .mov via `fetch(/@fs/…)`+DataTransfer → assert). Extend it to photos.

- New sim spec (`app/tests/simulator/photo-render.test.mjs` or similar) following the existing `video-encode.test.mjs` pattern: seed a trip, navigate to a photo surface, inject **real full-resolution photo bytes** (an actual large JPEG fixture, not a synthetic data-URL).
- Assert **non-black render**: sample rendered pixels (canvas readback or equivalent) and assert the image area is not uniformly black/blank. This is the assertion the project has never had.
- Gate on fixture presence like the video test does (skip cleanly if the LFS photo fixture is absent — see LFS note below).
- **Bounded:** non-black render. Not pixel-fidelity, not photo-quality scoring. (Governing rule.)
- **Done =** the sim spec injects a real full-res photo, asserts non-black render on real iOS WebKit, and passes (or skips cleanly with the fixture absent). The founding bug class moves from "human notices on phone" to "harness catches every run."

### Unit 6 — The one D1 integration leg (confirm → D1), with escalation tripwires

The M2 card flow asserts confirm→**localStorage** with the `/trips` worker push mocked (404/200). The "lands in D1" leg — the actual point of the feature, persisting Helen's edits to the real backend — is **never exercised.**

Add **one** thin integration test using Unit 1's miniflare scaffold + real D1 binding: a confirmation-card confirm drives a real `/trips` write and the round-trip is asserted (the change is actually in D1, read back, not assumed).

**This is deliberately one test, not a real-backend suite.** Per the standing decision, watch for the failure modes that signal we underbuilt and need the bigger thing. **Escalation tripwires — if any of these fire, the one-test approach is exhausted and a real-backend integration suite is warranted:**

- The single test starts needing **per-case backend state setup/teardown** to stay isolated (signals the happy-path-only design is fighting reality).
- A **D1 write bug ships** that this happy-path test structurally could not see — specifically: concurrent-write races, partial-write failures, or the **soft-delete/tombstone path** (recall: the data-cleanup work went through the soft-delete door deliberately; that path has logic the happy path won't touch).
- Confirm→D1 grows **branches** (multi-edit transactionality, rollback-on-partial-failure) that one test can't cover without becoming several.

Document these tripwires in the test file itself, so the next person knows the difference between "the one test is fine" and "we've hit the bigger thing."

- **Done =** one integration test drives confirm→real-D1 and asserts the round-trip; the escalation tripwires are documented in-file.

---

## 4. After the foundation — how M3–M6 ship into it

Once the six units are green, each subsequent milestone **brings its own bounded coverage** into the finished harness — the way M2's confirmation cards were supposed to bring their own journeys and baselines. A milestone is not done until:

- its new surfaces have Playwright coverage for deterministic behavior,
- anything it adds to the Claude reply/card path is pinned by a canonical record/replay fixture (Unit 3 pattern),
- anything it adds to the Worker is covered by worker-layer tests (Unit 4 pattern) — **no shipping worker code on a vacuous green** (the standing rule),
- anything platform-touching gets a sim-gate assertion (Unit 5 pattern) where the bug class is iOS-reachable,
- the human checkpoint (narrow, milestone-closeout, platform surfaces only) is run.

The harness is finished infrastructure; milestones add coverage as part of their own scope, never as a separate "go back and test it" pass.

---

## 5. Carried-forward flags this spec touches

- **Git LFS:** the `~/dev/roadtrip` clone warned on an LFS-tracked `.mp4` ("should have been a pointer, but wasn't"). Units 5 and the existing video-encode test depend on LFS media fixtures. **Verify LFS is initialized in `~/dev/roadtrip` before Unit 5** — otherwise a real-photo fixture may be a pointer stub, and the test fails on missing bytes looking like a code bug. Cheap check, do it first.
- **Worker deploy + `CALENDAR_IMPORT_TOKEN`:** still Jonathan's, still pending from the calendar-pull removal — independent of this spec, noted so it isn't lost.
- **M2:** closed. Single-card behavior confirmed. This spec is the harness M3 ships into.

---

## 6. Standing rules (carry forward)

- "Pushed" ≠ "committed" ≠ "deployed." Distinguish them in every report.
- Group A bar: both Playwright projects green, visual regression diffs reviewed, affected journeys pass, Simulator gate for platform-touching surfaces. The known bundled-webkit environmental drift is not a regression.
- Helen is never the tester. The kids are never testers. Jonathan is the tester only for milestone closeouts on platform-specific surfaces — never for bug-hunting.
- Repo lives at `~/dev/roadtrip`, off iCloud. The shell cwd has been resetting to the old `~/Desktop/roadtrip`; use absolute `~/dev/roadtrip` paths and confirm HEAD before reading. Parallel tool batches have cascade-cancelled in this env — keep batches small and serial.
- Code writes its own carryover at ~67% context to a `CARRYOVER_*.md` at repo root; fresh window reads it + `DEV_ENVIRONMENT.md` first.
- Worker deploys and secrets are Jonathan's (classifier-gated). Capture version IDs from his deploy output; they don't reach Code's context.
