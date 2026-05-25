# BUG-TRAP PUNCHLIST — Group A Foundation

## What this is

Quality infrastructure before more features. Today's session surfaced five bugs through real-device use that headless Chromium tests missed. The gap between "tests pass" and "works on Helen's iPhone" is too wide. This punchlist closes it.

No new features until Group A is in place and the existing bug pile is triaged through it.

## Standard going forward

Every milestone closeout requires:
1. All Playwright tests pass on both Chromium AND WebKit-mobile projects
2. Visual regression diffs reviewed (or explicitly accepted with a reason)
3. Synthetic user journeys for the affected surfaces pass
4. For milestones touching upload, camera, geolocation, voice, or any platform-specific API: Simulator test pass before merge

A milestone is not done if any of the above is skipped. This includes when Jonathan is in a hurry. Especially then.

## Items, in order

### Item 1 — Playwright WebKit project

Add a webkit project to `playwright.config.js` using `devices['iPhone 15']` for mobile viewport, touch events, and iOS user agent.

Existing tests run in both Chromium and WebKit. Failures surface per browser. `npm run test:e2e` runs both; PR/merge gate requires both green.

When a test passes in Chromium but fails in WebKit, that's not a flaky test. That's a real iOS Safari bug.

### Item 2 — Fixture corpus (Jonathan provides)

Create `tests/fixtures/media/` directory structure. Jonathan provides real files from his and Helen's camera rolls:

- One real iPhone HEIC with EXIF and GPS intact (~4MB)
- One real iPhone full-resolution JPEG (~5MB)
- One iPhone screenshot (PNG, ~200KB)
- One screen recording (PNG)
- One 5-second iPhone 1080p video (~10MB)
- One 30-second iPhone 4K video (~100MB)
- One portrait-orientation video
- One landscape-orientation video

If total size exceeds 50MB, add git-lfs configuration in `.gitattributes`.

These files are the test corpus. Every upload-touching test exercises them, not synthetic Canvas-generated fixtures. The whole point is to catch bugs that synthetic fixtures hide.

### Item 3 — Synthetic user journeys

Write multi-step user journey tests for the highest-traffic flows. Each journey is one test that exercises a full user path; if any step breaks, the journey fails and the failure points to the broken step.

Journeys to cover (minimum):

- **Photo upload from in-thread composer:** Open trip → tap stop → tap dispatch composer → pick a photo from fixtures → add caption → save → verify tile renders in thread → tap tile → verify lightbox opens with correct photo and caption → swipe to next photo → close lightbox → reopen album → verify photo still there
- **Photo upload from album entry:** Open trip → tap photos entry → tap add → pick a photo → save → verify in album with correct stop grouping
- **Video upload from in-thread composer:** Same shape as photo, but with video fixture; verify encode progress UI advances and completes; verify video plays in lightbox
- **Cross-trip album:** Open trip → tap all-photos entry → verify memories from multiple trips render → tap one → verify lightbox shows trip name in metadata → swipe across trip boundary
- **Share-In via paste:** Open activities view → tap "Add from link" → paste Google Maps URL → verify confirmation card renders with name + address + per-traveler descriptions → save → verify activity appears in list
- **Claude chat:** Open trip → tap Claude entry → send a question about the trip → verify response streams in → close panel → reopen → verify conversation persists
- **Offline upload queue:** Set context offline → pick a photo → save → verify tile appears with queued state → set context online → verify queue drains and tile updates

Each journey gets a screenshot at each step for debugging when it breaks.

### Item 4 — Visual regression baselines

Use Playwright's built-in `toHaveScreenshot()` to capture baseline images for key views in both Chromium and WebKit:

- Each of the four themed views (Jonathan, Helen, Aurelia, Rafa) for the volleyball-2026 trip
- The photos album view, per traveler
- The all-photos cross-trip view, per traveler
- The lightbox, opened on a memory with multiple photos
- The dispatch composer (empty state, photo-picked state, video-encoding state, video-preview state)
- The Claude chat surface (empty state, with a conversation)
- The trips list

Baseline images stored in `tests/e2e/screenshots/baseline/`. On every commit, diffs against the baseline. Configurable per-pixel tolerance to avoid font-rendering noise.

When a diff appears, the test fails and prints a visual diff. Either the change was intentional (Code accepts the new baseline) or it's a regression (fix it).

### Item 5 — Network condition matrix

For every upload journey, run a matrix of network conditions:

- Full speed (default)
- Slow 3G (Playwright's built-in throttling)
- Offline mid-upload (set offline halfway through, then back online — verify queue drain)
- Offline at start (verify the queue indicator surfaces correctly)
- Connection drop and resume (interrupt at 30% upload, resume — verify no duplicate, no data loss)

These tests live in `tests/e2e/network-matrix/`. They're slower than the standard journeys; run them on every commit but allow them to use a longer timeout.

This catches the silent-failure modes — the "upload percent counter disappeared halfway through" class of bug.

### Item 6 — Xcode Simulator config for milestone gates

Build a separate Playwright config (`playwright.simulator.config.js`) that targets safaridriver on an iPhone simulator. This runs against real iOS Safari, not WebKit-on-macOS.

Setup documentation at `app/docs/testing-simulator.md`. Cover:
- Xcode installation and simulator setup
- Enabling safaridriver: `safaridriver --enable` and the per-simulator `Develop → Allow Remote Automation` toggle
- How to run: `npm run test:simulator`
- Which iPhone simulator profile to use (iPhone 15, iOS 17.5+)
- Common failure modes and fixes

The Simulator config runs the same test suite as WebKit but against real iOS Safari. Slower per run, more accurate to production.

Don't run on every commit. Run before any milestone closeout that touches upload, camera, geolocation, voice, or platform-specific APIs.

### Item 7 — Backfill journey baselines

Run the full Group A test suite against current `main`. Surface every failure. This is the existing bug pile, made legible.

For each failure:
- Document what it is (which journey step, what browser, what condition)
- Triage: is this a real bug or a test bug?
- For real bugs: add to a `KNOWN_BUGS.md` file in the repo with reproducer and severity
- For test bugs: fix the test

Don't fix the bugs yet. The goal of Item 7 is to make the bug pile visible. Fixes come after the trap is in place.

## What this catches (and doesn't)

**Catches:** Cross-browser regressions, layout breakage, visual changes that shouldn't have happened, multi-step user flow breakage, network-dependent silent failures, accept-attribute bugs, lightbox tap regressions, performance-related rendering issues.

**Doesn't catch:** Real iOS memory pressure issues (only real devices catch those — but the photo fix that's pending deploy is the structural fix for that class), hardware-specific WebCodecs failures, things that only manifest on actual cell network at a volleyball arena.

For the last bucket: occasional real-device verification by Jonathan. Not for every commit, not for bug-hunting, only for milestone closeouts on platform-specific surfaces. Bounded, scripted, fast.

## What does NOT belong in this punchlist

- Helen as a tester. Anywhere. Ever.
- Group B items (accessibility audits, performance budgets, contract tests) — those build alongside the next feature
- Group C items (production snapshots, real device farm, commit signatures) — later

## After Group A lands

1. Triage the bug pile surfaced in Item 7
2. Fix the bugs in priority order Jonathan sets
3. Resume Claude-in-App work, with the bug-trap as a real gate for every milestone

## Ground rules

This is infrastructure. It doesn't ship a user-visible feature. It's worth the pause. Don't compress it. Don't skip items. Don't ship without all seven landing.

Stop and report between items.
