import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'
import { resolvePersona } from './_fixtures/persona.js'

// Manual-add (NewTrip) draft flow — the B-create-sync-nav audit fixes:
//   • DRAFT GATE: a manual-add draft is NOT pushed to the shared worker
//     (POST /trips) until it's published — it stays local-only.
//   • REACHABILITY: a freshly-created draft surfaces in the index "Drafts"
//     section, where the author can reopen (Edit) or delete it.
//   • STRAND-ON-FAILURE: navigation into the editor happens on the local
//     write, so a sync blip can't strand the author on the form.
//   • COLD-START NAV: the persona Switcher + a Settings affordance render
//     on the index so a between-trips member isn't stuck.

const PERSONA = resolvePersona('jonathan')

// Count POST /trips calls so we can assert a draft never reaches the worker.
// Installed BEFORE seedTripIntoCache's catch-all so this more-specific route
// wins (the catch-all 200s GET /trips for the cold-load pull).
async function countTripPosts(page) {
  const state = { posts: 0 }
  await page.route(
    /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/trips$/,
    async (route) => {
      if (route.request().method() === 'POST') {
        state.posts += 1
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

async function fillAndCreateDraft(page, title) {
  await page.getByRole('button', { name: /New trip/i }).click()
  await expect(page.getByRole('heading', { name: /New Trip/i })).toBeVisible()
  await page.getByPlaceholder("Rafa's Birthday Weekend").fill(title)
  await page.getByRole('button', { name: /^Create trip$/i }).click()
}

function readCache(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]'))
}

test.describe('NewTrip — manual-add draft', () => {
  test('a draft is saved locally but NOT pushed to the worker; lands in the editor', async ({ page }) => {
    const posts = await countTripPosts(page)
    await seedTripIntoCache(page, FIXTURE_TRIP)
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

    // ...and was NEVER POSTed to the shared worker (the draft gate). Give the
    // best-effort sync a beat to (not) fire.
    await page.waitForTimeout(300)
    expect(posts.posts).toBe(0)
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
