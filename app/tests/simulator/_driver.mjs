// iOS Simulator WebDriver lifecycle helpers.
//
// Item A.6 — the real version, after my earlier playwright-based
// scaffold proved Playwright can't natively drive iOS Simulator
// Safari. The path that DOES work uses Apple's safaridriver
// directly: as of recent macOS / iOS releases, safaridriver
// accepts the W3C WebDriver capability `platformName: iOS` plus
// `safari:useSimulator: true` and routes the session to a booted
// simulator. Documented in `man safaridriver` under the W3C
// capabilities section.
//
// We connect via webdriverio (W3C WebDriver client; free + OSS;
// no Appium dependency tree).
//
// Lifecycle:
//   - startDriver({ port }) — spawn safaridriver on the given
//     port; returns a kill() function and the port URL.
//   - newSimulatorSession({ port, baseUrl }) — open a webdriverio
//     session against the booted simulator. Caller MUST
//     deleteSession() when done.
//
// Assumes:
//   - Xcode + at least one iOS Simulator runtime installed
//   - A simulator is already booted (`xcrun simctl boot ...`)
//     before tests run. The runner doesn't auto-boot — that
//     would make local iteration slow + flaky.
//   - safaridriver is enabled (`sudo safaridriver --enable`,
//     one-time per machine).

import { spawn, execSync } from 'node:child_process'
import { remote } from 'webdriverio'

const DEFAULT_PORT = 4567

export function startDriver({ port = DEFAULT_PORT } = {}) {
  // Kill any stale safaridriver synchronously, otherwise an async
  // pkill could race with the new spawn (or worse, kill the
  // freshly-launched one).
  try {
    execSync('pkill -f safaridriver', { stdio: 'ignore' })
  } catch {
    /* nothing to kill is fine */
  }
  const child = spawn('safaridriver', ['--port', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  })
  // Log lines surface on test failure for debugging; they're
  // otherwise silent.
  const logs = []
  child.stdout?.on('data', (b) => logs.push(`[stdout] ${b}`))
  child.stderr?.on('data', (b) => logs.push(`[stderr] ${b}`))
  return {
    port,
    url: `http://127.0.0.1:${port}`,
    logs,
    kill() {
      try {
        child.kill('SIGTERM')
      } catch {
        /* ignore */
      }
    },
  }
}

// Wait for safaridriver's HTTP port to start listening. The
// process is up before the listener; we poll once per 200ms for
// up to ~3 seconds.
export async function waitForDriverReady(url, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  let lastError = ''
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${url}/status`)
      if (r.ok) return true
      lastError = `status ${r.status}`
    } catch (err) {
      lastError = err?.message || String(err)
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(
    `safaridriver did not start listening on ${url} within ${timeoutMs}ms (last: ${lastError})`
  )
}

export async function newSimulatorSession({ port = DEFAULT_PORT } = {}) {
  return remote({
    hostname: '127.0.0.1',
    port,
    path: '/',
    logLevel: 'error',
    capabilities: {
      platformName: 'iOS',
      browserName: 'Safari',
      // The two iOS-specific capabilities documented in
      // `man safaridriver`. Without useSimulator, safaridriver
      // would try to reach a paired real device.
      'safari:useSimulator': true,
      'safari:deviceType': 'iPhone',
    },
  })
}

// Convenience: ensure a simulator is booted. Throws if not, with
// a helpful message pointing at the setup docs.
export async function assertSimulatorBooted() {
  const { execSync } = await import('node:child_process')
  let out = ''
  try {
    out = execSync('xcrun simctl list devices booted', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    throw new Error(
      'xcrun not found. Install Xcode and an iOS Simulator runtime — see app/docs/testing-simulator.md'
    )
  }
  if (!/iPhone/i.test(out)) {
    throw new Error(
      'No iPhone simulator booted. Run `xcrun simctl boot "iPhone 17"` (or another iPhone profile) first.'
    )
  }
}

// Land inside the seeded trip, robust to fixture DATE-ROT.
//
// The sim specs cold-load `/?person=X&trip=<id>`. App.jsx only keeps that `?trip=`
// (landing straight on the trip view) when the trip is "live" — today inside its
// window. A fixture trip whose dates have aged into the past ARCHIVES, so App.jsx
// strips `?trip=` and drops to the trips INDEX, where the per-persona entry points
// (`helen-photos-entry`, the Weave button, etc.) don't exist and every sim spec
// times out at its first `waitForExist`. The date-shifted seed (_seed.mjs) is meant
// to prevent this, but a worker-configured build re-pulls trips over the seeded
// cache on boot, restoring the archived dates.
//
// This helper makes the tier immune to all of that: if we're on the index, TAP the
// trip's card (`trip-hero-<id>`) to open it — archived trips open fine via the card,
// just not via cold-load. If we're already on the trip view (live trip → no card),
// it's a no-op. Polls because a cold sim Safari can be slow to paint. Call it right
// after the `?trip=` navigation, before waiting for the spec's own entry point.
export async function enterSeededTrip(browser, tripId, { timeoutMs = 15000 } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const state = await browser.execute((id) => {
      // Already on the trip view? Any persona home renders a *-photos-entry.
      if (document.querySelector('[data-testid$="-photos-entry"]')) return 'in-trip'
      // On the trips index — tap the trip's card to open it.
      const card = document.querySelector(`[data-testid="trip-hero-${id}"]`)
      if (card) {
        card.click()
        return 'tapped'
      }
      return 'waiting'
    }, tripId)
    if (state === 'in-trip') return state
    if (state === 'tapped') {
      // Give the trip view a beat to mount before the caller's waitForExist.
      await new Promise((r) => setTimeout(r, 800))
      return state
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  return 'timeout'
}
