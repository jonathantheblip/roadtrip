// THE SETTLE-SHEET VERBS (2026-07-06) — the sheet's own promise line ("fix
// what's wrong, name what's nameless, skip what you like") made true, plus the
// settled keep semantics and rhythm:
//   • per-pin "leave this out" → skipped pins never become entries, their ids
//     persist in record.skipped, and a re-open doesn't resurrect them
//   • see-inside → a pin row expands to its member photos
//   • who-correction chips → the corrected set rides the kept entry's `for`
//   • kept ≠ closed → the kept card's quiet door re-opens the sheet and a
//     re-keep merges additively (union, no dupes, names preserved)
//   • quiet days POOL (Jonathan's pick) — and a lone quiet evening mid-trip is
//     honestly silent
//   • an unrevealed surprise never drafts a pin for the person it hides from
//   • Rafa's pending "tell about today" surfaces as a sheet row with playback
//     and a one-tap tuck into the record
//   • Rafa's lens never meets the card or the sheet
//
// The card is evening-gated + reads the day LEG-LOCAL, so the browser tz is
// pinned to UTC and the clock to an evening inside the trip window (the
// deploy-verify TZ lesson). No live intervals here → chromium + webkit.
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

// A stay whose TODAY (2026-05-23) is a hangout day. Yesterday is KEPT in the
// base fixture so the rich-day tests read without a quiet-rider in the way;
// the rhythm tests override days/dates per-test.
function stay(id, overrides = {}) {
  return {
    shape: 'stay', status: 'planning', title: 'Provincetown', subtitle: 'fixture', id,
    dateRange: 'May 22 – 25, 2026', dateRangeStart: '2026-05-22', dateRangeEnd: '2026-05-25',
    travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
    heroImage: TINY_RED_PNG_DATA_URL,
    lodging: { name: 'Harbor Breeze', address: '690 Commercial St, Provincetown, MA', lat: 42.0584, lng: -70.1787 },
    days: [
      { n: 1, isoDate: '2026-05-22', date: 'Fri May 22', title: 'Arrive', lodging: 'Harbor Breeze', stops: [],
        record: { state: 'kept', keptBy: 'jonathan', keptAt: '2026-05-22T23:00:00.000Z', nothing: true, entries: [] } },
      { n: 2, isoDate: '2026-05-23', date: 'Sat May 23', title: '', lodging: 'Harbor Breeze', stops: [] },
      { n: 3, isoDate: '2026-05-24', date: 'Sun May 24', title: 'Dunes', lodging: 'Harbor Breeze', stops: [] },
    ],
    ...overrides,
  }
}

function locatedMem(id, tripId, { lat, lng, at, label = '', author = 'helen', hideFrom }) {
  return {
    id, tripId, authorTraveler: author, visibility: 'shared', kind: 'photo',
    capturedAt: at, createdAt: at, updatedAt: at,
    ...(hideFrom ? { hideFrom } : {}),
    photoRefs: [{ storage: 'external', url: TINY_RED_PNG_DATA_URL, lat, lng, capturedAt: at, locationLabel: label }],
  }
}

// Two beach photos (~55m apart) → one pin; one shop photo ~1.1km away → a
// second pin. Two pins → RICH evidence.
function richMems(tripId) {
  return [
    locatedMem('m-beach-1', tripId, { lat: 42.0500, lng: -70.2400, at: '2026-05-23T15:00:00.000Z', label: 'Race Point' }),
    locatedMem('m-beach-2', tripId, { lat: 42.0505, lng: -70.2400, at: '2026-05-23T15:20:00.000Z', label: 'Race Point' }),
    locatedMem('m-shop-1', tripId, { lat: 42.0600, lng: -70.2400, at: '2026-05-23T18:00:00.000Z', label: 'The Shop', author: 'aurelia' }),
  ]
}

