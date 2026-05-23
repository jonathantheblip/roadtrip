// Side activities loader. Each trip drops a `<tripId>.json` next to
// this file; Vite glob-imports them all at build time so adding a new
// trip = drop a JSON file + commit (no code change in this module).
//
// Activities are seed-only in v1 — they live inside the bundled trip
// surface, not in a D1 table. v2 will migrate to a dedicated
// `activities` table when Share-In needs runtime writes from
// non-owners. See SIDE_ACTIVITIES_BUILD.md for the phasing.
//
// Seed schema notes (JSON itself can't carry comments — schema docs
// live here instead):
//
//   noAutoHero?: boolean
//     When true, app/scripts/fetchHeroImages.mjs skips the photo fetch
//     for this activity but still captures businessStatus +
//     hoursStructured. Set this for venues where the only Places
//     photos are marketing banners with text overlays (Mohegan Sun's
//     Kids/Cyber Quest are the original cases).
//
//   noAutoHours?: boolean
//     When true, the fetcher skips writing hoursStructured for this
//     activity (businessStatus and photo fetch still run). Set this
//     when text search resolves to the wrong venue and the resulting
//     hours would mislead the user (e.g. "Shops at Mohegan Sun"
//     resolving to a 24/7 retailer inside the complex).
//
//   placeIdOverride?: string | null
//     Reserved. Not wired today. Lets a future enrichment pass bypass
//     the text-search disambiguation step and resolve a venue directly
//     by Google Place ID — useful when the address-driven search lands
//     on the wrong place (e.g. "The Shops at Mohegan Sun" resolving
//     to a specific store within the complex).

const ACTIVITY_MODULES = import.meta.glob('./*.json', { eager: true })

// Build the tripId → activities[] map once at module load. Keys in
// ACTIVITY_MODULES look like `./volleyball-2026.json` — we drop the
// path bits to derive the trip id.
const ACTIVITIES_BY_TRIP = Object.entries(ACTIVITY_MODULES).reduce(
  (acc, [path, mod]) => {
    const match = path.match(/\/([^/]+)\.json$/)
    if (!match) return acc
    const tripId = match[1]
    const list = Array.isArray(mod?.default) ? mod.default : []
    acc[tripId] = list
    return acc
  },
  {}
)

// Dev-mode runtime check: tags and the keys of descriptions must
// match exactly. Catches mistakes in the seed file before they ship
// (the spec is explicit: throw in dev). Production behavior is
// permissive — a malformed seed shouldn't blank a phone mid-tournament.
if (import.meta.env?.DEV) {
  const validFamily = new Set(['jonathan', 'helen', 'aurelia', 'rafa'])
  const validCategories = new Set([
    'beach',
    'museum',
    'shopping',
    'entertainment',
    'meal_breakfast',
    'meal_lunch',
    'meal_dinner',
  ])
  for (const [tripId, activities] of Object.entries(ACTIVITIES_BY_TRIP)) {
    for (const a of activities) {
      const tagSet = new Set(a.tags || [])
      const descSet = new Set(Object.keys(a.descriptions || {}))
      const tagsArr = [...tagSet].sort()
      const descArr = [...descSet].sort()
      if (
        tagsArr.length !== descArr.length ||
        tagsArr.some((t, i) => t !== descArr[i])
      ) {
        throw new Error(
          `[sideActivities] ${tripId}/${a.id}: tags ${JSON.stringify(
            tagsArr
          )} must match descriptions keys ${JSON.stringify(descArr)}`
        )
      }
      for (const t of tagsArr) {
        if (!validFamily.has(t)) {
          throw new Error(
            `[sideActivities] ${tripId}/${a.id}: unknown family member "${t}"`
          )
        }
      }
      if (!validCategories.has(a.category)) {
        throw new Error(
          `[sideActivities] ${tripId}/${a.id}: invalid category "${a.category}"`
        )
      }
      if (a.tripId !== tripId) {
        throw new Error(
          `[sideActivities] ${tripId}/${a.id}: tripId in JSON ("${a.tripId}") doesn't match file name`
        )
      }
    }
  }
}

// Public: look up activities for a trip id. Returns [] if the trip
// has no seed file — that's fine, a trip without activities just
// hides the "Things to do" affordance.
export function getActivitiesForTrip(tripId) {
  return ACTIVITIES_BY_TRIP[tripId] || []
}

// Public: which trips have any activities seeded? Handy for showing
// the "Things to do" entry point only on trips that have something.
export function hasActivitiesForTrip(tripId) {
  return (ACTIVITIES_BY_TRIP[tripId] || []).length > 0
}

// Filter activities by the family-member chip selection (spec §4).
// Empty selection → empty array. Multiple members → strict
// intersection (every selected member must be tagged on the
// activity). Use this from the view, not the data layer, since
// filter state is per-view-mount.
export function filterActivities(activities, selected) {
  if (!selected || selected.size === 0) return []
  const list = [...selected]
  return activities.filter((a) =>
    list.every((member) => (a.tags || []).includes(member))
  )
}

// Reader-fallback resolution per spec §5 + §6. Returns the reader's
// description if present; otherwise null so the card can render the
// structural fallback (no name-specific copy, just name + category +
// drive + hours).
export function descriptionFor(activity, readerId) {
  const d = activity?.descriptions?.[readerId]
  return typeof d === 'string' && d.trim() ? d : null
}

// Group activities by category in a stable, friendly order. Used by
// the activities view to surface section headers.
const CATEGORY_ORDER = [
  'beach',
  'museum',
  'shopping',
  'entertainment',
  'meal_breakfast',
  'meal_lunch',
  'meal_dinner',
]

export const CATEGORY_LABEL = {
  beach: 'Beaches',
  museum: 'Museums',
  shopping: 'Shopping',
  entertainment: 'Entertainment',
  meal_breakfast: 'Breakfast',
  meal_lunch: 'Lunch',
  meal_dinner: 'Dinner',
}

export function groupByCategory(activities) {
  const buckets = new Map()
  for (const a of activities) {
    if (!buckets.has(a.category)) buckets.set(a.category, [])
    buckets.get(a.category).push(a)
  }
  // Sort within each category by driving time ascending, then name.
  for (const arr of buckets.values()) {
    arr.sort((x, y) => {
      const d = (x.drivingMinutes || 0) - (y.drivingMinutes || 0)
      if (d !== 0) return d
      return (x.name || '').localeCompare(y.name || '')
    })
  }
  return CATEGORY_ORDER.filter((c) => buckets.has(c)).map((category) => ({
    category,
    label: CATEGORY_LABEL[category] || category,
    items: buckets.get(category),
  }))
}

// Today's ISO date for closed-date matching (spec §6, acceptance §11).
// Read fresh on each call so the closed warning rolls forward across
// midnight while the app is open.
export function isClosedToday(activity) {
  if (!activity?.closedDates?.length) return false
  const today = new Date().toISOString().slice(0, 10)
  return activity.closedDates.includes(today)
}
