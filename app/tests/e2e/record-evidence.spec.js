// THE RECORD · the evidence engine (R4) — a hangout day drafts itself from photos.
// In the evening, a day with NO named record but rich photo evidence (GPS + time
// clustering into ≥2 pins) still offers a settle card — showing the pins as honest
// DASHED guesses. Keeping persists those pins as DRAFT entries (unnamed-and-kept is
// valid), so the kept day carries its places and the unfold shows the dashed drafts.
//
// The card is evening-gated + reads the day LEG-LOCAL, so pin the browser tz to UTC
// and the clock to an evening inside the trip window (the deploy-verify TZ lesson).
import { test, expect } from '@playwright/test'
import { seedTripIntoCache, seedMemoriesIntoCache, TINY_RED_PNG_DATA_URL } from './_fixtures/withTrip.js'

test.use({ timezoneId: 'UTC' })

async function pinEvening(page) {
  await page.addInitScript(() => {
    const Native = Date
    const EVE = new Native('2026-05-23T23:30:00.000Z').getTime()
    class D extends Native {
      constructor(...a) { a.length === 0 ? super(EVE) : super(...a) }
    }
    D.now = Native.now.bind(Native)
    // eslint-disable-next-line no-global-assign
    globalThis.Date = D
  })
}

const readRecord = (page, id, iso) => page.evaluate(({ id, iso }) => {
  const all = JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]')
  return all.find((t) => t.id === id)?.days?.find((d) => d.isoDate === iso)?.record ?? null
}, { id, iso })

// A stay whose TODAY (2026-05-23) is a hangout day: no stops, no named record.
const STAY = {
  shape: 'stay', status: 'planning', title: 'Provincetown', subtitle: 'fixture', id: 'evi-stay',
  dateRange: 'May 22 – 25, 2026', dateRangeStart: '2026-05-22', dateRangeEnd: '2026-05-25',
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
  heroImage: TINY_RED_PNG_DATA_URL,
  lodging: { name: 'Harbor Breeze', address: '690 Commercial St, Provincetown, MA', lat: 42.0584, lng: -70.1787 },
  days: [
    { n: 1, isoDate: '2026-05-22', date: 'Fri May 22', title: 'Arrive', lodging: 'Harbor Breeze', stops: [] },
    { n: 2, isoDate: '2026-05-23', date: 'Sat May 23', title: '', lodging: 'Harbor Breeze', stops: [] },
    { n: 3, isoDate: '2026-05-24', date: 'Sun May 24', title: 'Dunes', lodging: 'Harbor Breeze', stops: [] },
  ],
}

// Two beach photos (~55m apart, 20 min) → one pin; a shop photo ~1.1km away → a
// second pin. Two pins → RICH evidence, even with nothing named.
function locatedMem(id, { lat, lng, at, label, author = 'helen' }) {
  return {
    id, tripId: 'evi-stay', authorTraveler: author, visibility: 'shared', kind: 'photo',
    capturedAt: at, createdAt: at, updatedAt: at,
    photoRefs: [{ storage: 'external', url: TINY_RED_PNG_DATA_URL, lat, lng, capturedAt: at, locationLabel: label }],
  }
}

