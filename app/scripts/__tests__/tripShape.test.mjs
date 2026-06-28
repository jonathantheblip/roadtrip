import { test } from 'node:test'
import assert from 'node:assert/strict'

const { inferTripShape, overnightBases, isStayTrip, stayLabel, destinationLabel } = await import('../../src/lib/tripShape.js')
const { JACKSON_TRIP, NYC_TRIP, VOLLEYBALL_TRIP } = await import('../../src/data/trips.js')

// ── STOP-CONDITION: the detector must match the REAL trips. Mislabeling a road
// trip as a stay would hide its drive stats (G5). These assertions are the gate. ──

test('jackson-2026 (drive across the country, 5+ distinct overnight lodgings) → ROUTE', () => {
  assert.ok(overnightBases(JACKSON_TRIP).size >= 2, 'jackson sleeps in many places')
  assert.equal(inferTripShape(JACKSON_TRIP), 'route')
})

test('volleyball-2026 (one Beach Bungalow base + homeBase) → STAY', () => {
  assert.equal(inferTripShape(VOLLEYBALL_TRIP), 'stay')
  assert.ok(isStayTrip(VOLLEYBALL_TRIP))
})

// ── Destination auto-recognition: a stay whose place was typed as the trip's
// DESTINATION (endCity) with a blank lodging — the real Vermont cabin trip. The
// safe rule fires only on the bases-EMPTY case + no inter-place driving, so a
// road trip (which records lodging, or drives between places) can never mis-flip. ──
const vermontPreFix = {
  id: 'v', title: 'Vermont — Juneteenth Weekend', shape: null,
  startCity: 'Belmont, MA', endCity: '613 Forest Mountain Road, Peru, VT',
  days: [
    { n: 1, drive: { from: 'Belmont, MA', to: '', miles: 0 }, lodging: '', stops: [] },
    { n: 2, drive: { from: '', to: '', miles: 0 }, lodging: '', stops: [] },
    { n: 3, drive: { from: '', to: 'Belmont, MA', miles: 0 }, lodging: '', stops: [] },
  ],
}

test('THE GAP: cabin address in endCity, blank lodging, no driving → STAY (auto-recognized)', () => {
  assert.equal(overnightBases(vermontPreFix).size, 0, 'no lodging recorded')
  assert.equal(inferTripShape(vermontPreFix), 'stay')
  assert.equal(stayLabel(vermontPreFix), 'Peru', 'names the place from endCity, not the trip title')
})

test('G5: a bases-empty ROAD TRIP (no lodging, multi-leg driving between places) → ROUTE', () => {
  const roadNoLodging = {
    id: 'r', shape: null, startCity: 'Belmont, MA', endCity: 'Houston, TX',
    days: [
      { n: 1, drive: { from: 'Belmont, MA', to: 'Catskills, NY', miles: 175 }, lodging: '', stops: [] },
      { n: 2, drive: { from: 'Catskills, NY', to: 'Elizabethton, TN', miles: 690 }, lodging: '', stops: [] },
      { n: 3, drive: { from: 'Elizabethton, TN', to: 'Houston, TX', miles: 730 }, lodging: '', stops: [] },
    ],
  }
  assert.equal(overnightBases(roadNoLodging).size, 0)
  assert.equal(inferTripShape(roadNoLodging), 'route', 'inter-place driving keeps it a route')
})

// ── Mis-flips the adversarial review caught (the both-endpoints-non-home guard
// let one-way + multi-destination + stop-based routes slip to 'stay'). ──
test('one destination = STAY by COUNT, not distance; a 2nd distinct place = ROUTE', () => {
  // The signal is how many DISTINCT places the trip touches — not how far you
  // drove or whether you logged the return. A single far destination is a stay
  // (you're anchored there); a second distinct place makes it a route.
  const oneDest = { shape: null, startCity: 'Belmont, MA', endCity: 'Chicago, IL', days: [{ drive: { from: 'Belmont, MA', to: 'Chicago, IL', miles: 980 }, lodging: '', stops: [] }] }
  assert.equal(inferTripShape(oneDest), 'stay')
  const twoDest = { ...oneDest, days: [...oneDest.days, { drive: { from: 'Chicago, IL', to: 'Detroit, MI', miles: 280 }, lodging: '', stops: [] }] }
  assert.equal(inferTripShape(twoDest), 'route')
})

