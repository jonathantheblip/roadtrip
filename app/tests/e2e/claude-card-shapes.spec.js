import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'

// Claude-in-App M2 — the remaining three card shapes wired end-to-end:
//   • MOVE   — in-place edit of an existing stop, target.stopId required
//   • CANCEL — destructive remove, oxblood framing, "Keep it" backout
//   • MULTI  — batch of sub-edits; one Save commits all non-skipped rows
//
// Companion to claude-card-add.spec.js (the ADD shape from chunk 1).
// Re-uses the same mocked SSE pattern: the Worker is stubbed end-to-end
// so the test never burns Anthropic budget. The fixture trip has stops
// `vb1-3` (Day 1 lodging), `vb2-3` (Day 2 match), `vb3-4` (Day 3 match)
// — the move/cancel cards target these by stopId.

const SHOT_DIR = 'tests/e2e/screenshots'

function sseFrames(...frames) {
  return frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('')
}

function mockChat(page, replyText) {
  const state = { chats: 0, lastChatBody: null }
  page.route(
    /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/claude\/conversations(\?|$)/,
    async (route) => {
      const req = route.request()
      if (req.method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
        return
      }
      const body = JSON.parse(req.postData() || '{}')
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: body.id || 'c-shapes', user_id: body.user_id, trip_id: body.trip_id || null }),
      })
    }
  )
  page.route(
    /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/claude\/conversations\/[^/]+\/messages$/,
    async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    }
  )
  page.route(
    /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/claude\/chat$/,
    async (route) => {
      state.chats += 1
      state.lastChatBody = JSON.parse(route.request().postData() || '{}')
      const text = replyText
      const chunks = []
      for (let i = 0; i < text.length; i += 16) {
        chunks.push({ type: 'text_delta', text: text.slice(i, i + 16) })
      }
      chunks.push({ type: 'done', usage: { input_tokens: 50, output_tokens: 200 } })
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body: sseFrames(...chunks),
      })
    }
  )
  return state
}

function replyWithCard(card, leadText, tailText) {
  return [
    leadText || 'On it.',
    '',
    '```card',
    JSON.stringify(card, null, 2),
    '```',
    tailText ? `\n${tailText}` : '',
  ].join('\n')
}

async function openInTripChat(page) {
  await page.getByRole('button', { name: /Modify this trip with Claude/i }).click()
  const dialog = page.getByRole('dialog', { name: /Chat with Claude/i })
  await expect(dialog).toBeVisible()
  return dialog
}

async function sendMessage(dialog, text) {
  await dialog.getByRole('textbox', { name: /Message Claude/i }).fill(text)
  await dialog.getByRole('button', { name: /Send message/i }).click()
}

async function readCachedTrip(page) {
  return page.evaluate(() => {
    const all = JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]')
    return all.find((t) => t.id === 'volleyball-2026') || null
  })
}

test.describe('Claude-in-App M2 — MOVE card', () => {
  test('renames + retimes the Day 2 match in place via target.stopId', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    mockChat(
      page,
      replyWithCard(
        {
          action: 'move',
          id: 'c-move-match',
          eyebrow: 'DAY 2 · SAT MAY 23',
          title: 'Match moved to 3:00 PM, court 3',
          fields: [
            { name: 'time', label: 'Time', value: '3:00 PM', previousValue: '3:45 PM', editable: true },
            { name: 'address', label: 'Address', value: 'Court 3, Mohegan Sun', previousValue: 'Court 1, Mohegan Sun', editable: true },
            { name: 'name', label: 'Name', value: 'vs BEV 13 Empire', editable: true },
          ],
          target: { tripId: 'volleyball-2026', stopId: 'vb2-3', dayN: 2 },
          note: 'Schedule update from the tournament desk.',
        },
        "Moved. That's the only Saturday match affected."
      )
    )
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    const dialog = await openInTripChat(page)
    await sendMessage(dialog, "Aurelia's match is at 3pm on court 3")

    const card = dialog.getByTestId('confirm-card-move')
    await expect(card).toBeVisible({ timeout: 5000 })
    await expect(card.getByText(/Match moved to 3:00 PM, court 3/)).toBeVisible()
    // Diff renders: old strikethrough + new value
    await expect(card.getByText(/3:45 PM/)).toBeVisible()

    await card.getByRole('button', { name: /^Save$/i }).click()
    await expect(dialog.getByTestId('confirm-card-saved')).toBeVisible({ timeout: 3000 })

    const trip = await readCachedTrip(page)
    const day2 = trip.days.find((d) => d.n === 2)
    const match = day2.stops.find((s) => s.id === 'vb2-3')
    expect(match.time).toBe('3:00 PM')
    expect(match.address).toBe('Court 3, Mohegan Sun')
    expect(match.claudeMeta?.cardId).toBe('c-move-match')

    await page.screenshot({ path: `${SHOT_DIR}/m2-card-move-saved.png`, fullPage: true })
  })
})

