// Replay — cinematic stop-level playback (richer-replay increment A).
//
// The stop level used to hard-cut between photos; now each photo drifts
// (Ken Burns) and the next crossfades in over the previous. This is Replay's
// first e2e: it navigates the ladder down to a photo stop and asserts the
// cinematic layer renders the image. (The animation itself is visual — this
// guards the RENDER PATH, not the motion.)

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
  createdAt: '2026-05-22T21:00:00.000Z',
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
  createdAt: '2026-04-11T13:00:00.000Z',
}

test.describe('Replay — cinematic stop playback', () => {
  test('renders a cinematic photo layer at the stop level', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [PHOTO_MEM])
    await page.goto('/?person=jonathan&trip=volleyball-2026&nosw=1')

    await openTopMenuItem(page, /Replay/i)

    // Replay opens at day level. Zoom out to the trip, then descend
    // deterministically: Day 1 → the Beach Bungalow stop (has a photo).
    await page.getByRole('button', { name: 'Back to trip' }).click()
    await page.getByRole('button', { name: /Day 1/ }).click()
    await page.getByRole('button', { name: /Beach Bungalow/ }).click()

    // Stop level: the cinematic layer carries the photo (proves the render
    // path — only PhotoStage emits .rpl-cine-layer).
    const layer = page.locator('.rpl-cine-layer').first()
    await expect(layer).toBeAttached()
    await expect(layer).toHaveAttribute('src', /.+/)
  })

  test('day level shows the day\'s woven narrative when one is stored', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    // The day fetches its stored weave (GET /weave/latest) — return a narrative.
    await page.route(/workers\.dev\/weave\/latest/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tripId: 'volleyball-2026',
          dayIso: '2026-05-22',
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

    // Replay opens at the day level → the day's woven narrative header renders.
    const weave = page.getByTestId('rpl-dayweave')
    await expect(weave).toBeVisible()
    await expect(weave).toContainText('Converging on Murray Hill')
    await expect(weave).toContainText('Four roads met in one apartment.')
  })
})

test.describe('Replay — resurfacing ("Looking back")', () => {
  test('a "Looking back" card surfaces a past day and opens its replay', async ({ page }) => {
    // PAST_TRIP alone → no active trip on the stub date → the index shows.
    await seedTripIntoCache(page, PAST_TRIP)
    await seedMemoriesIntoCache(page, [PAST_PHOTO])
    await page.goto('/?person=helen&nosw=1')

    const card = page.getByTestId('resurface-card')
    await expect(card).toBeVisible()
    await expect(card).toContainText(/Looking back/i)
    await expect(card).toContainText('Cabin Weekend')

    // Tapping opens the replay AT that resurfaced trip/day.
    await card.click()
    await expect(page.locator('.rpl-root')).toBeVisible()
  })
})
