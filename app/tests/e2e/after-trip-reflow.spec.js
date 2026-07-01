// after-trip-reflow.spec.js — when a trip is OVER, its home (the living heart)
// becomes the ONE unified keepsake (decided 2026-06-29): the hero reads "Looking
// back", the photos become a wall ("The trip in photos"), and a prominent "Relive
// the trip" leads. The per-lens broadsheet / timeline / film-roll keepsakes are
// RETIRED — there is one home for every phase. DURING a trip the SAME living heart
// leads with the "Now" layout instead (G5 — the working path still works).
//
// WHY THIS EXISTS: the e2e clock (2026-05-23, clockStub.js) sits mid-trip, so the
// standard fixture is always 'during'. This walks the real path into a FINISHED
// trip (reached by tapping its card on the index — a cold deep-link to a past trip
// bounces to the index by design), then asserts the keepsake. It uses no
// toHaveScreenshot, so it needs NO visual baselines; the element screenshots under
// test-results/ (gitignored) are a human-look artifact, not a gate.
import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'

// Two trips relative to the stubbed clock (2026-05-23):
//  - FINISHED ends 2026-05-08 → strictly before today → tripPhase === 'after'
//  - CURRENT  spans 05-22..25 → contains today          → tripPhase === 'during'
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
// NOTE: we deliberately seed NO memory here — a shared memory on a PAST trip
// surfaces a "Looking back" resurfacing card on the index that would intercept the
// card tap. The keepsake's photo WALL + "Relive the trip" button (both gated on
// real photos) are verified visually; this spec proves the keepsake SURFACE renders
// for an after trip across all three lenses, and the per-lens keepsakes are retired.
for (const person of ['jonathan', 'helen', 'aurelia']) {
  test(`${person}: a finished trip's home is the unified living-heart keepsake`, async ({ page }) => {
    await seedTripIntoCache(page, FINISHED_TRIP)
    // No ?trip= — a finished trip isn't "active today", so the app lands on the
    // index; open it the way a person would: by tapping its card.
    await page.goto(`/?person=${person}&nosw=1`)
    await page.getByRole('button').filter({ hasText: FINISHED_TRIP.title }).first().click()

    const home = page.getByTestId('living-heart-home')
    await expect(home).toBeVisible()
    // The unified keepsake markers: the "Looking back" hero + the photo WALL section
    // ("The trip in photos"), the SAME living heart for everyone.
    // Case-insensitive: Aurelia's lens lowercases the home's prose (the facelift).
    await expect(home).toContainText(/Looking back/i)
    await expect(home).toContainText(/The trip in photos/i)
    // The per-lens keepsake heroes are RETIRED — gone for everyone.
    await expect(page.getByTestId('entries-replay-hero')).toHaveCount(0)
    await expect(page.getByTestId('helen-replay-hero')).toHaveCount(0)
    await expect(page.getByTestId('aurelia-replay-hero')).toHaveCount(0)

    await home.screenshot({ path: `test-results/after-trip-reflow/${person}-after.png` })
  })

  test(`${person}: the same living heart leads the "Now" layout DURING the trip`, async ({ page }) => {
    await seedTripIntoCache(page, CURRENT_TRIP)
    await page.goto(`/?person=${person}&trip=${CURRENT_TRIP.id}&nosw=1`)

    const home = page.getByTestId('living-heart-home')
    await expect(home).toBeVisible()
    // DURING: the "Lately" layout, not the after keepsake. (Case-insensitive —
    // Aurelia's lens lowercases it to "lately".)
    await expect(home).toContainText(/Lately/i)
    await expect(home).not.toContainText('Looking back')
    await expect(home.getByTestId('relive-trip')).toHaveCount(0)

    await home.screenshot({ path: `test-results/after-trip-reflow/${person}-during.png` })
  })
}