test('a hangout day drafts itself from photos → the settle card shows pins, keep persists drafts', async ({ page }) => {
  await pinEvening(page)
  await seedTripIntoCache(page, STAY)
  await seedMemoriesIntoCache(page, [
    locatedMem('m-beach-1', { lat: 42.0500, lng: -70.2400, at: '2026-05-23T15:00:00.000Z', label: 'Race Point' }),
    locatedMem('m-beach-2', { lat: 42.0505, lng: -70.2400, at: '2026-05-23T15:20:00.000Z', label: 'Race Point' }),
    locatedMem('m-shop-1', { lat: 42.0600, lng: -70.2400, at: '2026-05-23T18:00:00.000Z', label: '' }),
  ])
  await page.goto('/?person=helen&trip=evi-stay&nosw=1')
  const home = page.getByTestId('living-heart-home')
  await expect(home).toBeVisible({ timeout: 10000 })

  // The card offers to keep — drafted from evidence, not from a named record.
  const settle = home.getByTestId('settle-card')
  await expect(settle).toBeVisible()
  await expect(settle).toHaveAttribute('data-settle-state', 'keep')
  await expect(settle).toContainText(/2 places today/i)
  const chips = settle.getByTestId('settle-pin-chip')
  await expect(chips).toHaveCount(2)
  await expect(chips.filter({ hasText: 'Race Point' })).toHaveCount(1)
  await expect(chips.filter({ hasText: /a spot/i })).toHaveCount(1) // the label-less shop pin, honest

  // Keep it. The card flips to kept; the pins persist as UNNAMED drafts.
  await settle.getByTestId('settle-keep').click()
  await expect(settle).toHaveAttribute('data-settle-state', 'kept', { timeout: 3000 })
  // The kept card sheds its primary keep button; the way back in is the quiet
  // re-open door (kept ≠ closed — additive re-keep is settle-sheet-verbs.spec.js).
  await expect(home.getByTestId('settle-keep')).toHaveCount(0)
  await expect(home.getByTestId('settle-reopen')).toBeVisible()

  await expect.poll(() => readRecord(page, 'evi-stay', '2026-05-23'), { timeout: 4000 }).not.toBeNull()
  const rec = await readRecord(page, 'evi-stay', '2026-05-23')
  expect(rec.state).toBe('kept')
  expect(rec.entries.length).toBe(2)
  expect(rec.entries.every((e) => e.name === '' && e.source === 'evidence')).toBe(true)

  // The kept day shows its drafts (dashed) on the whole-stay unfold (collapsed by default).
  await home.getByTestId('whole-stay-toggle').click()
  await expect(page.getByTestId('record-draft-row').first()).toBeVisible({ timeout: 4000 })
})

test('the settle sheet names a pin → it graduates to a memory; an un-named pin stays a draft', async ({ page }) => {
  await pinEvening(page)
  await seedTripIntoCache(page, STAY)
  await seedMemoriesIntoCache(page, [
    locatedMem('m-beach-1', { lat: 42.0500, lng: -70.2400, at: '2026-05-23T15:00:00.000Z', label: 'Race Point' }),
    locatedMem('m-beach-2', { lat: 42.0505, lng: -70.2400, at: '2026-05-23T15:20:00.000Z', label: 'Race Point' }),
    locatedMem('m-shop-1', { lat: 42.0600, lng: -70.2400, at: '2026-05-23T18:00:00.000Z', label: '' }),
  ])
  await page.goto('/?person=helen&trip=evi-stay&nosw=1')
  const home = page.getByTestId('living-heart-home')
  await expect(home).toBeVisible({ timeout: 10000 })

  // Open the sheet from the card and name the first pin (the beach), leave the shop blank.
  await home.getByTestId('settle-lookover').click()
  const sheet = page.getByTestId('settle-sheet')
  await expect(sheet).toBeVisible()
  const inputs = sheet.getByTestId('sheet-name-input')
  await expect(inputs).toHaveCount(2)
  await inputs.first().fill('Race Point Beach')
  await sheet.getByTestId('sheet-keep').click()

  await expect.poll(() => readRecord(page, 'evi-stay', '2026-05-23'), { timeout: 4000 }).not.toBeNull()
  const rec = await readRecord(page, 'evi-stay', '2026-05-23')
  expect(rec.state).toBe('kept')
  const named = rec.entries.filter((e) => e.name)
  const drafts = rec.entries.filter((e) => !e.name)
  expect(named.map((e) => e.name)).toEqual(['Race Point Beach']) // the named pin is a memory
  expect(named[0].source).toBe('evidence') // provenance kept
  expect(drafts.length).toBe(1) // the un-named shop pin stays an honest draft
})