test('G5: two distinct destinations, both legs FROM home → ROUTE', () => {
  const t = { shape: null, startCity: 'Belmont, MA', endCity: 'Chicago, IL', days: [
    { drive: { from: 'Belmont, MA', to: 'Chicago, IL', miles: 500 }, lodging: '', stops: [] },
    { drive: { from: 'Belmont, MA', to: 'Detroit, MI', miles: 300 }, lodging: '', stops: [] },
  ] }
  assert.equal(inferTripShape(t), 'route', 'a 2nd distinct destination makes it a route even from home')
})

test('G5: located stops spread far apart (driving in stops, not day.drive) → ROUTE', () => {
  const t = { shape: null, startCity: 'Boston, MA', endCity: 'Houston, TX', days: [
    { drive: {}, lodging: '', stops: [{ name: 'Catskills', lat: 42.19, lng: -74.13 }] },
    { drive: {}, lodging: '', stops: [{ name: 'Nashville', lat: 36.16, lng: -86.78 }] },
    { drive: {}, lodging: '', stops: [{ name: 'Memphis', lat: 35.14, lng: -90.05 }] },
  ] }
  assert.equal(inferTripShape(t), 'route', 'stops spanning 1000+mi are a route, not one stay')
})

test('G5: a short multi-city hop tour (sub-25mi legs, no lodging) → ROUTE', () => {
  // A North Shore day tour: distinct towns, short legs. The earlier 25mi gate
  // let these slip to 'stay'; a drive to a distinct NAMED place is movement.
  const tour = { shape: null, startCity: 'Cambridge, MA', endCity: 'Salem, MA', days: [
    { drive: { from: 'Cambridge, MA', to: 'Salem, MA', miles: 18 }, lodging: '', stops: [] },
    { drive: { from: 'Salem, MA', to: 'Gloucester, MA', miles: 16 }, lodging: '', stops: [] },
    { drive: { from: 'Gloucester, MA', to: 'Rockport, MA', miles: 7 }, lodging: '', stops: [] },
  ] }
  assert.equal(inferTripShape(tour), 'route')
  // NYC borough-hopping is the same shape → route, not an NYC "stay".
  const nyc = { shape: null, startCity: 'Belmont, MA', endCity: 'New York, NY', days: [
    { drive: { from: 'Brooklyn', to: 'Manhattan', miles: 8 }, lodging: '', stops: [] },
    { drive: { from: 'Manhattan', to: 'Queens', miles: 12 }, lodging: '', stops: [] },
  ] }
  assert.equal(inferTripShape(nyc), 'route')
})

test('G5: a cross-country loop through same-first-name cities (Portland ME vs OR) → ROUTE', () => {
  // First-segment keying would collapse both Portlands and flatten the route.
  const t = { shape: null, startCity: 'Belmont, MA', endCity: 'Portland', days: [
    { drive: { from: 'Belmont, MA', to: 'Portland, ME', miles: 110 }, lodging: '', stops: [] },
    { drive: { from: 'Portland, ME', to: 'Portland, OR', miles: 3100 }, lodging: '', stops: [] },
    { drive: { from: 'Portland, OR', to: 'Belmont, MA', miles: 3100 }, lodging: '', stops: [] },
  ] }
  assert.equal(inferTripShape(t), 'route')
})

test('a NAMED-place destination (cabin / Grandma’s) whose drives use the town → STAY', () => {
  // Vision-central shape: endCity is a venue ("Grandma's House, Peru, VT"); the
  // drives reference the town ("Peru, VT"). Matching endCity to the drive string
  // wrongly routed it — counting distinct non-home away-places fixes it.
  const t = { title: 'Grandma’s for the holidays', shape: null, startCity: 'Belmont, MA', endCity: "Grandma's House, Peru, VT", days: [
    { drive: { from: 'Belmont, MA', to: 'Peru, VT', miles: 182 }, lodging: '', stops: [{ name: 'Bromley Market', kind: 'food' }] },
    { drive: { from: 'Peru, VT', to: 'Belmont, MA', miles: 182 }, lodging: '', stops: [] },
  ] }
  assert.equal(inferTripShape(t), 'stay')
})

