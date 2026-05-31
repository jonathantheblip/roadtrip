import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'
import { mockClaudeChatWorker } from './_fixtures/mockUpload.js'

// Security tier — CHECK 3, dynamic half. QA_COVERAGE_SYSTEM_SPEC.md §5.
//
// A model-supplied string carrying an HTML/script payload, delivered through
// the Claude reply (the react-markdown render path — the historically
// XSS-capable surface, where marked + DOMPurify + dangerouslySetInnerHTML once
// lived), must render INERT: no element is materialized from the raw HTML and
// no script side-effect fires.
//
// NON-VACUOUS: if the markdown path regained `rehype-raw`, the <img> would
// materialize (img count > 0) and its onerror would fire
// (window.__XSS_FIRED === true) — both core assertions go red. Proven by
// planting rehype-raw into the ClaudeBubble pipeline in the commit that adds
// this spec.

// onerror fires only if the <img> is actually created as a DOM element; the
// trailing marker (plain text, outside the tag) renders regardless and is our
// "stream finished" anchor.
const PAYLOAD = '<img src=x onerror="window.__XSS_FIRED=true">PWNED_MARKER'

test('model HTML in a Claude reply renders inert — no element, no execution', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await mockClaudeChatWorker(page, { chatText: PAYLOAD })
  await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')

  await page.getByRole('button', { name: /Modify this trip with Claude/i }).click()
  const dialog = page.getByRole('dialog', { name: /Chat with Claude/i })
  await expect(dialog).toBeVisible()

  await dialog.getByRole('textbox', { name: /Message Claude/i }).fill('echo the payload')
  await dialog.getByRole('button', { name: /Send message/i }).click()

  const messages = dialog.getByTestId('claude-messages')
  // Render completed once the trailing plain-text marker lands.
  await expect(messages).toContainText('PWNED_MARKER', { timeout: 5000 })
  // Give a (wrongly) materialized <img onerror> time to attempt load + fire.
  await page.waitForTimeout(300)

  // CORE 1 — react-markdown (no rehype-raw) does not parse model HTML into DOM
  // nodes, so no <img> exists in the rendered reply. The assistant bubble's own
  // chrome is inline SVG, never <img>, so any <img> here came from the payload.
  await expect(messages.locator('img')).toHaveCount(0)

  // CORE 2 — no script side-effect fired.
  const fired = await page.evaluate(() => window.__XSS_FIRED)
  expect(fired).not.toBe(true)

  // The payload survived as escaped, visible text (not as live markup).
  await expect(messages).toContainText('onerror=')
})
