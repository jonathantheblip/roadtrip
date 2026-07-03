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
  const state = { chats: 0, bodies: [] }
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
    try { state.bodies.push(JSON.parse(route.request().postData() || '{}')) } catch { state.bodies.push(null) }
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

// A STAY Claude lays out with a lodging ADDRESS but NO coordinates (the real
// AI/screenshot shape — cardToTrip emits no coords). Exercises auto-locate-on-
// create: handleClaudeCreateTrip best-effort geocodes the lodging at save time.
function ptownStayCard(id) {
  return {
    type: 'create_trip',
    id,
    trip: {
      title: 'Provincetown Getaway',
      subtitle: 'Harbor Breeze',
      shape: 'stay',
      startCity: 'Belmont, MA',
      endCity: 'Provincetown, MA',
      dateRangeStart: '2026-08-07',
      dateRangeEnd: '2026-08-10',
      travelers: ['Jonathan', 'Helen', 'Aurelia', 'Rafa'],
      days: [
        {
          dayNumber: 1,
          title: 'Arrive',
          date: '2026-08-07',
          stops: [
            { id: 'pt-1-1', time: '3:00 PM', name: 'Harbor Breeze', address: '690 Commercial St', category: 'LODGING', description: 'Check in.', who: ['Jonathan', 'Helen', 'Aurelia', 'Rafa'], driveFromPrevious: null },
          ],
        },
      ],
    },
  }
}

// A BIGGER trip where Claude SUGGESTS a surprise on one part (the villa is a
// surprise for the kids). The author (the session) confirms in the review.
function surpriseCard(id) {
  const c = italyCard(id)
  c.trip.parts = c.trip.parts.map((p) =>
    p.title.includes('villa')
      ? { ...p, surprise: { hideFrom: ['Rafa', 'Aurelia'], conceal: 'teaser' } }
      : p
  )
  return c
}

// Claude suggests a surprise but names someone NOT in the family (a misheard name).
function surpriseUnmappedCard(id) {
  const c = italyCard(id)
  c.trip.parts = c.trip.parts.map((p) =>
    p.title.includes('villa')
      ? { ...p, surprise: { hideFrom: ['Rafa', 'Grandma'], conceal: 'teaser' } }
      : p
  )
  return c
}