async function openHome(page, id, person = 'helen') {
  await page.goto(`/?person=${person}&trip=${id}&nosw=1`)
  const home = page.getByTestId('living-heart-home')
  await expect(home).toBeVisible({ timeout: 10000 })
  return home
}

// ── FIX 2 · leave this out ───────────────────────────────────────────────────

test('leave-this-out: a skipped pin never becomes an entry, persists on the day, and a re-open doesn’t resurrect it', async ({ page }) => {
  await pinEvening(page)
  await seedTripIntoCache(page, stay('verb-skip'))
  await seedMemoriesIntoCache(page, richMems('verb-skip'))
  const home = await openHome(page, 'verb-skip')

  await home.getByTestId('settle-lookover').click()
  const sheet = page.getByTestId('settle-sheet')
  await expect(sheet).toBeVisible()
  const rows = sheet.getByTestId('sheet-pin-row')
  await expect(rows).toHaveCount(2)

  // Leave the shop pin out — the row collapses to the honest left-out face.
  const shopRow = rows.filter({ hasText: 'The Shop' })
  await shopRow.getByTestId('sheet-leave-out').click()
  await expect(sheet.locator('[data-testid="sheet-pin-row"][data-left-out="1"]')).toHaveCount(1)
  await expect(sheet.getByTestId('sheet-put-back')).toBeVisible() // never feels like a delete

  await sheet.getByTestId('sheet-keep').click()
  await expect.poll(() => readRecord(page, 'verb-skip', '2026-05-23'), { timeout: 6000 }).not.toBeNull()
  const rec = await readRecord(page, 'verb-skip', '2026-05-23')
  expect(rec.state).toBe('kept')
  expect(rec.entries.length).toBe(1) // only the beach pin became an entry
  expect(rec.entries[0].guess).toBe('Race Point')
  expect(rec.skipped.length).toBe(1) // the shop pin's id is remembered

  // Re-open through the kept card's door: the skipped pin must NOT come back
  // as a fresh suggestion (sticky by id).
  await home.getByTestId('settle-reopen').click()
  await expect(page.getByTestId('settle-sheet')).toBeVisible()
  await expect(page.getByTestId('settle-sheet').getByTestId('sheet-pin-row')).toHaveCount(1)
  await expect(page.getByTestId('settle-sheet')).not.toContainText('The Shop')
})

// ── FIX 3 · see inside ───────────────────────────────────────────────────────

test('see-inside: a pin row expands to its member photo thumbnails, and folds back', async ({ page }) => {
  await pinEvening(page)
  await seedTripIntoCache(page, stay('verb-inside'))
  await seedMemoriesIntoCache(page, richMems('verb-inside'))
  const home = await openHome(page, 'verb-inside')

  await home.getByTestId('settle-lookover').click()
  const sheet = page.getByTestId('settle-sheet')
  const beachRow = sheet.getByTestId('sheet-pin-row').filter({ hasText: 'Race Point' })
  await expect(sheet.getByTestId('sheet-pin-photos')).toHaveCount(0) // calm until asked
  await beachRow.getByTestId('sheet-see-inside').click()
  await expect(beachRow.getByTestId('sheet-pin-photos')).toBeVisible()
  await expect(beachRow.getByTestId('sheet-pin-thumb')).toHaveCount(2) // the pin's two photos
  await beachRow.getByTestId('sheet-see-inside').click() // now reads "hide"
  await expect(sheet.getByTestId('sheet-pin-photos')).toHaveCount(0)
})

// ── FIX 4 · who-correction chips ─────────────────────────────────────────────

