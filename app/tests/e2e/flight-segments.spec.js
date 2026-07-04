// Multi-leg (connecting) flights — design 03-scaling-the-home.md §5: "Flights
// become legs with their own zones. Each segment shows its own local time +
// airport zone; a '+1 day' marks the calendar crossing; layovers are
// explicit." Before this there was no editor UI for flight info AT ALL (only
// a seed fixture ever carried flightNumber/flightOrigin/flightDest) — this
// covers the FIRST real editing path, the read-face for a real connection,
// and that a legacy single-flight stop stays byte-identical throughout.
import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, TINY_RED_PNG_DATA_URL } from './_fixtures/withTrip.js'

function baseTrip(id, stops) {
  return {
    id, shape: 'stay', status: 'planning', title: 'Provincetown', subtitle: 'fixture',
    dateRange: 'May 22 – 25, 2026', dateRangeStart: '2026-05-22', dateRangeEnd: '2026-05-25',
    travelers: ['jonathan', 'helen', 'aurelia', 'rafa'], heroImage: TINY_RED_PNG_DATA_URL,
    lodging: { name: 'Harbor Breeze', address: '690 Commercial St, Provincetown, MA', lat: 42.0584, lng: -70.1787 },
    days: [{ n: 1, isoDate: '2026-05-23', date: 'Sat May 23', title: 'Day', stops }],
  }
}

async function openEditor(page, trip, who = 'jonathan') {
  await seedTripIntoCache(page, trip)
  await page.goto(`/?person=${who}&trip=${trip.id}&nosw=1`)
  const home = page.getByTestId('living-heart-home')
  await expect(home).toBeVisible({ timeout: 10000 })
  await home.getByRole('button', { name: 'Change the plan' }).click()
}

function stopOf(page, tripId, stopId) {
  return page.evaluate(
    ({ id, sid }) => {
      const all = JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]')
      const t = all.find((x) => x.id === id)
      for (const d of t?.days || []) {
        const s = (d.stops || []).find((x) => x.id === sid)
        if (s) return s
      }
      return null
    },
    { id: tripId, sid: stopId }
  )
}

test('editor: adding flight info from scratch persists a single segment', async ({ page }) => {
  const trip = baseTrip('flight-add-fresh', [
    { id: 's1', time: '5:00 PM', name: 'Arrive', kind: 'arrival', address: 'PVC Airport', for: ['jonathan'] },
  ])
  await openEditor(page, trip)
  await expect(page.getByLabel('Flight #')).toHaveCount(0) // no flight yet, nothing to add-to

  await page.getByRole('button', { name: 'Add flight info' }).click()
  await page.getByLabel('Flight #').fill('DL4961')
  await page.getByLabel('From (airport code)').fill('ind')
  await page.getByLabel('To (airport code)').fill('lga')
  await page.getByLabel('Arrives (date)').fill('2026-05-23')
  await page.getByLabel('Arrives (local time)').fill('5:17 PM')

  await expect
    .poll(async () => (await stopOf(page, trip.id, 's1'))?.flight?.segments?.[0])
    .toMatchObject({ flightNo: 'DL4961', from: { code: 'IND' }, to: { code: 'LGA' }, arr: { date: '2026-05-23', local: '5:17 PM' } })
})

test('editor: "Add a connection" adds a second segment + a layover; StopDetail shows the itinerary with an honest +1 day', async ({ page }) => {
  const trip = baseTrip('flight-connection', [
    { id: 's1', time: '9:35 PM', name: 'DL 100 departs', kind: 'departure', address: 'Logan Airport', for: ['jonathan'] },
  ])
  await openEditor(page, trip)
  await page.getByRole('button', { name: 'Add flight info' }).click()
  await page.getByLabel('Flight #').fill('DL100')
  await page.getByLabel('From (airport code)').fill('bos')
  await page.getByLabel('To (airport code)').fill('fra')
  await page.getByLabel('Departs (date)').fill('2026-08-01')
  await page.getByLabel('Departs (local time)').fill('9:35 PM')
  await page.getByLabel('Arrives (date)').fill('2026-08-02')
  await page.getByLabel('Arrives (local time)').fill('11:05 AM')

  await page.getByRole('button', { name: 'Add a connection' }).click()
  await expect(page.getByText('Segment 1')).toBeVisible()
  await expect(page.getByText('Segment 2')).toBeVisible()
  await page.getByLabel('Layover 1 airport').fill('fra')
  await page.getByLabel('Layover 1 minutes').fill('100')

  await page.getByLabel('Flight #').nth(1).fill('DL200')
  await page.getByLabel('From (airport code)').nth(1).fill('fra')
  await page.getByLabel('To (airport code)').nth(1).fill('fco')
  await page.getByLabel('Departs (date)').nth(1).fill('2026-08-02')
  await page.getByLabel('Departs (local time)').nth(1).fill('12:45 PM')
  await page.getByLabel('Arrives (date)').nth(1).fill('2026-08-02')
  await page.getByLabel('Arrives (local time)').nth(1).fill('2:20 PM')

  await expect
    .poll(async () => {
      const s = await stopOf(page, trip.id, 's1')
      return { segCount: s?.flight?.segments?.length, layovers: s?.flight?.layovers }
    })
    .toMatchObject({ segCount: 2, layovers: [{ code: 'FRA', mins: 100 }] })
})

