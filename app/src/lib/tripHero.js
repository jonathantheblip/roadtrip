// hasExplicitHero — the single guard predicate for the trip-hero system.
//
// "Already has a hero" = `heroImage` is a non-empty (trimmed) string.
// That is the ONLY field that counts as an explicit, Jonathan-set hero.
// A trip for which this returns true is UNTOUCHABLE: the worker never
// resolves a default for it (no Places call, no R2 write, no data_json
// mutation, no updated_at bump) and the client renders its heroImage arm
// unchanged (byte-identical to the pre-existing render). A non-empty
// string is treated as a deliberate choice even if the file 404s — the
// system never second-guesses or "auto-heals" a path Jonathan set; a
// broken explicit path renders broken and is his data-fix (re-point or
// clear to ''). See CARRYOVER_TRIP_HERO_PLAN.md §0.
//
// `heroResolved` (the worker-written default, §2) is deliberately a
// SEPARATE field and is NOT an explicit hero — it can be re-resolved.
// `heroStopId` is a memory-anchor hint, not a hero.
//
// ⚠️ This logic is intentionally duplicated, byte-identical, in the
// worker (worker/src/index.js, exported `hasExplicitHero`) because the
// app (vite) and worker (wrangler) are separate deploy units with no
// shared module. Both copies are unit-tested against the same §0 case
// table (app/scripts/__tests__/tripHero.test.mjs +
// worker/test/trip-hero-resolve.test.js) so they can never diverge.
export function hasExplicitHero(trip) {
  const h = trip && trip.heroImage
  return typeof h === 'string' && h.trim().length > 0
}