test('who chips: toggling who was actually there rides the kept entry’s for — and the wire bit never lands', async ({ page }) => {
  await pinEvening(page)
  await seedTripIntoCache(page, stay('verb-who'))
  await seedMemoriesIntoCache(page, richMems('verb-who'))
  const home = await openHome(page, 'verb-who')

  await home.getByTestId('settle-lookover').click()
  const sheet = page.getByTestId('settle-sheet')
  const beachRow = sheet.getByTestId('sheet-pin-row').filter({ hasText: 'Race Point' })
  // The suggestion: the beach photos' camera-holder (helen) is on, others off.
  await expect(beachRow.locator('[data-testid="sheet-who-chip"][data-who="helen"]')).toHaveAttribute('data-on', '1')
  await expect(beachRow.locator('[data-testid="sheet-who-chip"][data-who="rafa"]')).toHaveAttribute('data-on', '0')
  // Rafa was there too — he just never holds the camera (the exact wrong-who
  // class the Weave would compound).
  await beachRow.locator('[data-testid="sheet-who-chip"][data-who="rafa"]').click()
  await expect(beachRow.locator('[data-testid="sheet-who-chip"][data-who="rafa"]')).toHaveAttribute('data-on', '1')

  await sheet.getByTestId('sheet-keep').click()
  await expect.poll(() => readRecord(page, 'verb-who', '2026-05-23'), { timeout: 6000 }).not.toBeNull()
  const rec = await readRecord(page, 'verb-who', '2026-05-23')
  const beach = rec.entries.find((e) => e.guess === 'Race Point')
  expect(beach.for).toEqual(['helen', 'rafa']) // corrected, in party order
  expect('whoEdited' in beach).toBe(false) // the consent bit is wire-only
  const shop = rec.entries.find((e) => e.guess === 'The Shop')
  expect(shop.for).toEqual(['aurelia']) // an untouched pin keeps its suggestion
})

// ── FIX 5 · kept ≠ closed: re-open + additive re-keep ────────────────────────

test('kept-day re-open: the door shows current pins, and a re-keep merges — union, no dupes, names preserved', async ({ page }) => {
  await pinEvening(page)
  // The day was kept at 5pm with ONE named entry drawn from the first beach
  // photo. Since then: a second beach photo (the same cluster, grown) and a
  // campfire photo (a genuinely new place).
  const KEPT = stay('verb-rekeep')
  KEPT.days[1].record = {
    state: 'kept', keptBy: 'helen', keptAt: '2026-05-23T21:00:00.000Z', nothing: false,
    entries: [{
      id: 'rec-early', time: 'around 3', name: 'Race Point Beach', kind: '', for: ['helen'],
      note: '', address: '', lat: 42.05, lng: -70.24, source: 'evidence',
      guess: 'Race Point', span: null, photos: ['m-beach-1'], photoCount: 1, order: 0,
    }],
    skipped: [],
  }
  await seedTripIntoCache(page, KEPT)
  await seedMemoriesIntoCache(page, [
    ...richMems('verb-rekeep').slice(0, 2), // beach ×2 — the kept entry's cluster, grown
    locatedMem('m-camp-1', 'verb-rekeep', { lat: 42.0700, lng: -70.2400, at: '2026-05-23T23:00:00.000Z', label: '', author: 'jonathan' }),
  ])
  const home = await openHome(page, 'verb-rekeep')

  // The kept card carries the quiet door, not a second keep button.
  const settle = home.getByTestId('settle-card')
  await expect(settle).toHaveAttribute('data-settle-state', 'kept')
  await expect(home.getByTestId('settle-keep')).toHaveCount(0)
  await home.getByTestId('settle-reopen').click()

  const sheet = page.getByTestId('settle-sheet')
  await expect(sheet).toBeVisible()
  // The named entry shows as itself; its GROWN pin is not offered again as a
  // nameless suggestion. Only the campfire is new.
  await expect(sheet).toContainText('Race Point Beach')
  const rows = sheet.getByTestId('sheet-pin-row')
  await expect(rows).toHaveCount(1)
  await rows.getByTestId('sheet-name-input').fill('The campfire')
  await sheet.getByTestId('sheet-keep').click()

  await expect.poll(async () => (await readRecord(page, 'verb-rekeep', '2026-05-23'))?.entries?.length ?? 0,
    { timeout: 6000 }).toBe(2)
  const rec = await readRecord(page, 'verb-rekeep', '2026-05-23')
  expect(rec.state).toBe('kept')
  expect(rec.keptBy).toBe('helen') // the first keeper still holds the day
  expect(rec.entries[0].id).toBe('rec-early') // updated in place, stable anchor
  expect(rec.entries[0].name).toBe('Race Point Beach') // name preserved
  expect(rec.entries[0].photos).toEqual(['m-beach-1', 'm-beach-2']) // the count grew honestly
  expect(rec.entries[1].name).toBe('The campfire') // the new pin appended, named
  expect(rec.entries.length).toBe(2) // union — nothing duplicated
})

