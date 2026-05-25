// iOS Simulator smoke — proves the gate's plumbing end-to-end:
// safaridriver starts, connects to the booted iOS Simulator's
// Safari, navigates to the dev server (must be running on 5181),
// reads the rendered title.
//
// Failure modes per `app/docs/testing-simulator.md`. Run this
// before any deeper simulator-test work to confirm setup.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  startDriver,
  waitForDriverReady,
  newSimulatorSession,
  assertSimulatorBooted,
} from './_driver.mjs'

const BASE_URL = process.env.SIMULATOR_BASE_URL || 'http://localhost:5181'

test('boot + navigate + read title from iOS Simulator Safari', async (t) => {
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
  await browser.url(BASE_URL + '/?nosw=1')
  const title = await browser.getTitle()
  assert.match(title, /Jackson Family/i, `unexpected page title: ${title}`)
})
