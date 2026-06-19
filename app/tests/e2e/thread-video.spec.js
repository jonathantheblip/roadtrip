import { test, expect } from './_fixtures/clockStub.js'
import {
  seedTripIntoCache,
  seedMemoriesIntoCache,
  FIXTURE_TRIP,
  TINY_RED_PNG_DATA_URL,
} from './_fixtures/withTrip.js'

// BUG 2 (thread half) — a synced video in the per-stop memory thread must render
// like the album: a poster (or a Play glyph when it has no still) with a play
// badge, and tapping it opens a <video> in the lightbox. Before the fix the
// thread painted the .mp4 url as a CSS background (a blank box) and built a
// lightbox entry with no isVideo flag (a dead <img src=.mp4>).

function videoMem({ id, stopId, posterUrl }) {
  return {
    id,
    tripId: 'volleyball-2026',
    stopId,
    authorTraveler: 'helen',
    visibility: 'shared',
    kind: 'photo', // videos ride as kind 'photo' with a video-typed ref
    caption: 'Sunset clip',
    photoRef: {
      storage: 'r2',
      key: `${id}_k`,
      url: `https://example.invalid/${id}.mp4`,
      mime: 'video/mp4',
      ...(posterUrl ? { posterUrl } : {}),
    },
    photoExternalURLs: [],
    reactions: [],
    createdAt: '2026-05-22T22:00:00Z',
    updatedAt: '2026-05-22T22:00:00Z',
  }
}

async function openBeachBungalowThread(page) {
  await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
  // Beach Bungalow (vb1-3) is a Day-1 stop; click DAY 1 so it's in view
  // regardless of the clock stub, then open its StopDetail thread.
  await page.getByRole('button', { name: /DAY 1/i }).first().click()
  await page.getByRole('button', { name: /Beach Bungalow/i }).first().click()
}

test('a synced video WITH a poster shows a play badge in the thread and opens a <video>', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await seedMemoriesIntoCache(page, [
    videoMem({ id: 'vthread', stopId: 'vb1-3', posterUrl: TINY_RED_PNG_DATA_URL }),
  ])
  await openBeachBungalowThread(page)

  // The thread tile is a recognizable video — a play badge over the poster,
  // not a blank background.
  await expect(page.getByTestId('thread-video-badge').first()).toBeVisible()

  await page.getByRole('button', { name: 'Open video' }).first().click()
  const lightbox = page.getByTestId('photo-lightbox')
  await expect(lightbox).toBeVisible()
  const video = lightbox.getByTestId('lightbox-video')
  await expect(video).toBeAttached()
  await expect(video).toHaveAttribute('src', 'https://example.invalid/vthread.mp4')
  await expect(video).toHaveAttribute('poster', TINY_RED_PNG_DATA_URL)
  // ...and NO plain <img> stands in for the video.
  await expect(lightbox.locator('img')).toHaveCount(0)
})

test('a synced video with NO poster shows the icon fallback (not a blank box) and still opens a <video>', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await seedMemoriesIntoCache(page, [videoMem({ id: 'vnoposter', stopId: 'vb1-3' })])
  await openBeachBungalowThread(page)

  // Poster-less video → a Play-glyph fallback, not an invisible/blank tile.
  await expect(page.getByTestId('thread-video-fallback').first()).toBeVisible()

  await page.getByRole('button', { name: 'Open video' }).first().click()
  const lightbox = page.getByTestId('photo-lightbox')
  await expect(lightbox.getByTestId('lightbox-video')).toBeAttached()
  await expect(lightbox.locator('img')).toHaveCount(0)
})
