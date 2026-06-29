// Share-out Phase 2 / E1 — the in-app Composer MVP. Pick existing shared trip
// photos → caption → Share → a public link. The composed thing becomes one album
// memory (the picked refs), shared via the existing /share (mocked here).
//
// NON-VACUOUS: asserts a composed album memory is actually created with the
// selected photoRefs, and that surprise/private photos are NOT offered for
// composing (the safety guard) — drop the filter and the count goes wrong.
import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, seedMemoriesIntoCache, FIXTURE_TRIP, TINY_RED_PNG_DATA_URL } from './_fixtures/withTrip.js'

const sharedPhoto = (id, caption) => ({
  id, tripId: 'volleyball-2026', stopId: 'vb1-3', authorTraveler: 'helen', visibility: 'shared',
  kind: 'photo', caption,
  photoRefs: [{ storage: 'r2', key: `k-${id}`, url: TINY_RED_PNG_DATA_URL }],
  createdAt: '2026-05-22T18:00:00.000Z', capturedAt: '2026-05-22T18:00:00.000Z',
})

const sharedMemories = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('rt_memories_shared_v1') || '[]'))

async function seedAndOpen(page, mems, shareBodies) {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await seedMemoriesIntoCache(page, mems)
  // share() now awaits pushMemory (the album must reach D1 before the link is
  // minted), so the worker must look reachable for /memories + /trips.
  await page.route(/workers\.dev\/(memories|trips)\b/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  )
  // Mock the worker /share mint (registered after the seed catch-all → wins).
  // Capture the request bodies so we can assert the chosen layout was sent.
  await page.route(/workers\.dev\/share\b/, async (route) => {
    if (shareBodies) { try { shareBodies.push(route.request().postDataJSON()) } catch { shareBodies.push(null) } }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'abc-mystic', url: 'https://share.test/m/abc-mystic' }) })
  })
  await page.goto('/?person=helen&trip=volleyball-2026&compose=1&nosw=1')
  await expect(page.getByTestId('share-composer')).toBeVisible()
}

test('compose two photos → arrange → Share → a link + the chosen layout is sent, and a composed album memory is created', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  const shareBodies = []
  await seedAndOpen(page, [sharedPhoto('p1', 'sandcastle'), sharedPhoto('p2', 'sunset'), sharedPhoto('p3', 'the pier')], shareBodies)

  // SELECT: pick two photos (tiles are buttons labelled "Select photo").
  await page.getByRole('button', { name: 'Select photo' }).nth(0).click()
  await page.getByRole('button', { name: 'Select photo' }).nth(0).click() // the next still-unselected one
  await expect(page.getByText(/2 selected/i)).toBeVisible()
  await page.getByRole('button', { name: /Next . Arrange/i }).click()

  // ARRANGE: pick a non-default layout + caption, then Share.
  await page.getByRole('button', { name: 'Mosaic' }).click()
  await page.getByLabel('Caption').fill('Our beach day')
  await page.getByRole('button', { name: /Share this moment/i }).click()

  // The link comes back + the shared confirmation shows.
  await expect(page.getByText('https://share.test/m/abc-mystic')).toBeVisible()
  await expect(page.getByText(/Shared to the family/i)).toBeVisible()

  // A composed album memory was actually created — a NEW shared memory carrying
  // the two picked refs + the typed caption (identified by that caption).
  await expect.poll(async () => (await sharedMemories(page)).filter((m) => m.caption === 'Our beach day').length).toBe(1)
  const composed = (await sharedMemories(page)).find((m) => m.caption === 'Our beach day')
  expect(composed.photoRefs).toHaveLength(2)
  expect(composed.kind).toBe('photo')
  expect(composed.visibility).toBe('shared')
  // Reuses the existing r2 refs (no re-upload) → keys preserved → survives sync.
  expect(composed.photoRefs.every((r) => r.storage === 'r2' && r.key)).toBe(true)
  // The chosen layout was sent to /share (E2).
  expect(shareBodies.some((b) => b?.layout === 'mosaic')).toBe(true)

  expect(errors, errors.join(' | ')).toHaveLength(0)
})

test('surprise + private photos are NOT offered for composing (safety guard)', async ({ page }) => {
  await seedAndOpen(page, [
    sharedPhoto('ok1', 'visible'),
    sharedPhoto('ok2', 'also visible'),
    { ...sharedPhoto('secret', 'hidden'), hideFrom: ['rafa'], reveal: { type: 'manual' }, conceal: 'teaser' }, // a surprise
    { ...sharedPhoto('priv', 'private'), visibility: 'private' }, // private
  ])
  // Only the 2 plain shared photos are selectable — not the surprise or the private one.
  await expect(page.getByRole('button', { name: 'Select photo' })).toHaveCount(2)
})

test('E4: a note slip makes the moment an ORDERED pieces memory (photo → note), no crash', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await seedAndOpen(page, [sharedPhoto('p1', 'a shared photo')])

  // Select a trip photo, THEN add a note — order is preserved in the selection.
  await page.getByRole('button', { name: 'Select photo' }).first().click()
  await page.getByRole('button', { name: /Write a note/i }).click()
  await page.getByLabel('Note').fill('What a day at the seaport')
  await page.getByRole('button', { name: /Add note/i }).click()
  await expect(page.getByText(/2 selected/i)).toBeVisible()
  // the note chip shows its selection-order badge + text
  await expect(page.getByText('What a day at the seaport')).toBeVisible()

  await page.getByRole('button', { name: /Next . Arrange/i }).click()
  // the live preview renders the note slip (parity with the public page)
  await expect(page.getByText('What a day at the seaport')).toBeVisible()
  await page.getByRole('button', { name: /Share this moment/i }).click()
  await expect(page.getByText(/Shared to the family/i)).toBeVisible()

  // The composed memory is now a heterogeneous ORDERED pieces moment.
  const composed = (await sharedMemories(page)).find((m) => Array.isArray(m.pieces))
  expect(composed, 'a pieces-carrying composed memory was created').toBeTruthy()
  expect(composed.pieces.map((p) => p.kind)).toEqual(['photo', 'note'])
  expect(composed.pieces[1].text).toBe('What a day at the seaport')
  // photoRefs subset still present (back-compat surfaces render the photo).
  expect(composed.photoRefs).toHaveLength(1)
  expect(errors, errors.join(' | ')).toHaveLength(0)
})

test('no shared photos → an honest empty state, no crash', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await seedAndOpen(page, [])
  await expect(page.getByText(/No shared photos on this trip yet/i)).toBeVisible()
  expect(errors, errors.join(' | ')).toHaveLength(0)
})

// The designed entry: each adult persona's home band has a "Share a moment"
// register that opens the composer (was ⋯-only; the ⋯ fallback still exists but
// is closed here, so the role=button match is the band entry, not the menuitem).
test('the home-band "Share a moment" entry opens the composer (jonathan/helen/aurelia)', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  for (const who of ['jonathan', 'helen', 'aurelia']) {
    await page.goto(`/?person=${who}&trip=volleyball-2026&nosw=1`)
    // Jonathan's stay home is the redesigned LivingHeartHome (its "Share a moment"
    // quiet action opens the same composer); the others use their entry band.
    await expect(page.getByTestId(who === 'jonathan' ? 'living-heart-home' : `${who}-entries`)).toBeVisible()
    await page.getByRole('button', { name: 'Share a moment' }).click()
    await expect(page.getByTestId('share-composer')).toBeVisible()
  }
})
