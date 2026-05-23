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

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, unlinkSync } from 'node:fs'
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
// 8s per call — Places search calls occasionally exceed 6s in practice
// (the previous Eastern Point Beach run aborted at 6s). Photo media
// fetches share the same budget; signed lh3.googleusercontent.com URLs
// usually return in well under a second.
const TIMEOUT_MS = 8000
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
// Two-phase flow per activity:
//   1. fetchPlacesMetadata: POST /v1/places:searchText with locationBias
//      around activity lat/lng. Field mask requests photos +
//      businessStatus + regularOpeningHours so we can act on closures
//      and persist structured hours.
//   2. fetchPlacesPhoto: GET /v1/{photo.name}/media?skipHttpRedirect=true
//      returns JSON with a signed photoUri pointing at
//      lh3.googleusercontent.com. Fetching that URL gets the bytes
//      without a redirect chain that could leak the API key onward.

function extractHoursStructured(place) {
  const oh = place?.regularOpeningHours
  if (!oh) return null
  return {
    weekday: oh.weekdayDescriptions || [],
    periods: oh.periods || [],
  }
}

function metadataFromPlace(place) {
  return {
    place,
    placeName: place.displayName?.text || null,
    businessStatus: place.businessStatus || null,
    hoursStructured: extractHoursStructured(place),
    openNow: place.regularOpeningHours?.openNow ?? null,
  }
}

// Direct-by-id resolver. Bypasses text search so the seed author can
// pin a venue exactly — useful for districts/collectives where the
// address-driven search lands on the wrong point (e.g. "The Shops at
// Mohegan Sun" resolving to a single store rather than the resort).
async function fetchPlaceDetails(placeId) {
  if (!PLACES_KEY) return { skip: 'no API key' }
  let place
  try {
    place = await fetchJson(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
      {
        headers: {
          'x-goog-api-key': PLACES_KEY,
          'x-goog-fieldmask':
            'id,displayName,photos,businessStatus,regularOpeningHours',
        },
      }
    )
  } catch (e) {
    return { skip: `place details: ${e.message}` }
  }
  return metadataFromPlace(place)
}

async function fetchPlacesMetadata(activity) {
  if (!PLACES_KEY) return { skip: 'no API key' }

  // Short-circuit: a seed-supplied Place ID skips text search and goes
  // straight to Place Details. Authoritative by definition — the seed
  // author is asserting this is the right venue.
  if (activity.placeIdOverride) {
    return fetchPlaceDetails(activity.placeIdOverride)
  }

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
        'x-goog-fieldmask':
          'places.id,places.displayName,places.photos,places.businessStatus,places.regularOpeningHours',
      },
      body: JSON.stringify(body),
    })
  } catch (e) {
    return { skip: `places search: ${e.message}` }
  }

  const places = searchRes.places || []
  if (places.length === 0) return { skip: 'no places result' }
  return metadataFromPlace(places[0])
}

