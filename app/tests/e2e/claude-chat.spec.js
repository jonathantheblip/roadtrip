import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'
import { resolvePersona } from './_fixtures/persona.js'

// Honors RT_PERSONA (Phase 2 build-list item 1); defaults to 'helen' when
// unset so existing runs stay byte-identical to before. PERSONA_NAME is the
// capitalized form the app greets with ("Hi {Name}." — ClaudeChat.jsx:1172).
const PERSONA = resolvePersona('helen')
const PERSONA_NAME = PERSONA.charAt(0).toUpperCase() + PERSONA.slice(1)

// Claude-in-App M1 — chat surface acceptance. Covers:
//   1. Empty state on the trips index (no trip context)
//   2. In-trip entry button opens the panel with trip eyebrow
//   3. Send a message → user bubble renders → mocked SSE streams text
//      → assistant bubble renders the full text
//   4. Close + reopen → past-conversations list shows the prior chat
//   5. User-facing error string when /claude/chat fails
//
// The Worker is mocked end-to-end: /claude/conversations (list +
// create), /claude/conversations/:id/messages, and /claude/chat
// (synthetic SSE body) so the test never burns Anthropic budget.

const SHOT_DIR = 'tests/e2e/screenshots'

function sseFrames(...frames) {
  return frames
    .map((f) => `data: ${JSON.stringify(f)}\n\n`)
    .join('')
}

// Install Claude-specific routes on top of the seedTripIntoCache
// catch-all. Returns a counter the test can read to assert how many
// times each endpoint was called.
async function mockClaudeWorker(page, opts = {}) {
  const state = {
    conversations: opts.initialConversations || [],
    chats: 0,
    listCalls: 0,
    historyCalls: 0,
    lastChatBody: null,
  }

  await page.route(
    /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/claude\/conversations(\?|$)/,
    async (route) => {
      const req = route.request()
      if (req.method() === 'GET') {
        state.listCalls += 1
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(state.conversations),
        })
        return
      }
      if (req.method() === 'POST') {
        const body = JSON.parse(req.postData() || '{}')
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: body.id || 'c-test',
            user_id: body.user_id,
            trip_id: body.trip_id || null,
          }),
        })
        return
      }
      await route.fulfill({ status: 404 })
    }
  )

  await page.route(
    /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/claude\/conversations\/[^/]+\/messages$/,
    async (route) => {
      state.historyCalls += 1
      // The Worker returns the full message history; this mock just
      // replays whatever the test prepared.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(opts.historyResponse || []),
      })
    }
  )

  await page.route(
    /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/claude\/chat$/,
    async (route) => {
      state.chats += 1
      state.lastChatBody = JSON.parse(route.request().postData() || '{}')
      if (opts.chatError) {
        await route.fulfill({ status: 500, body: '{"error":"mocked failure"}' })
        return
      }
      const text = opts.chatText || 'Saturday is Court 3 at Mohegan. Pool play starts at 9 AM.'
      // Chunk the text to mimic streaming. The client merges chunks.
      const chunks = []
      for (let i = 0; i < text.length; i += 8) {
        chunks.push({ type: 'text_delta', text: text.slice(i, i + 8) })
      }
      chunks.push({ type: 'done', usage: { input_tokens: 120, output_tokens: 40 } })
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body: sseFrames(...chunks),
      })
    }
  )

  return state
}

