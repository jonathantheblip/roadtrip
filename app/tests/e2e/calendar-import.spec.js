import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache } from './_fixtures/withTrip.js'
import { Buffer } from 'node:buffer'

// Calendar Pull — the client half of the flow, end to end. The Apple
// Shortcut reads the calendar on-device and the worker filters + geocodes
// (covered by worker/test/calendarFilter.test.mjs); the Shortcut then
// reopens the app at ?action=calendar-import&data=<base64 worker response>.
// This drives that deep link: confirmation lists the survivors, checking
// them creates stops on the right days via the existing stop-add path.
//
// REGRESSION GUARDS (the live-run break): the deep-linked trip is in the
// FUTURE — NOT active on the stubbed clock (2026-05-23) — so the
// active-trip cold-load override would, without its deep-link exemption,
// yank the view to the trips index. And the ?data= base64 is passed RAW
// (un-encoded), exactly as the Shortcut's "Open URL" emits standard
// base64, so the '+'→space decode path is exercised rather than masked by
// pre-encoding.

const FUTURE_TRIP = {
  id: 'fall-2026',
  status: 'planning',
  title: 'Fall Leaf Trip',
  subtitle: 'fixture',
  dateRange: 'Oct 9 – 11, 2026',
  dateRangeStart: '2026-10-09',
  dateRangeEnd: '2026-10-11',
  startCity: 'Belmont, MA',
  endCity: 'Portland, ME',
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
  days: [
    { n: 1, date: 'Fri Oct 9', isoDate: '2026-10-09', title: 'Drive up', drive: {}, lodging: '', stops: [] },
    { n: 2, date: 'Sat Oct 10', isoDate: '2026-10-10', title: 'Explore', drive: {}, lodging: '', stops: [] },
    { n: 3, date: 'Sun Oct 11', isoDate: '2026-10-11', title: 'Home', drive: {}, lodging: '', stops: [] },
  ],
}

// An active-today trip for the Path 1 (Settings action) test, where a
// ?trip= URL must land inside the trip rather than bounce to the index.
const ACTIVE_TRIP = {
  ...FUTURE_TRIP,
  id: 'spring-2026',
  title: 'Spring Getaway',
  dateRange: 'May 22 – 24, 2026',
  dateRangeStart: '2026-05-22',
  dateRangeEnd: '2026-05-24',
  days: [
    { n: 1, date: 'Fri May 22', isoDate: '2026-05-22', title: 'Drive up', drive: {}, lodging: '', stops: [] },
    { n: 2, date: 'Sat May 23', isoDate: '2026-05-23', title: 'Explore', drive: {}, lodging: '', stops: [] },
    { n: 3, date: 'Sun May 24', isoDate: '2026-05-24', title: 'Home', drive: {}, lodging: '', stops: [] },
  ],
}

// The worker's response (post-filter survivors, geocoded). Two events on
// Saturday Oct 10, one on Friday Oct 9.
const PAYLOAD = {
  matched: true,
  tripId: 'fall-2026',
  dateRange: { start: '2026-10-09', end: '2026-10-11' },
  events: [
    { title: 'Dinner at Fore Street', start: '2026-10-10T19:00:00', end: '2026-10-10T21:00:00', location: 'Fore Street', address: '288 Fore St, Portland, ME', lat: 43.6571, lng: -70.2495 },
    { title: 'Portland Museum of Art', start: '2026-10-10T13:00:00', end: '2026-10-10T15:00:00', location: 'PMA', address: '7 Congress Sq, Portland, ME', lat: 43.6549, lng: -70.2622 },
    { title: 'Portland Head Light', start: '2026-10-09T16:00:00', end: '2026-10-09T17:00:00', location: 'Head Light', address: '12 Captain Strout Cir, Cape Elizabeth, ME', lat: 43.6231, lng: -70.2079 },
  ],
}

// Pass the base64 RAW (no URL-encoding), exactly as the Shortcut's "Open
// URL" does. URLSearchParams will turn any '+' into a space; the decoder
// restores it.
function deepLink(payload, person = 'helen') {
  const b64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')
  return `/?person=${person}&action=calendar-import&data=${b64}&nosw=1`
}

