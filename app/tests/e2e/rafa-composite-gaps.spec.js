// Rafa's composite-trip gap on the PHONE view (RafaView's hero card). See
// rafa-ipad-composite-gaps.spec.js for the iPad-only surfaces (RafaPad,
// RafaMap) — Playwright doesn't allow a device-forcing test.use() inside a
// nested describe in the same file as other tests, so they're split.
//
// RafaView's hero card only ever checked isStayTrip — a composite (multi-
// city) trip with no featured stop for today (a loose day between real
// plans) got nothing where a stay would show its place. Now falls back to
// the CURRENT leg's place via deriveCurrentLeg, the same "where we are now"
// resolver the adult views use.
//
// This fixture has NO `days[]` at all — the composite trip's real stops
// aren't planned yet — so RafaView has literally nothing to feature except
// the leg fallback under test.
import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache } from './_fixtures/withTrip.js'

const COMPOSITE_NO_STOPS = {
  id: 'rafa-composite-2026',
  status: 'planning',
  title: 'Two Cities',
  dateRangeStart: '2026-05-22',
  dateRangeEnd: '2026-05-26',
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
  parts: [
    // Clock is pinned to 2026-05-23 (clockStub) — this leg's window contains
    // it, so deriveCurrentLeg resolves HERE as "now."
    { id: 'p-a', type: 'city', title: 'First stop', place: 'Providence, RI', dateStart: '2026-05-22', dateEnd: '2026-05-24' },
    { id: 'p-b', type: 'city', title: 'Second stop', place: 'Newport, RI', dateStart: '2026-05-25', dateEnd: '2026-05-26' },
  ],
  days: [],
}

test("RafaView's hero card falls back to the current leg's place, not blank", async ({ page }) => {
  await seedTripIntoCache(page, COMPOSITE_NO_STOPS)
  await page.goto('/?person=rafa&nosw=1')
  const card = page.getByTestId('rafa-leg-place-card')
  await expect(card).toBeVisible({ timeout: 10000 })
  await expect(card).toContainText('Providence, RI')
  // The stay-only place card never mounts for a composite trip.
  await expect(page.getByTestId('rafa-stay-place-card')).toHaveCount(0)
})
