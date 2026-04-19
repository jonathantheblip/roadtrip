// Offline-first drive time estimator for Feature 2.
//
// No API keys available in this PWA, so we estimate leg duration from:
//   - great-circle distance (haversine)
//   - a 1.25× road-winding factor for interstate-style routes
//   - a dialable buffer: 'strict' (Google-style), 'realistic' (+15%),
//     'rafa-mode' (+25%)
// A cache tier for known city-pair durations is layered on top so we can
// hard-code accurate numbers for the trip's actual legs.

export const LOCATIONS = {
  // Known trip anchors — kept manageable. lat/lng + tz.
  belmont:      { name: 'Belmont, MA',         lat: 42.396, lng: -71.178, tz: 'ET' },
  postcard:     { name: 'Postcard Cabins',     lat: 42.217, lng: -73.867, tz: 'ET' },
  scranton:     { name: 'Scranton, PA',        lat: 41.408, lng: -75.672, tz: 'ET' },
  wilkesbarre:  { name: 'Wilkes-Barre, PA',    lat: 41.263, lng: -75.884, tz: 'ET' },
  carlisle:     { name: 'Carlisle, PA',        lat: 40.205, lng: -77.197, tz: 'ET' },
  wvwc:         { name: 'WV Welcome Center',   lat: 39.462, lng: -77.968, tz: 'ET' },
  strasburg:    { name: 'Strasburg, VA',       lat: 38.989, lng: -78.359, tz: 'ET' },
  roanoke:      { name: 'Roanoke, VA',         lat: 37.270, lng: -79.941, tz: 'ET' },
  elizabethton: { name: 'Elizabethton, TN',    lat: 36.315, lng: -82.174, tz: 'ET' },
  knoxville:    { name: 'Knoxville, TN',       lat: 35.961, lng: -83.921, tz: 'ET' },
  chattanooga:  { name: 'Chattanooga, TN',     lat: 35.046, lng: -85.310, tz: 'ET' },
  birmingham:   { name: 'Birmingham, AL',      lat: 33.521, lng: -86.802, tz: 'CT' },
  leeds:        { name: 'Leeds, AL (Barber)',  lat: 33.533, lng: -86.622, tz: 'CT' },
  tuscaloosa:   { name: 'Tuscaloosa, AL',      lat: 33.210, lng: -87.567, tz: 'CT' },
  meridian:     { name: 'Meridian, MS',        lat: 32.364, lng: -88.704, tz: 'CT' },
  mccomb:       { name: 'McComb, MS',          lat: 31.244, lng: -90.454, tz: 'CT' },
  jackson:      { name: 'Jackson, MS',         lat: 32.299, lng: -90.185, tz: 'CT' },
  shreveport:   { name: 'Shreveport, LA',      lat: 32.525, lng: -93.750, tz: 'CT' },
  arlington:    { name: 'Arlington, TX',       lat: 32.736, lng: -97.108, tz: 'CT' },
  houston:      { name: 'Houston, TX',         lat: 29.760, lng: -95.370, tz: 'CT' },
}

// Hard-coded leg durations (minutes of pure driving, best-case Google time).
// Keys are undirected "a|b" where a,b sorted.
const LEG_MINUTES = {
  'belmont|postcard':       170,
  'postcard|scranton':      130,
  'scranton|wilkesbarre':    30,
  'carlisle|wilkesbarre':   110,
  'carlisle|wvwc':          140,
  'strasburg|wvwc':          85,
  'roanoke|strasburg':      155,
  'elizabethton|roanoke':   195,
  'elizabethton|knoxville':  95,
  'chattanooga|knoxville':  110,
  'birmingham|chattanooga': 135,
  'leeds|chattanooga':      120,
  'birmingham|leeds':        25,
  'birmingham|tuscaloosa':   60,
  'birmingham|meridian':    180,
  'leeds|meridian':         205,
  'meridian|jackson':        95,
  'jackson|mccomb':          95,
  'meridian|tuscaloosa':    130,
  'shreveport|jackson':     210,
  'arlington|shreveport':   185,
  'arlington|houston':      240,
  'arlington|birmingham':   680,
}

