# Testing on the iOS Simulator

The milestone gate from `BUG_TRAP_PUNCHLIST.md` Item A.6. The
standard `npm run test:e2e` suite covers Chromium + headless
WebKit-on-macOS via Playwright. The Simulator gate runs against
**real iOS Safari on a real iPhone simulator** via Apple's
`safaridriver`, which catches the gaps WebKit-on-macOS doesn't —
notably WebCodecs availability, touch event handling, and iOS-
specific memory pressure on full-resolution photos.

Run before any milestone closeout that touches:
- upload (photo or video)
- camera or photo picker
- geolocation
- voice / microphone
- any platform-specific Web API (WebCodecs, IndexedDB quota,
  Web Share, Background Sync, etc.)

For every other milestone, the standard suite is sufficient.

## Why not Playwright

Playwright's bundled WebKit is "WebKit-on-macOS" — fundamentally
the same engine the standard suite's `webkit-mobile` project
already runs. Playwright cannot drive iOS Simulator Safari
natively (`channel: 'safari'` errors with
`Unsupported webkit channel`). True iOS Safari testing requires
Apple's `safaridriver` directly with the W3C WebDriver
capabilities `platformName: 'iOS'` + `safari:useSimulator: true`,
documented in `man safaridriver`. We use the `webdriverio` W3C
client (free, OSS, no Appium dependency tree) + `node:test` for
test orchestration — same stack as the existing Node unit tests.

## Setup — one time per machine

### 1. Install Xcode

Mac App Store → search "Xcode" → Get. About 14 GB on first
install. Open Xcode once after install to accept the license.

### 2. Install an iOS Simulator runtime

```
xcodebuild -downloadPlatform iOS
```

Or Xcode → Settings → Components → install an iOS runtime
(17.5+ recommended; iOS 26+ confirmed working).

### 3. Enable safaridriver

One-time per machine:

```
sudo safaridriver --enable
```

### 4. Web Inspector + Remote Automation on the simulator

**iOS 26+:** these are on by default. No simulator-side toggles
needed.

**iOS 17–25:** boot the simulator first, then:
- Inside iOS Settings → Safari → Advanced → Web Inspector ON
- macOS Simulator.app → Develop → [simulator name] →
  Allow Remote Automation

### 5. Verify

```
xcrun simctl list devicetypes | grep -i iphone   # installed iPhone profiles
xcrun simctl list runtimes                       # installed iOS runtimes
safaridriver --version                           # safaridriver reachable
```

## Running the simulator gate

### One-time: boot a simulator

```
xcrun simctl boot "iPhone 17"   # or any installed iPhone profile
open -a Simulator
```

The simulator can stay booted across runs; the gate doesn't
auto-boot one because that adds 20+ seconds per run for no
benefit during iteration.

### Run the gate

From the `app/` directory:

```
npm run test:simulator
```

The runner (`tests/simulator/runner.mjs`) handles dev-server
lifecycle: starts vite on :5181 if not up, runs each `.test.mjs`
under `tests/simulator/` via `node --test`, then kills vite on
exit. Each test handles its own safaridriver lifecycle internally.

### First-run expectations

- **Smoke takes ~90–110 seconds.** iOS Simulator's first Safari
  navigation per session is slow. Subsequent navigations within
  the same session are normal speed.
- `webdriverio` logs one `WebDriverError` about a `/context`
  endpoint that safaridriver doesn't implement. This is a probe
  webdriverio makes during session setup; the actual session
  works fine. Safe to ignore.

## What's covered

The gate currently runs:

- `smoke.test.mjs` — boots dev server, opens safaridriver,
  connects to simulator, navigates to the dev server, asserts
  the app's `<title>` renders.

Additional simulator-only journeys can be added as needed —
particularly for the iOS-Safari-specific failures in
`KNOWN_BUGS.md` (R1 lightbox touch, R3 WebCodecs preview, R4
offline sync-pill) where the standard suite's `webkit-mobile`
project can't reproduce the production behavior.

## Common failure modes

### "No iPhone simulator booted"

You skipped step 5's boot. Run
`xcrun simctl boot "iPhone 17"` and re-run the gate.

### "safaridriver did not start listening on http://127.0.0.1:4567"

`safaridriver --enable` hasn't been run (step 3) OR a stale
safaridriver from a prior run is still holding the port. The
gate's `_driver.mjs` does `pkill -f safaridriver` before each
test, but if you killed a test mid-run, run `pkill -f safaridriver`
manually.

### "dev server failed to start in 20s"

Port 5181 is already in use. `lsof -ti :5181 | xargs kill -9`
clears it.

### A test fails on the simulator that passes in the standard
suite

This is the bug trap working as designed — the test surfaced an
iOS-Safari-specific regression that headless WebKit didn't catch.
Add an entry to `KNOWN_BUGS.md` and fix in the normal triage flow.

## Why we don't run this on every commit

- iOS Simulator is single-tenant (one Safari session at a time
  per booted device) and significantly slower than headless
  WebKit
- The boot + warm-up cost amortizes poorly across small commits
- The WebKit-on-macOS project from the standard config catches
  most cross-browser regressions; the simulator catches the
  remaining iOS-specific gap

The trade-off: standard suite runs on every commit, simulator
gate runs on milestone closeout. Helen's actual iPhone is the
final gate beyond that.
