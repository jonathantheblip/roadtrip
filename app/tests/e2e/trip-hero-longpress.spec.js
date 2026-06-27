// Long-press a trip's hero to change it (the only working way to set a trip's
// hero — the editor's "Cover photo" wrote a near-dead field and was draft-only).
// A held press on the card hero opens a photo picker; the picked photo becomes the
// REAL hero (heroImage), which wins the card precedence over the auto-resolved one.
import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'
import { resolvePersona } from './_fixtures/persona.js'

const PERSONA = resolvePersona('jonathan')

test('long-press a trip hero → pick a photo → it becomes the explicit hero', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  // Mock the R2 asset upload (POST /assets/photo/...) → the new hero url. Registered
  // AFTER seedTripIntoCache so it wins over that fixture's catch-all (which 404s assets).
  await page.route(/roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/assets\/photo\//, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ key: 'trip-volleyball-2026', url: 'https://roadtrip-sync.test/assets/new-hero.jpg', mime: 'image/jpeg' }),
    })
  })
  await page.goto(`/?person=${PERSONA}&nosw=1`)
  // FIXTURE_TRIP is live → the app opens it on cold load; step back to the trips
  // index where the hero cards (and their long-press affordance) live.
  const fab = page.getByRole('button', { name: /Plan with Claude/i })
  const back = page.getByRole('button', { name: /back to trips/i })
  await expect(fab.or(back).first()).toBeVisible({ timeout: 7000 })
  if (!(await fab.isVisible().catch(() => false))) {
    await back.first().click()
    await expect(fab).toBeVisible({ timeout: 5000 })
  }

  const hero = page.getByTestId('trip-hero-volleyball-2026').first()
  await expect(hero).toBeVisible()

  // Hold the press, then RELEASE: the picker opens on pointerup of a held press
  // (≥450ms, no move) — that release is the user gesture iOS requires for a file
  // dialog (a timer-fired one is blocked). Real Date.now() drives the hold check
  // (clockStub leaves Date.now untouched), so a real wait between down/up holds.
  const chooserP = page.waitForEvent('filechooser')
  await hero.dispatchEvent('pointerdown')
  await page.waitForTimeout(600)
  await hero.dispatchEvent('pointerup')
  const chooser = await chooserP
  await chooser.setFiles({ name: 'ptown.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) })

  // The picked photo is now the trip's explicit hero (heroImage) in the cache.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const all = JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]')
          return (all.find((t) => t.id === 'volleyball-2026') || {}).heroImage || null
        }),
      { timeout: 5000 }
    )
    .toBe('https://roadtrip-sync.test/assets/new-hero.jpg')
})
