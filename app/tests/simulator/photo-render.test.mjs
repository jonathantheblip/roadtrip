// iOS Simulator photo-render journey — the founding bug class.
//
// THE BUG THIS GUARDS: at the volleyball tournament, real iPhone photos
// (2.6–5 MB, 4032×3024 / 5712×4284) blew the iOS per-tab graphics budget
// and rendered BLACK. Headless/bundled Chromium and Playwright's
// bundled "webkit-mobile" cannot see this class by construction — only
// real iOS WebKit decodes a full-res photo under the real per-tab memory
// ceiling. Until now the project had NO assertion for it: visual
// baselines inject a 1×1 synthetic data-URL on bundled WebKit, and the
// existing sim gate only renders a *video* preview. This test is the
// first non-black assertion against a real full-resolution photo on real
// iOS WebKit. Its entire purpose is to move this bug class from "a human
// notices it on the phone" to "the harness catches it every run."
//
// WHY THE DISPATCH PREVIEW IS THE RIGHT SURFACE:
//   Injecting a real full-res JPEG into the "Add photo" file input runs
//   the app's real photo pipeline (preparePhotoForUpload → photoPipeline.js):
//     1. createImageBitmap() DECODES the full 4032×3024 bytes — the
//        memory-intensive, budget-relevant operation that blacked out at
//        the tournament.
//     2. ctx.drawImage(fullResBitmap → ≤2048px canvas) rasterizes it.
//     3. canvasToBlob re-encodes the result; the preview <img> shows it.
//   If the full-res decode/draw blacks out on iOS, the produced blob is
//   GENUINELY BLACK BYTES, so the preview is black and a canvas readback
//   catches it faithfully — the black-out is baked into real pixels, not
//   an ephemeral compositing state a re-decode could paper over. This is
//   the one place the current app still performs a full-res decode, and
//   it's reached by exactly the fetch(/@fs/…)+DataTransfer injection the
//   video gate already proved works.
//
// THE READBACK (the assertion the project never had):
//   The preview <img> src is a same-origin blob: URL, so a 2D canvas
//   drawn from it is NOT tainted and getImageData() is allowed. We draw
//   the decoded photo into a small sampling canvas and assert the image
//   area is NOT uniformly black/blank:
//     - maxLuma must clear a black threshold  (a blacked-out render → ~0)
//     - luma range (max-min) must be non-trivial (a uniform field —
//       black OR any solid fill — has range ~0; any real photo does not)
//   The bundled fixture is a high-contrast indoor scene (bright white
//   tiles against near-black wood), so a healthy render clears both
//   thresholds by ~6-8×, while a black-out fails both hard. Bounded by
//   the governing rule: NON-BLACK render only — not pixel-fidelity, not
//   photo-quality scoring.
//
// IF THIS TEST FAILS BLACK: that is not a flake to route around. A
// uniformly-black readback here is the founding bug class reproducing on
// real iOS WebKit. The failure path below saves a screenshot artifact and
// dumps the luma stats so it can be reported as a finding, not buried.
//
// Lessons inherited from video-encode.test.mjs (same gate, same traps):
//   - Drive the app via JS-level .click() on the React handler, not
//     WebDriver pointer clicks: iOS Safari routes a touch to the topmost
//     z-indexed element, and PhotosView's sticky header overlays the
//     buttons we want.
//   - safaridriver's Send Keys fails on display:none file inputs. Inject
//     via fetch(/@fs/abs-path) → File → DataTransfer → dispatchEvent.

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  startDriver,
  waitForDriverReady,
  newSimulatorSession,
  assertSimulatorBooted,
} from './_driver.mjs'
import { FIXTURE_TRIP } from '../e2e/_fixtures/withTrip.js'

const BASE_URL = process.env.SIMULATOR_BASE_URL || 'http://localhost:5181'
const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = resolve(
  HERE,
  '..',
  'fixtures',
  'media',
  'iphone-jpeg-fullres.jpg'
)
const ARTIFACT_DIR = resolve(HERE, '__artifacts__')

