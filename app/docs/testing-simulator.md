# Testing on the iOS Simulator

This is the milestone gate from `BUG_TRAP_PUNCHLIST.md` Item A.6.
The standard `npm run test:e2e` suite covers Chromium + headless
WebKit. The Simulator gate runs the same journeys + visual
baselines against **real iOS Safari on a real iPhone simulator**,
which catches the gaps WebKit-on-macOS doesn't.

Run before any milestone closeout that touches:
- upload (photo or video)
- camera or photo picker
- geolocation
- voice / microphone
- any platform-specific Web API (WebCodecs, IndexedDB quota,
  Web Share, Background Sync, etc.)

For every other milestone, the standard suite is sufficient.

## Setup — one time per machine

### 1. Install Xcode

Mac App Store → search "Xcode" → Get. About 14 GB on first
install, larger after the first iOS runtime downloads.

After Xcode finishes downloading, open it once to accept the
license agreement.

### 2. Install an iOS Simulator runtime

The Simulator runtime is a separate download from Xcode itself.
Easiest path:

```
xcodebuild -downloadPlatform iOS
```

Or via the GUI: Xcode → Settings → Components → install the
latest iOS runtime (17.5+ recommended; iOS 26 is current).

### 3. Enable safaridriver

Lets Playwright drive Safari over the WebDriver protocol.
One-time per machine:

```
sudo safaridriver --enable
```

You'll be prompted for your password.

### 4. Enable Web Inspector + Remote Automation on a booted
simulator

Each simulator profile (iPhone 15, iPhone 15 Pro, etc.) needs
two switches flipped the first time you use it:

1. Boot the simulator: `xcrun simctl boot "iPhone 15"` or use
   Simulator.app's Device menu.
2. Inside the simulated iOS: Settings → Safari → Advanced → toggle
   **Web Inspector** ON.
3. On macOS, with Simulator.app focused: top-menu Develop →
   Simulator name → check **Allow Remote Automation**.

### 5. Verify

From the repo's `app/` directory:

```
xcrun simctl list devicetypes | grep -i iphone   # shows installed iPhone profiles
xcrun simctl list runtimes                       # shows installed iOS runtimes
safaridriver --version                           # confirms safaridriver is reachable
```

If all three return non-empty answers, the Simulator gate is ready.

## Running the simulator gate

From the `app/` directory:

```
# 1. Boot a simulator (only need to do this once per session)
xcrun simctl boot "iPhone 15"
open -a Simulator

# 2. Run the simulator-targeted Playwright config
npm run test:simulator
```

The simulator config:
- Only runs the journey specs + visual baselines spec (the
  network matrix uses route() interception that doesn't work the
  same way against real Safari)
- Uses a 180-second per-test timeout (simulator is genuinely
  slower than headless WebKit)
- Stores its own snapshot baselines under
  `tests/e2e/visual-baselines.spec.js-snapshots/<test>-ios-simulator-darwin.png`
  — distinct from the headless Chromium and WebKit baselines

## Common failure modes

### "Could not find safaridriver"

You skipped step 3. Run `sudo safaridriver --enable`.

### "Could not connect to Simulator"

You skipped step 4. Boot the simulator (`xcrun simctl boot
"iPhone 15"`) before running tests.

### "browserName not supported" or silent fallback to macOS Safari

Playwright is reaching macOS native Safari instead of the
simulator. Check that:
- The simulator is actually booted (`xcrun simctl list devices |
  grep Booted`)
- Develop → "Allow Remote Automation" is on for THAT simulator
  (not just for macOS Safari)
- safaridriver from `xcrun --sdk iphoneos --find safaridriver`
  is reachable (not the macOS-only `/usr/bin/safaridriver`)

### A baseline screenshot doesn't match

Real iOS Safari renders some surfaces (especially native form
controls, scroll bars, text-rendering subpixels) slightly
differently than headless WebKit. Either accept the new baseline
(`npm run test:simulator -- --update-snapshots`) or investigate
whether it's a real regression.

### Tests hang at the first navigation

The simulator's Safari has a separate localStorage from macOS.
The first run after a fresh boot needs to load the dev server
once before tests can do their `addInitScript` localStorage
seeding. If hangs persist, try opening
`http://localhost:5181` manually in the simulator's Safari
once, then re-running.

## Why we don't run this on every commit

- The simulator is single-tenant (one test at a time per booted
  device) and significantly slower than headless WebKit
- The boot + warm-up cost amortizes poorly across small commits
- The WebKit-on-macOS project from the standard config catches
  most cross-browser regressions; the simulator catches the
  remaining iOS-specific gap

The trade-off: standard suite runs on every commit, simulator
gate runs on milestone closeout. Helen's iPhone is the final
gate beyond that.
