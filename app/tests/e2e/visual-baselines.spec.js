import { test, expect } from './_fixtures/clockStub.js'
import {
  seedTripIntoCache,
  seedMemoriesIntoCache,
  FIXTURE_TRIP,
  TINY_RED_PNG_DATA_URL,
} from './_fixtures/withTrip.js'
import {
  mockSuccessfulUpload,
  mockClaudeChatWorker,
} from './_fixtures/mockUpload.js'

// Bug-Trap Item A.4 — visual regression baselines.
//
// Native Playwright toHaveScreenshot() does the heavy lifting:
//  - First run: captures baselines next to the spec under
//    visual-baselines.spec.js-snapshots/<browser>/<test>.png
//  - Subsequent runs: diff against the baseline; per-pixel
//    tolerance set in playwright.config.js (0.002 ratio, 0.2
//    threshold) tolerates font subpixel drift without flapping
//  - Per-project subdirs keep Chromium and WebKit baselines
//    separate automatically — no manual file management
//
// To accept a new baseline (e.g. after an intentional UI change):
//   npm run test:e2e:update-snapshots
// Otherwise the suite fails and prints the diff image.
//
// We seed the same trip + a small memory set into every test so
// the rendered views always have realistic content — empty
// surfaces produce baselines that don't catch the bugs we care
// about.

const SEED_MEMORIES = [
  // Multi-photo memory on the Day 1 pickup stop — exercises the
  // memory-group / photoRefs[] rendering path.
  {
    id: 'mem_vb_multi',
    tripId: 'volleyball-2026',
    stopId: 'vb1-1',
    authorTraveler: 'helen',
    visibility: 'shared',
    kind: 'photo',
    caption: 'pickups in motion',
    photoExternalURLs: [TINY_RED_PNG_DATA_URL, TINY_RED_PNG_DATA_URL, TINY_RED_PNG_DATA_URL],
    createdAt: '2026-05-22T16:05:00.000Z',
    capturedAt: '2026-05-22T16:05:00.000Z',
  },
  // Single-photo memory on Day 1 lodging — exercises the
  // single-photoRef rendering path.
  {
    id: 'mem_vb_lodging',
    tripId: 'volleyball-2026',
    stopId: 'vb1-3',
    authorTraveler: 'jonathan',
    visibility: 'shared',
    kind: 'photo',
    caption: 'arrived at the bungalow',
    photoExternalURLs: [TINY_RED_PNG_DATA_URL],
    createdAt: '2026-05-22T19:30:00.000Z',
    capturedAt: '2026-05-22T19:30:00.000Z',
  },
  // Saturday match — different stop, different day.
  {
    id: 'mem_vb_match',
    tripId: 'volleyball-2026',
    stopId: 'vb2-3',
    authorTraveler: 'aurelia',
    visibility: 'shared',
    kind: 'photo',
    caption: 'court 3 between matches',
    photoExternalURLs: [TINY_RED_PNG_DATA_URL],
    createdAt: '2026-05-23T17:30:00.000Z',
    capturedAt: '2026-05-23T17:30:00.000Z',
  },
]

// Local helper — seeds + navigates + waits for a stable paint
// before letting toHaveScreenshot fire.
async function setupTraveler(page, traveler, view = 'trip') {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await seedMemoriesIntoCache(page, SEED_MEMORIES)
  await page.goto(`/?person=${traveler}&trip=volleyball-2026&nosw=1`)
  // Wait for fonts (visual baselines are font-sensitive).
  await page.evaluate(() => document.fonts.ready)
  // Small settle wait so animations + lazy-loaded subtree-paint
  // finish before capture. Keeps the baselines deterministic.
  await page.waitForTimeout(400)
}

// ─── Themed trip views — one baseline per traveler ─────────────
test.describe('themed trip view per traveler', () => {
  for (const traveler of ['jonathan', 'helen', 'aurelia', 'rafa']) {
    test(`${traveler}`, async ({ page }) => {
      await setupTraveler(page, traveler)
      // Mask the fixed top bar: it's shared chrome whose action buttons
      // accrue as features land (Settings → Claude → Replay → Map), and
      // its light-theme button text renders differently across macOS
      // versions — so every top-bar button forced a webkit re-bless and
      // some cases (aurelia) can't be blessed off-runner at all. These
      // baselines exist to guard the themed trip CONTENT; the top bar is
      // covered by functional + a11y tests. Masking ends the churn.
      await expect(page).toHaveScreenshot(`trip-${traveler}.png`, {
        fullPage: true,
        mask: [page.getByTestId('trip-topbar')],
      })
    })
  }
})

