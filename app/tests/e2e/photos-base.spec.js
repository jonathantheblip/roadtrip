import { test, expect } from './_fixtures/clockStub.js'
import {
  seedTripIntoCache,
  seedMemoriesIntoCache,
  FIXTURE_TRIP,
  TINY_RED_PNG_DATA_URL,
} from './_fixtures/withTrip.js'
import { expectNoSeriousA11y } from './_fixtures/axe.js'
// Phase 1 — "being at a PLACE". The two NEW rendered surfaces of the base/place
// model, end-to-end (not just the unit tests): the album's "At [place]" section
// and the planning toggle.
//
// These were the first axe scans of the PhotosView album + the TripEditor; they
// surfaced pre-existing small-text contrast debt (the eyebrow's opacity-0.8 on
// --muted, the tile date/location labels, and the editor's opacity-50/60 micro-
// labels — all the "--faint = decorative" trap). That debt is now FIXED (the
// opacity multipliers are gone), so these specs re-gate axe on both surfaces,
// helen included (the light persona where --muted has the thinnest margin), so
// the contrast can't silently regress again.

function photoOn(stopId, id, caption) {
  return {
    id,
    tripId: 'volleyball-2026',
    stopId,
    // Helen's surface IS the shared PhotosView (the "AT" eyebrow lives there);
    // Jonathan's photos render in his bespoke JRecord, a different surface.
    authorTraveler: 'helen',
    visibility: 'shared',
    kind: 'photo',
    caption,
    photoRef: { storage: 'external', url: TINY_RED_PNG_DATA_URL },
    photoExternalURLs: [],
    reactions: [],
    createdAt: '2026-05-22T22:00:00Z',
    updatedAt: '2026-05-22T22:00:00Z',
  }
}

async function openPhotos(page) {
  for (const tid of ['jonathan-photos-entry', 'helen-photos-entry', 'aurelia-photos-entry', 'rafa-photos-entry']) {
    const loc = page.getByTestId(tid)
    if (await loc.count()) {
      await loc.click()
      return
    }
  }
  throw new Error('No Photos entry point found on this view')
}

test.describe('PhotosView — base ("At [place]") section', () => {
  test('a photo on a lodging stop renders an "AT" base section (time dropped)', async ({ page }) => {
    // vb1-3 "Beach Bungalow" is a lodging stop → a base by default. Existing
    // fixtures leave it photo-less; attaching one renders the base section.
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [photoOn('vb1-3', 'bp1', 'On the porch')])
    await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
    await openPhotos(page)

    const base = page.getByTestId('stop-group').filter({ hasText: 'Beach Bungalow' })
    await expect(base).toHaveCount(1)
    // The eyebrow is "AT · <date>" (rendered uppercase via CSS) — the place
    // marker plus the kept date, in place of a clock time.
    await expect(base).toContainText(/AT · Fri May 22/i)
    // The stop's "Evening" clock label is suppressed for a base (it's a place).
    await expect(base).not.toContainText(/Evening/i)

    // Contrast: the album eyebrows + tile labels now meet AA (helen is the
    // light-persona worst case — --muted has the thinnest margin here).
    await expectNoSeriousA11y(page, { label: 'photos base section (helen)' })
  })
})

const DRAFT_TRIP = {
  id: 'draft-base-1',
  draft: true,
  status: 'planning',
  title: 'Cabin weekend',
  dateRange: 'Jul 4 – 6, 2026',
  dateRangeStart: '2026-07-04',
  dateRangeEnd: '2026-07-06',
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
  overview: 'A draft used to exercise the base toggle.',
  days: [
    {
      n: 1,
      date: 'Sat Jul 4',
      isoDate: '2026-07-04',
      title: 'Arrive',
      stops: [
        { id: 'd1', time: '4:00 PM', name: 'The Cabin', kind: 'lodging', for: ['jonathan'], note: 'home base', address: '1 Cabin Rd', lat: 44.1, lng: -72.5 },
        { id: 'd2', time: '7:00 PM', name: 'Dinner', kind: 'food', for: ['jonathan'], note: 'eat out', address: '2 Main St', lat: 44.11, lng: -72.51 },
      ],
    },
  ],
}

test.describe('TripEditor — base toggle', () => {
  for (const person of ['jonathan', 'helen']) {
    test(`a lodging stop defaults to base ON, a non-lodging stop OFF (${person})`, async ({ page }) => {
      await seedTripIntoCache(page, DRAFT_TRIP)
      await page.goto(`/?person=${person}&nosw=1`)
      // Reach the trips index, where drafts (and their Edit affordance) live.
      await page.getByRole('button', { name: /trips/i }).first().click()
      await page.getByRole('button', { name: `Edit draft ${DRAFT_TRIP.title}` }).click()

      const toggles = page.getByRole('checkbox', { name: /staying here/i })
      await expect(toggles).toHaveCount(2)
      await expect(toggles.nth(0)).toBeChecked() // lodging → base by default
      await expect(toggles.nth(1)).not.toBeChecked() // food → not a base

      // Opt the lodging stop OUT; it persists as an explicit off.
      await toggles.nth(0).uncheck()
      await expect(toggles.nth(0)).not.toBeChecked()

      // The editor field + micro-labels meet AA (helen = light-persona worst case).
      await expectNoSeriousA11y(page, { label: `trip editor base toggle (${person})` })
    })
  }
})
