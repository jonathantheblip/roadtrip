// fetchTripHeroes — bake committed hero images for SEED trips that lack
// an explicit hero. CARRYOVER_TRIP_HERO_PLAN.md §3 (belt-and-suspenders
// cold-start visuals before the first worker pull).
//
// WHY A SEPARATE SCRIPT (not fetchHeroImages.mjs): that script targets
// sideActivities/*.json and string-rewrites the JSON in place. trips.js
// is a JS *module* (`export const JACKSON_TRIP = {…}`), not JSON — the
// JSON rewriter can't touch it. Per the plan's recommended option (a),
// this script FETCHES + writes the WebP, and the `heroImage:` field is
// hand-set in trips.js (a one-time two-line edit, printed below on
// success). It deliberately does NOT mutate trips.js.
//
// Source chain per trip:
//   destination text (locationLabel || endCity)
//     → Places (New) searchText { fieldmask: places.photos }
//     → Place Photo media (maxWidthPx=1200&skipHttpRedirect=true → photoUri)
//     → sharp resize ≤1200w, WebP q80
//     → app/public/images/<tripId>.webp
//
// SKIPS any trip where hasExplicitHero(trip) is true (volleyball) — the
// SAME §0 guard the client + worker use, so a trip Jonathan already set
// is never re-fetched here either.
//
// Requires GOOGLE_PLACES_API_KEY in app/.env (gitignored). Usage:
//   node scripts/fetchTripHeroes.mjs            # bake missing seed heroes
//   node scripts/fetchTripHeroes.mjs --force    # re-bake even if file exists
//   node scripts/fetchTripHeroes.mjs --dry-run  # report, fetch nothing
//   node scripts/fetchTripHeroes.mjs --tripId=jackson-2026

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { TRIPS } from '../src/data/trips.js'
import { hasExplicitHero } from '../src/lib/tripHero.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APP_ROOT = resolve(__dirname, '..')
const OUT_DIR = join(APP_ROOT, 'public', 'images')
const ENV_PATH = join(APP_ROOT, '.env')

const args = process.argv.slice(2)
const onlyTripId = (args.find((a) => a.startsWith('--tripId=')) || '').split('=')[1] || null
const force = args.includes('--force')
const dryRun = args.includes('--dry-run')

// --- secrets (minimal .env loader, no dotenv dep) — same shape as
//     fetchHeroImages.mjs so the two stay in lockstep.
function loadDotenv(path) {
  const out = {}
  if (!existsSync(path)) return out
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!m) continue
    let val = m[2]
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    out[m[1]] = val
  }
  return out
}

const env = loadDotenv(ENV_PATH)
const PLACES_KEY = env.GOOGLE_PLACES_API_KEY || ''

const TIMEOUT_MS = 8000
const UA = 'Mozilla/5.0 (compatible; RoadtripTripHeroFetch/1.0)'

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'user-agent': UA, ...(opts.headers || {}) },
    })
  } finally {
    clearTimeout(t)
  }
}

async function fetchJson(url, opts = {}) {
  const res = await fetchWithTimeout(url, {
    ...opts,
    headers: { accept: 'application/json', ...(opts.headers || {}) },
  })
  if (!res.ok) {
    let detail = ''
    try {
      detail = (await res.text()).slice(0, 200)
    } catch {}
    throw new Error(`HTTP ${res.status}${detail ? ` — ${detail}` : ''}`)
  }
  return res.json()
}

