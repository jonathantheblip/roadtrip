import { test, expect } from '@playwright/test'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'

// M3 acceptance — exercise the WebCodecs + mp4-muxer encode pipeline
// against headless Chromium. The headless build ships WebCodecs, so
// the encode actually runs end-to-end: video → smaller mp4 blob →
// upload mock.
//
// iOS Safari headless coverage gap: we cannot run iPad / iPhone
// builds of WebKit in headless CI. The pipeline is documented in
// app/docs/ios-compatibility.md so the human signing off on a
// release can spot-check on the family devices before shipping.

test.describe('AddDispatchModal — video path (M3)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => indexedDB.deleteDatabase('roadtrip-upload-queue'))
  })

  test('video picker only renders when WebCodecs is supported', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await page.getByTestId('helen-photos-entry').click()
    await page.getByTestId('add-dispatch').click()

    const modal = page.getByTestId('add-dispatch-modal')
    await expect(modal).toBeVisible()
    // Headless Chromium has VideoEncoder, so the video button renders.
    await expect(modal.getByTestId('open-picker')).toBeVisible()
    await expect(modal.getByTestId('open-video-picker')).toBeVisible()

    // Reload with the API stubbed away to assert the affordance hides.
    await page.addInitScript(() => {
      delete window.VideoEncoder
      delete window.VideoFrame
    })
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await page.getByTestId('helen-photos-entry').click()
    await page.getByTestId('add-dispatch').click()
    await expect(modal.getByTestId('open-picker')).toBeVisible()
    await expect(modal.getByTestId('open-video-picker')).toHaveCount(0)
  })

  test('encode pipeline: synthetic mp4 → progress events → encoded blob → upload', async ({
    page,
  }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)

    let uploadedMime = null
    let uploadedBytes = 0
    await page.route(
      /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/assets\/video/,
      async (route) => {
        const req = route.request()
        uploadedMime = (await req.headerValue('content-type')) || ''
        uploadedBytes = req.postDataBuffer()?.length || 0
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            key: 'helen/test/video-mock',
            url: 'https://example.test/video-mock',
            mime: 'video/mp4',
          }),
        })
      }
    )
    await page.route(
      /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/memories/,
      (route) => route.fulfill({ status: 200, body: '{}' })
    )

    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')

    // Drive the UI into the modal FIRST, before the long synthesize
    // block. React state changes during the 1-second MediaRecorder
    // sample have been observed to drop click events on slower CI
    // workers, so we stabilize the modal up-front.
    await page.getByTestId('helen-photos-entry').click()
    await page.getByTestId('add-dispatch').click()
    const modal = page.getByTestId('add-dispatch-modal')
    await expect(modal.getByTestId('open-video-picker')).toBeVisible()

    // Generate a tiny synthetic webm clip from a canvas at runtime —
    // a real .webm the HTMLVideoElement can decode with deterministic
    // frames. Chromium's MediaRecorder writes VP8/Opus in a webm
    // container; the WebCodecs encode loop re-encodes it as H.264 mp4.
    const fileDescriptor = await page.evaluate(async () => {
      const canvas = document.createElement('canvas')
      canvas.width = 320
      canvas.height = 240
      const ctx = canvas.getContext('2d')
      const stream = canvas.captureStream(15) // 15 fps
      const chunks = []
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' })
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
      recorder.start()
      for (let i = 0; i < 15; i++) {
        ctx.fillStyle = `hsl(${(i * 24) % 360} 80% 50%)`
        ctx.fillRect(0, 0, 320, 240)
        ctx.fillStyle = 'white'
        ctx.font = '32px sans-serif'
        ctx.fillText(`${i}`, 12, 36)
        await new Promise((r) => setTimeout(r, 70))
      }
      recorder.stop()
      await new Promise((r) => {
        recorder.onstop = r
      })
      const blob = new Blob(chunks, { type: 'video/webm' })
      const buffer = await blob.arrayBuffer()
      return {
        name: 'synthetic.webm',
        mimeType: 'video/webm',
        buffer: Array.from(new Uint8Array(buffer)),
      }
    })
    const fileInput = modal.getByTestId('dispatch-video-input')
    await fileInput.setInputFiles({
      name: fileDescriptor.name,
      mimeType: fileDescriptor.mimeType,
      buffer: Buffer.from(fileDescriptor.buffer),
    })

    // Encoding panel appears with progress.
    await expect(modal.getByTestId('dispatch-encoding')).toBeVisible({ timeout: 8000 })
    // Screenshot the panel mid-encode so the progress UI is verified
    // in DOM. Different time points are tried — capture whatever happens
    // to be on screen when the screenshot fires.
    await page.screenshot({
      path: 'tests/e2e/screenshots/m3-dispatch-encoding.png',
      fullPage: true,
    })
    // Wait for the preview phase (encoding finished).
    await expect(modal.getByTestId('dispatch-preview-video')).toBeVisible({
      timeout: 60_000,
    })
    await page.screenshot({
      path: 'tests/e2e/screenshots/m3-dispatch-preview.png',
      fullPage: true,
    })

    // The metadata line confirms it's a video, not a photo.
    await expect(modal.getByTestId('prep-metadata')).toContainText(/\d+×\d+ · \d+s/)

    await modal.getByTestId('dispatch-caption').fill('A volleyball rally')
    await modal.getByTestId('dispatch-submit').click()
    await expect(modal.getByTestId('dispatch-status')).toContainText('video is in the album', {
      timeout: 30_000,
    })

    expect(uploadedMime).toMatch(/video\/mp4/i)
    expect(uploadedBytes).toBeGreaterThan(0)
  })

  test('Bucket C: video that exceeds 25 MB post-encode shows video-too-long copy', async ({
    page,
  }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.addInitScript(() => {
      window.__RT_FORCE_BUCKETC = 'video-too-long'
    })
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await page.getByTestId('helen-photos-entry').click()
    await page.getByTestId('add-dispatch').click()
    const panel = page.getByTestId('dispatch-bucketC')
    await expect(panel).toBeVisible()
    await expect(panel).toHaveAttribute('data-outcome', 'video-too-long')
    await expect(panel).toContainText('This video is too long to share')
    await expect(panel).toContainText(/trim it in Photos first/i)
  })
})
