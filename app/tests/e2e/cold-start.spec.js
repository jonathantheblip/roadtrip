import { test, expect } from '@playwright/test'
import { seedTripIntoCache } from './_fixtures/withTrip.js'

// Cold-start landing rules:
//   - open straight into a NEAR-NOW trip — today within ±4 days of its window
//     (so an imminent or just-finished trip opens, not only a strictly-ongoing one);
//   - an ARCHIVED trip is "filed away" — never the launch trip, even if its dates
//     still bracket today (a real bug: a real trip got archived-then-stale-dated and
//     kept hijacking launch into itself with a bogus LIVE ledge);
//   - otherwise land on the all-trips index.

function isoDay(offsetDays) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

function tripSeed({ id, title, startOffset, endOffset, archivedAt = undefined }) {
  return {
    id,
    status: 'planning',
    title,
    ...(archivedAt ? { archivedAt } : {}),
    dateRangeStart: isoDay(startOffset),
    dateRangeEnd: isoDay(endOffset),
    startCity: 'Belmont, MA',
    travelers: ['jonathan'],
    days: [
      {
        n: 1,
        date: 'Day',
        isoDate: isoDay(startOffset),
        title: 'Day',
        stops: [{ id: 's1', time: 'Noon', name: 'Stop', kind: 'tournament', for: ['jonathan'], address: 'X', lat: 41.3, lng: -72.0 }],
      },
    ],
  }
}

async function bootWith(page, seed) {
  await seedTripIntoCache(page, seed)
  await page.goto(`/?person=jonathan&trip=${seed.id}&nosw=1`)
}

const indexButton = (page) => page.getByRole('button', { name: /New trip/i }) // index-only
const tripChrome = (page) => page.getByRole('button', { name: /Back to trips/i }) // trip-view-only

test('opens a strictly-ongoing trip', async ({ page }) => {
  await bootWith(page, tripSeed({ id: 't-ongoing', title: 'Ongoing', startOffset: -1, endOffset: 1 }))
  await expect(tripChrome(page)).toBeVisible()
  await expect(indexButton(page)).toHaveCount(0)
})

test('opens a trip starting in 3 days (within the ±4 grace)', async ({ page }) => {
  await bootWith(page, tripSeed({ id: 't-soon', title: 'Leaving Soon', startOffset: 3, endOffset: 5 }))
  await expect(tripChrome(page)).toBeVisible()
  await expect(indexButton(page)).toHaveCount(0)
})

test('opens a trip that ended 2 days ago (within the ±4 grace)', async ({ page }) => {
  await bootWith(page, tripSeed({ id: 't-just-ended', title: 'Just Ended', startOffset: -4, endOffset: -2 }))
  await expect(tripChrome(page)).toBeVisible()
  await expect(indexButton(page)).toHaveCount(0)
})

test('lands on the index for a trip 10 days out (outside the grace)', async ({ page }) => {
  await bootWith(page, tripSeed({ id: 't-far', title: 'Far Off', startOffset: 10, endOffset: 12 }))
  await expect(indexButton(page)).toBeVisible()
})

test('lands on the index for an ARCHIVED trip whose dates still span today', async ({ page }) => {
  await bootWith(page, tripSeed({ id: 't-archived', title: 'Stale Archived', startOffset: -2, endOffset: 2, archivedAt: '2027-01-15T00:00:00.000Z' }))
  await expect(indexButton(page)).toBeVisible()
  await expect(tripChrome(page)).toHaveCount(0)
})

// Regression guard: a strictly-LIVE trip (today inside its window) must win the
// launch pick over an imminent FUTURE trip that only qualifies via the ±4 grace.
// Otherwise the future trip's later startDate wins the tiebreak and the app
// opens into a trip that hasn't begun, hiding the one the family is on.
test('a live trip beats an imminent future trip on launch (no future hijack)', async ({ page }) => {
  const live = tripSeed({ id: 't-live', title: 'Live Now', startOffset: -1, endOffset: 5 })
  const future = tripSeed({ id: 't-future', title: 'Starts In Three', startOffset: 3, endOffset: 8 })
  await page.addInitScript(({ trips }) => {
    localStorage.setItem('rt_trips_cache_v1', JSON.stringify(trips))
    localStorage.setItem('rt_person_v2', 'jonathan')
  }, { trips: [live, future] })
  // No ?trip= → the launch auto-pick runs.
  await page.goto('/?person=jonathan&nosw=1')
  await expect(tripChrome(page)).toBeVisible()
  // The app reflects the active trip into ?trip= — it must be the live one.
  await expect.poll(() => new URL(page.url()).searchParams.get('trip')).toBe('t-live')
})
