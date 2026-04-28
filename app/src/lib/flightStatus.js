// Flight status lookup via FlightAware AeroAPI v4.
//
// Live data needs:
//   1. A FlightAware AeroAPI key (https://flightaware.com/aeroapi/portal/)
//   2. A small proxy (Cloudflare Worker) that forwards the call and
//      injects the x-apikey header — so the key never ships to the
//      browser. Set VITE_FLIGHT_API to the proxy URL.
//
// Without those, getFlightStatus() returns null and the UI degrades to a
// "tap for live" link straight to FlightAware's public live page for
// the flight (better than airline-specific pages — uniform format,
// works for all carriers, no carrier-detection logic needed).

const cache = new Map()
const TTL_MS = 5 * 60 * 1000

function cacheKey(flightNumber, date) {
  return `${flightNumber}::${date || 'today'}`
}

// FlightAware live page. Accepts both IATA (DL4961) and ICAO (DAL4961);
// FlightAware's web search resolves either. Stripping spaces because
// stop names sometimes carry "DL 4961".
export function flightAwareUrl(flightNumber) {
  const ident = (flightNumber || '').replace(/\s+/g, '').toUpperCase()
  return `https://www.flightaware.com/live/flight/${encodeURIComponent(ident)}`
}

// Backward-compat alias — call sites don't need updating.
export const airlineStatusUrl = flightAwareUrl

// Common IATA → ICAO airline-code prefix map. AeroAPI v4 prefers ICAO
// (DAL4961) for direct lookup; if we get IATA (DL4961) we translate.
const IATA_TO_ICAO = {
  AA: 'AAL',
  AS: 'ASA',
  B6: 'JBU',
  DL: 'DAL',
  F9: 'FFT',
  HA: 'HAL',
  NK: 'NKS',
  UA: 'UAL',
  WN: 'SWA',
  AC: 'ACA', // Air Canada
  AF: 'AFR', // Air France
  BA: 'BAW', // British Airways
  LH: 'DLH', // Lufthansa
  KL: 'KLM',
}

function toIcaoIdent(flightNumber) {
  const cleaned = (flightNumber || '').replace(/\s+/g, '').toUpperCase()
  const carrier = cleaned.slice(0, 2)
  const rest = cleaned.slice(2)
  if (IATA_TO_ICAO[carrier]) return IATA_TO_ICAO[carrier] + rest
  return cleaned
}

// AeroAPI returns ISO date ranges via ?start=&end=. Pad ±1 day around
// the flight date so a redeye doesn't fall outside the window.
function dateWindow(date) {
  if (!date) return { start: null, end: null }
  const d = new Date(`${date}T00:00:00Z`)
  const start = new Date(d.getTime() - 12 * 60 * 60 * 1000).toISOString()
  const end = new Date(d.getTime() + 36 * 60 * 60 * 1000).toISOString()
  return { start, end }
}

// Returns:
//   { status, scheduledArrival, estimatedArrival, actualArrival,
//     origin: {airport, terminal, gate}, destination: {...},
//     delayMinutes }
// or null if no proxy is configured / call fails.
export async function getFlightStatus(flightNumber, date) {
  if (!flightNumber) return null

  const key = cacheKey(flightNumber, date)
  const cached = cache.get(key)
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return cached.data
  }

  const apiBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FLIGHT_API) || ''
  if (!apiBase) {
    return null
  }

  const ident = toIcaoIdent(flightNumber)
  const { start, end } = dateWindow(date)
  const params = new URLSearchParams({ max_pages: '1' })
  if (start) params.set('start', start)
  if (end) params.set('end', end)
  const url = `${apiBase.replace(/\/$/, '')}/flights/${encodeURIComponent(ident)}?${params}`

  try {
    const res = await fetch(url, {
      // The proxy injects x-apikey for the FlightAware AeroAPI host;
      // browser only ever sees the proxy URL.
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    const flight = (json?.flights || [])[0]
    const data = normalize(flight)
    cache.set(key, { data, fetchedAt: Date.now() })
    return data
  } catch (err) {
    console.warn('flight status fetch failed', flightNumber, err)
    return null
  }
}

// Map FlightAware AeroAPI v4 response shape to our internal one.
// https://flightaware.com/aeroapi/portal/documentation#get-/flights/-ident-
function normalize(f) {
  if (!f) return null
  // FA status string examples: "Scheduled", "En Route / On Time",
  // "Arrived / Gate Arrival", "Cancelled", "Delayed", "Diverted"
  const raw = (f.status || '').toLowerCase()
  let status = 'scheduled'
  if (f.actual_in || /arrived|gate arrival|landed/i.test(f.status || '')) status = 'landed'
  else if (/cancel/i.test(raw)) status = 'cancelled'
  else if (f.cancelled) status = 'cancelled'
  else if (/divert/i.test(raw)) status = 'diverted'
  else if (/en route|in air|airborne/i.test(raw)) status = 'active'
  else if ((f.arrival_delay || 0) >= 15 * 60 || /delay/i.test(raw)) status = 'delayed'
  return {
    status,
    scheduledArrival: f.scheduled_in || null,
    estimatedArrival: f.estimated_in || null,
    actualArrival: f.actual_in || null,
    origin: {
      airport: f.origin?.code_iata || f.origin?.code_icao || null,
      terminal: f.terminal_origin || null,
      gate: f.gate_origin || null,
    },
    destination: {
      airport: f.destination?.code_iata || f.destination?.code_icao || null,
      terminal: f.terminal_destination || null,
      gate: f.gate_destination || null,
      baggage: f.baggage_claim || null,
    },
    delayMinutes: Math.round((f.arrival_delay || 0) / 60),
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
