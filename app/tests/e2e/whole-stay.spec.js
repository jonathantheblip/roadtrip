// THE WHOLE STAY (SEE+EDIT the plan, 2026-07-02) — the agenda's unfold.
// Reported live from the family's trip: a stay's home showed ONLY today, so
// days 2–5 were unreachable outside the buried editor, and nothing on a
// published trip offered a way IN to the editor. This spec pins the arc:
//   - the agenda header's quiet toggle unfolds every day in place (today
//     accent-tagged, past receded, open days honest) and folds back;
//   - the empty-today face carries the same toggle (the live-bug case);
//   - a day's pencil / a stop's "Change" pill land in the editor ON that
//     day, and Back returns to the TRIP, not the trips index;
//   - the standing "Change the plan" quiet action exists on a live home;
//   - a route trip shares the surface with shape-aware wording ("Day by
//     day"), and Rafa's stop view gets NO edit door (kid lens).
import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, TINY_RED_PNG_DATA_URL } from './_fixtures/withTrip.js'

const SHOT_DIR = 'tests/e2e/screenshots'

// Clock is stubbed to 2026-05-23 (clockStub) — this stay straddles it, so the
// home is LIVE with 2026-05-23 as "today" (day 2 of 4).
const WHOLE_STAY = {
  id: 'ws-live', shape: 'stay', status: 'planning', title: 'Provincetown', subtitle: 'fixture',
  dateRange: 'May 22 – 25, 2026', dateRangeStart: '2026-05-22', dateRangeEnd: '2026-05-25',
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
  heroImage: TINY_RED_PNG_DATA_URL,
  lodging: { name: 'Harbor Breeze', address: '690 Commercial St, Provincetown, MA', lat: 42.0584, lng: -70.1787 },
  days: [
    {
      n: 1, isoDate: '2026-05-22', date: 'Fri May 22', title: 'Arrive', lodging: 'Harbor Breeze',
      stops: [{ id: 'ws-arrive', time: '4:00 PM', name: 'Check in', kind: 'logistics' }],
    },
    {
      n: 2, isoDate: '2026-05-23', date: 'Sat May 23', title: 'Beach', lodging: 'Harbor Breeze',
      stops: [{ id: 'ws-beach', time: '11:00 AM', name: 'Race Point Beach', kind: 'park' }],
    },
    // 2026-05-24 is deliberately ABSENT from days[] — the grid must still
    // show it as an honest open day (the sparse-trip case).
    {
      n: 3, isoDate: '2026-05-25', date: 'Mon May 25', title: 'Dinner out', lodging: 'Harbor Breeze',
      stops: [{ id: 'ws-dinner', time: '7:00 PM', name: 'The Canteen', kind: 'dinner' }],
    },
  ],
}

// The live wound, exactly: TODAY (05-23) has nothing planned, but a later
// day does — pre-fix that dinner was unreachable from the home.
const EMPTY_TODAY_STAY = {
  ...WHOLE_STAY,
  id: 'ws-empty-today',
  days: [
    {
      n: 1, isoDate: '2026-05-25', date: 'Mon May 25', title: 'Dinner out', lodging: 'Harbor Breeze',
      stops: [{ id: 'ws-late-dinner', time: '7:00 PM', name: 'Spiritus Pizza', kind: 'dinner' }],
    },
  ],
}

// The rare route trip shares the one-home surface — the toggle just reads
// "Day by day" (never a stay's wording, never any drive logic).
const ROUTE_TRIP = {
  ...WHOLE_STAY,
  id: 'ws-route', shape: 'route', title: 'The big drive',
  lodging: undefined,
  startCity: 'Belmont, MA', endCity: 'Portland, ME',
}

async function openHome(page, tripId, person = 'jonathan') {
  await page.goto(`/?person=${person}&trip=${tripId}&nosw=1`)
  const home = page.getByTestId('living-heart-home')
  await expect(home).toBeVisible({ timeout: 10000 })
  return home
}

test('the agenda unfolds to the whole stay — every day visible, today tagged, any stop tappable', async ({ page }) => {
  await seedTripIntoCache(page, WHOLE_STAY)
  const home = await openHome(page, 'ws-live')

  // Collapsed = the shipped today face: today's stop is a row; a later day's
  // stop is NOT (the quiet "Next ·" readout may NAME it, but no row exists).
  await expect(home.getByRole('button', { name: 'Race Point Beach' })).toBeVisible()
  await expect(home.getByRole('button', { name: /The Canteen/ })).toHaveCount(0)

  const toggle = home.getByTestId('whole-stay-toggle')
  await expect(toggle).toHaveText(/The whole stay/i)
  await toggle.click()

  // Every day of the window renders — including the day that has no saved
  // record (May 24, an honest open day with a permission line).
  const days = home.getByTestId('whole-stay-day')
  await expect(days).toHaveCount(4)
  await page.screenshot({ path: `${SHOT_DIR}/whole-stay-unfolded.png`, fullPage: true })
  await expect(home.getByText('Fri · May 22')).toBeVisible()
  await expect(home.getByText('Sun · May 24')).toBeVisible()
  // Today is tagged; the fold control flips.
  await expect(home.getByTestId('whole-stay')).toContainText('Today')
  await expect(toggle).toHaveText(/Just today/i)

  // A LATER day's stop is now one tap from the home — the retired
  // broadsheet's one load-bearing power, back. (Folded-by-default on return
  // is pinned by the pencil test below: editor → Back → home → collapsed.)
  // NOTE: StopDetail's header back button is NOT tappable here — in a
  // zero-safe-area environment the sticky day-chips band (top: max(40px, …))
  // clips its hit area; real iPhones clear it via env(safe-area-inset-top).
  // Pre-existing, logged in the overnight report.
  await home.getByRole('button', { name: /The Canteen/ }).click()
  await expect(page.getByRole('heading', { name: 'The Canteen' })).toBeVisible({ timeout: 5000 })
})

