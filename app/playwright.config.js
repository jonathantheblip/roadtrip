import { defineConfig, devices } from '@playwright/test'

// Playwright config for the roadtrip PWA.
//
// Tests live under app/tests/e2e/ and exercise the actual DOM in
// headless Chromium. The dev server is launched on demand at
// http://localhost:5181 (separate from preview's 5180 so the two
// don't fight for the port). reuseExistingServer keeps re-runs fast.
//
// Network-dependent flows (uploads to the Worker, Background Sync)
// use mocked routes — see tests/e2e/_fixtures/mockWorker.js. The
// Canvas API and WebCodecs are exercised for real against the
// bundled Chromium so the photo downscale and video encode tests
// match what runs in Safari (modulo the iOS WebCodecs subset note
// in tests/e2e/video-encode.spec.js).
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // PWAs share localStorage; sequential keeps state clean
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
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