test('the settle sheet keeps with ALL pins left blank → the day keeps its unnamed drafts, not nothing', async ({ page }) => {
  await pinEvening(page)
  await seedTripIntoCache(page, STAY)
  await seedMemoriesIntoCache(page, [
    locatedMem('m-beach-1', { lat: 42.0500, lng: -70.2400, at: '2026-05-23T15:00:00.000Z', label: 'Race Point' }),
    locatedMem('m-beach-2', { lat: 42.0505, lng: -70.2400, at: '2026-05-23T15:20:00.000Z', label: 'Race Point' }),
    locatedMem('m-shop-1', { lat: 42.0600, lng: -70.2400, at: '2026-05-23T18:00:00.000Z', label: '' }),
  ])
  await page.goto('/?person=helen&trip=evi-stay&nosw=1')
  await expect(page.getByTestId('living-heart-home')).toBeVisible({ timeout: 10000 })
  await page.getByTestId('settle-lookover').click()
  const sheet = page.getByTestId('settle-sheet')
  await expect(sheet).toBeVisible()
  await sheet.getByTestId('sheet-keep').click() // keep without naming anything

  await expect.poll(() => readRecord(page, 'evi-stay', '2026-05-23'), { timeout: 4000 }).not.toBeNull()
  const rec = await readRecord(page, 'evi-stay', '2026-05-23')
  expect(rec.state).toBe('kept')
  expect(rec.entries.length).toBe(2) // both pins persisted as honest drafts
  expect(rec.entries.every((e) => e.name === '' && e.source === 'evidence')).toBe(true)
})

test('a full day of GPS-less photos (≥6) offers to keep with an honest count, not a blank body', async ({ page }) => {
  await pinEvening(page)
  await seedTripIntoCache(page, STAY)
  // Six photos, NO coords (a screenshot/AI stay, or photos without EXIF GPS) → 0 pins
  // but a substantive day. Rich by count; the card must say so, not render empty.
  const plain = Array.from({ length: 6 }, (_, i) => ({
    id: `plain-${i}`, tripId: 'evi-stay', authorTraveler: 'helen', visibility: 'shared', kind: 'photo',
    capturedAt: `2026-05-23T1${i}:00:00.000Z`, createdAt: `2026-05-23T1${i}:00:00.000Z`, updatedAt: `2026-05-23T1${i}:00:00.000Z`,
    photoRefs: [{ storage: 'external', url: TINY_RED_PNG_DATA_URL }], // no lat/lng
  }))
  await seedMemoriesIntoCache(page, plain)
  await page.goto('/?person=helen&trip=evi-stay&nosw=1')
  const home = page.getByTestId('living-heart-home')
  await expect(home).toBeVisible({ timeout: 10000 })
  const settle = home.getByTestId('settle-card')
  await expect(settle).toHaveAttribute('data-settle-state', 'keep')
  await expect(settle.getByTestId('settle-pin-chip')).toHaveCount(0) // no places invented
  await expect(settle).toContainText(/full day/i)
  await expect(settle).toContainText(/6 photos/i) // a real count (honesty rule #3)
})

test('a quiet day (few photos, no places) stays the nothing-day tap — on the trip’s last evening', async ({ page }) => {
  // Quiet days POOL mid-trip (the settled rhythm — settle-sheet-verbs.spec.js);
  // the lone nothing-day tap survives only on the trip's LAST evening with no
  // other quiet day pending. Same THIN-evidence classification as ever.
  const LAST_DAY = {
    ...STAY, id: 'evi-stay-last',
    dateRange: 'May 22 – 23, 2026', dateRangeStart: '2026-05-22', dateRangeEnd: '2026-05-23',
    days: [
      { n: 1, isoDate: '2026-05-22', date: 'Fri May 22', title: 'Arrive', lodging: 'Harbor Breeze', stops: [],
        record: { state: 'kept', keptBy: 'jonathan', keptAt: '2026-05-22T23:00:00.000Z', nothing: true, entries: [] } },
      { n: 2, isoDate: '2026-05-23', date: 'Sat May 23', title: '', lodging: 'Harbor Breeze', stops: [] },
    ],
  }
  await pinEvening(page)
  await seedTripIntoCache(page, LAST_DAY)
  await seedMemoriesIntoCache(page, [
    // one located photo → 1 pin, and only 1 photo total → THIN (not ≥2 pins, not ≥6 photos)
    locatedMem('m-only', { lat: 42.0500, lng: -70.2400, at: '2026-05-23T15:00:00.000Z', label: 'Race Point' }),
  ].map((m) => ({ ...m, tripId: 'evi-stay-last' })))
  await page.goto('/?person=helen&trip=evi-stay-last&nosw=1')
  const home = page.getByTestId('living-heart-home')
  await expect(home).toBeVisible({ timeout: 10000 })
  const settle = home.getByTestId('settle-card')
  await expect(settle).toHaveAttribute('data-settle-state', 'nothing')
  await expect(settle).toContainText(/stayed put/i)
})
