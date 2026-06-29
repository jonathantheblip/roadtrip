// after-trip-reflow.spec.js — proves the per-person home bands actually
// REFLOW into their after-trip keepsake layout once a trip is over, for all
// three banded personas (Jonathan / Helen / Aurelia; Rafa has no band).
//
// WHY THIS EXISTS: the after-trip layout was read-correct but rendered by
// nothing — the stubbed e2e clock (2026-05-23, clockStub.js) sits mid-trip,
// so the standard fixture trip is always 'during', and no test had ever
// exercised the 'after' branch. This walks the real user path into a FINISHED
// trip (which the app only lets you reach by tapping it on the index — a cold
// deep-link to a past trip bounces to the index by design), then asserts the
// band swapped layouts. It also re-verifies the 'during' layout still renders
// (G5 — don't break the working path proving the new one).
//
// It deliberately does NOT use toHaveScreenshot, so it creates/needs NO visual
// baselines (nothing to re-bless). The element screenshots it drops under
// test-results/ (gitignored) are a human-look artifact, not a gate.
import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'

// Two trips relative to the stubbed clock (2026-05-23):
//  - FINISHED ends 2026-05-08 → strictly before today → tripPhase === 'after'
//  - CURRENT  spans 05-22..25 → contains today          → tripPhase === 'during'
// Both clone the known-good FIXTURE_TRIP shape so the persona views render
// fully; only the identifying + date fields change.
const FINISHED_TRIP = {
  ...FIXTURE_TRIP,
  id: 'finished-fixture-2026',
  title: 'Finished Family Trip',
  subtitle: 'fixture',
  dateRange: 'May 6 – 8, 2026',
  dateRangeStart: '2026-05-06',
  dateRangeEnd: '2026-05-08',
}
const CURRENT_TRIP = {
  ...FIXTURE_TRIP,
  id: 'current-fixture-2026',
  title: 'Current Family Trip',
  subtitle: 'fixture',
  dateRange: 'May 22 – 25, 2026',
  dateRangeStart: '2026-05-22',
  dateRangeEnd: '2026-05-25',
}

const PERSONAS = [
  {
    person: 'jonathan',
    band: 'jonathan-entries',
    // DURING a stay, Jonathan's home is the redesigned LivingHeartHome (slice 1);
    // AFTER, it reflows back to the JonathanEntries keepsake.
    duringBand: 'living-heart-home',
    afterHero: 'entries-replay-hero',
    heroIsAfterOnly: true,
    duringOnly: 'Surprises', // the LivingHeartHome quiet action, present only DURING
    afterNote: /stood down when the trip ended/i,
  },
  {
    person: 'helen',
    band: 'helen-entries',
    afterHero: 'helen-replay-hero',
    heroIsAfterOnly: true,
    duringOnly: 'Plan or manage a surprise', // her "Now" planner card
    afterNote: /rest until your next trip/i,
  },
  {
    person: 'aurelia',
    band: 'aurelia-entries',
    afterHero: 'aurelia-replay-hero',
    heroIsAfterOnly: false, // her Replay hero leads in BOTH phases
    duringOnly: 'Open the live map', // her single "now" footnote, gone after
    afterNote: null, // she has no stand-down note
  },
]

for (const p of PERSONAS) {
  test(`${p.person}: home band reflows to the keepsake AFTER the trip ends`, async ({ page }) => {
    await seedTripIntoCache(page, FINISHED_TRIP)
    // No ?trip= — a finished trip isn't "active today", so the app lands on
    // the trips index; we open it the way a person would: by tapping its card.
    await page.goto(`/?person=${p.person}&nosw=1`)
    await page.getByRole('button').filter({ hasText: FINISHED_TRIP.title }).first().click()

    const band = page.getByTestId(p.band)
    await expect(band).toBeVisible()

    // The after-trip front door — the Replay hero — is showing.
    await expect(band.getByTestId(p.afterHero)).toBeVisible()
    // The "Now" entry is gone (Live features stood down).
    await expect(band.getByRole('button', { name: p.duringOnly })).toHaveCount(0)
    // The stand-down note explains why (Jonathan/Helen only).
    if (p.afterNote) await expect(band.getByText(p.afterNote)).toBeVisible()

    await band.screenshot({ path: `test-results/after-trip-reflow/${p.person}-after.png` })
  })

  test(`${p.person}: home band stays in the "Now" layout DURING the trip`, async ({ page }) => {
    await seedTripIntoCache(page, CURRENT_TRIP)
    await page.goto(`/?person=${p.person}&trip=${CURRENT_TRIP.id}&nosw=1`)

    const band = page.getByTestId(p.duringBand || p.band)
    await expect(band).toBeVisible()

    // The "Now" entry is present.
    await expect(band.getByRole('button', { name: p.duringOnly })).toBeVisible()
    // The keepsake hero / stand-down note do NOT lead during the trip.
    if (p.heroIsAfterOnly) await expect(band.getByTestId(p.afterHero)).toHaveCount(0)
    if (p.afterNote) await expect(band.getByText(p.afterNote)).toHaveCount(0)

    await band.screenshot({ path: `test-results/after-trip-reflow/${p.person}-during.png` })
  })
}
