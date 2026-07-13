import { test, expect } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { seedTripIntoCache, seedMemoriesIntoCache, FIXTURE_TRIP, TINY_RED_PNG_DATA_URL } from './_fixtures/withTrip.js'
import { openTopMenuItem } from './_fixtures/topNav.js'
import { expectNoSeriousA11y } from './_fixtures/axe.js'

// "Find your photos' locations" — the re-source scan (Album System Ch 04).
// The Settings tool reads the ORIGINALS in an adult's own photo library, matches
// each to its imported memory by capture instant, and fills in the recovered
// GPS + capture-time offset. These tests drive the real flow end-to-end with the
// real full-res iPhone fixture, whose EXIF carries:
//   DateTimeOriginal 2026:05:24 22:49:12 · OffsetTimeOriginal -04:00
//   GPS 41.32245…, -72.09434…
//
// TZ DISCIPLINE (deploy-verify house rule: the full suite must pass under TZ=UTC).
// The browser derives the match key, and WebKit ignores the TZ env var while node
// honors it — so a key computed in node would diverge from the page's under
// `TZ=UTC`. Both sides are pinned instead: the context timezone is fixed, and the
// seeded capturedAt is the photo's TRUE instant (wall clock 22:49:12 at -04:00 =
// 02:49:12Z next day), which the scan reaches via its offset-derived candidate key
// regardless of the device's zone.
test.use({ timezoneId: 'America/New_York' })

const here = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_JPEG = path.resolve(here, '../fixtures/media/iphone-jpeg-fullres.jpg')
const CAPTURED_AT = '2026-05-25T02:49:12.000Z'
// The REAL scene hash sceneHashFromFile computes for this fixture's raw bytes —
// verified bit-for-bit against the worker's real Photon-based hash of the same
// bytes (empirically, not assumed: an earlier drawImage-based implementation
// diverged by 25 of 64 bits at this extreme a downscale ratio; a from-scratch,
// hand-verified pixel-center nearest-neighbor sampler matches Photon exactly).
// Regression-pins the exact sampling algorithm — a future "simplification" back to
// relying on the browser's own resize would silently break content verification
// for the whole already-backfilled archive without this catching it.
const FIXTURE_SCENE_HASH = '0d13414d49e26f64'
const SCENE_MISMATCH = 'f2ecbeb2b61d909b' // 0d13414d49e26f64 bitwise-complemented per nibble (64 bits apart, computed not hand-typed)

function seedMemory({ id, ref, authorTraveler = 'helen', extra = {} }) {
  return {
    id,
    tripId: 'volleyball-2026',
    stopId: 'vb2-3',
    authorTraveler,
    visibility: 'shared',
    kind: 'photo',
    caption: id,
    capturedAt: CAPTURED_AT,
    photoRef: ref,
    photoExternalURLs: [],
    reactions: [],
    createdAt: '2026-05-24T23:00:00.000Z',
    updatedAt: '2026-05-24T23:00:00.000Z',
    ...extra,
  }
}

const needyRef = (key) => ({ key, storage: 'r2', url: TINY_RED_PNG_DATA_URL, capturedAt: CAPTURED_AT })

async function openSettings(page, person) {
  await page.goto(`/?person=${person}&nosw=1`)
  // The trip CARD, by its distinct archived-card name — never getByText: with
  // memories seeded, the index also grows a "Looking back" resurfacing tile
  // carrying the same trip title, and a bare text match opens THAT instead.
  await page.getByRole('button', { name: /ARCHIVED.*Fun @ the Sun/ }).click()
  await openTopMenuItem(page, /Settings/i)
}

async function handOverFixture(page) {
  const input = page.getByTestId('locate-grant-input')
  await input.setInputFiles(FIXTURE_JPEG)
}

