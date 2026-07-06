// THE RECORD · keep the day (R3b) — the design's centerpiece. In the evening,
// the day's-story slot offers a SETTLE CARD: keep today (it has a record) or
// keep a nothing-day ("we stayed put"). Keeping marks day.record.state='kept'
// and the day wears gold on the whole-stay unfold. This spec pins the arc with
// an EVENING clock (the card is evening-gated, so the noon-clocked suite never
// shows it — no regression there).
import { test, expect } from '@playwright/test'
import { seedTripIntoCache, TINY_RED_PNG_DATA_URL } from './_fixtures/withTrip.js'

// The evening gate reads DEVICE-LOCAL hours (nowMinutesInZone), so pin the
// browser's timezone to UTC — otherwise the 23:30Z clock below reads as
// afternoon for a contributor west of UTC and the settle card never shows
// (the CI/local TZ split the deploy-verify memory warns about).
test.use({ timezoneId: 'UTC' })

// Pin `new Date()` to an evening inside the trip window (23:30 UTC, May 23).
async function pinEvening(page) {
  await page.addInitScript(() => {
    const Native = Date
    const EVE = new Native('2026-05-23T23:30:00.000Z').getTime()
    class D extends Native {
      constructor(...a) { a.length === 0 ? super(EVE) : super(...a) }
    }
    D.now = Native.now.bind(Native)
    // eslint-disable-next-line no-global-assign
    globalThis.Date = D
  })
}

const BASE = {
  shape: 'stay', status: 'planning', title: 'Provincetown', subtitle: 'fixture',
  dateRange: 'May 22 – 25, 2026', dateRangeStart: '2026-05-22', dateRangeEnd: '2026-05-25',
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
  heroImage: TINY_RED_PNG_DATA_URL,
  lodging: { name: 'Harbor Breeze', address: '690 Commercial St, Provincetown, MA', lat: 42.0584, lng: -70.1787 },
}

const readRecord = (page, id, iso) => page.evaluate(({ id, iso }) => {
  const all = JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]')
  return all.find((t) => t.id === id)?.days?.find((d) => d.isoDate === iso)?.record ?? null
}, { id, iso })

test('the settle card keeps today → the day wears gold on the unfold', async ({ page }) => {
  const STAY = {
    ...BASE, id: 'keep-stay',
    days: [
      { n: 1, isoDate: '2026-05-22', date: 'Fri May 22', title: 'Arrive', lodging: 'Harbor Breeze',
        stops: [{ id: 's1', time: '4:00 PM', name: 'Check in', kind: 'logistics', for: ['helen'] }] },
      // TODAY carries a record in the LEGACY bare-array shape — the card must
      // read it (readRecord coerces) and keeping upgrades it to the object.
      { n: 2, isoDate: '2026-05-23', date: 'Sat May 23', title: 'Beach', lodging: 'Harbor Breeze',
        stops: [],
        record: [
          { id: 'r1', name: 'Race Point Beach', time: 'late morning', for: ['helen'] },
          { id: 'r2', name: 'Taffy on Commercial St', time: 'around four', for: ['helen'] },
        ] },
      { n: 3, isoDate: '2026-05-24', date: 'Sun May 24', title: 'Dunes', lodging: 'Harbor Breeze', stops: [] },
    ],
  }
  await pinEvening(page)
  await seedTripIntoCache(page, STAY)
  await page.goto('/?person=helen&trip=keep-stay&nosw=1')
  const home = page.getByTestId('living-heart-home')
  await expect(home).toBeVisible({ timeout: 10000 })

  const settle = home.getByTestId('settle-card')
  await expect(settle).toBeVisible()
  await expect(settle).toHaveAttribute('data-settle-state', 'keep')
  await expect(settle).toContainText('Race Point Beach')

  await settle.getByTestId('settle-keep').click()
  // Optimistic flip to kept, then persisted as the object shape with state=kept.
  await expect(settle).toHaveAttribute('data-settle-state', 'kept', { timeout: 3000 })
  await expect.poll(async () => (await readRecord(page, 'keep-stay', '2026-05-23'))?.state || null,
    { timeout: 6000 }).toBe('kept')
  const rec = await readRecord(page, 'keep-stay', '2026-05-23')
  expect(rec.keptBy).toBe('helen')
  expect(rec.entries.map((e) => e.name)).toEqual(['Race Point Beach', 'Taffy on Commercial St']) // entries survived

  // The whole-stay unfold marks the kept day gold.
  await home.getByTestId('whole-stay-toggle').click()
  const keptDay = home.locator('[data-testid="whole-stay-day"][data-kept="1"]')
  await expect(keptDay.first()).toBeVisible()
  await expect(keptDay.first()).toContainText(/kept/i)
})

test('a lone nothing-day keeps as "we stayed put" — on the trip’s LAST evening (quiet days pool otherwise)', async ({ page }) => {
  // The settle rhythm (Jonathan's settled pick, 2026-07-06): a single quiet day
  // gets its own card only when the trip is about to close — mid-trip it stays
  // silent and pools with the next quiet one (settle-sheet-verbs.spec.js covers
  // the pool). So today is the LAST day here, with yesterday already kept.
  const NOTHING = {
    ...BASE, id: 'keep-nothing',
    dateRange: 'May 22 – 23, 2026', dateRangeStart: '2026-05-22', dateRangeEnd: '2026-05-23',
    days: [
      { n: 1, isoDate: '2026-05-22', date: 'Fri May 22', title: 'Arrive', lodging: 'Harbor Breeze', stops: [],
        record: { state: 'kept', keptBy: 'jonathan', keptAt: '2026-05-22T23:00:00.000Z', nothing: true, entries: [] } },
      { n: 2, isoDate: '2026-05-23', date: 'Sat May 23', title: 'A quiet day', lodging: 'Harbor Breeze', stops: [] },
    ],
  }
  await pinEvening(page)
  await seedTripIntoCache(page, NOTHING)
  await page.goto('/?person=helen&trip=keep-nothing&nosw=1')
  const home = page.getByTestId('living-heart-home')
  await expect(home).toBeVisible({ timeout: 10000 })

  const settle = home.getByTestId('settle-card')
  await expect(settle).toHaveAttribute('data-settle-state', 'nothing')
  await expect(settle).toContainText(/stayed put/i)

  await settle.getByTestId('settle-keep').click()
  await expect.poll(async () => {
    const r = await readRecord(page, 'keep-nothing', '2026-05-23')
    return r ? { state: r.state, nothing: r.nothing } : null
  }, { timeout: 6000 }).toEqual({ state: 'kept', nothing: true })
})
