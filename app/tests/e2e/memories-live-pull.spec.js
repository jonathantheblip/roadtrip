// A-3 — the live memory channel. Memories used to pull only on cold load and
// foregrounding (the 20s heartbeat was trips-only), so another device's photo,
// note, move, or DELETE sat invisible here for hours until the next launch.
// The upload-drain interval in App.jsx now also runs a memory DELTA beat:
// a `?since=<cursor>` pull that returns only what changed — never the full
// multi-year archive — and tombstones ride the same delta, so deletes
// propagate live too (the worker guarantees a tombstone's stamp never
// regresses; see worker/test/memory-tombstone-race.test.js).
//
// Chromium only: Playwright's WebKit clock virtualization doesn't reliably
// fire a live setInterval via page.clock.runFor() (same class as
// trips-live-pull.spec.js / next-up-ticks.spec.js — a test-tool gap, not a
// product one).
import { test, expect } from '@playwright/test'
import { seedTripIntoCache } from './_fixtures/withTrip.js'

const TRIP_ID = 'mem-live-2026'

const TRIP = {
  id: TRIP_ID,
  status: 'planning',
  title: 'A Long Weekend',
  dateRangeStart: '2026-06-01',
  dateRangeEnd: '2026-06-03',
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
  days: [
    {
      n: 1,
      isoDate: '2026-06-02',
      date: 'Tue, June 2',
      title: 'Day 1',
      stops: [
        { id: 's1', time: '11:00 AM', name: 'Race Point Beach', kind: 'park', for: [] },
      ],
    },
  ],
}

// Server rows, as getMemories emits them (ISO stamps derived from epoch ms).
const OLD_STAMP = '2026-06-02T09:00:00.000Z'
const NEW_STAMP = '2026-06-02T09:30:00.000Z'
const DEL_STAMP = '2026-06-02T10:30:00.000Z'

const oldNote = {
  id: 'mem-old',
  tripId: TRIP_ID,
  stopId: 's1',
  authorTraveler: 'helen',
  visibility: 'shared',
  kind: 'text',
  text: 'An old note from before',
  createdAt: OLD_STAMP,
  updatedAt: OLD_STAMP,
}

const newNote = {
  id: 'mem-new',
  tripId: TRIP_ID,
  stopId: 's1',
  authorTraveler: 'helen',
  visibility: 'shared',
  kind: 'text',
  text: 'Helen wrote this from her phone just now',
  createdAt: NEW_STAMP,
  updatedAt: NEW_STAMP,
}

test("another device's note appears in the open thread within a beat — and its delete disappears live too", async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', "Playwright's WebKit clock emulation does not fire a live setInterval (see file-header comment) — chromium is the proof.")
  await seedTripIntoCache(page, TRIP)

  // Phase machine the test advances between clock windows:
  //   1 — the world after cold load: full pull holds the old note; the delta
  //       (anything with ?since=) says Helen just added a new note.
  //   2 — Helen deleted that note: the delta now carries its tombstone.
  let phase = 1
  const pulls = [] // every GET /memories URL, for the cost-shape assertion
  await page.route(/roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/memories(\?|$)/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    const url = route.request().url()
    pulls.push(url)
    const isDelta = url.includes('since=')
    let body
    if (!isDelta) {
      body = [oldNote] // the cold-load full pull — seeds the delta cursor
    } else if (phase === 1) {
      body = [newNote]
    } else {
      body = [{ ...newNote, updatedAt: DEL_STAMP, deletedAt: DEL_STAMP }]
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })

  // Installed before goto, per the trips-live-pull precedent.
  await page.clock.install({ time: new Date('2026-06-02T10:00:00') })
  await page.goto(`/?person=jonathan&trip=${TRIP_ID}&nosw=1`)

  // Open the stop's thread; the cold-load pull has merged the old note by the
  // time the thread reads the store (generous timeouts for loaded CI runners).
  await page.getByRole('button', { name: 'Race Point Beach' }).click()
  await expect(page.getByText('An old note from before')).toBeVisible({ timeout: 20000 })
  await expect(page.getByText('Helen wrote this from her phone just now')).toHaveCount(0)

  // Snapshot the cold-load full pulls before any beat has fired. StrictMode
  // (dev server = the e2e environment) mounts the App effect twice, so the
  // baseline is 1 in production and up to 2 here — what matters below is that
  // the number never grows once the heartbeat is running.
  const coldFullPulls = pulls.filter((u) => !u.includes('since=')).length
  expect(coldFullPulls).toBeLessThanOrEqual(2)

  // One beat (the drain interval is 20s) — the delta delivers Helen's note
  // into the OPEN thread, no navigation, no reload.
  await page.clock.runFor('00:00:21')
  await expect(page.getByText('Helen wrote this from her phone just now')).toBeVisible({ timeout: 20000 })

  // Helen deletes it on her phone; the next beat's delta carries the
  // tombstone and the open thread lets it go.
  phase = 2
  await page.clock.runFor('00:00:21')
  await expect(page.getByText('Helen wrote this from her phone just now')).toHaveCount(0, { timeout: 20000 })
  await expect(page.getByText('An old note from before')).toBeVisible() // only the delete propagated

  // Cost shape (the settled A-3 constraint): the full pull happens at cold
  // load ONLY — every heartbeat pull across both beat windows was a ?since=
  // delta. A full multi-year re-pull every 20 seconds is the failure this
  // pins out.
  const fullPulls = pulls.filter((u) => !u.includes('since='))
  const deltaPulls = pulls.filter((u) => u.includes('since='))
  expect(fullPulls.length).toBe(coldFullPulls) // not one more since the beats began
  expect(deltaPulls.length).toBeGreaterThanOrEqual(2) // one per beat window
})
