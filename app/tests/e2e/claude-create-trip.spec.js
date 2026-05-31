import { test, expect } from './_fixtures/clockStub.js'
import { seedTripIntoCache, FIXTURE_TRIP } from './_fixtures/withTrip.js'
import { resolvePersona } from './_fixtures/persona.js'

// Honors RT_PERSONA (Phase 2 build-list item 1); defaults to 'helen' when
// unset so existing runs stay byte-identical to before.
const PERSONA = resolvePersona('helen')

// Claude-in-App — trip creation (create_trip card) on the trips-index
// surface. Mirrors the mocked-SSE pattern from claude-card-shapes.spec.js
// so the Worker never gets a real call. Covers:
//   • draft → skip a stop → save → trip lands in cache + navigation
//   • refinement: a follow-up create_trip card supersedes the prior one
//
// The fixture trip seeds the index so the new trip lands alongside an
// existing one (and the index renders its FAB).

function sseFrames(...frames) {
  return frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('')
}

// `replies` is an array of reply strings; the Nth send returns
// replies[N-1], with the last entry repeating for any extra sends.
function mockIndexChat(page, replies) {
  const state = { chats: 0 }
  page.route(
    /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/claude\/conversations(\?|$)/,
    async (route) => {
      const req = route.request()
      if (req.method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
        return
      }
      const body = JSON.parse(req.postData() || '{}')
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: body.id || 'c-create', user_id: body.user_id, trip_id: body.trip_id || null }),
      })
    }
  )
  page.route(
    /roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/claude\/conversations\/[^/]+\/messages$/,
    async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    }
  )
  page.route(/roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/claude\/chat$/, async (route) => {
    const text = replies[Math.min(state.chats, replies.length - 1)]
    state.chats += 1
    const chunks = []
    for (let i = 0; i < text.length; i += 24) chunks.push({ type: 'text_delta', text: text.slice(i, i + 24) })
    chunks.push({ type: 'done', usage: { input_tokens: 50, output_tokens: 300 } })
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
      body: sseFrames(...chunks),
    })
  })
  // Trip upsert mirror — succeed so the create flow's Worker push resolves.
  page.route(/roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/trips$/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  })
  return state
}

function replyWithCard(card, lead) {
  return [lead || 'Here you go.', '', '```card', JSON.stringify(card, null, 2), '```', ''].join('\n')
}

function ashevilleCard(id, secondStopName) {
  return {
    type: 'create_trip',
    id,
    trip: {
      title: 'Asheville Long Weekend',
      subtitle: 'Art, mountains, and good food',
      startCity: 'Belmont, MA',
      endCity: 'Belmont, MA',
      dateRangeStart: '2026-10-09',
      dateRangeEnd: '2026-10-12',
      travelers: ['Jonathan', 'Helen', 'Aurelia', 'Rafa'],
      days: [
        {
          dayNumber: 1,
          title: 'Friday — Settle In',
          date: '2026-10-09',
          stops: [
            { id: 'ash-1-1', time: '2:00 PM', name: 'Check in at The Foundry Hotel', address: '51 S Market St, Asheville, NC', category: 'LODGING', description: 'Boutique hotel in a converted warehouse.', who: ['Jonathan', 'Helen', 'Aurelia', 'Rafa'], driveFromPrevious: null },
            { id: 'ash-1-2', time: '4:00 PM', name: secondStopName, address: 'Asheville, NC', category: 'ACTIVITY', description: 'The Friday afternoon thing.', who: ['Helen', 'Aurelia'], driveFromPrevious: '8 min' },
          ],
        },
        {
          dayNumber: 2,
          title: 'Saturday — Mountains',
          date: '2026-10-10',
          stops: [
            { id: 'ash-2-1', time: '9:00 AM', name: 'Craggy Gardens', address: 'Blue Ridge Parkway', category: 'ACTIVITY', description: 'Easy loop, big views.', who: ['Jonathan', 'Helen', 'Aurelia', 'Rafa'], driveFromPrevious: '45 min' },
          ],
        },
      ],
    },
  }
}

// Cold-load auto-opens whichever trip is active on the stubbed clock
// (the fixture trip is active on 2026-05-23), so a fresh load can land
// inside a trip rather than the index. Step back to the index, where
// the "Plan with Claude" FAB lives.
async function gotoIndex(page) {
  const fab = page.getByRole('button', { name: /Plan with Claude/i })
  const back = page.getByRole('button', { name: /←\s*Trips/i })
  await expect(fab.or(back).first()).toBeVisible({ timeout: 7000 })
  if (await fab.isVisible().catch(() => false)) return
  await back.first().click()
  await expect(fab).toBeVisible({ timeout: 5000 })
}

async function openIndexChat(page) {
  await gotoIndex(page)
  await page.getByRole('button', { name: /Plan with Claude/i }).click()
  const dialog = page.getByRole('dialog', { name: /Chat with Claude/i })
  await expect(dialog).toBeVisible()
  const newConvo = dialog.getByRole('button', { name: /New conversation/i })
  if (await newConvo.isVisible().catch(() => false)) await newConvo.click()
  return dialog
}

