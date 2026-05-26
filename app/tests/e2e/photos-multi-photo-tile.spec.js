import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, seedMemoriesIntoCache, FIXTURE_TRIP, TINY_RED_PNG_DATA_URL } from './_fixtures/withTrip.js'

// Bug 2 fix — a single multi-photo memory yields N tiles, but the
// per-memory caption renders only on the FIRST tile so the album
// doesn't repeat the same sentence across siblings. The remaining
// tiles instead show an N/M index badge so the user can tell they're
// part of a set.
//
// Bug 1 mitigation — when an <img> fails to load (404, decoder error
// on a specific device), the tile falls back to the same ImageIcon
// placeholder the no-URL path uses instead of showing a black square
// next to its siblings.

test.describe('PhotosView multi-photo memory rendering', () => {
  test('caption renders once on first tile, siblings get a count badge', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [
      {
        id: 'multi-photo-mem',
        tripId: 'volleyball-2026',
        stopId: 'vb2-3',
        authorTraveler: 'helen',
        visibility: 'shared',
        kind: 'photo',
        caption: 'Way better than the photos',
        capturedAt: '2026-05-23T19:50:00.000Z',
        // Three different URLs so flattenPhotoEntries doesn't dedup
        // them into a single tile.
        photoRefs: [
          { storage: 'external', url: TINY_RED_PNG_DATA_URL + '#a' },
          { storage: 'external', url: TINY_RED_PNG_DATA_URL + '#b' },
          { storage: 'external', url: TINY_RED_PNG_DATA_URL + '#c' },
        ],
        photoExternalURLs: [],
        reactions: [],
        createdAt: '2026-05-24T03:00:00.000Z',
        updatedAt: '2026-05-24T03:00:00.000Z',
      },
    ])
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await page.getByTestId('helen-photos-entry').click()

    const tiles = page.getByTestId('photo-tile')
    await expect(tiles).toHaveCount(3)

    // Caption text appears exactly once across the three tiles.
    const captionMatches = await page.getByText('Way better than the photos').count()
    expect(captionMatches).toBe(1)

    // Each tile carries a count badge "1/3", "2/3", "3/3".
    const badges = await page
      .getByTestId('tile-multi-index')
      .allTextContents()
    expect(badges.sort()).toEqual(['1/3', '2/3', '3/3'])
  })

  test('single-photo memory still shows the caption (no badge)', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [
      {
        id: 'single-photo-mem',
        tripId: 'volleyball-2026',
        stopId: 'vb2-3',
        authorTraveler: 'helen',
        visibility: 'shared',
        kind: 'photo',
        caption: 'A single photo with a caption',
        capturedAt: '2026-05-23T19:50:00.000Z',
        photoRef: { storage: 'external', url: TINY_RED_PNG_DATA_URL },
        photoExternalURLs: [],
        reactions: [],
        createdAt: '2026-05-23T19:55:00.000Z',
        updatedAt: '2026-05-23T19:55:00.000Z',
      },
    ])
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await page.getByTestId('helen-photos-entry').click()
    await expect(page.getByTestId('photo-tile')).toHaveCount(1)
    await expect(page.getByText('A single photo with a caption')).toBeVisible()
    await expect(page.getByTestId('tile-multi-index')).toHaveCount(0)
  })

  test('a tile whose <img> fails to load falls back to the ImageIcon', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [
      {
        id: 'bad-url-mem',
        tripId: 'volleyball-2026',
        stopId: 'vb2-3',
        authorTraveler: 'helen',
        visibility: 'shared',
        kind: 'photo',
        caption: 'This one is broken',
        capturedAt: '2026-05-23T19:50:00.000Z',
        // A URL the test environment cannot fetch — triggers <img onError>.
        photoRef: {
          storage: 'r2',
          url: 'https://nonexistent-host-for-test.invalid/missing.jpg',
        },
        photoExternalURLs: [],
        reactions: [],
        createdAt: '2026-05-23T19:55:00.000Z',
        updatedAt: '2026-05-23T19:55:00.000Z',
      },
    ])
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await page.getByTestId('helen-photos-entry').click()
    // Wait for the onError to fire and the fallback ImageIcon to mount.
    await expect(page.getByTestId('tile-image-fallback')).toBeVisible({ timeout: 10_000 })
    // Caption still renders on the tile even when the image is broken.
    await expect(page.getByText('This one is broken')).toBeVisible()
  })

  test('two memories at the same stop render as separate memory-groups with a hairline', async ({
    page,
  }) => {
    // Helen reported: two memories captured at the same stop flowed
    // into one CSS grid, so tile 5's "1/4" badge looked like a
    // numbering bug rather than the start of memory 2. Each memory
    // now renders in its own [data-testid="memory-group"] grid with
    // a top border on every run after the first.
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [
      {
        id: 'mem-A',
        tripId: 'volleyball-2026',
        stopId: 'vb2-3',
        authorTraveler: 'helen',
        visibility: 'shared',
        kind: 'photo',
        caption: 'First memory',
        capturedAt: '2026-05-23T10:00:00.000Z',
        photoRefs: [
          { storage: 'external', url: TINY_RED_PNG_DATA_URL + '#a1' },
          { storage: 'external', url: TINY_RED_PNG_DATA_URL + '#a2' },
        ],
        photoExternalURLs: [],
        reactions: [],
        createdAt: '2026-05-23T10:05:00.000Z',
        updatedAt: '2026-05-23T10:05:00.000Z',
      },
      {
        id: 'mem-B',
        tripId: 'volleyball-2026',
        stopId: 'vb2-3',
        authorTraveler: 'helen',
        visibility: 'shared',
        kind: 'photo',
        caption: 'Second memory',
        capturedAt: '2026-05-23T11:00:00.000Z',
        photoRefs: [
          { storage: 'external', url: TINY_RED_PNG_DATA_URL + '#b1' },
          { storage: 'external', url: TINY_RED_PNG_DATA_URL + '#b2' },
          { storage: 'external', url: TINY_RED_PNG_DATA_URL + '#b3' },
        ],
        photoExternalURLs: [],
        reactions: [],
        createdAt: '2026-05-23T11:05:00.000Z',
        updatedAt: '2026-05-23T11:05:00.000Z',
      },
    ])
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await page.getByTestId('helen-photos-entry').click()

    const stopGroup = page.getByTestId('stop-group').first()
    const memoryGroups = stopGroup.getByTestId('memory-group')
    await expect(memoryGroups).toHaveCount(2)
    await expect(memoryGroups.nth(0)).toHaveAttribute('data-memory-id', 'mem-A')
    await expect(memoryGroups.nth(1)).toHaveAttribute('data-memory-id', 'mem-B')

    // The second memory's grid has the hairline (border-top), the
    // first does not — that's the visual signal Helen needs.
    const firstBorder = await memoryGroups
      .nth(0)
      .evaluate((el) => getComputedStyle(el).borderTopWidth)
    const secondBorder = await memoryGroups
      .nth(1)
      .evaluate((el) => getComputedStyle(el).borderTopWidth)
    expect(firstBorder).toBe('0px')
    expect(parseFloat(secondBorder)).toBeGreaterThan(0)

    // Badges are now unambiguous: 1/2, 2/2 inside memory A;
    // 1/3, 2/3, 3/3 inside memory B.
    const aBadges = await memoryGroups
      .nth(0)
      .getByTestId('tile-multi-index')
      .allTextContents()
    const bBadges = await memoryGroups
      .nth(1)
      .getByTestId('tile-multi-index')
      .allTextContents()
    expect(aBadges.sort()).toEqual(['1/2', '2/2'])
    expect(bBadges.sort()).toEqual(['1/3', '2/3', '3/3'])
  })

  test('every themed view places the Photos entry within the first viewport', async ({
    page,
  }) => {
    // Bug 3 acceptance — Photos entry should sit in the top region
    // of each themed view (within the first ~1.5 viewports), not
    // buried at the bottom. Measured against the rendered DOM after
    // mount.
    await seedTripIntoCache(page, FIXTURE_TRIP)
    const PROMOTION_BUDGET_PX = 1500
    const limits = {}
    for (const person of ['jonathan', 'helen', 'aurelia', 'rafa']) {
      await page.goto(`/?person=${person}&trip=volleyball-2026&nosw=1`)
      const entry = page.getByTestId(`${person}-photos-entry`)
      await expect(entry).toBeVisible({ timeout: 5000 })
      const top = await entry.evaluate(
        (el) => Math.round(el.getBoundingClientRect().top + window.scrollY)
      )
      limits[person] = top
      expect(top, `${person}-photos-entry should be within ${PROMOTION_BUDGET_PX}px`)
        .toBeLessThan(PROMOTION_BUDGET_PX)
    }
    // Log positions for the screenshot record.
    test.info().annotations.push({
      type: 'entry-positions',
      description: JSON.stringify(limits),
    })
  })
})
