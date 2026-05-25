import { test } from '@playwright/test'
import { step, setActivePage, expect } from './_steps.js'
import { seedTripIntoCache, FIXTURE_TRIP } from '../_fixtures/withTrip.js'
import { mockSuccessfulUpload } from '../_fixtures/mockUpload.js'
import { realMedia } from '../_fixtures/realMedia.js'

// Journey 03 — Video upload via the AddDispatchModal video path.
// Spec source: BUG_TRAP_PUNCHLIST.md A.3 third bullet.
//
// Real-media fixture: 5-second 1080p iPhone .mov (~10 MB). The
// dispatch modal's WebCodecs encode pipeline runs against actual
// h.264 + AAC iPhone bytes, surfacing any format-specific
// regressions.

test.beforeEach(async ({ page }) => setActivePage(page))

test('video upload from album dispatch composer', async ({ page }) => {
  const fx = realMedia('VIDEO_1080P_5S')
  test.skip(!fx, 'VIDEO_1080P_5S fixture not present')

  await seedTripIntoCache(page, FIXTURE_TRIP)
  await mockSuccessfulUpload(page)

  await step('open Photos album → add-dispatch', async () => {
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await page.getByTestId('helen-photos-entry').click()
    await page.getByTestId('add-dispatch').click()
    await expect(page.getByTestId('add-dispatch-modal')).toBeVisible()
  })

  await step('pick real-media video fixture', async () => {
    // Video picker is a separate file input — only renders when
    // WebCodecs is available, so this step also serves as a
    // smoke for "video picker appears on this engine".
    const input = page.getByTestId('dispatch-video-input')
    await expect(input).toBeAttached({ timeout: 10_000 })
    await input.setInputFiles({
      name: fx.name,
      mimeType: fx.mimeType,
      buffer: fx.buffer,
    })
  })

  await step('encode progress UI advances', async () => {
    // The encode is async; the progress UI must surface during
    // it. We accept progress visible OR direct jump to preview
    // (a small fixture can encode faster than the assertion
    // can latch).
    const encoding = page.getByTestId('dispatch-encoding')
    const preview = page.getByTestId('dispatch-preview-video')
    await Promise.race([
      encoding.waitFor({ state: 'visible', timeout: 30_000 }),
      preview.waitFor({ state: 'visible', timeout: 30_000 }),
    ])
  })

  await step('preview renders + submit', async () => {
    await expect(page.getByTestId('dispatch-preview-video')).toBeVisible({
      timeout: 60_000,
    })
    await page.getByTestId('dispatch-submit').click()
    await expect(page.getByTestId('dispatch-status')).toContainText(/saved/i, {
      timeout: 30_000,
    })
  })
})
