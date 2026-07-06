import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, seedMemoriesIntoCache, FIXTURE_TRIP, TINY_RED_PNG_DATA_URL } from './_fixtures/withTrip.js'

// "Add it again — the sound will come along this time" (the true fix for the
// four permanently-silent videos). A stored clip labeled sound:'lost' provably
// HAD audio the old encode dropped; the shipped packet-copy pipeline carries
// sound now, so the AUTHOR gets a quiet lightbox door to re-pick the same
// camera-roll video — the fresh upload replaces the ref IN PLACE (same memory,
// same caption, same date, same filing). Never a nag: no banner, no prompt,
// never cross-author, never on Rafa's lens, and a re-pick that loses its sound
// AGAIN changes nothing (the old copy stands; the honest line says so once).
//
// Personas are PINNED (not RT_PERSONA-driven): author-vs-viewer gating is
// cross-persona by nature — same as photos-caption-edit.spec.js.
//
// The encode rides the prod-inert __RT_VIDEO_ENCODE_STUB seam (cfg.sound
// drives the honesty verdict) so the whole pick → shrink → upload → swap path
// runs headlessly on chromium + webkit — neither ships a completable WebCodecs
// encode. No idb blobs are involved (the poster upload succeeds via the
// route), so no webkit gate is needed.

const CAPTURED_AT = '2026-05-23T07:00:00.000Z'
const OLD_KEY = 'helen/vid/original'
// A data: URL so the seeded .mp4 never hits the network (the lightbox <video>
// preloads metadata; a dead fetch would just noise the run).
const OLD_VIDEO_URL = 'data:video/mp4;base64,AAAAHGZ0eXBpc29t'
const NEW_KEY = 'helen/vid/re-added'
const NEW_VIDEO_URL = 'https://example.test/re-added.mp4'

// A stored, synced (r2) video whose saved copy provably lost its sound.
function lostSoundVideoMemory({ id, authorTraveler }) {
  return {
    id,
    tripId: 'volleyball-2026',
    stopId: 'vb2-3',
    authorTraveler,
    visibility: 'shared',
    kind: 'photo', // videos ride photo-kind memories; the ref carries the video identity
    caption: 'the whale breach',
    capturedAt: CAPTURED_AT,
    photoRef: {
      kind: 'video',
      storage: 'r2',
      key: OLD_KEY,
      url: OLD_VIDEO_URL,
      posterUrl: TINY_RED_PNG_DATA_URL,
      mime: 'video/mp4',
      width: 720,
      height: 1280,
      durationMs: 8000,
      bytes: 3_200_000,
      sound: 'lost',
      capturedAt: CAPTURED_AT,
    },
    photoExternalURLs: [],
    reactions: [],
    createdAt: '2026-05-24T22:00:00.000Z',
    updatedAt: '2026-05-24T22:00:00.000Z',
  }
}

// Persona-agnostic Photos entry (photos-base.spec.js idiom) — each lens names
// its own door.
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

async function openLightbox(page, persona) {
  await page.goto(`/?person=${persona}&trip=volleyball-2026&nosw=1`)
  await openPhotos(page)
  await page.getByTestId('photo-tile').first().click()
  await expect(page.getByTestId('photo-lightbox')).toBeVisible()
}

// Upload routes: the worker's asset endpoints answer like the real thing and
// COUNT the video POSTs — the still-lost path must never spend an upload.
// Installed AFTER seedTripIntoCache so it outranks the fixture's catch-all.
async function routeAssets(page) {
  const counters = { video: 0, photo: 0 }
  await page.route(
    /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/assets\/(photo|video)/,
    async (route) => {
      const url = route.request().url()
      if (url.includes('/assets/video/')) {
        counters.video += 1
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ key: NEW_KEY, url: NEW_VIDEO_URL, mime: 'video/mp4' }),
        })
        return
      }
      counters.photo += 1
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ key: 'helen/poster/re-added', url: 'https://example.test/re-added.jpg', mime: 'image/jpeg' }),
      })
    }
  )
  return counters
}