test('C1: a multi-photo share spanning two places stays TWO places — the second is nameable and the named entry keeps its coordinates', async ({ page }) => {
  // One shared memory whose four photos cover the beach AND the shop (an
  // ordinary ThreadedMemories multi-photo share). Memory-id overlap used to
  // mark the shop pin "covered" by the named beach entry — invisible in the
  // sheet — and the merge folded it INTO that entry, clobbering its
  // coordinates with the shop's. photoIds overlap keeps them two places.
  await pinEvening(page)
  const SHARE = stay('verb-share')
  SHARE.days[1].record = {
    state: 'kept', keptBy: 'helen', keptAt: '2026-05-23T21:00:00.000Z', nothing: false,
    entries: [{
      // A LEGACY named entry: memory-id photos, centroid coords, NO photoIds.
      id: 'rec-early', time: 'around 3', name: 'Race Point Beach', kind: '', for: ['helen'],
      note: '', address: '', lat: 42.05025, lng: -70.24, source: 'evidence',
      guess: 'Race Point', span: null, photos: ['m-share'], photoCount: 2, order: 0,
    }],
    skipped: [],
  }
  await seedTripIntoCache(page, SHARE)
  await seedMemoriesIntoCache(page, [{
    id: 'm-share', tripId: 'verb-share', authorTraveler: 'helen', visibility: 'shared', kind: 'photo',
    capturedAt: '2026-05-23T15:00:00.000Z', createdAt: '2026-05-23T15:00:00.000Z', updatedAt: '2026-05-23T15:00:00.000Z',
    photoRefs: [
      { storage: 'external', url: TINY_RED_PNG_DATA_URL, lat: 42.0500, lng: -70.2400, capturedAt: '2026-05-23T15:00:00.000Z', locationLabel: 'Race Point' },
      { storage: 'external', url: TINY_RED_PNG_DATA_URL, lat: 42.0505, lng: -70.2400, capturedAt: '2026-05-23T15:10:00.000Z', locationLabel: 'Race Point' },
      { storage: 'external', url: TINY_RED_PNG_DATA_URL, lat: 42.0600, lng: -70.2400, capturedAt: '2026-05-23T18:00:00.000Z', locationLabel: 'The Shop' },
      { storage: 'external', url: TINY_RED_PNG_DATA_URL, lat: 42.0602, lng: -70.2400, capturedAt: '2026-05-23T18:05:00.000Z', locationLabel: 'The Shop' },
    ],
  }])
  const home = await openHome(page, 'verb-share')

  await home.getByTestId('settle-reopen').click()
  const sheet = page.getByTestId('settle-sheet')
  await expect(sheet).toBeVisible()
  // The beach pin is told by its named entry; the SHOP pin — same memory id,
  // different place — must still be offered for naming (pre-fix it was hidden).
  const rows = sheet.getByTestId('sheet-pin-row')
  await expect(rows).toHaveCount(1)
  await expect(rows).toContainText('The Shop')
  await rows.getByTestId('sheet-name-input').fill('Taffy counter')
  await sheet.getByTestId('sheet-keep').click()

  await expect.poll(async () => (await readRecord(page, 'verb-share', '2026-05-23'))?.entries?.length ?? 0,
    { timeout: 6000 }).toBe(2)
  const rec = await readRecord(page, 'verb-share', '2026-05-23')
  const beach = rec.entries.find((e) => e.name === 'Race Point Beach')
  expect(Math.abs(beach.lat - 42.05025)).toBeLessThan(0.002) // the named entry keeps the BEACH coordinates
  expect(beach.photoIds).toEqual(['m-share:0', 'm-share:1']) // graduated to the honest overlap key
  const shop = rec.entries.find((e) => e.name === 'Taffy counter')
  expect(shop.lat).toBeGreaterThan(42.058) // its own place, its own coordinates
})

