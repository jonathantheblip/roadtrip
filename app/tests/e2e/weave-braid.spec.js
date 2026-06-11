// THE WEAVE — on-screen braid acceptance.
//
// Proves the end-to-end slice-1 path:
//   1. Seeds a day's memories (text + voice + photo) onto a past stop.
//   2. Mocks POST /weave → returns {title, opening, closing}.
//   3. Opens the Weave overlay via the TEMP top-bar button.
//   4. Asserts the braid renders each beat kind + the Claude narrative.
//   5. Asserts the "Keep this page" button is functional.
//
// NON-VACUOUS: the mock returns a SPECIFIC title / opening / closing;
// the test asserts those exact strings — if the endpoint were NOT called
// or the component ignored the response the assertions fail.
//
// Clock is stubbed to 2026-05-23 (inside FIXTURE_TRIP's window) so
// selectWeaveDay finds day 1 (isoDate 2026-05-22 ≤ today).

import { test, expect } from './_fixtures/clockStub.js'
import {
  seedTripIntoCache,
  seedMemoriesIntoCache,
  FIXTURE_TRIP,
  TINY_RED_PNG_DATA_URL,
} from './_fixtures/withTrip.js'
import { openTopMenuItem } from './_fixtures/topNav.js'

// Memories on day 1 stop (vb1-3) — mixed kinds, one per author.
// Day 2 (vb2-3, isoDate 2026-05-23 = today) is intentionally empty
// so the selector falls back to day 1.
const DAY1_MEMORIES = [
  {
    id: 'w-mem-1',
    tripId: 'volleyball-2026',
    stopId: 'vb1-3',
    authorTraveler: 'jonathan',
    visibility: 'shared',
    kind: 'text',
    text: 'Wheels down LaGuardia 5:17, three minutes early.',
    createdAt: '2026-05-22T17:00:00.000Z',
  },
  {
    id: 'w-mem-2',
    tripId: 'volleyball-2026',
    stopId: 'vb1-3',
    authorTraveler: 'helen',
    visibility: 'shared',
    kind: 'text',
    text: 'Rafa fell asleep on the couch in his coat before we unpacked.',
    createdAt: '2026-05-22T20:00:00.000Z',
  },
  {
    id: 'w-mem-3',
    tripId: 'volleyball-2026',
    stopId: 'vb1-3',
    authorTraveler: 'aurelia',
    visibility: 'shared',
    kind: 'photo',
    caption: 'this elevator is older than mom',
    photoRef: { url: TINY_RED_PNG_DATA_URL, w: 1, h: 1 },
    createdAt: '2026-05-22T21:00:00.000Z',
  },
  {
    id: 'w-mem-4',
    tripId: 'volleyball-2026',
    stopId: 'vb1-3',
    authorTraveler: 'rafa',
    visibility: 'shared',
    kind: 'voice',
    transcript: 'I want pizza. I want pizza.',
    durationSeconds: 6,
    createdAt: '2026-05-22T22:00:00.000Z',
  },
]

const MOCK_NARRATIVE = {
  title: 'Converging on Murray Hill',
  opening: 'Four roads met in one apartment.',
  closing: 'That was Friday.',
}

async function setup(page) {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await seedMemoriesIntoCache(page, DAY1_MEMORIES)

  // Mock the /weave endpoint — returns the canned narrative.
  await page.route(/workers\.dev\/weave$/, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_NARRATIVE),
    })
  })

  // Default: no pre-made nightly weave for this fixture (the cron hasn't run).
  // GET /weave/latest → 204 makes the on-demand fallback deterministic;
  // slice-3 tests override this with a stored weave.
  await page.route(/workers\.dev\/weave\/latest/, async (route) => {
    await route.fulfill({ status: 204 })
  })
}

async function openWeave(page) {
  // Navigate directly to the trip view — with an active trip seeded the app
  // skips the index and auto-opens the trip, so there's no "Fun @ the Sun"
  // entry to click from the index.
  await page.goto('/?person=jonathan&trip=volleyball-2026&nosw=1')
  await page.getByRole('button', { name: /Weave/i }).first().click()
  await expect(page.getByTestId('the-weave')).toBeVisible()
}