test('an adult recovers GPS + offset from a device original — honest result, fields written', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await seedMemoriesIntoCache(page, [
    // Imported ref at the fixture's capture instant, GPS + offset missing —
    // exactly what the upload shrink leaves behind.
    seedMemory({ id: 'loc-needy', ref: needyRef('e2e-orig-1') }),
  ])
  await openSettings(page, 'helen')

  // The renamed row, in its own adults-only section.
  const section = page.getByTestId('settings-your-photos')
  await expect(section).toBeVisible()
  await expect(section).toContainText('Find your photos’ locations')
  await expect(section).toContainText('the kids never see it')
  await page.getByTestId('settings-locate-photos').click()

  // Intro → the promise, then on to the grant.
  await expect(page.getByTestId('locate-intro')).toBeVisible()
  await page.getByTestId('locate-intro-cta').click()
  await expect(page.getByTestId('locate-grant')).toBeVisible()

  // W6 — the grant step's computed truth (replaces the old decorative trip
  // chip): her own count + exact day-set, and where to scroll in the picker.
  // The fixture's true instant is 2026-05-25 (see CAPTURED_AT/module header).
  await expect(page.getByTestId('locate-grant-ask')).toContainText('1 of your photos from May 25')
  await expect(page.getByTestId('locate-grant-ask')).toContainText('scroll to May 25')
  // W6 — the per-person breakdown now also lands BEFORE the pick.
  await expect(page.getByTestId('locate-coordinate')).toBeVisible()

  // The direct-tap contract: the pick control is a REAL, PRESENT input —
  // sr-only, never display:none (iOS only opens a picker from a direct tap).
  const input = page.getByTestId('locate-grant-input')
  await expect(input).toBeAttached()
  const css = await input.evaluate((el) => {
    const s = getComputedStyle(el)
    return { display: s.display, visibility: s.visibility }
  })
  expect(css.display).not.toBe('none')
  expect(css.visibility).not.toBe('hidden')

  // Hand over the real original. One file → the scan runs → the honest result.
  await handOverFixture(page)
  await expect(page.getByTestId('locate-result')).toBeVisible({ timeout: 15000 })
  await expect(page.getByTestId('locate-result-head')).toContainText('Found where 1 of your 1 photos were taken')
  await expect(page.getByTestId('locate-result-time')).toContainText('recorded the right time zone on 1')
  await expect(page.getByTestId('locate-result-unmatched')).toHaveCount(0)
  await expect(page.getByTestId('locate-result-failed')).toHaveCount(0)
  await expect(page.getByTestId('locate-result-ambiguous')).toHaveCount(0)
  // Something really settled, so the settle note is honest here.
  await expect(page.getByTestId('locate-result-settle')).toBeVisible()

  // The recovered fields really landed on the ref (additive, in shared storage).
  const ref = await page.evaluate(() => {
    const list = JSON.parse(localStorage.getItem('rt_memories_shared_v1') || '[]')
    return list.find((m) => m.id === 'loc-needy')?.photoRef
  })
  expect(ref.lat).toBeCloseTo(41.3224, 3)
  expect(ref.lng).toBeCloseTo(-72.0943, 3)
  expect(ref.offsetMinutes).toBe(-240)

  // The quiet settle: Done returns to Settings, no confetti, no queue.
  await page.getByTestId('locate-result-done').click()
  await expect(page.getByTestId('locate-result')).toHaveCount(0)
  await expect(page.getByTestId('settings-your-photos')).toBeVisible()
})

test('W6 — a gap in the picked filenames\' own numbering surfaces a device-wide hint', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await seedMemoriesIntoCache(page, [seedMemory({ id: 'loc-needy', ref: needyRef('e2e-orig-1') })])
  await openSettings(page, 'helen')
  await page.getByTestId('settings-locate-photos').click()
  await page.getByTestId('locate-intro-cta').click()

  // Two copies of the same real fixture bytes, handed over renamed into an
  // IMG_#### run with a gap — the LocateOriginalsFlow variant of W2's
  // filename-sequence witness (BUILD_PLAN_WITNESS_FLEET_2.md: "the
  // LocateOriginalsFlow variant waits for W6"), applied to what was just
  // picked rather than to an import batch. In-memory buffers, no new fixture
  // files on disk.
  const bytes = fs.readFileSync(FIXTURE_JPEG)
  await page.getByTestId('locate-grant-input').setInputFiles([
    { name: 'IMG_0001.jpg', mimeType: 'image/jpeg', buffer: bytes },
    { name: 'IMG_0009.jpg', mimeType: 'image/jpeg', buffer: bytes },
  ])

  await expect(page.getByTestId('locate-result')).toBeVisible({ timeout: 15000 })
  await expect(page.getByTestId('locate-gap-hint')).toContainText('Up to ~7 more item')
  await expect(page.getByTestId('locate-gap-hint')).toContainText('between IMG_0001.jpg and IMG_0009.jpg')
})