test.describe('Claude-in-App M1', () => {
  test('floating entry on the trips index opens panel without trip context', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await mockClaudeWorker(page)
    // Force the trips index by clearing the active-trip query so
    // pickActiveTrip lands nowhere — but the seeded fixture is
    // "today's" trip, so we navigate explicitly to index.
    await page.goto(`/?person=${PERSONA}&nosw=1`)
    // Land on trip view (today's). Then go back to the trips index.
    // The fixed top bar's back button shows "← Trips" (mixed case in
    // the DOM; uppercase only via CSS). Match case-insensitively or
    // the click silently misses and the test hangs on the next
    // assertion.
    await page.getByRole('button', { name: /trips/i }).first().click()
    // Wait for the trips index — the floating "Plan with Claude" entry
    // only renders here, never on the trip view.
    await expect(page.getByRole('button', { name: /Plan with Claude/i })).toBeVisible()

    await page.getByRole('button', { name: /Plan with Claude/i }).click()
    // Panel header — no trip eyebrow when opened from the index.
    await expect(page.getByRole('dialog', { name: /Chat with Claude/i })).toBeVisible()
    const dialog = page.getByRole('dialog', { name: /Chat with Claude/i })
    await expect(dialog.getByText(new RegExp(`Hi ${PERSONA_NAME}\\.`, 'i'))).toBeVisible()
    await expect(dialog.getByText(/help you think through a trip/i)).toBeVisible()
    // The trip-loaded subtitle is the one we DON'T want here.
    await expect(dialog.getByText(/I have .* loaded/i)).toHaveCount(0)
  })

  test('in-trip entry opens panel with trip eyebrow + sends and renders streamed reply', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    const state = await mockClaudeWorker(page, {
      chatText: 'Saturday is Court 3 at Mohegan. Pool play starts at 9 AM.',
    })
    await page.goto(`/?person=${PERSONA}&trip=volleyball-2026&nosw=1`)

    // Top-bar in-header entry.
    await page.getByRole('button', { name: /Modify this trip with Claude/i }).click()
    const dialog = page.getByRole('dialog', { name: /Chat with Claude/i })
    await expect(dialog).toBeVisible()
    // The trip name appears twice in the panel — once in the header
    // eyebrow and once in the empty-state subtitle ("I have ... loaded").
    // Either presence is enough; the empty-state copy is the canonical
    // signal that the panel grabbed the right trip's context.
    await expect(dialog.getByText(/I have Fun @ the Sun loaded/i)).toBeVisible()

    // Send a message.
    await dialog.getByRole('textbox', { name: /Message Claude/i }).fill(
      "What was Saturday's volleyball schedule?"
    )
    await dialog.getByRole('button', { name: /Send message/i }).click()

    // User bubble lands immediately.
    await expect(dialog.getByText(/What was Saturday's volleyball schedule\?/)).toBeVisible()

    // Assistant bubble appears with the streamed reply.
    await expect(
      dialog.getByText(/Saturday is Court 3 at Mohegan\. Pool play starts at 9 AM\./)
    ).toBeVisible({ timeout: 5000 })

    // Worker received the right shape — conversation_id + trip_id.
    expect(state.chats).toBe(1)
    expect(state.lastChatBody.trip_id).toBe('volleyball-2026')
    expect(state.lastChatBody.user_id).toBe(PERSONA)
    expect(state.lastChatBody.message).toContain('Saturday')

    await page.screenshot({
      path: `${SHOT_DIR}/m1-claude-chat-stream.png`,
      fullPage: true,
    })
  })

  test('close + reopen surfaces past-conversation list', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    const state = await mockClaudeWorker(page, {
      chatText: 'Yes — pool play opens at 9 AM Saturday on Court 3.',
      initialConversations: [],
    })
    await page.goto(`/?person=${PERSONA}&trip=volleyball-2026&nosw=1`)
    await page.getByRole('button', { name: /Modify this trip with Claude/i }).click()
    const dialog = page.getByRole('dialog', { name: /Chat with Claude/i })

    await dialog.getByRole('textbox', { name: /Message Claude/i }).fill(
      'Walk me through Saturday'
    )
    await dialog.getByRole('button', { name: /Send message/i }).click()
    await expect(dialog.getByText(/pool play opens at 9 AM/i)).toBeVisible({ timeout: 5000 })

    // Mutate the mock state so the next list call returns the conversation
    // we just had. (Real Worker would have written this when /claude/chat
    // upserted the row.)
    state.conversations = [
      {
        id: state.lastChatBody.conversation_id,
        user_id: PERSONA,
        trip_id: 'volleyball-2026',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        preview: 'Walk me through Saturday',
      },
    ]

    // Close the panel, then reopen.
    await dialog.getByRole('button', { name: /^Close$/i }).click()
    await expect(dialog).toBeHidden()
    await page.getByRole('button', { name: /Modify this trip with Claude/i }).click()
    const dialog2 = page.getByRole('dialog', { name: /Chat with Claude/i })
    await expect(dialog2.getByText(/Past conversations/i)).toBeVisible()
    await expect(dialog2.getByText(/Walk me through Saturday/i)).toBeVisible()

    await page.screenshot({
      path: `${SHOT_DIR}/m1-claude-past-conversations.png`,
      fullPage: true,
    })
  })

  test('failed chat surfaces Helen-readable error string, not technical detail', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await mockClaudeWorker(page, { chatError: true })
    await page.goto(`/?person=${PERSONA}&trip=volleyball-2026&nosw=1`)
    await page.getByRole('button', { name: /Modify this trip with Claude/i }).click()
    const dialog = page.getByRole('dialog', { name: /Chat with Claude/i })
    await dialog.getByRole('textbox', { name: /Message Claude/i }).fill('hi')
    await dialog.getByRole('button', { name: /Send message/i }).click()

    // The exact Helen-readable error string. No "500", no "fetch", no
    // raw error.toString anywhere visible.
    await expect(
      dialog.getByText(/Something went wrong on my end\. Try again, or rephrase what you were asking\./)
    ).toBeVisible({ timeout: 5000 })
    await expect(dialog.getByText(/500|error|fetch|stack/i)).toHaveCount(0)
  })
})
