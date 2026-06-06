import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, seedMemoriesIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'
import { mockClaudeChatWorker } from './_fixtures/mockUpload.js'
import { resolvePersona, TRAVELERS } from './_fixtures/persona.js'
import { expectNoSeriousA11y } from './_fixtures/axe.js'

// Automated accessibility (axe-core) tier — QA_COVERAGE_SYSTEM_SPEC.md §4 #2.
// This is the WIRING + proof, not the Phase-3 capture run: a small
// representative proof-set (trips index + the Claude-in-app panel), scanned at
// the serious+critical threshold. Phase 3 extends across the full matrix.
//
// Persona-aware via RT_PERSONA (commit a876757): defaults to 'jonathan', so by
// default the Claude-panel scan runs under a NON-Helen persona — exactly the
// wrong-theme surface (the panel hardcodes Helen's palette for everyone), which
// is where a contrast regression would show. Run `RT_PERSONA=rafa npx playwright
// test a11y-axe` to scan another traveler's theme.
const persona = resolvePersona('jonathan')

test.describe(`a11y (axe, serious+critical) — persona: ${persona}`, () => {
  test('trips index — no serious/critical violations', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await mockClaudeChatWorker(page)
    await page.goto(`/?person=${persona}&nosw=1`)
    // The seeded fixture is "today's" trip, so we land on the trip view; step
    // back to the trips index (the floating "Plan with Claude" entry only
    // renders there).
    await page.getByRole('button', { name: /trips/i }).first().click()
    await expect(page.getByRole('button', { name: /Plan with Claude/i })).toBeVisible()
    // color-contrast was a KNOWN finding on the themed views' small mono
    // "eyebrow" + muted-italic labels — KNOWN_BUGS A11Y-1c (jonathan
    // oxblood-on-dark 2.92:1, aurelia pink-on-pink 2.67–3.13:1). RESOLVED by C1:
    // accent-as-text now uses the readable per-persona --accent-text token
    // (jonathan #D26C60, aurelia #B3165A, helen-dark #CD7973 — all ≥4.8:1; helen
    // forest / rafa ochre already passed). The allowlist is REMOVED to re-gate
    // contrast here. Any remaining flag is a site the C1 migration missed — fix
    // it, don't re-allowlist.
    await expectNoSeriousA11y(page, { label: `trips index (${persona})` })
  })

  test('Claude-in-app panel — no serious/critical violations', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await mockClaudeChatWorker(page)
    await page.goto(`/?person=${persona}&trip=volleyball-2026&nosw=1`)
    await page.getByRole('button', { name: /Modify this trip with Claude/i }).click()
    const dialog = page.getByRole('dialog', { name: /Chat with Claude/i })
    await expect(dialog).toBeVisible()
    // Scope to the panel: the known wrong-theme surface. Under a non-Helen
    // persona this is the most likely contrast offender (tier overlap with the
    // theme bug). If axe flags contrast here, it corroborates the theme bug
    // from the WCAG angle — record in KNOWN_BUGS, don't fix (M6).
    // M6 un-froze the panel: it now themes per-persona via body[data-theme]
    // var(--…) (no hardcoded Helen palette), and the confirm cards read dark on
    // their cream "draft slip" (M6 + A-full hotfix). The color-contrast allowlist
    // is REMOVED here to re-gate contrast on O1/O2. A remaining flag is now a TRUE
    // per-persona finding — e.g. a base --muted just under AA on its own --bg —
    // not the old wrong-theme bug. (S2 trips-index above stays allowlisted: its
    // A11Y-1 eyebrow/label contrast is a separate, still-open redesign item.)
    await expectNoSeriousA11y(page, { include: '[role="dialog"]', label: `claude panel (${persona})` })
  })
})