test.describe('Claude-in-App M2 — CANCEL card', () => {
  test('removes the Day 3 match from its day with oxblood-framed confirm', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    mockChat(
      page,
      replyWithCard(
        {
          action: 'cancel',
          id: 'c-cancel-sun-match',
          title: 'Remove Sunday match',
          subtitle: 'Match 1 vs Northeast 13.2 · 4:00 PM · Court 3',
          warning: "Aurelia's team is registered — pulling out won't notify the league. You'd email the tournament director separately.",
          target: { tripId: 'volleyball-2026', stopId: 'vb3-4' },
        },
        'Got it.'
      )
    )
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    const dialog = await openInTripChat(page)
    await sendMessage(dialog, "Cancel Sunday's match — Aurelia's not feeling well")

    const card = dialog.getByTestId('confirm-card-cancel')
    await expect(card).toBeVisible({ timeout: 5000 })
    await expect(card.getByText(/Remove Sunday match/)).toBeVisible()
    await expect(card.getByText(/won't notify the league/)).toBeVisible()
    // Two-button destructive layout: "Cancel stop" + "Keep it" present.
    await expect(card.getByTestId('confirm-card-save')).toBeVisible()
    await expect(card.getByRole('button', { name: /Keep it/i })).toBeVisible()

    await page.screenshot({ path: `${SHOT_DIR}/m2-card-cancel-live.png`, fullPage: true })

    await card.getByTestId('confirm-card-save').click()
    await expect(dialog.getByTestId('confirm-card-saved')).toBeVisible({ timeout: 3000 })

    const trip = await readCachedTrip(page)
    const day3 = trip.days.find((d) => d.n === 3)
    expect(day3.stops.find((s) => s.id === 'vb3-4')).toBeUndefined()
    expect(day3.stops.length).toBe(0)
  })

  test('"Keep it" backs out without mutating the trip', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    mockChat(
      page,
      replyWithCard(
        {
          action: 'cancel',
          id: 'c-cancel-backout',
          title: 'Remove the lodging',
          subtitle: 'Beach Bungalow · Evening',
          target: { tripId: 'volleyball-2026', stopId: 'vb1-3' },
        },
        ''
      )
    )
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    const dialog = await openInTripChat(page)
    await sendMessage(dialog, 'actually cancel the Beach Bungalow')

    const card = dialog.getByTestId('confirm-card-cancel')
    await expect(card).toBeVisible({ timeout: 5000 })
    await card.getByRole('button', { name: /Keep it/i }).click()
    // Card unmounts; no saved confirmation shown.
    await expect(dialog.getByTestId('confirm-card-cancel')).toHaveCount(0)
    await expect(dialog.getByTestId('confirm-card-saved')).toHaveCount(0)

    const trip = await readCachedTrip(page)
    const day1 = trip.days.find((d) => d.n === 1)
    expect(day1.stops.find((s) => s.id === 'vb1-3')).toBeTruthy()
  })
})