async function sendMessage(dialog, text) {
  await dialog.getByRole('textbox', { name: /Message Claude/i }).fill(text)
  await dialog.getByRole('button', { name: /Send message/i }).click()
}

async function readTrip(page, id) {
  return page.evaluate((tid) => {
    const all = JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]')
    return all.find((t) => t.id === tid) || null
  }, id)
}

test.describe('Claude-in-App — create_trip', () => {
  test('drafts a trip, skips a stop, saves, lands in the new trip', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    mockIndexChat(page, [
      replyWithCard(ashevilleCard('ct-ash-1', 'River Arts District'), 'I drafted a long weekend in Asheville.'),
    ])
    await page.goto(`/?person=${PERSONA}&nosw=1`)

    const dialog = await openIndexChat(page)
    await sendMessage(dialog, 'Plan a long weekend in Asheville in October, art and a hike')

    const card = dialog.getByTestId('confirm-card-create_trip')
    await expect(card).toBeVisible({ timeout: 5000 })
    await expect(card.getByText('Asheville Long Weekend')).toBeVisible()
    await expect(card.getByText('Friday — Settle In')).toBeVisible()

    // Save label reflects the live stop count: 3 → 2 after a skip.
    await expect(card.getByTestId('confirm-card-save')).toContainText('3 stops')
    await card.getByRole('button', { name: /^Skip$/i }).nth(1).click()
    await expect(card.getByTestId('confirm-card-save')).toContainText('2 stops')

    await card.getByTestId('confirm-card-save').click()

    // Trip lands in the cache with the skipped stop excluded.
    await expect
      .poll(
        async () => {
          const t = await readTrip(page, 'asheville-long-weekend-2026-10')
          return t ? t.days.flatMap((d) => d.stops).length : -1
        },
        { timeout: 5000 }
      )
      .toBe(2)

    const trip = await readTrip(page, 'asheville-long-weekend-2026-10')
    expect(trip.draft).toBe(false)
    expect(trip.status).toBe('planning')
    expect(trip.travelers).toEqual(['jonathan', 'helen', 'aurelia', 'rafa'])
    expect(trip.days[0].stops.map((s) => s.name)).toEqual(['Check in at The Foundry Hotel'])
    expect(trip.days[1].stops.map((s) => s.name)).toEqual(['Craggy Gardens'])
    // LODGING category maps to a lowercase kind the views render.
    expect(trip.days[0].stops[0].kind).toBe('lodging')

    // Navigation: the app routed into the freshly-created trip.
    await expect
      .poll(() => page.url(), { timeout: 5000 })
      .toContain('trip=asheville-long-weekend-2026-10')
  })

  test('the new trip appears in the trip list and is editable', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    mockIndexChat(page, [
      replyWithCard(ashevilleCard('ct-ash-1', 'River Arts District'), 'Drafted.'),
    ])
    await page.goto(`/?person=${PERSONA}&nosw=1`)

    const dialog = await openIndexChat(page)
    await sendMessage(dialog, 'Plan Asheville in October')
    const card = dialog.getByTestId('confirm-card-create_trip')
    await expect(card).toBeVisible({ timeout: 5000 })
    await card.getByTestId('confirm-card-save').click()

    await expect
      .poll(() => page.url(), { timeout: 5000 })
      .toContain('trip=asheville-long-weekend-2026-10')

    // From the new trip, step back to the index; the new trip is in the
    // list alongside the fixture trip.
    await page.getByRole('button', { name: /←\s*Trips/i }).first().click()
    await expect(page.getByText('Asheville Long Weekend').first()).toBeVisible({ timeout: 5000 })

    // Editable surface: the trip carries the editable structure the
    // M2 cards + TripEditor read (n/isoDate/stops with ids).
    const trip = await readTrip(page, 'asheville-long-weekend-2026-10')
    expect(trip.days[0].n).toBe(1)
    expect(trip.days[0].isoDate).toBe('2026-10-09')
    expect(trip.days[0].stops[0].id).toBeTruthy()
  })

  test('refinement — a follow-up card supersedes the prior draft', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    mockIndexChat(page, [
      replyWithCard(ashevilleCard('ct-ash-1', 'Craggy Gardens hike'), 'First draft for Asheville.'),
      replyWithCard(ashevilleCard('ct-ash-2', 'Burntshirt Vineyards'), 'Swapped the hike for a winery.'),
    ])
    await page.goto(`/?person=${PERSONA}&nosw=1`)

    const dialog = await openIndexChat(page)
    await sendMessage(dialog, 'Plan a long weekend in Asheville with a hike')
    await expect(dialog.getByTestId('confirm-card-create_trip')).toBeVisible({ timeout: 5000 })

    await sendMessage(dialog, 'swap the hike for a winery')

    // The first draft collapses to a "Draft replaced" note; the live
    // card now shows the winery, and only one create_trip card remains.
    await expect(dialog.getByTestId('confirm-card-superseded')).toBeVisible({ timeout: 5000 })
    await expect(dialog.getByText('Burntshirt Vineyards')).toBeVisible()
    await expect(dialog.getByTestId('confirm-card-create_trip')).toHaveCount(1)
  })
})
