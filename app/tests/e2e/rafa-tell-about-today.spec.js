// Rafa's "tell about today" (design 04) — his mic saves an ordinary voice Memory
// (never auto-published) and queues its id in day.record.pending for a PARENT to
// place. Proves: the mic overlay opens/cancels from RafaView; the editor's Record
// mode surfaces a pending note with its transcript; a parent can attach it onto a
// named entry (appended, never overwriting) or dismiss it as a loose note — either
// way it drops off the pending queue.
import { test, expect } from '@playwright/test'
import { seedTripIntoCache, seedMemoriesIntoCache, TINY_RED_PNG_DATA_URL } from './_fixtures/withTrip.js'

test.use({ timezoneId: 'UTC' })

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

const TRIP_ID = 'rf-tell-stay'
const STAY = {
  shape: 'stay', status: 'planning', title: 'Provincetown', id: TRIP_ID,
  dateRange: 'May 19 – 21, 2026', dateRangeStart: '2026-05-19', dateRangeEnd: '2026-05-21',
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'], heroImage: TINY_RED_PNG_DATA_URL,
  lodging: { name: 'Harbor Breeze', lat: 42.0584, lng: -70.1787 },
  days: [
    {
      n: 1, isoDate: '2026-05-19', date: 'Tue May 19', stops: [],
      record: {
        state: 'loose',
        entries: [{ id: 'e1', name: 'Dinner', time: 'evening', note: 'Pizza place', for: ['jonathan', 'helen'] }],
        pending: ['mem_rafa1', 'mem_rafa2'],
      },
    },
  ],
}

function pendingMemories() {
  const now = new Date('2026-05-19T20:05:00.000Z').toISOString()
  return [
    {
      id: 'mem_rafa1', tripId: TRIP_ID, stopId: null, authorTraveler: 'rafa', visibility: 'shared',
      kind: 'voice', text: null, caption: null, photoExternalURLs: [], audioRef: null, durationSeconds: 12,
      transcript: 'A frog came to dinner!', transcriptLang: 'en', transcriptionStatus: 'done',
      photoRef: undefined, photoRefs: undefined, mood: null, reactions: [], capturedAt: now,
      createdAt: now, updatedAt: now,
    },
    {
      id: 'mem_rafa2', tripId: TRIP_ID, stopId: null, authorTraveler: 'rafa', visibility: 'shared',
      kind: 'voice', text: null, caption: null, photoExternalURLs: [], audioRef: null, durationSeconds: 8,
      transcript: '', transcriptLang: null, transcriptionStatus: 'pending',
      photoRef: undefined, photoRefs: undefined, mood: null, reactions: [], capturedAt: now,
      createdAt: now, updatedAt: now,
    },
  ]
}

test('RafaView: TELL ABOUT TODAY opens the mic overlay and cancels cleanly', async ({ page }) => {
  await pinNoon(page)
  await seedTripIntoCache(page, STAY)
  await page.goto(`/?person=rafa&trip=${TRIP_ID}&nosw=1`)
  await expect(page.getByText('Hi Rafa!')).toBeVisible({ timeout: 10000 })

  await page.getByTestId('rafa-tell-about-today').click()
  const dialog = page.getByRole('dialog', { name: 'Voice memo recorder' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toHaveCount(0)
  // Never queued anything — cancel discards, matching VoiceRecorder's contract.
  await expect(page.getByText(/saved for mama to place/i)).toHaveCount(0)
})

test('editor Record mode: a parent attaches a pending note onto a named entry (appended, not overwritten)', async ({ page }) => {
  await pinNoon(page)
  await seedTripIntoCache(page, STAY)
  await seedMemoriesIntoCache(page, pendingMemories())
  await page.goto(`/?person=helen&trip=${TRIP_ID}&nosw=1`)
  const home = page.getByTestId('living-heart-home')
  await expect(home).toBeVisible({ timeout: 10000 })
  await home.getByRole('button', { name: 'Change the plan' }).click()
  await page.getByTestId('editor-mode-record').click()
  const rec = page.getByTestId('record-mode')
  await expect(rec).toBeVisible()

  const pending = rec.getByTestId('pending-from-rafa')
  await expect(pending).toBeVisible()
  const notes = pending.getByTestId('pending-rafa-note')
  await expect(notes).toHaveCount(2)

  const told = notes.filter({ hasText: 'A frog came to dinner!' })
  await expect(told).toBeVisible()
  const stillTranscribing = notes.filter({ hasText: /transcribing/i })
  await expect(stillTranscribing).toBeVisible()

  await told.getByLabel('Attach to which entry').selectOption({ label: 'Dinner' })
  await told.getByRole('button', { name: 'Attach' }).click()

  // The pending note resolved off the queue — only the still-transcribing one remains.
  await expect(pending.getByTestId('pending-rafa-note')).toHaveCount(1)
  await expect(pending).not.toContainText('A frog came to dinner!')

  // Autosave (debounced) — read the cache directly, same idiom record-editor.spec.js uses.
  await expect
    .poll(async () =>
      page.evaluate((tripId) => {
        const all = JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]')
        const t = all.find((x) => x.id === tripId)
        const d = t?.days?.find((x) => x.isoDate === '2026-05-19')
        return d?.record?.entries?.[0]?.note || null
      }, TRIP_ID)
    )
    .toBe('Pizza place — A frog came to dinner!')
})

test('editor Record mode: "Keep as a loose note" dismisses the queue without touching any entry', async ({ page }) => {
  await pinNoon(page)
  await seedTripIntoCache(page, STAY)
  await seedMemoriesIntoCache(page, pendingMemories())
  await page.goto(`/?person=helen&trip=${TRIP_ID}&nosw=1`)
  const home = page.getByTestId('living-heart-home')
  await expect(home).toBeVisible({ timeout: 10000 })
  await home.getByRole('button', { name: 'Change the plan' }).click()
  await page.getByTestId('editor-mode-record').click()
  const rec = page.getByTestId('record-mode')
  const pending = rec.getByTestId('pending-from-rafa')
  const told = pending.getByTestId('pending-rafa-note').filter({ hasText: 'A frog came to dinner!' })

  await told.getByRole('button', { name: 'Keep as a loose note' }).click()
  await expect(pending.getByTestId('pending-rafa-note')).toHaveCount(1)

  await expect
    .poll(async () =>
      page.evaluate((tripId) => {
        const all = JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]')
        const t = all.find((x) => x.id === tripId)
        const d = t?.days?.find((x) => x.isoDate === '2026-05-19')
        return d?.record?.pending || []
      }, TRIP_ID)
    )
    .toEqual(['mem_rafa2'])

  // The entry's note is untouched — dismissing never writes to the plan/record entry.
  const note = await page.evaluate((tripId) => {
    const all = JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]')
    const t = all.find((x) => x.id === tripId)
    const d = t?.days?.find((x) => x.isoDate === '2026-05-19')
    return d?.record?.entries?.[0]?.note
  }, TRIP_ID)
  expect(note).toBe('Pizza place')
})