test('a stay with CLUSTERED local stops (near the place) stays a STAY', () => {
  const t = { shape: null, startCity: 'Belmont, MA', endCity: 'Peru, VT', days: [
    { drive: { from: 'Belmont, MA', to: '', miles: 0 }, lodging: '', stops: [{ name: 'Lake', lat: 43.24, lng: -72.90 }] },
    { drive: { from: '', to: 'Belmont, MA', miles: 0 }, lodging: '', stops: [{ name: 'Store', lat: 43.25, lng: -72.88 }] },
  ] }
  assert.equal(inferTripShape(t), 'stay')
})

test('a flight-stay (single far destination, zero driving) → STAY', () => {
  const t = { shape: null, startCity: 'Belmont, MA', endCity: 'Paris, France', days: [{ drive: {}, lodging: '', stops: [] }, { drive: {}, lodging: '', stops: [] }] }
  assert.equal(inferTripShape(t), 'stay')
})

test('edge: drove FAR to one place then stayed (legs involve home) → STAY', () => {
  const farCabin = {
    shape: null, startCity: 'Belmont, MA', endCity: 'Bar Harbor, ME',
    days: [
      { n: 1, drive: { from: 'Belmont, MA', to: 'Bar Harbor, ME', miles: 280 }, lodging: '', stops: [] },
      { n: 2, drive: { from: '', to: '', miles: 0 }, lodging: '', stops: [] },
      { n: 3, drive: { from: 'Bar Harbor, ME', to: 'Belmont, MA', miles: 280 }, lodging: '', stops: [] },
    ],
  }
  assert.equal(inferTripShape(farCabin), 'stay')
})

test('edge: a round trip with NO destination (blank endCity) → ROUTE (safe default)', () => {
  assert.equal(inferTripShape({ shape: null, startCity: 'Belmont, MA', endCity: '', days: [{ n: 1, drive: {}, lodging: '', stops: [] }] }), 'route')
})

test('edge: endCity === startCity (round trip back to start, no away-place) → ROUTE', () => {
  assert.equal(inferTripShape({ shape: null, startCity: 'Belmont, MA', endCity: 'Belmont, MA', days: [{ n: 1, drive: { miles: 0 }, lodging: '', stops: [] }] }), 'route')
})

test('an explicit shape still wins over auto-recognition (hand-override)', () => {
  assert.equal(inferTripShape({ ...vermontPreFix, shape: 'route' }), 'route')
})

test('home spelling variants ("Belmont" vs "Belmont, MA") still recognize the cabin stay', () => {
  const make = (homeOnLeg) => ({ shape: null, startCity: 'Belmont, MA', endCity: 'Stowe, VT', days: [
    { drive: { from: homeOnLeg, to: 'Stowe, VT', miles: 200 }, lodging: '', stops: [] },
    { drive: { from: 'Stowe, VT', to: homeOnLeg, miles: 200 }, lodging: '', stops: [] },
  ] })
  assert.equal(inferTripShape(make('Belmont')), 'stay', '"Belmont" keys to the same place as "Belmont, MA"')
  assert.equal(inferTripShape(make('Belmont, Massachusetts')), 'stay')
})

test('a garbage/empty endCity is NOT auto-recognized as a stay (and renders no junk label)', () => {
  const t = { shape: null, startCity: 'Belmont, MA', endCity: '  ,  ,  ', title: 'Mystery', days: [{ drive: {}, lodging: '', stops: [] }] }
  assert.equal(inferTripShape(t), 'route')
  assert.equal(destinationLabel('  ,  ,  '), '')
  assert.equal(stayLabel(t), 'Mystery', 'falls back to the title, not the comma string')
})

