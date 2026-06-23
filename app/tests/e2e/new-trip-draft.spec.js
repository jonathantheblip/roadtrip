import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'
import { resolvePersona } from './_fixtures/persona.js'

// Manual-add (NewTrip) draft flow — the B-create-sync-nav audit fixes, plus the
// 2026-06-23 draft-durability repair:
//   • DRAFT GATE (REPAIRED): a draft IS pushed to the worker now (carrying
//     draft:true), so "set aside as a draft" can NEVER destroy it — the bug that
//     ate the Vermont trip (the gate used to soft-DELETE on the server). The
//     worker's getTrips read-filter (`t.draft !== true`) keeps every draft out of
//     the family's pull, so a pushed draft still never reaches another device or
//     Claude. (Previously the gate skipped the push entirely AND deleted; both
//     were wrong.)
//   • REACHABILITY: a freshly-created draft surfaces in the index "Drafts"
//     section, where the author can reopen (Edit), restore, or delete it.
//   • STRAND-ON-FAILURE: navigation into the editor happens on the local
//     write, so a sync blip can't strand the author on the form.
//   • COLD-START NAV: the persona Switcher + a Settings affordance render
//     on the index so a between-trips member isn't stuck.

const PERSONA = resolvePersona('jonathan')

// Capture POST /trips calls so we can assert WHAT reaches the worker. A draft is
// now pushed (carrying draft:true) so it can't be lost — we assert that, and that
// the worker would hide it (the read-filter is unit-tested worker-side). Installed
// BEFORE seedTripIntoCache's catch-all so this more-specific route wins (the
// catch-all 200s GET /trips for the cold-load pull).
async function countTripPosts(page) {
  const state = { posts: 0, bodies: [] }
  await page.route(
    /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/trips$/,
    async (route) => {
      if (route.request().method() === 'POST') {
        state.posts += 1
        try { state.bodies.push(JSON.parse(route.request().postData() || '{}')) } catch { /* ignore */ }
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
        return
      }
      // GET (cold-load pull) → empty so the cache seed wins.
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    }
  )
  return state
}

async function gotoIndex(page) {
  // FIXTURE_TRIP is active on the stubbed clock, so cold-load lands inside the
  // trip; step back to the index where "New trip" lives.
  const newTrip = page.getByRole('button', { name: /New trip/i })
  const back = page.getByRole('button', { name: /back to trips/i })
  await expect(newTrip.or(back).first()).toBeVisible({ timeout: 7000 })
  if (await newTrip.isVisible().catch(() => false)) return
  await back.first().click()
  await expect(newTrip).toBeVisible({ timeout: 5000 })
}

async function fillAndCreateDraft(page, title, opts = {}) {
  await page.getByRole('button', { name: /New trip/i }).click()
  await expect(page.getByRole('heading', { name: /New Trip/i })).toBeVisible()
  await page.getByPlaceholder('A weekend at the cabin').fill(title)
  // Place-first (the stay spine), shown by default.
  if (opts.placeName != null) {
    await page.getByPlaceholder(/Grandma's/).fill(opts.placeName)
  }
  if (opts.placeAddress != null) {
    await page.getByPlaceholder(/find it on the map/i).fill(opts.placeAddress)
  }
  // Road-trip toggle reveals start/end city.
  if (opts.driving) {
    await page.getByLabel(/driving between places/i).check()
    if (opts.startCity != null) await page.getByPlaceholder('Belmont, MA').fill(opts.startCity)
    if (opts.endCity != null) await page.getByPlaceholder('New York, NY').fill(opts.endCity)
  }
  await page.getByRole('button', { name: /^Create trip$/i }).click()
}

function readCache(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]'))
}