// ─── Photos album per traveler ─────────────────────────────────
test.describe('photos album per traveler', () => {
  for (const traveler of ['jonathan', 'helen', 'aurelia', 'rafa']) {
    test(`${traveler}`, async ({ page }) => {
      await setupTraveler(page, traveler)
      // Each themed view's photos entry uses the
      // <traveler>-photos-entry test-id. Rafa is the one exception
      // where the entry may render differently — fall back to a
      // role-based open if the test-id is missing.
      const entry = page.getByTestId(`${traveler}-photos-entry`)
      if (await entry.isVisible().catch(() => false)) {
        await entry.click()
      } else {
        await page.getByRole('button', { name: /photos/i }).first().click()
      }
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(400)
      await expect(page).toHaveScreenshot(`album-${traveler}.png`, {
        fullPage: true,
      })
    })
  }
})

// ─── All-photos cross-trip view per traveler ───────────────────
test.describe('all-photos cross-trip per traveler', () => {
  for (const traveler of ['jonathan', 'helen', 'aurelia', 'rafa']) {
    test(`${traveler}`, async ({ page }) => {
      await setupTraveler(page, traveler)
      const entry = page.getByTestId(`${traveler}-all-photos-entry`)
      if (await entry.isVisible().catch(() => false)) {
        await entry.click()
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(400)
        await expect(page).toHaveScreenshot(`all-photos-${traveler}.png`, {
          fullPage: true,
        })
      } else {
        // Surface this as a baseline gap — annotate but don't fail.
        // Item A.7 triages whether the missing entry is a bug or
        // an intentional traveler-specific gate.
        test.info().annotations.push({
          type: 'baseline-skipped',
          description: `no all-photos entry for ${traveler}`,
        })
      }
    })
  }
})

// ─── Lightbox on a multi-photo memory ──────────────────────────
test('lightbox — multi-photo memory open', async ({ page }) => {
  await setupTraveler(page, 'helen')
  await page.getByTestId('helen-photos-entry').click()
  // First tile in the album opens the lightbox.
  await page.locator('img').first().click()
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(400)
  await expect(page).toHaveScreenshot('lightbox-multi.png', { fullPage: false })
})

// ─── Dispatch composer states ──────────────────────────────────
test('dispatch composer — empty state', async ({ page }) => {
  await setupTraveler(page, 'helen')
  await mockSuccessfulUpload(page)
  await page.getByTestId('helen-photos-entry').click()
  await page.getByTestId('add-dispatch').click()
  await expect(page.getByTestId('add-dispatch-modal')).toBeVisible()
  await page.waitForTimeout(300)
  await expect(page).toHaveScreenshot('dispatch-empty.png', { fullPage: false })
})

test('dispatch composer — photo picked + preview', async ({ page }) => {
  await setupTraveler(page, 'helen')
  await mockSuccessfulUpload(page)
  await page.getByTestId('helen-photos-entry').click()
  await page.getByTestId('add-dispatch').click()
  // Synthetic PNG fixture is fine for the baseline — visual
  // baseline tests don't depend on the real-media corpus.
  const { redPhotoFile } = await import('./_fixtures/photoFixtures.js')
  await page.getByTestId('dispatch-file-input').setInputFiles(redPhotoFile())
  await expect(page.getByTestId('prep-metadata')).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(300)
  await expect(page).toHaveScreenshot('dispatch-photo-picked.png', {
    fullPage: false,
  })
})

// ─── Claude chat — empty + with conversation ───────────────────
test('claude chat — empty state', async ({ page }) => {
  await setupTraveler(page, 'helen')
  await mockClaudeChatWorker(page, { initialConversations: [] })
  await page.getByRole('button', { name: /Modify this trip with Claude/i }).click()
  await expect(page.getByRole('dialog', { name: /Chat with Claude/i })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(300)
  await expect(page).toHaveScreenshot('claude-empty.png', { fullPage: false })
})

test('claude chat — with a conversation', async ({ page }) => {
  await setupTraveler(page, 'helen')
  const state = await mockClaudeChatWorker(page, {
    chatText: 'Saturday is Court 3 at Mohegan. Pool play opens at 9 AM.',
  })
  await page.getByRole('button', { name: /Modify this trip with Claude/i }).click()
  const dialog = page.getByRole('dialog', { name: /Chat with Claude/i })
  await dialog
    .getByRole('textbox', { name: /Message Claude/i })
    .fill("What was Saturday's volleyball schedule?")
  await dialog.getByRole('button', { name: /Send message/i }).click()
  await expect(dialog.getByText(/Saturday is Court 3 at Mohegan/i)).toBeVisible({
    timeout: 10_000,
  })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(300)
  await expect(page).toHaveScreenshot('claude-with-conversation.png', {
    fullPage: false,
  })
  expect(state.chats).toBe(1)
})

// ─── Trips list ────────────────────────────────────────────────
test('trips list', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await page.goto('/?person=helen&nosw=1')
  // Navigate to the trips index. The "← TRIPS" back button on the
  // top bar takes us there.
  await page.getByRole('button', { name: /trips/i }).first().click()
  await expect(page.getByText(/THE JACKSON FAMILY/i)).toBeVisible({
    timeout: 10_000,
  })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(400)
  await expect(page).toHaveScreenshot('trips-list.png', { fullPage: true })
})
