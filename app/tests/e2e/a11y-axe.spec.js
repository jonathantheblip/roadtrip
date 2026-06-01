import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'
import { mockClaudeChatWorker } from './_fixtures/mockUpload.js'
import { resolvePersona } from './_fixtures/persona.js'
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