test('destinationLabel: drop a leading street/unit + a trailing state/country → the locality', () => {
  assert.equal(destinationLabel('613 Forest Mountain Road, Peru, VT'), 'Peru')
  assert.equal(destinationLabel('Apt 4B, 200 Main St, Boston, MA'), 'Boston')
  assert.equal(destinationLabel('New York, NY'), 'New York')
  assert.equal(destinationLabel('Bar Harbor, ME'), 'Bar Harbor')
  assert.equal(destinationLabel('Stowe, VT, USA'), 'Stowe')
  assert.equal(destinationLabel('10 Downing Street, London, UK'), 'London')
  assert.equal(destinationLabel('The Cabin'), 'The Cabin')
  assert.equal(destinationLabel(''), '')
  // Not a place name → '' (so the caller falls back to the trip title).
  for (const junk of ['!!!', 'Suite 500', '200 Main St', '123', '90210', 'PO Box 9', 'USA', 'VT', 'UK', '  ,  , VT']) {
    assert.equal(destinationLabel(junk), '', `${junk} is not a locality`)
  }
})

test('nyc-rafa (one Murray Hill base, drive-there-then-stay) → STAY', () => {
  assert.equal(inferTripShape(NYC_TRIP), 'stay')
})

// ── Synthetic edge cases ──

test('a Vermont-cabin-like trip (homeBase set, ~no driving, one place) → STAY', () => {
  const t = {
    id: 'vt', homeBase: { lat: 43.21, lng: -72.9, label: '613 Forest Mountain Rd' },
    lodging: { name: 'The Cabin' },
    days: [
      { n: 1, isoDate: '2026-06-19', lodging: 'The Cabin', stops: [{ id: 'd', kind: 'food', name: 'Dinner out' }] },
      { n: 2, isoDate: '2026-06-20', lodging: 'The Cabin', stops: [] },
      { n: 3, isoDate: '2026-06-21', lodging: 'The Cabin', stops: [] },
    ],
  }
  assert.equal(inferTripShape(t), 'stay')
})

test('a two-base road trip (different lodging each night) → ROUTE', () => {
  const t = { id: 'r', days: [
    { n: 1, lodging: 'Motel A', stops: [] },
    { n: 2, lodging: 'Motel B', stops: [] },
  ] }
  assert.equal(inferTripShape(t), 'route')
})

test('a trip we know nothing about (no lodging, no homeBase) → ROUTE (safe default, keeps today’s behavior)', () => {
  assert.equal(inferTripShape({ id: 'x', days: [{ n: 1, stops: [] }] }), 'route')
})

test('home-only nights are ignored; an explicit trip.shape always wins', () => {
  assert.equal(inferTripShape({ days: [{ lodging: '— (home)' }, { lodging: 'home' }] }), 'route')
  assert.equal(inferTripShape({ shape: 'stay', days: [{ lodging: 'Motel A' }, { lodging: 'Motel B' }] }), 'stay')
  assert.equal(inferTripShape({ shape: 'route', homeBase: { lat: 1, lng: 2 }, lodging: { name: 'Cabin' }, days: [] }), 'route')
})

// ── stayPlace + atPlace (geofence for the live rail) ──
const { stayPlace, atPlace } = await import('../../src/lib/tripShape.js')

test('stayPlace: coords from homeBase, friendly name from the lodging', () => {
  const p = stayPlace({ homeBase: { lat: 41.32, lng: -72.09, label: '41 Lower Blvd, New London, CT' }, lodging: { name: 'Beach Bungalow' }, days: [] })
  assert.deepEqual([p.lat, p.lng], [41.32, -72.09])
  assert.equal(p.name, 'Beach Bungalow')
})

test('stayPlace: no lodging name → first segment of the address, not the full street line', () => {
  const p = stayPlace({ homeBase: { lat: 1, lng: 2, label: '41 Lower Boulevard, New London, CT' }, days: [] })
  assert.equal(p.name, '41 Lower Boulevard')
})

test('stayPlace: no coords anywhere → null (live rail falls back to the clock)', () => {
  assert.equal(stayPlace({ lodging: { name: 'Cabin', address: 'somewhere' }, days: [] }), null)
})

