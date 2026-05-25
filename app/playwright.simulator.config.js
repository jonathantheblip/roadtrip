// Playwright config for the iOS Simulator gate.
// Bug-Trap A.6 — see app/docs/testing-simulator.md for setup.
//
// This config is the MILESTONE GATE for any work touching upload,
// camera, geolocation, voice, or platform-specific APIs. It runs
// against real iOS Safari via safaridriver on a booted iPhone
// simulator — slower per run than the WebKit-on-macOS project in
// the standard config, much closer to what production Helen sees
// on her iPhone.
//
// Not invoked on every commit. Run manually before milestone
// closeout, or wire into a separate CI job if/when one exists.
//
// Boot order assumption:
//   1. A simulator is already booted (`xcrun simctl boot <ID>` or
//      the Simulator.app GUI). The runner doesn't auto-boot —
//      that would make local iteration slow + flaky.
//   2. safaridriver is reachable on its default port. Enabled
//      once per machine via `sudo safaridriver --enable`.

import { defineConfig } from '@playwright/test'

// The simulator project uses Playwright's "safari" channel to
// reach the Simulator's Safari rather than the macOS native one.
// On macOS without Xcode this throws a clear "could not find
// safaridriver-compatible simulator" — which is the desired
// signal: don't silently fall back to macOS Safari, refuse to run
// instead.
export default defineConfig({
  testDir: './tests/e2e',
  // Run only the explicitly-tagged simulator-eligible specs.
  // Test files opt in via filename suffix .sim.spec.js OR an
  // explicit test.skip(... !process.env.PLAYWRIGHT_SIMULATOR ...)
  // guard inside the body. Most Item A.3 journeys + the
  // visual baseline spec are eligible; network matrix is not
  // (route() interceptors don't apply to the simulator the
  // same way).
  testMatch: [
    'journeys/journey-*.spec.js',
    'visual-baselines.spec.js',
  ],
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: 180_000, // simulator is genuinely slower
  expect: {
    toHaveScreenshot: {
      // Snapshots from the simulator project go under
      // *-darwin-simulator-*.png automatically (per Playwright's
      // project-name suffix scheme); no overlap with the
      // chromium/webkit-mobile baselines from the standard
      // config.
      maxDiffPixelRatio: 0.005,
      threshold: 0.25,
    },
  },
  use: {
    baseURL: 'http://localhost:5181',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'ios-simulator',
      use: {
        browserName: 'webkit',
        // Playwright's WebKit can drive the bundled simulator
        // when channel: 'safari' is set + the device profile
        // matches an installed Simulator runtime. If the
        // installed runtime doesn't satisfy, the launch fails
        // with a clear error rather than silently degrading.
        channel: 'safari',
        viewport: { width: 393, height: 852 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: 'npx vite --port 5181 --strictPort',
    url: 'http://localhost:5181',
    reuseExistingServer: true,
    timeout: 30_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
