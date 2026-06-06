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
}

async function openWeave(page) {
  // Navigate directly to the trip view — with an active trip seeded the app
  // skips the index and auto-opens the trip, so there's no "Fun @ the Sun"
  // entry to click from the index.
  await page.goto('/?person=jonathan&trip=volleyball-2026&nosw=1')
  await page.getByRole('button', { name: /Weave/i }).click()
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
        page.getByRole('button', { name: /Weave/i }),
        `${person} should see the Weave button`
      ).toBeVisible()
    }
  })
})