test('re-picking an already-recovered original says "nothing new" — never "couldn\'t be placed"', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await seedMemoriesIntoCache(page, [
    // One photo already complete, one still needy → the flow opens (needy > 0),
    // but the picked original has nothing left to give for its own photo.
    seedMemory({
      id: 'loc-complete',
      ref: { ...needyRef('e2e-orig-2'), lat: 41.3224, lng: -72.0943, offsetMinutes: -240 },
    }),
    seedMemory({
      id: 'loc-other',
      ref: { key: 'e2e-orig-3', storage: 'r2', url: TINY_RED_PNG_DATA_URL, capturedAt: '2026-05-24T18:00:00.000Z' },
    }),
  ])
  await openSettings(page, 'helen')
  await page.getByTestId('settings-locate-photos').click()
  await page.getByTestId('locate-intro-cta').click()
  await handOverFixture(page)

  await expect(page.getByTestId('locate-result')).toBeVisible({ timeout: 15000 })
  await expect(page.getByTestId('locate-result-head')).toContainText('Nothing new to fill in')
  await expect(page.getByTestId('locate-result-already')).toContainText('1 already knew where and when they were')
  await expect(page.getByTestId('locate-result-unmatched')).toHaveCount(0)
  // Nothing was saved this pass, so the "it's all saved now" note must not appear.
  await expect(page.getByTestId('locate-result-settle')).toHaveCount(0)
  // The other photo is still waiting, so the footer must NOT claim the phone is done.
  await expect(page.getByTestId('locate-self-waiting')).toBeVisible()
  await expect(page.getByTestId('locate-result-done')).toHaveText('Done')
})

test('the footer never claims the phone is done while another trip still has waiting photos', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await seedMemoriesIntoCache(page, [
    // This trip's only photo is the one we recover…
    seedMemory({ id: 'loc-this-trip', ref: needyRef('e2e-t1') }),
    // …but her own photo in ANOTHER trip on this device is still waiting. The
    // completion claim is about the DEVICE, so it may not be made.
    seedMemory({
      id: 'loc-other-trip',
      ref: { key: 'e2e-t2', storage: 'r2', url: TINY_RED_PNG_DATA_URL, capturedAt: '2026-03-02T10:00:00.000Z' },
      extra: { tripId: 'some-other-trip' },
    }),
  ])
  await openSettings(page, 'helen')
  await page.getByTestId('settings-locate-photos').click()
  await page.getByTestId('locate-intro-cta').click()
  await handOverFixture(page)

  await expect(page.getByTestId('locate-result')).toBeVisible({ timeout: 15000 })
  await expect(page.getByTestId('locate-result-head')).toContainText('Found where 1 of your 1 photos were taken')
  // This trip is finished — the card says so — but the phone is not.
  await expect(page.getByTestId('locate-result-done')).toHaveText('Done')
  await expect(page.getByTestId('locate-result-done')).not.toContainText('everything on this phone')
})

test('a photo taken on another adult\'s phone is reported as theirs, never written, never "already knew"', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await seedMemoriesIntoCache(page, [
    // Jonathan's photo, captured the same second as Helen's original (the
    // second-truncated collision). Helen scans; his photo must be untouched.
    seedMemory({ id: 'loc-his', ref: needyRef('e2e-his'), authorTraveler: 'jonathan' }),
    seedMemory({
      id: 'loc-hers-other',
      ref: { key: 'e2e-hers', storage: 'r2', url: TINY_RED_PNG_DATA_URL, capturedAt: '2026-03-02T10:00:00.000Z' },
    }),
  ])
  await openSettings(page, 'helen')
  await page.getByTestId('settings-locate-photos').click()
  await page.getByTestId('locate-intro-cta').click()
  await handOverFixture(page)

  await expect(page.getByTestId('locate-result')).toBeVisible({ timeout: 15000 })
  await expect(page.getByTestId('locate-result-notyours')).toContainText('taken on another phone')
  await expect(page.getByTestId('locate-result-already')).toHaveCount(0)

  // His photo is exactly as it was — her coordinates never landed on it.
  const ref = await page.evaluate(() => {
    const list = JSON.parse(localStorage.getItem('rt_memories_shared_v1') || '[]')
    return list.find((m) => m.id === 'loc-his')?.photoRef
  })
  expect(ref.lat).toBeUndefined()
  expect(ref.offsetMinutes).toBeUndefined()
})