test('atPlace: inside the radius → true; far → false; missing position/place → false', () => {
  const place = { lat: 41.32, lng: -72.09, name: 'Cabin' }
  assert.equal(atPlace(place, { lat: 41.3201, lng: -72.0901, accuracy: 15 }), true)
  assert.equal(atPlace(place, { lat: 41.5, lng: -72.5 }), false)
  assert.equal(atPlace(place, null), false)
  assert.equal(atPlace(null, { lat: 41.32, lng: -72.09 }), false)
})

// ── stayLabel + stayNights (home-view place card) ── (stayLabel imported at top)
const { stayNights } = await import('../../src/lib/tripShape.js')

test('stayLabel: prefers the lodging name; stayNights counts real overnight days', () => {
  const t = { lodging: { name: 'Beach Bungalow' }, days: [
    { lodging: 'Beach Bungalow' }, { lodging: 'Beach Bungalow' }, { lodging: 'Beach Bungalow' }, { lodging: '— (home)' },
  ] }
  assert.equal(stayLabel(t), 'Beach Bungalow')
  assert.equal(stayNights(t), 3) // home night excluded
})

test('stayLabel: falls back to a day lodging, then the homeBase first segment, then the title', () => {
  assert.equal(stayLabel({ days: [{ lodging: 'The Cabin' }] }), 'The Cabin')
  assert.equal(stayLabel({ homeBase: { label: '613 Forest Mountain Rd, Peru, VT' }, days: [] }), '613 Forest Mountain Rd')
  assert.equal(stayLabel({ title: 'Cabin Weekend', days: [] }), 'Cabin Weekend')
})

// ── Phase 2: the geocoded lodging ADDRESS is now a coord source ──
const { stayPlaceCoords, detectCurrentPlace } = await import('../../src/lib/tripShape.js')

test('stayPlaceCoords: reads the geocoded lodging.lat/lng (the address-only stay P1.5 couldn’t place)', () => {
  // The real-world case: a cabin trip that typed only an address — no homeBase,
  // no located lodging stop. Before Phase 2 this returned null and "At [place]"
  // silently no-op'd. The confirm-pin geocode now writes lodging.lat/lng.
  const c = stayPlaceCoords({ lodging: { name: 'The Cabin', address: '613 Forest Mountain Rd', lat: 43.21, lng: -72.9 }, days: [] })
  assert.deepEqual([c.lat, c.lng], [43.21, -72.9])
})

test('stayPlaceCoords: source precedence homeBase > lodging.lat/lng > lodging stop', () => {
  // homeBase wins (deliberate anchor, e.g. volleyball-2026)
  const hb = stayPlaceCoords({ homeBase: { lat: 1, lng: 1 }, lodging: { lat: 2, lng: 2 }, days: [{ stops: [{ kind: 'lodging', lat: 3, lng: 3 }] }] })
  assert.deepEqual([hb.lat, hb.lng], [1, 1])
  // no homeBase → the geocoded lodging address wins over a lodging stop
  const lod = stayPlaceCoords({ lodging: { lat: 2, lng: 2 }, days: [{ stops: [{ kind: 'lodging', lat: 3, lng: 3 }] }] })
  assert.deepEqual([lod.lat, lod.lng], [2, 2])
  // neither → fall back to the located lodging stop
  const stop = stayPlaceCoords({ days: [{ stops: [{ kind: 'lodging', lat: 3, lng: 3 }] }] })
  assert.deepEqual([stop.lat, stop.lng], [3, 3])
  // nothing located → null
  assert.equal(stayPlaceCoords({ lodging: { name: 'Cabin' }, days: [] }), null)
})

test('stayPlace: an address-only stay now resolves to a place once geocoded (Phase 2)', () => {
  const p = stayPlace({ lodging: { name: 'The Cabin', address: '613 Forest Mountain Rd', lat: 43.21, lng: -72.9 }, days: [] })
  assert.deepEqual([p.lat, p.lng], [43.21, -72.9])
  assert.equal(p.name, 'The Cabin')
})

