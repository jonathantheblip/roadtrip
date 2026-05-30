// iOS Simulator video-encode journey — the iOS-real coverage that
// R3a's Playwright skip delegates to. R3a gated the synthetic
// encode-pipeline test on `browserName === 'webkit'` because
// Playwright's bundled WebKit can't run the full encode end-to-end
// (modal never advances past the picker after setInputFiles).
//
// This test is the same surface but driven against real iOS Safari
// inside the booted Simulator via safaridriver + webdriverio. Uses a
// real 5-second 1080p .mov fixture from the LFS-tracked corpus, so
// the WebCodecs path is exercised against actual h.264 + AAC iPhone
// bytes — exactly what Helen's phone would feed it.
//
// Success signal: `[data-testid="dispatch-preview-video"]` becomes
// visible. The test STOPS before submitting — the upload-to-Worker
// path is a different concern, mocked in the Playwright suite. Here
// we only assert "WebCodecs encode produces a previewable mp4".
//
// Lessons learned while building this gate (preserved in the per-step
// comments below):
//   - WebDriver pointer clicks on iOS Safari go to the topmost
//     z-indexed element under the coordinate, which on PhotosView /
//     HelenView is the fixed-position sticky banner. JS-level clicks
//     bypass this overlap.
//   - safaridriver's Element Send Keys command fails on display:none
//     file inputs (strict displayed-check). Inject the file via
//     fetch(/@fs/abs-path) + File + DataTransfer + dispatchEvent.
//   - iOS Safari's WebCodecs requires explicit `duration` on every
//     VideoFrame; without it, the chunk's duration is unset and
//     mp4-muxer rejects. Surfaced via this test; fixed in
//     encodeVideo.worker.js (R3b).
//   - iOS Safari's rVFC `metadata.mediaTime` can repeat across
//     consecutive callbacks for some .mov files. Clamp to strict
//     monotonicity in walkAllFrames (videoPipeline.js).

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  startDriver,
  waitForDriverReady,
  newSimulatorSession,
  assertSimulatorBooted,
} from './_driver.mjs'
import { dateStableTripSeed } from './_seed.mjs'

const BASE_URL = process.env.SIMULATOR_BASE_URL || 'http://localhost:5181'
// Date-stable seed (see _seed.mjs) — the sim tier has no clockStub.js, so
// the raw May-2026 fixture would bounce to the trips index on today's clock.
const SEED_TRIP = dateStableTripSeed()
const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = resolve(
  HERE,
  '..',
  'fixtures',
  'media',
  'iphone-video-1080p-5s.mov'
)

