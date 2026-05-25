// Shared mock-route helpers for Playwright tests.
//
// Previously each spec installed its own version of these handlers
// (mockSuccessfulUpload in photos-dispatch, mockWorker in share-in,
// mockClaudeWorker in claude-chat). Hoisting them here means every
// Item A.3 journey + the existing specs can use one source of truth
// — when the Worker endpoint shape changes, one update covers all
// callers.
//
// Each helper installs its own Playwright route. They compose
// cleanly because Playwright applies the most-recently-registered
// route to any matching request, falling through to the catch-all
// in withTrip.js otherwise.

// Capture every successful upload's body + headers so tests can
// assert what was sent. Returns the array (mutated as uploads fire).
export async function mockSuccessfulUpload(page) {
  const uploads = []
  await page.route(
    /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/assets\/(?:photo|video)/,
    async (route) => {
      const req = route.request()
      const body = req.postDataBuffer()
      const mime = (await req.headerValue('content-type')) || ''
      const url = new URL(req.url())
      const kind = url.pathname.match(/\/assets\/(photo|video)\//)?.[1] || 'photo'
      uploads.push({
        kind,
        mime,
        byteLength: body ? body.length : 0,
      })
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          key: `helen/test/${kind}-mock-${uploads.length}`,
          url: `https://example.test/${kind}-mock-${uploads.length}`,
          mime: kind === 'video' ? 'video/mp4' : 'image/jpeg',
        }),
      })
    }
  )
  // Memories POST: just 200 so saveMemory's mirror call doesn't fail.
  await page.route(
    /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/memories$/,
    (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  )
  return uploads
}

// Mock the Share-In Worker endpoints (/resolve and /draft).
// Passes through the resolve URL unchanged (so the client's parser
// sees the same form it gets in prod for already-long-form URLs).
// Returns a draft tied to the family voices.
export async function mockShareInWorker(page, opts = {}) {
  await page.route(
    /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/resolve/,
    (route) => {
      const url = new URL(route.request().url())
      const target = url.searchParams.get('url') || ''
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ resolved: target, hops: 1 }),
      })
    }
  )
  await page.route(
    /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/draft/,
    (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          opts.draftResponse || {
            tags: ['helen', 'jonathan'],
            descriptions: {
              helen: 'A linen-and-Fraunces corner spot — light bouncing off the harbor.',
              jonathan: 'In, coffee, out, drive on.',
            },
          }
        ),
      })
    }
  )
}

// Mock the Claude chat endpoints. /claude/chat returns a synthetic
// SSE stream; /claude/conversations returns a stateful list mutated
// by the test through the returned `state` handle.
export async function mockClaudeChatWorker(page, opts = {}) {
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
            id: body.id || `c-${Date.now()}`,
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
      const text =
        opts.chatText ||
        'Saturday is Court 3 at Mohegan. Pool play opens at 9 AM.'
      const chunks = []
      for (let i = 0; i < text.length; i += 8) {
        chunks.push({ type: 'text_delta', text: text.slice(i, i + 8) })
      }
      chunks.push({
        type: 'done',
        usage: { input_tokens: 120, output_tokens: 40 },
      })
      const body = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('')
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body,
      })
    }
  )

  return state
}