// ── Phase 2: detectCurrentPlace — the live rail's shared "are we here?" test ──
test('detectCurrentPlace: stay + device inside the footprint → the place', () => {
  const trip = { lodging: { name: 'The Cabin', lat: 43.21, lng: -72.9 }, days: [{ lodging: 'The Cabin' }, { lodging: 'The Cabin' }] }
  const here = detectCurrentPlace(trip, { lat: 43.2101, lng: -72.9001, accuracy: 20 })
  assert.ok(here)
  assert.equal(here.name, 'The Cabin')
})

test('detectCurrentPlace: stay but device far away → null (rail falls back to the clock)', () => {
  const trip = { lodging: { name: 'The Cabin', lat: 43.21, lng: -72.9 }, days: [{ lodging: 'The Cabin' }, { lodging: 'The Cabin' }] }
  assert.equal(detectCurrentPlace(trip, { lat: 44.0, lng: -73.5 }), null)
})

test('detectCurrentPlace: a ROUTE trip is never "at the place", even standing on the coords → null (G5)', () => {
  const route = { days: [{ lodging: 'Motel A', stops: [{ kind: 'lodging', lat: 43.21, lng: -72.9 }] }, { lodging: 'Motel B' }] }
  assert.equal(detectCurrentPlace(route, { lat: 43.21, lng: -72.9, accuracy: 5 }), null)
})

test('detectCurrentPlace: no position → null (no silent place claim without a fix)', () => {
  const trip = { lodging: { name: 'The Cabin', lat: 43.21, lng: -72.9 }, days: [{ lodging: 'The Cabin' }, { lodging: 'The Cabin' }] }
  assert.equal(detectCurrentPlace(trip, null), null)
})

// ── stayGeocodeQuery — the best string to geocode for auto-locate + the "Locate
// this stay" button. AI/screenshot stays store a lodging ADDRESS but no coords,
// so "We could…" (needs stayPlaceCoords) opens empty until this is geocoded onto
// trip.lodging.lat/lng. ──
const { stayGeocodeQuery } = await import('../../src/lib/tripShape.js')

test('stayGeocodeQuery: prefers the candidate already carrying a city/state (most commas), no duplication', () => {
  // Thin lodging address + a full locationLabel → use the label (geocodes
  // confidently). The label already contains the address, so nothing is appended.
  const q = stayGeocodeQuery({ lodging: { address: '690 Commercial St' }, locationLabel: '690 Commercial St, Provincetown, MA' })
  assert.equal(q, '690 Commercial St, Provincetown, MA')
})

test('stayGeocodeQuery: appends the trip town when the lodging address lacks a city', () => {
  const q = stayGeocodeQuery({ lodging: { address: '12 Beach Rd' }, endCity: 'Wellfleet, MA' })
  assert.equal(q, '12 Beach Rd, Wellfleet, MA')
})

test('stayGeocodeQuery: reads a kind:lodging STOP when there is no trip.lodging (the AI/screenshot shape)', () => {
  const q = stayGeocodeQuery({
    days: [{ stops: [{ kind: 'lodging', name: 'Harbor Breeze', address: '690 Commercial St #4d' }] }],
    locationLabel: 'Provincetown, MA',
  })
  assert.equal(q, '690 Commercial St #4d, Provincetown, MA')
})

test('stayGeocodeQuery: a region-only stay (no lodging) falls back to the town', () => {
  assert.equal(stayGeocodeQuery({ endCity: 'Provincetown, MA', days: [] }), 'Provincetown, MA')
})

test('stayGeocodeQuery: a "home" lodging name is ignored (not a geocodable place)', () => {
  assert.equal(stayGeocodeQuery({ lodging: { name: 'home' }, endCity: 'Provincetown, MA' }), 'Provincetown, MA')
})

test('stayGeocodeQuery: nothing geocodable → null', () => {
  assert.equal(stayGeocodeQuery({ days: [] }), null)
  assert.equal(stayGeocodeQuery({ lodging: { name: '' }, days: [] }), null)
})