test.describe('TheWeave — braid rendering', () => {
  test('overlay opens and renders the Claude narrative', async ({ page }) => {
    await setup(page)
    await openWeave(page)

    // Narrative title from mock
    await expect(page.getByTestId('weave-title')).toHaveText(MOCK_NARRATIVE.title)
    await expect(page.getByTestId('weave-opening')).toHaveText(MOCK_NARRATIVE.opening)
  })

  test('renders a beat for each author who contributed', async ({ page }) => {
    await setup(page)
    await openWeave(page)

    // Text beats — jonathan + helen both have kind=text
    await expect(page.getByTestId('beat-text').first()).toBeVisible()

    // Photo beat — aurelia
    await expect(page.getByTestId('beat-photo')).toBeVisible()

    // Voice beat — rafa
    await expect(page.getByTestId('beat-voice')).toBeVisible()
  })

  test('Keep this page button toggles to kept state', async ({ page }) => {
    await setup(page)
    await openWeave(page)

    const keepBtn = page.getByTestId('weave-keep')
    await expect(keepBtn).toBeVisible()
    await expect(keepBtn).toContainText('Keep this page')

    await keepBtn.click()
    await expect(keepBtn).toContainText('In the book')
    await expect(keepBtn).toBeDisabled()
  })

  test('back button closes the overlay', async ({ page }) => {
    await setup(page)
    await openWeave(page)

    await page.getByRole('button', { name: 'Close weave' }).click()
    await expect(page.getByTestId('the-weave')).not.toBeVisible()
  })

  test('entry point visible in each persona', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    for (const person of ['jonathan', 'helen', 'aurelia', 'rafa']) {
      await page.goto(`/?person=${person}&trip=volleyball-2026&nosw=1`)
      await expect(
        page.getByRole('button', { name: /Weave/i }).first(),
        `${person} should see the Weave button`
      ).toBeVisible()
    }
  })
})

// ── Slice 2 — Save to Photos ──────────────────────────────────────────

test.describe('TheWeave — save to Photos (slice 2)', () => {
  test('Save button absent when WebCodecs unavailable', async ({ page }) => {
    // Remove VideoEncoder so isVideoEncodeSupported() returns false.
    await page.addInitScript(() => { delete window.VideoEncoder })
    await setup(page)
    await openWeave(page)

    await expect(page.getByTestId('weave-save')).not.toBeAttached()
    await expect(page.getByTestId('weave-save-top')).not.toBeAttached()
  })

  test('Save button triggers encode (mocked Worker) and share (mocked navigator.share)', async ({ page }) => {
    // Mock Worker: immediately returns a fake MP4 blob on flush.
    // Mock navigator.share/canShare: captures the shared files.
    await page.addInitScript(() => {
      const configCalls = []
      class MockWorker {
        constructor() { MockWorker.last = this }
        postMessage(data) {
          if (data.type === 'config') {
            configCalls.push({ width: data.width, height: data.height, audio: data.audio, totalFrames: data.totalFrames })
            setTimeout(() => this.onmessage?.({ data: { type: 'ready' } }), 0)
          } else if (data.type === 'flush') {
            // Return a minimal valid MP4-typed blob.
            const blob = new Blob([new Uint8Array([0, 0, 0, 8, 102, 116, 121, 112])], { type: 'video/mp4' })
            setTimeout(() => this.onmessage?.({ data: { type: 'done', blob, width: data.width || 576, height: data.height || 720 } }), 20)
          }
        }
        terminate() {}
      }
      window.Worker = MockWorker
      window.__weaveWorkerConfigCalls = configCalls

      const sharedFiles = []
      window.__weaveSharedFiles = sharedFiles
      navigator.share = async (shareData) => { sharedFiles.push(...(shareData.files || [])) }
      navigator.canShare = () => true
    })

    await setup(page)
    await openWeave(page)

    // Bottom Save button is present (WebCodecs available — MockWorker provides it).
    const saveBtn = page.getByTestId('weave-save')
    await expect(saveBtn).toBeVisible()

    // Click → encoding starts.
    await saveBtn.click()

    // Modal appears ("Creating your weave…").
    await expect(page.getByText(/Creating your weave/i)).toBeVisible({ timeout: 3000 })

    // After the mock worker resolves, "Saved to Photos" confirmation appears.
    await expect(page.getByText(/Saved to Photos/i)).toBeVisible({ timeout: 15_000 })

    // Worker was configured with correct dimensions (576×720, no audio).
    const configs = await page.evaluate(() => window.__weaveWorkerConfigCalls)
    expect(configs.length).toBeGreaterThan(0)
    expect(configs[0].width).toBe(576)
    expect(configs[0].height).toBe(720)
    expect(configs[0].audio).toBeUndefined()
    expect(configs[0].totalFrames).toBe(150)

    // navigator.share was called with a video/mp4 File.
    const fileType = await page.evaluate(() => window.__weaveSharedFiles[0]?.type)
    expect(fileType).toBe('video/mp4')
  })
})

