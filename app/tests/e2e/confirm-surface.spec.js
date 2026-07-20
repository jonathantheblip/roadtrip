import { test, expect } from './_fixtures/clockStub.js'
import { expectNoSeriousA11y } from './_fixtures/axe.js'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'

// S1 confirm surface — the family-visible card, driven by the ?confirmDemo=1
// fixture path (renders the demo moment without real data or the knob, and with
// all writes suppressed). Covers the two LIVE lenses + Aurelia's parity styling,
// the confirm→settled gold line, the correction sheet, the residue-free skip,
// Rafa's no-surface, and the axe contrast gate (the W6 rendered-a11y lesson —
// the one thing only e2e catches).
const CARD = '[data-testid=confirm-card]'

// Seed a known trip (resets prod/prior localStorage), open the lens, then step to
// the trips INDEX (FIXTURE_TRIP is "today", so the app lands on the trip view;
// the confirm card mounts on the index, above the resurface card).
async function gotoIndex(page, person) {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await page.goto(`/?person=${person}&confirmDemo=1&nosw=1`)
  const back = page.getByRole('button', { name: /Back to trips/i })
  if (await back.isVisible().catch(() => false)) await back.click()
}

async function openDemo(page, person) {
  await gotoIndex(page, person)
  const card = page.locator(CARD)
  await card.waitFor({ state: 'visible', timeout: 15000 })
  return card
}

test.describe('S1 confirm surface (demo)', () => {
  const LENSES = [
    { person: 'jonathan', q: /look like the walk into town — at Angel Foods\. Right\?/, confirm: /That.s right/ },
    { person: 'helen', q: /look like the walk into town, over at Angel Foods/, confirm: /Yes, that.s it/ },
    { person: 'aurelia', q: /look like the walk into town — at angel foods, yeah\?/, confirm: /yep, that.s it/ },
  ]

  for (const { person, q, confirm } of LENSES) {
    test(`${person}: renders the lensed question + confirm label`, async ({ page }) => {
      const card = await openDemo(page, person)
      await expect(card).toContainText(q)
      await expect(card.getByRole('button', { name: confirm })).toBeVisible()
    })
    test(`${person}: no serious/critical a11y violations on the card`, async ({ page }) => {
      await openDemo(page, person)
      await expectNoSeriousA11y(page, { label: `confirm card (${person})` })
    })
  }

  test('confirm → the settled gold fact-line, stays this visit', async ({ page }) => {
    const card = await openDemo(page, 'helen')
    await card.getByRole('button', { name: /Yes, that.s it/ }).click()
    await expect(card).toContainText(/The walk into town, at Angel Foods\./)
    await expect(card.getByRole('button', { name: /Yes, that.s it/ })).toHaveCount(0)
  })

  test('Not quite (place) opens the correction sheet with alternates', async ({ page }) => {
    const card = await openDemo(page, 'jonathan')
    await card.getByRole('button', { name: /Not quite/ }).click()
    await expect(page.locator('[data-testid=confirm-correct-sheet]')).toBeVisible()
    await expect(page.locator('[data-testid=correct-alt]').first()).toBeVisible()
  })

  test('skip clears the card with no residue', async ({ page }) => {
    const card = await openDemo(page, 'helen')
    await card.getByRole('button', { name: /Skip this one for now/i }).click()
    await expect(page.locator(CARD)).toHaveCount(0)
  })

  test('picking the base earns the full "part of the trip" promise — it FILES now (flip-blocker #5)', async ({ page }) => {
    const card = await openDemo(page, 'jonathan')
    await card.getByRole('button', { name: /Not quite/ }).click()
    await page.locator('[data-testid=correct-alt]', { hasText: 'the beach house' }).click()
    // the base alt now carries a filable id → savedPicked (the true promise), NOT
    // the honest "noted, won't ask" fallback a non-filing pick would get.
    await expect(card).toContainText(/the beach house/)
    await expect(card).toContainText(/fall into place/)
    await expect(card).not.toContainText(/won.t ask about this one/i)
  })

  // Rafa's "no confirm surface" is NOT tested here: the ?confirmDemo=1 harness
  // FORCES the card for any lens (it bypasses the fetch), so it can't exercise the
  // real invariant. That invariant lives at the worker — GET /heal-decisions is
  // adults-only and returns confirm:false for a kid (worker/test/confirm-feedback
  // "a KID is forbidden" + "confirm gate"), and Rafa's home is RafaView, not the
  // TripIndex where the card mounts. So the no-surface guarantee is worker-tested,
  // not demo-tested.
})
