import { test, expect } from '@playwright/test'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'

// AureliaView's own bespoke UI copy (the photo-album entry + things-to-do
// pill) never got the lc() lowercase-voice treatment homeVoice.js already
// gives the shared living-heart home (#7 features queue). This proves the
// fix reaches her bespoke blocks — and that it's SCOPED to them: the "note
// from Dad" letter is a deliberate exception (a real letter register, kept
// as-is even on her dark roll — see AureliaView.jsx's PersonalLetter comment)
// and must stay untouched.
test('aurelia: her bespoke photo-album + things-to-do copy reads lowercase', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  // FIXTURE_TRIP's window (May 2026) is behind the real system clock, so a
  // direct `?trip=` open bounces to the archive index (App.jsx's active-trip
  // cold-load override) — open it via the same click-through path
  // aurelia-letter-overlay.spec.js uses instead of fighting the clock.
  await page.goto('/?person=aurelia&nosw=1')
  await page.getByText('Fun @ the Sun').first().click()
  await expect(page.getByTestId('aurelia-photos-entry')).toBeVisible({ timeout: 10000 })

  await expect(page.getByTestId('aurelia-photos-entry')).toContainText('the photo album')
  await expect(page.getByTestId('aurelia-photos-entry')).toContainText('every frame, this trip')
  await expect(page.getByTestId('aurelia-photos-entry')).not.toContainText('THE PHOTO ALBUM')

  await expect(page.getByTestId('aurelia-all-photos-entry')).toContainText('every trip')
  await expect(page.getByTestId('aurelia-showme-entry')).toContainText('show me, me')

  // The letter's own chrome is a deliberate exception — never lowercased.
  await expect(page.getByText(/a note from dad/i)).toBeVisible()
})
