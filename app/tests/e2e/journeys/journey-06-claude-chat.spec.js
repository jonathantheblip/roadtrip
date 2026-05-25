import { test } from '@playwright/test'
import { step, setActivePage, expect } from './_steps.js'
import { seedTripIntoCache, FIXTURE_TRIP } from '../_fixtures/withTrip.js'
import { mockClaudeChatWorker } from '../_fixtures/mockUpload.js'

// Journey 06 — Claude chat send + persistence.
// Spec source: BUG_TRAP_PUNCHLIST.md A.3 sixth bullet.
//
// Surface: HelenView → in-header Claude entry button → ClaudeChatPanel
// → send → mocked SSE stream → close → reopen → past-conversations list.
// /claude/chat + /claude/conversations are mocked end-to-end so the
// journey never burns Anthropic budget.

test.beforeEach(async ({ page }) => setActivePage(page))

test('claude chat sends, streams, persists across reopen', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  const state = await mockClaudeChatWorker(page, {
    chatText: 'Saturday is Court 3 at Mohegan. Pool play opens at 9 AM.',
    initialConversations: [],
  })

  await step('open trip view with Claude entry visible', async () => {
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await expect(
      page.getByRole('button', { name: /Modify this trip with Claude/i })
    ).toBeVisible({ timeout: 10_000 })
  })

  await step('open Claude chat panel', async () => {
    await page.getByRole('button', { name: /Modify this trip with Claude/i }).click()
    await expect(
      page.getByRole('dialog', { name: /Chat with Claude/i })
    ).toBeVisible()
  })

  await step('send a question about the trip', async () => {
    const dialog = page.getByRole('dialog', { name: /Chat with Claude/i })
    await dialog
      .getByRole('textbox', { name: /Message Claude/i })
      .fill("What was Saturday's volleyball schedule?")
    await dialog.getByRole('button', { name: /Send message/i }).click()
  })

  await step('streamed reply lands in a Claude bubble', async () => {
    const dialog = page.getByRole('dialog', { name: /Chat with Claude/i })
    await expect(
      dialog.getByText(/Saturday is Court 3 at Mohegan/i)
    ).toBeVisible({ timeout: 10_000 })
    expect(state.chats).toBe(1)
  })

  await step('close panel, mutate mock to include the new conversation', async () => {
    const dialog = page.getByRole('dialog', { name: /Chat with Claude/i })
    state.conversations = [
      {
        id: state.lastChatBody.conversation_id,
        user_id: 'helen',
        trip_id: 'volleyball-2026',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        preview: "What was Saturday's volleyball schedule?",
      },
    ]
    await dialog.getByRole('button', { name: /^Close$/i }).click()
    await expect(dialog).toBeHidden()
  })

  await step('reopen panel — past conversations list visible', async () => {
    await page.getByRole('button', { name: /Modify this trip with Claude/i }).click()
    const dialog = page.getByRole('dialog', { name: /Chat with Claude/i })
    await expect(dialog.getByText(/Past conversations/i)).toBeVisible()
    await expect(
      dialog.getByText(/What was Saturday's volleyball schedule\?/)
    ).toBeVisible()
  })
})
