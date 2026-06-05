import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, seedMemoriesIntoCache, FIXTURE_TRIP, TINY_RED_PNG_DATA_URL } from './_fixtures/withTrip.js'
import { TRAVELER_DOT } from '../../src/data/travelers.js'

// M1 acceptance — PhotosView renders, groups by stop, dedupes, lightbox
// opens/navigates/closes. Asserts against the actual DOM the family
// will see, not a snapshot of intent.

test.describe('PhotosView shell (M1)', () => {
  test('empty state when the trip has no photo memories', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.goto('/?person=helen&trip=volleyball-2026')
    await openPhotos(page)
    await expect(
      page.getByText('Once the trip starts collecting photos', { exact: false })
    ).toBeVisible()
    // The "Import photos" entry point shows even when empty — it's the
    // only way Helen can add the first photo now that Stage 3 retired the
    // single-photo dispatch composer.
    await expect(page.getByTestId('import-photos')).toBeVisible()
  })

  test('photos group by stop, sorted by capture date ascending', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [
      // Saturday match — two photos out of order so the sort matters.
      photoMemory({
        id: 'm1',
        stopId: 'vb2-3',
        author: 'helen',
        caption: 'Court 1 warmup',
        createdAt: '2026-05-23T19:50:00Z',
      }),
      photoMemory({
        id: 'm2',
        stopId: 'vb2-3',
        author: 'jonathan',
        caption: 'Aurelia serving',
        createdAt: '2026-05-23T20:30:00Z',
      }),
      photoMemory({
        id: 'm3',
        stopId: 'vb3-4',
        author: 'helen',
        caption: 'Sunday court 3',
        createdAt: '2026-05-24T20:05:00Z',
      }),
      // Stop with no photos — should NOT render a group.
      // (vb1-3 lodging is in the trip but has no memory.)
    ])
    await page.goto('/?person=helen&trip=volleyball-2026')
    await openPhotos(page)

    const groups = page.getByTestId('stop-group')
    await expect(groups).toHaveCount(2)
    // First group should be Saturday (Day 2) because day order ascending.
    await expect(groups.nth(0)).toContainText('vs BEV 13 Empire')
    await expect(groups.nth(1)).toContainText('Match 1 vs Northeast 13.2')
    // Sat group has two photos, captions in capture-asc order.
    const satTiles = groups.nth(0).getByTestId('photo-tile')
    await expect(satTiles).toHaveCount(2)
    await expect(satTiles.nth(0)).toContainText('Court 1 warmup')
    await expect(satTiles.nth(1)).toContainText('Aurelia serving')
  })

  test('lightbox opens, navigates within the stop group, closes', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [
      photoMemory({ id: 'm1', stopId: 'vb2-3', author: 'helen', caption: 'first', createdAt: '2026-05-23T19:50:00Z' }),
      photoMemory({ id: 'm2', stopId: 'vb2-3', author: 'jonathan', caption: 'second', createdAt: '2026-05-23T20:30:00Z' }),
      photoMemory({ id: 'm3', stopId: 'vb2-3', author: 'aurelia', caption: 'third', createdAt: '2026-05-23T20:45:00Z' }),
    ])
    await page.goto('/?person=helen&trip=volleyball-2026')
    await openPhotos(page)

    await page.getByTestId('photo-tile').first().click()
    const lightbox = page.getByTestId('photo-lightbox')
    await expect(lightbox).toBeVisible()
    await expect(lightbox).toContainText('1 / 3')
    await expect(lightbox).toContainText('first')

    await page.getByRole('button', { name: 'Next photo' }).click()
    await expect(lightbox).toContainText('2 / 3')
    await expect(lightbox).toContainText('second')

    await page.keyboard.press('ArrowRight')
    await expect(lightbox).toContainText('3 / 3')
    await expect(lightbox).toContainText('third')

    // At the end, the next arrow disappears.
    await expect(page.getByRole('button', { name: 'Next photo' })).toHaveCount(0)

    await page.keyboard.press('Escape')
    await expect(lightbox).toHaveCount(0)
  })

  test('every themed view exposes a Photos entry point', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)

    const expected = {
      jonathan: 'jonathan-photos-entry',
      helen: 'helen-photos-entry',
      aurelia: 'aurelia-photos-entry',
      rafa: 'rafa-photos-entry',
    }
    for (const [person, testId] of Object.entries(expected)) {
      await page.goto(`/?person=${person}&trip=volleyball-2026`)
      await expect(
        page.getByTestId(testId),
        `${person}'s view is missing the Photos entry`
      ).toBeVisible()
    }
  })

  test('photo tile renders poster color, caption, date, location', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [
      photoMemory({
        id: 'm1',
        stopId: 'vb2-3',
        author: 'helen', // → forest green TRAVELER_DOT
        caption: 'Helen tile metadata',
        createdAt: '2026-05-23T20:30:00Z',
      }),
    ])
    await page.goto('/?person=helen&trip=volleyball-2026')
    await openPhotos(page)

    const tile = page.getByTestId('photo-tile').first()
    await expect(tile).toContainText('Helen tile metadata')
    // Location falls back to stop address when EXIF is absent.
    await expect(tile).toContainText('Court 1, Mohegan Sun')
    // The poster color dot is Helen's canonical identity color — derived
    // from TRAVELER_DOT (the source of truth) so an identity-color change
    // updates this assertion instead of silently breaking it.
    const dot = tile.locator('[aria-label="Posted by Helen"]')
    await expect(dot).toBeVisible()
    const bg = await dot.evaluate((el) => getComputedStyle(el).backgroundColor)
    const [r, g, b] = TRAVELER_DOT.helen.match(/\w\w/g).map((h) => parseInt(h, 16))
    expect(bg).toBe(`rgb(${r}, ${g}, ${b})`)
  })

  test('EXIF capture date is primary, fallback to createdAt is labelled', async ({ page }) => {
    // Tile-render concern (relocated from the retired photos-dispatch spec —
    // it never touched the dispatch composer): seed two memories — one with a
    // ref capturedAt, one without — and assert each tile renders the right
    // date *source* tag.
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.addInitScript(() => {
      const memories = [
        {
          id: 'with-exif',
          tripId: 'volleyball-2026',
          stopId: 'vb2-3',
          authorTraveler: 'helen',
          visibility: 'shared',
          kind: 'photo',
          caption: 'EXIF photo Helen',
          photoRef: {
            storage: 'external',
            url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9eyf3KsAAAAASUVORK5CYII=',
            capturedAt: '2026-05-23T19:50:00Z', // EXIF says ~3:50 PM ET
          },
          // memory uploaded much later — if the app used createdAt, the
          // chronology would break.
          createdAt: '2026-05-24T09:00:00Z',
          updatedAt: '2026-05-24T09:00:00Z',
        },
        {
          id: 'no-exif',
          tripId: 'volleyball-2026',
          stopId: 'vb2-3',
          authorTraveler: 'jonathan',
          visibility: 'shared',
          kind: 'photo',
          caption: 'Bare upload Jonathan',
          photoRef: {
            storage: 'external',
            url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9eyf3KsAAAAASUVORK5CYII=',
            // no capturedAt
          },
          createdAt: '2026-05-23T20:30:00Z',
          updatedAt: '2026-05-23T20:30:00Z',
        },
      ]
      localStorage.setItem('rt_memories_shared_v1', JSON.stringify(memories))
    })

    await page.goto('/?person=helen&trip=volleyball-2026')
    await openPhotos(page)

    const exifTile = page
      .getByTestId('photo-tile')
      .filter({ hasText: 'EXIF photo Helen' })
    const fallbackTile = page
      .getByTestId('photo-tile')
      .filter({ hasText: 'Bare upload Jonathan' })

    const exifSource = await exifTile
      .locator('[data-testid="tile-date-source"]')
      .getAttribute('data-source')
    const fallbackSource = await fallbackTile
      .locator('[data-testid="tile-date-source"]')
      .getAttribute('data-source')

    // Source attribute is 'memory' when the album has a top-level capturedAt
    // — the post-C0 default for any new upload with EXIF, and what the
    // boot-time backfill produces for legacy records whose ref.capturedAt is
    // meaningfully earlier than the upload time. Both 'memory' and 'exif' are
    // "real capture date" sources; the alternative is 'createdAt' (below).
    expect(['memory', 'exif']).toContain(exifSource)
    expect(fallbackSource).toBe('createdAt')

    // The fallback tile additionally labels itself "· uploaded" so the viewer
    // can tell the date isn't the actual capture moment.
    await expect(fallbackTile).toContainText('· uploaded')
  })
})

