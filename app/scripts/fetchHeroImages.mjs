#!/usr/bin/env node
// Hero image fetcher for side activities (Side Activities v1.5+).
//
// Walks every seed JSON under app/src/data/sideActivities/. Source chain
// per activity:
//   1. Google Places API (New) — Text Search → first photo + author
//      attribution. Requires GOOGLE_PLACES_API_KEY in app/.env (managed
//      by `npm run set-secret GOOGLE_PLACES_API_KEY`).
//   2. og:image / twitter:image from activity.officialUrl (if set).
//   3. Skip — activity renders the TypographicHeader fallback.
//
// On success:
//   - sharp resize to max 1200px wide, encode as WebP (quality 80)
//   - write app/public/activities/{id}.webp
//   - surgical string-replace the seed JSON to set:
//       "heroImage":       "./activities/{id}.webp"
//       "heroImageSource": "places" | "og"
//       "heroImageCredit": <authorAttribution displayName | null>
//
// Failures are non-fatal per-activity: log + continue.
//
// Usage (from inside app/):
//   npm run fetch-heroes -- --tripId=volleyball-2026 --force
// Or directly (from repo root):
//   node app/scripts/fetchHeroImages.mjs --tripId=X --force --dry-run

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { extractOgImage } from '../src/lib/ogImage.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APP_ROOT = resolve(__dirname, '..')
const SEED_DIR = join(APP_ROOT, 'src', 'data', 'sideActivities')
const OUT_DIR = join(APP_ROOT, 'public', 'activities')
const ENV_PATH = join(APP_ROOT, '.env')

// --- args -----------------------------------------------------------
const args = process.argv.slice(2)
const onlyTripId = (args.find((a) => a.startsWith('--tripId=')) || '').split('=')[1] || null
const force = args.includes('--force')
const dryRun = args.includes('--dry-run')

// --- secrets (minimal .env loader, no dotenv dep) ------------------
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

if (!PLACES_KEY) {
  console.warn(
    'GOOGLE_PLACES_API_KEY not set. Run: npm run set-secret GOOGLE_PLACES_API_KEY'
  )
  console.warn('Falling through to og:image source only.\n')
}

// --- fetch helpers --------------------------------------------------
const TIMEOUT_MS = 6000
const UA =
  'Mozilla/5.0 (compatible; RoadtripHeroFetch/1.0; +https://jonathantheblip.github.io/roadtrip/)'

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

async function fetchHtml(url) {
  const res = await fetchWithTimeout(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

async function fetchBytes(url, opts = {}) {
  const res = await fetchWithTimeout(url, opts)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
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
    } catch (_) {}
    throw new Error(`HTTP ${res.status}${detail ? `: ${detail}` : ''}`)
  }
  return res.json()
}

// --- og:image filters ----------------------------------------------
// URL/filename substrings that disqualify an og:image as a hero (some
// sites set og:image to their brand mark; the TypographicHeader
// fallback looks better than a stretched logo).
const OG_URL_REJECT = /logo|favicon|icon-\d|apple-touch/i

// --- source: Google Places (primary) -------------------------------
//
// Places API (New) docs:
//   https://developers.google.com/maps/documentation/places/web-service/text-search
//   https://developers.google.com/maps/documentation/places/web-service/place-photos
//
// Two-step flow:
//   1. POST /v1/places:searchText with locationBias around activity
//      lat/lng so a generic query ("Ocean Beach Park") doesn't return
//      the San Francisco one. Field mask requests only the photo
//      metadata we need.
//   2. GET  /v1/{photo.name}/media?skipHttpRedirect=true returns JSON
//      with a signed photoUri pointing at lh3.googleusercontent.com.
//      Fetching that URL gets the bytes without a redirect chain that
//      could leak the API key onward.

