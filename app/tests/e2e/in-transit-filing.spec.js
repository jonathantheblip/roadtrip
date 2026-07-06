import { test, expect } from './_fixtures/clockStub.js'
import {
  seedTripIntoCache,
  seedMemoriesIntoCache,
  FIXTURE_TRIP,
  TINY_RED_PNG_DATA_URL,
} from './_fixtures/withTrip.js'

// Self-healing photo filing (settled rule, live-trip 2026-07-05 + VISION §1):
// "In transit" is never a junk drawer. A photo whose saved brackets DIED
// (the plan changed under it) re-files at render time from TODAY's plan:
// between the day's clock-timed stops when they exist, chronologically into
// its day (with a day + hour-band eyebrow) when they don't. Only genuinely
// undateable photos remain in the bottom residue.
//
// The seeded trip pins tz America/New_York so the leg-local day pick and the
// eyebrow's hour band render identically on a US-local dev machine and the
// UTC CI runner (the deploy-verify TZ lesson). Runs on chromium AND
// webkit-mobile (no project scoping).

// FIXTURE_TRIP with the trip zone pinned. Day 1 (Fri May 22) carries only the
// loose 'Evening' lodging stop — the no-clock-stops fallback substrate. Day 2
// (Sat May 23) has the 3:45 PM match — the re-bracket substrate.
const TZ_TRIP = { ...FIXTURE_TRIP, tz: 'America/New_York' }