async function fetchPlacesPhoto(place) {
  const photos = place.photos || []
  if (photos.length === 0) return { skip: 'place has no photos' }

  const photo = photos[0]
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
  if (!photoUri) return { skip: 'places media: no photoUri in response' }

  let bytes
  try {
    bytes = await fetchBytes(photoUri)
  } catch (e) {
    return { skip: `photo fetch: ${e.message}` }
  }

  return { ok: { bytes, imageUrl: photoUri, source: 'places', credit } }
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
async function processActivity(activity, mutationsForFile, closures) {
  const id = activity.id
  if (activity.heroImage && !force) return { skip: 'already has heroImage' }

  // Phase 1: Places metadata. We hit Places even when og could resolve
  // the photo, because we want businessStatus (closure detection) and
  // regularOpeningHours (structured hours for the card).
  const meta = await fetchPlacesMetadata(activity)
  // `noAutoHours` lets the seed opt out of writing hoursStructured (used
  // when text search resolves to the wrong venue and the resulting 24/7
  // hours would mislead the user). businessStatus + image fetch still run.
  const hoursStructured = meta.skip || activity.noAutoHours
    ? null
    : meta.hoursStructured

  // Closure detection — caller will remove the activity entirely.
  if (
    !meta.skip &&
    meta.businessStatus &&
    meta.businessStatus !== 'OPERATIONAL'
  ) {
    closures.set(id, {
      businessStatus: meta.businessStatus,
      placeName: meta.placeName,
    })
    return { closed: meta.businessStatus, placeName: meta.placeName }
  }

  // Phase 1.5: opt-out. Activities flagged `noAutoHero` keep their
  // photo state untouched (typically because the only Places photos
  // are marketing banners with text overlays). We still want
  // hoursStructured + closure detection on these, so the metadata
  // pass above ran — only the image fetch is skipped.
  if (activity.noAutoHero) {
    if (hoursStructured) {
      mutationsForFile.set(id, {
        heroImage: null,
        heroImageSource: null,
        heroImageCredit: null,
        hoursStructured,
      })
      return {
        partial: 'noAutoHero — hours only',
        hoursStructured,
        placeName: meta.placeName,
      }
    }
    return { skip: 'noAutoHero (no hours from Places)' }
  }

  // Phase 2: image. Try Places photo first, then og fallback.
  let bytes, imageUrl, source, credit
  let placeFailReason = null
  let ogFailReason = null

  if (!meta.skip) {
    const ph = await fetchPlacesPhoto(meta.place)
    if (ph.ok) {
      ({ bytes, imageUrl, source, credit } = ph.ok)
    } else {
      placeFailReason = ph.skip
    }
  } else {
    placeFailReason = meta.skip
  }

  if (!bytes) {
    const og = await tryOgImage(activity)
    if (og.ok) {
      ({ bytes, imageUrl, source, credit } = og.ok)
    } else {
      ogFailReason = og.skip
    }
  }

  // No image found. Still persist hoursStructured if Places gave us any.
  if (!bytes) {
    if (hoursStructured) {
      mutationsForFile.set(id, {
        heroImage: null,
        heroImageSource: null,
        heroImageCredit: null,
        hoursStructured,
      })
      return {
        partial: `no image (places: ${placeFailReason} | og: ${ogFailReason})`,
        hoursStructured,
        placeName: meta.placeName,
      }
    }
    return { error: `places: ${placeFailReason} | og: ${ogFailReason}` }
  }

  // sharp → webp (max 1200w, never upscale). Width gate catches the
  // occasional logo that sneaks past upstream filters.
  let webp
  try {
    const input = sharp(bytes)
    const m = await input.metadata()
    if ((m.width || 0) < 600) {
      return { error: `${source} source too small (${m.width}px wide)` }
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
    hoursStructured,
  })
  return {
    ok: {
      imageUrl,
      bytes: webp.length,
      heroPath,
      source,
      credit,
      placeName: meta.placeName,
      hoursStructured,
      openNow: meta.openNow,
    },
  }
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

// JSON-aware brace matcher: given the position of an opening `{`,
// return the position of the matching `}`. Tracks string state so
// braces inside strings don't count.
function findMatchingCloseBrace(text, openBraceIdx) {
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = openBraceIdx; i < text.length; i++) {
    const c = text[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (c === '\\') {
      escaped = true
      continue
    }
    if (c === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

// Resolve the absolute range of the activity object that contains
// `"id": "<id>"`. Returns null if the id can't be found or its
// surrounding braces don't balance.
function findActivityObjectRange(raw, id) {
  const idAnchor = raw.indexOf(`"id": ${JSON.stringify(id)}`)
  if (idAnchor === -1) return null
  const objOpen = raw.lastIndexOf('{', idAnchor)
  if (objOpen === -1) return null
  const objClose = findMatchingCloseBrace(raw, objOpen)
  if (objClose === -1) return null
  return { objOpen, objClose }
}

// Insert or replace the activity's `hoursStructured` field, placed
// immediately before its `heroImage` line. Compact single-line JSON
// keeps the diff manageable — this field is machine data, not
// human-curated text.
//
// All lookups are scoped to the *current activity's* object via
// findActivityObjectRange. An earlier version searched from the id
// anchor through end-of-file, which caused a cascading bug: when this
// activity had no hoursStructured but a later activity did, the
// indexOf landed on the later one and mutated the wrong block.
function applyHoursStructured(raw, id, value) {
  const range = findActivityObjectRange(raw, id)
  if (!range) return { raw, applied: false, reason: 'activity object not found' }
  const { objOpen, objClose } = range
  const objText = raw.slice(objOpen, objClose + 1)

  // Existing field? Find its key, then bracket-match the value object —
  // all within objText so we never reach across an activity boundary.
  const existingKeyIdx = objText.indexOf('"hoursStructured":')
  if (existingKeyIdx !== -1) {
    let openIdx = existingKeyIdx + '"hoursStructured":'.length
    while (openIdx < objText.length && objText[openIdx] !== '{') openIdx++
    if (objText[openIdx] !== '{') {
      return { raw, applied: false, reason: 'hoursStructured value brace not found' }
    }
    const closeIdx = findMatchingCloseBrace(objText, openIdx)
    if (closeIdx === -1) {
      return { raw, applied: false, reason: 'hoursStructured close brace not found' }
    }
    if (value == null) {
      const lineStart = objText.lastIndexOf('\n', existingKeyIdx) + 1
      let lineEnd = closeIdx + 1
      if (objText[lineEnd] === ',') lineEnd++
      if (objText[lineEnd] === '\n') lineEnd++
      const absStart = objOpen + lineStart
      const absEnd = objOpen + lineEnd
      return { raw: raw.slice(0, absStart) + raw.slice(absEnd), applied: true }
    }
    const absOpen = objOpen + openIdx
    const absClose = objOpen + closeIdx + 1
    const literal = JSON.stringify(value)
    if (raw.slice(absOpen, absClose) === literal) {
      return { raw, applied: false, reason: 'no change' }
    }
    return {
      raw: raw.slice(0, absOpen) + literal + raw.slice(absClose),
      applied: true,
    }
  }

  // Insert: place the field on its own line directly before `heroImage`.
  if (value == null) return { raw, applied: false, reason: 'nothing to insert' }
  const heroIdx = objText.indexOf('"heroImage":')
  if (heroIdx === -1) {
    return { raw, applied: false, reason: 'heroImage anchor not found for insert' }
  }
  const lineStart = objText.lastIndexOf('\n', heroIdx) + 1
  const indent = objText.slice(lineStart, heroIdx)
  const newLine = `${indent}"hoursStructured": ${JSON.stringify(value)},\n`
  const insertAt = objOpen + lineStart
  return { raw: raw.slice(0, insertAt) + newLine + raw.slice(insertAt), applied: true }
}

// Remove an entire activity object from the JSON array, including its
// trailing comma + newline. Uses brace matching so nested object
// braces (descriptions, hoursStructured) don't confuse the scan.
function removeActivityBlock(raw, id) {
  const idAnchor = raw.indexOf(`"id": ${JSON.stringify(id)}`)
  if (idAnchor === -1) return { raw, applied: false, reason: 'id not found' }

  // Find the opening `{` for this activity object (the nearest `{`
  // before the id anchor).
  const openBrace = raw.lastIndexOf('{', idAnchor)
  if (openBrace === -1) return { raw, applied: false, reason: 'open brace not found' }

  // Find the matching `}` for this activity.
  const closeBrace = findMatchingCloseBrace(raw, openBrace)
  if (closeBrace === -1) {
    return { raw, applied: false, reason: 'close brace not found' }
  }

  // Trim leading indent of the activity line + trailing comma/newline
  // so we don't leave orphan whitespace or a double comma. Two cases:
  //   - normal (not last in array): trailing comma + newline come after
  //     the block; consume those.
  //   - last in array: no trailing comma; we'd leave a dangling comma
  //     on the *previous* activity, so walk backward and strip that one
  //     instead.
  let start = raw.lastIndexOf('\n', openBrace) + 1
  let end = closeBrace + 1
  if (raw[end] === ',') {
    end++
    if (raw[end] === '\n') end++
  } else {
    let back = start - 1
    while (back >= 0 && (raw[back] === '\n' || raw[back] === ' ' || raw[back] === '\t')) {
      back--
    }
    if (raw[back] === ',') start = back
  }

  return { raw: raw.slice(0, start) + raw.slice(end), applied: true }
}

function applyHeroBlock(raw, id, fields) {
  const range = findActivityObjectRange(raw, id)
  if (!range) return { raw, applied: false, reason: 'activity object not found' }
  const { objOpen, objClose } = range
  const objText = raw.slice(objOpen, objClose + 1)
  const m = objText.match(HERO_BLOCK_RE)
  if (!m) return { raw, applied: false, reason: 'hero block not found' }

  const blockStart = objOpen + m.index
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

  const mutations = new Map() // id → { heroImage, heroImageSource, heroImageCredit, hoursStructured }
  const closures = new Map() // id → { businessStatus, placeName }

  for (const a of activities) {
    if (onlyTripId && a.tripId !== onlyTripId) continue
    const result = await processActivity(a, mutations, closures)
    if (result.skip) {
      console.log(`  - ${a.id}: skip (${result.skip})`)
    } else if (result.closed) {
      const place = result.placeName ? ` [${result.placeName}]` : ''
      console.warn(
        `  ✕ ${a.id}: business not operational — status="${result.closed}"${place}; will remove from seed`
      )
    } else if (result.error) {
      console.log(`  ! ${a.id}: ${result.error}`)
    } else if (result.partial) {
      const place = result.placeName ? ` [${result.placeName}]` : ''
      console.log(`  ~ ${a.id} (hours only): ${result.partial}${place}`)
    } else if (result.ok) {
      const place = result.ok.placeName ? ` [${result.ok.placeName}]` : ''
      const cred = result.ok.credit ? `  credit: ${result.ok.credit}` : ''
      const hrs = result.ok.hoursStructured ? ' [hours ✓]' : ''
      const live =
        result.ok.openNow === true
          ? ' [open now]'
          : result.ok.openNow === false
            ? ' [closed now]'
            : ''
      console.log(
        `  ✓ ${a.id} (${result.ok.source}): ${result.ok.bytes} bytes${place}${hrs}${live}${cred}`
      )
    }
  }

  if (mutations.size === 0 && closures.size === 0) {
    console.log(`  (no JSON changes for ${filePath})`)
    return
  }

  // Apply mutations first (hero block + hoursStructured), then removals.
  // Doing removals last means in-flight mutations don't have to track
  // which activities just vanished.
  let nextRaw = raw0
  let heroApplied = 0
  let hoursApplied = 0
  for (const [id, fields] of mutations) {
    const r1 = applyHeroBlock(nextRaw, id, fields)
    if (r1.applied) {
      nextRaw = r1.raw
      heroApplied += 1
    } else if (r1.reason !== 'no change') {
      console.warn(`  ! ${id} hero: ${r1.reason}`)
    }
    const r2 = applyHoursStructured(nextRaw, id, fields.hoursStructured)
    if (r2.applied) {
      nextRaw = r2.raw
      hoursApplied += 1
    } else if (r2.reason !== 'no change' && r2.reason !== 'nothing to insert') {
      console.warn(`  ! ${id} hours: ${r2.reason}`)
    }
  }

  let removed = 0
  for (const [id, info] of closures) {
    const r = removeActivityBlock(nextRaw, id)
    if (r.applied) {
      nextRaw = r.raw
      removed += 1
      // Delete the webp on disk so it doesn't ship with the build.
      const webpPath = join(OUT_DIR, `${id}.webp`)
      if (!dryRun && existsSync(webpPath)) {
        try {
          unlinkSync(webpPath)
        } catch (e) {
          console.warn(`  ! ${id}: could not delete ${webpPath}: ${e.message}`)
        }
      }
    } else {
      console.warn(`  ! ${id} remove: ${r.reason}`)
    }
  }

  if (!dryRun) {
    writeFileSync(filePath, nextRaw)
    console.log(
      `  wrote ${heroApplied} hero updates, ${hoursApplied} hours updates, ${removed} removals to ${filePath}`
    )
  } else {
    console.log(
      `  [dry-run] would apply ${heroApplied} hero, ${hoursApplied} hours, ${removed} removals to ${filePath}`
    )
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
export {
  applyHeroBlock,
  applyHoursStructured,
  findMatchingCloseBrace,
  loadDotenv,
  removeActivityBlock,
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (invokedDirectly) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