// The READ side — seeded directly with the final shape (rather than
// live-edited then reloaded) since a second `page.goto` re-fires
// seedTripIntoCache's addInitScript and would wipe an in-editor edit before
// the reload finishes (the same fixture-reseed gotcha rafa-stamp.spec.js
// works around). StopDetail's connection panel: each segment its own leg,
// the layover explicit, an honest "+1" on the segment crossing midnight.
test('StopDetail: the connection panel shows each segment + layover + an honest +1 day', async ({ page }) => {
  const trip = baseTrip('flight-connection-readface', [modernConnectionStop({ name: 'DL 100 departs', kind: 'departure' })])
  await seedTripIntoCache(page, trip)
  await page.goto(`/?person=jonathan&trip=${trip.id}&nosw=1`)
  await expect(page.getByTestId('living-heart-home')).toBeVisible({ timeout: 10000 })
  // A flight is excluded from the general agenda and reachable only via its
  // own dedicated Flight card (aria-label keys off the FIRST segment's flightNo).
  await page.getByRole('button', { name: /Flight DL100/i }).click()
  const panel = page.locator('.embed-panel')
  await expect(panel).toContainText('DL100')
  await expect(panel).toContainText('BOS')
  await expect(panel).toContainText('FRA')
  await expect(panel).toContainText('+1')
  await expect(panel).toContainText(/layover fra/i)
  await expect(panel).toContainText('DL200')
  await expect(panel).toContainText('FCO')
  await expect(panel).toContainText('1 STOP') // 2 segments → 1 layover stop
})

test('editor: removing a MIDDLE segment of a 3-segment itinerary drops BOTH bordering layovers, not one', async ({ page }) => {
  // BOS→ORD (layover ORD 60m) →DEN (layover DEN 90m) →LAX. Removing the
  // middle segment (ORD→DEN) leaves BOS→ORD and DEN→LAX as the two
  // survivors — they don't actually connect at ORD OR at DEN anymore, so
  // NEITHER layover is still meaningful (a naive "drop just one" would wrongly
  // leave one attached to a junction the remaining segments don't share).
  const trip = baseTrip('flight-remove-middle', [
    {
      id: 's1', time: '8:00 AM', name: 'Multi-stop flight', kind: 'departure', address: 'Logan Airport', for: ['jonathan'],
      flight: {
        segments: [
          { flightNo: 'AA1', from: { code: 'BOS' }, to: { code: 'ORD' }, dep: { date: '2026-06-01', local: '8:00 AM' }, arr: { date: '2026-06-01', local: '9:30 AM' } },
          { flightNo: 'AA2', from: { code: 'ORD' }, to: { code: 'DEN' }, dep: { date: '2026-06-01', local: '10:30 AM' }, arr: { date: '2026-06-01', local: '12:00 PM' } },
          { flightNo: 'AA3', from: { code: 'DEN' }, to: { code: 'LAX' }, dep: { date: '2026-06-01', local: '1:30 PM' }, arr: { date: '2026-06-01', local: '3:00 PM' } },
        ],
        layovers: [{ code: 'ORD', mins: 60 }, { code: 'DEN', mins: 90 }],
      },
    },
  ])
  await openEditor(page, trip)
  await expect(page.getByText('Segment 2')).toBeVisible()
  await page.getByRole('button', { name: 'Remove segment 2' }).click()

  await expect
    .poll(async () => {
      const s = await stopOf(page, trip.id, 's1')
      return {
        flightNos: s?.flight?.segments?.map((seg) => seg.flightNo),
        layovers: s?.flight?.layovers,
      }
    })
    .toEqual({ flightNos: ['AA1', 'AA3'], layovers: [] })
})

test('editor: removing the ONLY segment of a LEGACY flight clears both the modern and legacy shapes', async ({ page }) => {
  const trip = baseTrip('flight-remove-legacy', [
    {
      id: 's1', time: '5:17 PM', name: 'DL 4961 lands', kind: 'arrival', address: 'LGA',
      flightNumber: 'DL4961', flightOrigin: 'IND', flightDest: 'LGA', flightDate: '2026-05-23', scheduledArrivalLocal: '17:17',
      for: ['jonathan'],
    },
  ])
  await openEditor(page, trip)
  await expect(page.getByLabel('Flight #')).toHaveValue('DL4961') // the legacy fields pre-fill the editor
  await page.getByRole('button', { name: 'Remove flight info' }).click()

  // A JSON round-trip (how the cache actually persists) drops an explicit
  // `undefined` key entirely — so checking key PRESENCE, not just falsiness,
  // proves the fields are truly gone rather than merely blanked.
  await expect
    .poll(async () => {
      const s = await stopOf(page, trip.id, 's1')
      return {
        hasFlight: 'flight' in (s || {}),
        hasFlightNumber: 'flightNumber' in (s || {}),
        hasFlightOrigin: 'flightOrigin' in (s || {}),
      }
    })
    .toEqual({ hasFlight: false, hasFlightNumber: false, hasFlightOrigin: false })
  await expect(page.getByRole('button', { name: 'Add flight info' })).toBeVisible()
})