// ── FIX 6 · quiet days pool ──────────────────────────────────────────────────

test('quiet days pool: 2+ pending quiet days are offered together — one tap keeps them all as nothing-days', async ({ page }) => {
  await pinEvening(page)
  const POOL = stay('verb-pool', {
    dateRange: 'May 20 – 25, 2026', dateRangeStart: '2026-05-20', dateRangeEnd: '2026-05-25',
    days: [
      { n: 1, isoDate: '2026-05-20', date: 'Wed May 20', title: 'Arrive', lodging: 'Harbor Breeze', stops: [],
        record: { state: 'kept', keptBy: 'jonathan', keptAt: '2026-05-20T23:00:00.000Z', nothing: true, entries: [] } },
      { n: 2, isoDate: '2026-05-21', date: 'Thu May 21', title: '', lodging: 'Harbor Breeze', stops: [] },
      { n: 3, isoDate: '2026-05-22', date: 'Fri May 22', title: '', lodging: 'Harbor Breeze', stops: [] },
      { n: 4, isoDate: '2026-05-23', date: 'Sat May 23', title: '', lodging: 'Harbor Breeze', stops: [] },
    ],
  })
  await seedTripIntoCache(page, POOL) // no memories at all — three quiet days pending by evening
  const home = await openHome(page, 'verb-pool')

  const settle = home.getByTestId('settle-card')
  await expect(settle).toHaveAttribute('data-settle-state', 'pool')
  await expect(settle).toContainText(/3 quiet days/i)
  await settle.getByTestId('settle-pool-keep').click()

  for (const iso of ['2026-05-21', '2026-05-22', '2026-05-23']) {
    await expect.poll(async () => {
      const r = await readRecord(page, 'verb-pool', iso)
      return r ? { state: r.state, nothing: r.nothing } : null
    }, { timeout: 6000 }).toEqual({ state: 'kept', nothing: true })
  }
})

test('a lone quiet evening mid-trip is SILENT — no card, no ask', async ({ page }) => {
  await pinEvening(page)
  await seedTripIntoCache(page, stay('verb-silent')) // yesterday kept, today quiet, trip runs on
  const home = await openHome(page, 'verb-silent')
  await expect(home.getByTestId('settle-card')).toHaveCount(0)
})

test('a rich day’s card carries pending quiet days as a rider — one tap signs them off, today stays offered', async ({ page }) => {
  await pinEvening(page)
  const RIDER = stay('verb-rider')
  RIDER.days[0].record = undefined // yesterday (May 22) is quiet + pending
  await seedTripIntoCache(page, RIDER)
  await seedMemoriesIntoCache(page, richMems('verb-rider')) // today is rich
  const home = await openHome(page, 'verb-rider')

  const settle = home.getByTestId('settle-card')
  await expect(settle).toHaveAttribute('data-settle-state', 'keep')
  const rider = settle.getByTestId('settle-quiet-rider')
  await expect(rider).toBeVisible()
  await expect(rider).toContainText(/quiet day/i)
  await rider.click()

  await expect.poll(async () => {
    const r = await readRecord(page, 'verb-rider', '2026-05-22')
    return r ? { state: r.state, nothing: r.nothing } : null
  }, { timeout: 6000 }).toEqual({ state: 'kept', nothing: true })
  expect(await readRecord(page, 'verb-rider', '2026-05-23')).toBeNull() // today untouched, still offered
  await expect(settle).toHaveAttribute('data-settle-state', 'keep') // the rich card stands
  await expect(settle.getByTestId('settle-quiet-rider')).toHaveCount(0) // the rider's done
})

