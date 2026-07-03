// THE RECORD · read faces (R5) — the whole-stay unfold's two-tense marks (design 03).
// A KEPT day wears a gold dot + "Kept" (or "A nothing day"); a LOOSE past day a dashed
// ring + "Still loose". Memory reads above today, intention below — no toggle.
import { test, expect } from '@playwright/test'
import { seedTripIntoCache, TINY_RED_PNG_DATA_URL } from './_fixtures/withTrip.js'

test.use({ timezoneId: 'UTC' })

async function pinNoon(page) {
  await page.addInitScript(() => {
    const N = Date
    const E = new N('2026-05-23T12:00:00.000Z').getTime()
    class D extends N { constructor(...a) { a.length === 0 ? super(E) : super(...a) } }
    D.now = N.now.bind(N)
    // eslint-disable-next-line no-global-assign
    globalThis.Date = D
  })
}

const STAY = {
  shape: 'stay', status: 'planning', title: 'Provincetown', id: 'rf-stay',
  dateRange: 'May 19 – 24, 2026', dateRangeStart: '2026-05-19', dateRangeEnd: '2026-05-24',
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'], heroImage: TINY_RED_PNG_DATA_URL,
  lodging: { name: 'Harbor Breeze', lat: 42.0584, lng: -70.1787 },
  days: [
    // A plain PAST day — no record, no stops. Must keep its ✓, never "still loose"/"kept".
    { n: 1, isoDate: '2026-05-19', date: 'Tue May 19', stops: [] },
    { n: 2, isoDate: '2026-05-20', date: 'Wed May 20', stops: [], record: { state: 'kept', keptBy: 'helen', keptAt: '2026-05-20T21:00:00Z', nothing: false, entries: [{ id: 'e1', name: 'Race Point Beach', time: 'late morning', for: ['helen'] }] } },
    { n: 3, isoDate: '2026-05-21', date: 'Thu May 21', stops: [], record: { state: 'kept', keptBy: 'jonathan', keptAt: '2026-05-21T21:00:00Z', nothing: true, entries: [] } },
    { n: 4, isoDate: '2026-05-22', date: 'Fri May 22', stops: [], record: { state: 'loose', entries: [{ id: 'e3', name: '', source: 'evidence', guess: 'near the water', time: 'around 4', photoCount: 3, for: ['helen'] }] } },
    { n: 5, isoDate: '2026-05-23', date: 'Sat May 23', stops: [] },
    { n: 6, isoDate: '2026-05-24', date: 'Sun May 24', stops: [{ id: 's1', time: '10:00 AM', name: 'Whale watch' }] },
  ],
}

test('the whole-stay unfold marks each day’s tense: plain-past ✓, kept (gold), nothing-day, still-loose', async ({ page }) => {
  await pinNoon(page)
  await seedTripIntoCache(page, STAY)
  await page.goto('/?person=helen&trip=rf-stay&nosw=1')
  await expect(page.getByTestId('living-heart-home')).toBeVisible({ timeout: 10000 })
  await page.getByTestId('whole-stay-toggle').click()
  const unfold = page.getByTestId('whole-stay')
  await expect(unfold).toBeVisible()
  const day = (re) => unfold.getByTestId('whole-stay-day').filter({ hasText: re })

  // A plain past day (no record): keeps its ✓, is NOT marked kept or loose (regression guard).
  const plain = day(/may 19/i)
  await expect(plain).not.toHaveAttribute('data-kept', '1')
  await expect(plain).not.toContainText(/still loose|kept/i)
  await expect(plain).toContainText('✓')

  // Kept day: gold marking (data-kept) + the kept memory renders as a named row.
  const keptDay = day(/may 20/i)
  await expect(keptDay).toHaveAttribute('data-kept', '1')
  await expect(keptDay).toContainText('Kept')
  await expect(keptDay).toContainText('Race Point Beach')

  // Nothing-day: the tag + the settled "we stayed put" line (not the plan's empty prompt).
  const nothingDay = day(/may 21/i)
  await expect(nothingDay).toHaveAttribute('data-kept', '1')
  await expect(nothingDay).toContainText(/a nothing day/i)
  await expect(nothingDay).toContainText(/stayed put/i)

  // Loose past day: NOT kept, wears "still loose", and its draft renders dashed.
  const looseDay = day(/may 22/i)
  await expect(looseDay).not.toHaveAttribute('data-kept', '1')
  await expect(looseDay).toContainText(/still loose/i)
  await expect(looseDay.getByTestId('record-draft-row')).toHaveCount(1)

  // Today is tagged; the future planned day carries its stop.
  await expect(day(/may 23/i)).toContainText(/today/i)
  await expect(day(/may 24/i)).toContainText('Whale watch')
})
