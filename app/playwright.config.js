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
    // Config floor for the claude-* e2e specs. The chat client only fires
    // the /claude/* requests that page.route intercepts when
    // isWorkerConfigured() is true — i.e. VITE_WORKER_URL + at least one
    // VITE_FAMILY_TOKEN_* present at vite-serve time (see
    // src/lib/workerSync.js). Without them, workerFetch throws "worker not
    // configured" BEFORE any route can fire, so every claude spec goes red
    // on a bare clone (no .env is committed). Setting them here makes the
    // suite env-independent.
    //
    // The token is a TRANSPARENTLY-FAKE placeholder, NOT a credential: every
    // e2e network flow is mocked via page.route, which fulfills before the
    // request ever reaches the worker, so the token is never transmitted or
    // validated. Any non-empty string works. The URL is the public worker
    // origin only because the route regexes match on that host.
    // ALL FOUR family tokens are set so the e2e build matches the PRODUCTION
    // pre-cutover state (deploy-client.yml bakes all four). The enrolled-only
    // persona switcher offers a persona only when the device holds a credential
    // for it (session OR bundled token), so a PARTIAL token set here would make
    // the dock narrow + show the "add a family member" pill in CI — a state that
    // does NOT match the deployed all-four dock. With all four present the dock
    // is unchanged (the narrowing only fires post-cutover, when the tokens are
    // removed — that path is unit-tested in scripts/__tests__/auth.test.mjs since
    // it can't be reproduced while ANY bundled token ships). Transparently FAKE —
    // every network flow is page.route-mocked, so the tokens are never validated.
    env: {
      VITE_WORKER_URL: 'https://roadtrip-sync.jonathan-d-jackson.workers.dev',
      VITE_FAMILY_TOKEN_JONATHAN: 'fake-e2e-token-jonathan-routes-are-mocked-not-a-credential',
      VITE_FAMILY_TOKEN_HELEN: 'fake-e2e-token-helen-routes-are-mocked-not-a-credential',
      // Aurelia (a non-adult) has her OWN bundled token so the self-enroll spec can
      // verify she self-mints with HER credential, not a cross-traveler fallback.
      VITE_FAMILY_TOKEN_AURELIA: 'fake-e2e-token-aurelia-routes-are-mocked-not-a-credential',
      VITE_FAMILY_TOKEN_RAFA: 'fake-e2e-token-rafa-routes-are-mocked-not-a-credential',
    },
  },
})