async function tryPlacesImage(activity) {
  if (!PLACES_KEY) return { skip: 'no API key' }

  // 1. Text Search
  const textQuery = [activity.name, activity.address].filter(Boolean).join(', ')
  const body = { textQuery, maxResultCount: 1 }
  if (activity.lat != null && activity.lng != null) {
    body.locationBias = {
      circle: {
        center: { latitude: activity.lat, longitude: activity.lng },
        radius: 1000.0, // 1km — tight enough to disambiguate
      },
    }
  }

  let searchRes
  try {
    searchRes = await fetchJson('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': PLACES_KEY,
        'x-goog-fieldmask': 'places.id,places.displayName,places.photos',
      },
      body: JSON.stringify(body),
    })
  } catch (e) {
    return { skip: `places search: ${e.message}` }
  }

  const places = searchRes.places || []
  if (places.length === 0) return { skip: 'no places result' }
  const place = places[0]
  const photos = place.photos || []
  if (photos.length === 0) return { skip: 'place has no photos' }

  const photo = photos[0]
  const credit = photo.authorAttributions?.[0]?.displayName || null

  // 2. Resolve photo media URL
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
  if (!photoUri) return { skip: 'places media: no photoUri in response' }

  // 3. Fetch the actual bytes from the signed URL (no auth header
  // needed here — the signed URL embeds its own auth).
  let bytes
  try {
    bytes = await fetchBytes(photoUri)
  } catch (e) {
    return { skip: `photo fetch: ${e.message}` }
  }

  return {
    ok: {
      bytes,
      imageUrl: photoUri,
      source: 'places',
      credit,
      placeName: place.displayName?.text || null,
    },
  }
}

// --- source: og:image (fallback) -----------------------------------
async function tryOgImage(activity) {
  if (!activity.officialUrl) return { skip: 'no officialUrl' }

  let html
  try {
    html = await fetchHtml(activity.officialUrl)
  } catch (e) {
    return { skip: `fetch page: ${e.message}` }
  }

  const imageUrl = extractOgImage(html, activity.officialUrl)
  if (!imageUrl) return { skip: 'no og:image / twitter:image found' }
  if (OG_URL_REJECT.test(imageUrl)) {
    return { skip: `URL looks like logo/icon: ${imageUrl}` }
  }

  let bytes
  try {
    bytes = await fetchBytes(imageUrl)
  } catch (e) {
    return { skip: `fetch image: ${e.message}` }
  }
  return { ok: { bytes, imageUrl, source: 'og', credit: null } }
}