test('CONTENT VERIFICATION on real bytes: sceneHashFromFile reproduces the real worker Photon hash bit-for-bit', async ({ page }) => {
  // Regression pin for the exact pixel-sampling algorithm (see the constant's
  // comment) — computed live in a real browser against the real fixture, not a
  // synthetic stub, so a future change to the sampling approach that silently
  // breaks agreement with the worker's Photon hash fails HERE, not in production.
  await page.goto('/?person=helen&nosw=1')
  const hash = await page.evaluate(async (fixturePath) => {
    const mod = await import('/src/lib/resourceScan.js')
    const res = await fetch(fixturePath)
    const blob = await res.blob()
    const file = new File([blob], 'IMG_0001.jpg', { type: 'image/jpeg' })
    return mod.sceneHashFromFile(file)
  }, '/@fs' + FIXTURE_JPEG)
  expect(hash).toBe(FIXTURE_SCENE_HASH)
})

test('CONTENT MATCH fills across authors on real bytes — the legitimate shared-photo recovery the author-only rule forbade', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await seedMemoriesIntoCache(page, [
    // Jonathan's imported, needy photo — but its STORED scene hash (as the real
    // composition backfill would have written it) matches what this scan computes
    // from Helen's original. Content proves identity; authorship doesn't gate it.
    seedMemory({
      id: 'loc-cross-author',
      ref: { ...needyRef('e2e-cross'), scene: FIXTURE_SCENE_HASH },
      authorTraveler: 'jonathan',
    }),
  ])
  await openSettings(page, 'helen')
  await page.getByTestId('settings-locate-photos').click()
  await page.getByTestId('locate-intro-cta').click()
  await handOverFixture(page)

  await expect(page.getByTestId('locate-result')).toBeVisible({ timeout: 15000 })
  await expect(page.getByTestId('locate-result-notyours')).toHaveCount(0)
  await expect(page.getByTestId('locate-result-head')).toContainText('Found where 1 of your 1 photos were taken')

  const ref = await page.evaluate(() => {
    const list = JSON.parse(localStorage.getItem('rt_memories_shared_v1') || '[]')
    return list.find((m) => m.id === 'loc-cross-author')?.photoRef
  })
  expect(ref.lat).toBeCloseTo(41.3224, 3)
})

test('CONTENT MISMATCH refuses on real bytes even when author matches — closes the round-4 wrong write', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await seedMemoriesIntoCache(page, [
    // Helen's OWN needy photo at the same instant — but its stored scene hash is
    // a DIFFERENT photo's. The old author-only rule would have filled this
    // incorrectly; content proof must refuse it.
    seedMemory({ id: 'loc-mismatch', ref: { ...needyRef('e2e-mismatch'), scene: SCENE_MISMATCH } }),
  ])
  await openSettings(page, 'helen')
  await page.getByTestId('settings-locate-photos').click()
  await page.getByTestId('locate-intro-cta').click()
  await handOverFixture(page)

  await expect(page.getByTestId('locate-result')).toBeVisible({ timeout: 15000 })
  await expect(page.getByTestId('locate-result-head')).toContainText('Nothing new to fill in')

  const ref = await page.evaluate(() => {
    const list = JSON.parse(localStorage.getItem('rt_memories_shared_v1') || '[]')
    return list.find((m) => m.id === 'loc-mismatch')?.photoRef
  })
  expect(ref.lat).toBeUndefined()
  expect(ref.scene).toBe(SCENE_MISMATCH) // untouched
})

test('a kid\'s photo is never written from a parent\'s phone, even alone at that instant', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await seedMemoriesIntoCache(page, [
    // Rafa's imported photo sits at the same truncated second as Helen's original.
    // Helen's original may well be a photo she never imported — the index cannot
    // know — so filling his ref would stamp her location onto his photo forever.
    seedMemory({ id: 'loc-kid', ref: needyRef('e2e-kid'), authorTraveler: 'rafa' }),
    seedMemory({
      id: 'loc-hers-other',
      ref: { key: 'e2e-hers2', storage: 'r2', url: TINY_RED_PNG_DATA_URL, capturedAt: '2026-03-02T10:00:00.000Z' },
    }),
  ])
  await openSettings(page, 'helen')
  await page.getByTestId('settings-locate-photos').click()
  await page.getByTestId('locate-intro-cta').click()
  await handOverFixture(page)

  await expect(page.getByTestId('locate-result')).toBeVisible({ timeout: 15000 })
  await expect(page.getByTestId('locate-result-notyours')).toBeVisible()
  // No promise that the kids' photos will fill in — they never run this tool.
  await expect(page.getByTestId('locate-coordinate')).toContainText('stay exactly as they are')

  const ref = await page.evaluate(() => {
    const list = JSON.parse(localStorage.getItem('rt_memories_shared_v1') || '[]')
    return list.find((m) => m.id === 'loc-kid')?.photoRef
  })
  expect(ref.lat).toBeUndefined()
  expect(ref.offsetMinutes).toBeUndefined()
})

