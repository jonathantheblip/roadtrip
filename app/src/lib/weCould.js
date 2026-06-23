// "We could…" — the nearby-suggestions engine for the stay home's tray.
//
// FAMILY_TRIPS_VISION §2/§3: most family trips are a STAY, and the home
// should lead with possibility, not a schedule. When a trip has no curated
// "things to do" yet (a brand-new trip, a place you just arrived at), the
// "We could…" tab must NOT open empty. This engine turns the place's
// coordinates into a handful of nearby ideas — a bite, somewhere to burn
// the kids' energy, something to see, a treat — by reusing the Worker's
// /places/nearby proxy (Google Places, key stays server-side).
//
// This module is deliberately PURE (no network, no React, no browser
// globals beyond a guarded localStorage) so the mapping + curation logic is
// unit-testable in Node. The fetch + render live in WeCouldNearby.jsx.
//
// SCOPE (slice 3a): auto-suggest + per-device keep/hide curation. NOT here:
// condition/weather re-ranking (slice 3b), Claude-scoped blurbs + "who it
// suits" + photos (slice 3c), and the propose→decide multiplayer loop
// (slice 6 — needs the D1 migration + the closed auth door).

export const ALL_MEMBERS = ['jonathan', 'helen', 'aurelia', 'rafa']

// The stay "pantry" categories. Each maps to ONE Places text query plus a
// friendly label + a category tint (mirrors the design's category accents).
// Kept small on purpose: one query per category, a few results each, so a
// tab open is a handful of calls, not a flood.
export const WE_COULD_CATEGORIES = [
  { key: 'meal', label: 'A bite', query: 'restaurants', tint: '#8A5A3C' },
  { key: 'energy', label: 'Burn energy', query: 'park or playground', tint: '#3C6E55' },
  { key: 'look', label: 'Something to see', query: 'scenic spots and attractions', tint: '#8A476A' },
  { key: 'treat', label: 'A treat', query: 'cafe or ice cream', tint: '#4A5A78' },
]

// Map a /places/nearby result + its source category into a tray card.
// Returns null for an unusable result so callers can filter it out.
export function mapNearbyResult(result, category) {
  if (!result || !result.name || !category) return null
  const hasCoords = Number.isFinite(result.lat) && Number.isFinite(result.lng)
  const id = result.placeId
    || (hasCoords ? `${result.name}@${result.lat},${result.lng}` : `name:${result.name}`)
  return {
    id,
    source: 'nearby',
    cat: category.key,
    catLabel: category.label,
    tint: category.tint,
    name: result.name,
    address: result.address || null,
    lat: hasCoords ? result.lat : null,
    lng: hasCoords ? result.lng : null,
    distanceMeters: Number.isFinite(result.distanceMeters) ? result.distanceMeters : null,
    openNow: typeof result.openNow === 'boolean' ? result.openNow : null,
    phone: result.phone || null,
    // A key-safe, worker-proxied photo URL (null when the place has none) —
    // the card shows it as the header image, falling back to the tint band.
    photoUrl: typeof result.photoUrl === 'string' ? result.photoUrl : null,
    // 3a: a nearby place suits everyone until Claude scopes it (3b). Tagging
    // all four keeps it visible under the default "Everyone" who-filter
    // (the filter is a strict intersection — a narrower tag set would hide
    // every auto-suggestion the moment a second chip is on).
    suits: ALL_MEMBERS,
  }
}

// Combine the per-category result-sets into one deduped tray, INTERLEAVED
// round-robin (a bite · burn energy · something to see · a treat · then the
// next of each) so the top of the tray shows variety, not five restaurants
// in a row. If a place appears under two categories, the first (earlier in
// the round) wins — it shows once, under its best fit.
export function buildTray(categoryResults) {
  const seen = new Set()
  const lists = (categoryResults || []).map((e) => ({
    category: e?.category,
    results: Array.isArray(e?.results) ? e.results : [],
  }))
  const maxLen = lists.reduce((m, l) => Math.max(m, l.results.length), 0)
  const out = []
  for (let i = 0; i < maxLen; i++) {
    for (const { category, results } of lists) {
      const card = mapNearbyResult(results[i], category)
      if (!card || seen.has(card.id)) continue
      seen.add(card.id)
      out.push(card)
    }
  }
  return out
}

// ── Real-conditions re-rank (slice 7) ────────────────────────────────────
// Each pantry category has an EXPOSURE — how much being outdoors/uncovered
// matters. energy (parks/playgrounds) is most exposed; look (scenic spots) is
// exposed; meal/treat (restaurants/cafes) are shelters (negative). Conditions
// nudge each card's score and a STABLE sort gently reorders the tray — equal
// nudges keep their interleave order, so this is a nudge, never a shuffle.
export const CATEGORY_EXPOSURE = { energy: 1, look: 0.6, meal: -0.4, treat: -0.6 }

