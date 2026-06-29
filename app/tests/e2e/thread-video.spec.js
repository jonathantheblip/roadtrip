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

async function openMatchThread(page) {
  await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
  // Slice 3a: a stay sheds the road-trip day-by-day stop list; today's events
  // (clock 2026-05-23 = Day 2) live in the living heart's "On the agenda".
  // Open vs BEV 13 Empire's (vb2-3) StopDetail thread from there.
  await page.getByRole('button', { name: /vs BEV 13 Empire/i }).first().click()
}

test('a synced video WITH a poster shows a play badge in the thread and opens a <video>', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await seedMemoriesIntoCache(page, [
    videoMem({ id: 'vthread', stopId: 'vb2-3', posterUrl: TINY_RED_PNG_DATA_URL }),
  ])
  await openMatchThread(page)

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
  await seedMemoriesIntoCache(page, [videoMem({ id: 'vnoposter', stopId: 'vb2-3' })])
  await openMatchThread(page)

  // Poster-less video → a Play-glyph fallback, not an invisible/blank tile.
  await expect(page.getByTestId('thread-video-fallback').first()).toBeVisible()
  // No retry pending for this one → no "uploading" hint.
  await expect(page.getByTestId('thread-poster-pending')).toHaveCount(0)

  await page.getByRole('button', { name: 'Open video' }).first().click()
  const lightbox = page.getByTestId('photo-lightbox')
  await expect(lightbox.getByTestId('lightbox-video')).toBeAttached()
  await expect(lightbox.locator('img')).toHaveCount(0)
})

test('a poster-less video whose poster retry is pending shows a "thumbnail uploading" hint', async ({ page, browserName }) => {
  // The hint render is engine-agnostic CSS (proven on chromium). On webkit the
  // async cold-load poster-drain races this fake marker (whose blob isn't in
  // idb) and clears it before the assert — the same idb/timing family as the
  // other webkit-idb skips. Skip webkit rather than seed fragile webkit idb.
  test.skip(browserName === 'webkit', 'poster-drain vs fake-marker race on webkit idb')
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await seedMemoriesIntoCache(page, [videoMem({ id: 'vpending', stopId: 'vb2-3' })])
  // Plant the fake pending-poster marker AND force OFFLINE before boot. The
  // cold-load poster-drain DROPS a marker whose (fake) blob isn't in idb — but
  // drainPendingPosters no-ops entirely while offline (posterRetry.js: an offline
  // pass must never touch markers). So offline removes the boot-time drain-vs-
  // marker race deterministically (it failed on the slower CI runner otherwise).
  // isWorkerConfigured() is independent of navigator.onLine, and the thread + hint
  // are local renders — so nothing else this test needs is affected by offline.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    localStorage.setItem(
      'rt_pending_posters_v1',
      JSON.stringify([{ memoryId: 'vpending', posterIdbKey: 'k', asTraveler: 'helen', attempts: 1 }])
    )
  })
  await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
  // Slice 3a: open vs BEV 13 Empire (vb2-3) from the living-heart "On the agenda".
  await page.getByRole('button', { name: /vs BEV 13 Empire/i }).first().click()

  await expect(page.getByTestId('thread-video-fallback').first()).toBeVisible()
  await expect(page.getByTestId('thread-poster-pending').first()).toBeVisible()
})
