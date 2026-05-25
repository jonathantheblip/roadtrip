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

---

## R1 — Lightbox touch gestures don't run on WebKit `[real, S2]`

**Spec:** `tests/e2e/photos-lightbox-swipe.spec.js`
**Browsers:** webkit-mobile (chromium OK)
**Symptom:** `page.evaluate: TypeError: Illegal constructor`
when the test constructs a synthetic `TouchEvent`.

**Root cause hypothesis:** Safari restricts JavaScript
construction of `TouchEvent` for security reasons; the test
helper builds one via `new TouchEvent(...)` and Safari rejects.
Either the test needs to use Playwright's `page.touchscreen.tap()`
+ `page.touchscreen.swipe()` (engine-native dispatch), OR the
app's swipe detector needs a polyfilled-touch alternative.

**Reproducer:** `npx playwright test tests/e2e/photos-lightbox-swipe.spec.js --project=webkit-mobile`

**Fix path:** Likely a test fix (switch to Playwright's native
touch APIs). Confirm by manually swiping a lightbox tile on a
real iPhone — if the gesture works for Helen, the bug is in the
test; if it doesn't, the app's touch handler needs work.

---

## R2 — saveAsset auto-downscale tests fail on WebKit `[test, S3]`

**Spec:** `tests/e2e/photos-auto-downscale.spec.js` (3 tests)
**Browsers:** webkit-mobile (chromium OK)
**Symptom:** `page.evaluate: null`

**Root cause hypothesis:** The tests do a dynamic ESM `import()`
inside `page.evaluate()` to reach `memAssets.js` directly. Safari
permits dynamic imports but the module-graph resolution against
Vite's dev-server URLs behaves differently than Chromium. The
test's `await import('/src/lib/memAssets.js')` returns null
rather than the module exports.

**Reproducer:** `npx playwright test tests/e2e/photos-auto-downscale.spec.js --project=webkit-mobile`

**Fix path:** Test bug. Replace the in-page dynamic import with
the more robust pattern: navigate to a real PWA surface that
uses saveAsset (the ThreadedMemories picker) and assert via the
DOM, rather than calling the lib directly from the test runner.
The real-media journey-01 already exercises this surface.

---

## R3 — WebCodecs video pipeline doesn't render preview on WebKit `[real, S1]`

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

## R4 — Offline sync-pill never surfaces on WebKit `[real, S2]`

**Spec:** `tests/e2e/photos-offline.spec.js` (2 tests)
**Browsers:** webkit-mobile (chromium OK)
**Symptom:** `getByTestId('sync-pill')` not found within 5s.

**Root cause hypothesis:** The sync pill renders when items land
in the IndexedDB upload queue. Either (a) the queue isn't
populating on WebKit (different IndexedDB write semantics), or
(b) PhotosView's pill component renders conditionally on a state
that doesn't update on WebKit.

**Severity S2 because:** Helen's offline upload story IS the bug
this whole punchlist was prompted by; if the offline path is
genuinely broken on iOS Safari, that's a real regression.

**Reproducer:** `npx playwright test tests/e2e/photos-offline.spec.js --project=webkit-mobile`

