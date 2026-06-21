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
    // Post-"close the door": auth is per-device SESSIONS only (the bundled
    // FAMILY_TOKEN_* are gone from the build). Seed a session for all four
    // personas so isWorkerConfigured() is true and the dock offers everyone —
    // the runtime equivalent of the old all-four-bundled-tokens state. Specs that
    // need a FRESH/no-credential device clear these in an addInitScript (enroll).
    storageState: './tests/e2e/_fixtures/authState.json',
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
    // Config floor for the e2e suite's auth. The client only talks to the worker
    // (and the claude-* specs only fire their page.route'd requests) when
    // isWorkerConfigured() is true — i.e. VITE_WORKER_URL set AND at least one
    // credential present (see src/lib/workerSync.js). Post-"close the door" the
    // ONLY credential is a per-device SESSION (the bundled FAMILY_TOKEN_* are gone
    // from the build), so the four sessions are seeded in localStorage via
    // `use.storageState` above — NOT here. This env block sets only the worker
    // URL. The URL is the public worker origin because the route regexes match on
    // that host; every network flow is page.route-mocked, so nothing is validated.
    env: {
      VITE_WORKER_URL: 'https://roadtrip-sync.jonathan-d-jackson.workers.dev',
    },
  },
})
