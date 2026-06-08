// Slice 3a — a cover-story surprise renders as a real, ordinary stop on the
// recipient's day plan. The recipient holds a cover STAND-IN (isCover, no real
// title), and mergeCoverStops injects it into the matching day's stops, so the
// themed view draws it like any stop. This is also the render check: a synthetic
// stop must not crash the themed views or the stop-detail it taps into.
import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, seedMemoriesIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'

const COVER_TITLE = 'A walk down Fifth Avenue'

const COVER_STANDIN = {
  id: 'cov-stop-1',
  tripId: 'volleyball-2026',
  authorTraveler: 'jonathan',
  visibility: 'shared',
  kind: 'text',
  isCover: true,
  cover: {
    icon: '🚶',
    title: COVER_TITLE,
    loc: '5th Ave',
    time: 'Sat afternoon',
    weather: 'Cold & windy',
    packing: 'Warm coats',
    dayIso: '2026-05-23', // FIXTURE_TRIP day 2 (the clock-stub active day)
  },
  createdAt: '2026-05-22T12:00:00.000Z',
}

for (const persona of ['jonathan', 'helen', 'aurelia', 'rafa']) {
  test(`cover story renders as a stop on the plan, no crash — ${persona}`, async ({ page }) => {
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))

    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [COVER_STANDIN])
    await page.goto(`/?person=${persona}&trip=volleyball-2026&nosw=1`)

    // The cover appears as an ordinary stop on day 1 — no gift, no lock, no hint.
    await expect(page.getByText(COVER_TITLE).first()).toBeVisible()
    expect(errors, `page errors for ${persona}: ${errors.join(' | ')}`).toEqual([])
  })
}

test('tapping the cover stop opens its detail without breaking', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await seedMemoriesIntoCache(page, [COVER_STANDIN])
  await page.goto('/?person=jonathan&trip=volleyball-2026&nosw=1')

  await page.getByText(COVER_TITLE).first().click()
  // findStop resolves the injected stop, so its detail renders (the believable
  // cover) rather than a blank/crash. Assert we didn't white-screen.
  await expect(page.getByText(COVER_TITLE).first()).toBeVisible()
  expect(errors, `page errors: ${errors.join(' | ')}`).toEqual([])
})
