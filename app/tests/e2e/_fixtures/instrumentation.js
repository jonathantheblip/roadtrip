// Instrumentation harvest — QA_COVERAGE_SYSTEM_SPEC.md §4 build-list item 4
// (the last Phase-2 tool). Collects the log traces a walk produces so SILENT /
// swallowed failures become findings instead of going unnoticed when the
// visual/DOM tiers pass.
//
// WHAT IS HARVESTABLE PER HARNESS (scope finding):
//   • Client dev-log — `rt_upload_log_v1` (localStorage ring buffer, written by
//     logUploadEvent in app/src/lib/uploadLog.js). FAILURE-ONLY: every entry is
//     a failure trace. Bucket A = silent/auto-queued (the composer pivots to
//     'done', the sync pill carries the signal, NO error UI) — these are the
//     swallowed failures. Bucket C = the 3 user-surfaced outcomes. Fully
//     harvestable here via page.evaluate (works in Playwright e2e AND the sim,
//     which can also read localStorage). THIS IS THE BUILD TARGET.
//   • Worker logs — the Worker's console.* (asset-fetch error, the catch-all
//     500, trip-hero floor warns, photon errors). Under miniflare/
//     vitest-pool-workers, workerd console is piped to the test runner's STDOUT
//     with no queryable array — NOT cleanly harvestable as data in-test. The
//     in-test worker-failure signal is the error RESPONSE (asserted in the
//     worker suite, e.g. security-auth-isolation 401s). The deployed worker is
//     `wrangler tail` — a stream a headless harness can't consume (manual /
//     Chrome-tier). So worker-console harvest is documented as out-of-reach
//     here, by design, not faked.
//
// ASSERT vs COLLECT: both are provided. Phase 3 capture should COLLECT
// (harvestDevLog → surface every trace for triage, never fail the walk); a
// standing regression gate should ASSERT (expectNoSilentFailures → fail on new
// silent Bucket-A failures). The dev-log key is global (not per-persona), so a
// single harvest covers whatever persona the walk ran as.

import { expect } from '@playwright/test'

export const DEV_LOG_KEY = 'rt_upload_log_v1'

// COLLECT: read the dev-log ring buffer out of the page after a walk.
export async function harvestDevLog(page) {
  return page.evaluate((key) => {
    try {
      const raw = localStorage.getItem(key)
      const parsed = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }, DEV_LOG_KEY)
}

// The silent (Bucket A) failures — the ones the UI deliberately hid.
export function silentFailures(entries) {
  return (entries || []).filter((e) => e && e.bucket === 'A')
}

// Compact, copy-pasteable summary for a failure message / collected artifact.
export function summarizeDevLog(entries) {
  if (!entries || entries.length === 0) return '(empty dev-log)'
  return entries
    .map(
      (e) =>
        `  • [${e.bucket}] ${e.code}${e.outcome ? ` → ${e.outcome}` : ''} @ ${
          e.context?.phase ?? '?'
        }${e.message ? ` — ${e.message}` : ''}`
    )
    .join('\n')
}

// ASSERT (standing-gate mode): fail if the walk left any silent (Bucket A)
// failure in the dev-log beyond an allowlist of expected codes. Bucket C
// entries surfaced to the user already, so they don't fail the gate here.
export async function expectNoSilentFailures(page, { allow = [], label = 'walk' } = {}) {
  const entries = await harvestDevLog(page)
  const silent = silentFailures(entries).filter((e) => !allow.includes(e.code))
  expect(
    silent,
    `instrumentation harvest: ${silent.length} silent (Bucket A) failure(s) on ${label}:\n${summarizeDevLog(silent)}`
  ).toEqual([])
  return entries
}
