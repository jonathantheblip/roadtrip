# KNOWN_BUGS.md

The existing bug pile, made legible by Group A of the bug-trap
(see `BUG_TRAP_PUNCHLIST.md`). Generated 2026-05-25 from the first
full-suite run after Items A.1–A.6 landed.

**Don't fix bugs from this list during Group A.** Fixes come after
the trap is in place. For each entry: severity, reproducer
command, browser scope, and best-current-guess at root cause.

Each bug carries a `[real]` or `[test]` tag distinguishing
"the app is broken" from "the test we wrote is broken".

**Run-of-record summary:** 148 passed, 22 failed across the full
suite on Chromium + WebKit-mobile (11.5 min wall clock). Of the
22 failures: 4 were Chromium-only, 18 were WebKit-only or both —
exactly the gap pattern the trap was built to surface.

**Reproduction pass — 2026-05-25 (HEAD: `3f47e67`):** all 11
entries re-run against current main. **11/11 still reproduce as
described** — none closed by intervening commits, none partially
fixed. Per-entry status added below.

---

## A11Y-1 — axe color-contrast: themed eyebrow/muted labels + Claude panel `[real, serious]`

**Source:** the axe-core a11y tier (QA_COVERAGE_SYSTEM_SPEC §4 build-list #2),
wired 2026-05-31 at HEAD `fcf691a`. axe scans the SETTLED page (the helper
collapses entrance animation/transition durations before analyzing), at the
serious+critical WCAG-2 AA threshold. These are genuine, stable findings — NOT
the animation-transient `fade-up` artifacts (those were eliminated by the
settle step).

**Status: [real, recorded — do NOT fix now].** Folds into the M6 theme pass —
the same cycle that fixes the Claude-in-app wrong-theme bug. The axe tests
allowlist `color-contrast` on these two surfaces (referencing this entry) so the
gate stays green and still catches every OTHER serious/critical rule; Phase 3 /
M6 removes the allowlist to re-gate contrast once the palettes are fixed.

**Findings (chromium; WCAG AA needs 4.5:1 normal / 3:1 large text):**
- **Claude-in-app panel — ALL personas** (2 nodes): muted ink `#696F68` on
  linen `#F2EFE7` = **4.48:1** (just under 4.5). This is Helen's M1 panel
  palette (`T.inkMuted` in `ClaudeChat.jsx`), which every persona inherits
  because the panel is hardcoded Helen (the wrong-theme bug). axe thus
  **corroborates the theme bug from the contrast angle** — a real tier overlap
  (a11y ↔ the known Claude-in-app theme finding). Nodes: the trip-title eyebrow
  (JetBrains Mono 10px) + a message-bubble line.
- **Trips index — persona-variant** (themed mono "eyebrow" labels + muted italic):
  - **jonathan**: oxblood `#A33A2E` on near-black `#0E0F11` = **2.92:1**.
  - **aurelia**: hot-pink `#E8478C` on pale-pink `#FCE8EE` = **3.13:1**.
  - **helen**: muted `#696F68` on linen `#F2EFE7` = **4.48:1**.
  - **rafa**: clean (no serious/critical).

**Reproducer:** `cd app && npx playwright test a11y-axe --project=chromium`
(temporarily drop `allow: ['color-contrast']` in `tests/e2e/a11y-axe.spec.js`,
and/or `RT_PERSONA=<traveler>` to scan a specific theme).

**Non-vacuous:** the tier is proven to catch real violations (these) and an
injected `button-name` (critical) survives the contrast allowlist (see the
commit that added the tier).

---

## DEADCODE-1 — orphaned pre-refactor component/data/hook layer (78 files) `[real, dead-code]`

**Source:** the dead-code tier — knip (QA_COVERAGE_SYSTEM_SPEC §4 build-list #3),
wired 2026-05-31 at HEAD `14ab6a0`. Reproducer: `cd app && npm run deadcode`.
knip builds the real module graph from the production entry (index.html →
src/main.jsx → App.jsx) plus the test/script/worker entries; anything in
`src/**` not reachable is reported. Non-vacuous: the 3 known orphans appear AND
live code (JonathanView + its imports Avatar/NearbyResultsModal/FlightStatus) is
NOT flagged; spot-checks confirmed each flagged file's only importers are other
orphans.

**Status: [real, recorded — do NOT delete in this pass].** Cataloging is the
job; deletion (or restoration) is a separate triage decision.

**Root cause:** the "four refined themed views" refactor (commit `1fc7a9f`)
replaced a prior single-view design generation; the old layer it used was left
mounted-by-nothing — one connected dead subgraph (DiscoverView →
StopCard/RouteMapLazy → …; ItineraryView → NextUpCard/useVisited → …). Live views
import a different, smaller set.

**RESTORE-vs-DELETE flags (do NOT resolve here):**
- **`src/hooks/useTheme.js`** — dead (no live importer), BUT it holds the
  per-person PWA **manifest + icon + theme-color/apple-title swap** logic.
  App.jsx now sets only `data-theme` inline, so that per-person install capture
  is NOT running — a POSSIBLE silent PWA-install regression. Likely a RESTORE
  (re-wire into App), not a delete. (Its deps `src/data/themes.js`,
  `src/utils/appIcon.js` are also flagged.)
- **Map cluster** — `RouteMap.jsx`, `RouteMapLazy.jsx`, `RouteSvg.jsx`,
  `MapCard.jsx` + the unused deps **`leaflet`** + **`react-leaflet`**. A whole
  map feature went dark in the refactor. Restore-vs-delete; if delete, drop the
  two deps to shed install/bundle weight.

**Unused files (78), by dir:**
- views (1): RoadSearch.jsx
- components (37): ActualLog, AudioMemo, BottomNav, CeremonyMorningOptions,
  DayOrientationBanner, DiscoverView, DriveTimeCalculator, EmergencyFab,
  EssentialsCard, FilterBar, FlightHomeCard, GasWarning, HoustonFriday,
  ItineraryView, JonathanQueue, KennedaleDay, MapCard, MediaView,
  MondayWeatherCard, NavBar, Navigation, NextUpCard, PersonSelector,
  PodcastSection, PrepCard, RePlan, RiskWatch, RouteMap, RouteMapLazy, RouteSvg,
  ShareButton, StopCard, ThursdayDriveBox, TomorrowHeadsUp, TonightCard,
  TripView, YouTubeSection
- data (21): actualSeed, ceremonyOptions, curatedStops, essentials,
  flightScenario, gas_warnings, jonathan_podcasts, kennedale, meta, mileage,
  overnight, podcasts, preferences, prep, riskFlags, route, stops, themes,
  tripCalendar, verifiedStops, youtube
- hooks (9): useDismissed, useGeolocation, useItineraryFilters, useOnlineStatus,
  useSwipeDays, useTheme, useVisited, useWeatherPath, VisitedContext
- utils (10): actualLog, appIcon, driveTime, filterStops, navLinks, quickSearch,
  riskWatch, scoreStop, share, tripDay

**Unused dependencies (2):** `leaflet`, `react-leaflet` (the dead map cluster).

**Unused exports (21)** — exported but imported nowhere, in OTHERWISE-LIVE files
(dead exports; lower severity than dead files): ClaudeChat.jsx `ClaudeMark`,
`ClaudeLockup`; claudeChat.js `createConversation`; flightStatus.js
`airlineStatusUrl` (also a duplicate-export alias of `flightAwareUrl`);
icsExport.js `buildIcs`; leaveWhen.js `clearLeaveWhenCache`; memAssets.js
`deleteAsset`; memoryStore.js `loadOwnMemoryForStop`; openState.js `formatTime`;
photoBackfillUpload.js `mergeRefIntoExisting`; photoEntries.js `refUrl`;
photoPipeline.js `PHOTO_MAX_EDGE`, `PHOTO_JPEG_QUALITY`, `validatePhotoFile`,
`readExif`, `downscaleImage`; uploadQueue.js `list`, `remove`, `update`,
`clear`; whisper.js `transcribeAudio`.

**Noise / not-real (documented, not findings):**
- Unresolved import (1): `tests/e2e/photos-auto-downscale.spec.js` does
  `import('/src/lib/memAssets.js')` (absolute-path dynamic import — a DEV-only
  test hook, ref KNOWN_BUGS R2); knip can't resolve it. Harness pattern, not
  dead code.
- Config hints (4): knip flags `src/main.jsx` / `vite.config.js` /
  `playwright.config.js` as redundant entries (it auto-detects them) + a generic
  "78 unused files — add an entry?" nudge. The redundant-entry hints are
  cosmetic; the "add entry" nudge is a FALSE alarm here (the 78 are verified
  genuinely dead, not a missing-entry artifact). Config left explicit for
  clarity.

---

## Phase 3 — Slice C1: themed spine (S1 Trips index · S2 Trip home · S3 Stop detail) `[capture log]`

**Walked 2026-05-31, HEAD `d107f77`, all 4 personas** (jonathan/helen/aurelia/rafa).
**Tiers run (existing only, per the Phase-3 scope call):** pw (smoke + visual-baselines),
axe. instrument N/A — read-only surfaces emit no `rt_upload_log_v1` entries. sim:
existing specs don't walk the spine per-persona (see C1-GAP-3).

**Result: NO new `[real]` bugs on the themed spine.** S1 + S2 theme correctly across
all four personas; the Claude-in-app wrong-theme bug stays bounded to its surface
family (C2 — O1/O2), NOT the trip view. Inherited **A11Y-1** (contrast) reproduces and
is the only spine finding — allowlisted, deferred to M6.

**Confirmations (non-vacuous, real runs):**
- **S1 axe ×4 — all green** at serious+critical (color-contrast allowlisted to A11Y-1).
  Closes a real hole: **Aurelia + Rafa trips-index a11y were zero-coverage pre-Phase-2**
  (axe defaulted jonathan); now scanned, nothing serious/critical beyond known contrast.
  Repro: `RT_PERSONA=<p> npx playwright test a11y-axe --project=chromium -g "trips index"`.
  Tiers caught: axe.
- **S2 visual ×4 — all green** vs committed per-persona baselines (`trip-{persona}.png`)
  → the themed trip view renders correctly per persona. Repro: `npx playwright test
  visual-baselines --project=chromium -g "themed trip view"`. Tiers caught: pw(visual).
- **S1 boot** (smoke, jonathan: app boots → lands on `volleyball-2026` → 4-traveler
  switcher renders) + **S1 trips-list** visual (helen) — green.

**Gaps recorded (capability ≠ walked — these ARE Phase-3 outputs per spec §3):**
- **C1-GAP-1 `[gap, S3 Stop detail]`** — **zero walked coverage.** No existing spec
  renders the `stop` view (`StopDetail`); axe/visual/sim none wired. Capability says
  pw/sim/ax/chrome can reach it; nothing does. Close with a stop-detail render+axe walk
  (spec-authoring — deferred to triage per the Q2 scope call).
- **C1-GAP-2 `[gap, S2 contrast]`** — axe is wired on trips-index + the Claude panel
  ONLY, not the trip-view body; per-persona WCAG contrast on S2 is unmeasured (the
  visual ×4 covers layout/theme, not contrast ratios). Close by extending a11y-axe to S2.
- **C1-GAP-3 `[gap, sim spine]`** — existing sim specs don't render the spine
  per-persona on real iOS (`smoke.test.mjs` is persona-agnostic plumbing at `:5181`;
  photo-render/offline-drain/video-encode are photos/C3). Booted iPhone 17 / iOS 26.5
  is available; a persona-parameterized spine sim spec would close it (deferred).

---

## Phase 3 — Slice C2: Claude family (O1 panel · O2 confirm cards, 6 types) `[capture log]`

**Walked 2026-05-31, HEAD `21425f9`, all 4 personas.** Tiers run (existing only): pw
(claude-* behavior specs), axe (panel, persona-aware), security (render-xss + markdown
guard), instrument (harvestDevLog — see C2-GAP-1). **C1 proved the rest of the spine
themes correctly per-persona; C2 confirms the wrong-theme bleed lives HERE, at its source.**

### P3-01 — Claude panel + cards render Helen's hardcoded palette for ALL personas `[real, S2 — deferred M6]`
- **Surface×persona:** O1 (`ClaudeChatPanel`) + O2 (`ConfirmCard`, all 6 card types) ×
  **jonathan / aurelia / rafa** (helen renders correct *by coincidence* — it IS her palette).
- **Direct evidence (code = source of truth for what renders):** both files define a
  module-level `const T` = Helen's linen/sage palette — `ClaudeChat.jsx:43-54`
  (`bg #F2EFE7`, `ink #15201A`, `inkMuted rgba(21,32,26,0.62)`, `accent #2E5D3A` sage) and
  `ConfirmCard.jsx:27-48` ("Helen's linen palette (duplicated from ClaudeChat.jsx)").
  Applied via **inline styles only**, with **no read of `data-theme`/persona/CSS-vars**.
  S1/S2 theme via `data-theme` CSS vars (C1, green ×4); O1/O2 bypass that entirely →
  jonathan/aurelia/rafa get Helen's colors inside their otherwise-correctly-themed app.
  Comments name it: *"Helen's linen palette is the M1 default for everyone — Jonathan's
  dark-editorial skin lands in M6."*
- **What SHOULD render** (the per-persona themes the spine already uses, per A11Y-1):
  jonathan dark-editorial (oxblood `#A33A2E` on near-black), aurelia hot-pink
  (`#E8478C`/`#FCE8EE`), rafa his own palette, helen linen. The panel renders helen's for all.
- **Tiers caught:** code-read (direct render evidence) + **axe** (A11Y-1: panel **4.48:1 =
  `T.inkMuted` over `T.bg` for ALL personas** — the contrast symptom corroborates the
  render bug; tier overlap a11y ↔ theme). Cross-ref **A11Y-1**.
- **Reproducer:** `RT_PERSONA=jonathan npx playwright test a11y-axe --project=chromium -g
  "Claude-in-app panel"` (drop the `color-contrast` allow to watch Helen's 4.48:1 fire
  under jonathan); or read `ClaudeChat.jsx:43` / `ConfirmCard.jsx:29`.
- **Non-vacuous:** C1 proved the rest of the app themes correctly per-persona, so this is a
  real *localized* outlier, not a global theming failure. **DO NOT FIX — M6** rewires the
  panel/cards to read `TRAVELERS[persona].theme` instead of the hardcoded `T`.

### Confirmations (green, real runs)
- **O1/O2 behavior — 22 passed** (pw, chromium): all 6 card types + panel states (entry,
  stream, past-convo list, error, mode-shift, apply-failure-plain-language). Behavior is
  persona-invariant by design — the bug is purely visual/theme, **not logic**. Tiers: pw.
- **Render sanitization PASSES on its home surface:** `security-render-xss` green (model
  HTML renders inert — no element, no execution, escaped); `markdown-path-guard` 4/4 (no
  XSS-capable imports, react-markdown present, no `rehype-raw`). Tiers: security(render).
- **axe panel ×4 — all green** (serious+critical, contrast allowlisted). Panel was
  axe-scanned jonathan-only pre-Phase-2; **helen/aurelia/rafa panel a11y now scanned, clean.**
  Tiers: axe.

### Gaps recorded
- **C2-GAP-1 `[gap, O2 instrument]`** — instrument-harvest not wired on the Claude card
  surface. `ConfirmCard` logs to the dev-log on apply-failure (`ConfirmCard.jsx:1063`), but
  the only existing harvest spec (`instrumentation-harvest.spec.js`) walks photos, not cards.
  On the successful behavior walk the failure-only dev-log stayed empty (no silent failures).
  Close by harvesting during a card-apply-failure walk (spec-authoring — deferred per Q2).

---

## Phase 3 — Slice C3a: Photos browse & triage (S8 Photos · S9 All-photos · O7 Lightbox · O8 Backfill) `[capture log]`

**Walked 2026-05-31, HEAD `dc5fc3b`, all 4 personas** (jonathan/helen/aurelia/rafa).
**Tiers run (existing only):** pw (chromium + webkit-mobile — the dual-engine bug trap),
**sim** (real iOS WebKit, `photo-render`), visual baselines (per-persona). axe = GAP (see
C3a-GAP-1). instrument N/A — render surfaces perform no upload, so the failure-only
`rt_upload_log_v1` emits nothing by construction (the instrument hot zone is the dispatch/
upload flow → C3b). This is the **render/display half** of C3; the dispatch/upload/encode
half (O3 + S8 write-states) is **C3b** (not yet walked).

**Result: NO new `[real]` bugs on the photos browse/render half.** S8 album + S9 all-photos
**theme correctly across all four personas** (per-persona visual baselines ×4 green on BOTH
engines) — the Claude-in-app wrong-theme bug (**P3-01**) stays **bounded to O1/O2**, it does
NOT extend to the photos surfaces (the C3a analogue of C1's spine result). O7 lightbox + O8
backfill-triage green both engines. Latest finding ID unchanged at **P3-01**; C3b (the
upload/encode hot zone, where R1–R6 / J-series lived) is where **P3-02+** is likely.

**Confirmations (non-vacuous, real runs):**
- **S8 Photos — pw both engines green.** chromium **45/45** + webkit-mobile **45/45** across
  the render specs (`photos-view`, `-lazy-load`, `-multi-photo-tile`, `-capturedAt`,
  `-lightbox-swipe`). **Per-persona theme: `album-{jonathan,helen,aurelia,rafa}` visual
  baselines ×4 green on chromium AND webkit-mobile** → the album themes correctly per
  persona, no hardcoded-palette bleed. Repro: `cd app && npx playwright test photos-view
  visual-baselines -g "photos album" --project=chromium` (and `--project=webkit-mobile`).
  Tiers caught: pw(behavior+visual).
- **S8 Photos — sim real-iOS render NON-BLACK.** `photo-render.test.mjs` injected the real
  2.8 MB / 4032×3024 iPhone JPEG into the dispatch preview on booted **iPhone 17 / iOS 26.5**;
  the luma readback cleared the non-black thresholds → the **founding black-photo bug class
  does NOT reproduce**. Repro: vite on :5181 + `node --test
  tests/simulator/photo-render.test.mjs` (~10s). Persona helen (RT_PERSONA-parameterizable;
  the non-black readback is persona-invariant). Tiers caught: sim.
- **S9 All-photos — pw ×4 green both engines.** Cross-trip aggregation (`all-photos.spec.js`,
  4 tests) + **per-persona theme `all-photos-{persona}` visual ×4 green** both engines.
  Repro: `npx playwright test all-photos visual-baselines -g "all-photos cross-trip"`.
  Tiers caught: pw(behavior+visual). **Scope fence:** the back→trip-blank nav edge
  (`COVERAGE_MATRIX` §5) is **C4's to confirm** (Jonathan's standing call) — NOT walked here.
- **O7 Lightbox — pw green both engines.** `photos-lightbox-swipe.spec.js` (swipe L/R/down +
  jiggle-rejection) green on **webkit-mobile too** → confirms **R1 [resolved]** holds (the
  base-Event swipe bypass still works on the iOS engine); `lightbox-multi` visual green.
  Tiers caught: pw(swipe+visual); sim (via the photo-render decode/preview path).
- **O8 Backfill triage — pw green both engines, NOT a gap.** `reconcile-archive.spec.js`
  renders the real `PhotoBackfillTriage` (Trip settings → import → triage list:
  Happened / No-photos / Added / interstitial → refine → didn't-happen → save → archive →
  re-edit); only the EXIF data seam (`__RT_BACKFILL_EXIF` → `readExifWithTestOverride`) is
  stubbed. **3/3 green chromium + webkit-mobile** (no R4 skip needed — its mocked-200 save
  path doesn't trip the IDB+Blob enqueue). This **overturns the Phase-1 audit's "O8 has no
  coverage"** — an existing spec reaches it. Repro: `npx playwright test reconcile-archive`.
  Tiers caught: pw. Persona: **helen-pinned** (see C3a-GAP-2).

**Gaps recorded (capability ≠ walked — these ARE Phase-3 outputs per spec §3):**
- **C3a-GAP-1 `[gap, S8/S9/O7/O8 axe]`** — **axe reaches no photos surface.**
  `a11y-axe.spec.js` scans only trips-index (S1) + the Claude panel (O1); per-persona WCAG
  contrast across the entire photos cluster is unmeasured (the visual ×4 covers theme/layout,
  not contrast ratios). Same shape as **C1-GAP-2** (S2). Close by extending a11y-axe to the
  photos surfaces (spec-authoring — deferred to triage).
- **C3a-GAP-2 `[gap, O8 persona]`** — O8 `PhotoBackfillTriage` is walked **helen-only**:
  `reconcile-archive.spec.js` hardcodes `?person=helen` (it does NOT ride the
  RT_PERSONA-parameterized `withTrip` fixture). J/A/R triage is not separately walked. The
  triage logic is persona-invariant (like the cards), so low-risk, but the per-persona theme
  of the triage UI is unverified. Close by persona-parameterizing reconcile-archive (deferred).

**Deferred to C3b (the hot zone — NOT walked here):** O3 Dispatch composer; S8 write-states
(uploading / offline / dispatch-open); sim `video-encode` (WebCodecs) + `offline-drain`
(IDB+Blob); **instrument `instrumentation-harvest` in COLLECT** (the upload-log hot zone). The
inherited WebKit gates (R3/R3c WebCodecs, R4/R5/R6/R2/J-series IDB+Blob) live on those C3b
specs — C3b **confirms, does not re-litigate** them.

---

## Phase 3 — Slice C3b: Photos dispatch/upload/encode — the HOT ZONE (O3 Dispatch · S8 write-states) `[capture log]`

**Walked 2026-05-31, HEAD `effb967`.** The dispatch/upload/encode hot zone where R1–R6 +
the J-series lived — the highest-likelihood-of-findings slice. **Tiers run (existing only):**
pw (chromium + webkit-mobile dual-engine bug trap), sim (real iOS WebKit — `video-encode`
WebCodecs + `offline-drain` IDB+Blob), instrument (`instrumentation-harvest` in COLLECT), +
the **source-of-truth code-read** that reaches what the pw tier structurally cannot.

**Result: NO new `[real]` bug. Latest finding ID unchanged at P3-01.** The finding most likely
here — a per-persona wrong-theme bleed in the dispatch composer / sync-pill (same mechanism as
P3-01) — was **cleared at the source**. P3-01 stays bounded to the O1/O2 Claude family; it does
NOT extend to dispatch/upload (the C3b analogue of the C1-spine + C3a-photos-browse results).

### THE headline — O3 composer + S8 sync-pill theme correctly per-persona (code-read clears the pw tier's blind spot)
- **Why a code-read was load-bearing:** the six pw write-state specs (`photos-dispatch` /
  `-offline` / `-video` / `-auto-downscale` / `-screenshots-m2` / `-screenshots-m4`) are
  **helen-pinned** — every `page.goto()` hardcodes `?person=helen` and selects the
  `helen-photos-entry` testid, **overriding** the RT_PERSONA-parameterized `withTrip` seed
  (`?person=` resolves first, `App.jsx:78`). Confirmed empirically (walk-step-0):
  `RT_PERSONA=aurelia npx playwright test photos-dispatch -g "happy path" --project=chromium`
  **passed as helen** (matched `helen-photos-entry`, did NOT re-personalize). So a green pw run
  is **not** evidence of correct per-persona theming — it's the tier being **blind** to J/A/R
  (same shape as C3a-GAP-2 / C2-GAP-1). **This corrects the C3b carryover**, which claimed these
  specs ride RT_PERSONA ×4; they do not.
- **Direct evidence (code = source of truth for what renders):** `AddDispatchModal.jsx` (O3)
  styles every chrome surface with **CSS theme vars** — `var(--bg)` / `var(--text)` /
  `var(--accent)` / `var(--muted)` / `var(--border)` / `var(--card)` (e.g. `:430-431`, `:566`,
  `:823-824`); the only literals are intentional & persona-invariant (`#000` photo/video
  letterbox `:713`, `#fff` text on the accent button, `#1A1614` native `<option>` text). The
  **SyncPill** (`PhotosView.jsx:262-295`) is likewise CSS-var-driven (`border var(--accent)`,
  `color-mix(… var(--accent) …)`, `color var(--text)`). **NO module-level `const T`
  Helen-palette block** like `ClaudeChat.jsx:43` / `ConfirmCard.jsx:27`.
- **Verdict:** O3 + S8 write-states **theme correctly per-persona → no P3-02.** The J/A/R
  write-state walk gap (**C3b-GAP-1**) is **BENIGN** (unwalked, not buggy). Cross-ref **P3-01**
  (the bounded Claude-family outlier this confirms does NOT generalize to dispatch/upload).

### Confirmations (non-vacuous, real runs)
- **pw dual-engine — chromium fully green; all inherited gates fire as characterized.**
  `photos-dispatch` / `-offline` / `-video` / `-auto-downscale` / `-screenshots-m2` /
  `-screenshots-m4` + `instrumentation-harvest`: **35 passed / 11 skipped / 0 failed** (47s).
  chromium **22/22 runnable green** (1 skip = `photos-video:43` encode → **R3c** chromium leg).
  webkit-mobile **13/13 runnable green**, 10 gated skips, each on its documented project for its
  documented reason: auto-downscale ×3 (**R2**), dispatch sync-pill ×2 (**R6**), offline ×2
  (**R4**), m2 sync-pill ×1 (**R5**), m4 sync-pill ×1 (**R5**), video encode ×1 (**R3c** webkit
  leg). **No drift — confirms, does not re-litigate.** Repro: `cd app && npx playwright test
  photos-dispatch photos-offline photos-video photos-auto-downscale photos-screenshots-m2
  photos-screenshots-m4 instrumentation-harvest --reporter=list`. Tiers caught: pw.
- **instrument COLLECT — only the expected by-design trace, no unexpected codes.**
  `instrumentation-harvest` green both engines: clean walk → empty `rt_upload_log_v1`; a silent
  video-into-photo-input → `harvestDevLog` captures the **Bucket-A `is-video`** swallow the UI
  hid. That single trace is `[test/by-design]` (the modal silently resets to the picker per
  spec §3), NOT a new `[real]` finding; a new finding would be an *unexpected* code — none
  surfaced. `expectNoSilentFailures` deliberately NOT wired as a gate across the photo specs
  (COLLECT, not assert). Tiers caught: instrument.
- **sim real-iOS — both pass on booted iPhone 17 / iOS 26.5.** `video-encode` (1 pass, 13.8s):
  WebCodecs encode runs end-to-end → `dispatch-preview-video` visible — iOS-real coverage for
  **R3/R3c**. `offline-drain` (1 pass, 13.4s): sync-pill "1 syncing" from a populated IDB queue
  — iOS-real coverage for **R4/R5/R6**. Persona helen (RT_PERSONA-parameterizable but assertions
  persona-invariant — cross-persona spot-check OUT per the approved plan). Repro: vite on :5181
  (`--strictPort`) + `node --test tests/simulator/video-encode.test.mjs` /
  `…/offline-drain.test.mjs`. Tiers caught: sim.
  - **Ops note (NOT an app finding):** the first sequential sim attempt **double-failed** —
    `video-encode` modal never opened + `offline-drain` IDB-inject `execute/sync` hung ~127s
    (the leftover-blocked-`indexedDB.open` mode the spec comment `:63-64` warns about). A
    `simctl shutdown && boot` cleared it; both passed clean. **Takeaway: boot the sim clean per
    sim-run; don't chain sessions.** The `GET /session/…/context` webdriver ERROR is benign —
    present on the passing runs too.

### Gaps recorded
- **C3b-GAP-1 `[gap, O3 / S8-write-states persona]` — J/A/R write-states walked NONE
  (helen-pinned specs).** The six pw write-state specs hardcode `?person=helen`; RT_PERSONA is a
  no-op on them, so jonathan/aurelia/rafa dispatch + sync-pill + offline are not separately
  walked. **BENIGN** per the code-read above (the surfaces are CSS-var-themed, so helen-green
  generalizes), but the per-persona render is not *empirically* walked. Same shape as
  **C3a-GAP-2** (O8 helen-only) / **C2-GAP-1**. Close by persona-parameterizing the photos
  write-state specs (lift the `?person=helen` goto + `helen-photos-entry` testid onto
  RT_PERSONA, as the sim specs already do) — spec-authoring, **deferred to triage (Jonathan's
  call)**.

**C3 COMPLETE** (C3a render/browse + C3b dispatch/upload). **Matrix: 10 of 19 surface rows
captured** (added O3; S8 row now render-states C3a + write-states C3b). Next: **C4 —
creation/editing** (S5 New-trip · S6 Trip editor · S7 Activities · S10 Share-in), incl. the two
CONFIRM-not-gap edges Jonathan flagged (new-trip exit affordance + all-photos back-blank).

---

## Phase 3 — Slice C4: Creation / editing (S5 New-trip · S6 Trip editor · S7 Activities · S10 Share-in) `[capture log]`

**Walked 2026-05-31, HEAD `434e480`.** The lightest remaining cluster, but it carried the two
**confirm-not-gap edges** (Jonathan's standing call). **Tiers run (existing only):** pw (both
engines) + a **source-of-truth code-read** and a **live exploratory drive** (`/tmp`, not a
committed spec) for the two edges, since the manual creation/editing surfaces have no committed
spec. axe = GAP (scans neither S5–S10); sim / instrument = N/A (no creation/editing surface is an
upload/iOS-render surface).

**Result: NO `[real]` stranding bug. Both edges confirmed ADEQUATE (not a strand).** C4 issues
**P3-02 / P3-03 at trivial / latent severity** to track the edges' minor/latent residue — neither
reproduces as a user-facing strand.

### THE TWO EDGES (the headline)

**P3-02 — NewTrip / TripEditor single-exit affordance `[real, S4 trivial — M6 polish; NOT a strand]`**
- **Surface×persona:** S5 `NewTrip` + S6 `TripEditor`, all personas (theme-invariant).
- **Confirmed present + functional.** `NewTrip` renders a `‹ Trips` link → `onBack=openIndex`
  (`NewTrip.jsx:110-118`, `App.jsx:727`); `TripEditor` the same (`TripEditor.jsx:254-261`,
  `App.jsx:728/734`) + it autosaves on unmount so leaving never drops edits. **Live drive:** index
  → New trip → form → click `‹ Trips` → **returned to index** (exit functional).
- **The minor residue:** App.jsx suppresses the global top-bar back **and** the bottom Switcher on
  `view==='new'|'edit'` (`:590` + `:798`), so the exit is a **single small top-left link with no
  symmetric Cancel** beside the bottom Create/Publish CTA (live drive: Trips-buttons=1, symmetric
  Cancel=0). Deliberate minimal-chrome — the user is **not stranded**, but the affordance is
  asymmetric. Polish, M6.
- **Tiers caught:** code-read + live drive. **Reproducer:** index → "New trip" → observe the lone
  top-left `‹ Trips` link, no Cancel by "Create trip"; the link works. **Non-vacuous:** the live
  drive reached the form AND exited via the link.

**P3-03 — AllPhotosView back can blank, but is not user-reachable `[real, latent — add guard; NOT a strand]`**
- **Surface×persona:** S9 `all-photos` back edge (Jonathan's standing call, confirmed in C4).
- **Confirmed NON-reproducing in normal flow.** `AllPhotosView` is the **only** deep view rendered
  **without** the `&& trip` guard (`App.jsx:775`, vs `:739/:750/:758/:767/:782` which all gate on
  `trip`); its back is `() => setView({name:'trip'})` (`:779`), and the `trip` view blanks on a
  null/draft trip (`:738` + `renderTripView` null-returns at `:563`). **BUT** the trip-less state
  is unreachable: the all-photos entry is itself trip-gated (lives on the themed trip view), `trip`
  has an `activeTrip` fallback (`:363-364`), cold-load forces `view='index'` when nothing is active
  (`:395-400`), and all-photos is **not deep-linkable** (`initialViewFromUrl` emits only
  `import`/`trip`, `:33-46`). **Live drive:** entered all-photos → Back → **returned to the trip
  (NOT blank)**.
- **The latent residue:** the missing `&& trip` guard on `:775` is a real inconsistency — IF a
  future change makes all-photos reachable trip-less (a deep link, a delete-active-trip path), the
  back would blank. Add `&& trip` (or guard the back handler) when convenient.
- **Tiers caught:** code-read + live drive. **Reproducer (current = safe):** seed a today-active
  trip, `?person=helen&trip=…`, tap All-photos entry → Back → lands on the trip, not blank.
  **Non-vacuous:** the guard asymmetry is verified in source; the live back returned trip content.

### Standard-walk confirmations (existing tiers, helen authoritative)
- **pw both engines — 18 passed / 0 failed / 0 skipped.** `claude-create-trip` (3×2: the Claude
  `create_trip` **card** path → trip lands + navigates; **note:** this is the O2-card creation
  path, it does NOT render the manual `NewTrip` form) + `share-in` (5×2: ImportView paste-prefill /
  enrich / de-dup / save-validation / web-share-target / short-link-resolve) + `journey-05-share-in`
  (1×2: Things-to-do → Share-In journey). All `?person=helen`-pinned; both chromium + webkit-mobile
  green (no IDB/WebCodecs → no gated skips). Repro: `cd app && npx playwright test
  claude-create-trip share-in --reporter=list`. Tiers caught: pw.
- **Theme (J/A/R helen-pinned gap is benign):** code-read confirms the creation/editing/import
  surfaces are **CSS-var / `surface-*` themed, no hardcoded palette** — `NewTrip.jsx` (var/surface;
  a *prior* hardcode bug was already fixed, comment `:99-104`), `TripEditor.jsx` (surface-*/var),
  `ImportView.jsx` (33 `var(--*)` vs 4 persona-invariant literals: `#1A1614` native-option text,
  `#FBF8F2` / `TRAVELER_DOT` identity colors). So J/A/R theme correctly — **P3-01 stays bounded to
  the O1/O2 Claude family** (the C4 analogue of the C1/C3 results).

### Gaps recorded
- **C4-GAP-1 `[gap, S6 editor]`** — `TripEditor` has **no committed spec** (zero automated walk;
  live/code-confirmed functional). Close by authoring an editor spec (deferred).
- **C4-GAP-2 `[gap, S7 activities]`** — `ActivitiesView` is reached only as the **share-in funnel
  entry** (Things-to-do → open-share-in, helen); its **own content** (activities list, add / edit /
  remove) is not asserted. Thin. Deferred.
- **C4-GAP-3 `[gap, S5 manual form]`** — the manual `NewTrip` form has no spec (the Claude
  `create_trip` card path IS covered; the manual form is not). Live-confirmed functional. Deferred.
- **C4-GAP-4 `[gap, S5–S10 axe]`** — axe reaches no creation/editing surface (`a11y-axe.spec.js`
  scans only trips-index + the Claude panel). Same shape as C1-GAP-2 / C3a-GAP-1. Deferred.
- **C4-GAP-5 `[gap, S5/S6/S7/S10 persona]`** — all C4 specs are `?person=helen`-pinned (RT_PERSONA
  no-op, same as the C3b photos specs); J/A/R creation/editing/import not separately walked.
  **Benign** per the theme code-read above. Same shape as C3b-GAP-1. Deferred.

**C4 COMPLETE.** Both confirm-not-gap edges **confirmed adequate (no strand)**; P3-02 / P3-03 track
the trivial / latent residue. **Matrix: 14 of 19 surface rows captured** (added S5/S6/S7/S10; S9
annotated with the back-blank confirmation). **Only C5 remains** (S4 Settings · O4 Leave-when · O5
Nearby J-only · O6 Postcard A-only · O9 Flight H-only — the thin / persona-specific cells), then
Phase-3 capture is complete.

---

## Phase 3 — Slice C5: Settings + persona overlays (S4 · O4 · O5 · O6 · O9) `[capture log]` — PHASE 3 CAPTURE COMPLETE

**Walked 2026-05-31, HEAD `eb1e522`.** The final, thinnest cluster — settings + the persona-specific
overlays (O5 Jonathan-only · O6 Aurelia-only · O9 Helen-only, single-persona **by design**). **Tiers
run (existing only):** source-of-truth **theme code-read** (the headline), the O4 logic unit test +
the worker auth test (the api-proxy surface), and the incidental Settings reach from prior slices.
axe = GAP (reaches none of S4–O9); sim = N/A; instrument = the dev-log VIEW lives in Settings but its
harvest is C3b's (the `rt_upload_log_v1` hot zone).

**Result: NO new `[real]` bug. Latest finding ID stays P3-03.** The theme check **completes the proof
that P3-01 is bounded to exactly the O1/O2 Claude-in-app family** — every other surface themes
correctly per-persona.

### Theme check — all five C5 surfaces theme correctly (completes the P3-01-bounded proof)
- **S4 `Settings.jsx`** — `surface-light/dark` + `surface-rule` + `var(--border/--accent/--card)`;
  only persona-invariant literals (`#8B2B1F` danger, `#FBF8F2` pill text, `TRAVELERS[id].color`
  identity, Helen's own dark-toggle swatch `#14110D`/`#F2EBDA` gated to her appearance section).
- **O4 `LeaveWhenModal.jsx`** — `var(--bg/--text/--muted/--accent/--border)`,
  `var(--accent-warning, #f59e0b)` (var + fallback).
- **O5 `NearbyResultsModal.jsx`** — `var(--bg/--text/--muted/--accent/--border)` throughout.
- **O6 `PostcardComposer.jsx`** — `var(--bg/--text/--card/--accent/--border/--bg2)`; the `#e8a880`
  kraft texture + paper-tape are intentional postcard *decoration* (persona-invariant), not a theme
  palette; `TRAVELER_DOT[id]` is identity color.
- **O9 `FlightStatus.jsx`** — `currentColor`/`inherit` by design ("works on both light and dark
  surfaces", `:69-78`); `#C0573F` is a deliberate contrast-safe DELAYED/CANCELLED status color.

**None defines a module-level `const T` = a fixed palette applied via inline styles ignoring
`data-theme`** (the P3-01 mechanism). **Verdict: P3-01 is the lone wrong-theme outlier in the app,
confined to O1 panel + O2 cards** — proof complete across C1 (spine) + C2 (the bug) + C3 (photos) +
C4 (creation/editing) + C5 (settings/overlays).

### Confirmations (existing tiers)
- **O4 logic — `leaveWhen.test.mjs` 10/10 pass** (trafficNote thresholds, past-target throw,
  straight-line minutes). Repro: `cd app && node --test scripts/__tests__/leaveWhen.test.mjs`.
- **O4/O5 api-proxy auth — worker `security-auth-isolation` 6/6 pass.** `/leave-when` + `/places/nearby`
  are authed routes (401 without a valid family token) — the api-proxy is auth-gated, not an open
  secret surface. Repro: `cd worker && npx vitest run security-auth-isolation`. (Phase-2 security tier
  `24a1b7e`, re-confirmed for the C5 proxy surfaces.)
- **S4 Settings reach (incidental, helen):** `reconcile-archive` renders `PhotoBackfillTriage` in
  Settings (C3a green) + `photos-screenshots-m4` screenshots the dev-mode upload-log in Settings (C3b
  green). Settings' OWN content not separately asserted (C5-GAP-1).

### Gaps recorded
- **C5-GAP-1 `[gap, S4 own-content + axe]`** — Settings own content (calendar export, `archive-toggle`,
  traveler picker, sync actions, drafts list) not directly walked (only incidental, helen); axe doesn't
  scan it. Deferred.
- **C5-GAP-2 `[gap, O4 modal UI]`** — `LeaveWhenModal` render/flow not walked (logic ✓, worker auth ✓;
  modal has no e2e spec). Deferred.
- **C5-GAP-3 `[gap, O5 modal UI]`** — `NearbyResultsModal` render not walked (worker auth ✓). **O5 is
  Jonathan-only BY DESIGN — single-persona is correct, not a persona gap;** the gap is the absent UI
  walk. Deferred.
- **C5-GAP-4 `[gap, O6 modal UI]`** — `PostcardComposer` not walked (no spec/lib/route). **O6 is
  Aurelia-only BY DESIGN.** Deferred.
- **C5-GAP-5 `[gap, O9 view UI]`** — `FlightStatus` not walked (`flightStatus.js` lib only; its
  `airlineStatusUrl` dup-export is already in **DEADCODE-1**). **O9 is Helen-only BY DESIGN.** Deferred.

*(By-design single-persona O5/O6/O9 are distinct from helen-PINNED multi-persona gaps: walking
O5/O6/O9 as one persona is correct; the gap is that their UI isn't walked at all. S4 + O4 are
multi-persona surfaces reached only helen/incidentally.)*

---

## Phase 3 (capture run) — COMPLETE · Matrix 19/19

**Slices:** Slice 0 `d107f77` · C1 `21425f9` (spine) · C2 `a5b498d` (Claude — the bug) · C3a
`634e859` (photos render) · C3b `434e480` (photos write/upload hot zone) · C4 `eb1e522`
(creation/editing) · C5 (this commit, settings/overlays).

**Findings catalog (Phase 3):**
- **P3-01 `[real, S2 — deferred M6]`** — O1 panel + O2 cards render Helen's hardcoded `T` palette for
  ALL personas (`ClaudeChat.jsx:43` + `ConfirmCard.jsx:27`, inline styles, no `data-theme`). **C5
  proved this is bounded to exactly O1/O2** — no other surface hardcodes. M6 rewires to
  `TRAVELERS[persona].theme`.
- **P3-02 `[real, S4 trivial — M6 polish; not a strand]`** — NewTrip/TripEditor single-exit affordance
  (lone top-left `‹ Trips` link, no symmetric Cancel, chrome suppressed). Exit functional (live-confirmed).
- **P3-03 `[real, latent — not user-reachable]`** — `AllPhotosView` is the only deep view missing the
  `&& trip` guard (`App.jsx:775`); back would blank IF reached trip-less, but normal nav can't (live:
  back returns to the trip). Add the guard.
- **Inherited (pre-Phase-3, re-confirmed):** **A11Y-1** `[real, serious — M6]` themed contrast
  (corroborates P3-01 from the contrast angle); **DEADCODE-1** `[real, dead-code]` 78 orphan files +
  2 dead deps + 21 dead exports. The R/J/N WebKit pile (R1–R6, J1–J4, N1) is all `[resolved]`,
  re-confirmed firing-as-characterized in C3b.

**Net: the capture run surfaced ONE genuinely new real bug (P3-01, M6-bounded) + two minor/latent
edges (P3-02/P3-03). No severe/blocking findings. The founding black-photo bug class does NOT
reproduce (C3a sim, non-black on real iOS).**

**For Jonathan's triage (deferred — no specs authored during capture):**
- **Spec-authoring to close gaps:** S3 stop-detail (C1-GAP-1); per-persona walks (lift `?person=helen`
  → RT_PERSONA) for photos write-states / dispatch / cards / O8 triage (C3b-GAP-1, C3a-GAP-2, C2-GAP-1);
  S6 editor / S7 activities-content / S5 manual-form (C4-GAP-1/2/3); S4 settings-content + O4/O5/O6/O9
  modal UIs (C5-GAP-1..5).
- **axe extension:** wire a11y-axe beyond trips-index + Claude panel (C1-GAP-2 / C3a-GAP-1 / C4-GAP-4 /
  C5-GAP-1 — S2/S3, photos, creation/editing, settings).
- **M6 fixes:** P3-01 (+ re-gate A11Y-1 contrast), P3-02 polish, P3-03 guard.
- **DEADCODE-1:** delete-vs-restore triage (useTheme restore? map cluster + leaflet/react-leaflet delete?).
- **Real-device (Jonathan's):** hardware iOS memory-pressure (the founding trigger, sim-structurally
  uncatchable), `wrangler tail` worker traces, real-cellular at the arena.

---

## R1 — Lightbox touch gestures don't run on WebKit `[test, S2 → resolved]`

**Status (2026-05-25): [resolved]** — Pure test fix. WebKit
blocks both `new TouchEvent(...)` and `new Touch({...})` with
`Illegal constructor`. Playwright's `Touchscreen.tap()` only
fires at a single coordinate, so it can't synthesize a swipe.
But the React handler in PhotoAlbum.jsx only reads
`touches[0].clientX/Y` (touchstart) and
`changedTouches[0].clientX/Y` (touchend) — it doesn't listen for
touchmove. So we sidestep both restricted constructors by
dispatching a base `Event` and pinning `touches` /
`targetTouches` / `changedTouches` via `Object.defineProperty`.
React's event delegation listens by event name and reads touches
off the native event, which is enough.

**Spec:** `tests/e2e/photos-lightbox-swipe.spec.js`
**Reclassification:** Was `[real, S2]` with DESIGN-DECISION risk
(the carryover allowed for the possibility the app's swipe
detector needed work). Now confirmed `[test]` — no app change
required. Verified 4/4 green on both projects.

---

## R2 — saveAsset auto-downscale tests fail on WebKit `[test, S3 → resolved]`

**Status (2026-05-25): [resolved]** — Investigation refuted the
carryover's Vite-URL hypothesis. Switching the dynamic import to
a window-global hook (DEV-only) made the import succeed, but
`saveAsset` then failed at `IDBObjectStore.put({...blob})` —
exactly the R4 IDB+Blob bug. R2 is downstream of R4, same engine
limitation, same skip pattern.

**Fix:** `test.skip(browserName === 'webkit', WEBKIT_IDB_BLOB_REASON)`
on all 3 tests, reusing the shared reason text from R4a. The
in-page dynamic import is preserved (works on chromium); no app
change needed. The Simulator gate's `offline-drain.test.mjs`
covers IDB+Blob storage on the iOS-real surface.

---

## R3 — WebCodecs video pipeline doesn't render preview on WebKit `[real, S1]`

**Status (2026-05-25): R3a + R3b [resolved]** — Both shipped.
The R3b Simulator journey did its job: it surfaced a real iOS
Safari bug in our encode pipeline that the Playwright suite
never caught. Specifically:

  1. iOS Safari's WebCodecs `VideoEncoder` doesn't auto-compute
     chunk duration from consecutive frame timestamps the way
     Chromium does. Without an explicit `duration` on the input
     `VideoFrame`, the output chunk's duration is unset and
     `mp4-muxer.addVideoChunk` rejects with "duration must be a
     non-negative real number". Fixed in
     `app/src/workers/encodeVideo.worker.js` by stamping every
     VideoFrame with `duration: frameDurationUs`.

  2. iOS Safari's `requestVideoFrameCallback` can fire with a
     repeated or non-monotonic `metadata.mediaTime` for some .mov
     files. Even with the duration fix, that produces 0 / negative
     chunk durations downstream. Fixed in
     `app/src/lib/videoPipeline.js` `walkAllFrames` by clamping
     timestamps to strict monotonicity (lastTs + 1µs floor).

R3a's skip pattern remains in `photos-video.spec.js` because
Playwright's bundled WebKit still can't drive the synthetic
pipeline (the failure mode is upstream of these app bugs —
input synthesis itself stalls). The iOS-real surface now has
explicit coverage via `tests/simulator/video-encode.test.mjs`
which passes against booted iPhone 17 / iOS 26.5 (~12s).

**Spec:** `tests/e2e/photos-video.spec.js`
**Browsers:** webkit-mobile (chromium OK)
**Symptom:** `dispatch-preview-video` element never visible
within 60-second timeout.

**Root cause hypothesis:** Playwright's bundled WebKit doesn't
ship full WebCodecs. The dispatch composer detects WebCodecs
unavailability at modal-open time (per the M3 design) and hides
the video picker, but the test fixture still tries to invoke it.

**Severity S1 because:** this is the exact iOS WebCodecs gap
called out in `tests/e2e/_fixtures/withTrip.js` comments and in
`PUNCHLIST_3.md`. Real iOS Safari 17+ DOES support WebCodecs
basics; whether the simulator/Playwright WebKit does is a real
production-relevance question.

**Reproducer:** `npx playwright test tests/e2e/photos-video.spec.js --project=webkit-mobile`

**Fix path:** First clarify whether Playwright's WebKit
intentionally ships without WebCodecs (likely yes — it's a
build-time flag). If so, this test should `test.skip()` on
webkit-mobile and rely on Item A.6's Simulator gate for real
iOS Safari WebCodecs coverage.

---

## R3c — Chromium gate extension: vite cold-cache module-resolution race `[test, S2 → gated, ongoing]`

**Status (2026-05-26): [gated, ongoing]** — Test-harness
limitation, NOT an app bug. The chromium leg of
`photos-video.spec.js:43` started failing reproducibly on cold
cache after the markdown-rollback chain landed in `72ad418`
(react-markdown@9 replacing marked + dompurify). Mechanism is
characterized; the fix shape that would close it cleanly is
unknown.

**Root cause:** vite's cold-cache module-resolution race against
the encode worker. `app/src/workers/encodeVideo.worker.js`
imports `mp4-muxer`. The worker is loaded via
`new Worker(new URL('../workers/encodeVideo.worker.js',
import.meta.url), { type: 'module' })` from
`app/src/lib/videoPipeline.js:88`, which runs during the test's
`setInputFiles → onVideoChange → encodeVideo` chain. mp4-muxer
isn't pre-bundled, so vite discovers it as a new dependency
mid-request, re-runs optimizeDeps, and emits a full-page reload
to pick up the new bundle. The page resets to its initial
'trip' view, the modal unmounts, and the locator wait for
`dispatch-preview-video` times out.

**Confirmation:** cold-cache diagnostic captured `[vite]
connected.` TWICE in the console (definitive evidence of a
mid-test page reload). Encode itself works — same test passes
in 5s with a warm cache.

**Fix attempts that did NOT work (2026-05-26):**

1. **`optimizeDeps.include: ['mp4-muxer']`** — broke ALL cold-
   cache tests at React hydration. mp4-muxer references
   WebCodecs primitives (`VideoEncoder`, `EncodedVideoChunk`,
   etc.) that don't exist on the main thread; bundling it into
   the main-thread context via esbuild starves the page-load
   path enough that React doesn't hydrate within the 30s test
   budget. Even smoke.spec.js failed 2/2.

2. **`server.warmup.clientFiles:
   ['./src/workers/encodeVideo.worker.js']`** — same shape as
   (1). 30+ tests failed at hydration on cold cache before the
   run was killed. `clientFiles` transforms the worker file as
   a client-context module, which means mp4-muxer's main-
   thread bundle still gets generated.

Don't retry either shape. The right fix would need to either
(a) tell vite the file is a worker without forcing main-thread
bundling, (b) discover the worker dep graph eagerly without
bundling, or (c) sidestep the discovery race some other way.
None of those were obvious in the docs / config surface I
checked.

**Real coverage:** the R3b Simulator journey at
`app/tests/simulator/video-encode.test.mjs` exercises the
encode pipeline against a real iOS Safari + real .mov fixture
in ~12s. That's strictly stronger coverage than the Playwright
synthetic, so the gate doesn't reduce production confidence.

**Gate:** `test.skip(browserName === 'webkit' || browserName
=== 'chromium', ...)` on `photos-video.spec.js:43`. The other
tests in the same file (`19`, `167`) remain gated only on
webkit-mobile — they don't hit the encode worker, so the cold-
cache race doesn't apply to them.

**Spec:** `tests/e2e/photos-video.spec.js`
**Browsers gated:** chromium + webkit-mobile (both projects)
**Reproducer:** `rm -rf app/node_modules/.vite &&
cd app && npx playwright test tests/e2e/photos-video.spec.js:43
--project=chromium` (skip-removed) — modal opens, encoding
panel appears, then `[vite] connected.` fires a second time
and the page is gone.

---

## R4 — Offline sync-pill never surfaces on WebKit `[test, S2 → resolved]`

**Status (2026-05-25): [resolved]** — Classified as a
Playwright-WebKit quirk, NOT a real iOS bug. Verified via
Simulator diagnostic: real iOS Safari (iPhone 17 / iOS 26.5)
round-trips Blobs through IndexedDB cleanly; Playwright's
bundled WebKit fails `IDBObjectStore.put({...blob})` with
"Error preparing Blob/File data to be stored in object store".
The app's enqueue path correctly catches the failure and logs
it (code: `storage-quota`, phase: `queue-insert-failed`), so
the queue stays empty and the pill correctly doesn't render —
the test's assertion is the wrong shape for this engine.

**Fix:** `test.skip(browserName === 'webkit', WEBKIT_IDB_BLOB_REASON)`
on every test that depends on the IDB+Blob enqueue path. Shared
reason text lives at `tests/e2e/_fixtures/webkitIdbBlobGate.js`
so removing the gate (when Playwright fixes the upstream issue)
is a single-grep operation. R4b adds iOS-real coverage of the
queue+pill surface via `tests/simulator/offline-drain.test.mjs`:
injects a record into the IDB queue directly, navigates to
PhotosView, asserts the sync-pill renders with "1 syncing".
Passes in ~3s against booted iPhone 17 / iOS 26.5.

**Affected specs (all now gated):**
- `photos-offline.spec.js` (both tests — R4 directly)
- `photos-dispatch.spec.js` (the two sync-pill tests — R6)
- `photos-screenshots-m2.spec.js` (sync-pill screenshot — R5)
- `photos-screenshots-m4.spec.js` (sync-pill drain screenshot — R5)

---

## R5 — Two M2/M4 visual-screenshot specs fail on WebKit `[test, S3 → resolved]`

**Status (2026-05-25): [resolved]** — Confirmed downstream of
R4. Both screenshot tests render the sync pill, which depends
on the IDB+Blob enqueue that Playwright's WebKit chokes on.
Gated via the same `WEBKIT_IDB_BLOB_REASON` skip pattern as R4.

---

## R6 — photos-dispatch retry + 500-handling fail on WebKit `[test, S3 → resolved]`

**Status (2026-05-25): [resolved]** — Same downstream-of-R4
finding: both failing tests assert on the sync pill, which
doesn't render because Playwright WebKit's IDB+Blob fails.
Gated via the same `WEBKIT_IDB_BLOB_REASON` skip pattern.

---

## J1 — Journey 01 locator chain `[test+app, S3 → resolved]`

**Status (2026-05-25): [resolved]** — Two fixes:

1. Added `data-testid="threaded-photo-picker"` and
   `data-testid="threaded-photo-save"` to ThreadedMemories.jsx
   (minimal app change — adds inert attrs to existing buttons).
   Journey-01 now uses these testids instead of role+name
   matching.
2. Replaced the final assertion `locator('img').first()` with
   memory-metadata assertions (`/\d+ memory/` text + Delete
   button visibility) — the mocked /assets URL doesn't actually
   serve image bytes, so the `<img>` never renders even after
   the memory saves successfully.

Skipped on webkit-mobile per the R4 IDB+Blob pattern (the save
flow trips `IDBObjectStore.put({...blob})` on Playwright WebKit).

---

## J2 — Journey 03 dispatch-video-input not present `[test, S3 → resolved]`

**Status (2026-05-25): [resolved]** — Skipped on both Playwright
projects. webkit-mobile would otherwise hit the R3a-class
WebCodecs gap; chromium_headless_shell can't decode iPhone .mov
(h.264 in QuickTime container) — HTMLVideoElement reports
videoWidth/videoHeight = 0 and the encode pipeline throws
'video has no dimensions' (verified via diagnostic). Real iOS
Safari decodes .mov fine; iOS-real coverage of this surface
lives in `tests/simulator/video-encode.test.mjs` (R3b).

---

## J3 — Journey 05 share-in description not pre-filled `[test, S4 → resolved]`

**Status (2026-05-25): [resolved]** — Two test fixes needed (the
carryover called out one):

1. Added explicit `import-enrich.click()` after the category
   pick. The mocked `/draft` response only fires on Enrich, not
   on URL paste, so descriptions weren't populated.
2. Added explicit address fill (`27 Holmes St, Mystic, CT`).
   The Google Maps URL parser extracts name + lat/lng but NOT
   address — the visible "5 Water St, Mystic, CT" in the field
   was placeholder text, not a value. readyToSave requires a
   non-empty address, so without this fill the Save button stays
   disabled even when everything else looks populated.

---

## J4 — Journey 07 offline sync-pill missing `[test, S3 → resolved]`

**Status (2026-05-25): [resolved]** — Fix: replaced
mockSuccessfulUpload (which unconditionally returns 200) with a
stateful mock that returns 503 while `simulateOffline=true` and
200 after we flip it on reconnect. The previous mock contradicted
the offline state — even with `context.setOffline(true)`, the
route handler still fired and returned 200, so the upload
succeeded and nothing queued; the sync-pill assertion timed out.
Also added explicit hidden→visible visibility-change toggle on
reconnect (App.jsx's onVisibility only runs on the visible
transition).

Skipped on webkit-mobile per the R4 IDB+Blob pattern.

---

## N1 — Network matrix drop-and-resume not draining `[test, S3 → resolved]`

**Status (2026-05-25): [resolved]** — Pure test bug, no skip
needed on either project. Fix: route registration order.
mockSuccessfulUpload + dropFirstThenResume were both registered
BEFORE setupAlbumComposer ran seedTripIntoCache (which adds a
catch-all 404 route). Playwright's route matching is LIFO, so the
catch-all caught the first /assets/photo call with 404 and
dropFirstThenResume's abort never fired. Status still hit "Saved"
(via queueSilently catching the 404), but `probe.dropped()`
returned false. Reordered: setup first, then mocks.

Note: the original "no auto-retry" hypothesis was correct —
the dispatch flow queues silently on error and shows "Saved" —
but the test isn't asserting on retry behavior; it's just
asserting that the first attempt was actually intercepted.

---

## Triage summary

| Severity | Count | Notes |
|---|---|---|
| S1 (blocking) | 0 | R3 [resolved] — R3a (Playwright skip) + R3b (Simulator journey that uncovered + fixed real iOS bug in videoPipeline/worker) |
| S2 (real bug, important) | 0 | All closed. R1 [resolved] base-Event swipe bypass. R4 [resolved] reclassified to [test] — Playwright WebKit IDB+Blob quirk, real iOS verified clean |
| S3 (smaller real bug or test bug) | 0 | All closed. J1 (data-testids on ThreadedMemories + memory-metadata assertion). J4 (stateful mock replacing mockSuccessfulUpload). N1 (route registration order — setup must register the catch-all BEFORE the more specific mocks since Playwright LIFO). R2, R5, R6 closed via the R4 IDB+Blob skip pattern. J2 closed via skip on both projects (.mov codec gap on chromium + WebCodecs gap on webkit) |
| S4 (cosmetic test bug) | 0 | J3 closed — needed two test fixes (enrich click + address fill) |

**Total bug-pile items:** 11 originally; 11 closed. Bug pile clear.

## What this catches that the prior suite didn't

Before Item A.1 (single Chromium project), every WebKit-only
bug in the table above was invisible. The webkit-mobile project
flipped 14 silent passes into 14 explicit failures on the same
run. That's exactly the "tests pass but Helen's iPhone is
broken" gap the bug trap was designed to close.

## What this still doesn't catch

- WebKit-on-macOS differs from real iOS Safari (memory limits,
  WebCodecs availability, touch event implementation). Item A.6
  closes that gap once the Simulator is set up.
- Real cellular network conditions (BoP at a volleyball arena).
  Bounded real-device verification by Jonathan covers that bucket
  — not for every commit, only for milestone closeouts on
  platform-specific surfaces.
- Hardware-specific iOS Safari memory pressure (the bug that
  prompted this whole punchlist). The structural fix landed in
  commit `21fc084` (saveAsset auto-downscale) + `d80fbed` (photon
  resize on Worker); these protect against recurrence
  structurally even without test coverage of the symptom.

## Proposed fix order (after Group A close + this status pass)

Per user direction: severity-first, [real] before [test] within
a tier. Each fix lands as a separate commit with a regression
test that fails-before / passes-after; WebKit-mobile pass
required; Simulator pass for any upload/camera/etc. surface.

**Tier 1 — S1 [real]:**
1. **R3** — confirm Playwright WebKit's WebCodecs status (likely
   incomplete), gate the encode-pipeline test with `test.skip(...
   webkitWithoutWebCodecs)`, run the same test under the
   Simulator gate to keep iOS-real coverage. **Pure test fix
   once the gating is sound; no app change.**

**Tier 2 — S2 [real]:**
2. **R1** — lightbox touch on webkit. Two possible shapes:
   (a) test fix: swap synthetic TouchEvent for Playwright's
   `page.touchscreen.swipe()` (engine-native dispatch);
   (b) app fix: app's swipe detector needs to handle the
   WebKit-on-macOS event variant. Reproduce on Simulator to
   distinguish. **DESIGN-DECISION POSSIBLE** if the answer is
   (b) — touch detection logic could change UX.
3. **R4** — offline sync-pill on webkit. Same investigate-on-
   Simulator-first sequence. If real on iOS: high-priority real
   bug. If Playwright-WebKit-only: test gating + add Simulator
   coverage. **DESIGN-DECISION POSSIBLE** if the pill
   conditional logic itself needs changes.

**Tier 3 — S3 [real or test], real-leaning first:**
4. **R5, R6** — downstream of R4; resolve in the same commit
   or shortly after.
5. **J4, N1** — both fail on both projects, suggesting
   test-side issues with the offline / drop-and-resume
   assertions. Pure test fixes most likely.

**Tier 3 — S3 [test]:**
6. **R2** — replace in-page dynamic import with a DOM-driven
   assertion path through the real surface (journey-01 already
   covers this surface; merge or extend).
7. **J1** — add data-testids to ThreadedMemories' photo picker
   button + composer rail; update journey to use them.
8. **J2** — add WebCodecs feature-detect skip to journey-03;
   shares R3's resolution.

**Tier 4 — S4 [test]:**
9. **J3** — add the missing `import-enrich` click between
   category select and description assertion. ~5 min.

**Notes that affect the order:**
- Three entries (R4, R5, R6) share a root cause; one fix may
  close all three.
- Three entries (R3, J2 + the R3 test gate) share the WebCodecs
  root cause; one investigation may close all three.
- J1's data-testid additions are a code change to
  ThreadedMemories — small, but a real edit.
- **markdown rendering path is OFF-LIMITS** for this fix series
  per user direction; react-markdown rollback is queued
  separately and any KNOWN_BUGS fix touching ClaudeBubble or
  the marked-derived render must stop and check in first.

Don't start any of these until the user signs off on this
status pass.
