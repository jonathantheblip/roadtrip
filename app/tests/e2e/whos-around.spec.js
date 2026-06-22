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

  test('helen (light lens): band renders and passes axe', async ({ page }) => {
    await openNow(page, 'helen')
    const band = page.getByTestId('whos-around')
    await expect(band).toContainText('Helen')
    await expect(band).toContainText('Shared only while the app is open')
    await expectNoSeriousA11y(page) // --muted on a light surface must still clear AA
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
