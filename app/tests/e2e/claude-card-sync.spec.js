// Claude-in-App — trip edits sync honestly and self-heal.
//
// Bug (Helen, 2026-06-13): a Claude-in-app edit whose family push failed still
// showed "Saved ✓", with no warning and no retry — so the edit lived only on
// the author's phone and never reached the family. This guards the fix:
//   1. a failed family push shows "Saved on your phone · syncing…", never the
//      plain "Saved ✓", and records the trip as unsynced; and
//   2. the app re-pushes the stranded edit on the next opportunity (here, the
//      `online` event) and clears the unsynced flag once it lands.
import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'

const ADD_CARD = {
  action: 'add', id: 'c-sync-test', eyebrow: 'DAY 3 · SUN MAY 24', title: 'Sift Bake Shop',
  fields: [{ name: 'address', label: 'Address', value: '5 Water St, Mystic CT', editable: true }],
  target: { tripId: 'volleyball-2026', dayN: 3, position: 'end' },
}
const CHAT_REPLY = ['Drafted the address.', '', '```card', JSON.stringify(ADD_CARD, null, 2), '```', '', 'Tap save.'].join('\n')
const sse = (...f) => f.map((x) => `data: ${JSON.stringify(x)}\n\n`).join('')
const UNSYNCED_KEY = 'rt_trips_unsynced_v1'

async function mockClaude(page) {
  await page.route(/\/claude\/conversations(\?|$)/, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: r.request().method() === 'GET' ? '[]' : JSON.stringify({ id: 'c1', user_id: 'helen', trip_id: 'volleyball-2026' }) }))
  await page.route(/\/claude\/conversations\/[^/]+\/messages$/, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route(/\/claude\/chat$/, async (r) => {
    const chunks = []
    for (let i = 0; i < CHAT_REPLY.length; i += 16) chunks.push({ type: 'text_delta', text: CHAT_REPLY.slice(i, i + 16) })
    chunks.push({ type: 'done', usage: { input_tokens: 1, output_tokens: 1 } })
    await r.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sse(...chunks) })
  })
}

test('a failed family push is honest, then self-heals on the next opportunity', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await mockClaude(page)

  // A controllable family push: fail while `failPush`, succeed after.
  let failPush = true
  const posts = { attempts: 0, successes: 0 }
  await page.route(/\/trips(\?|$)/, async (route) => {
    if (route.request().method() === 'POST') {
      posts.attempts += 1
      if (failPush) return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' })
      posts.successes += 1
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"id":"volleyball-2026"}' })
    }
    return route.fallback() // GET pull → seed catch-all (empty)
  })

  await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
  await page.getByRole('button', { name: /Modify this trip with Claude/i }).click()
  const dialog = page.getByRole('dialog', { name: /Chat with Claude/i })
  await dialog.getByRole('textbox', { name: /Message Claude/i }).fill('add the address')
  await dialog.getByRole('button', { name: /Send message/i }).click()

  const card = dialog.getByTestId('confirm-card-add')
  await expect(card).toBeVisible({ timeout: 5000 })
  await card.getByRole('button', { name: /^Save$/i }).click()

  // HONEST: shows "saved on your phone / syncing", never the plain green "Saved ✓".
  await expect(dialog.getByTestId('confirm-card-saved-unsynced')).toBeVisible({ timeout: 3000 })
  await expect(dialog.getByTestId('confirm-card-saved')).toHaveCount(0)
  await expect(dialog.getByText(/Syncing to the family/i)).toBeVisible()

  // Recorded as unsynced for retry, and the push really did fail. The queue stores
  // { id, author } so the resync can re-push under the real editor (here, Helen).
  expect(posts.attempts).toBeGreaterThan(0)
  const unsynced = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '[]'), UNSYNCED_KEY)
  const entry = unsynced.find((e) => (typeof e === 'string' ? e : e.id) === 'volleyball-2026')
  expect(entry).toBeTruthy()
  expect(entry.author).toBe('helen') // the editor was captured at mark time

  // SELF-HEALING: let the push succeed, fire the `online` trigger; resync
  // re-pushes the stranded edit and clears the flag.
  failPush = false
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect
    .poll(async () => (await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '[]'), UNSYNCED_KEY)).length, { timeout: 6000 })
    .toBe(0)
  expect(posts.successes).toBeGreaterThan(0)
})
