// Cross-device live agenda updates: useTrips.js used to only pull remote trip
// data on mount, 'online', and visibilitychange (foreground) — a second
// family member's edit sat invisible on this device until IT foregrounded or
// reloaded. The self-healing lifecycle effect now ALSO re-pulls on the same
// heartbeat it already uses to retry pushing unsynced edits
// (TRIP_RESYNC_INTERVAL_MS), so another device's change shows up here live.
//
// Chromium only: Playwright's WebKit clock virtualization doesn't reliably
// fire a live setInterval via page.clock.runFor() (confirmed already for
// next-up-ticks.spec.js's identical class of bug — a test-tool gap, not a
// product one; real Safari's setInterval is unvirtualized and fires fine).
import { test, expect } from '@playwright/test'
import { seedTripIntoCache } from './_fixtures/withTrip.js'

const TRIP_ID = 'live-pull-2026'

function trip(version) {
  return {
    id: TRIP_ID,
    status: 'planning',
    title: 'A Long Weekend',
    dateRangeStart: '2026-06-01',
    dateRangeEnd: '2026-06-03',
    travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
    days: [
      {
        n: 1,
        isoDate: '2026-06-02',
        date: 'Tue, June 2',
        title: 'Day 1',
        stops: [
          {
            id: 's1',
            time: '11:00 AM',
            name: version === 1 ? 'Original Stop' : 'Helen added this from her phone',
            kind: 'sight',
            for: [],
          },
        ],
      },
    ],
  }
}

test('another device\'s agenda edit shows up here live, via the periodic pull — no reload', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Playwright\'s WebKit clock emulation does not fire a live setInterval (see file-header comment) — chromium is the proof.')
  // Seeded so the trip is already known at mount and `?trip=` opens it
  // directly — a `?trip=` id that only shows up LATER via an async pull is a
  // separate, real gap (App.jsx only resolves the URL param once, against
  // whatever `trips` state exists at that moment) and not what this test is
  // about: an ALREADY-open trip picking up a live edit.
  await seedTripIntoCache(page, trip(1))
  let pullCount = 0
  await page.route(/roadtrip-sync[^/]*\/trips$/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    pullCount += 1
    // The FIRST pull (fires immediately on mount) matches the seeded cache —
    // nothing visibly changes. Every pull after that simulates another
    // family member's edit having landed on the server in the meantime.
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([trip(pullCount === 1 ? 1 : 2)]),
    })
  })
  // Installed before goto, per the next-up-ticks.spec.js precedent.
  await page.clock.install({ time: new Date('2026-06-02T10:00:00') })
  await page.goto(`/?person=jonathan&trip=${TRIP_ID}&nosw=1`)

  await expect(page.getByText('Original Stop')).toBeVisible({ timeout: 10000 })

  // Advance just past the resync/pull heartbeat (TRIP_RESYNC_INTERVAL_MS =
  // 20000ms) — runFor actually fires the interval callback, unlike
  // fastForward (which only fires a due timer once, per its own docs).
  await page.clock.runFor('00:00:21')

  await expect(page.getByText('Helen added this from her phone')).toBeVisible({ timeout: 10000 })
  await expect(page.getByText('Original Stop')).toHaveCount(0)
  // Exactly two pulls fired across the ~21s window (mount + one interval
  // tick) — proves this is the periodic heartbeat, not some other trigger
  // (a tight loop would show many more; a broken interval would show one).
  expect(pullCount).toBe(2)
})