// ── Slice 3 — pre-made nightly weave + "ready" cue ───────────────────

const STORED_WEAVE = {
  tripId: 'volleyball-2026',
  dayIso: '2026-05-22',
  title: 'Pre-Woven Friday',
  opening: 'The night was already written before anyone woke.',
  closing: 'Saved while you slept.',
  stat: 'Day 1 · 3 stops',
  generatedAt: 1717700000000,
}

async function mockStoredWeave(page, weave) {
  await page.route(/workers\.dev\/weave\/latest/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(weave),
    })
  })
}

test.describe('TheWeave — pre-made nightly weave (slice 3)', () => {
  test('renders the stored weave instantly, with NO on-demand POST /weave', async ({ page }) => {
    await setup(page)
    // Track whether the on-demand narrative endpoint gets hit (it must not).
    let postWeaveCalled = false
    await page.route(/workers\.dev\/weave$/, async (route) => {
      if (route.request().method() === 'POST') postWeaveCalled = true
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_NARRATIVE),
      })
    })
    await mockStoredWeave(page, STORED_WEAVE)
    await openWeave(page)

    // The stored narrative renders — NOT the on-demand MOCK_NARRATIVE.
    await expect(page.getByTestId('weave-title')).toHaveText(STORED_WEAVE.title)
    await expect(page.getByTestId('weave-opening')).toHaveText(STORED_WEAVE.opening)
    expect(postWeaveCalled).toBe(false)
  })

  test('falls back to the on-demand weave when nothing is pre-made (204)', async ({ page }) => {
    // setup() already mocks /weave/latest → 204 and POST /weave → MOCK_NARRATIVE.
    await setup(page)
    await openWeave(page)
    await expect(page.getByTestId('weave-title')).toHaveText(MOCK_NARRATIVE.title)
  })

  test('shows the ✦ ready cue for a fresh weave and clears it after opening', async ({ page }) => {
    await setup(page)
    await mockStoredWeave(page, STORED_WEAVE)
    await page.goto('/?person=jonathan&trip=volleyball-2026&nosw=1')

    // Cue appears once the stored weave (newer than never-seen) is fetched.
    await expect(page.getByTestId('weave-ready-dot')).toBeVisible()

    // Opening it marks it seen.
    await page.getByRole('button', { name: /Weave/i }).first().click()
    await expect(page.getByTestId('the-weave')).toBeVisible()

    // Back on the trip view, the cue is gone.
    await page.getByRole('button', { name: 'Close weave' }).click()
    await expect(page.getByTestId('weave-ready-dot')).not.toBeVisible()
  })

  test('no ready cue when nothing is pre-made', async ({ page }) => {
    await setup(page) // /weave/latest → 204
    await page.goto('/?person=jonathan&trip=volleyball-2026&nosw=1')
    // The ✦ entry is present, but with no stored weave the cue dot never shows.
    await expect(page.getByRole('button', { name: /Weave/i }).first()).toBeVisible()
    await expect(page.getByTestId('weave-ready-dot')).toHaveCount(0)
  })
})

// ── Slice 3, part 2 — the little book (keep + book view) ─────────────

async function mockBook(page, pages) {
  await page.route(/workers\.dev\/weave\/book/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tripId: 'volleyball-2026', pages }),
    })
  })
}

const KEPT_PAGE = {
  tripId: 'volleyball-2026',
  dayIso: '2026-05-22', // FIXTURE_TRIP day 1 (has the seeded memories)
  title: 'Kept Friday',
  opening: 'Four roads met in one apartment.',
  closing: 'That was Friday.',
  stat: 'Day 1 · 3 stops',
  generatedAt: 1,
  keptAt: 2,
}

