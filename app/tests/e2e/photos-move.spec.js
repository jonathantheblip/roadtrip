import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, seedMemoriesIntoCache, FIXTURE_TRIP, TINY_RED_PNG_DATA_URL } from './_fixtures/withTrip.js'

// Ch3 photo-moves (Ch3a): ANY ADULT can hand-file a photo to a different place
// from the lightbox — the move stamps a manual provenance the LIVE worker LOCKS
// (authorship outranks the machine), and the lightbox shows the honest "locked"
// note. Rafa is excluded by rule: no move control, no note.

function photoMemory({ id, stopId = 'vb2-3', authorTraveler = 'helen', stopProv = null }) {
  return {
    id, tripId: 'volleyball-2026', stopId, authorTraveler,
    visibility: 'shared', kind: 'photo',
    capturedAt: '2026-05-23T07:00:00.000Z',
    photoRef: { storage: 'external', url: TINY_RED_PNG_DATA_URL },
    photoExternalURLs: [], reactions: [],
    ...(stopProv ? { stopProv } : {}),
    createdAt: '2026-05-24T22:00:00.000Z', updatedAt: '2026-05-24T22:00:00.000Z',
  }
}

// FIXTURE_TRIP + a stop hidden from Helen (a surprise Jonathan is planning). It
// must NEVER surface as a move target for Helen (surprise-masking, invariant 5).
const TRIP_WITH_SECRET = {
  ...FIXTURE_TRIP,
  days: [
    ...FIXTURE_TRIP.days,
    {
      n: 4, isoDate: '2026-05-25', title: 'Secret day',
      stops: [
        { id: 'secret-stop', name: "Rosa's Trattoria", kind: 'tournament',
          surprise: { author: 'jonathan', hideFrom: ['helen'], reveal: { type: 'manual' } } },
      ],
    },
  ],
}

async function openLightbox(page, persona) {
  await page.goto(`/?person=${persona}&trip=volleyball-2026&nosw=1`)
  await page.getByTestId(`${persona}-photos-entry`).click()
  await page.getByTestId('photo-tile').first().click()
  await expect(page.getByTestId('photo-lightbox')).toBeVisible()
}

const stored = (page, id) =>
  page.evaluate((mid) => JSON.parse(localStorage.getItem('rt_memories_shared_v1') || '[]').find((m) => m.id === mid), id)

test.describe('album photo moves (Ch3a)', () => {
  test('an ADULT hand-moves a photo to another place → it files there, LOCKS (manual prov), and shows the locked note', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [photoMemory({ id: 'mv1', stopId: 'vb2-3', authorTraveler: 'helen' })])
    // Jonathan is an adult but NOT the author — Move is any-adult (unlike delete).
    await openLightbox(page, 'jonathan')

    await expect(page.getByTestId('lightbox-move-to')).toBeVisible()
    await page.getByTestId('lightbox-move-to').click()
    await expect(page.getByTestId('move-sheet')).toBeVisible()
    // Pick a different stop.
    await page.getByTestId('move-sheet').getByText('Match 1 vs Northeast 13.2').click()

    // The filing moved + LOCKED with a manual provenance stamped by the mover.
    await expect.poll(async () => (await stored(page, 'mv1'))?.stopId).toBe('vb3-4')
    const prov = (await stored(page, 'mv1'))?.stopProv
    expect(prov?.source).toBe('manual')
    expect(prov?.by).toBe('jonathan')
    expect(prov?.reason).toBe('hand-filed')

    // The lightbox shows the honest locked note (Jonathan's own move → "you").
    await expect(page.getByTestId('lightbox-moved-note')).toContainText('Locked.')
  })

  test('Rafa is EXCLUDED — no move control, and no locked note even on a hand-moved photo', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [
      photoMemory({ id: 'mv2', stopId: 'vb3-4', authorTraveler: 'helen', stopProv: { source: 'manual', by: 'helen', reason: 'hand-filed', targetLabel: 'Match 1 vs Northeast 13.2' } }),
    ])
    await openLightbox(page, 'rafa')
    await expect(page.getByTestId('lightbox-move-to')).toHaveCount(0) // no move control
    await expect(page.getByTestId('lightbox-moved-note')).toHaveCount(0) // never meets the note
  })

  test('surprise-masking: a stop hidden from the viewer is NEVER a move target (no leak)', async ({ page }) => {
    await seedTripIntoCache(page, TRIP_WITH_SECRET)
    await seedMemoriesIntoCache(page, [photoMemory({ id: 'mv3', stopId: 'vb2-3', authorTraveler: 'helen' })])
    await openLightbox(page, 'helen')
    await page.getByTestId('lightbox-move-to').click()
    await expect(page.getByTestId('move-sheet')).toBeVisible()
    // The secret stop's REAL name never appears (Helen is masked from it).
    await expect(page.getByTestId('move-sheet')).not.toContainText("Rosa's Trattoria")
    // Sanity: the sheet still offers the ordinary stops (it isn't just empty).
    await expect(page.getByTestId('move-sheet').getByText('Match 1 vs Northeast 13.2')).toBeVisible()
  })
})
