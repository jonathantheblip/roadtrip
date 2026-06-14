// Surprises composer rebuild (Slice 1) — the content step.
//
// Helen reported the old "Plan a surprise" form as broken: it never let you say
// WHAT the surprise was. This guards the rebuild: you can WRAP a real photo/memory
// (the masking attaches to that real memory so it actually disappears for the
// hidden-from person, and its content is preserved) OR DESCRIBE a new one.
import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, seedMemoriesIntoCache, FIXTURE_TRIP, TINY_RED_PNG_DATA_URL } from './_fixtures/withTrip.js'
import { openTopMenuItem } from './_fixtures/topNav.js'

const HELEN_PHOTO = {
  id: 'mem_helen_photo', tripId: 'volleyball-2026', stopId: 'vb1-3', authorTraveler: 'helen',
  visibility: 'shared', kind: 'photo', caption: 'rafa asleep in his coat',
  photoExternalURLs: [TINY_RED_PNG_DATA_URL], createdAt: '2026-05-22T20:10:00.000Z', capturedAt: '2026-05-22T20:10:00.000Z',
}

const sharedMemories = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('rt_memories_shared_v1') || '[]'))

async function openComposer(page) {
  await openTopMenuItem(page, /surprises/i)
  await expect(page.getByTestId('surprises-view')).toBeVisible()
  await page.getByRole('button', { name: /New/i }).click()
}

test('wrap a real photo → masking attaches to that memory, content preserved', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await seedMemoriesIntoCache(page, [HELEN_PHOTO])
  await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
  await openComposer(page)

  await page.getByRole('button', { name: 'A photo' }).click()
  await page.getByRole('button', { name: 'rafa asleep in his coat' }).first().click()
  await expect(page.getByText(/Wrapped from the trip/i)).toBeVisible()
  // default hide-from is the first family member (jonathan); make it explicit.
  await expect(page.getByText(/won.t see this photo in the trip until you reveal it/i)).toBeVisible()
  await page.getByRole('button', { name: /Keep it secret/i }).click()

  // The surprise attached to the REAL photo memory (same id) — not a new row.
  await expect.poll(async () => (await sharedMemories(page)).find((m) => m.id === 'mem_helen_photo')?.hideFrom?.length || 0).toBeGreaterThan(0)
  const mem = (await sharedMemories(page)).find((m) => m.id === 'mem_helen_photo')
  expect(mem.hideFrom).toContain('jonathan')
  expect(mem.surprise?.source).toBe('wrap')
  // Content preserved — wrapping must NOT wipe the photo.
  expect(mem.kind).toBe('photo')
  expect(mem.caption).toBe('rafa asleep in his coat')
  expect(mem.photoExternalURLs?.length).toBeGreaterThan(0)
  // No duplicate surprise row was created.
  expect((await sharedMemories(page)).filter((m) => m.id === 'mem_helen_photo')).toHaveLength(1)

  expect(errors, errors.join(' | ')).toHaveLength(0)
})

test('describe something new → a new content memory carries the secret', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
  await openComposer(page)

  await page.getByRole('button', { name: 'A memory' }).click()
  await page.getByRole('button', { name: /Describe something new/i }).click()
  await page.getByLabel(/^Title/).fill('A note for the thread')
  await expect(page.getByText(/isn.t on the trip yet/i)).toBeVisible()
  await page.getByRole('button', { name: /Keep it secret/i }).click()

  await expect.poll(async () => (await sharedMemories(page)).some((m) => m.surprise?.title === 'A note for the thread')).toBe(true)
  const mem = (await sharedMemories(page)).find((m) => m.surprise?.title === 'A note for the thread')
  expect(mem.hideFrom?.length).toBeGreaterThan(0)
  expect(mem.surprise?.source).toBe('describe')
  expect(mem.text).toBe('A note for the thread') // the typed title is the memory's content
})

test('editing a wrapped surprise re-opens the composer pre-filled (no crash)', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  // Seed the photo ALREADY wrapped as a surprise (authored by helen, hidden from
  // jonathan) so it lands in "You're keeping" with an Edit affordance.
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await seedMemoriesIntoCache(page, [{
    ...HELEN_PHOTO,
    hideFrom: ['jonathan'], reveal: { type: 'manual' }, conceal: 'teaser',
    surprise: { what: 'A photo', icon: '🖼️', title: 'rafa asleep in his coat', detail: 'Beach Bungalow', tint: '#5C4A52', source: 'wrap' },
  }])
  await page.goto('/?person=helen&trip=volleyball-2026&nosw=1')
  await openTopMenuItem(page, /surprises/i)
  await expect(page.getByTestId('surprises-view')).toBeVisible()
  await page.getByRole('button', { name: /Edit surprise/i }).click()
  // Opens in EDIT mode, pre-filled with the wrapped item (the SelectedSecret card).
  await expect(page.getByText(/Edit surprise/i)).toBeVisible()
  await expect(page.getByText(/Wrapped from the trip/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /Save changes/i })).toBeVisible()
  expect(errors, errors.join(' | ')).toHaveLength(0)
})
