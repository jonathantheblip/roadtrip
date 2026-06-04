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
// WHY THE POST-IMPORT ALBUM TILE IS THE RIGHT SURFACE:
//   Injecting a real full-res JPEG into the IMPORTER's bulk-import input
//   runs the app's real photo pipeline on save (preparePhotoForUpload →
//   photoPipeline.js):
//     1. createImageBitmap() DECODES the full 4032×3024 bytes — the
//        memory-intensive, budget-relevant operation that blacked out at
//        the tournament.
//     2. ctx.drawImage(fullResBitmap → ≤2048px canvas) rasterizes it.
//     3. canvasToBlob re-encodes the result; the album tile renders it.
//   If the full-res decode/draw blacks out on iOS, the produced blob is
//   GENUINELY BLACK BYTES — baked into the bytes the album shows, whether
//   the tile is the local pending blob: (Worker-less build) or the uploaded
//   Worker thumbnail (the black propagates through upload + resize). This is
//   the importer equivalent of the original dispatch-preview readback, and
//   it ALSO covers the real user-facing album render end-to-end. (It used to
//   read the dispatch composer's preview <img>; the importer subsumes that
//   surface — see IMPORTER_SPEC.md Stage 3 — so the guard moved here before
//   the composer is retired.)
//
// THE READBACK (the assertion the project never had):
//   The tile <img> may be a same-origin blob: OR a cross-origin Worker
//   thumbnail, so rather than draw the <img> (which taints a 2D canvas
//   cross-origin) we FETCH its bytes — GET /assets sends CORS; a blob: fetch
//   is same-origin — and decode with createImageBitmap (CORS-clean, never
//   tainted). We then draw to a small sampling canvas and assert the image
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
// Lessons inherited from the iOS-Simulator safaridriver gates (same traps):
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
import { dateStableTripSeed } from './_seed.mjs'
import { resolvePersona } from '../e2e/_fixtures/persona.js'

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

// Date-stable trip seed (see _seed.mjs): shifts FIXTURE_TRIP's date range
// to span today so App.jsx's ?trip= cold-load override lands on the trip
// view on the real clock. Without it the raw May-2026 fixture bounces to
// the trips index and helen-photos-entry never renders. FIXTURE_TRIP itself
// stays pinned for the clock-stubbed e2e suite + its visual baselines.
// Widen the range to 2025–2027 so the importer's trip-range filter KEEPS the
// fixture photo (EXIF ~2026-05-25): the dispatch path didn't filter by date,
// but the importer does (filterByTripRange drops out-of-range / dateless).
const SEED_TRIP = { ...dateStableTripSeed(), dateRangeStart: '2025-01-01', dateRangeEnd: '2027-12-31' }

