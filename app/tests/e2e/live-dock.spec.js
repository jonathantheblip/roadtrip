import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, seedMemoriesIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'
import { expectNoSeriousA11y } from './_fixtures/axe.js'

// LiveDock — the live "ledge" (NowBar × FamilyDock reconciliation). The dock
// grows a slim live row above the switcher pills DURING a live trip. The clock
// stub pins "today" to 2026-05-23, inside FIXTURE_TRIP's window (May 22–25),
// so the seeded trip is live and the ledge renders. Presence per person:
// Jonathan/Helen persistent · Aurelia cue-only · Rafa never.

const tripUrl = (who) => `/?person=${who}&trip=volleyball-2026&nosw=1`

// A surprise authored by someone else, hidden from `who`, already revealed →
// drives surpriseRevealCue > 0 for `who` (summons Aurelia's ledge; rides the
// J/H ledge as a cue chip).
function revealFor(who) {
  return {
    id: `ld-reveal-${who}`,
    tripId: 'volleyball-2026',
    stopId: null,
    authorTraveler: who === 'helen' ? 'jonathan' : 'helen',
    visibility: 'shared',
    kind: 'text',
    createdAt: '2026-05-22T18:00:00.000Z',
    hideFrom: [who],
    reveal: { type: 'manual' },
    conceal: 'teaser',
    revealed: '2026-05-23T00:00:00.000Z',
    surprise: { what: 'A memory', icon: '🧁', title: 'Cupcake', detail: 'a candle at breakfast.', tint: '#7A5A3A' },
  }
}

test.describe('LiveDock — the live ledge', () => {
  for (const who of ['jonathan', 'helen']) {
    test(`${who}: persistent live ledge, schedule readout, taps to the live map`, async ({ page }) => {
      await seedTripIntoCache(page, FIXTURE_TRIP)
      await page.goto(tripUrl(who))
      await expect(page.locator('.switcher')).toBeVisible()
      const ledge = page.getByTestId('live-dock-ledge')
      await expect(ledge).toBeVisible()
      // The dock glass opened to the ledge radius (the ledge docked in).
      await expect(page.locator('.switcher-inner.has-ledge')).toBeVisible()
      // Real itinerary text — proves the schedule selector is wired, not a stub.
      await expect(ledge).toContainText(/Bungalow|Empire|Northeast/)
      // Body tap → Live Map.
      await ledge.click()
      await expect(page.locator('.mapview')).toBeVisible()
    })
  }

  test('aurelia: cue-only — no ledge without a reveal', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.goto(tripUrl('aurelia'))
    await expect(page.locator('.switcher')).toBeVisible()
    await expect(page.getByTestId('live-dock-ledge')).toHaveCount(0)
  })

  test('aurelia: a revealed surprise summons the cue ledge, which opens Surprises', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [revealFor('aurelia')])
    await page.goto(tripUrl('aurelia'))
    const ledge = page.getByTestId('live-dock-ledge')
    await expect(ledge).toBeVisible()
    await ledge.click()
    await expect(page.getByTestId('surprises-view')).toBeVisible()
  })

  test('rafa: never a ledge (his "Our trip!" tile is his anchor)', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.goto(tripUrl('rafa'))
    await expect(page.locator('.switcher')).toBeVisible()
    await expect(page.getByTestId('live-dock-ledge')).toHaveCount(0)
  })
})

// The live GPS ETA upgrade: when THIS device is on the trip route (and location
// was granted via the Live Map), the ledge readout becomes "{heading-to} · ETA
// {time}" from the worker's traffic-aware drive time. Off-route / no GPS keeps
// the schedule readout (Step A) — proven by the cue/presence tests above.
test.describe('LiveDock — live GPS ETA upgrade', () => {
  for (const who of ['jonathan', 'helen']) {
    test(`${who}: on-route GPS upgrades the readout to a live ETA`, async ({ page, context }) => {
      await context.grantPermissions(['geolocation'])
      // A point ON the FIXTURE_TRIP route — between Beach Bungalow (41.3225) and
      // vs Empire (41.4923) at lng ~-72.094 → on-route, heading to vs Empire.
      await context.setGeolocation({ latitude: 41.4, longitude: -72.094 })
      await seedTripIntoCache(page, FIXTURE_TRIP)
      // Mock the worker ETA (registered AFTER the seed catch-all so it wins).
      await page.route(/\/drive-eta$/, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ durationMinutes: 12 }),
        })
      })
      await page.goto(tripUrl(who))
      // The dock reads location PASSIVELY (never prompts), so the ETA lights up
      // only after the Live Map has started the watch. Open the map, then back.
      await page.getByTestId('live-dock-ledge').click()
      await expect(page.locator('.mapview')).toBeVisible()
      await page.getByRole('button', { name: /back to trip/i }).click()
      // Back on the trip view, the ledge now carries the live ETA.
      await expect(page.getByTestId('live-dock-ledge')).toContainText(/ETA \d/)
    })
  }
})

// Contrast of the LEDGE itself, including the cue chip on the dark glass. The
// S2 trip-view axe gate scans the dock but seeds no cue, so the cue chips
// (notably Helen's — re-tuned for the dark glass) are gated here ×persona.
test.describe('LiveDock — ledge + cue contrast on the dark glass', () => {
  for (const who of ['jonathan', 'helen', 'aurelia']) {
    test(`ledge + cue contrast — ${who}`, async ({ page }) => {
      await seedTripIntoCache(page, FIXTURE_TRIP)
      await seedMemoriesIntoCache(page, [revealFor(who)])
      await page.goto(tripUrl(who))
      await expect(page.getByTestId('live-dock-ledge')).toBeVisible()
      await expectNoSeriousA11y(page, {
        include: '.switcher',
        only: ['color-contrast'],
        label: `live dock (${who})`,
      })
    })
  }
})
