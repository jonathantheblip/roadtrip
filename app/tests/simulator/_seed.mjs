// Shared sim-tier seed helper: a copy of FIXTURE_TRIP whose date range
// straddles *today* on the real system clock.
//
// WHY THIS EXISTS (the sim-tier date-rot, and why only the sim tier has it):
//   App.jsx's ?trip= cold-load override only lands on the trip view when
//   today is inside the trip's window (dateRangeStart <= today <=
//   dateRangeEnd); otherwise it strips ?trip= and drops to the trips index,
//   where the *-photos-entry / import-photos locators don't exist. The
//   Playwright e2e suite sidesteps this by importing _fixtures/clockStub.js,
//   which pins `new Date()` to 2026-05-23 (inside FIXTURE_TRIP's May 22-25
//   window) — so the e2e suite's fixed dates and its frozen clock are an
//   intentional pair, and the committed visual baselines depend on those
//   dates staying fixed.
//
//   The sim tier drives REAL iOS Safari via safaridriver/webdriverio, which
//   has no addInitScript-style pre-load hook, so it can't cheaply freeze the
//   page clock the way clockStub.js does. Seeding the raw May-2026 fixture
//   therefore bounces every sim spec to the trips index once the real clock
//   passes 2026-05-25 (the 2026-05-26 rot).
//
//   So instead of moving the clock to the fixture, we move the fixture to
//   the clock: shift ONLY the absolute date range to span today, leaving the
//   trip's internal structure (id, stops vb1-3/vb2-3/vb3-4, times, day
//   labels) intact. Evergreen on the real clock, and FIXTURE_TRIP itself
//   stays pinned for the e2e suite + baselines. This is the sim-tier analogue
//   of clockStub.js.

import { FIXTURE_TRIP } from '../e2e/_fixtures/withTrip.js'

function isoDay(off = 0) {
  const d = new Date()
  d.setDate(d.getDate() + off)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// A FIXTURE_TRIP copy with its date range shifted to straddle today
// (yesterday → tomorrow, so timezone skew between the Node runner and the
// sim's JS clock can't push today outside the window). Call per run so the
// dates track the real "today" at execution time.
export function dateStableTripSeed() {
  return {
    ...FIXTURE_TRIP,
    dateRangeStart: isoDay(-1),
    dateRangeEnd: isoDay(1),
  }
}