**Fix path:** Investigate the IDB queue on a real iPhone first
(Item A.6's Simulator gate would prove this fast). If reproduces
on real iOS, the queue or pill component needs WebKit-specific
work. If not, it's a Playwright-WebKit quirk and the test needs
adjusting.

---

## R5 — Two M2/M4 visual-screenshot specs fail on WebKit `[real or test, S3]`

**Specs:** `tests/e2e/photos-screenshots-m2.spec.js`,
`tests/e2e/photos-screenshots-m4.spec.js` (1 each)
**Browsers:** webkit-mobile (chromium OK)
**Symptom:** Screenshot capture fails — probably related to R4
(sync pill missing on WebKit).

**Reproducer:** `npx playwright test tests/e2e/photos-screenshots-m2.spec.js tests/e2e/photos-screenshots-m4.spec.js --project=webkit-mobile`

**Fix path:** Likely resolves as a downstream of R4.

---

## R6 — photos-dispatch retry + 500-handling fail on WebKit `[test, S3]`

**Specs:** `tests/e2e/photos-dispatch.spec.js` (2 tests)
**Browsers:** webkit-mobile (chromium OK)
**Symptom:** Sync pill never appears (same root as R4).

**Fix path:** Same as R4.

---

## J1 — Journey 01 locator chain `[test, S3]`

**Spec:** `tests/e2e/journeys/journey-01-photo-thread.spec.js`
**Browsers:** both
**Symptom:** Locator for the in-thread photo picker doesn't
resolve from the trip view.

**Root cause:** ThreadedMemories renders inside StopDetail; the
journey navigates to StopDetail via "Beach Bungalow" but the
"Attach photos" aria-labeled button isn't found in the expected
position.

**Fix path:** Test bug. Either ThreadedMemories needs a stable
data-testid on its photo-picker button (small code change), or
the test needs to wait for StopDetail's mount before querying.

---

## J2 — Journey 03 dispatch-video-input not present `[test, S3]`

**Spec:** `tests/e2e/journeys/journey-03-video-thread.spec.js`
**Browsers:** both
**Symptom:** `dispatch-video-input` not attached when expected.

**Root cause:** Same as R3 — WebCodecs detection hides the video
picker when unavailable. The test should `test.skip()` when the
picker isn't surfaced, or condition the picker on a deterministic
flag during testing.

---

## J3 — Journey 05 share-in description not pre-filled `[test, S4]`

**Spec:** `tests/e2e/journeys/journey-05-share-in.spec.js`
**Browsers:** both
**Symptom:** `import-desc-helen` doesn't have value matching
`/morning bun/i` after pasting URL + picking category.

**Root cause:** The mocked `/draft` response only fires after
the user clicks "Enrich" — the descriptions aren't pre-filled
on URL paste alone. My journey skipped that step.

**Fix path:** Test bug. Add an explicit `getByTestId('import-enrich').click()` after the category pick, then assert.

---

## J4 — Journey 07 offline sync-pill missing `[real or test, S3]`

**Spec:** `tests/e2e/journeys/journey-07-offline-queue.spec.js`
**Browsers:** both
**Symptom:** Same as R4 — `sync-pill` doesn't appear.

**Fix path:** Same root as R4; likely resolves with that
investigation.

---

## N1 — Network matrix drop-and-resume not draining `[real or test, S3]`

**Spec:** `tests/e2e/network-matrix/photo-upload.matrix.spec.js`
**Browsers:** both
**Symptom:** Save status never reaches "Saved" after the first
upload is aborted.

**Root cause hypothesis:** The dispatch flow may not auto-retry
after a network failure — it might queue silently per the
user-facing error policy. If so, the test is asserting the wrong
end state (should look at the queue's sync-pill, not the
dispatch modal's status).

**Fix path:** Verify the retry behavior in the dispatch flow.
Probably a test bug.

---

## Triage summary

| Severity | Count | Notes |
|---|---|---|
| S1 (blocking) | 1 | R3 — WebCodecs gap, possibly intentional Playwright WebKit limitation |
| S2 (real bug, important) | 2 | R1 lightbox touch, R4 offline pill — both align with the iOS Safari class of bug the trap was built for |
| S3 (smaller real bug or test bug) | 7 | R2, R5, R6, J1, J2, J4, N1 — mostly downstream of R4 or test-side fixes |
| S4 (cosmetic test bug) | 1 | J3 — easy fix |

**Total bug-pile items:** 11 (after de-duping per-spec failures
that share a root cause).

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

## Next steps (deferred until after Group A close)

1. Triage R3 first — confirm whether Playwright's WebKit has
   WebCodecs; if not, gate the test with `test.skip()` and rely
   on Item A.6's Simulator for real iOS WebCodecs coverage
2. Investigate R4 on real iOS via Item A.6 once Xcode lands —
   if the offline pill is genuinely broken on iOS, that's a
   higher priority than its current S2 ranking suggests
3. Fix J3 (5 min)
4. Add data-testids to ThreadedMemories to clear J1 + reduce
   future test-locator fragility
5. Re-run the suite, expect the table to shrink

Don't start any of these until the user signs off on Group A
close.