async function readTrip(page, id) {
  return page.evaluate((tid) => {
    const all = JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]')
    return all.find((t) => t.id === tid) || null
  }, id)
}

test.describe('Calendar Pull — confirmation → stops', () => {
  test('cold-load deep link to a future trip mounts the confirmation (not the index)', async ({ page }) => {
    await seedTripIntoCache(page, FUTURE_TRIP)
    await page.goto(deepLink(PAYLOAD))

    // The confirmation mounted — the cold-load override did NOT bounce us
    // to the trips index even though the trip isn't active today.
    const rows = page.getByTestId('calendar-event-row')
    await expect(rows).toHaveCount(3)
    await expect(page.getByText('THE JACKSON FAMILY')).toHaveCount(0)
    await expect(page.getByText('Dinner at Fore Street')).toBeVisible()
    await expect(page.getByText('Oct 10 · 7:00 PM')).toBeVisible()
    await expect(page.getByText('288 Fore St, Portland, ME')).toBeVisible()

    // Uncheck the Friday lighthouse stop, leaving the two Saturday events.
    await rows.filter({ hasText: 'Portland Head Light' }).getByRole('checkbox').uncheck()
    await expect(page.getByTestId('calendar-import-add')).toContainText('Add 2 events')
    await page.getByTestId('calendar-import-add').click()

    await expect(page.getByTestId('calendar-import-saved')).toContainText('Added 2 events to Fall Leaf Trip')

    // Stops landed on the right days; the unchecked one did not.
    const trip = await readTrip(page, 'fall-2026')
    const day1 = trip.days.find((d) => d.n === 1)
    const day2 = trip.days.find((d) => d.n === 2)
    expect(day1.stops.length).toBe(0) // lighthouse unchecked
    expect(day2.stops.map((s) => s.name).sort()).toEqual(
      ['Dinner at Fore Street', 'Portland Museum of Art'].sort()
    )

    const dinner = day2.stops.find((s) => s.name === 'Dinner at Fore Street')
    expect(dinner.time).toBe('7:00 PM')
    expect(dinner.address).toBe('288 Fore St, Portland, ME')
    expect(dinner.lat).toBeCloseTo(43.6571, 3)
    expect(dinner.lng).toBeCloseTo(-70.2495, 3)
    // who defaults to the full family, editable afterward.
    expect(dinner.for).toEqual(['jonathan', 'helen', 'aurelia', 'rafa'])
  })

  test('a no-matching-trip payload shows the gentle no-match state', async ({ page }) => {
    await seedTripIntoCache(page, FUTURE_TRIP)
    await page.goto(
      deepLink({ matched: false, tripId: null, dateRange: { start: '2026-12-24', end: '2026-12-26' }, events: [], reason: 'no matching trip' })
    )
    await expect(page.getByTestId('calendar-import-nomatch')).toBeVisible()
    await expect(page.getByTestId('calendar-import-nomatch')).toContainText(/no confirmed trip covers/i)
  })

  test('a malformed data payload shows a visible error, not a silent fall-through to the index', async ({ page }) => {
    await seedTripIntoCache(page, FUTURE_TRIP)
    await page.goto('/?person=helen&action=calendar-import&data=notvalidjsonbase64&nosw=1')
    await expect(page.getByTestId('calendar-import-error')).toBeVisible()
    await expect(page.getByTestId('calendar-import-error')).toContainText(/couldn.t read the calendar data/i)
    // It did NOT silently fall through to the trips index.
    await expect(page.getByText('THE JACKSON FAMILY')).toHaveCount(0)
  })

  test('Path 1 — a confirmed trip shows the "Pull calendar events" action', async ({ page }) => {
    await seedTripIntoCache(page, ACTIVE_TRIP)
    await page.goto('/?person=helen&trip=spring-2026&nosw=1')
    await page.getByRole('button', { name: 'Trip settings' }).click()
    await expect(page.getByTestId('pull-calendar')).toBeVisible()
    await expect(page.getByTestId('pull-calendar')).toContainText('Pull calendar events')
  })
})