test('C2: the KEPT card carries the rider too — quiet days can’t strand behind a last-evening keep', async ({ page }) => {
  await pinEvening(page)
  const KEPTRIDER = stay('verb-kept-rider')
  KEPTRIDER.days[0].record = undefined // yesterday (May 22) quiet + pending
  KEPTRIDER.days[1].record = { // today already kept
    state: 'kept', keptBy: 'helen', keptAt: '2026-05-23T22:00:00.000Z', nothing: false,
    entries: [{ id: 'e1', name: 'Race Point Beach', time: 'late morning', for: ['helen'] }],
    skipped: [],
  }
  await seedTripIntoCache(page, KEPTRIDER)
  const home = await openHome(page, 'verb-kept-rider')

  const settle = home.getByTestId('settle-card')
  await expect(settle).toHaveAttribute('data-settle-state', 'kept')
  const rider = settle.getByTestId('settle-quiet-rider')
  await expect(rider).toBeVisible()
  await expect(rider).toContainText(/quiet day/i)
  await rider.click()

  await expect.poll(async () => {
    const r = await readRecord(page, 'verb-kept-rider', '2026-05-22')
    return r ? { state: r.state, nothing: r.nothing } : null
  }, { timeout: 6000 }).toEqual({ state: 'kept', nothing: true })
  const today = await readRecord(page, 'verb-kept-rider', '2026-05-23')
  expect(today.state).toBe('kept') // today's keep untouched
  expect(today.entries.length).toBe(1)
  await expect(settle.getByTestId('settle-quiet-rider')).toHaveCount(0) // done — nothing stranded
})

// ── FIX 1 · the surprise filter on the settle path ───────────────────────────

test('an unrevealed surprise never drafts a pin for the person it hides from — and a keep publishes nothing of it', async ({ page }) => {
  await pinEvening(page)
  await seedTripIntoCache(page, stay('verb-surprise'))
  await seedMemoriesIntoCache(page, [
    ...richMems('verb-surprise'),
    // Jonathan's surprise for Helen: photos at the kite shop, hidden from her.
    locatedMem('m-secret', 'verb-surprise', { lat: 42.0800, lng: -70.2400, at: '2026-05-23T17:00:00.000Z', label: 'The Kite Shop', author: 'jonathan', hideFrom: ['helen'] }),
  ])
  const home = await openHome(page, 'verb-surprise', 'helen')

  const settle = home.getByTestId('settle-card')
  await expect(settle).toHaveAttribute('data-settle-state', 'keep')
  await expect(settle.getByTestId('settle-pin-chip')).toHaveCount(2) // beach + shop, never the secret
  await expect(page.getByTestId('living-heart-home')).not.toContainText('Kite Shop')

  // Helen keeps the day — the record must not carry the secret's existence.
  await settle.getByTestId('settle-keep').click()
  await expect.poll(() => readRecord(page, 'verb-surprise', '2026-05-23'), { timeout: 6000 }).not.toBeNull()
  const rec = await readRecord(page, 'verb-surprise', '2026-05-23')
  expect(rec.entries.length).toBe(2)
  expect(rec.entries.some((e) => (e.photos || []).includes('m-secret'))).toBe(false)
  expect(rec.entries.some((e) => /kite shop/i.test(e.guess || ''))).toBe(false)
})