test('a device where nothing needs filling opens straight on "all set"', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await seedMemoriesIntoCache(page, [
    seedMemory({
      id: 'loc-complete',
      ref: { ...needyRef('e2e-orig-2'), lat: 41.3224, lng: -72.0943, offsetMinutes: -240 },
    }),
  ])
  await openSettings(page, 'helen')
  await page.getByTestId('settings-locate-photos').click()

  // Nothing needs anything → no pointless grant.
  await expect(page.getByTestId('locate-allset')).toBeVisible()
  await expect(page.getByTestId('locate-allset')).toContainText('already knows where it was')
  await page.getByTestId('locate-allset-done').click()
  await expect(page.getByTestId('locate-allset')).toHaveCount(0)
})

test('a surprise hidden from the person scanning is never touched or counted', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await seedMemoriesIntoCache(page, [
    // Helen's unrevealed surprise for Jonathan, as it exists on a device that
    // authored or synced it: a RAW row carrying hideFrom, with no `masked` flag.
    // Jonathan opens the tool (Settings' person-switcher makes this one tap).
    seedMemory({
      id: 'loc-surprise',
      ref: needyRef('e2e-surprise'),
      authorTraveler: 'helen',
      extra: { hideFrom: ['jonathan'], conceal: 'teaser', surprise: { what: 'gift' } },
    }),
  ])
  await openSettings(page, 'jonathan')
  await page.getByTestId('settings-locate-photos').click()

  // Her hidden photo is the only needy ref on the device — and it is invisible to
  // him, so there is nothing for him to fill: no grant, no count, no hint.
  await expect(page.getByTestId('locate-allset')).toBeVisible()
  await expect(page.getByTestId('locate-grant')).toHaveCount(0)

  // And it stays exactly as it was.
  const ref = await page.evaluate(() => {
    const list = JSON.parse(localStorage.getItem('rt_memories_shared_v1') || '[]')
    return list.find((m) => m.id === 'loc-surprise')?.photoRef
  })
  expect(ref.lat).toBeUndefined()
  expect(ref.offsetMinutes).toBeUndefined()
})

test('the flow has no serious a11y violations, in both adult themes', async ({ page }) => {
  // A new full-screen surface, in two lenses whose palettes differ (Helen light /
  // Jonathan dark) — contrast is exactly where a wrong-theme skin would fail.
  for (const person of ['helen', 'jonathan']) {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await seedMemoriesIntoCache(page, [seedMemory({ id: 'loc-a11y', ref: needyRef('e2e-a11y'), authorTraveler: person })])
    await openSettings(page, person)
    await page.getByTestId('settings-locate-photos').click()
    await expect(page.getByTestId('locate-intro')).toBeVisible()
    await expectNoSeriousA11y(page, { include: '[data-testid="locate-intro"]', label: `locate intro — ${person}` })
    await page.getByTestId('locate-intro-cta').click()
    await expect(page.getByTestId('locate-grant')).toBeVisible()
    await expectNoSeriousA11y(page, { include: '[data-testid="locate-grant"]', label: `locate grant — ${person}` })
    await handOverFixture(page)
    await expect(page.getByTestId('locate-result')).toBeVisible({ timeout: 15000 })
    await expectNoSeriousA11y(page, { include: '[data-testid="locate-result"]', label: `locate result — ${person}` })
  }
})

test('the kids never see the tool (Aurelia has no section)', async ({ page }) => {
  await seedTripIntoCache(page, FIXTURE_TRIP)
  await openSettings(page, 'aurelia')
  // Settings renders for her, but the section — and the row — do not exist.
  await expect(page.getByTestId('settings-device')).toBeVisible()
  await expect(page.getByTestId('settings-your-photos')).toHaveCount(0)
  await expect(page.getByTestId('settings-locate-photos')).toHaveCount(0)
})
