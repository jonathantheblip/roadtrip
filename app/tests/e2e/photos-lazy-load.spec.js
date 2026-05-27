import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, seedMemoriesIntoCache, FIXTURE_TRIP, TINY_RED_PNG_DATA_URL } from './_fixtures/withTrip.js'

// P0.4 — lazy-load + thumbnail-resolution discipline on photo grids.
// Helen's Fun @ the Sun album holds ~55 photos. Before this fix every
// tile fetched a full-resolution ?w=2048 variant on mount and the page
// never reached document_idle. The fix:
//   1. IntersectionObserver with rootMargin '300px 0px' gates whether
//      a tile renders its <img> at all.
//   2. The grid uses ?w=600 (thumbnail) instead of ?w=2048 — payload
//      drops ~20x while staying retina-sharp at typical tile widths.
//   3. The lightbox still uses entry.url bare for full fidelity.
//
// This spec proves the gate: late tiles in a large album don't render
// their <img> until scrolled into view, and scrolling to them flips
// them inView and mounts the image.

const ALBUM_PHOTO_COUNT = 30

function makeMemoryFixture(i) {
  return {
    id: `lazy-mem-${i}`,
    tripId: 'volleyball-2026',
    stopId: 'vb2-3',
    authorTraveler: 'helen',
    visibility: 'shared',
    kind: 'photo',
    caption: `Photo ${i}`,
    capturedAt: new Date(Date.UTC(2026, 4, 23, 19, i, 0)).toISOString(),
    photoRefs: [
      // Each photo gets a unique fragment so flattenPhotoEntries
      // doesn't collapse them into one tile.
      { storage: 'external', url: `${TINY_RED_PNG_DATA_URL}#lazy-${i}` },
    ],
    photoExternalURLs: [],
    reactions: [],
    createdAt: new Date(Date.UTC(2026, 4, 24, 3, i, 0)).toISOString(),
    updatedAt: new Date(Date.UTC(2026, 4, 24, 3, i, 0)).toISOString(),
  }
}

test.describe('Photo album — lazy-load discipline (P0.4)', () => {
  test('late tiles in a large album do not render <img> until scrolled into view', async ({
    page,
  }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(
      page,
      Array.from({ length: ALBUM_PHOTO_COUNT }, (_, i) => makeMemoryFixture(i))
    )
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await page.getByTestId('helen-photos-entry').click()

    const tiles = page.getByTestId('photo-tile')
    await expect(tiles).toHaveCount(ALBUM_PHOTO_COUNT)

    // Wait for IntersectionObserver to settle on the visible tiles —
    // not strictly necessary since the observer fires synchronously
    // on the first frame, but defends against timing flakes.
    await page.waitForTimeout(200)

    // The first tile (top of page) must be in view + have an <img>.
    const firstTile = tiles.first()
    await expect(firstTile).toHaveAttribute('data-photo-in-view', '1')
    await expect(firstTile.locator('img')).toHaveCount(1)

    // The last tile (way off-screen at 871px viewport with ~30 photos)
    // must be out of view + have NO <img> rendered.
    const lastTile = tiles.last()
    await expect(lastTile).toHaveAttribute('data-photo-in-view', '0')
    await expect(lastTile.locator('img')).toHaveCount(0)

    // Count how many <img> elements are mounted in total — should be
    // a small fraction of the album, not all 30. This is the
    // concurrency cap that lets the page reach document_idle.
    const imgsBeforeScroll = await page.locator('[data-testid=photo-tile] img').count()
    expect(imgsBeforeScroll).toBeLessThan(ALBUM_PHOTO_COUNT)
    expect(imgsBeforeScroll).toBeGreaterThan(0)

    // Scroll the last tile into view. IntersectionObserver should
    // flip it inView and mount the <img>.
    await lastTile.scrollIntoViewIfNeeded()
    await expect(lastTile).toHaveAttribute('data-photo-in-view', '1')
    await expect(lastTile.locator('img')).toHaveCount(1)
  })

  test('grid <img> requests use the ?w=600 thumbnail variant', async ({ page }) => {
    // Use a workers.dev URL (one that thumbUrl would actually rewrite)
    // so the assertion is meaningful. data:image URLs pass through
    // thumbUrl unchanged because they're not Worker-hosted.
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [
      {
        id: 'grid-thumb-mem',
        tripId: 'volleyball-2026',
        stopId: 'vb2-3',
        authorTraveler: 'helen',
        visibility: 'shared',
        kind: 'photo',
        caption: 'Worker-hosted photo',
        capturedAt: '2026-05-23T19:55:00.000Z',
        photoRefs: [
          {
            storage: 'external',
            url: 'https://roadtrip-sync.jonathan-d-jackson.workers.dev/assets/helen/mem_test/photo-1',
          },
        ],
        photoExternalURLs: [],
        reactions: [],
        createdAt: '2026-05-24T03:00:00.000Z',
        updatedAt: '2026-05-24T03:00:00.000Z',
      },
    ])
    // Stub the worker asset so the <img> doesn't actually try to
    // fetch from production. Any 200 with a 1x1 PNG is fine.
    await page.route(
      /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/assets\/helen\/mem_test\/photo-1/,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'image/png',
          body: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9eyf3KsAAAAASUVORK5CYII=',
            'base64'
          ),
        })
      }
    )
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await page.getByTestId('helen-photos-entry').click()
    const tile = page.getByTestId('photo-tile').first()
    await expect(tile).toBeVisible()
    const img = tile.locator('img')
    await expect(img).toHaveCount(1)
    // The grid src must carry ?w=600. The lightbox would use the
    // bare URL — we don't open it here, but verify the grid encoding.
    const src = await img.getAttribute('src')
    expect(src).toContain('?w=600')
  })
})
