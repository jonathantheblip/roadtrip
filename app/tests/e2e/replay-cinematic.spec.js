// Replay — THE REEL (look-back redesign).
//
// Replay is now one full-bleed surface that PLAYS the trip's memories: open it
// and a cinematic photo layer renders immediately (no archive→trip→day→stop
// ladder to descend). Tap advances; ONE Done(✕) exits. This guards the cine
// RENDER PATH on the new surface + the memory-advance + the resurface deep-link.

// clockStub pins the clock inside FIXTURE_TRIP's window so the trip is active
// and auto-opens (otherwise the cold-load override drops to the index).
import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, seedMemoriesIntoCache, FIXTURE_TRIP, TINY_RED_PNG_DATA_URL } from './_fixtures/withTrip.js'
import { openTopMenuItem } from './_fixtures/topNav.js'

const PHOTO_MEM = {
  id: 'rpl-photo-1',
  tripId: 'volleyball-2026',
  stopId: 'vb1-3', // Beach Bungalow, Day 1
  authorTraveler: 'aurelia',
  visibility: 'shared',
  kind: 'photo',
  caption: 'the elevator is older than mom',
  photoRef: { url: TINY_RED_PNG_DATA_URL, w: 1, h: 1 },
  capturedAt: '2026-05-22T21:00:00.000Z',
  createdAt: '2026-05-22T21:00:00.000Z',
}
const PHOTO_MEM_2 = {
  id: 'rpl-photo-2',
  tripId: 'volleyball-2026',
  stopId: 'vb1-3',
  authorTraveler: 'jonathan',
  visibility: 'shared',
  kind: 'photo',
  caption: 'second frame',
  photoRef: { url: TINY_RED_PNG_DATA_URL, w: 1, h: 1 },
  capturedAt: '2026-05-22T22:00:00.000Z',
  createdAt: '2026-05-22T22:00:00.000Z',
}
// A Day-2 memory (stop vb2-3) so the trip has memories on TWO days → the
// day-picker appears (chip becomes a button).
const DAY2_MEM = {
  id: 'rpl-photo-d2',
  tripId: 'volleyball-2026',
  stopId: 'vb2-3', // Day 2, "Pool play"
  authorTraveler: 'helen',
  visibility: 'shared',
  kind: 'photo',
  caption: 'saturday',
  photoRef: { url: TINY_RED_PNG_DATA_URL, w: 1, h: 1 },
  capturedAt: '2026-05-23T15:00:00.000Z',
  createdAt: '2026-05-23T15:00:00.000Z',
}

// A VIDEO memory: a kind:'photo' memory whose ref carries video identity
// (mime video/* + posterUrl + kind:'video'). flattenPhotoEntries → entry.isVideo,
// entry.url = the .mp4, entry.posterUrl = the still.
const VIDEO_MEM = {
  id: 'rpl-video-1',
  tripId: 'volleyball-2026',
  stopId: 'vb1-3',
  authorTraveler: 'rafa',
  visibility: 'shared',
  kind: 'photo',
  caption: 'the dive',
  photoRefs: [
    {
      url: 'data:video/mp4;base64,AAAAIGZ0eXA=',
      mime: 'video/mp4',
      posterUrl: TINY_RED_PNG_DATA_URL,
      kind: 'video',
      key: 'rpl-vid-key-1',
    },
  ],
  capturedAt: '2026-05-22T20:00:00.000Z',
  createdAt: '2026-05-22T20:00:00.000Z',
}

// A COMPLETED trip (ended before the stub's 2026-05-23) with a photo day, so
// the "Looking back" card has something to resurface. Seeded ALONE (no active
// trip on the stub date) so the app lands on the index, where the card lives.
const PAST_TRIP = {
  id: 'past-2026',
  title: 'Cabin Weekend',
  dateRangeStart: '2026-04-10',
  dateRangeEnd: '2026-04-12',
  days: [
    { n: 1, isoDate: '2026-04-10', stops: [{ id: 'pt1-1', name: 'The Cabin', time: '3 PM' }] },
    { n: 2, isoDate: '2026-04-11', stops: [{ id: 'pt2-1', name: 'The Lake', time: '10 AM' }] },
  ],
}
const PAST_PHOTO = {
  id: 'past-photo-1',
  tripId: 'past-2026',
  stopId: 'pt2-1',
  authorTraveler: 'helen',
  visibility: 'shared',
  kind: 'photo',
  caption: 'the dock at dawn',
  photoRef: { url: TINY_RED_PNG_DATA_URL, w: 1, h: 1 },
  capturedAt: '2026-04-11T13:00:00.000Z',
  createdAt: '2026-04-11T13:00:00.000Z',
}

