import { test, expect } from './_fixtures/clockStub.js'
import {
  seedTripIntoCache,
  seedMemoriesIntoCache,
  FIXTURE_TRIP,
  TINY_RED_PNG_DATA_URL,
} from './_fixtures/withTrip.js'

// The four-tab stay shell (We could · Now · Photos · Look back) is the SOLE
// bottom nav on a trip home. It must stay pinned to the viewport bottom on
// every tab — including Photos, where the album scrolls a long way. A
// 2026-07-07 field report described it floating mid-screen on Photos; this
// spec is the regression trap. It runs webkit-mobile (the real iOS WebKit
// engine, iPhone 15 profile) as well as chromium, so an iOS-only layout
// regression can't slip through. There was no StayTabBar e2e coverage before.

function photoOn(stopId, id, caption) {
  return {
    id,
    tripId: 'volleyball-2026',
    stopId,
    authorTraveler: 'helen',
    visibility: 'shared',
    kind: 'photo',
    caption,
    photoRef: { storage: 'external', url: TINY_RED_PNG_DATA_URL },
    photoExternalURLs: [],
    reactions: [],
    createdAt: '2026-05-22T22:00:00Z',
    updatedAt: '2026-05-22T22:00:00Z',
  }
}

async function openPhotos(page) {
  for (const tid of ['jonathan-photos-entry', 'helen-photos-entry', 'aurelia-photos-entry', 'rafa-photos-entry']) {
    const loc = page.getByTestId(tid)
    if (await loc.count()) {
      await loc.click()
      return
    }
  }
  throw new Error('No Photos entry point found on this view')
}

function barMetrics(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.stay-tabbar')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return {
      position: getComputedStyle(el).position,
      // gap between the bar's bottom edge and the viewport bottom
      gapFromViewportBottom: Math.round(window.innerHeight - r.bottom),
    }
  })
}

test('the stay tab bar stays pinned to the viewport bottom on the Photos tab, even scrolled', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  // Enough photos on one stop that the album scrolls well past a phone screen.
  const photos = []
  for (let i = 0; i < 40; i++) photos.push(photoOn('vb1-3', `sb${i}`, `Photo ${i}`))
  await seedMemoriesIntoCache(page, photos)

  await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
  await openPhotos(page)

  const bar = page.getByTestId('stay-tabbar')
  await expect(bar).toBeVisible()

  // At the top of the album: pinned to the very bottom (allow a 1px rounding gap).
  const top = await barMetrics(page)
  expect(top.position).toBe('fixed')
  expect(top.gapFromViewportBottom).toBeLessThanOrEqual(1)

  // Scroll the album down a long way; the bar must still be flush with the
  // viewport bottom — not carried up mid-screen (the field-report symptom).
  await page.evaluate(() => {
    const se = document.scrollingElement || document.documentElement
    se.scrollTop = 800
    window.scrollTo(0, 800)
  })
  await page.waitForTimeout(150)
  const scrolled = await barMetrics(page)
  expect(scrolled.position).toBe('fixed')
  expect(scrolled.gapFromViewportBottom).toBeLessThanOrEqual(1)
})
