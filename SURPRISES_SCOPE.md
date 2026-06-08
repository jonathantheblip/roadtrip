# Surprises & Masking — build scope

Durable scope so this is never re-scoped again. Product/UX is LOCKED by the design handoff; this maps it to
our build. Verify line numbers at HEAD before building (pointer, per WORKING_AGREEMENT §1).

## The authoritative design (don't re-decide — recreate it)
- **Dedicated handoff:** `design-handoffs/family-trips-2/design_handoff_surprise_reveal/` (gitignored stash) —
  `README.md` (the contract), `src/surprises.jsx` (`SurprisesView` + `SurpriseComposer`), `src/system.jsx`
  (`TRAVELERS` tokens + surprise data + masking helpers), `tokens.css`, `Surprise Reveal.html`.
- **Locked product decisions:** `REDESIGN_DESIGN_INTENT.md` §3.
- Re-skins COMPLETELY per person (Jonathan broadsheet / Helen editorial / Aurelia film-roll / Rafa Fredoka) —
  keep exact; the per-person personality IS the brand.

## What it is (settled by the design)
- **Hide:** a stop · a photo · a memory · the **whole trip**. Anyone creates one (kids included).
- **Hide from:** specific people (multi-select) **or** "Everyone".
- **Reveal:** `manual` ("When I choose") · `arrival` ("When they arrive") · `date` ("On a date").
- **TWO concealment modes — the author chooses per surprise ("What will they see?"):**
  - **`teaser`** (default): the recipient sees a blurred **"🎁 something's coming"** card — they know *one*
    exists, never *what*. The only honest representation of masked content.
  - **`cover`** (a *total* surprise): the recipient never learns one exists. The author authors a believable
    **cover story** — a fake-but-plausible stand-in stop that carries the **real timing + weather + packing**
    forward. The recipient sees the cover as an ordinary stop (on their itinerary, and to Claude), so they
    plan/pack correctly without the secret ever entering their reads. On reveal, the cover drops, the real
    surprise appears for everyone.
- **The masking contract (the heart):** masked content is **absent from Claude's view** for those it's hidden
  from — never hinted/confirmed/denied/redacted. For viewer V where a surprise is masked: **emit NOTHING for a
  teaser; emit the `cover` (only) for a cover; never the real `title`/`detail`, ever, until revealed.** Author
  always sees their own in full. Holds across EVERY Claude surface (chat, search, summaries, "what's our day").

## Data shape (from the design)
```
surprise {
  id, author,                    // author ALWAYS sees it in full
  what,                          // 'A stop'|'A photo'|'A memory'|'The whole trip'
  icon, title, detail, tint,
  hideFrom,                      // [travelerId,…]  OR  ['everyone']
  reveal: { type, at },          // type: 'manual'|'arrival'|'date'; at = place/date
  revealed,                      // bool / timestamp
  conceal,                       // 'teaser' (default) | 'cover'
  cover,                         // iff conceal==='cover': { icon, title, loc, time, weather, packing }
}
```
Masking helpers (`system.jsx`): `surprisesKeptBy(viewer)` (authored — full) · `surprisesComingFor(viewer)`
(EVERYTHING masked from viewer — teasers + covers; the set to hide from normal reads + Claude) ·
`teasersComingFor(viewer)` (just teasers — what the Surprises "Something's coming" section shows; covers are
deliberately absent) · `revealLabel(reveal)` · `displayName(id, viewer)` (Rafa sees Mama/Papa/Sissy).

## Our data model today (verified)
- Memories: `visibility:'shared'|'private'` + `authorTraveler` (`memoryStore.js`). Masking GENERALIZES this
  binary into per-recipient targeting + reveal triggers + conceal-mode + revealed-state (§3: "additive on top
  of the existing single visibility mechanism").
- Central client read = `listMemoriesForTrip(tripId, viewer)` (+ stop/across-trip variants) — every surface
  (trip, photos, weave, replay) reads through it → **enforce masking HERE once → all inherit it.**
- Claude + the nightly weave read memories SERVER-SIDE (worker/D1) → **the worker must filter by viewer too.**
  The client filter is UX; **the server/data-layer filter is the security boundary** (a masked row must never
  reach a client/model that shouldn't have it). The design states this explicitly.

## Architecture — enforce in TWO central places, with a cover branch
A single per-viewer transform, applied client-side (in `listMemoriesForTrip` & co.) AND server-side (worker
read for Claude/weave):
- `author === viewer` → real row, untouched.
- masked + `teaser` → **drop the row** (absent). (Its teaser card is surfaced separately by the Surprises UI
  from the synced-but-hidden record.)
- masked + `cover` → **substitute the `cover` stand-in** into the viewer's reads (itinerary, Claude context,
  weave) *instead of* the real row. Real `title`/`detail` never emitted.
- `revealed` → real row for everyone.

## Why this needs schema + worker (the gate)
Both the teaser AND the cover require masked rows to SYNC (recipient's device needs the record — for the
teaser card, or to render the cover stop) AND the server to filter/substitute per-viewer. So slice 1 includes:
**D1 migration** — memories gain `hide_from_json`, `reveal_json`, `revealed_at`, `conceal`, `cover_json` —
plus worker serialize/deserialize + the worker-side per-viewer filter/substitute for Claude + nightly weave.
**Schema change → Jonathan's explicit approval + the D1-Edit token (WORKING_AGREEMENT §3 / G9) before running.**

## Staging (each shippable)
- **Slice 1 — the core (manual reveal, both modes):** the data model (client memoryStore + the single D1
  migration above + worker filter/substitute + sync) · the central per-viewer transform (teaser-drop +
  cover-substitute) · `SurprisesView` + `SurpriseComposer` recreated per-persona (incl. the "What will they
  see?" teaser/cover choice + the cover form: title/where/when + weather + what-to-bring, and the author's
  "What they see instead" preview) · the masked teaser section · manual "Reveal now" + the 🎉 celebration ·
  Claude genuinely blinded server-side (teaser → absent, cover → cover-only). Targets: photo / memory / stop.
- **Slice 2 — auto-reveal:** `reveal.type='date'` (scheduled check) + `'arrival'` (geofence on the stop's
  lat/lng — reuse `photoMatch` haversine); fire on trigger, then unmask. + the Settings "Surprise reveals"
  notification to the `hideFrom` people on reveal.
- **Slice 3 — whole-trip surprises + cover-on-itinerary:** trips gain the same masking; a cover renders as a
  real, ordinary stop on the recipient's ITINERARY surface (wire it where stops render); a whole-trip cover
  swaps a hidden trip for a believable stand-in.

## Gates (surface each, plainly)
- **D1 migration + worker** (slice 1) — schema change; needs approval + D1-Edit token; worker deploy.
- **Client deploy** — e2e-gated. **axe-gate** `SurprisesView` + `SurpriseComposer` ×personas.
- **Load-bearing test (G7, non-vacuous):** prove a hidden memory is ABSENT from the worker's Claude context
  for the recipient — and for a cover, that the context has the cover's fields and **never** the real
  `title`/`detail`.

## Build order within slice 1 (client-first where possible)
1. Client: masking fields on memories + the per-viewer transform (teaser-drop + cover-substitute) wired into
   `listMemoriesForTrip` (+ variants); `SurprisesView`/`SurpriseComposer` recreated; manual reveal works
   LOCALLY (provable without sync).
2. Then the gate: the D1 migration + worker serialize/filter/substitute + sync — so it works cross-device and
   blinds Claude (the security boundary).