// --- per-activity pipeline -----------------------------------------
async function processActivity(activity, mutationsForFile) {
  const id = activity.id
  if (activity.heroImage && !force) return { skip: 'already has heroImage' }

  // Source chain: Places primary, og fallback.
  const places = await tryPlacesImage(activity)
  let bytes, imageUrl, source, credit, placeName
  if (places.ok) {
    ({ bytes, imageUrl, source, credit, placeName } = places.ok)
  } else {
    const og = await tryOgImage(activity)
    if (og.ok) {
      ({ bytes, imageUrl, source, credit } = og.ok)
    } else {
      return { error: `places: ${places.skip} | og: ${og.skip}` }
    }
  }

  // sharp → webp (max 1200w, never upscale). Width gate catches the
  // occasional logo that sneaks past upstream filters.
  let webp
  try {
    const input = sharp(bytes)
    const meta = await input.metadata()
    if ((meta.width || 0) < 600) {
      return { error: `${source} source too small (${meta.width}px wide)` }
    }
    webp = await input
      .resize({ width: 1200, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer()
  } catch (e) {
    return { error: `sharp: ${e.message}` }
  }

  const outPath = join(OUT_DIR, `${id}.webp`)
  if (!dryRun) {
    if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
    writeFileSync(outPath, webp)
  }

  const heroPath = `./activities/${id}.webp`
  mutationsForFile.set(id, {
    heroImage: heroPath,
    heroImageSource: source,
    heroImageCredit: credit,
  })
  return { ok: { imageUrl, bytes: webp.length, heroPath, source, credit, placeName } }
}

// --- file mutation -------------------------------------------------
// Replace the trailing hero-fields block of an activity. The block
// is "heroImage": ... possibly followed by ", \n<indent>heroImageSource":
// ..., \n<indent>heroImageCredit": ...". Match the whole thing and
// substitute the new 3 lines.
const HERO_BLOCK_RE = new RegExp(
  '"heroImage":\\s*(?:null|"[^"]*")' +
    '(?:,\\s*\\n\\s*"heroImageSource":\\s*(?:null|"[^"]*"))?' +
    '(?:,\\s*\\n\\s*"heroImageCredit":\\s*(?:null|"[^"]*"))?'
)

function formatVal(v) {
  return v == null ? 'null' : JSON.stringify(v)
}

function applyHeroBlock(raw, id, fields) {
  const idAnchor = raw.indexOf(`"id": ${JSON.stringify(id)}`)
  if (idAnchor === -1) return { raw, applied: false, reason: 'id not found' }
  const slice = raw.slice(idAnchor)
  const m = slice.match(HERO_BLOCK_RE)
  if (!m) return { raw, applied: false, reason: 'hero block not found' }

  const blockStart = idAnchor + m.index
  const blockEnd = blockStart + m[0].length

  // Indent of the heroImage line — look back to the preceding newline.
  const lineStart = raw.lastIndexOf('\n', blockStart) + 1
  const indent = raw.slice(lineStart, blockStart)

  // Build the new block. Always emit all 3 fields when heroImage is
  // non-null (or when the prior block had Source/Credit). Otherwise
  // emit only heroImage to keep the diff minimal for skipped activities.
  const hadExtraFields = /"heroImageSource"/.test(m[0])
  const wantExtra = fields.heroImage != null || hadExtraFields

  const lines = [`"heroImage": ${formatVal(fields.heroImage)}`]
  if (wantExtra) {
    lines.push(`"heroImageSource": ${formatVal(fields.heroImageSource)}`)
    lines.push(`"heroImageCredit": ${formatVal(fields.heroImageCredit)}`)
  }
  const newBlock = lines.join(`,\n${indent}`)

  if (newBlock === m[0]) return { raw, applied: false, reason: 'no change' }

  const next = raw.slice(0, blockStart) + newBlock + raw.slice(blockEnd)
  return { raw: next, applied: true }
}

async function processFile(filePath) {
  const raw0 = readFileSync(filePath, 'utf8')
  const activities = JSON.parse(raw0)
  if (!Array.isArray(activities)) {
    console.warn(`  skip: ${filePath} not an array`)
    return
  }

  const mutations = new Map()

  for (const a of activities) {
    if (onlyTripId && a.tripId !== onlyTripId) continue
    const result = await processActivity(a, mutations)
    if (result.skip) {
      console.log(`  - ${a.id}: skip (${result.skip})`)
    } else if (result.error) {
      console.log(`  ! ${a.id}: ${result.error}`)
    } else if (result.ok) {
      const place = result.ok.placeName ? ` [${result.ok.placeName}]` : ''
      const cred = result.ok.credit ? `  credit: ${result.ok.credit}` : ''
      console.log(
        `  ✓ ${a.id} (${result.ok.source}): ${result.ok.bytes} bytes${place}${cred}`
      )
    }
  }

  if (mutations.size === 0) {
    console.log(`  (no JSON changes for ${filePath})`)
    return
  }

  let nextRaw = raw0
  let appliedCount = 0
  for (const [id, fields] of mutations) {
    const r = applyHeroBlock(nextRaw, id, fields)
    if (!r.applied) {
      console.warn(`  ! ${id}: ${r.reason}`)
      continue
    }
    nextRaw = r.raw
    appliedCount += 1
  }

  if (!dryRun) {
    writeFileSync(filePath, nextRaw)
    console.log(`  wrote ${appliedCount} heroImage updates to ${filePath}`)
  } else {
    console.log(`  [dry-run] would write ${appliedCount} updates to ${filePath}`)
  }
}

async function main() {
  const files = readdirSync(SEED_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => join(SEED_DIR, f))

  for (const file of files) {
    console.log(`\n${file}`)
    await processFile(file)
  }
}

// Export hooks for unit testing.
export { applyHeroBlock, loadDotenv }

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (invokedDirectly) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