test.describe('TheWeave — the little book (slice 3, part 2)', () => {
  test('Keep this page persists to the shared book (POST /weave/keep)', async ({ page }) => {
    await setup(page)
    let keepBody = null
    await page.route(/workers\.dev\/weave\/keep/, async (route) => {
      keepBody = route.request().postDataJSON()
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    })
    await openWeave(page)

    const keepBtn = page.getByTestId('weave-keep')
    await keepBtn.click()
    await expect(keepBtn).toContainText('In the book')

    // The keep was persisted with the day + narrative (NON-VACUOUS). Day 2
    // (today, 2026-05-23) is empty, so selectWeaveDay falls back to day 1.
    await expect.poll(() => keepBody?.dayIso).toBe('2026-05-22')
    expect(keepBody.title).toBe(MOCK_NARRATIVE.title)
  })

  test('the ❏ Book entry appears, lists kept pages, and opens one', async ({ page }) => {
    await setup(page)
    await mockBook(page, [KEPT_PAGE])
    await page.goto('/?person=jonathan&trip=volleyball-2026&nosw=1')

    // The Book entry lives in the ⋯ overflow menu now.
    await page.getByRole('button', { name: 'More' }).click()
    const bookItem = page.getByRole('menuitem', { name: /the book/i })
    await expect(bookItem).toBeVisible()
    await bookItem.click()

    await expect(page.getByTestId('weave-book')).toBeVisible()
    const bookPages = page.getByTestId('weave-book-page')
    await expect(bookPages).toHaveCount(1)
    await expect(bookPages.first()).toContainText('Kept Friday')

    // Opening a page renders the full weave for that day.
    await bookPages.first().click()
    await expect(page.getByTestId('the-weave')).toBeVisible()
  })

  test('no ❏ Book entry when the trip has no kept pages', async ({ page }) => {
    await setup(page)
    await mockBook(page, []) // empty book
    await page.goto('/?person=jonathan&trip=volleyball-2026&nosw=1')
    await expect(page.getByRole('button', { name: /Weave/i }).first()).toBeVisible()
    // Open the ⋯ menu — with no kept pages there's no Book item in it.
    await page.getByRole('button', { name: 'More' }).click()
    await expect(page.getByRole('menuitem', { name: /the book/i })).toHaveCount(0)
  })

  test('Save the book stitches the kept days into one video and shares it', async ({ page }) => {
    // Mock the encode worker (capture config) + navigator.share (capture file).
    await page.addInitScript(() => {
      const configCalls = []
      class MockWorker {
        constructor() { MockWorker.last = this }
        postMessage(data) {
          if (data.type === 'config') {
            configCalls.push({ width: data.width, height: data.height, audio: data.audio, totalFrames: data.totalFrames })
            setTimeout(() => this.onmessage?.({ data: { type: 'ready' } }), 0)
          } else if (data.type === 'flush') {
            const blob = new Blob([new Uint8Array([0, 0, 0, 8, 102, 116, 121, 112])], { type: 'video/mp4' })
            setTimeout(() => this.onmessage?.({ data: { type: 'done', blob } }), 20)
          }
        }
        terminate() {}
      }
      window.Worker = MockWorker
      window.__weaveBookConfigCalls = configCalls
      const sharedFiles = []
      window.__weaveBookSharedFiles = sharedFiles
      navigator.share = async (d) => { sharedFiles.push(...(d.files || [])) }
      navigator.canShare = () => true
    })

    await setup(page)
    // Two renderable days: day 1 (DAY1_MEMORIES on vb1-3) + a day-2 memory.
    await seedMemoriesIntoCache(page, [
      ...DAY1_MEMORIES,
      {
        id: 'w-mem-d2', tripId: 'volleyball-2026', stopId: 'vb2-3',
        authorTraveler: 'jonathan', visibility: 'shared', kind: 'text',
        text: 'Second day on the road.', createdAt: '2026-05-23T18:00:00.000Z',
      },
    ])
    await mockBook(page, [
      { ...KEPT_PAGE, dayIso: '2026-05-22', title: 'Day One' },
      { ...KEPT_PAGE, dayIso: '2026-05-23', title: 'Day Two' },
    ])
    await page.goto('/?person=jonathan&trip=volleyball-2026&nosw=1')
    await openTopMenuItem(page, /the book/i)
    await expect(page.getByTestId('weave-book')).toBeVisible()

    await page.getByTestId('weave-book-save').click()
    await expect(page.getByText(/Saved to Photos/i)).toBeVisible({ timeout: 15_000 })

    // Two kept days → one video of 2 × 150 frames, 576×720, no audio.
    const cfg = await page.evaluate(() => window.__weaveBookConfigCalls)
    expect(cfg.length).toBeGreaterThan(0)
    expect(cfg[0].width).toBe(576)
    expect(cfg[0].height).toBe(720)
    expect(cfg[0].audio).toBeUndefined()
    expect(cfg[0].totalFrames).toBe(300)

    const fileType = await page.evaluate(() => window.__weaveBookSharedFiles[0]?.type)
    expect(fileType).toBe('video/mp4')
  })
})