function hav(a, b) {
  const R = 3958.8 // miles
  const toRad = (x) => (x * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const la1 = toRad(a.lat)
  const la2 = toRad(b.lat)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}

export function legMinutes(originKey, destKey) {
  const a = LOCATIONS[originKey]
  const b = LOCATIONS[destKey]
  if (!a || !b) return null
  const k = [originKey, destKey].sort().join('|')
  if (LEG_MINUTES[k] != null) return LEG_MINUTES[k]
  // Fallback: haversine × 1.25 winding factor, assume 65 mph average.
  const miles = hav(a, b) * 1.25
  return Math.round((miles / 65) * 60)
}

const BUFFER = {
  strict: 1.0,
  realistic: 1.15,
  'rafa-mode': 1.25,
}

export const BUFFER_OPTIONS = [
  { key: 'strict', label: 'Google strict' },
  { key: 'realistic', label: 'Realistic (+15%)' },
  { key: 'rafa-mode', label: 'Rafa mode (+25%)' },
]

// The single computation function. Takes:
//   from: location key
//   to:   location key
//   departure: Date
//   stops: [{ locationKey, durationMin, name? }]
//   buffer: 'strict' | 'realistic' | 'rafa-mode'
// Returns timing breakdown + flags.
export function computeRoute({ from, to, departure, stops = [], buffer = 'realistic' }) {
  if (!LOCATIONS[from] || !LOCATIONS[to]) {
    return { error: 'Unknown origin or destination' }
  }
  const mult = BUFFER[buffer] ?? 1.15
  const legs = []
  let prev = from
  let cursor = new Date(departure.getTime())
  let pureDriveMin = 0
  let dwellMin = 0

  for (const stop of stops) {
    const raw = legMinutes(prev, stop.locationKey)
    if (raw == null) return { error: `Unknown location: ${stop.locationKey}` }
    const driveMin = Math.round(raw * mult)
    const leaveAt = new Date(cursor.getTime() + driveMin * 60000)
    const departAt = new Date(leaveAt.getTime() + (stop.durationMin || 0) * 60000)
    legs.push({
      from: prev, to: stop.locationKey,
      driveMin, arriveAt: leaveAt, dwellMin: stop.durationMin || 0,
      departAt, name: stop.name || LOCATIONS[stop.locationKey].name,
    })
    pureDriveMin += driveMin
    dwellMin += stop.durationMin || 0
    cursor = departAt
    prev = stop.locationKey
  }

  const finalRaw = legMinutes(prev, to)
  if (finalRaw == null) return { error: `Unknown destination leg: ${prev}→${to}` }
  const finalDrive = Math.round(finalRaw * mult)
  const arriveAt = new Date(cursor.getTime() + finalDrive * 60000)
  legs.push({
    from: prev, to, driveMin: finalDrive,
    arriveAt, dwellMin: 0, departAt: arriveAt,
    name: LOCATIONS[to].name,
  })
  pureDriveMin += finalDrive

  const stretches = legs.map((l) => l.driveMin / 60)
  const longestStretch = Math.max(...stretches)
  const medianStretch = median(stretches)
  const flaggedStretches = legs.filter((l) => l.driveMin / 60 > 2.5)

  // Time zone note
  const fromTz = LOCATIONS[from].tz
  const toTz = LOCATIONS[to].tz
  const tzDelta = tzOffsetMinutes(toTz) - tzOffsetMinutes(fromTz)
  const arriveLocal = new Date(arriveAt.getTime() + tzDelta * 60000)

  // Feasibility verdict based on total hours
  const totalHours = (pureDriveMin + dwellMin) / 60
  let verdict = 'works'
  let reasoning = `${roundH(pureDriveMin / 60)}h driving + ${roundH(dwellMin / 60)}h stops`
  if (totalHours > 12) {
    verdict = "don't"
    reasoning = 'Over 12h door-to-door — push a stop to tomorrow'
  } else if (totalHours > 9) {
    verdict = 'tight'
    reasoning = 'Over 9h door-to-door — budget no more surprises'
  }
  if (flaggedStretches.length >= 2) {
    verdict = verdict === 'works' ? 'tight' : verdict
    reasoning += '; multiple stretches over 2.5h'
  }

  return {
    legs,
    pureDriveMin,
    dwellMin,
    doorToDoorMin: pureDriveMin + dwellMin,
    arriveAtOrigin: arriveAt,     // destination clock in origin tz
    arriveAt: arriveLocal,        // destination clock in destination tz
    fromTz, toTz, tzDelta,
    longestStretchH: longestStretch,
    medianStretchH: medianStretch,
    flaggedStretches,
    verdict,
    reasoning,
    buffer,
  }
}

function tzOffsetMinutes(tz) {
  switch (tz) {
    case 'ET': return 0
    case 'CT': return -60
    case 'MT': return -120
    case 'PT': return -180
    default: return 0
  }
}

function median(arr) {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function roundH(h) { return Math.round(h * 10) / 10 }

export function fmtTime(d, tzLabel) {
  if (!d) return ''
  const hh = d.getHours()
  const mm = d.getMinutes()
  const ap = hh >= 12 ? 'PM' : 'AM'
  const h12 = ((hh + 11) % 12) + 1
  const mmStr = mm.toString().padStart(2, '0')
  const suffix = tzLabel ? ` ${tzLabel}` : ''
  return `${h12}:${mmStr} ${ap}${suffix}`
}
