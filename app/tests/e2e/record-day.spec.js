// THE RECORD (2026-07-02) — "what actually happened," the third tense.
// The conversational mouth: the reader recounts the day to Claude-in-app,
// a record-day card reflects it back row by row (skippable), and Save
// writes the day's RECORD — never its plan. The whole-stay unfold then
// shows the day under a quiet "as it happened" kicker. This spec pins the
// arc end-to-end with a mocked SSE reply (same pattern as the other
// claude-card specs; the worker prompt work is covered by worker tests).
import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'

const PERSONA = 'helen'

function mockChat(page, replyText) {
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
        body: JSON.stringify({ id: body.id || 'c-record', user_id: body.user_id, trip_id: body.trip_id || null }),
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
      const chunks = []
      for (let i = 0; i < replyText.length; i += 16) {
        chunks.push({ type: 'text_delta', text: replyText.slice(i, i + 16) })
      }
      chunks.push({ type: 'done', usage: { input_tokens: 50, output_tokens: 200 } })
      const body = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n'
      await route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body })
    }
  )
}

function replyWithCard(card, leadText) {
  return [leadText || 'What a day.', '', '```card', JSON.stringify(card, null, 2), '```'].join('\n')
}

const RECORD_CARD = {
  action: 'record-day',
  id: 'c-rec-sat',
  eyebrow: 'SAT MAY 23',
  title: 'The day, as it happened',
  entries: [
    { name: 'Slow breakfast at the bungalow', time: 'morning' },
    { name: 'Race Point Beach', time: 'late morning', kind: 'park', note: 'Rafa found a crab.' },
    { name: 'Mini golf (skip me)', time: 'evening' },
  ],
  target: { tripId: 'volleyball-2026', dayIso: '2026-05-23' },
}

test('recounting the day → a record-day card → Save writes the RECORD, the plan untouched, the home shows it', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  mockChat(page, replyWithCard(RECORD_CARD, 'Sounds like a good Saturday. Here it is, row by row.'))
  await page.goto(`/?person=${PERSONA}&trip=volleyball-2026&nosw=1`)

  // Tell Claude about the day.
  await page.getByRole('button', { name: /Modify this trip with Claude/i }).click()
  const dialog = page.getByRole('dialog', { name: /Chat with Claude/i })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('textbox', { name: /Message Claude/i }).fill('let me tell you about today — slow breakfast, then race point beach')
  await dialog.getByRole('button', { name: /Send message/i }).click()

  // The card reflects the day back, row by row; skip the invented row.
  const card = dialog.getByTestId('confirm-card-record-day')
  await expect(card).toBeVisible({ timeout: 5000 })
  await expect(card).toContainText('Race Point Beach')
  // Rows render in entry order — the invented row is third; skip it.
  await card.getByRole('button', { name: /^Skip$/i }).nth(2).click()
  await expect(card.getByRole('button', { name: /Record 2/i })).toBeVisible()
  await card.getByRole('button', { name: /Record 2/i }).click()
  await expect(dialog.getByTestId('confirm-card-saved')).toBeVisible({ timeout: 3000 })

  // The data is honest: record written, plan untouched, skipped row absent.
  const trip = await page.evaluate(() => {
    const all = JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]')
    return all.find((t) => t.id === 'volleyball-2026') || null
  })
  const day = trip.days.find((d) => d.isoDate === '2026-05-23')
  expect(day.record.map((e) => e.name)).toEqual(['Slow breakfast at the bungalow', 'Race Point Beach'])
  expect(day.record[1].note).toBe('Rafa found a crab.')
  expect(day.stops.length).toBe(FIXTURE_TRIP.days.find((d) => d.isoDate === '2026-05-23').stops.length)

  // And the home SHOWS it: close the chat, unfold the whole stay.
  await dialog.getByRole('button', { name: /^Close$/i }).click()
  const home = page.getByTestId('living-heart-home')
  await expect(home).toBeVisible({ timeout: 10000 })
  await home.getByTestId('whole-stay-toggle').click()
  const record = home.getByTestId('day-record').first()
  await expect(record).toBeVisible()
  await expect(record).toContainText(/as it happened/i)
  await expect(record).toContainText('Race Point Beach')
  await expect(record).not.toContainText('Mini golf')
})

test('a record card with every row skipped cannot save (no-op class stays closed)', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  mockChat(page, replyWithCard({ ...RECORD_CARD, id: 'c-rec-allskip', entries: [RECORD_CARD.entries[0]] }))
  await page.goto(`/?person=${PERSONA}&trip=volleyball-2026&nosw=1`)
  await page.getByRole('button', { name: /Modify this trip with Claude/i }).click()
  const dialog = page.getByRole('dialog', { name: /Chat with Claude/i })
  await dialog.getByRole('textbox', { name: /Message Claude/i }).fill('today was quiet')
  await dialog.getByRole('button', { name: /Send message/i }).click()
  const card = dialog.getByTestId('confirm-card-record-day')
  await expect(card).toBeVisible({ timeout: 5000 })
  await card.getByRole('button', { name: /^Skip$/i }).click()
  await expect(card.getByRole('button', { name: /Record 0/i })).toBeDisabled()
})
