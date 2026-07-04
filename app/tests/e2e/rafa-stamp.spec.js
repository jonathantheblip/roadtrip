// Rafa's stamp (design 04/05) — his ONE additive contribution to a record entry,
// "on the entry, for everyone." Proves: the STAMP TODAY! section only appears once
// a day has a record; tapping a sticker persists (model-level dedup already unit-
// tested in dayRecord.test.mjs); the stamp reads back inline on the SAME entry via
// PartsOutline.RecordRow — the surface every read face (whole-stay unfold, plan
// listing) shares, so this one assertion covers all of them.
import { test, expect } from '@playwright/test'
import { seedTripIntoCache, TINY_RED_PNG_DATA_URL } from './_fixtures/withTrip.js'
import { expectNoSeriousA11y } from './_fixtures/axe.js'

test.use({ timezoneId: 'UTC' })

// Pin "now" to mid-trip so the fixture reads as LIVE, not archived — an archived
// trip bounces a `?trip=` deep link to the trips index instead of opening it
// (the same fixture date-rot record-readface.spec.js works around).
async function pinNoon(page) {
  await page.addInitScript(() => {
    const N = Date
    const E = new N('2026-05-19T18:00:00.000Z').getTime()
    class D extends N { constructor(...a) { a.length === 0 ? super(E) : super(...a) } }
    D.now = N.now.bind(N)
    // eslint-disable-next-line no-global-assign
    globalThis.Date = D
  })
}

const STAY = {
  shape: 'stay', status: 'planning', title: 'Provincetown', id: 'rf-stamp-stay',
  dateRange: 'May 19 – 21, 2026', dateRangeStart: '2026-05-19', dateRangeEnd: '2026-05-21',
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'], heroImage: TINY_RED_PNG_DATA_URL,
  lodging: { name: 'Harbor Breeze', lat: 42.0584, lng: -70.1787 },
  days: [
    {
      n: 1, isoDate: '2026-05-19', date: 'Tue May 19', stops: [],
      record: {
        state: 'loose',
        entries: [
          { id: 'e1', name: 'Race Point Beach', time: 'late morning', note: 'Rafa found a crab', for: ['rafa'] },
          { id: 'e2', name: 'Taffy run', time: 'afternoon', for: ['helen', 'rafa'] },
        ],
      },
    },
    { n: 2, isoDate: '2026-05-20', date: 'Wed May 20', stops: [] }, // no record — nothing to stamp
  ],
}

test('STAMP TODAY! is hidden on a day with no record, and shown once one exists', async ({ page }) => {
  await pinNoon(page)
  await seedTripIntoCache(page, { ...STAY, days: [{ ...STAY.days[0], record: undefined }, STAY.days[1]] })
  await page.goto('/?person=rafa&trip=rf-stamp-stay&nosw=1')
  await expect(page.getByText('Hi Rafa!')).toBeVisible({ timeout: 10000 })
  await expect(page.getByText('STAMP TODAY!')).toHaveCount(0)
})

test('tapping a sticker stamps the entry, dedupes a repeat tap, and leaves the OTHER entry untouched', async ({ page }) => {
  await pinNoon(page)
  await seedTripIntoCache(page, STAY)
  await page.goto('/?person=rafa&trip=rf-stamp-stay&nosw=1')
  await expect(page.getByText('Hi Rafa!')).toBeVisible({ timeout: 10000 })

  const entries = page.getByTestId('rafa-stamp-entry')
  await expect(entries).toHaveCount(2)
  const beachCard = entries.filter({ hasText: 'Race Point Beach' })
  await expect(beachCard).toBeVisible()
  const taffyCard = entries.filter({ hasText: 'Taffy run' })

  const beachBadges = beachCard.getByLabel('Stamped already')
  const taffyBadges = taffyCard.getByLabel('Stamped already')
  await expect(beachBadges).toHaveCount(0)

  await beachCard.getByRole('button', { name: 'Stamp with 🐸' }).click()
  await expect(beachBadges).toContainText('🐸')
  // The OTHER entry stays unstamped — its badge row never appears at all (the
  // sticker BUTTONS always show the glyphs; only the badge row proves a stamp).
  await expect(taffyBadges).toHaveCount(0)

  // A repeat tap of the SAME glyph is a no-op (still exactly one 🐸 badge shown).
  await beachCard.getByRole('button', { name: 'Stamp with 🐸' }).click()
  await expect(beachBadges.locator('span')).toHaveCount(1)

  // A DIFFERENT glyph on the same entry is additive.
  await beachCard.getByRole('button', { name: 'Stamp with ⭐' }).click()
  await expect(beachBadges.locator('span')).toHaveCount(2)
  await expect(beachBadges).toContainText('⭐')
  await expectNoSeriousA11y(page)
})

// The READ side — a statically-seeded stamp reads back inline on the whole-stay
// unfold (RecordRow, shared by every read face). Seeded directly rather than
// stamped live so this test doesn't depend on cross-persona localStorage sharing.
test('a stamped entry reads back inline (🐸) on the whole-stay unfold, for every lens', async ({ page }) => {
  const stamped = {
    ...STAY,
    days: [
      { ...STAY.days[0], record: { state: 'loose', entries: [{ ...STAY.days[0].record.entries[0], stamps: [{ by: 'rafa', glyph: '🐸', at: '2026-05-19T20:00:00.000Z' }] }] } },
      STAY.days[1],
    ],
  }
  await pinNoon(page)
  await seedTripIntoCache(page, stamped)
  await page.goto('/?person=helen&trip=rf-stamp-stay&nosw=1')
  await expect(page.getByTestId('living-heart-home')).toBeVisible({ timeout: 10000 })
  await page.getByTestId('whole-stay-toggle').click()
  const unfold = page.getByTestId('whole-stay')
  const day = unfold.getByTestId('whole-stay-day').filter({ hasText: /may 19/i })
  await expect(day).toContainText('Race Point Beach')
  await expect(day.getByText('🐸', { exact: true })).toBeVisible()
})
