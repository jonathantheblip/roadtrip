// Settings "Pull memories" — drain-first ordering, pinned (the e2e-pins
// backlog from the A-2 sync-honesty arc). runPull replays queued memory edits
// (drainMemorySyncQueue) BEFORE pulling, the same push-then-pull order every
// auto-sync moment enforces — otherwise a device's own stranded edit is
// visually overwritten by the pull it just asked for, the exact
// "my change vanished" class the sync-honesty family closed. Nothing pinned
// the Settings flow's ordering until now.
//
// Shape: one intent sits stranded in the sync queue (its boot-time drain
// attempts fail with 503 — network trouble), the family server comes back,
// the user taps "Pull memories". The pin: by the time the pull's GET fires,
// the stranded edit's POST has already reached the worker — and the queue is
// empty afterward.
import { test, expect } from '@playwright/test'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'
import { openTopMenuItem } from './_fixtures/topNav.js'

const OWED_ID = 'mem-owed-e2e'

const owedMemory = {
  id: OWED_ID,
  tripId: FIXTURE_TRIP.id,
  stopId: 'vb2-3',
  authorTraveler: 'jonathan',
  visibility: 'shared',
  kind: 'text',
  text: 'an edit that never reached the family',
  createdAt: '2026-05-24T09:00:00.000Z',
  updatedAt: '2026-05-24T09:00:00.000Z',
}

test('a stranded memory edit is pushed BEFORE the pull, and the queue empties', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await page.addInitScript(({ memory, owedId }) => {
    // The record the drain will replay (the fixture just cleared this key)…
    localStorage.setItem('rt_memories_shared_v1', JSON.stringify([memory]))
    // …the stranded intent that says it is owed…
    localStorage.setItem(
      'rt_memories_unsynced_v1',
      JSON.stringify([{ kind: 'save', memoryId: owedId, author: 'jonathan', at: 1748000000000 }])
    )
    // …and a session so the push can authenticate AS its author.
    localStorage.setItem('rt_session_jonathan', 'sess-e2e-drain-first')
  }, { memory: owedMemory, owedId: OWED_ID })

  // Worker: the root ping answers ok (the sync section renders its buttons
  // only when the worker reports synced); /memories POSTs fail with 503 until
  // the test flips `phase` — keeping the intent stranded through every
  // boot-time drain — then succeed; GETs always answer an empty pull.
  let phase = 'boot'
  const pullWindow = [] // every /memories request's method once phase === 'pull'
  await page.route(/roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/(\?.*)?$/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, traveler: 'jonathan' }) })
  )
  await page.route(/roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/memories(\?|$)/, async (route) => {
    const method = route.request().method()
    if (phase === 'pull') pullWindow.push(method)
    if (method === 'POST') {
      if (phase === 'boot') {
        await route.fulfill({ status: 503, body: '{"error":"still offline"}' })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...owedMemory, updatedAt: '2026-05-25T10:00:00.000Z' }),
      })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })

  await page.goto(`/?person=jonathan&trip=${FIXTURE_TRIP.id}&nosw=1`)
  await page.getByText('Fun @ the Sun').first().click()
  await openTopMenuItem(page, /Settings/i)

  const pullBtn = page.getByRole('button', { name: /Pull memories/ })
  await expect(pullBtn).toBeVisible({ timeout: 20000 })

  // The boot-time drains all 503'd — the intent must still be owed.
  const owedBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('rt_memories_unsynced_v1') || '[]').length)
  expect(owedBefore).toBe(1)

  // The server is back; the user asks for a pull.
  phase = 'pull'
  await pullBtn.click()
  await expect(page.getByText(/Pulled \d+ record/)).toBeVisible({ timeout: 20000 })

  // THE PIN — by the time the pull's GET fired, the stranded POST had already
  // landed: the first /memories request of the pull window is the drain's
  // push, never the pull itself.
  expect(pullWindow.length).toBeGreaterThanOrEqual(2)
  expect(pullWindow[0]).toBe('POST')
  expect(pullWindow.indexOf('GET')).toBeGreaterThan(pullWindow.indexOf('POST'))

  // …and the debt is settled: nothing left in the queue.
  const owedAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('rt_memories_unsynced_v1') || '[]').length)
  expect(owedAfter).toBe(0)
})
