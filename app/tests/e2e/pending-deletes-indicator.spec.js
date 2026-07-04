import { test, expect } from '@playwright/test'

// Sync-safety (2026-07-04 audit): a trip delete that hasn't reached the
// family yet (offline, or the worker's masked-refusal guard) is tombstoned
// (lib/deleteTombstones.js) so it can't resurrect — but until now that state
// was invisible. The trips index (the one screen every family member lands
// on regardless of which trip was deleted) now shows an honest "still
// confirming" note whenever a tombstone is pending, and clears the moment
// deleteTombstones reports zero.
const TOMBSTONE_KEY = 'rt_delete_tombstones_v1'

function seedTombstones(page, trips) {
  return page.addInitScript(
    ([key, ids]) => {
      localStorage.setItem(key, JSON.stringify({ trip: ids.map((id) => ({ id, at: null })), memory: [] }))
    },
    [TOMBSTONE_KEY, trips]
  )
}

test('a pending trip-delete tombstone shows an honest "still confirming" note on the index', async ({ page }) => {
  await seedTombstones(page, ['stray-delete-1'])
  await page.goto('/?person=jonathan&nosw=1')
  await expect(page.getByTestId('pending-deletes-note')).toBeVisible({ timeout: 10000 })
  await expect(page.getByTestId('pending-deletes-note')).toContainText('A delete is still confirming')
})

test('more than one pending delete reads as a plural count', async ({ page }) => {
  await seedTombstones(page, ['stray-delete-1', 'stray-delete-2'])
  await page.goto('/?person=jonathan&nosw=1')
  await expect(page.getByTestId('pending-deletes-note')).toContainText('2 deletes are still confirming')
})

test('no pending deletes → the note never renders (the common case, byte-identical to before)', async ({ page }) => {
  await page.goto('/?person=jonathan&nosw=1')
  await expect(page.getByTestId('pending-deletes-note')).toHaveCount(0)
})

test('the note disappears LIVE once the background resync confirms the delete — no reload', async ({ page }) => {
  await seedTombstones(page, ['stray-delete-1'])
  // useTrips() mounts at App.jsx's top level regardless of which view is
  // showing, and its resync effect runs on mount — retrying every tombstoned
  // id via deleteTrip. Mock that retry as a genuine success (no `deleted: 0`),
  // artificially DELAYED so the test can deterministically observe the note
  // BEFORE the resync resolves rather than racing a near-instant mock
  // (webkit's scheduling let the real resync clear it before the first
  // paint-check ran) — this exercises the REAL resync → deleteTrip →
  // clearDeleted → subscribe() fan-out end to end, not a synthetic poke.
  await page.route(/roadtrip-sync[^/]*\/trips\/stray-delete-1$/, async (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback()
    await new Promise((r) => setTimeout(r, 600))
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'stray-delete-1' }) })
  })
  await page.goto('/?person=jonathan&nosw=1')
  await expect(page.getByTestId('pending-deletes-note')).toBeVisible({ timeout: 10000 })
  // The delayed resync resolves shortly after — no page.reload() anywhere.
  await expect(page.getByTestId('pending-deletes-note')).toHaveCount(0, { timeout: 10000 })
})
