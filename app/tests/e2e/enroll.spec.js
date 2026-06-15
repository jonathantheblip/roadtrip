import { test, expect } from '@playwright/test'
import { openTopMenuItem } from './_fixtures/topNav.js'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'

// Magic-link enrollment (013, client). The enroll screen is SMART about where
// it runs: in a normal browser tab (Playwright's default — NOT a standalone
// installed PWA) a link shows the "copy code / set up here" choice; redeeming
// stores a per-device session. The iOS standalone auto-redeem path is covered by
// the unit test (isStandalone) — Playwright can't emulate display-mode:standalone.
//
// Every /auth/redeem call is MOCKED (page.route) so this is hermetic — no real
// link token, no real worker. A valid-looking opaque token (≥20 base64url chars)
// is needed only so the client's tokenFromInput accepts it before the fetch.

const FAKE_TOKEN = 'faketoken1234567890ABCDEF_-'

async function mockRedeem(page, traveler = 'helen') {
  await page.route('**/auth/redeem', async (route) => {
    const body = route.request().postDataJSON?.() || {}
    // Echo the contract: a non-empty linkToken → a session for `traveler`.
    if (!body.linkToken) {
      return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'invalid or expired link' }) })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ sessionToken: 'sess-e2e-xyz', traveler }),
    })
  })
}

test('enroll via link in a browser tab → choose → set up here → done, session stored', async ({ page }) => {
  await mockRedeem(page, 'helen')
  await page.goto(`/?enroll=${FAKE_TOKEN}&nosw=1`)

  // Browser tab (not standalone) → the choice screen, NOT an auto-redeem.
  const view = page.getByTestId('enroll')
  await expect(view).toBeVisible()
  await expect(page.getByTestId('enroll-choose')).toBeVisible()
  await expect(page.getByTestId('enroll-copy')).toBeVisible()

  // "Just set me up in this browser" → redeem → done, naming the traveler.
  await page.getByTestId('enroll-here').click()
  await expect(page.getByTestId('enroll-done')).toBeVisible()
  await expect(view.getByText(/You're all set, Helen/)).toBeVisible()

  // The session is stored on THIS device under the redeemed traveler.
  const stored = await page.evaluate(() => localStorage.getItem('rt_session_helen'))
  expect(stored).toBe('sess-e2e-xyz')
})

test('the copy hand-off (iOS): "copy code & open my app" surfaces the code to paste', async ({ page }) => {
  await mockRedeem(page)
  // Grant clipboard so the copy path doesn't reject (the visible code box is the
  // fallback either way).
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {})
  await page.goto(`/?enroll=${FAKE_TOKEN}&nosw=1`)

  await page.getByTestId('enroll-copy').click()
  await expect(page.getByTestId('enroll-copied')).toBeVisible()
  // The code is shown for a manual paste fallback, and copied to the clipboard.
  await expect(page.getByTestId('enroll-copied')).toContainText(FAKE_TOKEN)
})

test('a transient redeem failure on a tapped link is recoverable via "Try again" (not a dead-end)', async ({ page }) => {
  // First redeem attempt fails at the NETWORK level (worker never reached → the
  // one-time link is NOT consumed); the second succeeds. The screen must offer a
  // direct retry of the same link, not strand the user on an empty paste field.
  let calls = 0
  await page.route('**/auth/redeem', async (route) => {
    calls += 1
    if (calls === 1) return route.abort('failed')
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ sessionToken: 'sess-after-retry', traveler: 'helen' }),
    })
  })
  await page.goto(`/?enroll=${FAKE_TOKEN}&nosw=1`)

  await page.getByTestId('enroll-here').click() // "set me up in this browser" → redeem (fails)
  await expect(page.getByTestId('enroll-error')).toBeVisible()
  await expect(page.getByTestId('enroll-retry')).toBeVisible() // recoverable: same link is safe to retry

  await page.getByTestId('enroll-retry').click() // → second attempt succeeds
  await expect(page.getByTestId('enroll-done')).toBeVisible()
  const stored = await page.evaluate(() => localStorage.getItem('rt_session_helen'))
  expect(stored).toBe('sess-after-retry')
})

test('an invalid pasted code keeps the submit disabled (no junk redeem)', async ({ page }) => {
  // Seed FIRST, then the redeem mock — Playwright runs the last-registered
  // matching route first, and seedTripIntoCache installs a catch-all that 404s
  // anything it doesn't recognize (which would otherwise swallow /auth/redeem).
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await mockRedeem(page)
  await page.goto('/?person=helen&nosw=1')
  await page.getByText('Fun @ the Sun').first().click()
  await openTopMenuItem(page, /Settings/i)

  // "Set up this device" → the paste screen.
  await page.getByTestId('settings-enroll').click()
  await expect(page.getByTestId('enroll-paste')).toBeVisible()

  // Junk → submit disabled.
  await page.getByTestId('enroll-input').fill('nope')
  await expect(page.getByTestId('enroll-submit')).toBeDisabled()

  // A valid-looking code → enabled → redeem → done.
  await page.getByTestId('enroll-input').fill(FAKE_TOKEN)
  await expect(page.getByTestId('enroll-submit')).toBeEnabled()
  await page.getByTestId('enroll-submit').click()
  await expect(page.getByTestId('enroll-done')).toBeVisible()
})
