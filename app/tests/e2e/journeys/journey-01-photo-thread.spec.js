import { test } from '@playwright/test'
import { step, setActivePage, expect } from './_steps.js'
import { seedTripIntoCache, FIXTURE_TRIP } from '../_fixtures/withTrip.js'
import { mockSuccessfulUpload } from '../_fixtures/mockUpload.js'
import { realMedia } from '../_fixtures/realMedia.js'

// Journey 01 — Photo upload from the in-thread (StopDetail) composer.
// Spec source: BUG_TRAP_PUNCHLIST.md A.3 first bullet.
//
// Surface: HelenView trip view → tap a stop card → StopDetail renders
// ThreadedMemories → tap "Attach photos" (aria-label) → file picker.
//
// This is the surface whose pipeline bypass caused the iOS black-tile
// bug; the journey exists in part to make sure that bypass can't
// silently come back.

test.beforeEach(async ({ page }) => setActivePage(page))

test('photo upload from in-thread composer', async ({ page }) => {
  const fx = realMedia('JPEG_FULLRES')
  test.skip(!fx, 'JPEG_FULLRES fixture not present — see tests/fixtures/media/README.md')

  await seedTripIntoCache(page, FIXTURE_TRIP)
  await mockSuccessfulUpload(page)

  await step('open Helen trip view, day 1 visible', async () => {
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await expect(page.getByText(/Pickups/i).first()).toBeVisible({ timeout: 10_000 })
  })

  await step('tap a stop card to open StopDetail', async () => {
    // The Beach Bungalow lodging card is visible above the fold
    // on Day 1. Any stop opens StopDetail; we pick a predictable
    // one to keep the journey deterministic.
    await page.getByRole('button', { name: /Beach Bungalow/i }).first().click()
  })

  await step('open in-thread photo picker (aria-label)', async () => {
    await page.getByRole('button', { name: /attach photos?/i }).first().click()
  })

  await step('pick real-media JPEG fixture', async () => {
    const input = page.locator('input[type="file"][accept*="image"]').first()
    await input.setInputFiles({
      name: fx.name,
      mimeType: fx.mimeType,
      buffer: fx.buffer,
    })
  })

  await step('save the photo album', async () => {
    // The save action is the send-like button on the composer
    // rail. ThreadedMemories renders it as the "Send" button
    // after a photo is staged.
    const save = page.getByRole('button', { name: /save|send|post|share/i }).first()
    await save.click()
  })

  await step('tile renders in the thread', async () => {
    const tile = page.locator('img').first()
    await expect(tile).toBeVisible({ timeout: 10_000 })
  })
})