test('the author (conspirator) still sees his own surprise’s pin — per-viewer, not global', async ({ page }) => {
  await pinEvening(page)
  await seedTripIntoCache(page, stay('verb-surprise-author'))
  await seedMemoriesIntoCache(page, [
    ...richMems('verb-surprise-author'),
    locatedMem('m-secret', 'verb-surprise-author', { lat: 42.0800, lng: -70.2400, at: '2026-05-23T17:00:00.000Z', label: 'The Kite Shop', author: 'jonathan', hideFrom: ['helen'] }),
  ])
  const home = await openHome(page, 'verb-surprise-author', 'jonathan')
  const settle = home.getByTestId('settle-card')
  await expect(settle).toHaveAttribute('data-settle-state', 'keep')
  await expect(settle.getByTestId('settle-pin-chip')).toHaveCount(3)
  await expect(settle).toContainText('The Kite Shop')
})

// ── FIX 7 · Rafa's pending note in the sheet ─────────────────────────────────

test('Rafa told about today: the sheet surfaces his pending note and one tap tucks his words into the record', async ({ page }) => {
  await pinEvening(page)
  const TOLD = stay('verb-told')
  // Today already has a named record (rich by entries) + Rafa's pending note.
  TOLD.days[1].record = {
    state: 'loose', keptBy: null, keptAt: null, nothing: false,
    entries: [{ id: 'e1', name: 'Race Point Beach', time: 'late morning', for: ['helen'] }],
    skipped: [], pending: ['mem-rafa-note'],
  }
  await seedTripIntoCache(page, TOLD)
  await seedMemoriesIntoCache(page, [{
    id: 'mem-rafa-note', tripId: 'verb-told', authorTraveler: 'rafa', visibility: 'shared', kind: 'voice',
    createdAt: '2026-05-23T22:00:00.000Z', updatedAt: '2026-05-23T22:00:00.000Z',
    audioRef: { storage: 'external', url: 'data:audio/mpeg;base64,SUQz' },
    transcript: 'we found a crab and it pinched papa', transcriptionStatus: 'done', durationSeconds: 6,
  }])
  const home = await openHome(page, 'verb-told')

  await home.getByTestId('settle-lookover').click()
  const sheet = page.getByTestId('settle-sheet')
  await expect(sheet).toBeVisible()
  const pendingRow = sheet.getByTestId('sheet-rafa-pending')
  await expect(pendingRow).toBeVisible()
  await expect(pendingRow).toContainText(/rafa told about today/i)
  await expect(pendingRow).toContainText('we found a crab and it pinched papa')
  await expect(pendingRow.getByTestId('sheet-rafa-play')).toBeEnabled() // listen is real

  await pendingRow.getByTestId('sheet-rafa-tuck').click()
  await expect.poll(async () => {
    const r = await readRecord(page, 'verb-told', '2026-05-23')
    return r ? { pending: r.pending?.length ?? 0, entries: r.entries.length } : null
  }, { timeout: 6000 }).toEqual({ pending: 0, entries: 2 }) // queue empties honestly, his words landed
  const rec = await readRecord(page, 'verb-told', '2026-05-23')
  const tucked = rec.entries.find((e) => e.id === 'rec-rafa-mem-rafa-note')
  expect(tucked.name).toBe('we found a crab and it pinched papa') // his words, verbatim
  await expect(sheet.getByTestId('sheet-rafa-pending')).toHaveCount(0) // placed = gone from pending
})

// ── the Rafa gate ────────────────────────────────────────────────────────────

test('Rafa’s lens never meets the settle card or the sheet — even on a rich evening', async ({ page }) => {
  await pinEvening(page)
  await seedTripIntoCache(page, stay('verb-rafa-gate'))
  await seedMemoriesIntoCache(page, richMems('verb-rafa-gate'))
  await page.goto('/?person=rafa&trip=verb-rafa-gate&nosw=1')
  await expect(page.getByText('Hi Rafa!')).toBeVisible({ timeout: 10000 })
  await expect(page.getByTestId('settle-card')).toHaveCount(0)
  await expect(page.getByTestId('settle-sheet')).toHaveCount(0)
})
