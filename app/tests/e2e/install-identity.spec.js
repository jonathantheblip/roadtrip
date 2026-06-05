import { test, expect } from '@playwright/test'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'

// InstallIdentity (the design's "Make it yours") — each person's home-screen
// app identity. Drives the real flow: trip → Settings → "Your home-screen
// app" → pick a sticker → Add to Home Screen. Asserts the in-app behavior
// (picker, persistence) AND the install plumbing that IS testable (the
// per-person manifest + document.title). The actual iOS home-screen icon is
// best-effort and not CI-verifiable — deliberately not asserted here.

async function openIdentity(page, person) {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await page.goto(`/?person=${person}&nosw=1`)
  await page.getByText('Fun @ the Sun').first().click()
  await page.getByRole('button', { name: 'Trip settings' }).click()
  await page.getByTestId('open-identity').click()
  await expect(page.getByTestId('install-identity')).toBeVisible()
}

test('install-identity: pick a sticker → preview, confirmation, persistence', async ({ page }) => {
  await openIdentity(page, 'aurelia')
  const view = page.getByTestId('install-identity')
  // Aurelia's identity copy.
  await expect(view.getByText('the roll')).toBeVisible()
  await expect(view.getByText(/Make it yours, Aurelia/)).toBeVisible()

  // Pick a non-default sticker.
  const tulip = view.getByRole('button', { name: 'Sticker 🌷' })
  await tulip.click()
  await expect(tulip).toHaveAttribute('aria-pressed', 'true')

  // Add to Home Screen → confirmation names the picked sticker.
  await view.getByRole('button', { name: /Add to Home Screen/ }).click()
  await expect(view.getByText(/Your 🌷 is set/)).toBeVisible()

  // Persistence: reload + reopen → the pick is still selected.
  await page.reload()
  await page.getByText('Fun @ the Sun').first().click()
  await page.getByRole('button', { name: 'Trip settings' }).click()
  await page.getByTestId('open-identity').click()
  await expect(
    page.getByTestId('install-identity').getByRole('button', { name: 'Sticker 🌷' })
  ).toHaveAttribute('aria-pressed', 'true')
})

test('install-identity: the installed manifest + title are per-person', async ({ page }) => {
  // applyInstallIdentity runs on person mount, so the per-person manifest is
  // live without even opening the picker.
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await page.goto('/?person=rafa&nosw=1')
  await page.getByText('Fun @ the Sun').first().click()

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(manifestHref).toContain('data:application/manifest+json')
  const manifest = decodeURIComponent(manifestHref)
  expect(manifest).toContain('Adventures!') // rafa's app name
  expect(manifest).toContain('?person=rafa') // start_url bakes in the person
  expect(await page.title()).toContain('Adventures!')
})
