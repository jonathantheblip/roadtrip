// iOS Simulator importer-video journey — the iOS-real coverage the headless
// Playwright suite can't provide for the IMPORTER's video path.
//
// The one importer folds video in: the bulk picker accepts image/*,video/*,
// ImportFlow partitions by type and runs the WebCodecs encode
// (videoPipeline.encodeVideo) — which only runs end-to-end on real iOS Safari
// (Playwright's bundled WebKit + Chromium both fail the encode). Stage 3
// retired the single-photo dispatch composer and its sim gate, so THIS test
// is now the SOLE iOS-real gate for the importer's video path — both the
// picker→encode→file-by-time glue AND the WebCodecs encode itself:
//   1. import-file-input routes a picked .mov into the encode (partition).
//   2. The encode runs to completion (ImportFlow ENCODING → progress).
//   3. The clip files by time and surfaces in the confirm summary as a video.
//
// We set window.__RT_IMPORT_FORCE_CONFIRM so the flow STOPS at the confirm
// summary instead of auto-saving — this gate asserts "encode ran → video
// summary" without POSTing a real video to the production Worker/R2. (The
// offline-safe upload + drain is covered headlessly by photos-import-offline
// for photos; the video upload reuses that exact queue + the kind:'video'
// drain runner.)

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
import { resolvePersona } from '../e2e/_fixtures/persona.js'
import { dateStableTripSeed } from './_seed.mjs'

const BASE_URL = process.env.SIMULATOR_BASE_URL || 'http://localhost:5181'
// A date-stable FIXTURE_TRIP copy that lands reliably in HelenView → PhotosView on the sim's
// real clock. The earlier hand-rolled trip landed on the people-picker and
// reloaded (forceConfirm wiped) so ImportFlow never mounted. We widen ONLY the
// date range so the .mov (whatever its container date) is never excluded by the
// trip-range filter while today still falls inside the window. The clip files
// by time relative to FIXTURE_TRIP's stops; ImportFlow counts kind:'video'
// regardless of which stop (or interstitial) it lands in.
const SEED_TRIP = {
  ...dateStableTripSeed(),
  dateRangeStart: '2025-01-01',
  dateRangeEnd: '2027-12-31',
}
const PERSONA = resolvePersona('helen')
const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = resolve(HERE, '..', 'fixtures', 'media', 'iphone-video-1080p-5s.mov')
// Must exceed the pipeline's ENCODE_TIMEOUT_MS (120s) plus margin so a slow-
// but-valid encode gets its full budget.
const CONFIRM_WAIT_MS = 150_000

test('importer encodes a picked video on iOS Simulator Safari and files it by time', async (t) => {
  // iOS-Simulator-only: this gate drives safaridriver (JS-level click into
  // PhotosView + DataTransfer file-injection into import-file-input) and
  // asserts encode→confirm. It runs ONLY where the Simulator + safaridriver +
  // the LFS .mov fixture are present (it t.skip()s below without the fixture),
  // so it is NOT part of the headless CI e2e gate — verify it on-device. The
  // importer video path was also verified manually on-device (2026-06-04). The
  // raw WebCodecs encode was formerly covered separately by the dispatch
  // video-encode.test.mjs, retired with the composer in Stage 3 — this gate now
  // owns it. Known fragility: the synthetic click/inject sequence has at times
  // mounted ImportFlow empty under safaridriver; if that recurs, debug here.
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

  // Seed the trip cache (no addInitScript in webdriverio — navigate, write,
  // re-navigate).
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

  // NOTE: window.__RT_IMPORT_FORCE_CONFIRM is set INSIDE the inject below, right
  // before the change fires — setting it here (post-navigation) didn't survive
  // to import time (the global read back null), so it's set in the same context
  // as the change it gates.

  // Open Photos (JS-level click — fixed sticky headers intercept WebDriver
  // touch on this surface, so a coordinate click would hit the banner).
  await browser.$('[data-testid="helen-photos-entry"]').then((el) => el.waitForExist({ timeout: 10_000 }))
  await browser.execute(() => document.querySelector('[data-testid="helen-photos-entry"]')?.click())

  // Inject the .mov into the bulk import input (display:none → assign via
  // DataTransfer + dispatch change so ImportFlow's onChange fires).
  await browser.$('[data-testid="import-file-input"]').then((el) => el.waitForExist({ timeout: 10_000 }))
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
          Object.defineProperty(input, 'files', { value: dt.files, configurable: true, writable: true })
          assignedVia = 'defineProperty'
        }
        const filesLengthAfter = input.files?.length || 0
        // Force the confirm summary (stop before save/upload) — set HERE, in the
        // same page context right before the change fires, so a navigation or
        // reload between initial load and now can't wipe it. (It did: when set
        // right after browser.url(), the global read back null by inject time.)
        window.__RT_IMPORT_FORCE_CONFIRM = true
        input.dispatchEvent(new Event('change', { bubbles: true }))
        return { ok: true, fileSize: file.size, filesLengthAfter, assignedVia }
      } catch (e) {
        return { ok: false, stage: 'exception', message: String(e?.message || e) }
      }
    },
    fileUrl,
    'iphone-video-1080p-5s.mov',
    'video/quicktime'
  )
  assert.ok(inject.ok, `file injection failed: ${JSON.stringify(inject)}`)
  assert.equal(inject.filesLengthAfter, 1, `import-file-input not populated: ${JSON.stringify(inject)}`)

  // The encode kicks off — ImportFlow shows the encoding progress. (May be
  // brief on a fast encode; the terminal signal we assert is the confirm.)
  const encoding = await browser.$('[data-testid="import-encoding"]')
  try {
    await encoding.waitForExist({ timeout: 20_000 })
  } catch {
    /* fast encode may have skipped past it — the confirm assertion below is
       the real gate */
  }

  // Confirm summary appears (forced) — proving the encode completed and the
  // clip filed by time as a video.
  const confirm = await browser.$('[data-testid="import-confirm"]')
  try {
    await confirm.waitForDisplayed({ timeout: CONFIRM_WAIT_MS })
  } catch (err) {
    const probe = await browser.execute(() => ({
      importTestids: Array.from(
        document.querySelectorAll('[data-testid*="import"]')
      ).map((el) => el.getAttribute('data-testid')),
      bodyText: (document.body.innerText || '').slice(0, 400),
    }))
    throw new Error(
      `import-confirm not displayed after ${CONFIRM_WAIT_MS}ms\n  probe: ${JSON.stringify(probe, null, 2)}\n  origin: ${err?.message}`
    )
  }

  const confirmText = await confirm.getText()
  assert.match(confirmText, /video/i, `confirm summary should mention the video: ${confirmText}`)
  const importBtn = await browser.$('[data-testid="import-confirm-go"]')
  const importLabel = await importBtn.getText()
  assert.match(importLabel, /Import\s+1/i, `expected "Import 1" for the single video: ${importLabel}`)
})
