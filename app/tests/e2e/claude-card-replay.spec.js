import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolvePersona } from './_fixtures/persona.js'

// Honors RT_PERSONA (Phase 2 build-list item 1); defaults to 'helen' when
// unset so existing runs stay byte-identical to before.
const PERSONA = resolvePersona('helen')

// ─────────────────────────────────────────────────────────────────────────
// Claude-in-App — Unit 3: browser-layer RECORD/REPLAY harness (card semantics)
// TEST_STRATEGY_SPEC.md §3 Unit 3.
//
// What makes this different from claude-card-shapes.spec.js (and every other
// Claude spec): those replay AUTHOR-FABRICATED card JSON — the card shape is
// chosen by the test. Here the fixtures are MODEL-AUTHORED: captured ONCE
// against the live model (claude-sonnet-4-6) by worker/scripts/
// capture-card-fixtures.mjs, using the real worker system prompt + the same
// open trip (FIXTURE_TRIP) we seed below. So the card COUNT and SHAPE asserted
// here are the model's decision, not ours. See _fixtures/claude-cards/
// manifest.json for provenance.
//
// This closes two things inspection could not resolve:
//   1. Single-change duplicate-prevention. add/move/cancel specs assert
//      visibility but NOT count today; a spurious second card would pass them.
//      Here we pin EXACTLY ONE card for each single change.
//   2. Multi-change shape. The captured "move + cancel + add" request yields
//      ONE `multi` card carrying edits[] — NOT three separate cards. That is
//      pinned below so the behavior is regression-guarded. (If a future
//      re-capture flips this to N cards, this test fails loudly — which is
//      exactly the signal we want.)
//
// Bounded (governing rule): the canonical pairs only. Not a phrasing matrix,
// not model evaluation. To refresh fixtures, re-run the capture script.
//
// RUNNING THIS SPEC: like EVERY claude-* e2e spec, the chat client only fires
// the /claude/chat request (which page.route then intercepts) when
// isWorkerConfigured() is true — i.e. when VITE_WORKER_URL + at least one
// VITE_FAMILY_TOKEN_* are present at vite-serve time. There is no committed
// .env, so on a bare clone the whole claude suite is red with "worker not
// configured" (workerFetch throws before the route can fire). Provide them
// for the run, e.g.:
//   VITE_WORKER_URL=https://roadtrip-sync.jonathan-d-jackson.workers.dev \
//   VITE_FAMILY_TOKEN_HELEN=test-token npm run test:e2e
// Any non-empty token works — the route intercepts before the worker ever
// validates it. (Same precondition the M2 card specs rely on.)
// ─────────────────────────────────────────────────────────────────────────

const FIX_DIR = fileURLToPath(new URL('./_fixtures/claude-cards/', import.meta.url))

function loadFixture(name) {
  return readFileSync(`${FIX_DIR}${name}.sse`, 'utf8')
}

// Every confirm-card *action* testid. Counting these (and excluding state
// testids like -drafting / -saved / -superseded and the inner -save button)
// is how we count "how many cards rendered". One markdown ```card fence →
// one ConfirmCard, so this count IS the model's card count.
const ALL_CARDS =
  '[data-testid="confirm-card-add"], ' +
  '[data-testid="confirm-card-move"], ' +
  '[data-testid="confirm-card-cancel"], ' +
  '[data-testid="confirm-card-multi"], ' +
  '[data-testid="confirm-card-create_trip"]'

// Replay a captured fixture as the /claude/chat SSE body, verbatim — the
// exact bytes the worker would have streamed to the browser. Conversations +
// history routes return empty so the panel boots clean. Mirrors the proven
// mockChat pattern in claude-card-shapes.spec.js; only the body changes (real
// model output instead of fabricated text).
function replayFixture(page, sseBody) {
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
        body: JSON.stringify({ id: body.id || 'c-replay', user_id: body.user_id, trip_id: body.trip_id || null }),
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
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body: sseBody,
      })
    }
  )
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

async function replay(page, fixtureName, requestMessage) {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  replayFixture(page, loadFixture(fixtureName))
  await page.goto(`/?person=${PERSONA}&trip=volleyball-2026&nosw=1`)
  const dialog = await openInTripChat(page)
  await sendMessage(dialog, requestMessage)
  return dialog
}

test.describe('Unit 3 — single-change → EXACTLY ONE model-authored card', () => {
  test('single move renders one move card (no spurious duplicate)', async ({ page }) => {
    const dialog = await replay(page, 'single-move', "Move Aurelia's Saturday match to 11 AM on court 3.")
    // The model targeted the real stop vb2-3 from the trip context.
    await expect(dialog.getByTestId('confirm-card-move')).toBeVisible({ timeout: 5000 })
    await expect(dialog.locator(ALL_CARDS)).toHaveCount(1)
  })

  test('single cancel renders one cancel card (no spurious duplicate)', async ({ page }) => {
    const dialog = await replay(page, 'single-cancel', "Cancel Sunday's match.")
    await expect(dialog.getByTestId('confirm-card-cancel')).toBeVisible({ timeout: 5000 })
    await expect(dialog.locator(ALL_CARDS)).toHaveCount(1)
  })

  test('single add renders one add card (no spurious duplicate)', async ({ page }) => {
    const dialog = await replay(page, 'single-add', 'Add a 7 PM dinner on Saturday.')
    await expect(dialog.getByTestId('confirm-card-add')).toBeVisible({ timeout: 5000 })
    await expect(dialog.locator(ALL_CARDS)).toHaveCount(1)
  })
})

test.describe('Unit 3 — multi-change shape (pinned to what the model produced)', () => {
  // GROUND TRUTH (capture 2026-05-30, claude-sonnet-4-6): the request
  // "Move Saturday's match to 11 AM, cancel Sunday's match, and add a 7 PM
  // dinner on Saturday." produced ONE `multi` card whose edits[] batches all
  // three sub-changes (move vb2-3, cancel vb3-4, add Day-2 dinner) — NOT three
  // separate cards. This pins that shape.
  test('move + cancel + add → ONE multi card carrying edits[], not three cards', async ({ page }) => {
    const dialog = await replay(
      page,
      'multi-change',
      "Move Saturday's match to 11 AM, cancel Sunday's match, and add a 7 PM dinner on Saturday."
    )
    await expect(dialog.getByTestId('confirm-card-multi')).toBeVisible({ timeout: 5000 })
    // Exactly one card total — the three changes are batched, not fanned out.
    await expect(dialog.locator(ALL_CARDS)).toHaveCount(1)
    // And it is specifically the multi shape (no standalone move/cancel/add).
    await expect(dialog.getByTestId('confirm-card-move')).toHaveCount(0)
    await expect(dialog.getByTestId('confirm-card-cancel')).toHaveCount(0)
    await expect(dialog.getByTestId('confirm-card-add')).toHaveCount(0)
  })
})

test.describe('Unit 3 — guidance reply renders NO card', () => {
  test('a thinking-aloud question produces a conversational reply and zero cards', async ({ page }) => {
    const dialog = await replay(
      page,
      'guidance',
      'What do you think we should do Saturday morning before Aurelia’s match?'
    )
    // The reply text lands (assistant bubble visible), but no card surface.
    await expect(dialog.getByText(/Saturday morning/i).first()).toBeVisible({ timeout: 5000 })
    await expect(dialog.locator(ALL_CARDS)).toHaveCount(0)
    await expect(dialog.getByTestId('confirm-card-drafting')).toHaveCount(0)
  })
})
