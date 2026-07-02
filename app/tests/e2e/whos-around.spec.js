// "Who's around" (slice 8) — the Now-tab presence band. The worker boundary
// (kid coords never stored, purge) is covered in worker/test/presence.test.js and
// the client privacy gate in scripts/__tests__/presence.test.mjs; here we prove the
// UI on a LIVE stay:
//   - the band renders one row per family member with live vs idle dots + "where";
//   - a manual status shows as the "what" line; the honest caption is present;
//   - this device shares its OWN presence (a POST /presence fires) — and the kid
//     lens never puts coordinates on the wire (the client gate, live in the app).
import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'
import { expectNoSeriousA11y } from './_fixtures/axe.js'

const TRIP = FIXTURE_TRIP.id // 'volleyball-2026' — a STAY, live under the clock stub
// Seeded freshness is relative to the STUBBED clock (clockStub pins new Date()).
const STUB = Date.parse('2026-05-23T12:00:00.000Z')

// What GET /presence returns: Jonathan precise + live, Helen idle with a manual
// status, Aurelia coarse + live, Rafa idle. (precise lat/lng ride only for adults,
// and the band never renders them — they're for a future live map.)
function presenceRows() {
  return [
    { tripId: TRIP, traveler: 'jonathan', precise: true, lat: 43.0, lng: -72.9, accuracy: 12, placeBucket: 'at_place', note: null, updatedAt: STUB - 30_000, createdAt: STUB - 3_600_000 },
    { tripId: TRIP, traveler: 'helen', precise: false, lat: null, lng: null, accuracy: null, placeBucket: 'out', note: 'bakery run', updatedAt: STUB - 22 * 60_000, createdAt: STUB - 3_600_000 },
    { tripId: TRIP, traveler: 'aurelia', precise: false, lat: null, lng: null, accuracy: null, placeBucket: 'at_place', note: null, updatedAt: STUB - 60_000, createdAt: STUB - 3_600_000 },
    { tripId: TRIP, traveler: 'rafa', precise: false, lat: null, lng: null, accuracy: null, placeBucket: 'out', note: null, updatedAt: STUB - 3 * 60 * 60_000, createdAt: STUB - 3_600_000 },
  ]
}

// Mock GET /presence (seeded) + capture POSTs. Registered AFTER seedTripIntoCache so
// it wins over that fixture's catch-all 404.
function mockPresence(page) {
  const posted = []
  page.route(/workers\.dev\/presence(\?.*)?$/, async (route) => {
    const req = route.request()
    if (req.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(presenceRows()) })
      return
    }
    const body = (() => { try { return JSON.parse(req.postData() || '{}') } catch { return {} } })()
    posted.push(body)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })
  return posted
}

async function openNow(page, who) {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  const posted = mockPresence(page)
  await page.goto(`/?person=${who}&trip=${TRIP}&nosw=1`)
  // The Now tab IS the trip home; the band lives there.
  await expect(page.getByTestId('whos-around')).toBeVisible({ timeout: 10000 })
  return posted
}