function modernConnectionStop(overrides = {}) {
  return {
    id: 's1', time: '9:35 PM', name: 'Fly to Rome', kind: 'departure', address: 'Logan Airport', for: ['jonathan'],
    flight: {
      segments: [
        { flightNo: 'DL100', from: { code: 'BOS' }, to: { code: 'FRA' }, dep: { date: '2026-05-23', local: '9:35 PM' }, arr: { date: '2026-05-24', local: '11:05 AM' } },
        { flightNo: 'DL200', from: { code: 'FRA' }, to: { code: 'FCO' }, dep: { date: '2026-05-24', local: '12:45 PM' }, arr: { date: '2026-05-24', local: '2:20 PM' } },
      ],
      layovers: [{ code: 'FRA', mins: 100 }],
    },
    ...overrides,
  }
}

test('home Next-Up: a MODERN multi-segment stop (no legacy flightNumber) is recognized as a flight', async ({ page }) => {
  const trip = baseTrip('flight-modern-nextup', [modernConnectionStop()])
  await seedTripIntoCache(page, trip)
  await page.goto(`/?person=jonathan&trip=${trip.id}&nosw=1`)
  const home = page.getByTestId('living-heart-home')
  await expect(home).toBeVisible({ timeout: 10000 })
  // Next-Up's condensed connection line, not the legacy single-flight format.
  await expect(home).toContainText(/9:35 PM BOS.*2:20 PM FCO.*\+1.*1 stop FRA/)
})

test('Rafa emoji: a modern flight stop (name matches none of the keyword fallbacks) still shows the plane', async ({ page }) => {
  // Rafa's emojiFor only runs for the FEATURED card, which only exists on a
  // non-stay (route) shape — a stay leads with the place hero instead. The
  // stop's own name ("Fly to Rome") deliberately matches NONE of the keyword
  // fallback regex (/flight|airport|lga|lands/), so before the fix this would
  // have fallen through to the generic 🎯 — only the real flightSegments()
  // check catches it now.
  const trip = {
    id: 'flight-rafa-emoji', shape: 'route', status: 'planning', title: 'To Rome', subtitle: 'fixture',
    dateRange: 'May 22 – 25, 2026', dateRangeStart: '2026-05-22', dateRangeEnd: '2026-05-25',
    startCity: 'Belmont, MA', endCity: 'Rome, Italy',
    travelers: ['jonathan', 'helen', 'aurelia', 'rafa'], heroImage: TINY_RED_PNG_DATA_URL,
    days: [{ n: 1, isoDate: '2026-05-23', date: 'Sat May 23', title: 'Day', stops: [modernConnectionStop({ for: ['jonathan', 'helen', 'aurelia', 'rafa'] })] }],
  }
  await seedTripIntoCache(page, trip)
  await page.goto(`/?person=rafa&trip=${trip.id}&nosw=1`)
  await expect(page.getByText('Hi Rafa!')).toBeVisible({ timeout: 10000 })
  await expect(page.getByText('✈️')).toBeVisible()
})

test('a legacy single-flight stop keeps its EXACT existing look (byte-identical) — no connection UI leaks in', async ({ page }) => {
  const trip = baseTrip('flight-legacy-unchanged', [
    {
      id: 's1', time: '5:17 PM', name: 'DL 4961 lands', kind: 'arrival', address: 'LGA Airport',
      flightNumber: 'DL4961', flightOrigin: 'IND', flightDest: 'LGA', flightDate: '2026-05-23', scheduledArrivalLocal: '17:17',
      for: ['jonathan'],
    },
  ])
  await seedTripIntoCache(page, trip)
  await page.goto(`/?person=jonathan&trip=${trip.id}&nosw=1`)
  const home = page.getByTestId('living-heart-home')
  await expect(home).toBeVisible({ timeout: 10000 })
  await expect(home).toContainText('DL4961 · IND→LGA') // the exact pre-existing single-flight format

  await page.getByRole('button', { name: /Flight DL4961/i }).click()
  const panel = page.locator('.embed-panel')
  await expect(panel).toContainText('DL4961')
  await expect(panel).toContainText('IND')
  await expect(panel).toContainText('LGA')
  // The live-tracking chrome (refresh button / FlightAware link) is the
  // single-flight panel's signature — absent from the connection view.
  await expect(page.getByRole('button', { name: /refresh/i })).toBeVisible()
})
