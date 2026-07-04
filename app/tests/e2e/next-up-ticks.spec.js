import { test, expect } from '@playwright/test'
import { seedTripIntoCache } from './_fixtures/withTrip.js'

// LivingHeartHome's "Next up" ticket (a composite trip's just-in-time timed
// stop) is a useMemo keyed off `[isComplex, trip, todayIso, legTz]` — none of
// which change minute-to-minute, so once a stop's time passes the ticket sat
// frozen on it for the rest of the day (only a day rollover or a leg change
// would refresh it). The fix adds `now` (useNowTick, ticks every minute) to
// the dependency array.
//
// This can't be proven with a page reload (seedTripIntoCache's addInitScript
// re-fires on every page.goto(), resetting the seeded cache — see the e2e
// fixture-reseed gotcha) and can't be proven with the shared clockStub.js
// either (it freezes `new Date()` to one fixed instant, so time never
// actually advances). Playwright's own page.clock CAN fast-forward real
// in-page timers (including useNowTick's setInterval) without a reload or a
// real wait — exactly the tool clockStub.js's own comment names for this case.
const NEXT_UP_TRIP = {
  id: 'next-up-ticks-2026',
  status: 'planning',
  title: 'A Long Weekend, Two Cities',
  dateRangeStart: '2026-06-01',
  dateRangeEnd: '2026-06-05',
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
  parts: [
    { id: 'p-a', type: 'city', title: 'First stop', place: 'Providence, RI', dateStart: '2026-06-01', dateEnd: '2026-06-02' },
    { id: 'p-b', type: 'city', title: 'Second stop', place: 'Newport, RI', dateStart: '2026-06-03', dateEnd: '2026-06-05' },
  ],
  days: [
    {
      n: 1,
      isoDate: '2026-06-02',
      date: 'Tue, June 2',
      title: 'Providence',
      stops: [
        { id: 's-morning', time: '11:00 AM', name: 'Farmers Market', kind: 'sight', for: [], note: '', address: 'Providence, RI' },
        { id: 's-noon', time: '11:30 AM', name: 'Waterfire Walk', kind: 'sight', for: [], note: '', address: 'Providence, RI' },
      ],
    },
  ],
}

// Chromium only: Playwright's clock virtualization on WebKit doesn't reliably
// fire a running setInterval via fastForward/runFor (confirmed — even runFor,
// whose own docs promise "firing all the time-related callbacks," never
// triggers useNowTick's interval under webkit-mobile here, while an identical
// setup passes cleanly on chromium every time). This is a gap in the TEST
// TOOL's WebKit clock emulation, not the product: real iOS Safari/PWA runs an
// unvirtualized, genuine setInterval that fires exactly as normal. Chromium
// coverage proves the dependency-array fix itself, which is browser-agnostic.
test('the "Next up" ticket advances past a stop that has already happened, without a reload', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Playwright\'s WebKit clock emulation does not fire a live setInterval (see comment above) — chromium is the proof.')
  // Install the virtual clock BEFORE any page script runs, at 10:50am on the
  // trip's single real day — before both timed stops.
  await page.clock.install({ time: new Date('2026-06-02T10:50:00') })

  await seedTripIntoCache(page, NEXT_UP_TRIP)
  await page.goto(`/?person=jonathan&trip=${NEXT_UP_TRIP.id}&nosw=1`)

  // At 10:50, next up is the 11:00 Farmers Market.
  await expect(page.getByTestId('next-up')).toContainText('Farmers Market', { timeout: 10000 })

  // Advance 20 minutes (to 11:10) — past the Farmers Market's 11:00 slot,
  // still before Waterfire Walk's 11:30. runFor (not fastForward — which
  // Playwright's own docs say "only fires due timers at most once," like
  // waking a laptop from sleep) actually FIRES every one of useNowTick's 60s
  // interval ticks along the way, so the ticket has every real chance to
  // recompute. No page.goto() / no reload — the seeded cache stays untouched.
  await page.clock.runFor('00:20:00')

  // The ticket must have moved on to the next thing that hasn't happened yet.
  await expect(page.getByTestId('next-up')).toContainText('Waterfire Walk', { timeout: 10000 })
  await expect(page.getByTestId('next-up')).not.toContainText('Farmers Market')
})