test('the EMPTY-today face carries the toggle — the live-bug dinner is one tap away, and open days invite a plan', async ({ page }) => {
  await seedTripIntoCache(page, EMPTY_TODAY_STAY)
  const home = await openHome(page, 'ws-empty-today')

  // The alive-empty card is intact (Jonathan's voice), with the toggle beside
  // the header — the exact case where "I can't see the daily agendas" bit.
  await expect(home.getByText('Nothing planned today — take it easy')).toBeVisible()
  const toggle = home.getByTestId('whole-stay-toggle')
  await toggle.click()

  await expect(home.getByText('Spiritus Pizza')).toBeVisible()
  // Open days show their own permission line + an inline "Add something" door.
  await expect(home.getByTestId('whole-stay-day').filter({ hasText: /add something/i }).first()).toBeVisible()
  await page.screenshot({ path: `${SHOT_DIR}/whole-stay-empty-today-unfolded.png`, fullPage: true })
})

test('"Add something" on an OPEN day CREATES that day in the editor — dated, in order', async ({ page }) => {
  await seedTripIntoCache(page, WHOLE_STAY)
  const home = await openHome(page, 'ws-live')
  await home.getByTestId('whole-stay-toggle').click()

  // May 24 exists only on the grid (an open day the trip never wrote).
  await home.getByRole('button', { name: 'Add something — Sun · May 24' }).click()
  await expect(page.getByText(/^PUBLISHED$/)).toBeVisible({ timeout: 5000 })
  // The editor now HAS a May 24 block — created for the caller, slotted
  // between May 23 and May 25 (date order), ready to fill in.
  await expect(page.locator('#editor-day-2026-05-24')).toBeVisible()
})

test('a day\'s pencil lands in the editor ON that day, and Back returns to the TRIP (not the index)', async ({ page }) => {
  await seedTripIntoCache(page, WHOLE_STAY)
  const home = await openHome(page, 'ws-live')
  await home.getByTestId('whole-stay-toggle').click()

  await home.getByRole('button', { name: 'Change this day — Mon · May 25' }).click()
  // The editor opens on THIS trip with the day's anchor present.
  await expect(page.getByText(/^PUBLISHED$/)).toBeVisible({ timeout: 5000 })
  await expect(page.locator('#editor-day-2026-05-25')).toBeVisible()
  await page.screenshot({ path: `${SHOT_DIR}/whole-stay-editor-day-focus.png` })
  // The back affordance tells the truth: it returns to the trip, by name.
  const back = page.getByRole('button', { name: /Provincetown/ }).first()
  await expect(back).toBeVisible()
  await back.click()
  await expect(page.getByTestId('living-heart-home')).toBeVisible({ timeout: 5000 })
})

test('the standing "Change the plan" quiet action opens the editor and Back returns to the trip', async ({ page }) => {
  await seedTripIntoCache(page, WHOLE_STAY)
  const home = await openHome(page, 'ws-live')

  await home.getByRole('button', { name: 'Change the plan' }).click()
  await expect(page.getByText(/^PUBLISHED$/)).toBeVisible({ timeout: 5000 })
  await page.getByRole('button', { name: /Provincetown/ }).first().click()
  await expect(page.getByTestId('living-heart-home')).toBeVisible({ timeout: 5000 })
})

test('a stop\'s "Change" pill goes straight to the editor on that stop\'s day (adult lens)', async ({ page }) => {
  await seedTripIntoCache(page, WHOLE_STAY)
  const home = await openHome(page, 'ws-live', 'helen')

  // Today's agenda row → StopDetail → Change.
  await home.getByRole('button', { name: 'Race Point Beach' }).click()
  await expect(page.getByRole('heading', { name: 'Race Point Beach' })).toBeVisible({ timeout: 5000 })
  await page.getByRole('button', { name: 'Change this stop in the plan' }).click()
  await expect(page.getByText(/^PUBLISHED$/)).toBeVisible({ timeout: 5000 })
  await expect(page.locator('#editor-day-2026-05-23')).toBeVisible()
})

test('Rafa\'s stop view carries NO edit door (kid lens keeps zero destructive paths)', async ({ page }) => {
  await seedTripIntoCache(page, WHOLE_STAY)
  // Rafa's phone home is his bespoke RafaView; reach the stop through it.
  await page.goto('/?person=rafa&trip=ws-live&nosw=1')
  await page.getByRole('button', { name: 'Race Point Beach' }).first().click()
  await expect(page.getByRole('heading', { name: 'Race Point Beach' })).toBeVisible({ timeout: 10000 })
  await expect(page.getByRole('button', { name: 'Change this stop in the plan' })).toHaveCount(0)
})

test('a route trip shares the surface with shape-aware wording — "Day by day", never stay talk', async ({ page }) => {
  await seedTripIntoCache(page, ROUTE_TRIP)
  const home = await openHome(page, 'ws-route')
  const toggle = home.getByTestId('whole-stay-toggle')
  await expect(toggle).toHaveText(/Day by day/i)
  await expect(toggle).not.toHaveText(/whole stay/i)
  await toggle.click()
  await expect(home.getByTestId('whole-stay-day')).toHaveCount(4)
})

test('aurelia reads the toggle in her lowercase voice', async ({ page }) => {
  await seedTripIntoCache(page, WHOLE_STAY)
  const home = await openHome(page, 'ws-live', 'aurelia')
  await expect(home.getByTestId('whole-stay-toggle')).toHaveText('the whole stay')
})
