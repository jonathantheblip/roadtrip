// Flight status lookup. Pass 1 ships a stub — the API key (AeroDataBox via
// RapidAPI is the spec recommendation) isn't provisioned yet, so the
// stub returns null and call sites degrade to a "scheduled · tap for live"
// affordance that links out to the airline's flight status page.
//
// When the key lands, set VITE_FLIGHT_API and VITE_FLIGHT_API_KEY in
// .env.local; the runtime call below picks them up automatically.

// 5-minute in-memory cache, keyed by flight number + date.
const cache = new Map()
const TTL_MS = 5 * 60 * 1000

function cacheKey(flightNumber, date) {
  return `${flightNumber}::${date || 'today'}`
}

// Build the airline's public flight-status URL as a fallback. Keeps the
// pill useful even with no API access.
export function airlineStatusUrl(flightNumber) {
  const carrier = (flightNumber || '').slice(0, 2).toUpperCase()
  const num = (flightNumber || '').slice(2).replace(/[^\d]/g, '')
  switch (carrier) {
    case 'DL':
      return `https://www.delta.com/flightinfo/searchByFlight?flightNumber=${num}`
    case 'AA':
      return `https://www.aa.com/travelInformation/flights/status?searchType=flight&flightNumber=${num}`
    case 'UA':
      return `https://www.united.com/en/us/flightstatus`
    case 'B6':
      return `https://www.jetblue.com/flight-tracker?flight=${num}`
    case 'WN':
      return `https://www.southwest.com/air/flight-status/`
    case 'AS':
      return `https://www.alaskaair.com/status/${num}`
    default:
      return `https://www.flightaware.com/live/flight/${encodeURIComponent(flightNumber)}`
  }
}

// Returns:
//   { status, scheduledArrival, estimatedArrival, actualArrival,
//     origin: {airport, terminal, gate}, destination: {...},
//     delayMinutes }
// or null if no API is configured / call fails.
export async function getFlightStatus(flightNumber, date) {
  if (!flightNumber) return null

  const key = cacheKey(flightNumber, date)
  const cached = cache.get(key)
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return cached.data
  }

  const apiBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FLIGHT_API) || ''
  const apiKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FLIGHT_API_KEY) || ''
  if (!apiBase || !apiKey) {
    return null
  }

  // AeroDataBox shape — adjust if we end up on AviationStack instead.
  const url = `${apiBase}/flights/number/${encodeURIComponent(flightNumber)}/${date || ''}`
  try {
    const res = await fetch(url, {
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com',
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    const flight = Array.isArray(json) ? json[0] : json
    const data = normalize(flight)
    cache.set(key, { data, fetchedAt: Date.now() })
    return data
  } catch (err) {
    console.warn('flight status fetch failed', flightNumber, err)
    return null
  }
}

// Map the AeroDataBox shape to our internal one.
function normalize(f) {
  if (!f) return null
  return {
    status: (f.status || 'scheduled').toLowerCase(),
    scheduledArrival: f.arrival?.scheduledTime?.utc || null,
    estimatedArrival: f.arrival?.predictedTime?.utc || f.arrival?.revisedTime?.utc || null,
    actualArrival: f.arrival?.actualTime?.utc || null,
    origin: {
      airport: f.departure?.airport?.iata || null,
      terminal: f.departure?.terminal || null,
      gate: f.departure?.gate || null,
    },
    destination: {
      airport: f.arrival?.airport?.iata || null,
      terminal: f.arrival?.terminal || null,
      gate: f.arrival?.gate || null,
      baggage: f.arrival?.baggageBelt || null,
    },
    delayMinutes: f.arrival?.delayMinutes || 0,
  }
}

// Pretty status label for pill UI. Accepts our normalized shape OR null.
export function formatStatusLabel(status) {
  if (!status) return null
  switch (status.status) {
    case 'landed':
    case 'arrived':
      return 'LANDED'
    case 'cancelled':
      return 'CANCELLED'
    case 'delayed':
      return `DELAYED ${status.delayMinutes ? `${status.delayMinutes}m` : ''}`.trim()
    case 'active':
    case 'enroute':
      return 'EN ROUTE'
    case 'scheduled':
    default:
      return 'ON TIME'
  }
}
