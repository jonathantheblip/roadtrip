import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'

// Claude-in-App M2 — mode-transition cue. The thin "MODE · …" tag that
// renders ABOVE the assistant bubble only on the turn where Claude
// pivots between guidance and execute (per CL_ChatModeTransition).
// Detection is text-side: a fenced ```card block means execute mode;
// anything else is guidance. No prompt-level signal required — the
// cue just observes what landed.
//
// What this spec exercises:
//   1. First guidance turn → no cue (there's no prior turn to shift from)
//   2. Second guidance turn → no cue (same mode as prior)
//   3. Third turn brings a card (execute) → cue renders with "execute"
//   4. Fourth guidance turn → cue renders with "guidance" (executed → talking)

const SHOT_DIR = 'tests/e2e/screenshots'

function sseFrames(...frames) {
  return frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('')
}

function chunkedSse(text) {
  const chunks = []
  for (let i = 0; i < text.length; i += 16) {
    chunks.push({ type: 'text_delta', text: text.slice(i, i + 16) })
  }
  chunks.push({ type: 'done', usage: { input_tokens: 50, output_tokens: 200 } })
  return sseFrames(...chunks)
}

// Per-call-count mock: returns the i-th reply for the i-th /claude/chat
// call. Tests cycle through a fixed list of replies.
async function mockChatSequence(page, replies) {
  const state = { chats: 0 }
  await page.route(
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
        body: JSON.stringify({ id: body.id || 'c-mode-shift', user_id: body.user_id, trip_id: body.trip_id || null }),
      })
    }
  )
  await page.route(
    /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/claude\/conversations\/[^/]+\/messages$/,
    async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    }
  )
  await page.route(
    /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/claude\/chat$/,
    async (route) => {
      const text = replies[state.chats] || replies[replies.length - 1] || 'Hmm.'
      state.chats += 1
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body: chunkedSse(text),
      })
    }
  )
  return state
}

const GUIDANCE_REPLY_1 =
  "Saturday's loose right now — pool play opens at 9 AM Court 3. Three things that could fit before the match: a slow breakfast at the lodging, a walk on the Mohegan beach, or a quick stop in Mystic."

const GUIDANCE_REPLY_2 =
  "Mystic's the most kid-friendly — about 25 minutes, aquarium opens at 9. The trade-off is the drive back, but you'd still hit the arena with time."

const EXECUTE_REPLY = [
  "Locked. Drafted the Mystic Aquarium stop for Saturday morning.",
  '',
  '```card',
  JSON.stringify(
    {
      action: 'add',
      id: 'c-mystic-aq',
      eyebrow: 'DAY 2 · SAT MAY 23',
      title: 'Mystic Aquarium',
      fields: [
        { name: 'time', label: 'Time', value: '9:00 AM', editable: true },
        { name: 'address', label: 'Address', value: '55 Coogan Blvd, Mystic CT', editable: true },
        { name: 'kind', label: 'Kind', value: 'sights', editable: true },
      ],
      target: { tripId: 'volleyball-2026', dayN: 2, position: 'end' },
      note: 'Drive: 25 min back to the arena.',
    },
    null,
    2
  ),
  '```',
].join('\n')

const GUIDANCE_REPLY_3 =
  "Good call to keep Sunday open — Aurelia tends to be wiped after a Saturday morning anchor. We can hold and decide that one Sunday morning."

test.describe('Claude-in-App M2 — mode-transition cue', () => {
  test('renders MODE · execute on the pivot turn and MODE · guidance on the return', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await mockChatSequence(page, [
      GUIDANCE_REPLY_1,
      GUIDANCE_REPLY_2,
      EXECUTE_REPLY,
      GUIDANCE_REPLY_3,
    ])
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')

    await page.getByRole('button', { name: /Modify this trip with Claude/i }).click()
    const dialog = page.getByRole('dialog', { name: /Chat with Claude/i })
    await expect(dialog).toBeVisible()

    const composer = dialog.getByRole('textbox', { name: /Message Claude/i })
    const sendBtn = dialog.getByRole('button', { name: /Send message/i })

    async function turn(userText, expectVisible) {
      await composer.fill(userText)
      await sendBtn.click()
      await expect(dialog.getByText(expectVisible)).toBeVisible({ timeout: 5000 })
    }

    // Turn 1: guidance → guidance reply. No cue (no prior turn).
    await turn("what could fit saturday morning?", /pool play opens at 9 AM Court 3/)
    await expect(dialog.getByTestId('mode-shift-guidance')).toHaveCount(0)
    await expect(dialog.getByTestId('mode-shift-execute')).toHaveCount(0)

    // Turn 2: still guidance. No cue.
    await turn("which is most kid-friendly?", /Mystic's the most kid-friendly/)
    await expect(dialog.getByTestId('mode-shift-guidance')).toHaveCount(0)
    await expect(dialog.getByTestId('mode-shift-execute')).toHaveCount(0)

    // Turn 3: execute. Cue should appear above this reply.
    await turn("yeah let's add the aquarium", /Locked\. Drafted the Mystic Aquarium/)
    await expect(dialog.getByTestId('mode-shift-execute')).toBeVisible()
    await expect(dialog.getByTestId('mode-shift-execute').getByText(/MODE · execute/i)).toBeVisible()
    // The card landed too — the cue accompanies the card-bearing turn.
    await expect(dialog.getByTestId('confirm-card-add')).toBeVisible()

    await page.screenshot({ path: `${SHOT_DIR}/m2-mode-shift-to-execute.png`, fullPage: true })

    // Turn 4: back to guidance. Cue should appear above this reply too.
    await turn("any thoughts on sunday morning?", /keep Sunday open/)
    await expect(dialog.getByTestId('mode-shift-guidance')).toBeVisible()
    await expect(dialog.getByTestId('mode-shift-guidance').getByText(/MODE · guidance/i)).toBeVisible()

    // Earlier cue still visible — it's part of the historical record.
    await expect(dialog.getByTestId('mode-shift-execute')).toBeVisible()

    await page.screenshot({ path: `${SHOT_DIR}/m2-mode-shift-back-to-guidance.png`, fullPage: true })
  })
})
