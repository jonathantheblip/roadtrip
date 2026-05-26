// clockStub.js — pin every test's `new Date()` (no-args) to a time
// inside FIXTURE_TRIP (volleyball-2026)'s window.
//
// Why: App.jsx's active-trip cold-load override
// (src/App.jsx:369-394) navigates to the trips index when the URL
// trip's window doesn't contain today. With FIXTURE_TRIP's window
// fixed at 2026-05-22 → 2026-05-25, any cold-cache test run after
// the system clock crosses 2026-05-25 falls through to "no active
// trip" and loses access to every `*-photos-entry`,
// `add-dispatch-modal`, etc. locator the suite relies on.
//
// This stub patches the page's `Date` ONLY — production and the
// real app are unaffected. Tests pin their own clock, deterministically.
//
// Scope: ONLY `new Date()` (zero args) is overridden. We leave
// `Date.now()`, `Date.parse(...)`, `Date.UTC(...)`, and
// `new Date(ms|str|...)` untouched. Reason: vite's HMR client and
// React's scheduler use `Date.now()` for timing decisions; patching
// it produces past-time values that confuse stale-connection detection
// and trigger ERR_ABORTED page reloads mid-test. App code that asks
// "what's today?" goes through `new Date()` (see App.jsx's
// `todayIso()` at line 122), which IS the case we want to control.
//
// Tests that explicitly need to advance real time should use
// Playwright's `page.clock.fastForward()` or `setSystemTime()`, but
// none of the current suite needs that.
//
// Spec files import { test, expect } from this file instead of from
// '@playwright/test'. Drop-in replacement.

import { test as base, expect } from '@playwright/test'

// Mid-window noon UTC — May 23 in every reasonable timezone, well
// inside the FIXTURE_TRIP window. If FIXTURE_TRIP dates change, this
// must move with them. Source of truth lives in
// `_fixtures/withTrip.js`; if these drift, the suite goes dark again
// — same failure shape as the 2026-05-26 incident.
const STUBBED_NOW_ISO = '2026-05-23T12:00:00.000Z'

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript((iso) => {
      const STUB_MS = new Date(iso).getTime()
      const NativeDate = Date

      // Subclass that returns the stubbed instant for `new StubDate()`
      // (zero args) and delegates everything else to the native Date.
      // Static methods (now, UTC, parse) inherit from NativeDate, so
      // they remain native — only `new Date()` with no args is altered.
      class StubDate extends NativeDate {
        constructor(...args) {
          if (args.length === 0) {
            super(STUB_MS)
          } else {
            super(...args)
          }
        }
      }
      // Preserve `Date.now` exactly — vite HMR + React schedulers
      // rely on Date.now to track real elapsed time.
      // (StubDate.now is already inherited as NativeDate.now via
      // `class StubDate extends NativeDate`, but pinning it explicitly
      // documents the intent.)
      StubDate.now = NativeDate.now.bind(NativeDate)

      // eslint-disable-next-line no-global-assign
      globalThis.Date = StubDate
    }, STUBBED_NOW_ISO)
    await use(page)
  },
})

export { expect }
