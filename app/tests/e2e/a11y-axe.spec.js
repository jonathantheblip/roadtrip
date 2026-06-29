import { test, expect } from './_fixtures/clockStub.js'
import { openTopMenuItem } from './_fixtures/topNav.js'
import { seedTripIntoCache, seedMemoriesIntoCache, FIXTURE_TRIP, FIXTURE_ROUTE_TRIP, TINY_RED_PNG_DATA_URL } from './_fixtures/withTrip.js'
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

  // Entry-points redesign — Jonathan's per-person home band (the designed
  // feature entries layered above his itinerary). Jonathan-only in slice 1;
  // scoped to the band so a pre-existing itinerary finding doesn't leak in.
  for (const who of ['jonathan', 'helen', 'aurelia']) {
    test(`${who} entry band — no serious/critical violations`, async ({ page }) => {
      await seedTripIntoCache(page, FIXTURE_TRIP)
      await page.goto(`/?person=${who}&trip=volleyball-2026&nosw=1`)
      // Jonathan's stay home is the redesigned LivingHeartHome (slice 1); the
      // others still render their per-person entry band.
      const bandId = who === 'jonathan' ? 'living-heart-home' : `${who}-entries`
      await expect(page.getByTestId(bandId)).toBeVisible()
      await expectNoSeriousA11y(page, {
        include: `[data-testid="${bandId}"]`,
        only: ['color-contrast'],
        label: `${who} entry band`,
      })
    })
  }

  // Family-trips shift (Phase 1): the STAY home view replaces the road-trip ticker
  // with a place card. Render-level coverage for the new conditional surface + its
  // contrast (a brand-new branch + serif/mono labels — the class of bug that only
  // axe/e2e real-renders ever caught on this project).
  test('jonathan stay home — place card renders + no serious a11y', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP) // volleyball = a STAY (one base + homeBase)
    await page.goto(`/?person=jonathan&trip=volleyball-2026&nosw=1`)
    await expect(page.getByTestId('stay-place-card')).toBeVisible()
    // The "nearest bathroom/fast-food" queue is a driving need — gone on a stay.
    await expect(page.getByText("WHERE'S THE NEAREST")).toHaveCount(0)
    await expectNoSeriousA11y(page, {
      include: '[data-testid="stay-place-card"]',
      only: ['color-contrast'],
      label: 'jonathan stay place card',
    })
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
//
// Scans BOTH trip shapes full-page, because the recenter splits the bottom nav:
// a ROUTE keeps the FamilyDock (its active/inactive pill + --muted-label
// contrast), a STAY swaps in the StayTabBar AND renders stay-only chrome (the
// place card, the stay home body). Gating only one shape would drop the other's
// body + bottom-nav from the full-page contrast sweep — and the STAY is the new
// default, so Rafa's stay home (no entry-band/place-card scoped test of its own)
// must stay covered. So: loop the four personas × both shapes.
const TRIP_SHAPES = [
  { name: 'route', fixture: FIXTURE_ROUTE_TRIP, trip: 'roadtrip-2026', bottomNav: '.switcher' },
  { name: 'stay', fixture: FIXTURE_TRIP, trip: 'volleyball-2026', bottomNav: '.stay-tabbar' },
]
test.describe('a11y (axe, serious+critical) — S2 trip-view ×4 personas × shape', () => {
  for (const shape of TRIP_SHAPES) {
    for (const p of TRAVELERS) {
      test(`trip view — ${shape.name} — ${p}`, async ({ page }) => {
        await seedTripIntoCache(page, shape.fixture)
        await mockClaudeChatWorker(page)
        await page.goto(`/?person=${p}&trip=${shape.trip}&nosw=1`)
        // Wait for the shape's bottom nav (route → dock, stay → tab bar) so the
        // scan sees the final-state chrome, not a mid-render frame.
        await expect(page.locator(shape.bottomNav)).toBeVisible()
        // CONTRAST gate only: other serious/critical rules are separate findings
        // tracked on their own, so a non-contrast change can't redden this gate.
        await expectNoSeriousA11y(page, { label: `trip view ${shape.name} (${p})`, only: ['color-contrast'] })
      })
    }
  }
})