test.describe('NewTrip — manual-add draft', () => {
  test('a draft is saved locally AND pushed (carrying draft:true) so it can never be lost; lands in the editor', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    // Register the POST-capturing route AFTER the catch-all so it wins for POST
    // /trips (Playwright matches most-recently-added first). The catch-all still
    // serves GET /trips for the cold-load pull via this route's GET branch.
    const posts = await countTripPosts(page)
    await page.goto(`/?person=${PERSONA}&nosw=1`)

    await gotoIndex(page)
    await fillAndCreateDraft(page, 'Maine Cabin Weekend')

    // Navigated into the editor (local-write success drives nav, not sync).
    await expect(page.getByText(/DRAFT — not shown in the trip list/i)).toBeVisible({ timeout: 7000 })

    // The draft is in the local cache...
    const cache = await readCache(page)
    const draft = cache.find((t) => t.title === 'Maine Cabin Weekend')
    expect(draft).toBeTruthy()
    expect(draft.draft).toBe(true)
    // Place-first: a trip is a STAY by default (the frequent case), and carries
    // no end city (which would feed the drive-home scaffolding a stay sheds).
    expect(draft.shape).toBe('stay')
    expect(draft.endCity).toBe('')

    // ...and WAS pushed to the worker, carrying draft:true (the durability repair:
    // a draft must survive on the server so it can never be destroyed — the worker
    // hides it from the family via its getTrips read-filter). Give the best-effort
    // push a beat to fire.
    await expect.poll(() => posts.posts, { timeout: 4000 }).toBeGreaterThan(0)
    const pushedDraft = posts.bodies.find((b) => b?.title === 'Maine Cabin Weekend')
    expect(pushedDraft, 'the draft was POSTed').toBeTruthy()
    expect(pushedDraft.draft, 'the pushed draft carries draft:true so the worker hides it').toBe(true)
  })

  test('place-first: a stay carries its place + geocoded coords and reads as a stay', async ({ page }) => {
    await countTripPosts(page)
    // Mock the geocoder (Nominatim) so the test is deterministic + offline-safe,
    // and so we can assert the address→coords wiring that the stay relies on.
    await page.route(/nominatim\.openstreetmap\.org/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ lat: '44.5001', lon: '-72.5002' }]) })
    )
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.goto(`/?person=${PERSONA}&nosw=1`)

    await gotoIndex(page)
    await fillAndCreateDraft(page, 'Lake House Long Weekend', {
      placeName: 'The lake house',
      placeAddress: '10 Shoreline Dr, Anytown',
    })
    await expect(page.getByText(/DRAFT — not shown in the trip list/i)).toBeVisible({ timeout: 7000 })

    const cache = await readCache(page)
    const draft = cache.find((t) => t.title === 'Lake House Long Weekend')
    expect(draft).toBeTruthy()
    // The place is the spine: shape 'stay' + the lodging name/address + the coords
    // geocoded at submit (so the place card, live rail, and photo filer engage).
    expect(draft.shape).toBe('stay')
    expect(draft.lodging?.name).toBe('The lake house')
    expect(draft.lodging?.address).toBe('10 Shoreline Dr, Anytown')
    expect(draft.lodging?.lat).toBeCloseTo(44.5001, 3)
    expect(draft.lodging?.lng).toBeCloseTo(-72.5002, 3)
  })

  test('the road-trip toggle produces a route trip with an end city', async ({ page }) => {
    await countTripPosts(page)
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.goto(`/?person=${PERSONA}&nosw=1`)

    await gotoIndex(page)
    await fillAndCreateDraft(page, 'The Big Drive', {
      driving: true,
      startCity: 'Belmont, MA',
      endCity: 'Asheville, NC',
    })
    await expect(page.getByText(/DRAFT — not shown in the trip list/i)).toBeVisible({ timeout: 7000 })

    const cache = await readCache(page)
    const draft = cache.find((t) => t.title === 'The Big Drive')
    expect(draft).toBeTruthy()
    // Driving on → an explicit road trip that keeps its drive scaffolding (G5).
    expect(draft.shape).toBe('route')
    expect(draft.endCity).toBe('Asheville, NC')
    expect(draft.startCity).toBe('Belmont, MA')
  })

  test('a fresh draft surfaces in the index Drafts section and is deletable', async ({ page }) => {
    await countTripPosts(page)
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.goto(`/?person=${PERSONA}&nosw=1`)

    await gotoIndex(page)
    await fillAndCreateDraft(page, 'Maine Cabin Weekend')
    // Confirm we landed in the editor (local-write nav), then back to the index.
    await expect(page.getByText(/DRAFT — not shown in the trip list/i)).toBeVisible({ timeout: 7000 })
    // The editor's back button reads "Trips" (ChevronLeft + Trips).
    await page.getByRole('button', { name: /^Trips$/i }).first().click()

    // The Drafts section shows the new draft.
    const drafts = page.getByTestId('index-drafts')
    await expect(drafts).toBeVisible({ timeout: 5000 })
    await expect(drafts.getByText('Maine Cabin Weekend')).toBeVisible()

    // Delete it (two-tap confirm).
    await drafts.getByRole('button', { name: /Delete draft Maine Cabin Weekend/i }).click()
    await drafts.getByRole('button', { name: /Confirm/i }).click()

    await expect(drafts).toHaveCount(0, { timeout: 5000 })
    const cache = await readCache(page)
    expect(cache.find((t) => t.title === 'Maine Cabin Weekend')).toBeFalsy()
  })

  test('the index exposes the persona switcher and a Settings affordance', async ({ page }) => {
    await countTripPosts(page)
    await seedTripIntoCache(page, FIXTURE_TRIP)
    await page.goto(`/?person=${PERSONA}&nosw=1`)

    await gotoIndex(page)

    // Persona pills (the Switcher) are reachable on the index — a between-trips
    // member can switch person without being stuck.
    await expect(page.getByRole('button', { name: /Helen/ })).toBeVisible()
    // Settings affordance in the index header.
    await expect(page.getByRole('button', { name: /^Settings$/i })).toBeVisible()
  })
})