// C2: S2 trip-view contrast gate. The Phase-1 ledger correction proved S2 (the
// four themed View components + the FamilyDock switcher) had ZERO axe contrast
// coverage — the describe above scans trips-index (where the switcher is hidden,
// App.jsx "everywhere except the index") + the Claude panel only. The pervasive
// --faint-as-text labels (recon's "~1 decorative <del>" was actually ~22 readable
// labels) and the switcher pill labels (opacity:.5 → effective 0.425) failed here
// unseen. C2 fixes them; THIS keeps them fixed. It loops ALL FOUR personas
// internally (not RT_PERSONA-gated) so every traveler's trip view — its active
// pill (aurelia's pink dot needs dark ink) AND the three inactive pills AND the
// --muted labels — is gated on EVERY CI run. A contrast fix on an ungated surface
// regresses silently; this is the deliverable that prevents that.
test.describe('a11y (axe, serious+critical) — S2 trip-view ×4 personas', () => {
  for (const p of TRAVELERS) {
    test(`trip view — ${p}`, async ({ page }) => {
      await seedTripIntoCache(page, FIXTURE_TRIP)
      await mockClaudeChatWorker(page)
      await page.goto(`/?person=${p}&trip=volleyball-2026&nosw=1`)
      // The FamilyDock switcher renders on S2 (hidden only on index/new/edit) —
      // wait for it so the scan sees the active + inactive pills in final state.
      await expect(page.locator('.switcher')).toBeVisible()
      // CONTRAST gate (C2's job): only color-contrast. Other serious/critical
      // rules on S2 (e.g. a pre-existing unlabeled control) are separate findings,
      // not masked here — they're tracked + fixed on their own (the trip-switcher
      // <select> got an aria-label in this pass). This keeps the contrast gate from
      // going red for a non-contrast reason a future S2 edit might introduce.
      await expectNoSeriousA11y(page, { label: `trip view (${p})`, only: ['color-contrast'] })
    })
  }
})

// InstallIdentity (the per-person "Make it yours" home-screen app picker,
// added in the cross-cutting pass) is a full-screen view with its own small
// mono labels + accent-as-text ("yours") + the picker — exactly the surface
// where a --faint-as-text slip hides. Gate its contrast ×4 personas so the
// new view can't regress silently.
test.describe('a11y (axe, serious+critical) — InstallIdentity ×4 personas', () => {
  for (const p of TRAVELERS) {
    test(`install identity — ${p}`, async ({ page }) => {
      await seedTripIntoCache(page, FIXTURE_TRIP)
      await page.goto(`/?person=${p}&trip=volleyball-2026&nosw=1`)
      await page.getByRole('button', { name: 'Trip settings' }).click()
      await page.getByTestId('open-identity').click()
      await expect(page.getByTestId('install-identity')).toBeVisible()
      // Scope to the overlay (like the Claude-panel scan): a small-subtree
      // scan is far lighter than a full-page axe, so adding 4 personas ×2
      // engines doesn't tip the full a11y file into timeouts under parallel
      // load — and it's immune to whatever surface sits behind the overlay.
      await expectNoSeriousA11y(page, {
        include: '[data-testid="install-identity"]',
        only: ['color-contrast'],
        label: `install identity (${p})`,
      })
    })
  }
})

// TheWeave — new full-screen overlay with mono micro-labels + serif text
// + accent-text usage on the day label. Same risk surface as InstallIdentity:
// --faint-as-text can hide in small-label slots. Gate ×4 personas.
test.describe('a11y (axe, serious+critical) — TheWeave ×4 personas', () => {
  for (const p of TRAVELERS) {
    test(`the weave — ${p}`, async ({ page }) => {
      await seedTripIntoCache(page, FIXTURE_TRIP)
      // Mock /weave so the component reaches 'ready' state without a real worker.
      await page.route(/workers\.dev\/weave$/, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            title: 'A Day Together',
            opening: 'The family arrived in the evening.',
            closing: 'That was Friday.',
          }),
        })
      })
      // Seed one memory so the overlay has content and doesn't show the empty state.
      // Must use seedMemoriesIntoCache (addInitScript) — page.evaluate before
      // page.goto hits about:blank and throws a cross-origin SecurityError.
      await seedMemoriesIntoCache(page, [
        {
          id: 'axe-weave-mem',
          tripId: 'volleyball-2026',
          stopId: 'vb1-3',
          authorTraveler: 'jonathan',
          visibility: 'shared',
          kind: 'text',
          text: 'Arrived safely.',
          createdAt: '2026-05-22T18:00:00.000Z',
        },
      ])
      await page.goto(`/?person=${p}&trip=volleyball-2026&nosw=1`)
      await page.getByRole('button', { name: /Weave/i }).click()
      await expect(page.getByTestId('the-weave')).toBeVisible()
      await expectNoSeriousA11y(page, {
        include: '[data-testid="the-weave"]',
        only: ['color-contrast'],
        label: `the weave (${p})`,
      })
    })
  }
})
