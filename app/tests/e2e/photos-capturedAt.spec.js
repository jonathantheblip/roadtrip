import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, seedMemoriesIntoCache, FIXTURE_TRIP, TINY_RED_PNG_DATA_URL } from './_fixtures/withTrip.js'

// C0 acceptance — memory.capturedAt is the album's source-of-truth
// date, the per-photo EXIF mirrors it, and a missing capture date
// renders the upload-time fallback with the '· uploaded' label.

const SHOT_DIR = 'tests/e2e/screenshots'

test.describe('PhotosView — capturedAt as source of truth (C0)', () => {
  test('memory with capturedAt sorts and renders without the uploaded label', async ({
    page,
  }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [
      // Captured early on Saturday morning, uploaded late Sunday — the
      // album must respect the capture moment, not the upload moment.
      memoryWith({
        id: 'cap-A',
        capturedAt: '2026-05-23T07:00:00.000Z',
        createdAt: '2026-05-24T22:00:00.000Z',
      }),
      memoryWith({
        id: 'cap-B',
        capturedAt: '2026-05-23T19:00:00.000Z',
        createdAt: '2026-05-23T19:30:00.000Z',
      }),
    ])
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await page.getByTestId('helen-photos-entry').click()

    // Both tiles render in the same stop group, sorted asc by capture
    // time even though A was uploaded later than B.
    const tiles = page.getByTestId('photo-tile')
    await expect(tiles).toHaveCount(2)
    await expect(tiles.nth(0)).toContainText('cap-A')
    await expect(tiles.nth(1)).toContainText('cap-B')

    // Neither tile carries the '· uploaded' label because both have a
    // real capturedAt.
    for (let i = 0; i < 2; i++) {
      const dateNode = tiles.nth(i).locator('[data-testid="tile-date-source"]')
      await expect(dateNode).toHaveAttribute('data-source', 'memory')
      await expect(dateNode).not.toContainText('uploaded')
    }
  })

  test('memory without capturedAt and without per-photo EXIF shows the uploaded label', async ({
    page,
  }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [
      memoryWith({
        id: 'no-date',
        createdAt: '2026-05-24T18:00:00.000Z',
        // no capturedAt; ref has no capturedAt either
        photoRef: { storage: 'external', url: TINY_RED_PNG_DATA_URL },
      }),
    ])
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await page.getByTestId('helen-photos-entry').click()
    const tile = page.getByTestId('photo-tile').first()
    const dateNode = tile.locator('[data-testid="tile-date-source"]')
    await expect(dateNode).toHaveAttribute('data-source', 'createdAt')
    await expect(dateNode).toContainText('uploaded')

    // The lightbox carries the same chronology contract.
    await tile.click()
    const lightboxDate = page.locator('[data-testid="lightbox-date-source"]')
    await expect(lightboxDate).toHaveAttribute('data-source', 'createdAt')
    await expect(lightboxDate).toContainText('(uploaded)')
  })

  test('backfill promotes legacy ref.capturedAt to memory.capturedAt at mount', async ({
    page,
  }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [
      // Legacy shape — capturedAt lives only on the photoRef, no
      // top-level field. After the backfill the album reads it as a
      // 'memory'-sourced date.
      {
        id: 'legacy-1',
        tripId: 'volleyball-2026',
        stopId: 'vb2-3',
        authorTraveler: 'helen',
        visibility: 'shared',
        kind: 'photo',
        photoRef: {
          storage: 'external',
          url: TINY_RED_PNG_DATA_URL,
          capturedAt: '2026-04-17T15:00:00.000Z',
        },
        photoExternalURLs: [],
        reactions: [],
        createdAt: '2026-05-24T03:00:00.000Z',
        updatedAt: '2026-05-24T03:00:00.000Z',
      },
    ])
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await page.getByTestId('helen-photos-entry').click()
    // After mount, App.jsx runs backfillCapturedAt() — confirm the
    // localStorage record now carries memory.capturedAt.
    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem('rt_memories_shared_v1')
      const list = raw ? JSON.parse(raw) : []
      return list.find((m) => m.id === 'legacy-1')
    })
    expect(stored?.capturedAt).toBe('2026-04-17T15:00:00.000Z')
  })

  test('dev-mode lightbox affordance overrides the album date', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [
      memoryWith({
        id: 'override-target',
        capturedAt: '2026-05-23T07:00:00.000Z',
        createdAt: '2026-05-24T22:00:00.000Z',
      }),
    ])
    // Flip the dev-mode flag BEFORE the app boots so the lightbox
    // renders the affordance on first mount.
    await page.addInitScript(() => localStorage.setItem('rt_dev_mode', 'true'))
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await page.getByTestId('helen-photos-entry').click()
    await page.getByTestId('photo-tile').first().click()

    // Edit-date affordance exists.
    const editBtn = page.getByTestId('lightbox-edit-date')
    await expect(editBtn).toBeVisible()
    await editBtn.click()

    const input = page.getByTestId('lightbox-date-input')
    await expect(input).toBeVisible()
    // Pick a new date — 1985-07-04 7:30pm local (used as a "very old
    // scanned photo" stand-in).
    await input.fill('1985-07-04T19:30')
    await page.getByTestId('lightbox-date-save').click()

    // The lightbox date region rerenders with the override applied.
    // formatFullDate trims the year so the label stays compact — we
    // assert on the formatted day-and-time form instead (and verify
    // the stored ISO carries the full 1985 date below).
    const lightboxDate = page.locator('[data-testid="lightbox-date-source"]')
    await expect(lightboxDate).toHaveAttribute('data-source', 'memory')
    await expect(lightboxDate).toContainText(/Jul 4/)
    await expect(lightboxDate).toContainText(/7:30/)

    // The override survives a soft reload of just the data.
    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem('rt_memories_shared_v1')
      const list = raw ? JSON.parse(raw) : []
      return list.find((m) => m.id === 'override-target')
    })
    expect(stored?.capturedAt).toMatch(/^1985-07-04T/)
  })

  test('non-dev mode hides the date-edit affordance entirely', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [
      memoryWith({
        id: 'no-edit-shown',
        capturedAt: '2026-05-23T07:00:00.000Z',
        createdAt: '2026-05-24T22:00:00.000Z',
      }),
    ])
    // Do NOT flip rt_dev_mode — the affordance must not render.
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await page.getByTestId('helen-photos-entry').click()
    await page.getByTestId('photo-tile').first().click()
    await expect(page.getByTestId('lightbox-edit-date')).toHaveCount(0)
  })

  test('lightbox screenshots — before and after the · uploaded label', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [
      // With capture date — no '(uploaded)' suffix.
      memoryWith({
        id: 'with-date',
        caption: 'Captured today',
        capturedAt: '2026-05-24T11:30:00.000Z',
        createdAt: '2026-05-24T22:00:00.000Z',
      }),
    ])
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await page.getByTestId('helen-photos-entry').click()
    await page.getByTestId('photo-tile').first().click()
    await page.screenshot({
      path: `${SHOT_DIR}/c0-lightbox-with-date.png`,
      fullPage: true,
    })

    // Close lightbox.
    await page.keyboard.press('Escape')

    // Replace fixture with an upload-only memory and re-render.
    await page.evaluate(() => {
      localStorage.setItem(
        'rt_memories_shared_v1',
        JSON.stringify([
          {
            id: 'no-date-shot',
            tripId: 'volleyball-2026',
            stopId: 'vb2-3',
            authorTraveler: 'helen',
            visibility: 'shared',
            kind: 'photo',
            caption: 'Uploaded much later',
            photoRef: {
              storage: 'external',
              url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9eyf3KsAAAAASUVORK5CYII=',
            },
            photoExternalURLs: [],
            reactions: [],
            createdAt: '2026-05-24T18:00:00.000Z',
            updatedAt: '2026-05-24T18:00:00.000Z',
          },
        ])
      )
    })
    await page.reload()
    await page.getByTestId('helen-photos-entry').click()
    await page.getByTestId('photo-tile').first().click()
    await page.screenshot({
      path: `${SHOT_DIR}/c0-lightbox-uploaded-fallback.png`,
      fullPage: true,
    })
  })
})

function memoryWith({ id, capturedAt = null, createdAt, caption = id, photoRef }) {
  return {
    id,
    tripId: 'volleyball-2026',
    stopId: 'vb2-3',
    authorTraveler: 'helen',
    visibility: 'shared',
    kind: 'photo',
    caption,
    capturedAt,
    photoRef: photoRef || {
      storage: 'external',
      url: TINY_RED_PNG_DATA_URL,
    },
    photoExternalURLs: [],
    reactions: [],
    createdAt,
    updatedAt: createdAt,
  }
}
