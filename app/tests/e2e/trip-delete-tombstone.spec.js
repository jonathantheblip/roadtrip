// Sync-honesty: a trip delete that DOESN'T reach the family must not silently
// reverse. Before the fix, deleteTrip returned false on a network failure, removeTrip
// ignored it, and the next pull re-added the trip from the stale D1 row. Now a failed
// delete leaves a TOMBSTONE (deleteTombstones) so the trip stays gone locally and every
// pull skips the id until the server confirms the delete. This proves the tombstone is
// set + the local removal holds on a failed remote delete; the pull-side skip
// (withoutDeleted) is unit-tested in deleteTombstones.test.mjs.
import { test, expect } from './_fixtures/clockStub.js'
import { openTopMenuItem } from './_fixtures/topNav.js'
import { seedTripIntoCache } from './_fixtures/withTrip.js'

const TRIP = {
  id: 'del-trip', shape: 'stay', status: 'planning', title: 'Delete Me', subtitle: 'fixture',
  dateRange: 'May 22 – 25, 2026', dateRangeStart: '2026-05-22', dateRangeEnd: '2026-05-25',
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
  days: [{ n: 1, isoDate: '2026-05-22', date: 'Fri May 22', stops: [] }],
}

test('a trip delete that fails remotely is TOMBSTONED, not silently reversed', async ({ page }) => {
  await seedTripIntoCache(page, TRIP)
  // Make the remote DELETE fail (the row stays in D1 — the resurrection setup).
  // Registered AFTER the seed catch-all so this specific handler wins for DELETE.
  await page.route(/roadtrip-sync[^/]*\/trips\/[^/?]+$/, (route) =>
    route.request().method() === 'DELETE'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"simulated delete failure"}' })
      : route.fallback()
  )
  await page.goto('/?person=helen&trip=del-trip&nosw=1')
  await expect(page.getByTestId('living-heart-home')).toBeVisible({ timeout: 10000 })

  // Delete the trip via Settings (top-bar ⋯ → Settings → Delete this trip → confirm).
  await openTopMenuItem(page, /Settings/i)
  await page.getByTestId('delete-trip').click()
  await page.getByTestId('delete-trip-confirm').click()

  // The remote delete failed, but the trip is gone LOCALLY and TOMBSTONED — so a
  // later pull (which would re-serve the stale row) can't resurrect it.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const tombs = JSON.parse(localStorage.getItem('rt_delete_tombstones_v1') || '{}')
        const cache = JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]')
        return {
          tombstoned: (tombs.trip || []).some((e) => e.id === 'del-trip'),
          inCache: cache.some((t) => t.id === 'del-trip'),
        }
      }), { timeout: 5000 }
    )
    .toEqual({ tombstoned: true, inCache: false })
})

// Sibling gap (2026-07-04 audit): the worker's masked-trip delete guard never
// 4xx's a REFUSED delete (that would leak "this trip is a secret" to a caller
// who only ever saw the cover) — it answers HTTP 200 with `deleted: 0`
// instead. Before this fix, deleteTrip read only `res.ok` (true for this
// response) and reported the delete as confirmed — clearing the tombstone
// for a trip the server never actually removed. Same tombstone/no-resurrect
// proof as above, but for the MASKED-REFUSAL network shape, not a hard failure.
test('a trip delete the worker silently REFUSES (masked-trip guard) is also TOMBSTONED, not treated as confirmed', async ({ page }) => {
  await seedTripIntoCache(page, TRIP)
  await page.route(/roadtrip-sync[^/]*\/trips\/[^/?]+$/, (route) =>
    route.request().method() === 'DELETE'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'del-trip', deleted: 0 }) })
      : route.fallback()
  )
  await page.goto('/?person=helen&trip=del-trip&nosw=1')
  await expect(page.getByTestId('living-heart-home')).toBeVisible({ timeout: 10000 })

  await openTopMenuItem(page, /Settings/i)
  await page.getByTestId('delete-trip').click()
  const [resp] = await Promise.all([
    page.waitForResponse((r) => /\/trips\/del-trip$/.test(r.url()) && r.request().method() === 'DELETE'),
    page.getByTestId('delete-trip-confirm').click(),
  ])
  expect(resp.status()).toBe(200)
  // A bare `.poll()` can catch a MOMENTARY tombstoned:true right after
  // markDeleted and pass on a stale sample even if the buggy code's
  // clearDeleted runs moments later — wait past the response for the in-page
  // promise chain (res.json() → deleteTrip's return → removeTrip's
  // continuation) to fully settle before reading the steady-state.
  await page.waitForTimeout(300)
  const state = await page.evaluate(() => {
    const tombs = JSON.parse(localStorage.getItem('rt_delete_tombstones_v1') || '{}')
    const cache = JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]')
    return {
      tombstoned: (tombs.trip || []).some((e) => e.id === 'del-trip'),
      inCache: cache.some((t) => t.id === 'del-trip'),
    }
  })
  expect(state).toEqual({ tombstoned: true, inCache: false })
})
