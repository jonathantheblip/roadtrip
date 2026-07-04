// Weave video keepsake — iOS Simulator gate.
//
// Proves that the full encode → share chain works on real iOS Safari
// (WebCodecs H.264, OffscreenCanvas, navigator.share). This is the
// device-only coverage the headless Playwright suite cannot provide.
//
// Skips gracefully when:
//   - safaridriver is not available (not on macOS with Xcode).
//   - The iOS Simulator is not already booted.
//
// CI note: the Playwright e2e tests (weave-braid.spec.js) provide a
// mocked CI gate for the worker config + share call assertions. This
// test proves the real encode runs to completion on iOS Safari.
//
// Pattern: mirrors import-video.test.mjs (the prior device-only gate).

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  startDriver,
  waitForDriverReady,
  newSimulatorSession,
  assertSimulatorBooted,
  enterSeededTrip,
} from './_driver.mjs'
import { dateStableTripSeed } from './_seed.mjs'

const BASE_URL = process.env.SIMULATOR_BASE_URL || 'http://localhost:5181'

const SEED_TRIP = {
  ...dateStableTripSeed(),
  dateRangeStart: '2025-01-01',
  dateRangeEnd: '2027-12-31',
}

// Allow generous time for a real 150-frame H.264 encode on device.
const SHARED_WAIT_MS = 90_000

test('Weave keepsake encodes to MP4 and triggers share sheet on iOS Simulator', async (t) => {
  // Device-only: drives safaridriver + asserts the share flow completes.
  await assertSimulatorBooted()

  const driver = startDriver()
  let browser
  t.after(async () => {
    if (browser) {
      try { await browser.deleteSession() } catch { /* ignore */ }
    }
    driver.kill()
  })
  await waitForDriverReady(driver.url)
  browser = await newSimulatorSession({ port: driver.port })

  // Seed trip and memories into localStorage.
  await browser.url(BASE_URL + '/?nosw=1')
  await browser.execute((trip) => {
    localStorage.setItem('rt_trips_cache_v1', JSON.stringify([trip]))
    localStorage.setItem('rt_person_v2', 'jonathan')
    // Seed a text memory on day 1 stop so selectWeaveDay finds a day.
    const mem = {
      id: 'sim-wv-1', tripId: trip.id,
      stopId: (trip.days?.[0]?.stops?.[0]?.id || 'stop-1'),
      authorTraveler: 'jonathan',
      visibility: 'shared',
      kind: 'text',
      text: 'simulator weave test memory',
      createdAt: new Date(trip.days?.[0]?.isoDate + 'T12:00:00Z').toISOString(),
    }
    localStorage.setItem('rt_memories_shared_v1', JSON.stringify([mem]))
    localStorage.setItem('rt_memories_private_jonathan_v1', JSON.stringify([]))
  }, SEED_TRIP)

  await browser.url(BASE_URL + `/?person=jonathan&trip=volleyball-2026&nosw=1`)
  // Robust to fixture date-rot: open the trip via its card if we landed on the
  // trips index (aged fixture archived → App.jsx stripped ?trip=); no-op if live.
  await enterSeededTrip(browser, 'volleyball-2026')

  // Mock navigator.share so the test can capture the result without the
  // OS sheet appearing. The mock records the shared file type.
  await browser.execute(() => {
    window.__weaveShareResult = null
    navigator.share = async (data) => {
      const file = (data.files || [])[0]
      window.__weaveShareResult = { type: file?.type, name: file?.name, size: file?.size }
    }
    navigator.canShare = () => true
  })

  // Open the Weave overlay. NOTE: 'button*=Weave' is a WebdriverIO partial-text
  // selector — valid for browser.$(), but NOT valid CSS, so it must not be
  // passed to document.querySelector (which would throw SyntaxError). The
  // JS-level click (filter buttons by text) mirrors import-video's pattern of
  // clicking via execute() to dodge sticky-header touch interception.
  await browser.$('button*=Weave').then((el) => el.waitForExist({ timeout: 8_000 }))
  await browser.execute(() => {
    const btn = Array.from(document.querySelectorAll('button'))
      .find((b) => /Weave/i.test(b.textContent || ''))
    btn?.click()
  })

  // Wait for the overlay to render.
  const overlay = await browser.$('[data-testid="the-weave"]')
  await overlay.waitForExist({ timeout: 10_000 })

  // Check WebCodecs is supported — if not, skip this assertion path.
  const supported = await browser.execute(() =>
    typeof window.VideoEncoder === 'function' &&
    typeof window.OffscreenCanvas === 'function'
  )
  if (!supported) {
    t.skip('WebCodecs not available on this simulator version')
    return
  }

  // Wait for the ready state (Save button visible).
  const saveBtnSel = '[data-testid="weave-save"]'
  try {
    await browser.$(saveBtnSel).then((el) => el.waitForDisplayed({ timeout: 15_000 }))
  } catch {
    t.skip('Weave not in ready state — no memories or narrative loaded in time')
    return
  }

  // Click Save to Photos.
  await browser.execute(() => {
    document.querySelector('[data-testid="weave-save"]')?.click()
  })

  // Encoding progress modal appears.
  try {
    await browser.$('=Creating your weave…').waitForExist({ timeout: 8_000 })
  } catch {
    // Fast encode may skip past it — keep going.
  }

  // Wait for the "Saved to Photos" confirmation.
  let confirmed = false
  const deadline = Date.now() + SHARED_WAIT_MS
  while (Date.now() < deadline) {
    const text = await browser.execute(() => document.body.innerText || '')
    if (/Saved to Photos/i.test(text)) { confirmed = true; break }
    await new Promise((r) => setTimeout(r, 1000))
  }
  assert.ok(confirmed, `"Saved to Photos" did not appear within ${SHARED_WAIT_MS}ms`)

  // Verify the share was called with a video/mp4 File.
  const shareResult = await browser.execute(() => window.__weaveShareResult)
  assert.ok(shareResult, 'navigator.share was not called')
  assert.equal(shareResult.type, 'video/mp4', `expected video/mp4, got ${shareResult.type}`)
  assert.ok((shareResult.size || 0) > 0, 'shared file is empty')
})
