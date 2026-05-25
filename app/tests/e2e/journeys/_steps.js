// Step helper for journey tests.
//
// `step(test, label, fn)` wraps each step in a Playwright test.step
// (so the trace + HTML report group by step) AND screenshots the
// page state right after the step body runs. Screenshots land at
// tests/e2e/screenshots/journeys/<spec>/<NN>-<label>-<project>.png.
// When a journey breaks, the screenshots tell you exactly which
// step was the last to render correctly.
//
// Sequence numbers are derived from the call order so re-ordering
// steps doesn't require renumbering. Project is appended so
// Chromium and WebKit screenshots don't overwrite each other.

import { test, expect } from '@playwright/test'
import { dirname, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
// tests/e2e/journeys/ → tests/e2e/screenshots/journeys/
const SHOTS_ROOT = resolve(here, '..', 'screenshots', 'journeys')

// Per-test step counter. Playwright runs each test in its own
// worker, so a simple module-scope WeakMap keyed by the test
// info is sufficient.
const stepCounters = new WeakMap()

function nextStepN(info) {
  const n = (stepCounters.get(info) || 0) + 1
  stepCounters.set(info, n)
  return n
}

function slug(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

// step(label, fn) — wraps fn in test.step + screenshots after.
// Use inside a regular test() block. Returns whatever fn returns
// so chained reads (`const id = await step(...)`) work.
export async function step(label, fn) {
  const info = test.info()
  const n = nextStepN(info)
  return test.step(`${n.toString().padStart(2, '0')} ${label}`, async () => {
    const result = await fn()
    // Best-effort screenshot. fn may have closed the page (rare),
    // in which case we just skip the snapshot rather than failing
    // the step.
    try {
      const specName = slug(basename(info.file, '.spec.js'))
      const projectName = info.project.name
      const path = resolve(
        SHOTS_ROOT,
        specName,
        `${n.toString().padStart(2, '0')}-${slug(label)}-${projectName}.png`
      )
      const pages = info._test?.parent?.project?.fn || null
      // Use the first page on the current default context.
      const ctx = info.titlePath // no-op to keep tree-shaking happy
      ctx
      const page = await getActivePage()
      if (page) {
        await page.screenshot({ path, fullPage: true })
      }
    } catch {
      /* don't fail the test over screenshot failure */
    }
    return result
  })
}

// Playwright doesn't expose the active page from test.info() — we
// stash it via the journey's beforeEach. Each journey calls
// `setActivePage(page)` so `step()` knows what to snapshot.
let _activePage = null
export function setActivePage(page) {
  _activePage = page
}
async function getActivePage() {
  return _activePage
}

// Convenience: re-export expect so journey specs only need one
// import for both step + expect.
export { expect }
