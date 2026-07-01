# 06 · Build notes (for Claude Code)

What to wire, the data-model additions the design assumes, the per-skin facelift, and where the
prototype fakes something. Prototype source lives in `roadtrip_redesign/*.jsx` (React 18 UMD +
Babel, inline-styled, Helen's tokens) and reuses the existing `src/ft2/system.jsx` primitives.

---

## Data-model additions
The design assumes a few fields that don't fully exist yet.

**Trip → parts/legs.** A composite trip is an ordered list of **legs**, each:
```
leg = { id, kind: 'stay'|'city'|'drive'|'flight'|'train'|'ferry'|'cruise'|'event',
        place, city, coords, startDate, endDate,
        tz,                 // IANA zone, e.g. 'Europe/Rome' — REQUIRED for orientation
        currency,           // ISO 4217, e.g. 'EUR'
        locale,             // e.g. 'it-IT' — drives language cue + nearby search
        members: [ids] }    // who is on THIS leg (scenario E)
```
- **`currentLeg`** = the leg whose date range contains "now-in-leg-tz". The home's hero,
  conditions, We-could, and Map all anchor to it (the per-leg anchor is already in code — this is
  about *using* it everywhere, not just the map).
- **Shape derivation:** `stay` if one place/leg and no timed multi-event day; `composite` if ≥2
  places/legs; `route` if a genuine multi-stop drive. Do **not** key off the legacy single
  internal "part" — that bug forced simple stays into the complex frame (Decision 4c).

**Flights → segments.** Model each flight as segments with their own zones:
```
segment = { flightNo, from:{code,city,tz}, dep:{ local, date },
            to:{code,city,tz},   arr:{ local, date },   durationMin }
flight  = { segments:[...], layovers:[{code,mins}] }
```
- Compute **`+N day`** from `arr.date` vs `dep.date` **in each end's own zone** — never the
  phone's. Render arrival in the destination zone, on the day it lands.

**Conditions.** Per current-leg coords, derive place-nature (ocean/lake/mountain/desert/city/
cold) and compute the relevant 3–4 variables (`05` `04`). **Tide requires a coastline** — gate it
on that, don't fake it inland.

**Presence.** Per-person status {home | out | live} + coarse location label; scoped by leg
membership (scenario E). "Wave" is a lightweight ping.

---

## Timezone rules (honest UI — do these exactly)
1. **"Now," countdowns, "today"** on a trip use the **current leg's tz**, always.
2. If the **viewer's** device tz ≠ current-leg tz, show **both** (leg time leads, home time faint):
   "4:20 PM in Florence · 10:20 AM where you are."
3. The **arrival moment** fires **once** per new country/zone (persist "seen" per leg). Show only
   what changed (clocks / currency / language). No change → don't fire.
4. Never render a time/label/percentage the data doesn't back. If a flight time is unknown, say so
   — don't infer from the phone clock.

## Units & i18n
- Distances/temps follow the **leg's locale** (km/°C abroad), with a home-unit hint where useful.
- Nearby ("We could…") search uses the **leg's locale/language**; prices in **local currency**
  with a small "≈ $" hint from a cached rate.

---

## Per-skin facelift (the wish — make each lens as beautiful as Helen's)
The home renders for **Jonathan / Helen / Aurelia** from the same component; **Rafa keeps his
iPad pad** (don't force this home on a 5-year-old) but inherits the warmth + type energy.

- Drive everything from `tokens.css` (`data-skin`). No per-skin forks of layout — only the vars.
- Respect each skin's personality: **Jonathan** dark editorial/clay + hard radius (2px), mono
  metadata reads as "ops"; **Helen** warm paper/sage, soft radius (18px); **Aurelia** near-black
  film-roll, **italic Instrument** display, tight radius (4px), lowercase voice.
- The "alive-at-empty" promises, the forming Weave, and the nothing-day lines should feel native
  to each voice (Aurelia's are lowercase; Jonathan's a touch drier) — same *structure*, tuned
  copy is fine.
- Working reference: **`skins.html`** in this folder (Jonathan / Helen / Aurelia side by side) +
  its component `skin-home.jsx`.

---

## What the prototypes fake (wire for real)
- **Maps** are abstract warm vignettes (land/water SVG + pins). Wire to a real map with the
  per-leg anchor + walking/transit/driving directions deep-links (Apple Maps `?dirflg=w/r/d`,
  Waze for Jonathan).
- **Photos** are striped/tinted placeholders — real imagery is the user's own.
- **Conditions / weather / tide / currency** are static strings — wire to real sources, gated by
  place-nature.
- **Timezone** is illustrated with fixed times — implement with real tz math (store IANA zones).
- **The Weave** prose is authored copy — compose per night from real beats (optionally
  Claude-authored), render the export server-side/canvas.
- **Flights** are one worked example — model all segments/zones from real itinerary data.
- **Presence** is static — wire to real device presence + coarse location.

---

## Build order (suggested)
1. Land the **leg/tz/currency** data model + `currentLeg` derivation; fix shape derivation (kill
   the "single part ⇒ complex" bug → Decision 4c).
2. Make the home **token-driven** across the three skins (`tokens.css`) — the facelift.
3. Implement the **conditional modules** with the gating matrix (`05`) so complexity can't leak.
4. Wire **timezone honesty** + the **arrival moment**.
5. Scope **We-could** + **who's-around** to `currentLeg`; open the **4-tab shell** to composite.
6. Model **multi-leg flights** (segments/zones/+1) → Next-Up + The Plan.
7. The four point-fixes (`01`): Map panel faces, Getting-there modes, agenda overflow, one-tap
   publish + alive-at-empty.
8. Keep the **reconcile table** (`05`) green — fold, never delete.

## Source-file map (prototype)
- `roadtrip_redesign/rr-kit.jsx` — shared atoms (Intro, Spec, Flag, MiniMap, Pin, Bubble) + Helen
  tokens shortcut.
- `rr-decisions-12.jsx` / `rr-decisions-34.jsx` — the four decisions' screens.
- `rr-scale-home.jsx` — the **shape-aware `HomeScreen`** + all home modules (the reference impl).
- `rr-scale-extras.jsx` — orientation / timezone / scoped We-could / flight screens + gating matrix.
- `skin-home.jsx` — the theme-aware home used by `skins.html`.