// Date-stable trip seed. App.jsx's cold-load override (the ?trip= deep
// link) only lands on the trip view when the trip's date window contains
// *today* (dateRangeStart <= today <= dateRangeEnd); otherwise it strips
// ?trip= and drops to the trips index, where helen-photos-entry doesn't
// exist. FIXTURE_TRIP is pinned to May 22-25 2026, so seeding it raw makes
// this gate (and the sibling video/offline sim specs that seed it the same
// way) silently fail once that window passes. We shift only the date range
// to span today so the deep link is evergreen — nothing else about the
// fixture changes, and the shared FIXTURE_TRIP (also used by Playwright) is
// left untouched.
function isoDay(off = 0) {
  const d = new Date()
  d.setDate(d.getDate() + off)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const SEED_TRIP = {
  ...FIXTURE_TRIP,
  dateRangeStart: isoDay(-1),
  dateRangeEnd: isoDay(1),
}

// Non-black thresholds (luma on a 0-255 Rec.601 scale). A blacked-out
// render reads max≈0 / range≈0; a real photo clears these with wide
// margin. Kept deliberately conservative so a legitimately dark-but-real
// photo never false-fails while a uniform black/blank always does.
const MIN_MAX_LUMA = 32 // at least one clearly-lit pixel exists
const MIN_LUMA_RANGE = 24 // the field is not uniform (not solid black/blank)

test('full-res photo renders non-black on iOS Simulator Safari', async (t) => {
  await assertSimulatorBooted()
  if (!existsSync(FIXTURE_PATH)) {
    t.skip(
      `real-photo fixture not present at ${FIXTURE_PATH} — see app/tests/fixtures/media/README.md`
    )
    return
  }
  const driver = startDriver()
  let browser
  t.after(async () => {
    if (browser) {
      try {
        await browser.deleteSession()
      } catch {
        /* ignore */
      }
    }
    driver.kill()
  })
  await waitForDriverReady(driver.url)
  browser = await newSimulatorSession({ port: driver.port })

  // Seed the trip cache so PhotosView has trip context. Webdriverio has
  // no Playwright-style addInitScript, so we navigate once to establish
  // origin, write localStorage, then re-navigate. (Mirrors the video gate.)
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

  // JS-level clicks (see header): pointer clicks hit the sticky header.
  const clickByTestId = async (testid) => {
    await browser
      .$(`[data-testid="${testid}"]`)
      .then((el) => el.waitForExist({ timeout: 10_000 }))
    await browser.execute((id) => {
      document.querySelector(`[data-testid="${id}"]`)?.click()
    }, testid)
  }

  await clickByTestId('helen-photos-entry')
  await clickByTestId('add-dispatch')

  // The hidden photo <input data-testid="dispatch-file-input"> is mounted
  // unconditionally by the modal (not gated on a "pick" sub-phase), so we
  // inject straight into it. We deliberately do NOT click the "Pick a
  // photo" button first: a programmatic .click() on a file input can't
  // open the native sheet without a user gesture anyway, and skipping it
  // avoids any native picker overlay. React's onChange fires on the
  // dispatched change event regardless — the same contract the video gate
  // relies on for its hidden input.
  const photoInput = await browser.$('[data-testid="dispatch-file-input"]')
  await photoInput.waitForExist({ timeout: 10_000 })

  // Inject the real 2.8 MB / 4032×3024 JPEG. Fetch it from Vite's dev
  // server (serves project-root files at /@fs/<abs-path>), wrap in a File,
  // force-assign input.files via DataTransfer, dispatch change so React's
  // onChange fires and the photo pipeline kicks off.
  const fileUrl = `/@fs${FIXTURE_PATH}`
  const inject = await browser.execute(
    async (url, name, mimeType) => {
      try {
        const res = await fetch(url)
        if (!res.ok) return { ok: false, stage: 'fetch', status: res.status }
        const blob = await res.blob()
        const file = new File([blob], name, { type: mimeType })
        const input = document.querySelector(
          '[data-testid="dispatch-file-input"]'
        )
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
        input.dispatchEvent(new Event('change', { bubbles: true }))
        return {
          ok: true,
          fileSize: file.size,
          blobSize: blob.size,
          assignedVia,
          filesLengthAfter,
        }
      } catch (e) {
        return { ok: false, stage: 'exception', message: String(e?.message || e) }
      }
    },
    fileUrl,
    'iphone-jpeg-fullres.jpg',
    'image/jpeg'
  )
  assert.ok(inject.ok, `photo injection failed: ${JSON.stringify(inject)}`)
  assert.equal(
    inject.filesLengthAfter,
    1,
    `input.files not populated after assignment via ${inject.assignedVia}: ${JSON.stringify(inject)}`
  )
  // Sanity: we injected the REAL full-res bytes, not a stub. The fixture is
  // ~2.8 MB; anything tiny means /@fs served the wrong thing.
  assert.ok(
    inject.fileSize > 1_000_000,
    `injected photo is suspiciously small (${inject.fileSize} bytes) — expected the ~2.8 MB full-res fixture`
  )

  // The pipeline runs (preparing → preview) and the preview <img> renders
  // the decoded+downscaled result. Generous timeout: createImageBitmap on
  // a 4032×3024 file plus a canvas re-encode is real work on the sim.
  const preview = await browser.$('[data-testid="dispatch-preview-image"]')
  try {
    await preview.waitForDisplayed({ timeout: 45_000 })
  } catch (err) {
    const probe = await browser.execute(() => ({
      modalTestids: Array.from(
        document.querySelectorAll(
          '[data-testid*="dispatch"], [data-testid*="prep"], [data-testid*="bucket"]'
        )
      ).map((el) => el.getAttribute('data-testid')),
      // Bucket C = the pipeline rejected the photo (too-large/unreadable);
      // that's a different finding than a black render, so surface it.
      bucketCText:
        document.querySelector('[data-testid="dispatch-bucketC"]')?.textContent ||
        null,
      uploadLog: (() => {
        try {
          const raw = localStorage.getItem('rt_upload_log_v1')
          return raw ? JSON.parse(raw).slice(-5) : null
        } catch (e) {
          return `parse error: ${e?.message}`
        }
      })(),
    }))
    throw new Error(
      `dispatch-preview-image not displayed after 45s\n  probe: ${JSON.stringify(probe, null, 2)}\n  origin: ${err?.message}`
    )
  }

  // THE ASSERTION. Decode the preview photo and read back its pixels via a
  // small same-origin canvas. A blob: URL is same-origin, so getImageData
  // is not tainted. Returns luma stats; the non-black decision is made in
  // Node so the thresholds live in one place.
  const sample = await browser.execute(async () => {
    const img = document.querySelector('[data-testid="dispatch-preview-image"]')
    if (!img) return { ok: false, stage: 'img-missing' }
    try {
      // Force a decode and surface a decode failure explicitly — a full-res
      // photo that won't decode on iOS IS the bug class, not a flake.
      await img.decode()
    } catch (e) {
      return { ok: false, stage: 'decode-rejected', message: String(e?.message || e) }
    }
    if (!img.complete || !img.naturalWidth || !img.naturalHeight) {
      return {
        ok: false,
        stage: 'not-decoded',
        complete: img.complete,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
      }
    }
    const SW = 48
    const SH = 36 // 4:3, cheap to read
    const canvas = document.createElement('canvas')
    canvas.width = SW
    canvas.height = SH
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return { ok: false, stage: 'no-2d-context' }
    // Draw the decoded photo bitmap (intrinsic pixels) scaled into the
    // sample grid. This reads the actual decoded bytes of the pipeline's
    // output blob — black bytes here mean the full-res decode blacked out.
    ctx.drawImage(img, 0, 0, SW, SH)
    let data
    try {
      data = ctx.getImageData(0, 0, SW, SH).data
    } catch (e) {
      return { ok: false, stage: 'getImageData-failed', message: String(e?.message || e) }
    }
    let maxLuma = 0
    let minLuma = 255
    let sumLuma = 0
    let nonBlack = 0
    const total = SW * SH
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const a = data[i + 3]
      const luma = 0.299 * r + 0.587 * g + 0.114 * b
      sumLuma += luma
      if (luma > maxLuma) maxLuma = luma
      if (luma < minLuma) minLuma = luma
      if (a > 8 && luma > 12) nonBlack++
    }
    return {
      ok: true,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      sampleW: SW,
      sampleH: SH,
      total,
      maxLuma,
      minLuma,
      meanLuma: sumLuma / total,
      lumaRange: maxLuma - minLuma,
      nonBlack,
      nonBlackFraction: nonBlack / total,
    }
  })

  if (!sample.ok) {
    await saveFailureArtifact(browser, 'decode')
    throw new Error(
      `full-res photo did not yield readable pixels on iOS WebKit — ${sample.stage}: ${JSON.stringify(sample)}\n` +
        `  This is the founding bug class territory (full-res decode failed on real iOS). See ${ARTIFACT_DIR}.`
    )
  }

  const isBlack =
    sample.maxLuma < MIN_MAX_LUMA || sample.lumaRange < MIN_LUMA_RANGE
  if (isBlack) {
    await saveFailureArtifact(browser, 'black')
  }
  assert.ok(
    !isBlack,
    `FOUNDING BUG CLASS REPRODUCED: full-res photo rendered uniformly black/blank on real iOS WebKit.\n` +
      `  stats: ${JSON.stringify(sample)}\n` +
      `  thresholds: maxLuma>=${MIN_MAX_LUMA}, lumaRange>=${MIN_LUMA_RANGE}\n` +
      `  artifact: ${ARTIFACT_DIR} — report this as a finding, do NOT route around it.`
  )

  // Belt-and-suspenders: a real photo lights up a substantial share of the
  // frame. A near-zero non-black fraction with the above somehow passing
  // would still be suspicious — keep it visible in the assertion record.
  assert.ok(
    sample.nonBlackFraction > 0.05,
    `photo rendered but <5% of sampled pixels are non-black (${(sample.nonBlackFraction * 100).toFixed(1)}%) — stats: ${JSON.stringify(sample)}`
  )
})

// Best-effort screenshot to disk so a black/decode failure is reviewable
// as evidence rather than just a stack trace. Never throws (safaridriver
// screenshot support on the sim is not guaranteed).
async function saveFailureArtifact(browser, tag) {
  try {
    mkdirSync(ARTIFACT_DIR, { recursive: true })
    await browser.saveScreenshot(resolve(ARTIFACT_DIR, `photo-render-${tag}.png`))
  } catch {
    /* evidence is best-effort; the thrown error still carries the stats */
  }
}
