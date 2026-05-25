import { test } from '@playwright/test'
import { step, setActivePage, expect } from './_steps.js'
import { seedTripIntoCache, FIXTURE_TRIP } from '../_fixtures/withTrip.js'
import { mockShareInWorker } from '../_fixtures/mockUpload.js'

// Journey 05 — Share-In via paste.
// Spec source: BUG_TRAP_PUNCHLIST.md A.3 fifth bullet.
//
// Surface: HelenView → Things to do (ActivitiesView) → "Add from
// link" → paste interstitial → ImportView confirmation card → Save.
// Mocks the Worker's /resolve + /draft endpoints with sensible
// defaults; the journey verifies the client funnel + the
// confirmation-card pattern.

const SIFT_URL =
  'https://www.google.com/maps/place/Sift+Bake+Shop/@41.3722,-71.9667,17z'

test.beforeEach(async ({ page }) => setActivePage(page))

test('share-in via paste lands an activity', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await mockShareInWorker(page, {
    draftResponse: {
      tags: ['helen', 'jonathan'],
      descriptions: {
        helen: 'Light bouncing off the harbor — morning bun before it sells out.',
        jonathan: 'In, coffee, out, drive on.',
      },
    },
  })

  await step('open Things to do from Helen view', async () => {
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await page.getByRole('button', { name: /Things to do/i }).first().click()
  })

  await step('open Share-In paste interstitial', async () => {
    await page.getByTestId('open-share-in').click()
  })

  await step('paste a Google Maps URL', async () => {
    await page.getByTestId('share-in-url').fill(SIFT_URL)
    await page.getByTestId('share-in-go').click()
  })

  await step('confirmation card pre-fills name', async () => {
    await expect(page.locator('[data-testid="import-name"]')).toHaveValue(
      'Sift Bake Shop',
      { timeout: 10_000 }
    )
  })

  await step('pick category + verify per-traveler descriptions', async () => {
    // Category is a required field; pick the first option.
    await page.getByTestId('import-category').selectOption({ index: 1 })
    // Descriptions for tagged travelers should be pre-filled by the
    // mocked /draft response.
    await expect(page.getByTestId('import-desc-helen')).toHaveValue(/morning bun/i)
    await expect(page.getByTestId('import-desc-jonathan')).toHaveValue(/coffee/i)
  })

  await step('save activity', async () => {
    await page.getByTestId('import-save').click()
    await expect(page.getByTestId('import-saved')).toBeVisible({ timeout: 5000 })
  })
})