test.describe('Replay — the reel', () => {
  test('opens straight into a cinematic memory (no ladder) with one Done', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [PHOTO_MEM])
    await page.goto('/?person=jonathan&trip=volleyball-2026&nosw=1')

    await openTopMenuItem(page, /Replay/i)

    // The reel mounts immediately — the cinematic layer carries the photo (only
    // CineStage emits .rpl-cine-layer), no zoom-out/descend needed.
    const reel = page.getByTestId('rpl-reel')
    await expect(reel).toBeVisible()
    const layer = page.locator('.rpl-cine-layer').first()
    await expect(layer).toBeAttached()
    await expect(layer).toHaveAttribute('src', /.+/)

    // ONE persistent Done(✕) and the transport are present.
    await expect(page.getByTestId('rpl-reel-done')).toBeVisible()
    await expect(page.getByTestId('rpl-reel-play')).toBeVisible()
    await expect(page.getByTestId('rpl-reel-done')).toHaveAttribute('aria-label', 'Done')
  })

  test('plays the memories — tapping advances through the trip, clamped at the end', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [PHOTO_MEM, PHOTO_MEM_2])
    await page.goto('/?person=jonathan&trip=volleyball-2026&nosw=1')

    await openTopMenuItem(page, /Replay/i)
    const reel = page.getByTestId('rpl-reel')
    await expect(reel).toBeVisible()

    // Both trip memories are in the reel sequence.
    await expect(page.locator('.rpl-reel-count')).toContainText('/ 2')

    // Tapping the stage advances (and clamps at the last memory).
    await reel.click()
    await reel.click()
    await expect(page.locator('.rpl-reel-count')).toContainText('2 / 2')
  })

  test('day-picker sheet surfaces the day weave and jumps between days', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    // Memories on Day 1 (vb1-3) and Day 2 (vb2-3) → the picker appears.
    await seedMemoriesIntoCache(page, [PHOTO_MEM, DAY2_MEM])
    // The day fetches its stored weave (GET /weave/latest) — return a narrative.
    await page.route(/workers\.dev\/weave\/latest/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tripId: 'volleyball-2026',
          dayIso: '2026-05-23',
          title: 'Converging on Murray Hill',
          opening: 'Four roads met in one apartment.',
          closing: 'That was Friday.',
          stat: 'Day 1 · 3 stops',
          generatedAt: 1,
        }),
      })
    })
    await page.goto('/?person=jonathan&trip=volleyball-2026&nosw=1')
    await openTopMenuItem(page, /Replay/i)

    // The day chip is now a button (2 jumpable days). Tapping opens the sheet,
    // which carries the day's woven narrative + a strip of days.
    const chip = page.getByTestId('rpl-reel-chip')
    await expect(chip).toBeVisible()
    await chip.click()
    await expect(page.getByTestId('rpl-daypicker')).toBeVisible()
    const weave = page.getByTestId('rpl-dayweave')
    await expect(weave).toBeVisible()
    await expect(weave).toContainText('Converging on Murray Hill')
    await expect(weave).toContainText('Four roads met in one apartment.')

    // Jumping to Day 1 closes the sheet and re-points the chip.
    await page.getByRole('button', { name: /Day 1/ }).click()
    await expect(page.getByTestId('rpl-daypicker')).toBeHidden()
    await expect(chip).toContainText('Day 1')
  })

  test('a video memory plays as a real muted-autoplay <video>, labeled VIDEO', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [VIDEO_MEM])
    await page.goto('/?person=jonathan&trip=volleyball-2026&nosw=1')
    await openTopMenuItem(page, /Replay/i)

    const video = page.getByTestId('rpl-reel-video')
    await expect(video).toBeVisible()
    await expect(video).toHaveAttribute('src', /data:video\/mp4/)
    await expect(video).toHaveAttribute('poster', /.+/)
    // Muted-autoplay inline (the reliable cross-browser path).
    await expect(video).toHaveJSProperty('muted', true)
    await expect(video).toHaveJSProperty('autoplay', true)
    await expect(video).toHaveJSProperty('playsInline', true)
    // Labeled VIDEO in the reel overlay — never "photo".
    await expect(page.getByTestId('rpl-reel')).toContainText('VIDEO')
  })
})

test.describe('Replay — resurfacing ("Looking back")', () => {
  test('a "Looking back" card surfaces a past day and opens its reel', async ({ page }) => {
    // PAST_TRIP alone → no active trip on the stub date → the index shows.
    await seedTripIntoCache(page, PAST_TRIP)
    await seedMemoriesIntoCache(page, [PAST_PHOTO])
    await page.goto('/?person=helen&nosw=1')

    const card = page.getByTestId('resurface-card')
    await expect(card).toBeVisible()
    await expect(card).toContainText(/Looking back/i)
    await expect(card).toContainText('Cabin Weekend')

    // Tapping opens the reel AT that resurfaced trip/day (the `initial` contract).
    await card.click()
    await expect(page.locator('.rpl-root')).toBeVisible()
    await expect(page.locator('.rpl-cine-layer').first()).toBeAttached()
  })
})