test('WebCodecs encode pipeline runs end-to-end on iOS Simulator Safari', async (t) => {
  await assertSimulatorBooted()
  if (!existsSync(FIXTURE_PATH)) {
    t.skip(`real-media fixture not present at ${FIXTURE_PATH} — see app/tests/fixtures/media/README.md`)
    return
  }
  const driver = startDriver()
  let browser
  t.after(async () => {
    if (browser) {
      try { await browser.deleteSession() } catch { /* ignore */ }
    }
    driver.kill()
  })
  await waitForDriverReady(driver.url)
  browser = await newSimulatorSession({ port: driver.port })

  // Seed the trip cache so PhotosView has trip context. Webdriverio
  // has no Playwright-style addInitScript, so we navigate once to
  // establish origin, write localStorage, then re-navigate.
  await browser.url(BASE_URL + '/?nosw=1')
  await browser.execute((trip) => {
    const KEYS_TO_CLEAR = [
      'rt_trips_cache_v1',
      'rt_memories_shared_v1',
      'rt_memories_private_jonathan_v1',
      'rt_memories_private_helen_v1',
      'rt_memories_private_aurelia_v1',
      'rt_memories_private_rafa_v1',
    ]
    for (const k of KEYS_TO_CLEAR) localStorage.removeItem(k)
    localStorage.setItem('rt_trips_cache_v1', JSON.stringify([trip]))
    localStorage.setItem('rt_person_v2', 'helen')
  }, SEED_TRIP)

  await browser.url(BASE_URL + '/?person=helen&trip=volleyball-2026&nosw=1')

  // Drive into the dispatch modal via JS-level clicks (not WebDriver
  // pointer clicks). iOS Safari + safaridriver dispatches a real touch
  // sequence that hits the topmost element under the coordinate; the
  // fixed-position sticky headers in PhotosView and HelenView overlay
  // the actual buttons we want to click, so the touch event gets
  // intercepted. Calling .click() directly on the React onClick handler
  // bypasses pointer-events / overlay entirely.
  const clickByTestId = async (testid) => {
    await browser.$(`[data-testid="${testid}"]`).then((el) =>
      el.waitForExist({ timeout: 10_000 })
    )
    await browser.execute((id) => {
      document.querySelector(`[data-testid="${id}"]`)?.click()
    }, testid)
  }

  await clickByTestId('helen-photos-entry')
  await clickByTestId('add-dispatch')

  // The video picker affordance only renders when WebCodecs is
  // detected. On real iOS Safari it must be present — if not, the
  // app's feature-detect is rejecting iOS-real WebCodecs (which would
  // itself be a real bug worth surfacing).
  const openVideoPicker = await browser.$('[data-testid="open-video-picker"]')
  try {
    await openVideoPicker.waitForExist({ timeout: 10_000 })
  } catch (err) {
    const probe = await browser.execute(() => ({
      hasVideoEncoder: typeof window.VideoEncoder,
      hasVideoFrame: typeof window.VideoFrame,
      hasOffscreenCanvas: typeof window.OffscreenCanvas,
      hasMediaRecorder: typeof window.MediaRecorder,
      ua: navigator.userAgent,
      modalTestids: Array.from(
        document.querySelectorAll('[data-testid*="dispatch"], [data-testid*="pick"]')
      ).map((el) => el.getAttribute('data-testid')),
    }))
    throw new Error(
      `open-video-picker not found after 10s\n  probe: ${JSON.stringify(probe, null, 2)}\n  origin: ${err?.message}`
    )
  }

  // Bypass the native picker by injecting the file directly into the
  // hidden <input type="file" data-testid="dispatch-video-input">.
  // WebDriver's Element Send Keys command fails on display:none file
  // inputs under safaridriver (strict displayed-check). Instead we
  // fetch the fixture from Vite's dev server (which serves project-
  // root files at /@fs/<abs-path>), wrap it in a File, force-assign
  // input.files via DataTransfer, then dispatch a change event so
  // React's onChange fires and the encode pipeline kicks off.
  const videoInput = await browser.$('[data-testid="dispatch-video-input"]')
  await videoInput.waitForExist({ timeout: 10_000 })
  const fileUrl = `/@fs${FIXTURE_PATH}`
  const inject = await browser.execute(
    async (url, name, mimeType) => {
      try {
        const res = await fetch(url)
        if (!res.ok) return { ok: false, stage: 'fetch', status: res.status }
        const blob = await res.blob()
        const file = new File([blob], name, { type: mimeType })
        const input = document.querySelector('[data-testid="dispatch-video-input"]')
        if (!input) return { ok: false, stage: 'input-missing' }
        const dt = new DataTransfer()
        dt.items.add(file)
        let assignedVia = 'direct-set'
        try {
          input.files = dt.files
        } catch {
          /* fall through */
        }
        if (input.files?.length !== 1) {
          Object.defineProperty(input, 'files', {
            value: dt.files,
            configurable: true,
            writable: true,
          })
          assignedVia = 'defineProperty'
        }
        const filesLengthAfter = input.files?.length || 0
        const file0Size = input.files?.[0]?.size || 0
        input.dispatchEvent(new Event('change', { bubbles: true }))
        return {
          ok: true,
          fileSize: file.size,
          blobSize: blob.size,
          assignedVia,
          filesLengthAfter,
          file0Size,
        }
      } catch (e) {
        return { ok: false, stage: 'exception', message: String(e?.message || e) }
      }
    },
    fileUrl,
    'iphone-video-1080p-5s.mov',
    'video/quicktime'
  )
  assert.ok(inject.ok, `file injection failed: ${JSON.stringify(inject)}`)
  assert.equal(
    inject.filesLengthAfter,
    1,
    `input.files not populated after assignment via ${inject.assignedVia}: ${JSON.stringify(inject)}`
  )

  // The encode pipeline kicks off. Encoding panel may appear briefly
  // OR the encode may complete fast enough that the preview shows up
  // directly — either is acceptable. The terminal signal is the
  // preview video being displayed.
  const preview = await browser.$('[data-testid="dispatch-preview-video"]')
  try {
    await preview.waitForDisplayed({ timeout: 90_000 })
  } catch (err) {
    const probe = await browser.execute(() => ({
      modalTestids: Array.from(
        document.querySelectorAll('[data-testid*="dispatch"], [data-testid*="encoding"]')
      ).map((el) => el.getAttribute('data-testid')),
      videoInputFiles: (() => {
        const inp = document.querySelector('[data-testid="dispatch-video-input"]')
        return inp?.files
          ? Array.from(inp.files).map((f) => ({ name: f.name, size: f.size, type: f.type }))
          : null
      })(),
      errorText: document.querySelector('[data-testid="dispatch-error"]')?.textContent || null,
      statusText: document.querySelector('[data-testid="dispatch-status"]')?.textContent || null,
      uploadLog: (() => {
        try {
          const raw = localStorage.getItem('rt_upload_log_v1')
          if (!raw) return null
          const entries = JSON.parse(raw)
          return entries.slice(-5)
        } catch (e) {
          return `parse error: ${e?.message}`
        }
      })(),
    }))
    throw new Error(
      `dispatch-preview-video not displayed after 90s\n  probe: ${JSON.stringify(probe, null, 2)}\n  origin: ${err?.message}`
    )
  }

  assert.ok(
    await preview.isDisplayed(),
    'dispatch-preview-video should be visible after encode completes'
  )
})
