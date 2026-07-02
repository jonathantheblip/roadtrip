// StopDetail back button must be TAPPABLE (chip task_c6f1b43d). On a multi-day
// trip the sticky .day-chips band (platform.css) sits at top:max(40px, safe+32px)
// z-30; in a ZERO-safe-area env (desktop, some Androids, and every e2e viewport —
// Playwright's iPhone 15 profile has no notch inset) it rests at 40px and could
// swallow the stop-view header's back button, which lives right below it. A real
// iPhone's notch inset pushes the band down so it never collided — which is how
// this slipped past every prior test. This spec CLICKS the button in both
// projects, so a regression fails the gate.
import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, TINY_RED_PNG_DATA_URL } from './_fixtures/withTrip.js'

// clockStub → today is 2026-05-23; day 2 straddles it so its stop is on the
// live agenda and reachable by a tap, and the 3-day trip makes DayChips render.
const STAY = {
  id: 'stopback-stay', shape: 'stay', status: 'planning', title: 'Provincetown', subtitle: 'fixture',
  dateRange: 'May 22 – 24, 2026', dateRangeStart: '2026-05-22', dateRangeEnd: '2026-05-24',
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
  heroImage: TINY_RED_PNG_DATA_URL,
  lodging: { name: 'Harbor Breeze', address: '690 Commercial St, Provincetown, MA', lat: 42.0584, lng: -70.1787 },
  days: [
    { n: 1, isoDate: '2026-05-22', date: 'Fri May 22', title: 'Arrive', lodging: 'Harbor Breeze',
      stops: [{ id: 'sb-arrive', time: '4:00 PM', name: 'Check in', kind: 'logistics', for: ['jonathan', 'helen', 'aurelia', 'rafa'] }] },
    { n: 2, isoDate: '2026-05-23', date: 'Sat May 23', title: 'Beach day', lodging: 'Harbor Breeze',
      stops: [{ id: 'sb-beach', time: '11:00 AM', name: 'Race Point Beach', kind: 'park', for: ['jonathan', 'helen', 'aurelia', 'rafa'] }] },
    { n: 3, isoDate: '2026-05-24', date: 'Sun May 24', title: 'Dunes', lodging: 'Harbor Breeze',
      stops: [{ id: 'sb-dunes', time: '10:00 AM', name: 'The dunes', kind: 'park', for: ['jonathan', 'helen', 'aurelia', 'rafa'] }] },
  ],
}

test('the stop-view back button is tappable and returns to the trip (day-chips must not swallow it)', async ({ page }) => {
  await seedTripIntoCache(page, STAY)
  await page.goto('/?person=helen&trip=stopback-stay&nosw=1')
  await page.getByRole('button', { name: 'Race Point Beach' }).click()
  await expect(page.getByRole('heading', { name: 'Race Point Beach' })).toBeVisible({ timeout: 5000 })

  const back = page.getByRole('button', { name: /Day 2 ·/ })
  await expect(back).toBeVisible()

  // The back button's own centre must belong to the back button — not the
  // sticky day-chips band painted over it (the exact regression this guards).
  const box = await back.boundingBox()
  const covered = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y)
    return !!(el && el.closest && el.closest('.day-chips'))
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 })
  expect(covered, 'the back button is under the .day-chips band').toBe(false)

  // And it actually works: a real click returns to the trip (fails if intercepted).
  await back.click({ timeout: 4000 })
  await expect(page.getByTestId('living-heart-home')).toBeVisible({ timeout: 6000 })
})