// StayTabBar — the family-trips recenter's bottom "WHAT" bar (We could · Now ·
// Photos · Look back) that REPLACES the dock on a stay. New surface, and exactly
// the recurring trap: small mono labels (9px, `var(--muted)` when inactive) on a
// per-lens nav background — the same --faint/--muted-fails-AA class that bit the
// trips-index eyebrows and Helen's --muted on --bg2. The dock contrast moved to a
// route fixture above; this gates the bar that took its place, ×4 personas, on a
// STAY (volleyball-2026), where it actually renders.
test.describe('a11y (axe, serious+critical) — StayTabBar ×4 personas', () => {
  for (const p of TRAVELERS) {
    test(`stay tab bar — ${p}`, async ({ page }) => {
      await seedTripIntoCache(page, FIXTURE_TRIP) // volleyball = a STAY → the tab bar shows
      await page.goto(`/?person=${p}&trip=volleyball-2026&nosw=1`)
      await expect(page.getByTestId('stay-tabbar')).toBeVisible()
      await expectNoSeriousA11y(page, {
        include: '[data-testid="stay-tabbar"]',
        only: ['color-contrast'],
        label: `stay tab bar (${p})`,
      })
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
      await openTopMenuItem(page, /Settings/i)
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
      // The Weave opens from each persona's home-band entry (the temp top-bar
      // glyph has retired). For Rafa on a phone that's his "Tonight's story"
      // tile, whose aria-label carries "Weave" so this one locator finds all 4.
      await page.getByRole('button', { name: /Weave/i }).first().click()
      await expect(page.getByTestId('the-weave')).toBeVisible()
      await expectNoSeriousA11y(page, {
        include: '[data-testid="the-weave"]',
        only: ['color-contrast'],
        label: `the weave (${p})`,
      })
    })
  }
})

// The little book — new full-screen overlay (index of kept weave pages).
// Same risk surface as TheWeave (mono micro-labels + muted body text on the
// persona bg). ALWAYS gate a new view ×4 (the recurring --faint-as-text trap).
test.describe('a11y (axe, serious+critical) — the book ×4 personas', () => {
  for (const p of TRAVELERS) {
    test(`the book — ${p}`, async ({ page }) => {
      await seedTripIntoCache(page, FIXTURE_TRIP)
      // Mock the book so the index renders a page (not the empty state).
      await page.route(/workers\.dev\/weave\/book/, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            tripId: 'volleyball-2026',
            pages: [
              {
                tripId: 'volleyball-2026',
                dayIso: '2026-05-22',
                title: 'A Day Together',
                opening: 'The family arrived in the evening.',
                closing: 'That was Friday.',
                stat: 'Day 1 · 3 stops',
                generatedAt: 1,
                keptAt: 2,
              },
            ],
          }),
        })
      })
      await page.goto(`/?person=${p}&trip=volleyball-2026&book=1&nosw=1`)
      await expect(page.getByTestId('weave-book')).toBeVisible()
      await expectNoSeriousA11y(page, {
        include: '[data-testid="weave-book"]',
        only: ['color-contrast'],
        label: `the book (${p})`,
      })
    })
  }
})

// Surprises & Masking (Slice 1) — new full-screen overlay with the recurring
// risk surfaces: accent-as-text eyebrows ("Something's coming", the CoverCard
// label, "+ New"), small mono/faint labels, and the accent-fill chips/buttons
// (the C1/Stage-2 fill-ink trap). Seed per persona so EVERY traveler renders
// both a kept card (with a CoverCard) AND a coming teaser, then gate contrast.
test.describe('a11y (axe, serious+critical) — Surprises ×4 personas', () => {
  for (const p of TRAVELERS) {
    test(`surprises surface — ${p}`, async ({ page }) => {
      await seedTripIntoCache(page, FIXTURE_TRIP)
      const other = TRAVELERS.find((x) => x !== p)
      await seedMemoriesIntoCache(page, [
        // `p` authored a cover → renders in "You're keeping" + the CoverCard.
        {
          id: 'axe-sx-cover', tripId: 'volleyball-2026', stopId: null, authorTraveler: p,
          visibility: 'shared', kind: 'text', createdAt: '2026-05-22T18:00:00.000Z',
          hideFrom: [other], reveal: { type: 'arrival', at: '5th Avenue' }, conceal: 'cover',
          cover: { icon: '🚶', title: 'A walk down Fifth Avenue', loc: '5th Avenue', time: 'Sat · 1:00 PM', weather: 'Cold & windy', packing: 'Warm coats' },
          surprise: { what: 'A stop', icon: '🎹', title: 'The giant floor piano', detail: 'Secret detour Saturday.', tint: '#C24B2E' },
        },
        // `other` authored a teaser hidden from `p` → renders in "Something's coming".
        {
          id: 'axe-sx-teaser', tripId: 'volleyball-2026', stopId: null, authorTraveler: other,
          visibility: 'shared', kind: 'text', createdAt: '2026-05-22T18:05:00.000Z',
          hideFrom: [p], reveal: { type: 'date', at: '2026-06-15' }, conceal: 'teaser',
          surprise: { what: 'A photo', icon: '🖼️', title: "Father's Day card", detail: 'a printed frame.', tint: '#5C4A52' },
        },
        // `other` authored a now-REVEALED surprise hidden from `p` → renders in
        // the "✨ Revealed for you" section (Slice 2).
        {
          id: 'axe-sx-revealed', tripId: 'volleyball-2026', stopId: null, authorTraveler: other,
          visibility: 'shared', kind: 'text', createdAt: '2026-05-22T18:06:00.000Z',
          hideFrom: [p], reveal: { type: 'manual' }, conceal: 'teaser', revealed: '2026-05-23T00:00:00.000Z',
          surprise: { what: 'A memory', icon: '🧁', title: 'Birthday cupcake', detail: 'a candle at breakfast.', tint: '#7A5A3A' },
        },
      ])
      await page.goto(`/?person=${p}&trip=volleyball-2026&surprises=1&nosw=1`)
      await expect(page.getByTestId('surprises-view')).toBeVisible()
      await expectNoSeriousA11y(page, {
        include: '[data-testid="surprises-view"]',
        only: ['color-contrast'],
        label: `surprises surface (${p})`,
      })
    })

    test(`surprises composer (cover mode) — ${p}`, async ({ page }) => {
      await seedTripIntoCache(page, FIXTURE_TRIP)
      // A p-authored photo so the rebuilt composer's "wrap" picker has a real
      // item to choose (the masking model only lets you wrap your OWN memory),
      // which is what discloses the ②③④ sections + the cover form.
      await seedMemoriesIntoCache(page, [{
        id: 'axe-wrap-photo', tripId: 'volleyball-2026', stopId: 'vb1-3', authorTraveler: p,
        visibility: 'shared', kind: 'photo', caption: 'a wrappable photo',
        photoExternalURLs: [TINY_RED_PNG_DATA_URL], createdAt: '2026-05-22T18:10:00.000Z', capturedAt: '2026-05-22T18:10:00.000Z',
      }])
      await page.goto(`/?person=${p}&trip=volleyball-2026&surprises=1&nosw=1`)
      await expect(page.getByTestId('surprises-view')).toBeVisible()
      await page.getByRole('button', { name: /New/i }).click()
      // Pick "A photo" and wrap the real one → content step satisfied, so the
      // reveal pickers (date input + place select) + cover form disclose.
      await page.getByRole('button', { name: 'A photo' }).click()
      await page.getByRole('button', { name: 'a wrappable photo' }).first().click()
      await page.getByRole('button', { name: /On a date/i }).click()
      await expect(page.getByLabel('Reveal date')).toBeVisible()
      await page.getByRole('button', { name: /When they arrive/i }).click()
      // Cover-story mode → the densest control set (cover fields + accent submit).
      await page.getByRole('button', { name: /A cover story/i }).click()
      await expect(page.getByRole('button', { name: /Hide it behind the cover/i })).toBeVisible()
      await expectNoSeriousA11y(page, {
        include: '[data-testid="surprises-view"]',
        only: ['color-contrast'],
        label: `surprises composer (${p})`,
      })
    })
  }
})

