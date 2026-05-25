import { defineConfig, devices } from '@playwright/test'

// Playwright config for the roadtrip PWA.
//
// Tests live under app/tests/e2e/ and exercise the actual DOM in
// headless Chromium AND headless WebKit (iPhone 15 viewport). The
// dual-project setup is the foundation of the bug trap
// (BUG_TRAP_PUNCHLIST.md Item A.1): when a test passes in Chromium
// but fails in WebKit, that's a real iOS Safari bug, not a flaky
// test. `npm run test:e2e` runs both; merge gate requires both
// green.
//
// The dev server runs at http://localhost:5181 (separate from
// preview's 5180 so the two don't fight for the port).
// reuseExistingServer keeps re-runs fast.
//
// Network-dependent flows (uploads to the Worker, Background Sync)
// use mocked routes — see tests/e2e/_fixtures/mockWorker.js. The
// Canvas API and WebCodecs are exercised for real against both
// bundled engines so the photo downscale and video encode tests
// match what runs in production iOS Safari (modulo the iOS
// WebCodecs subset note in tests/e2e/video-encode.spec.js — that
// gap is exactly what Item A.6's Simulator config closes).
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // PWAs share localStorage; sequential keeps state clean
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  // Treat any change to snapshot baselines as a test failure unless
  // the runner is invoked with --update-snapshots. Keeps visual
  // baselines honest — diffs require an explicit accept.
  expect: {
    toHaveScreenshot: {
      // Per-pixel tolerance so anti-aliased font rendering doesn't
      // flap the suite. 0.2% of pixels and a max channel diff of 8
      // tolerates Helvetica/Inter sub-pixel drift between OS minor
      // versions while still catching real layout regressions.
      maxDiffPixelRatio: 0.002,
      threshold: 0.2,
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
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // iOS Safari coverage. iPhone 15 device profile = 393×852
      // viewport, mobile UA, touch + isMobile, defaultBrowserType
      // 'webkit'. This is the project that catches the bugs
      // headless Chromium silently passes through.
      name: 'webkit-mobile',
      use: { ...devices['iPhone 15'] },
    },
  ],
  webServer: {
    command: 'npx vite --port 5181 --strictPort',
    url: 'http://localhost:5181',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