// rankByConditions(tray, conditions) → { tray, reason }
// `reason` is a one-line plain-language banner, or null when nothing moved (a
// mild day, or a re-rank that didn't actually change the order — no false banner).
export function rankByConditions(tray, conditions) {
  const list = Array.isArray(tray) ? tray : []
  const w = conditions?.weather
  if (list.length === 0 || !w) return { tray: list, reason: null }

  const wet = w.kind === 'rain' || w.kind === 'storm' || w.kind === 'snow'
    || (Number.isFinite(w.precipProbPct) && w.precipProbPct >= 60)
  const cold = Number.isFinite(w.tempF) && w.tempF <= 40
  const hot = Number.isFinite(w.tempF) && w.tempF >= 85

  const delta = (card) => {
    const exp = CATEGORY_EXPOSURE[card?.cat] ?? 0
    let d = 0
    if (wet) d -= exp            // exposed down, sheltered up
    if (cold) d -= exp * 0.8
    if (hot && card?.cat === 'treat') d += 0.8  // a cool treat floats up in the heat
    if (hot && card?.cat === 'energy') d -= 0.4 // strenuous outdoor down midday
    return d
  }

  const indexed = list.map((card, i) => ({ card, i, d: delta(card) }))
  indexed.sort((a, b) => b.d - a.d || a.i - b.i) // stable: ties keep original order
  const reordered = indexed.map((x) => x.card)
  const moved = reordered.some((c, i) => c.id !== list[i].id)

  let reason = null
  if (moved) {
    if (w.kind === 'snow') reason = 'Snow around — cozy indoor ideas first.'
    else if (wet) reason = 'Rain around — indoor ideas moved up.'
    else if (cold) reason = 'Chilly out — warm, indoor ideas first.'
    else if (hot) reason = 'Hot out — cool treats & shade up top.'
  }
  return { tray: reordered, reason }
}

// A rough, honestly-labelled travel estimate from the straight-line
// distance. NOT a routed ETA — under ~1.2km we call it a short walk
// (~80 m/min), otherwise a local drive (~600 m/min ≈ 36 km/h with stops).
export function estimateTravel(distanceMeters) {
  if (!Number.isFinite(distanceMeters)) return null
  if (distanceMeters <= 1200) {
    return { mode: 'walk', minutes: Math.max(1, Math.round(distanceMeters / 80)) }
  }
  return { mode: 'drive', minutes: Math.max(1, Math.round(distanceMeters / 600)) }
}

// ── Curation (client-local, per trip, per device) ───────────────────────
// Each person curates their OWN device's tray — hide ideas that don't fit,
// pin the ones worth keeping in view. Stored in localStorage on this device
// only; the shared propose→decide flow is a later slice. Per
// FAMILY_TRIPS_VISION §10 every device is single-enrolled, so "this device"
// is "this person".

const CURATION_VERSION = 'rt_wecould_v1'

export function curationKey(tripId) {
  return `${CURATION_VERSION}:${tripId || 'unknown'}`
}

export function normalizeCuration(raw) {
  const pinned = Array.isArray(raw?.pinned) ? raw.pinned.filter((x) => typeof x === 'string') : []
  const hidden = Array.isArray(raw?.hidden) ? raw.hidden.filter((x) => typeof x === 'string') : []
  return { pinned, hidden }
}

// Apply curation to a built tray: drop hidden cards, float pinned ones to
// the top (stable within each group). Pure — tray + curation → ordered view,
// each card flagged `pinned`.
export function applyCuration(tray, curation) {
  const c = normalizeCuration(curation)
  const hidden = new Set(c.hidden)
  const pinned = new Set(c.pinned)
  const withFlag = (tray || [])
    .filter((card) => card && !hidden.has(card.id))
    .map((card) => ({ ...card, pinned: pinned.has(card.id) }))
  const yes = withFlag.filter((card) => card.pinned)
  const no = withFlag.filter((card) => !card.pinned)
  return [...yes, ...no]
}

export function togglePinned(curation, id) {
  const c = normalizeCuration(curation)
  const pinned = new Set(c.pinned)
  const hidden = new Set(c.hidden)
  if (pinned.has(id)) {
    pinned.delete(id)
  } else {
    pinned.add(id)
    hidden.delete(id) // a card can't be both kept and hidden (symmetric with toggleHidden)
  }
  return { pinned: [...pinned], hidden: [...hidden] }
}

export function toggleHidden(curation, id) {
  const c = normalizeCuration(curation)
  const hidden = new Set(c.hidden)
  const pinned = new Set(c.pinned)
  if (hidden.has(id)) {
    hidden.delete(id)
  } else {
    hidden.add(id)
    // A hidden card can't also be pinned.
    pinned.delete(id)
  }
  return { pinned: [...pinned], hidden: [...hidden] }
}

// ── localStorage I/O (guarded; safe in Node where there's no storage) ────
export function loadCuration(tripId) {
  try {
    const raw = globalThis.localStorage?.getItem(curationKey(tripId))
    return normalizeCuration(raw ? JSON.parse(raw) : null)
  } catch {
    return { pinned: [], hidden: [] }
  }
}

export function saveCuration(tripId, curation) {
  try {
    globalThis.localStorage?.setItem(
      curationKey(tripId),
      JSON.stringify(normalizeCuration(curation)),
    )
  } catch {
    /* storage unavailable (private mode / quota) — curation is best-effort */
  }
}
