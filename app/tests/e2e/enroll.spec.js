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

async function mockMintLink(page) {
  // The worker mints a one-time link for the requested traveler; echo it back as
  // a {url, token} the UI can show / chain into a redeem.
  await page.route('**/auth/link', async (route) => {
    const body = route.request().postDataJSON?.() || {}
    const token = 'mintedtoken1234567890ABCDEF_-'
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        url: `https://jonathantheblip.github.io/roadtrip/?enroll=${token}`,
        token,
        traveler: body.traveler || 'jonathan',
        expiresAt: 9999999999999,
      }),
    })
  })
}

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

test('self-enroll: an adult sets up their own device in one tap (mint + redeem)', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await mockMintLink(page) // /auth/link
  await mockRedeem(page, 'helen') // /auth/redeem — registered last so it wins
  await page.goto('/?person=helen&nosw=1') // helen has the bundled token in e2e (an adult)
  await page.getByText('Fun @ the Sun').first().click()
  await openTopMenuItem(page, /Settings/i)

  await page.getByTestId('settings-selfenroll').click()
  await expect(page.getByTestId('settings-device-msg')).toContainText(/signed in as Helen/i)
  // The one-tap path stored a real per-device session under the active adult.
  const stored = await page.evaluate(() => localStorage.getItem('rt_session_helen'))
  expect(stored).toBe('sess-e2e-xyz')
})

test('self-enroll is for everyone: a non-adult self-mints with HER OWN credential, and cannot mint for others', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  // Capture the credential the mint call actually sends.
  let mintAuth = null
  await page.route('**/auth/link', async (route) => {
    mintAuth = route.request().headers()['authorization'] || ''
    const token = 'mintedtoken1234567890ABCDEF_-'
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: `https://jonathantheblip.github.io/roadtrip/?enroll=${token}`, token, traveler: 'aurelia', expiresAt: 9999999999999 }),
    })
  })
  await mockRedeem(page, 'aurelia')
  await page.goto('/?person=aurelia&nosw=1') // a non-adult, with her own bundled token (test env)
  await page.getByText('Fun @ the Sun').first().click()
  await openTopMenuItem(page, /Settings/i)

  // The one-tap self-enroll button is present for a non-adult.
  await page.getByTestId('settings-selfenroll').click()
  await expect(page.getByTestId('settings-device-msg')).toContainText(/signed in as Aurelia/i)
  // It minted with AURELIA's OWN token — NOT a cross-traveler fallback to Helen's.
  expect(mintAuth).toContain('aurelia')
  expect(mintAuth).not.toContain('helen')
  const stored = await page.evaluate(() => localStorage.getItem('rt_session_aurelia'))
  expect(stored).toBe('sess-e2e-xyz')
  // ...but a non-adult never gets the "create a link for someone else" control.
  await expect(page.getByTestId('settings-createlink')).toHaveCount(0)
})

test('an adult can mint a setup link for another family member (to text them)', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await mockMintLink(page)
  await page.goto('/?person=helen&nosw=1')
  await page.getByText('Fun @ the Sun').first().click()
  await openTopMenuItem(page, /Settings/i)

  await page.getByTestId('settings-createlink').click()
  await page.getByTestId('settings-create-picker').getByRole('button', { name: 'Aurelia' }).click()
  const link = page.getByTestId('settings-createdlink')
  await expect(link).toBeVisible()
  await expect(link).toContainText('enroll=') // a real, shareable enroll link
})

test('a dead session self-heals: a 401 clears it and falls back to the bundled token', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  // /memories: 401 for the dead session token, 200 (empty) for anything else
  // (i.e. the bundled-token retry). Registered after the seed so it wins.
  await page.route('**/memories**', async (route) => {
    const auth = route.request().headers()['authorization'] || ''
    if (auth.includes('dead-session')) {
      return route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"unauthorized"}' })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  // Plant a dead session for helen BEFORE the app boots; the auto-sync will send
  // it, get 401, and must clear it + retry with helen's bundled token.
  await page.addInitScript(() => localStorage.setItem('rt_session_helen', 'dead-session'))
  await page.goto('/?person=helen&nosw=1')
  await page.getByText('Fun @ the Sun').first().click()

  // Without the self-heal the dead session would 401 forever; with it, it's gone.
  await expect.poll(() => page.evaluate(() => localStorage.getItem('rt_session_helen'))).toBeNull()
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