test.describe('the album files every dateable photo in its day (self-healing)', () => {
  test('street photos with dead brackets land inside their day with a day + time-band eyebrow — not at the bottom', async ({
    page,
  }) => {
    await seedTripIntoCache(page, TZ_TRIP)
    await seedMemoriesIntoCache(page, [
      // Two street shots whose saved brackets point at stops that no longer
      // exist. Their day (Fri May 22) has no clock-timed stops, so they file
      // chronologically into the day: 2 PM and 5 PM New York wall time.
      photoMemory({
        id: 'street-1',
        caption: 'commercial st',
        capturedAt: '2026-05-22T18:00:00.000Z',
        interstitial: { before: 'gone-a', after: 'gone-b' },
      }),
      photoMemory({
        id: 'street-2',
        caption: 'harbor walk',
        capturedAt: '2026-05-22T21:00:00.000Z',
        interstitial: { before: 'gone-a', after: 'gone-b' },
      }),
      // A normally-filed Saturday photo, so "not at the bottom" is provable:
      // the healed section must render BEFORE this later day's section.
      photoMemory({
        id: 'match-shot',
        stopId: 'vb2-3',
        caption: 'court one',
        capturedAt: '2026-05-23T19:50:00.000Z',
      }),
    ])
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await page.getByTestId('helen-photos-entry').click()

    const healed = page.locator(
      '[data-stop-key="__interstitial:2026-05-22:start__end"]'
    )
    await expect(healed).toBeVisible()
    await expect(healed).toContainText('In transit')
    // The eyebrow reads day + hour band ("Fri May 22 · 2–5") — the spanWords
    // voice, in the trip's zone. En dash, bare 12-hour.
    await expect(healed).toContainText('Fri May 22 · 2–5')
    // Both street shots share the one day-scoped section.
    await expect(healed.getByTestId('photo-tile')).toHaveCount(2)

    // Inside its day, not a bottom drawer: Friday's healed section renders
    // before Saturday's match section.
    const groups = page.getByTestId('stop-group')
    await expect(groups).toHaveCount(2)
    await expect(groups.nth(0)).toContainText('In transit')
    await expect(groups.nth(1)).toContainText('vs BEV 13 Empire')
  })

  test('a dead bracket on a clock-timed day re-brackets to the live stop ("Before X"), not "In transit"', async ({
    page,
  }) => {
    await seedTripIntoCache(page, TZ_TRIP)
    await seedMemoriesIntoCache(page, [
      // 1 PM New York on Saturday — before the day's 3:45 PM match. The saved
      // brackets are dead; the CURRENT plan supplies the real bracket.
      photoMemory({
        id: 'pre-match',
        caption: 'warmup snack',
        capturedAt: '2026-05-23T17:00:00.000Z',
        interstitial: { before: 'gone-a', after: 'gone-b' },
      }),
      photoMemory({
        id: 'match-shot',
        stopId: 'vb2-3',
        caption: 'court one',
        capturedAt: '2026-05-23T19:50:00.000Z',
      }),
    ])
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await page.getByTestId('helen-photos-entry').click()

    // Healed into a named bracket keyed by the LIVE stop id — and slotted
    // just ahead of that stop's own section.
    const healed = page.locator('[data-stop-key="__interstitial:start__vb2-3"]')
    await expect(healed).toBeVisible()
    await expect(healed).toContainText('Before vs BEV 13 Empire')
    const groups = page.getByTestId('stop-group')
    await expect(groups.nth(0)).toContainText('Before vs BEV 13 Empire')
    await expect(groups.nth(1)).toContainText('vs BEV 13 Empire')
  })

  test('a genuinely undateable photo stays in the bottom residue with an empty eyebrow', async ({
    page,
  }) => {
    await seedTripIntoCache(page, TZ_TRIP)
    await seedMemoriesIntoCache(page, [
      photoMemory({
        id: 'match-shot',
        stopId: 'vb2-3',
        caption: 'court one',
        capturedAt: '2026-05-23T19:50:00.000Z',
      }),
      // Capture date outside every trip day AND dead brackets → nothing
      // honest to anchor to; it keeps the bottom "In transit" residue.
      photoMemory({
        id: 'old-scan',
        caption: 'mystery scan',
        capturedAt: '2026-01-01T12:00:00.000Z',
        interstitial: { before: 'gone-a', after: 'gone-b' },
      }),
    ])
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await page.getByTestId('helen-photos-entry').click()

    const residue = page.locator('[data-stop-key="__interstitial:start__end"]')
    await expect(residue).toBeVisible()
    await expect(residue).toContainText('In transit')
    // Honest empty eyebrow — no fake day, no fake hours.
    await expect(residue.locator('header > div').first()).toHaveText('')
    // And it renders LAST, after every real-day section.
    const groups = page.getByTestId('stop-group')
    await expect(groups).toHaveCount(2)
    await expect(groups.nth(1)).toContainText('In transit')
  })

  test("two days' orphans render as two day-scoped sections, never one merged drawer", async ({
    page,
  }) => {
    // Make Sunday clock-less too (loose 'Afternoon'), so BOTH days' orphans
    // take the chronological fallback — the old code merged them into ONE
    // global '__interstitial:start__end' bucket with the first entry's
    // metadata poisoning the header.
    const twoLooseDays = JSON.parse(JSON.stringify(TZ_TRIP))
    twoLooseDays.days[2].stops[0].time = 'Afternoon'
    await seedTripIntoCache(page, twoLooseDays)
    await seedMemoriesIntoCache(page, [
      photoMemory({
        id: 'fri-orphan',
        caption: 'friday wander',
        capturedAt: '2026-05-22T18:00:00.000Z', // Fri 2 PM NY
        interstitial: { before: null, after: null },
      }),
      photoMemory({
        id: 'sun-orphan',
        caption: 'sunday wander',
        capturedAt: '2026-05-24T18:00:00.000Z', // Sun 2 PM NY
        interstitial: { before: null, after: null },
      }),
    ])
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await page.getByTestId('helen-photos-entry').click()

    const transitSections = page
      .getByTestId('stop-group')
      .filter({ hasText: 'In transit' })
    await expect(transitSections).toHaveCount(2)

    const friday = page.locator(
      '[data-stop-key="__interstitial:2026-05-22:start__end"]'
    )
    const sunday = page.locator(
      '[data-stop-key="__interstitial:2026-05-24:start__end"]'
    )
    await expect(friday).toBeVisible()
    await expect(friday).toContainText('Fri May 22 · around 2')
    await expect(sunday).toBeVisible()
    await expect(sunday).toContainText('Sun May 24 · around 2')
  })
})

// Minimal photo memory, mirroring photos-view.spec.js's helper plus the
// fields this suite exercises: an explicit capturedAt and the memory-level
// interstitial identity (migration 007). stopId defaults to null — the
// stopless shape every interstitial/unfiled photo has.
function photoMemory({
  id,
  stopId = null,
  author = 'helen',
  caption = '',
  capturedAt = null,
  createdAt = '2026-05-24T09:00:00.000Z',
  interstitial = null,
}) {
  return {
    id,
    tripId: 'volleyball-2026',
    stopId,
    authorTraveler: author,
    visibility: 'shared',
    kind: 'photo',
    caption,
    capturedAt,
    ...(interstitial ? { interstitial } : {}),
    photoRef: {
      storage: 'external',
      url: TINY_RED_PNG_DATA_URL,
    },
    photoExternalURLs: [],
    reactions: [],
    createdAt,
    updatedAt: createdAt,
  }
}