async function fetchBytes(url, opts = {}) {
  const res = await fetchWithTimeout(url, opts)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

// destination text for the trip — the SAME field the worker resolver
// keys off (§2): locationLabel preferred, else endCity.
function destinationQuery(trip) {
  const q = (trip.locationLabel || trip.endCity || '').trim()
  return q
}

async function fetchPlacesPhotoBytes(query) {
  if (!PLACES_KEY) return { skip: 'no GOOGLE_PLACES_API_KEY in app/.env' }

  let searchRes
  try {
    searchRes = await fetchJson('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': PLACES_KEY,
        'x-goog-fieldmask': 'places.id,places.displayName,places.photos',
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
    })
  } catch (e) {
    return { skip: `places search: ${e.message}` }
  }

  const place = (searchRes.places || [])[0]
  if (!place) return { skip: 'no places result' }
  const photo = (place.photos || [])[0]
  if (!photo) return { skip: 'place has no photos' }
  const credit = photo.authorAttributions?.[0]?.displayName || null

  let mediaInfo
  try {
    mediaInfo = await fetchJson(
      `https://places.googleapis.com/v1/${photo.name}/media?maxWidthPx=1200&skipHttpRedirect=true`,
      { headers: { 'x-goog-api-key': PLACES_KEY } }
    )
  } catch (e) {
    return { skip: `places media lookup: ${e.message}` }
  }
  const photoUri = mediaInfo.photoUri
  if (!photoUri) return { skip: 'places media: no photoUri' }

  let bytes
  try {
    bytes = await fetchBytes(photoUri)
  } catch (e) {
    return { skip: `photo fetch: ${e.message}` }
  }
  return { ok: { bytes, source: 'places', credit, displayName: place.displayName?.text || null } }
}

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

  const targets = TRIPS.filter((t) => (onlyTripId ? t.id === onlyTripId : true))

  console.log(`fetchTripHeroes — ${targets.length} seed trip(s) considered`)
  if (!PLACES_KEY) {
    console.warn('⚠ GOOGLE_PLACES_API_KEY not set in app/.env — nothing can be baked.')
  }

  const results = []
  for (const trip of targets) {
    // §0 guard — a trip Jonathan already set is skipped entirely.
    if (hasExplicitHero(trip)) {
      console.log(`  ${trip.id}: skip (has explicit hero: ${trip.heroImage})`)
      results.push({ id: trip.id, status: 'skip-has-hero' })
      continue
    }

    const outPath = join(OUT_DIR, `${trip.id}.webp`)
    if (existsSync(outPath) && !force) {
      console.log(`  ${trip.id}: skip (file exists; --force to re-bake) → ${outPath}`)
      results.push({ id: trip.id, status: 'skip-exists' })
      continue
    }

    const query = destinationQuery(trip)
    if (!query) {
      console.log(`  ${trip.id}: skip (no destination text — locationLabel/endCity empty)`)
      results.push({ id: trip.id, status: 'skip-no-destination' })
      continue
    }

    if (dryRun) {
      console.log(`  ${trip.id}: would query Places for "${query}" → ${outPath}`)
      results.push({ id: trip.id, status: 'dry-run', query })
      continue
    }

    console.log(`  ${trip.id}: Places "${query}" …`)
    const res = await fetchPlacesPhotoBytes(query)
    if (res.skip) {
      console.warn(`  ${trip.id}: ✗ ${res.skip}`)
      results.push({ id: trip.id, status: 'fail', reason: res.skip })
      continue
    }

    let webp
    try {
      webp = await sharp(res.ok.bytes)
        .rotate()
        .resize({ width: 1200, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer()
    } catch (e) {
      console.warn(`  ${trip.id}: ✗ sharp: ${e.message}`)
      results.push({ id: trip.id, status: 'fail', reason: `sharp: ${e.message}` })
      continue
    }

    writeFileSync(outPath, webp)
    const heroPath = `./images/${trip.id}.webp`
    console.log(
      `  ${trip.id}: ✓ wrote ${outPath} (${(webp.length / 1024).toFixed(1)} KB) ` +
        `from "${res.ok.displayName || query}"${res.ok.credit ? ` · © ${res.ok.credit}` : ''}`
    )
    console.log(`      → set in trips.js:  heroImage: '${heroPath}',`)
    results.push({ id: trip.id, status: 'ok', heroPath, credit: res.ok.credit })
  }

  console.log('\nsummary:')
  for (const r of results) console.log(`  ${r.id}: ${r.status}${r.reason ? ` (${r.reason})` : ''}`)
  const failed = results.filter((r) => r.status === 'fail')
  if (failed.length) process.exitCode = 1
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
