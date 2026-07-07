import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, seedMemoriesIntoCache, FIXTURE_TRIP, TINY_RED_PNG_DATA_URL } from './_fixtures/withTrip.js'

// Stage 0c — the adult-only near-miss SUGGESTION banner. The worker's matcher
// declined to auto-move a photo on doubt and OFFERS it; an adult accepts (a
// manual Move-to that LOCKS) or declines ("Not now", synced family-wide). The
// worker gates the output on PHOTO_HEAL_MODE === 'on' — here we mock the endpoint
// so the surface is exercised regardless of the live knob.

function photoMemory({ id, stopId = 'vb2-3', authorTraveler = 'helen' }) {
  return {
    id, tripId: 'volleyball-2026', stopId, authorTraveler,
    visibility: 'shared', kind: 'photo',
    capturedAt: '2026-05-23T07:00:00.000Z',
    photoRef: { storage: 'external', url: TINY_RED_PNG_DATA_URL },
    photoExternalURLs: [], reactions: [],
    createdAt: '2026-05-24T22:00:00.000Z', updatedAt: '2026-05-24T22:00:00.000Z',
  }
}

// The worker-shaped suggestion: move sug1 from its current stop to vb3-4.
const SUGGESTION = {
  memoryId: 'sug1', fromStopId: 'vb2-3', fromLabel: 'vs BEV 13 Empire',
  toStopId: 'vb3-4', toLabel: 'Match 1 vs Northeast 13.2', reason: 'ambiguous',
}

const stored = (page, id) =>
  page.evaluate((mid) => JSON.parse(localStorage.getItem('rt_memories_shared_v1') || '[]').find((m) => m.id === mid), id)

async function mockSuggestions(page, suggestions) {
  await page.route(/roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/suggestions(\?|$)/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ suggestions }) })
  })
}

test.describe('self-healing suggestions (0c)', () => {
  test('an adult sees the near-miss banner; Move files + LOCKS the photo (manual prov)', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [photoMemory({ id: 'sug1', stopId: 'vb2-3', authorTraveler: 'helen' })])
    await mockSuggestions(page, [SUGGESTION])
    await page.goto('/?person=jonathan&trip=volleyball-2026&nosw=1')
    await page.getByTestId('jonathan-photos-entry').click()

    const banner = page.getByTestId('suggestion-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('may belong at Match 1 vs Northeast 13.2') // Jonathan lens copy

    await banner.getByTestId('suggestion-move').click()
    // Accepting is a MANUAL placement (locks) — the same write-path as Move-to.
    await expect.poll(async () => (await stored(page, 'sug1'))?.stopId).toBe('vb3-4')
    const prov = (await stored(page, 'sug1'))?.stopProv
    expect(prov?.source).toBe('manual')
    expect(prov?.by).toBe('jonathan')
    // The offer clears once accepted.
    await expect(banner).toHaveCount(0)
    // And the album REPAINTS — the photo now lives under its new place's section
    // (onChanged bumps memoryTick; the local move alone would not fire the A-3
    // channel, so without the fix the tile would stay under the old stop).
    await expect(page.getByText('Match 1 vs Northeast 13.2')).toBeVisible()
  })

  test('"Not now" fires the synced family-wide dismissal and clears the banner', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [photoMemory({ id: 'sug1', stopId: 'vb2-3' })])
    await mockSuggestions(page, [SUGGESTION])
    let dismissBody = null
    await page.route(/roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/suggestions\/dismiss$/, async (route) => {
      dismissBody = route.request().postDataJSON()
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ dismissed: true }) })
    })
    await page.goto('/?person=jonathan&trip=volleyball-2026&nosw=1')
    await page.getByTestId('jonathan-photos-entry').click()
    await expect(page.getByTestId('suggestion-banner')).toBeVisible()
    await page.getByTestId('suggestion-dismiss').click()
    await expect(page.getByTestId('suggestion-banner')).toHaveCount(0)
    // The dismissal identity is (memoryId, toStop) — migration 018's key.
    await expect.poll(() => dismissBody).toEqual({ memoryId: 'sug1', toStop: 'vb3-4' })
    // The photo did NOT move — a decline leaves it where it was.
    expect((await stored(page, 'sug1'))?.stopId).toBe('vb2-3')
  })

  test('Rafa never meets the suggestion banner (adult-only; he never even asks)', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [photoMemory({ id: 'sug1', stopId: 'vb2-3' })])
    await mockSuggestions(page, [SUGGESTION]) // even if the endpoint would answer, the kid lens never fetches
    await page.goto('/?person=rafa&trip=volleyball-2026&nosw=1')
    await page.getByTestId('rafa-photos-entry').click()
    await expect(page.getByTestId('photo-tile').first()).toBeVisible() // the album is open
    await expect(page.getByTestId('suggestion-banner')).toHaveCount(0)
  })
})