test.describe("Who's around — the presence band", () => {
  test('jonathan: every family member renders, live vs idle, with honest copy', async ({ page }) => {
    await openNow(page, 'jonathan')
    const band = page.getByTestId('whos-around')
    // All four people, named.
    for (const nm of ['Jonathan', 'Helen', 'Aurelia', 'Rafa']) {
      await expect(band).toContainText(nm)
    }
    await expect(band).toContainText('you') // the current device is tagged
    await expect(band).toContainText('out & about') // Helen / Rafa coarse bucket
    await expect(band).toContainText('bakery run') // Helen's manual status (the "what")
    await expect(band).toContainText(/last seen/) // an idle row is honest about it
    // The load-bearing honesty: never imply background tracking.
    await expect(band).toContainText('Shared only while the app is open')
    await page.screenshot({ path: 'tests/e2e/screenshots/whos-around-jonathan.png' })
    await expectNoSeriousA11y(page)
  })

  test('this device shares its own presence (a POST fires)', async ({ page }) => {
    const posted = await openNow(page, 'jonathan')
    await expect.poll(() => posted.length, { timeout: 10000 }).toBeGreaterThan(0)
    expect(posted[0].tripId).toBe(TRIP)
    expect(typeof posted[0].placeBucket).toBe('string')
  })

  test('a manual status posts as the note', async ({ page }) => {
    const posted = await openNow(page, 'jonathan')
    await page.getByRole('button', { name: 'Set status' }).click()
    await page.getByLabel('Set your status').fill('grilling out back')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect.poll(() => posted.some((b) => b.note === 'grilling out back'), { timeout: 10000 }).toBe(true)
  })

  test('a two-person trip shows ONLY the two travelling — not the kids who stayed home', async ({ page }) => {
    // Roster = jonathan + helen; Aurelia and Rafa are not on this trip and must
    // not appear (faded "not sharing") implying they're here but quiet.
    const twoPerson = { ...FIXTURE_TRIP, id: 'two-person-2026', travelers: ['jonathan', 'helen'] }
    await seedTripIntoCache(page, twoPerson)
    page.route(/workers\.dev\/presence(\?.*)?$/, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify([
            { tripId: 'two-person-2026', traveler: 'jonathan', precise: true, lat: 43, lng: -72.9, accuracy: 12, placeBucket: 'at_place', note: null, updatedAt: STUB - 30_000, createdAt: STUB - 3_600_000 },
            { tripId: 'two-person-2026', traveler: 'helen', precise: false, lat: null, lng: null, accuracy: null, placeBucket: 'out', note: 'bakery run', updatedAt: STUB - 60_000, createdAt: STUB - 3_600_000 },
          ]),
        })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    })
    await page.goto('/?person=jonathan&trip=two-person-2026&nosw=1')
    const band = page.getByTestId('whos-around')
    await expect(band).toBeVisible({ timeout: 10000 })
    await expect(band).toContainText('Jonathan')
    await expect(band).toContainText('Helen')
    await expect(band).not.toContainText('Aurelia')
    await expect(band).not.toContainText('Rafa')
  })

  test('helen (light lens): band renders and passes axe', async ({ page }) => {
    await openNow(page, 'helen')
    const band = page.getByTestId('whos-around')
    await expect(band).toContainText('Helen')
    await expect(band).toContainText('Shared only while the app is open')
    await expectNoSeriousA11y(page) // --muted on a light surface must still clear AA
  })

  // COMPOSITE TRIPS GO LIVE — "who's around" was gated to a single-place stay
  // only; a multi-city trip got none of it (presence, waves, the band itself).
  // Clock is 2026-05-23: Rome's window is over, Florence is the current leg and
  // carries its OWN members (a partial-party leg) to prove roster scoping.
  const COMPOSITE_LIVE = {
    id: 'composite-live-2026',
    status: 'planning',
    title: 'Italy composite',
    subtitle: 'fixture',
    dateRange: 'May 20 – 26, 2026',
    dateRangeStart: '2026-05-20',
    dateRangeEnd: '2026-05-26',
    travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
    parts: [
      { id: 'p-rome', type: 'city', place: { name: 'Rome', lat: 41.9028, lng: 12.4964 }, dateStart: '2026-05-20', dateEnd: '2026-05-22' },
      { id: 'p-flor', type: 'city', place: { name: 'Florence', lat: 43.7696, lng: 11.2558 }, dateStart: '2026-05-23', dateEnd: '2026-05-24', members: ['jonathan', 'aurelia'] },
    ],
    days: [
      { n: 1, isoDate: '2026-05-23', stops: [] },
    ],
  }

  test('a composite trip gets the SAME live "who\'s around" band, scoped to the CURRENT leg\'s roster', async ({ page }) => {
    await seedTripIntoCache(page, COMPOSITE_LIVE)
    mockPresence(page)
    await page.goto(`/?person=jonathan&trip=${COMPOSITE_LIVE.id}&nosw=1`)
    const band = page.getByTestId('whos-around')
    await expect(band).toBeVisible({ timeout: 10000 })
    // Florence's own members (a partial-party leg) — not the whole trip's four.
    await expect(band).toContainText('Jonathan')
    await expect(band).toContainText('Aurelia')
    await expect(band).not.toContainText('Helen')
    await expect(band).not.toContainText('Rafa')
    await expectNoSeriousA11y(page)
  })

  test('a composite trip shares presence too (a POST fires) — the SAME live gate as a stay', async ({ page }) => {
    const posted = []
    await seedTripIntoCache(page, COMPOSITE_LIVE)
    page.route(/workers\.dev\/presence(\?.*)?$/, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
        return
      }
      const body = (() => { try { return JSON.parse(route.request().postData() || '{}') } catch { return {} } })()
      posted.push(body)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    })
    await page.goto(`/?person=jonathan&trip=${COMPOSITE_LIVE.id}&nosw=1`)
    await expect.poll(() => posted.length, { timeout: 10000 }).toBeGreaterThan(0)
    expect(posted[0].tripId).toBe(COMPOSITE_LIVE.id)
  })

  test('a composite leg with NO explicit members falls back to the whole trip\'s party (G5)', async ({ page }) => {
    // Florence carries no `members` here — everyone on the trip is "around".
    const noMembers = {
      ...COMPOSITE_LIVE, id: 'composite-live-nomembers-2026',
      parts: COMPOSITE_LIVE.parts.map((p) => (p.id === 'p-flor' ? { ...p, members: undefined } : p)),
    }
    await seedTripIntoCache(page, noMembers)
    mockPresence(page)
    await page.goto(`/?person=jonathan&trip=${noMembers.id}&nosw=1`)
    const band = page.getByTestId('whos-around')
    await expect(band).toBeVisible({ timeout: 10000 })
    for (const nm of ['Jonathan', 'Helen', 'Aurelia', 'Rafa']) {
      await expect(band).toContainText(nm)
    }
  })

  test('a composite leg with an EXPLICIT EMPTY members array also falls back to everyone (not a blank band)', async ({ page }) => {
    // `[]` is truthy in JS — a naive `legCtx.members || travelers` fallback
    // would pass an empty array straight through instead of falling back.
    const emptyMembers = {
      ...COMPOSITE_LIVE, id: 'composite-live-emptymembers-2026',
      parts: COMPOSITE_LIVE.parts.map((p) => (p.id === 'p-flor' ? { ...p, members: [] } : p)),
    }
    await seedTripIntoCache(page, emptyMembers)
    mockPresence(page)
    await page.goto(`/?person=jonathan&trip=${emptyMembers.id}&nosw=1`)
    const band = page.getByTestId('whos-around')
    await expect(band).toBeVisible({ timeout: 10000 })
    for (const nm of ['Jonathan', 'Helen', 'Aurelia', 'Rafa']) {
      await expect(band).toContainText(nm)
    }
  })

  test('a FINISHED composite trip gets no live presence band at all (the gate still holds)', async ({ page }) => {
    const finished = {
      ...COMPOSITE_LIVE, id: 'composite-finished-2026',
      dateRange: 'May 1 – 7, 2026', dateRangeStart: '2026-05-01', dateRangeEnd: '2026-05-07',
      parts: COMPOSITE_LIVE.parts.map((p) => ({ ...p, dateStart: '2026-05-01', dateEnd: '2026-05-07' })),
      days: [{ n: 1, isoDate: '2026-05-01', stops: [] }],
    }
    await seedTripIntoCache(page, finished)
    mockPresence(page)
    await page.goto('/?person=jonathan&nosw=1')
    await page.getByRole('button').filter({ hasText: 'Italy composite' }).first().click()
    await expect(page.getByTestId('living-heart-home')).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('whos-around')).toHaveCount(0)
  })

  test('a non-adult lens never puts coordinates on the wire (kid-coarse)', async ({ page }) => {
    // Even with geolocation granted, Aurelia (a non-adult) POSTs only the coarse
    // bucket — her exact GPS never leaves the device (the client half of the gate;
    // the worker drops a kid's coords too, in worker/test/presence.test.js).
    await page.context().grantPermissions(['geolocation'])
    await page.context().setGeolocation({ latitude: 43.0, longitude: -72.9, accuracy: 8 })
    const posted = await openNow(page, 'aurelia')
    await expect.poll(() => posted.length, { timeout: 10000 }).toBeGreaterThan(0)
    for (const body of posted) {
      expect(body.lat, 'a non-adult POST must not carry lat').toBeUndefined()
      expect(body.lng, 'a non-adult POST must not carry lng').toBeUndefined()
    }
  })
})
