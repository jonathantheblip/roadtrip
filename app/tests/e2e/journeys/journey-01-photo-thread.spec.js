import { test } from '@playwright/test'
import { step, setActivePage, expect } from './_steps.js'
import { seedTripIntoCache, FIXTURE_TRIP } from '../_fixtures/withTrip.js'
import { mockSuccessfulUpload } from '../_fixtures/mockUpload.js'
import { realMedia } from '../_fixtures/realMedia.js'
import { WEBKIT_IDB_BLOB_REASON } from '../_fixtures/webkitIdbBlobGate.js'

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

test('photo upload from in-thread composer', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', WEBKIT_IDB_BLOB_REASON)
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

  await step('open in-thread photo picker', async () => {
    await page.getByTestId('threaded-photo-picker').first().click()
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
    // After staging a photo, ThreadedMemories renders the
    // "Save N to thread" button on the composer rail.
    await page.getByTestId('threaded-photo-save').first().click()
  })

  await step('memory lands in the thread', async () => {
    // The mocked /assets/photo response returns a fake URL, so the
    // tile's <img> won't load real bytes. Assert on the saved-memory
    // signals instead: the "N memory · live thread" header text and
    // the Delete button that appears next to a saved memory.
    await expect(page.getByText(/\b\d+ memory\b/i)).toBeVisible({
      timeout: 10_000,
    })
    await expect(
      page.getByRole('button', { name: /delete memory/i }).first()
    ).toBeVisible()
  })
})