// Persona for this sim run: RT_PERSONA env override, default 'helen' so
// existing sim behavior is unchanged. See app/tests/e2e/_fixtures/persona.js.
const PERSONA = resolvePersona('helen')

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
  await browser.execute((trip, persona) => {
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
    localStorage.setItem('rt_person_v2', persona)
  }, SEED_TRIP, PERSONA)

  await browser.url(BASE_URL + `/?person=${PERSONA}&trip=volleyball-2026&nosw=1`)

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

  // Inject the real full-res JPEG into the IMPORTER's hidden bulk-import input
  // (data-testid="import-file-input", in PhotosView — no modal). The importer
  // runs the SAME full-res decode the dispatch composer did:
  // preparePhotoForUpload (photoPipeline.js) createImageBitmap()-DECODES the
  // 4032×3024 bytes, then drawImage → ≤2048px canvas → re-encode. Inject
  // straight into the display:none input (DataTransfer + dispatched change →
  // React onChange) — the same contract the video gate relies on.
  const photoInput = await browser.$('[data-testid="import-file-input"]')
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
        const input = document.querySelector('[data-testid="import-file-input"]')
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

  // The importer analyzes (EXIF + match) then SAVES the photo — and SAVE is
  // where preparePhotoForUpload runs the full-res decode. A clean single photo
  // smart-skips (silent save → straight back to the album); an interstitial /
  // off-route one shows a lightweight confirm. Accept the confirm if it shows;
  // either way the photo lands in the album.
  try {
    const go = await browser.$('[data-testid="import-confirm-go"]')
    await go.waitForDisplayed({ timeout: 25_000 })
    await browser.execute(() => document.querySelector('[data-testid="import-confirm-go"]')?.click())
  } catch {
    /* smart-skipped — no confirm screen; the photo saved silently */
  }

  // The album tile renders the imported photo. In the dev (Worker-less) build
  // the pending photoRef's url is a same-origin blob: of the DOWNSCALED blob —
  // i.e. the actual output of the full-res decode under test. thumbUrl passes
  // blob: through unchanged, so the tile <img> shows it directly. Generous
  // timeout: createImageBitmap on a 4032×3024 file + canvas re-encode is real
  // work on the sim.
  const tile = await browser.$('[data-testid="photo-tile"]')
  try {
    await tile.waitForExist({ timeout: 45_000 })
  } catch (err) {
    const probe = await browser.execute(() => ({
      importTestids: Array.from(document.querySelectorAll('[data-testid*="import"]')).map((el) => el.getAttribute('data-testid')),
      surfaceTestids: Array.from(document.querySelectorAll('[data-testid]')).map((el) => el.getAttribute('data-testid')).slice(0, 24),
      bodyText: (document.body.innerText || '').slice(0, 300),
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
      `no album photo-tile after import (45s) — the photo never made it through decode+save\n  probe: ${JSON.stringify(probe, null, 2)}\n  origin: ${err?.message}`
    )
  }
  // Scroll the tile into view so the IntersectionObserver-gated <img> mounts.
  await browser.execute(() => document.querySelector('[data-testid="photo-tile"]')?.scrollIntoView({ block: 'center' }))

  // THE ASSERTION. Read back the album tile's actual pixels. The tile <img>
  // may be a same-origin blob: (Worker-less build → pending ref) OR a
  // cross-origin Worker thumbnail (Worker-configured → uploaded). A
  // cross-origin <img> taints a 2D canvas, so instead we FETCH the bytes
  // (GET /assets sends CORS; a blob: fetch is same-origin) and decode them
  // with createImageBitmap — CORS-clean, never tainted. Either way the bytes
  // are the client's full-res decode output as the album renders it; black
  // bytes here mean the decode/render blacked out (the founding bug class).
  const tileSrc = await browser.execute(
    () => document.querySelector('[data-testid="photo-tile"] img')?.src || null
  )
  const sample = await browser.execute(async (src) => {
    if (!src) return { ok: false, stage: 'img-src-missing' }
    let blob
    try {
      const res = await fetch(src, { mode: 'cors' })
      if (!res.ok) return { ok: false, stage: 'fetch', status: res.status, src: src.slice(0, 120) }
      blob = await res.blob()
    } catch (e) {
      return { ok: false, stage: 'fetch-rejected', message: String(e?.message || e), src: src.slice(0, 120) }
    }
    let bmp
    try {
      // Decode the fetched bytes — a full-res photo that won't decode on iOS
      // IS the bug class, not a flake.
      bmp = await createImageBitmap(blob)
    } catch (e) {
      return { ok: false, stage: 'decode-rejected', message: String(e?.message || e) }
    }
    if (!bmp.width || !bmp.height) {
      return { ok: false, stage: 'not-decoded', width: bmp.width, height: bmp.height }
    }
    const SW = 48
    const SH = 36 // 4:3, cheap to read
    const canvas = document.createElement('canvas')
    canvas.width = SW
    canvas.height = SH
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return { ok: false, stage: 'no-2d-context' }
    // Draw the decoded bitmap scaled into the sample grid and read its bytes —
    // black bytes here mean the full-res decode blacked out.
    ctx.drawImage(bmp, 0, 0, SW, SH)
    let data
    try {
      data = ctx.getImageData(0, 0, SW, SH).data
    } catch (e) {
      return { ok: false, stage: 'getImageData-failed', message: String(e?.message || e), src: src.slice(0, 120) }
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
      bitmapWidth: bmp.width,
      bitmapHeight: bmp.height,
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
  }, tileSrc)

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