// A BIGGER trip: Claude lays out distinct legs via the optional `parts` array.
function italyCard(id) {
  return {
    type: 'create_trip',
    id,
    trip: {
      title: 'Italy, summer',
      subtitle: 'Rome, a villa, the coast',
      startCity: 'Boston, MA',
      endCity: 'Boston, MA',
      dateRangeStart: '2026-07-01',
      dateRangeEnd: '2026-07-13',
      travelers: ['Jonathan', 'Helen', 'Aurelia', 'Rafa'],
      parts: [
        { type: 'flight', title: 'Fly Boston → Rome', dateStart: '2026-07-01' },
        { type: 'city', title: 'Three nights in Rome', place: 'Rome', dateStart: '2026-07-01', dateEnd: '2026-07-04' },
        { type: 'stay', title: 'A week at a Tuscan villa', place: 'Val d’Orcia', dateStart: '2026-07-04', dateEnd: '2026-07-11' },
        { type: 'drive', title: 'Drive the Amalfi coast', dateStart: '2026-07-11', dateEnd: '2026-07-13' },
      ],
      days: [
        {
          dayNumber: 1,
          title: 'Arrive in Rome',
          date: '2026-07-01',
          stops: [
            { id: 'it-1-1', time: '9:00 AM', name: 'Land at Fiumicino', address: 'Rome, Italy', category: 'LOGISTICS', description: 'Arrival and transfer.', who: ['Jonathan', 'Helen', 'Aurelia', 'Rafa'], driveFromPrevious: null },
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
  const back = page.getByRole('button', { name: /back to trips/i })
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
    await page.getByRole('button', { name: /back to trips/i }).first().click()
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

  test('a BIGGER trip: the card shows the parts timeline and the saved trip carries parts', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    mockIndexChat(page, [
      replyWithCard(italyCard('ct-italy-1'), 'Here’s the shape of it.'),
    ])
    await page.goto(`/?person=${PERSONA}&nosw=1`)

    const dialog = await openIndexChat(page)
    await sendMessage(dialog, 'Italy in July: fly to Rome, 3 nights, then a Tuscan villa a week, then drive the Amalfi coast')

    const card = dialog.getByTestId('confirm-card-create_trip')
    await expect(card).toBeVisible({ timeout: 5000 })

    // The composite "here's the shape of it" timeline renders the legs in order.
    const parts = card.getByTestId('create-trip-parts')
    await expect(parts).toBeVisible()
    await expect(parts).toContainText('The parts · 4')
    await expect(parts.getByText('Three nights in Rome')).toBeVisible()
    await expect(parts.getByText('Drive the Amalfi coast')).toBeVisible()

    // Save → the saved trip carries the parts (the model), in order.
    await card.getByTestId('confirm-card-save').click()
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const all = JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]')
            const t = all.find((x) => x.title === 'Italy, summer')
            return t && Array.isArray(t.parts) ? t.parts.length : -1
          }),
        { timeout: 5000 }
      )
      .toBe(4)

    const types = await page.evaluate(() => {
      const all = JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]')
      const t = all.find((x) => x.title === 'Italy, summer')
      return (t.parts || []).map((p) => p.type)
    })
    expect(types).toEqual(['flight', 'city', 'stay', 'drive'])
  })

  // Auto-locate on create: an AI/screenshot STAY carries a lodging ADDRESS but no
  // coords, so "We could…" (which needs stayPlaceCoords) would open empty. The
  // create path best-effort geocodes the lodging onto trip.lodging.lat/lng at save
  // time, so the tray fills from the first open — no manual "Locate this stay" tap.
  test('a STAY with an address but no coords auto-locates on create (geocode → trip.lodging.lat/lng)', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    mockIndexChat(page, [replyWithCard(ptownStayCard('ct-ptown-1'), 'A few days in Provincetown.')])
    // The keyless geocoder the create path calls — mocked so CI never hits OSM.
    await page.route(/nominatim\.openstreetmap\.org\/search/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ lat: '42.0584', lon: '-70.1787' }]) }),
    )
    await page.goto(`/?person=${PERSONA}&nosw=1`)

    const dialog = await openIndexChat(page)
    await sendMessage(dialog, 'a long weekend in Provincetown, staying at Harbor Breeze')
    const card = dialog.getByTestId('confirm-card-create_trip')
    await expect(card).toBeVisible({ timeout: 5000 })
    await card.getByTestId('confirm-card-save').click()

    // The saved stay carries geocoded coords on trip.lodging (built from the
    // lodging stop's address + the trip's town), so stayPlaceCoords resolves.
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const all = JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]')
            const t = all.find((x) => x.title === 'Provincetown Getaway')
            return t?.lodging && Number.isFinite(t.lodging.lat) ? `${t.lodging.lat},${t.lodging.lng}` : 'unlocated'
          }),
        { timeout: 5000 }
      )
      .toBe('42.0584,-70.1787')
  })

  // Auto-locate on create, the per-leg mirror: a BIGGER trip's city/stay legs
  // carry a place NAME but no coords (no current producer — the AI concierge or
  // the manual composite builder — emits lat/lng for a leg). Without this,
  // "We could…" and the live map would open anchored nowhere for that leg. The
  // create path best-effort geocodes each leg missing coords at save time — a
  // pure transit leg (the flight, the drive) is skipped, not force-fit.
  test('a BIGGER trip\'s city/stay legs auto-locate on create (geocode → part.coords); transit legs are skipped', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    mockIndexChat(page, [replyWithCard(italyCard('ct-italy-2'), 'Here’s the shape of it.')])
    // The keyless geocoder the create path calls — mocked so CI never hits OSM.
    await page.route(/nominatim\.openstreetmap\.org\/search/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ lat: '41.9028', lon: '12.4964' }]) }),
    )
    await page.goto(`/?person=${PERSONA}&nosw=1`)

    const dialog = await openIndexChat(page)
    await sendMessage(dialog, 'Italy in July: fly to Rome, 3 nights, then a Tuscan villa a week, then drive the Amalfi coast')
    const card = dialog.getByTestId('confirm-card-create_trip')
    await expect(card).toBeVisible({ timeout: 5000 })
    await card.getByTestId('confirm-card-save').click()

    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const all = JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]')
            const t = all.find((x) => x.title === 'Italy, summer')
            return Array.isArray(t?.parts) ? t.parts.map((p) => (p.coords ? `${p.type}:${p.coords.lat},${p.coords.lng}` : `${p.type}:none`)) : null
          }),
        { timeout: 5000 }
      )
      .toEqual(['flight:none', 'city:41.9028,12.4964', 'stay:41.9028,12.4964', 'drive:none'])
  })

  test('a SURPRISE part: the review shows who is hidden + can draft a cover; the saved part is masked, author from the session', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    mockIndexChat(page, [replyWithCard(surpriseCard('ct-surp-1'), 'Here’s the shape of it.')])
    // The /cover seam (Claude drafts a believable stand-in).
    await page.route(/roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/cover$/, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ icon: '🌅', title: 'A quiet few days', loc: 'the coast' }) })
    })
    await page.goto(`/?person=${PERSONA}&nosw=1`)

    const dialog = await openIndexChat(page)
    await sendMessage(dialog, 'Italy in July, and the villa is a surprise for the kids')
    const card = dialog.getByTestId('confirm-card-create_trip')
    await expect(card).toBeVisible({ timeout: 5000 })

    // The author SEES who's hidden (confirm-by-reading) and what they'll see.
    const review = card.getByTestId('part-surprise-review')
    await expect(review).toBeVisible()
    await expect(review).toContainText(/hidden from/i)
    await expect(review).toContainText('Rafa')
    await expect(review).toContainText('Aurelia')

    // Draft a cover → conceal flips to a believable stand-in.
    await review.getByTestId('part-surprise-cover').click()
    await expect(review).toContainText('A quiet few days', { timeout: 5000 })

    // Save → the villa part carries the surprise, author = the SESSION (helen, not the
    // payload), audience = the kids, conceal = cover. (The boundary masks it.)
    await card.getByTestId('confirm-card-save').click()
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const all = JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]')
            const t = all.find((x) => x.title === 'Italy, summer')
            const villa = (t?.parts || []).find((p) => (p.title || '').includes('villa'))
            return villa?.surprise ? `${villa.surprise.author}|${villa.surprise.hideFrom.join(',')}|${villa.surprise.conceal}` : 'none'
          }),
        { timeout: 5000 }
      )
      .toBe('helen|rafa,aurelia|cover')
  })

  test('a surprise with an unmappable name WARNS the author; only the recognized people are hidden', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    mockIndexChat(page, [replyWithCard(surpriseUnmappedCard('ct-surp-3'), 'Here’s the shape of it.')])
    await page.goto(`/?person=${PERSONA}&nosw=1`)
    const dialog = await openIndexChat(page)
    await sendMessage(dialog, 'Italy in July, hide the villa from Rafa and Grandma')
    const card = dialog.getByTestId('confirm-card-create_trip')
    const review = card.getByTestId('part-surprise-review')
    await expect(review).toBeVisible({ timeout: 5000 })
    // Rafa is hidden; the author is warned Grandma couldn't be found.
    await expect(review).toContainText('Rafa')
    await expect(review.getByTestId('part-surprise-unmapped')).toContainText('Grandma')
    // Save → only the recognized person (rafa) is hidden; Grandma is dropped.
    await card.getByTestId('confirm-card-save').click()
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const all = JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]')
            const t = all.find((x) => x.title === 'Italy, summer')
            const villa = (t?.parts || []).find((p) => (p.title || '').includes('villa'))
            return villa?.surprise ? villa.surprise.hideFrom.join(',') : 'none'
          }),
        { timeout: 5000 }
      )
      .toBe('rafa')
  })

  test('a SURPRISE part can be REMOVED in the review — the saved part is then a normal, visible part', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    mockIndexChat(page, [replyWithCard(surpriseCard('ct-surp-2'), 'Here’s the shape of it.')])
    await page.goto(`/?person=${PERSONA}&nosw=1`)
    const dialog = await openIndexChat(page)
    await sendMessage(dialog, 'Italy in July, and the villa is a surprise for the kids')
    const card = dialog.getByTestId('confirm-card-create_trip')
    await expect(card.getByTestId('part-surprise-review')).toBeVisible({ timeout: 5000 })
    await card.getByTestId('part-surprise-remove').click()
    await expect(card.getByTestId('part-surprise-review')).toHaveCount(0)
    await card.getByTestId('confirm-card-save').click()
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const all = JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]')
            const t = all.find((x) => x.title === 'Italy, summer')
            const villa = (t?.parts || []).find((p) => (p.title || '').includes('villa'))
            return villa ? !!villa.surprise : null
          }),
        { timeout: 5000 }
      )
      .toBe(false)
  })

  test('screenshot intake: an attached image is sent to the planner (vision) and a card comes back', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    const mock = mockIndexChat(page, [
      replyWithCard(italyCard('ct-italy-shot'), 'Read your screenshot — here it is.'),
    ])
    await page.goto(`/?person=${PERSONA}&nosw=1`)

    const dialog = await openIndexChat(page)

    // A tiny valid PNG attached via the composer's (hidden) file input.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    )
    await dialog
      .getByTestId('chat-image-input')
      .setInputFiles({ name: 'flight-confirmation.png', mimeType: 'image/png', buffer: png })
    await expect(dialog.getByTestId('chat-image-chips')).toContainText(/flight-confirmation/)

    // Send with no typed text (screenshot-only) — a default message rides along.
    await dialog.getByRole('button', { name: /Send message/i }).click()

    // The request carried the image to the worker as a base64 vision attachment.
    await expect
      .poll(
        () => {
          const b = mock.bodies.find((x) => Array.isArray(x?.images) && x.images.length)
          return b ? b.images[0].media_type : null
        },
        { timeout: 5000 }
      )
      .toBe('image/png')
    const withImg = mock.bodies.find((x) => Array.isArray(x?.images) && x.images.length)
    expect(withImg.images[0].data.length).toBeGreaterThan(10) // base64 payload present
    expect((withImg.message || '').length).toBeGreaterThan(0) // non-empty default message

    // The planner's reply still renders the trip card.
    await expect(dialog.getByTestId('confirm-card-create_trip')).toBeVisible({ timeout: 5000 })
  })

  // D — the chat that CREATED a trip OWNS it: a follow-up edits that trip instead of
  // spawning a duplicate. Reopen the past create-conversation; its messages carry the
  // create_trip card, so the chat adopts the trip and routes the next turn to it (the
  // /claude/chat request carries the owned trip's id → the worker edits, not creates).
  test('D: a follow-up in the chat that created a trip targets that trip (no duplicate)', async ({ page }) => {
    const CREATED = {
      id: 'asheville-long-weekend-2026-10',
      title: 'Asheville Long Weekend',
      subtitle: 'Art, mountains, and good food',
      draft: false,
      status: 'planning',
      dateRangeStart: '2026-10-09',
      dateRangeEnd: '2026-10-12',
      travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
      days: [{ n: 1, isoDate: '2026-10-09', title: 'Friday', stops: [{ id: 'ash-1-1', name: 'The Foundry Hotel', kind: 'lodging' }] }],
    }
    await seedTripIntoCache(page, CREATED) // the trip the conversation made, already saved

    const state = { bodies: [] }
    // A past conversation exists (the one that created the trip).
    await page.route(/roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/claude\/conversations(\?|$)/, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
          { id: 'c-ash', user_id: 'helen', trip_id: null, preview: 'Plan a long weekend in Asheville', updated_at: '2026-05-23T12:00:00.000Z' },
        ]) })
        return
      }
      const b = JSON.parse(route.request().postData() || '{}')
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: b.id || 'c-ash', user_id: b.user_id, trip_id: b.trip_id || null }) })
    })
    // Its history carries the create_trip card → the conversation OWNS the Asheville trip.
    await page.route(/roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/claude\/conversations\/[^/]+\/messages$/, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { role: 'user', content: 'Plan a long weekend in Asheville', created_at: '2026-05-23T12:00:00.000Z' },
        { role: 'assistant', content: replyWithCard(ashevilleCard('ct-ash-1', 'River Arts District')), created_at: '2026-05-23T12:01:00.000Z' },
      ]) })
    })
    // Capture each /claude/chat request so we can assert the follow-up's tripId.
    await page.route(/roadtrip-sync\.jonathan-d-jackson\.workers\.dev\/claude\/chat$/, async (route) => {
      try { state.bodies.push(JSON.parse(route.request().postData() || '{}')) } catch { state.bodies.push(null) }
      const text = 'Done — made it a chill stay.'
      const chunks = []
      for (let i = 0; i < text.length; i += 24) chunks.push({ type: 'text_delta', text: text.slice(i, i + 24) })
      chunks.push({ type: 'done', usage: { input_tokens: 10, output_tokens: 10 } })
      await route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sseFrames(...chunks) })
    })

    await page.goto(`/?person=${PERSONA}&nosw=1`)
    await page.getByRole('button', { name: /Plan with Claude/i }).click()
    const dialog = page.getByRole('dialog', { name: /Chat with Claude/i })
    await expect(dialog).toBeVisible()
    // Open the PAST conversation (not a fresh one).
    await dialog.getByText(/Plan a long weekend in Asheville/i).click()
    // Its create card renders → the conversation's trip is in context.
    await expect(dialog.getByTestId('confirm-card-create_trip')).toBeVisible({ timeout: 5000 })

    await sendMessage(dialog, 'actually this is just a chill hangout — make it a stay')

    // THE PROOF: the follow-up went out targeting the OWNED trip (edit mode) — not as
    // a tripId-less create — so the worker edits it and no duplicate is born.
    await expect
      .poll(() => {
        const b = state.bodies[state.bodies.length - 1]
        return b ? b.trip_id : null
      }, { timeout: 5000 })
      .toBe('asheville-long-weekend-2026-10')
  })

  // E — Claude PROPOSES a whole-trip delete; the reader taps Delete to confirm (the
  // human-in-the-loop safeguard); the trip is then removed. (Claude never deletes on
  // its own — the confirm tap is required.)
  test('E: a delete_trip card removes the trip on confirm', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    mockIndexChat(page, [
      replyWithCard(
        { type: 'delete_trip', id: 'del-1', target: { tripId: 'volleyball-2026' }, title: 'Fun @ the Sun' },
        'Here it is to confirm.'
      ),
    ])
    await page.goto(`/?person=${PERSONA}&nosw=1`)
    const dialog = await openIndexChat(page)
    await sendMessage(dialog, 'delete this trip')

    const card = dialog.getByTestId('confirm-card-delete_trip')
    await expect(card).toBeVisible({ timeout: 5000 })
    await expect(card.getByTestId('confirm-card-save')).toContainText(/Delete trip/i) // a destructive label, not "Save"
    await card.getByTestId('confirm-card-save').click()

    // The trip is gone from the cache (soft-deleted on the worker).
    await expect
      .poll(
        () => page.evaluate(() => JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]').some((t) => t.id === 'volleyball-2026')),
        { timeout: 5000 }
      )
      .toBe(false)
  })

  // E2 — sync-honesty: a delete_trip card whose REMOTE delete fails must route
  // through the honest removeTrip (tombstone + local removal, retried later), not a
  // blind {ok:true} that a later pull silently reverses. The card handler now reads
  // removeTrip's { synced } instead of assuming success (same class as the SaveBadge
  // fix). This proves the failed-delete self-heals rather than resurrecting.
  test('E2: a delete_trip card whose remote delete FAILS is tombstoned, not silently reversed', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    mockIndexChat(page, [
      replyWithCard(
        { type: 'delete_trip', id: 'del-2', target: { tripId: 'volleyball-2026' }, title: 'Fun @ the Sun' },
        'Here it is to confirm.'
      ),
    ])
    // Make the remote DELETE fail (the row stays in D1 — the resurrection setup).
    // Registered after mockIndexChat's /trips upsert route → this DELETE handler wins.
    await page.route(/roadtrip-sync[^/]*\/trips\/[^/?]+$/, (route) =>
      route.request().method() === 'DELETE'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"simulated delete failure"}' })
        : route.fallback()
    )
    await page.goto(`/?person=${PERSONA}&nosw=1`)
    const dialog = await openIndexChat(page)
    await sendMessage(dialog, 'delete this trip')

    const card = dialog.getByTestId('confirm-card-delete_trip')
    await expect(card).toBeVisible({ timeout: 5000 })
    await card.getByTestId('confirm-card-save').click()

    // Gone locally AND tombstoned — the failed family-delete is remembered + retried,
    // and every pull skips the id, so the stale server row can't resurrect the trip.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const tombs = JSON.parse(localStorage.getItem('rt_delete_tombstones_v1') || '{}')
            const cache = JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]')
            return {
              tombstoned: (tombs.trip || []).some((e) => e.id === 'volleyball-2026'),
              inCache: cache.some((t) => t.id === 'volleyball-2026'),
            }
          }),
        { timeout: 5000 }
      )
      .toEqual({ tombstoned: true, inCache: false })
  })

  // E3 — sync-honesty: a delete_trip card for a surprise HIDDEN from the viewer must
  // fail loud, not fire a delete the worker silently no-op's. The worker refuses a
  // masked-from delete with a non-leaking 200 {deleted:0} the client can't tell from
  // success → it clears the tombstone and the trip resurrects on the next pull. The
  // card handler now refuses up front (isTripMaskedFrom), so nothing is deleted.
  test('E3: a delete_trip card for a trip HIDDEN from the viewer fails loud (no silent no-op → resurrection)', async ({ page }) => {
    await seedTripIntoCache(page, FIXTURE_TRIP)
    // A surprise trip authored by jonathan, hidden from helen (the persona). The client
    // masks it to a stand-in; the worker would refuse its delete with a non-leaking 200.
    const HIDDEN = {
      id: 'secret-from-helen', title: 'Secret trip', status: 'planning',
      dateRange: 'Aug 1 – 5, 2026', dateRangeStart: '2026-08-01', dateRangeEnd: '2026-08-05',
      travelers: ['jonathan', 'helen'],
      days: [{ n: 1, isoDate: '2026-08-01', stops: [] }],
      surprise: { author: 'jonathan', hideFrom: ['helen'], reveal: { type: 'manual' }, conceal: 'cover', cover: { title: 'A trip', loc: '' } },
    }
    await page.addInitScript((t) => {
      const arr = JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]')
      if (!arr.some((x) => x.id === t.id)) arr.push(t)
      localStorage.setItem('rt_trips_cache_v1', JSON.stringify(arr))
    }, HIDDEN)
    mockIndexChat(page, [
      replyWithCard(
        { type: 'delete_trip', id: 'del-3', target: { tripId: 'secret-from-helen' }, title: 'A trip' },
        'Here it is to confirm.'
      ),
    ])
    await page.goto(`/?person=${PERSONA}&nosw=1`)
    const dialog = await openIndexChat(page)
    await sendMessage(dialog, 'delete that trip')

    const card = dialog.getByTestId('confirm-card-delete_trip')
    await expect(card).toBeVisible({ timeout: 5000 })
    await card.getByTestId('confirm-card-save').click()

    // Fails loud (an error note), and the hidden trip is STILL in cache — it was
    // never fired at the worker (which would 200-no-op it → resurrection).
    await expect(dialog.getByTestId('confirm-card-error')).toBeVisible({ timeout: 5000 })
    const stillThere = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('rt_trips_cache_v1') || '[]').some((t) => t.id === 'secret-from-helen')
    )
    expect(stillThere, 'the hidden trip must NOT be deleted').toBe(true)
  })
})
