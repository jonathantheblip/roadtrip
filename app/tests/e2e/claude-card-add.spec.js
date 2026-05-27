import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'

// Claude-in-App M2 — ADD card end-to-end (first wired shape per the
// kickoff carryover §10.3). Covers:
//   1. The mocked SSE reply contains a fenced ```card block
//   2. The bubble renders the ConfirmCard inline (not the raw JSON)
//   3. Save commits via tripsApi.upsertTrip → the trip's day-3 stops
//      gains a new stop with the card's fields applied
//   4. The card surface flips to its "Added" saved-note after the commit
//
// The Worker is mocked end-to-end — the test never burns Anthropic
// budget. Both /claude/conversations endpoints + /claude/chat are
// stubbed; /trips (the worker write target for upsertTrip) catches the
// push from the seedTripIntoCache catch-all and 404s silently, leaving
// the local cache + state as the canonical surface to assert against.

const SHOT_DIR = 'tests/e2e/screenshots'

function sseFrames(...frames) {
  return frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('')
}

const ADD_CARD = {
  action: 'add',
  id: 'c-sift-add-test',
  eyebrow: 'DAY 3 · SUN MAY 24',
  title: 'Sift Bake Shop',
  fields: [
    { name: 'time', label: 'Time', value: '8:00 AM', editable: true },
    { name: 'address', label: 'Address', value: '5 Water St, Mystic CT', editable: true },
    { name: 'kind', label: 'Kind', value: 'breakfast', editable: true },
  ],
  target: {
    tripId: 'volleyball-2026',
    dayN: 3,
    position: 'end',
  },
  note: 'Open Sun · 7 AM – 5 PM (verified).',
}

const CHAT_REPLY = [
  'Drafted. 8 AM stop in Mystic — fits before the arena.',
  '',
  '```card',
  JSON.stringify(ADD_CARD, null, 2),
  '```',
  '',
  'Tap save when you are ready.',
].join('\n')

async function mockClaudeWorker(page, opts = {}) {
  const state = { chats: 0, lastChatBody: null }
  await page.route(
    /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/claude\/conversations(\?|$)/,
    async (route) => {
      const req = route.request()
      if (req.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: '[]',
        })
        return
      }
      const body = JSON.parse(req.postData() || '{}')
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: body.id || 'c-m2-test',
          user_id: body.user_id,
          trip_id: body.trip_id || null,
        }),
      })
    }
  )
  await page.route(
    /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/claude\/conversations\/[^/]+\/messages$/,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '[]',
      })
    }
  )
  await page.route(
    /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/claude\/chat$/,
    async (route) => {
      state.chats += 1
      state.lastChatBody = JSON.parse(route.request().postData() || '{}')
      const text = opts.chatText || CHAT_REPLY
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

test.describe('Claude-in-App M2 — ADD card', () => {
  test('renders ConfirmCard inline, Save commits a new stop to Day 3', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    const state = await mockClaudeWorker(page)
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')

    // Open the in-trip chat.
    await page.getByRole('button', { name: /Modify this trip with Claude/i }).click()
    const dialog = page.getByRole('dialog', { name: /Chat with Claude/i })
    await expect(dialog).toBeVisible()

    // Send a message that lands in EXECUTE mode.
    await dialog.getByRole('textbox', { name: /Message Claude/i }).fill(
      'add sift bake shop sunday morning'
    )
    await dialog.getByRole('button', { name: /Send message/i }).click()
    await expect(dialog.getByText(/add sift bake shop sunday morning/i)).toBeVisible()

    // Streamed reply lands → ConfirmCard appears inline (not the raw JSON).
    const card = dialog.getByTestId('confirm-card-add')
    await expect(card).toBeVisible({ timeout: 5000 })
    await expect(card.getByText(/Sift Bake Shop/)).toBeVisible()
    await expect(card.getByText(/DAY 3 · SUN MAY 24/i)).toBeVisible()
    // The raw card-JSON text should NOT be visible to the reader.
    await expect(dialog.getByText(/"action":\s*"add"/)).toHaveCount(0)

    // Capture the live-card visual baseline.
    await page.screenshot({
      path: `${SHOT_DIR}/m2-card-add-live.png`,
      fullPage: true,
    })

    // Save → the card's "Save" button commits via tripsApi.upsertTrip.
    await card.getByRole('button', { name: /^Save$/i }).click()

    // Saved confirmation surfaces in-place of the live card.
    await expect(dialog.getByTestId('confirm-card-saved')).toBeVisible({ timeout: 3000 })
    await expect(dialog.getByTestId('confirm-card-saved').getByText(/Sift Bake Shop/)).toBeVisible()

    // Cache reflects the new stop on Day 3.
    const cached = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]')
    })
    const trip = cached.find((t) => t.id === 'volleyball-2026')
    expect(trip).toBeTruthy()
    const day3 = trip.days.find((d) => d.n === 3)
    expect(day3).toBeTruthy()
    const added = day3.stops.find((s) => s.name === 'Sift Bake Shop')
    expect(added).toBeTruthy()
    expect(added.time).toBe('8:00 AM')
    expect(added.address).toBe('5 Water St, Mystic CT')
    expect(added.kind).toBe('breakfast')
    expect(added.source).toBe('claude')
    expect(added.claudeMeta?.cardId).toBe('c-sift-add-test')

    // Worker received the message with the right context.
    expect(state.chats).toBe(1)
    expect(state.lastChatBody.trip_id).toBe('volleyball-2026')
    expect(state.lastChatBody.user_id).toBe('helen')

    await page.screenshot({
      path: `${SHOT_DIR}/m2-card-add-saved.png`,
      fullPage: true,
    })
  })
})