// Share-out Phase 2 / E1 — the in-app Composer (a new visible surface). Seed a
// shared photo so the select grid + caption + Share button render, then gate
// contrast per persona (the sheet themes via the app's vars like the others).
test.describe('a11y (axe, serious+critical) — Share Composer ×4 personas', () => {
  for (const p of TRAVELERS) {
    test(`share composer — ${p}`, async ({ page }) => {
      await seedTripIntoCache(page, FIXTURE_TRIP)
      await seedMemoriesIntoCache(page, [{
        id: 'axe-compose-photo', tripId: 'volleyball-2026', stopId: 'vb1-3', authorTraveler: p,
        visibility: 'shared', kind: 'photo', caption: 'a shared photo',
        photoRefs: [{ storage: 'r2', key: 'k-axe', url: TINY_RED_PNG_DATA_URL }],
        createdAt: '2026-05-22T18:00:00.000Z', capturedAt: '2026-05-22T18:00:00.000Z',
      }])
      await page.goto(`/?person=${p}&trip=volleyball-2026&compose=1&nosw=1`)
      await expect(page.getByTestId('share-composer')).toBeVisible()
      // E3 + E4: the "Add new" tab + the voice/note quick-actions + the open note
      // editor (a dense select-step surface).
      await page.getByRole('button', { name: 'Add new' }).click()
      await expect(page.getByRole('button', { name: /^Add photos/i })).toBeVisible()
      await page.getByRole('button', { name: /Write a note/i }).click()
      await expect(page.getByLabel('Note')).toBeVisible()
      await expectNoSeriousA11y(page, {
        include: '[data-testid="share-composer"]',
        only: ['color-contrast'],
        label: `share composer add-new + note editor (${p})`,
      })
      // Add a note slip, then walk into Arrange (layout chips + preview + caption +
      // Share) so the gate covers the E2 controls AND the E4 note-slip preview tile.
      await page.getByLabel('Note').fill('a note for the contrast gate')
      await page.getByRole('button', { name: /Add note/i }).click()
      await page.getByRole('button', { name: 'On this trip' }).click()
      await page.getByRole('button', { name: 'Select photo' }).first().click()
      await page.getByRole('button', { name: /Next . Arrange/i }).click()
      await expect(page.getByRole('button', { name: 'Mosaic' })).toBeVisible()
      await expectNoSeriousA11y(page, {
        include: '[data-testid="share-composer"]',
        only: ['color-contrast'],
        label: `share composer arrange + note tile (${p})`,
      })
    })
  }
})