const fakeVideoFile = () => ({
  name: 'clip.mov',
  mimeType: 'video/quicktime',
  buffer: Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]),
})

const storedMemory = (page, id) =>
  page.evaluate(
    (mid) => JSON.parse(localStorage.getItem('rt_memories_shared_v1') || '[]').find((m) => m.id === mid),
    id
  )

test.describe('add it again with sound — who sees the door', () => {
  test('the AUTHOR sees the quiet chip on a lost-sound video — and it is a REAL file input, not a scripted dialog', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [lostSoundVideoMemory({ id: 'vid-mine', authorTraveler: 'helen' })])
    await openLightbox(page, 'helen')

    const row = page.getByTestId('lightbox-readd-sound')
    await expect(row).toBeVisible()
    await expect(row).toContainText(/add it again/i)
    // The iOS direct-tap rule: the trigger is a real, PRESENT <input type=file>
    // the finger (via its label) taps — never a scripted input.click(). Assert
    // the element itself, not a dialog.
    const input = page.getByTestId('lightbox-readd-input')
    await expect(input).toBeAttached()
    await expect(input).toHaveAttribute('type', 'file')
    await expect(input).toHaveAttribute('accept', 'video/*')
    // sr-only (clipped), NOT display:none — it must stay a real tappable input.
    const display = await input.evaluate((el) => getComputedStyle(el).display)
    expect(display, 'a real, present input — never display:none').not.toBe('none')
  })

  test('a NON-author still sees the honest "no sound" chip — but never the door', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [lostSoundVideoMemory({ id: 'vid-theirs', authorTraveler: 'helen' })])
    await openLightbox(page, 'jonathan')

    await expect(page.getByTestId('photo-lightbox')).toBeVisible()
    await expect(page.getByTestId('lightbox-readd-sound')).toHaveCount(0)
    await expect(page.getByTestId('lightbox-readd-input')).toHaveCount(0)
    // The honesty chip on the tile is for everyone; only the door is gated.
    await page.getByTestId('photo-lightbox').getByRole('button', { name: 'Close' }).click()
    await expect(page.getByTestId('tile-video-no-sound')).toBeVisible()
  })

  test('Rafa never sees the door — even on his own video (belt over the lens gate)', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [lostSoundVideoMemory({ id: 'vid-rafa', authorTraveler: 'rafa' })])
    await openLightbox(page, 'rafa')

    await expect(page.getByTestId('photo-lightbox')).toBeVisible()
    await expect(page.getByTestId('lightbox-readd-sound')).toHaveCount(0)
    await expect(page.getByTestId('lightbox-readd-input')).toHaveCount(0)
  })
})

