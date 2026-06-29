import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache } from './_fixtures/withTrip.js'
import { expectNoSeriousA11y } from './_fixtures/axe.js'

// Composite trips on the living heart — a saved COMPOSITE trip (a city break, a
// multi-leg odyssey) renders the ONE shape-aware living-heart home: it leads with
// the part it's in now + a just-in-time "Next up" ticket, and folds the full plan
// (parts → real timed days) in below. There is no separate parts-only view.
//
// A Rome→Florence city break: explicit parts[] + a flat days[] (the worker stores
// both — days carry the detail, parts the high-level shape). The view DERIVES each
// part's days by date and enumerates the window so empty days read as loose.
// The window contains the clock-stub's pinned "today" (2026-05-23) so the app
// opens it directly via ?trip= — App's cold-load override bounces a ?trip= whose
// window doesn't contain today back to the index (see App.jsx). The dates are
// otherwise immaterial to PartsTripView.
const COMPOSITE = {
  id: 'italy-citybreak',
  draft: false,
  status: 'planning',
  title: 'Italy — a city break',
  subtitle: 'Rome, then Florence.',
  dateRangeStart: '2026-05-22',
  dateRangeEnd: '2026-05-26',
  dateRange: 'May 22 – 26, 2026',
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
  parts: [
    { id: 'p-rome', type: 'city', title: 'Three days in Rome', place: 'Rome', dateStart: '2026-05-22', dateEnd: '2026-05-24' },
    { id: 'p-flor', type: 'city', title: 'Two days in Florence', place: 'Florence', dateStart: '2026-05-25', dateEnd: '2026-05-26' },
  ],
  days: [
    {
      n: 1, isoDate: '2026-05-22', date: 'Fri, May 22', title: 'Arrive Rome',
      stops: [{ id: 's1', time: '3:00 PM', name: 'Colosseum', kind: 'sight', for: ['jonathan'], note: 'Skip-the-line tickets.', address: 'Piazza del Colosseo, Rome' }],
    },
    // May 23 has NO day → it must render as a loose "open space" day in Rome.
    {
      n: 3, isoDate: '2026-05-24', date: 'Sun, May 24', title: 'Vatican',
      stops: [{ id: 's3', time: '9:00 AM', name: 'Vatican Museums', kind: 'sight', for: ['helen', 'aurelia'], note: '', address: 'Vatican City' }],
    },
    {
      n: 4, isoDate: '2026-05-25', date: 'Mon, May 25', title: 'Train to Florence',
      stops: [{ id: 's4', time: '5:00 PM', name: 'Ponte Vecchio sunset', kind: 'sight', for: [], note: '', address: 'Ponte Vecchio, Florence' }],
    },
    // May 26 has no day → loose day in Florence.
  ],
}

const url = (who) => `/?person=${who}&trip=italy-citybreak&nosw=1`

test.describe('Composite trips on the living heart — real timed parts', () => {
  test('a composite trip renders its parts with timed days (real + loose), shedding the day-tab IA', async ({ page }) => {
    await seedTripIntoCache(page, COMPOSITE)
    await page.goto(url('jonathan'))

    const view = page.locator('[data-testid="living-heart-home"]')
    await expect(view).toBeVisible({ timeout: 10_000 })

    // The trip title + a "2 parts · N days" summary.
    await expect(view).toContainText('Italy — a city break')

    // Two parts, both cities.
    const parts = page.locator('[data-testid="parts-trip-part"]')
    await expect(parts).toHaveCount(2)
    await expect(parts.first()).toContainText('Three days in Rome')
    await expect(parts.nth(1)).toContainText('Two days in Florence')

    // Rome's window (May 22–24) is enumerated into 3 day rows; May 23 has no plan
    // → it shows as a loose "open space" day. Real stops render where present.
    await expect(view).toContainText('Colosseum')
    await expect(view).toContainText('Vatican Museums')
    const loose = page.locator('[data-testid="parts-trip-day"][data-loose="1"]')
    await expect(loose.first()).toBeVisible()
    await expect(loose.first()).toContainText('Open')

    // The day-centric road-trip IA is GONE for a city trip — no day-tab chips.
    await expect(page.locator('.jj-day-chip')).toHaveCount(0)

    // The living heart is SHAPE-AWARE for a complex trip: it leads with the part
    // it's in now ("In Rome" on May 23) and surfaces the next timed thing
    // just-in-time (the Vatican, May 24) — its detail carries the ticket.
    await expect(view).toContainText('In Rome')
    await expect(page.getByTestId('next-up')).toContainText('Vatican Museums')

    await expectNoSeriousA11y(page)
  })

  test('the parts view also renders for Helen and Aurelia (the reading lenses), AA-clean', async ({ page }) => {
    await seedTripIntoCache(page, COMPOSITE)
    for (const who of ['helen', 'aurelia']) {
      await page.goto(url(who))
      await expect(page.locator('[data-testid="living-heart-home"]')).toBeVisible({ timeout: 10_000 })
      await expect(page.locator('[data-testid="parts-trip-part"]')).toHaveCount(2)
      // Helen's paper lens is the historical contrast trap (muted text on paper);
      // the loose "open" lines must stay AA — guard it where it actually renders.
      await expectNoSeriousA11y(page)
    }
  })

  test('the editor shows the parts (read-only) for a composite draft', async ({ page }) => {
    const draft = { ...COMPOSITE, draft: true, overview: 'Rome, then Florence.' }
    await seedTripIntoCache(page, draft)
    await page.goto('/?person=jonathan&nosw=1')
    // Land on the index (the trips/planning surface) where drafts live.
    const back = page.getByRole('button', { name: /back to trips/i })
    if (await back.isVisible().catch(() => false)) await back.click()
    // The draft surfaces in the index "Drafts" section; open it in the editor.
    await page.getByRole('button', { name: /Edit draft/i }).first().click({ timeout: 10_000 })
    // The editor's read-only parts section reflects the trip's shape.
    await expect(page.getByText(/The parts · 2/i)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Three days in Rome')).toBeVisible()
    await expect(page.getByText('Two days in Florence')).toBeVisible()
  })

  test('Rafa keeps his storybook view — not the living heart', async ({ page }) => {
    await seedTripIntoCache(page, COMPOSITE)
    await page.goto(url('rafa'))
    // His RafaView still renders (it reads the flat days), so the page is alive…
    await page.waitForLoadState('networkidle')
    // …but the unified living-heart home is NOT used for him (storybook by design).
    await expect(page.locator('[data-testid="living-heart-home"]')).toHaveCount(0)
  })
})
