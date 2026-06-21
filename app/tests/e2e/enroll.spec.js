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

test('post-cutover: a fresh device (no shared token) sets up via a pasted link, not one-tap', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  // A brand-new device post-cutover: no session for anyone, and the bundled
  // tokens are gone from the build — so there is NO credential to one-tap with.
  await page.addInitScript(() => {
    for (const t of ['jonathan', 'helen', 'aurelia', 'rafa']) localStorage.removeItem('rt_session_' + t)
  })
  await page.goto('/?person=helen&nosw=1')
  await page.getByText('Fun @ the Sun').first().click()
  await openTopMenuItem(page, /Settings/i)

  // One-tap self-enroll is GONE — canSelfEnroll needs an own bundled token, which
  // no longer ships. Enrollment is link-based now.
  await expect(page.getByTestId('settings-selfenroll')).toHaveCount(0)
  // ...the device sets up by pasting a personal link/code an adult minted.
  await expect(page.getByTestId('settings-enroll')).toBeVisible()
})

test('sign out my other devices: an enrolled device revokes the rest, keeps itself (close-the-door item 4)', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  // This device already holds helen's per-device session → the button shows.
  await page.addInitScript(() => localStorage.setItem('rt_session_helen', 'sess-helen-here'))
  let revokeBody = null
  await page.route('**/auth/revoke', async (route) => {
    revokeBody = route.request().postDataJSON?.() || {}
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, revoked: 2 }) })
  })
  await page.goto('/?person=helen&nosw=1')
  await page.getByText('Fun @ the Sun').first().click()
  await openTopMenuItem(page, /Settings/i)

  const btn = page.getByTestId('settings-signout-others')
  await expect(btn).toBeVisible()
  await btn.click()
  await expect(page.getByTestId('settings-device-msg')).toContainText(/Signed out 2 other devices/i)
  // It revoked all OTHER sessions but kept THIS device's (except = our session).
  expect(revokeBody).toEqual({ all: true, except: 'sess-helen-here' })
})

test('post-cutover: a device with no login offers neither one-tap self-enroll nor sign-out (link setup only)', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await page.addInitScript(() => {
    for (const t of ['jonathan', 'helen', 'aurelia', 'rafa']) localStorage.removeItem('rt_session_' + t)
  })
  await page.goto('/?person=jonathan&nosw=1')
  await page.getByText('Fun @ the Sun').first().click()
  await openTopMenuItem(page, /Settings/i)
  await expect(page.getByTestId('settings-selfenroll')).toHaveCount(0) // no bundled token → no one-tap
  await expect(page.getByTestId('settings-signout-others')).toHaveCount(0) // no session → nothing to sign out
  await expect(page.getByTestId('settings-enroll')).toBeVisible() // ...but you can still set up with a code
})

test('a non-adult is enrolled-but-restricted: she can sign out her devices but cannot mint a link for someone else', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  // Aurelia is enrolled on this device — the per-device session is seeded for all
  // personas via storageState (the post-cutover credential; bundled tokens are gone).
  await page.goto('/?person=aurelia&nosw=1')
  await page.getByText('Fun @ the Sun').first().click()
  await openTopMenuItem(page, /Settings/i)

  // She holds her own session → she can sign out her other devices...
  await expect(page.getByTestId('settings-signout-others')).toBeVisible()
  // ...but a non-adult NEVER gets the "create a link for someone else" control
  // (minting for others is adult-only — enforced on the worker too).
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

test('a dead session self-heals: a 401 clears the dead session (post-cutover: no bundled fallback)', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  // /memories: 401 for the dead session token, 200 (empty) for anything else
  // (post-cutover the retry carries no credential — the dead session is simply
  // dropped and the device re-enrolls). Registered after the seed so it wins.
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