test.describe('add it again with sound — the flow', () => {
  test('a re-pick that CARRIES sound replaces the copy in place — caption, date, filing, capture identity all kept', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [lostSoundVideoMemory({ id: 'vid-fix', authorTraveler: 'helen' })])
    const counters = await routeAssets(page)
    // The new pipeline's honest verdict: this time the sound came along.
    await page.addInitScript(() => {
      window.__RT_VIDEO_ENCODE_STUB = { sound: 'carried', blobBytes: 5_200_000, durationMs: 9_100 }
    })
    await openLightbox(page, 'helen')

    // Sanity: the tile chip said "no sound" before the fix.
    await expect(page.getByTestId('lightbox-readd-sound')).toBeVisible()
    await page.getByTestId('lightbox-readd-input').setInputFiles([fakeVideoFile()])

    // The swap lands: the lightbox STAYS OPEN on the replaced video (re-keyed
    // onto the new url) and the door is gone — the fresh ref carries sound.
    await expect(page.getByTestId('lightbox-readd-sound')).toHaveCount(0, { timeout: 10000 })
    await expect(page.getByTestId('photo-lightbox')).toBeVisible()
    await expect(page.getByTestId('lightbox-video')).toHaveAttribute('src', NEW_VIDEO_URL)
    // The caption rode through untouched (author variant of the caption line).
    await expect(page.getByTestId('lightbox-caption')).toContainText('the whale breach')
    expect(counters.video, 'exactly one real video upload').toBe(1)

    // The stored record: same memory, same moment — new bytes.
    const mem = await storedMemory(page, 'vid-fix')
    expect(mem.photoRef.key).toBe(NEW_KEY)
    expect(mem.photoRef.url).toBe(NEW_VIDEO_URL)
    expect(mem.photoRef.sound).toBe('carried')
    expect(mem.photoRef.bytes).toBe(5_200_000)
    expect(mem.photoRef.durationMs).toBe(9_100)
    expect(mem.photoRef.posterKey).toBe('helen/poster/re-added')
    expect(mem.photoRef.capturedAt, 'the ORIGINAL capture identity is kept').toBe(CAPTURED_AT)
    expect(mem.capturedAt).toBe(CAPTURED_AT)
    expect(mem.caption).toBe('the whale breach')
    expect(mem.stopId).toBe('vb2-3')
    expect(mem.authorTraveler).toBe('helen')

    // Back in the album: the "no sound" chip is gone; the size chip tells the
    // new file's honest size.
    await page.getByTestId('photo-lightbox').getByRole('button', { name: 'Close' }).click()
    await expect(page.getByTestId('tile-video-no-sound')).toHaveCount(0)
    await expect(page.getByTestId('tile-video-size')).toContainText('5.2 MB')
  })

  test('a re-pick that loses its sound AGAIN replaces nothing — old copy stands, said honestly once, door stays open', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [lostSoundVideoMemory({ id: 'vid-again', authorTraveler: 'helen' })])
    const counters = await routeAssets(page)
    // The rung-b failure: this source's audio couldn't be carried either.
    await page.addInitScript(() => {
      window.__RT_VIDEO_ENCODE_STUB = { sound: 'lost', blobBytes: 5_200_000, durationMs: 9_100 }
    })
    await openLightbox(page, 'helen')

    await page.getByTestId('lightbox-readd-input').setInputFiles([fakeVideoFile()])

    // The honest per-lens line (helen's warm base) — family language, no code.
    const note = page.getByTestId('lightbox-readd-stilllost')
    await expect(note).toBeVisible({ timeout: 10000 })
    await expect(note).toContainText(/couldn.t come along this time either/i)
    await expect(note).toContainText(/nothing changed/i)
    // No loop-nagging — but the quiet door simply stays available.
    await expect(page.getByTestId('lightbox-readd-input')).toBeAttached()
    // Nothing was uploaded, nothing was swapped: the old (working) copy stands.
    expect(counters.video, 'a copy we would not keep costs no upload').toBe(0)
    const mem = await storedMemory(page, 'vid-again')
    expect(mem.photoRef.key).toBe(OLD_KEY)
    expect(mem.photoRef.sound).toBe('lost')
    expect(mem.photoRef.url).toBe(OLD_VIDEO_URL)

    // C1a, settled side: the in-flight guard CLEARS on settle — the door is
    // not just visually open, it WORKS. A second pick (this time the sound
    // carries) goes through: the guard blocks concurrent flows, never the
    // next honest attempt.
    await page.evaluate(() => {
      window.__RT_VIDEO_ENCODE_STUB = { sound: 'carried', blobBytes: 5_200_000, durationMs: 9_100 }
    })
    await page.getByTestId('lightbox-readd-input').setInputFiles([fakeVideoFile()])
    await expect(page.getByTestId('lightbox-readd-sound')).toHaveCount(0, { timeout: 10000 })
    expect(counters.video, 'the second attempt genuinely uploaded').toBe(1)
    const fixed = await storedMemory(page, 'vid-again')
    expect(fixed.photoRef.key).toBe(NEW_KEY)
    expect(fixed.photoRef.sound).toBe('carried')

    // The album now tells the new truth about the saved copy.
    await page.getByTestId('photo-lightbox').getByRole('button', { name: 'Close' }).click()
    await expect(page.getByTestId('tile-video-no-sound')).toHaveCount(0)
  })
})
