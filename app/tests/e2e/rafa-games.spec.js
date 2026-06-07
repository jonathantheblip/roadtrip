// Rafa's games shelf + sandboxed player + the AI maker. iPad-only (RafaPad
// overlay), so this runs in an iPad device context with the clock pinned so
// FIXTURE_TRIP is active and auto-opens to the home. The worker /game endpoint
// 404s under the test mock → the maker falls back to its canned game, which is
// exactly the offline/no-worker path we want guaranteed.
import { test, expect } from './_fixtures/clockStub.js'
import { devices } from '@playwright/test'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'
import { expectNoSeriousA11y } from './_fixtures/axe.js'

test.use({ ...devices['iPad (gen 7) landscape'] })

async function openShelf(page) {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await page.goto('/?person=rafa&nosw=1')
  await expect(page.getByTestId('rafa-pad-grid')).toBeVisible()
  await page.getByRole('button', { name: /My games/ }).click()
  await expect(page.getByTestId('rafa-games')).toBeVisible()
}

test.describe('Rafa iPad — games', () => {
  test('shelf opens, a real game plays in a strict sandbox, the maker makes one', async ({ page }) => {
    await openShelf(page)
    await expect(page.getByRole('button', { name: /Banana Toss/ })).toBeVisible()

    // a real game runs in an origin-isolated iframe (allow-scripts only)
    await page.getByRole('button', { name: /Banana Toss/ }).click()
    const frame = page.locator('iframe[title="Banana Toss"]')
    await expect(frame).toBeVisible()
    await expect(frame).toHaveAttribute('sandbox', 'allow-scripts')
    await page.getByRole('button', { name: 'Close' }).last().click()

    // the maker: typed → Claude (404 in test → canned fallback) → it plays
    await page.getByTestId('rafa-make-game').click()
    await expect(page.getByTestId('rafa-gen-mic')).toBeVisible()
    await page.getByRole('textbox', { name: /Describe a game/ }).fill('a bouncing ball game')
    await page.getByRole('button', { name: 'Make it!' }).click()
    await expect(page.getByTitle(/bouncing/i)).toBeVisible({ timeout: 8000 })
  })

  test('the shelf has no serious a11y violations', async ({ page }) => {
    await openShelf(page)
    await expectNoSeriousA11y(page, { include: '[data-testid="rafa-games"]', label: 'rafa games shelf' })
  })

  test('the maker has no serious a11y violations', async ({ page }) => {
    await openShelf(page)
    await page.getByTestId('rafa-make-game').click()
    await expect(page.getByTestId('rafa-gen-mic')).toBeVisible()
    await expectNoSeriousA11y(page, { include: '[data-testid="rafa-game-maker"]', label: 'rafa game maker' })
  })
})
