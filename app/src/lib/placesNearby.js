// Client wrapper for the Worker's /places/nearby endpoint.
//
// The Worker proxies Google Places (New) searchText so the API key
// stays out of the bundle. Each tap is a fresh query — distances drift
// once you're moving and Helen will tap "Bathroom" while in motion, so
// we don't cache the result.

import { workerFetch } from './workerSync'

/**
 * Look up nearby places matching a text query.
 * @param {object} params
 * @param {string} params.query        — free-text query, e.g. "public restroom"
 * @param {{lat:number, lng:number}} params.location  — search center
 * @param {number} [params.radius=1500] — meters; clamped server-side to [100, 50000]
 * @param {number} [params.limit=5]    — max results; clamped server-side to [1, 10]
 * @returns {Promise<{
 *   results: Array<{
 *     placeId: string|null,
 *     name: string,
 *     address: string|null,
 *     lat: number,
 *     lng: number,
 *     distanceMeters: number,
 *     openNow: boolean|null,
 *     businessStatus: string|null,
 *     phone: string|null,
 *   }>,
 *   radiusMeters: number,
 * }>}
 */
export async function searchNearby({ query, location, radius, limit }) {
  if (!query || typeof query !== 'string') {
    throw new Error('query is required')
  }
  if (
    !location ||
    !Number.isFinite(location.lat) ||
    !Number.isFinite(location.lng)
  ) {
    throw new Error('location {lat,lng} is required')
  }
  const body = {
    query,
    location: { lat: location.lat, lng: location.lng },
  }
  if (Number.isFinite(radius)) body.radius = radius
  if (Number.isFinite(limit)) body.limit = limit

  const res = await workerFetch('/places/nearby', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return res.json()
}

// Format a distance in meters as a short human label. Walks the
// metric → imperial line the family uses — under 0.1 mi shows feet so
// "two blocks away" reads right.
export function formatDistance(meters) {
  if (!Number.isFinite(meters)) return ''
  const feet = meters * 3.28084
  const miles = meters / 1609.344
  if (feet < 528) return `${Math.round(feet / 10) * 10} ft`
  if (miles < 10) return `${miles.toFixed(1)} mi`
  return `${Math.round(miles)} mi`
}