test.describe('Claude-in-App M2 — MULTI card', () => {
  test('batched move + cancel applies both, "Skip" excludes one row', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    mockChat(
      page,
      replyWithCard(
        {
          action: 'multi',
          id: 'c-multi-sat',
          eyebrow: 'SAT MAY 23',
          title: 'Two changes batched',
          edits: [
            {
              action: 'move',
              title: 'Saturday match',
              from: '3:45 PM',
              to: '11:00 AM',
              target: { tripId: 'volleyball-2026', stopId: 'vb2-3' },
              fields: [
                { name: 'time', label: 'Time', value: '11:00 AM', previousValue: '3:45 PM' },
              ],
            },
            {
              action: 'cancel',
              title: 'Sunday match',
              note: 'Cleared so we can drive home.',
              target: { tripId: 'volleyball-2026', stopId: 'vb3-4' },
            },
          ],
          target: { tripId: 'volleyball-2026' },
          note: 'Both changes ride one Save.',
        },
        'Two changes drafted. Save all or skip the ones you want to keep.'
      )
    )
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    const dialog = await openInTripChat(page)
    await sendMessage(dialog, 'pull saturday up to 11am and cut sunday')

    const card = dialog.getByTestId('confirm-card-multi')
    await expect(card).toBeVisible({ timeout: 5000 })
    await expect(card.getByText(/Saturday match/)).toBeVisible()
    await expect(card.getByText(/Sunday match/)).toBeVisible()
    // The save label reflects all rows live.
    await expect(card.getByRole('button', { name: /Save all 2/i })).toBeVisible()

    await page.screenshot({ path: `${SHOT_DIR}/m2-card-multi-live.png`, fullPage: true })

    // Skip the cancel row — save count drops, only the move commits.
    const cancelRow = card.locator('div', { hasText: /Sunday match/ }).first()
    await cancelRow.getByRole('button', { name: /^Skip$/i }).click()
    await expect(card.getByRole('button', { name: /Save 1/i })).toBeVisible()

    await card.getByRole('button', { name: /Save 1/i }).click()
    await expect(dialog.getByTestId('confirm-card-saved')).toBeVisible({ timeout: 3000 })

    const trip = await readCachedTrip(page)
    const day2 = trip.days.find((d) => d.n === 2)
    const day3 = trip.days.find((d) => d.n === 3)
    expect(day2.stops.find((s) => s.id === 'vb2-3').time).toBe('11:00 AM')
    // The skipped cancel did NOT run — vb3-4 is still on Day 3.
    expect(day3.stops.find((s) => s.id === 'vb3-4')).toBeTruthy()
  })

  test('batched changes all apply when none are skipped', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    mockChat(
      page,
      replyWithCard(
        {
          action: 'multi',
          id: 'c-multi-saveall',
          eyebrow: 'WEEKEND',
          title: 'Two retimes',
          edits: [
            {
              action: 'move',
              title: 'Saturday match',
              from: '3:45 PM',
              to: '10:00 AM',
              target: { tripId: 'volleyball-2026', stopId: 'vb2-3' },
              fields: [{ name: 'time', label: 'Time', value: '10:00 AM', previousValue: '3:45 PM' }],
            },
            {
              action: 'move',
              title: 'Sunday match',
              from: '4:00 PM',
              to: '2:00 PM',
              target: { tripId: 'volleyball-2026', stopId: 'vb3-4' },
              fields: [{ name: 'time', label: 'Time', value: '2:00 PM', previousValue: '4:00 PM' }],
            },
          ],
          target: { tripId: 'volleyball-2026' },
        },
        ''
      )
    )
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    const dialog = await openInTripChat(page)
    await sendMessage(dialog, 'pull both matches earlier')

    const card = dialog.getByTestId('confirm-card-multi')
    await expect(card).toBeVisible({ timeout: 5000 })
    await card.getByRole('button', { name: /Save all 2/i }).click()
    await expect(dialog.getByTestId('confirm-card-saved')).toBeVisible({ timeout: 3000 })

    const trip = await readCachedTrip(page)
    expect(trip.days.find((d) => d.n === 2).stops.find((s) => s.id === 'vb2-3').time).toBe('10:00 AM')
    expect(trip.days.find((d) => d.n === 3).stops.find((s) => s.id === 'vb3-4').time).toBe('2:00 PM')
  })
})