async function openPhotos(page) {
  // Each view exposes its own Photos entry; click whichever is visible
  // on the current person's surface.
  const candidates = [
    'helen-photos-entry',
    'jonathan-photos-entry',
    'aurelia-photos-entry',
    'rafa-photos-entry',
  ]
  for (const tid of candidates) {
    const loc = page.getByTestId(tid)
    if (await loc.count()) {
      await loc.click()
      return
    }
  }
  throw new Error('No Photos entry point found on this view')
}

function photoMemory({ id, stopId, author, caption, createdAt }) {
  return {
    id,
    tripId: 'volleyball-2026',
    stopId,
    authorTraveler: author,
    visibility: 'shared',
    kind: 'photo',
    caption,
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

// A video memory: kind stays 'photo' (the ref's mime/posterUrl mark it as
// video). The url stands in for the .mp4 (the lightbox <video src>); posterUrl
// is the renderable still the grid tile shows.
function videoMemory({ id, stopId, author, caption, createdAt }) {
  return {
    id,
    tripId: 'volleyball-2026',
    stopId,
    authorTraveler: author,
    visibility: 'shared',
    kind: 'photo',
    caption,
    photoRef: {
      storage: 'r2',
      url: TINY_RED_PNG_DATA_URL,
      mime: 'video/mp4',
      posterUrl: TINY_RED_PNG_DATA_URL,
    },
    photoExternalURLs: [],
    reactions: [],
    createdAt,
    updatedAt: createdAt,
  }
}

// Stage 3 — a synced video renders a play badge in the grid + a <video> in the
// lightbox (was a fallback icon because the ref's url points at the .mp4).
test.describe('PhotosView — video tiles (Stage 3)', () => {
  test('a video memory shows a play badge in the grid and a <video> in the lightbox', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [
      videoMemory({ id: 'v1', stopId: 'vb2-3', author: 'helen', caption: 'Match point', createdAt: '2026-05-23T20:00:00Z' }),
    ])
    await page.goto('/?person=helen&trip=volleyball-2026')
    await openPhotos(page)

    const tile = page.getByTestId('photo-tile').first()
    await expect(tile).toBeVisible()
    // The grid marks it as a video — the badge renders whenever the entry is a
    // video, independent of whether the poster <img> loaded.
    await expect(tile.getByTestId('tile-video-badge')).toBeVisible()

    // Opening it yields a <video> (not an <img>), carrying the poster + src.
    await tile.click()
    const lightbox = page.getByTestId('photo-lightbox')
    await expect(lightbox).toBeVisible()
    const video = lightbox.getByTestId('lightbox-video')
    await expect(video).toBeAttached()
    await expect(video).toHaveAttribute('poster', TINY_RED_PNG_DATA_URL)
    await expect(video).toHaveAttribute('src', TINY_RED_PNG_DATA_URL)
    // ...and no plain <img> stands in for the video in the lightbox.
    await expect(lightbox.locator('img')).toHaveCount(0)
  })
})
