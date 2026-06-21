# Handoff: Family Trips — the "Hangout" (do-nothing) trip

## Overview

Family Trips is a per-person travel PWA: **one trip-data spine rendered through four
role-shaped "lenses"** (one per family member). This handoff covers a major expansion of
the spec: the app was originally built around **a PLAN** (timed events) or **a drive**.
But most of this family's trips are a **STAY** — a beach cottage, Grandma's, a long weekend
with nothing booked. This work re-centers the product on that reality.

The deliverable is a **working interactive prototype** of the hangout experience plus the
**design-exploration board** that produced it. Build target = the prototype.

The family: **Jonathan** (Dad), **Helen** (Mom), **Aurelia** (13), **Rafa** (5).

---

## ⭐ The mission — read this first (be faithful to it)

This is not a generic "suggestions" feature. The intent below is the spec; the pixels serve it.

1. **The do-nothing stay is THE trip, not an exception.** Don't congratulate the user for
   having no plans or announce the emptiness — it's their default. The rare, structured
   trip (a road trip with timed legs) is the outlier. **Flexibility is the container;
   structure is the add-on.** The same model must carry into *every* trip, past and future.

2. **The home leads with possibility, not a schedule.** With zero events there is no
   "THE PLAN." Instead the home is **"We could…"** — a curated tray of *pre-scoped*,
   nearby possibilities (a meal, somewhere to burn the kids' energy, something aesthetic),
   each with a photo, a blurb, who it's ideal for, travel time, and any limited-time window.
   Ready the instant someone asks "what should we do?" Nothing is ever auto-scheduled.

3. **Anyone proposes; the deciders decide — but only for OPEN time.** Meals are the daily
   kick-the-can decision. Any family member (even Rafa, even Aurelia) can pick something and
   **propose** it to the deciders (Helen + Jonathan), optionally with a note. Non-deciders
   can add a soft **"I'm in"** vote; deciders make the call ("Let's go" / "Not now").
   **Boundary (hard rule):** this loop is *only* for unstructured time. Booked plans /
   destinations / activities are **fixed** — shown, never voted. **Surprises are masked** —
   they never enter the loop, so it can't hint or spoil.

4. **Don't flatten the four people into archetypes.** Roles are starting points, not cages:
   - **Jonathan** runs logistics by reflex *and* is the one who, on empty days, finally
     notices the small stuff. (He is the primary user / "me".)
   - **Helen** keeps the small moments *and* provisions — she'll scope the bakery and book
     the table. Remembering and arranging are the same muscle for her.
   - **Aurelia's** eye is **trained by the feed** (postable, current, what friends react to) —
     *not* fine-art photography. Surface the shareable, not just the scenic.
   - **Rafa** never had a schedule anyway; he needs the next place to put his body and someone
     to point him at it, then a way to tell the story afterward, loudly.

5. **It must generalize across trip types.** A beach stay watches the tide; a city stay does
   not. Conditions, pantry, presence, photos and the woven day are all **per-trip-type**.
   *Never show tide in Chicago.*

6. **Suggestions are condition-aware, not just descriptive.** Rain pushes outdoor options
   down; heat promotes shade/water; winter closes the summer-only spots; city traffic
   penalizes long drives and floats walk/transit. The tray *re-ranks*, with a one-line
   reason banner.

7. **Founding rule (applies to every surface): it must name who it serves and what it gives
   them.**

---

## About the design files

The files in this bundle are **design references created in HTML/React-via-Babel** —
prototypes showing intended look and behavior, **not production code to ship directly**.
The task is to **recreate them in the target codebase's environment** (React Native, SwiftUI,
React+Vite, etc.) using its established patterns, then **wire the real behaviors** the
prototype fakes (see Production notes). If no environment exists yet, choose the most
appropriate framework and implement there.

Imagery in the prototype is intentionally **striped placeholders with mono captions** — they
mark where real photos / face-grouped frames go.

## Fidelity

**High-fidelity.** Final colors, typography, spacing, radii, motion personality, and
interactions are all intentional and specified (see `tokens.css` + Design Tokens). Recreate
the UI faithfully using the codebase's libraries. The four per-lens skins (palette + display
font + radius + identity dot) are **the brand** — keep them exact.

---

## The two artifacts in this bundle

| File | What it is | Use |
|---|---|---|
| **`The Hangout — Live.html`** | The working interactive prototype (the build target). | Implement this. |
| **`exploration/The Hangout Trip.html`** | A pan/zoom design board: the felt-experience reframe, "four minds," the three directions explored (By the Light / As It Happens / We Could…), the decide-together mechanic, and "every trip" generalization. | Rationale & depth. Read to understand *why*. |

The prototype is a **synthesis** of the three explored directions: **Place** sets the frame
(a conditions strip), **Feed** shows life (a now-peek + presence), and **Pantry** is the
engine (the "We could…" tray). The board explains each direction and the decisions behind the
synthesis.

### Source files (prototype)
`The Hangout — Live.html` loads, in order:
- `tokens.jsx` — TRAVELERS (the four lenses: palette, font, radius, dot), category & helper tokens.
- `ui.jsx` — shared in-skin primitives (Avatar, FaceRow, Photo placeholder, Mono, etc.).
- `live-data.jsx` — **the trip spine**: `TRIPS` (Wellfleet beach + Chicago city), pantry
  items, `SETTINGS` (indoor/outdoor/summer/water tagging), `WEATHER` states, condition
  `BANNER`s, surprises, and helpers (`comboFilter`, `comboLabel`, `travelStr`, `isOneOnOne`).
- `live-app.jsx` — all components + state. **Start here for behavior.**

(`tokens.css` in this folder is the same token system expressed as CSS custom properties,
for a non-React target.)

---

## Screens / Views

The shell is a single phone (390×844, scaled to fit). Two navigation axes:
**WHO** (tap an avatar top-right → the entire app re-skins to that lens) and
**WHAT** (bottom tab bar: We could · Now · Photos · Look back). A **trip switcher** sits
directly under the status bar (Wellfleet beach stay ↔ Chicago city stay).

### 1. Home — "We could…" (tab: home)
**Purpose:** answer "what should we do?" instantly, for whatever group is restless.
**Layout (top→bottom, 16px side padding):**
- **Place / conditions strip** — a `--surface` card: photo thumb (64px) + place name + a live
  ticking clock + the **weather line** + a mono row of the trip's conditions
  (beach: `GOLDEN · SUNSET · LOW TIDE · WATER`; city: `GOLDEN · SUNSET · FEELS · BLUE LINE`).
- **Weather toggle** — `IF IT'S  Clear · Rain · Hot · Winter` (city swaps Hot→Traffic). A demo
  control standing in for live weather/traffic data; the tray reacts to it.
- **Now-peek** — one tappable row (latest moment) → jumps to Now.
- **"WE COULD…" label**, then **two filter rows:**
  - **Who's it for** (multi-select): presets `Everyone · Kids · Adults`, a divider, then the
    four avatars. Tapping avatars builds **any combination**. A dynamic label reads
    "for *Jonathan + Rafa* · some one-on-one" when it's one kid + one adult.
  - **Category** (single, toggleable): `A bite · Burn energy · Aesthetic · All of us`.
- **Condition banner** (only when weather is adverse) — dot + one-line reason.
- **Pantry cards** (re-ranked by condition). Normal card: photo (event badge overlay) + category
  kicker + title (display font) + blurb + face row + travel time + **Propose →**. Condition
  flags appear under the blurb (e.g. "BETTER WHEN IT'S DRY"); demoted cards dim.
  **Rafa's lens** swaps to big 152px image cards with an **Ask! →** button.
- Footer: "`N` NEARBY · NONE ON THE CLOCK".

### 2. Now (tab: now)
**Purpose:** what's true this minute — no countdown to a next event.
- **Conditions strip** — the trip's `cond` grid + the live weather line (turns `--live` when adverse).
- **On for now** — accepted proposals (or the empty state: "Nothing locked in. That's allowed…").
- **Kept quiet** (surprises) — *masking-aware* (see below): the keeper sees their surprise in
  full ("YOU'RE KEEPING … FROM Rafa · Aurelia … REVEALS …"); anyone it's hidden from sees only a
  blurred **"SOMETHING'S COMING"** teaser; everyone else sees nothing.
- **Who's around** — the four people with live presence (where + what), live/idle status dot.

### 3. Photos (tab: photos)
Ambient stream (no events to file under), grouped loosely, **tagged by who's in the frame**
(face row overlay). Accepted picks lead the grid with a **"FROM · <place>"** tag — the trip
quietly remembers where you went. City vs beach swap their base frames.

### 4. Look back (tab: back)
- **The day, braided** — the Weave: one beat per person (Jonathan LOG, Helen WORDS, Aurelia
  FRAME, Rafa VOICE), in that person's voice, on a vertical braid rail.
- **What we ended up doing** — the accepted picks, in order (the unplanned trip, written as
  lived). Empty until something is accepted.
- "Keep this day → the book" CTA.

### 5. Propose sheet (modal, bottom)
Opens from any pantry card. Slides up over a scrim. Contents: the spot (photo + travel + event
badge), **Send to** (recipient chips, default = people the spot suits, minus self), an optional
**note** (`<input>`, lens placeholder e.g. Rafa "i want to go!!"), **Send it →**, and the line
"A suggestion, not a booking."

### 6. Decision / vote (inline banners, top of content)
When the current lens is a **recipient** of a pending proposal:
- **Deciders (Helen/Jonathan):** "AURELIA SUGGESTS · OPEN TIME" + spot + note + travel + vote
  tally → **Let's go** / **Not now**.
- **Non-deciders (a kid):** the same card but the action is **"I'm in →"** (a soft vote).
- The **proposer** sees a dashed "You suggested … WAITING ON …" banner with the running tally.
- Multiple pending proposals stack ("N IDEAS ON THE TABLE").

---

## Interactions & behavior

- **Lens switch (WHO):** tap an avatar → `who` changes → the whole tree re-skins via the lens
  token set. Background/text transition ~450ms; everything else snaps. Filters reset to a
  per-lens default (kids → themselves; parents → Everyone/Adults).
- **Trip switch:** swaps `TRIPS[id]` → new conditions, pantry, presence, photos, woven beats,
  surprises; resets weather to Clear and category filter.
- **Multi-select who-filter:** selection is an array. Filtering semantics
  (`comboFilter`): empty = everyone; otherwise an item passes only if it suits **every** selected
  person (a shared outing). `isOneOnOne` detects exactly one kid + one adult.
- **Category filter:** single-select, tap again to clear.
- **Condition re-rank (`rankPantry`)** — for the active weather `mode`, each item gets a class
  (0 promote / 1 normal / 2 demote) + an optional flag + dim, then sorted by class then original
  order. Rules:
  - `rain`: outdoor → demote + dim + "better when it's dry"; indoor → promote.
  - `hot`: water/shade → promote + "good in the heat"; other outdoor → demote + "hot midday · go early or late".
  - `winter`: summer-only → demote + dim + "closed for the season"; `winterWin` items (e.g. ice
    skating) → promote + "better in the cold"; other outdoor → demote + "bundle up"; indoor → promote.
  - `traffic` (city): `drive` items → demote + dim + "+N min in traffic" (N ≈ round(min·0.8)+4);
    `walk`/`transit` → promote.
  - Adverse modes also show the one-line `BANNER[mode]`.
- **Propose → vote → decide loop:** propose creates a `pending` proposal (tagged with `tripId`).
  Recipients who are non-deciders toggle `votes`. A decider sets status `accepted`/`declined`.
  Accepting jumps to **Now** and the pick appears in **On for now**, **Photos** ("from …"), and
  **Look back** ("what we ended up doing"). All persisted.
- **Surprise masking:** a surprise has `by` (keeper) and `hideFrom[]`. Render rule per viewer:
  keeper → full detail; in `hideFrom` → blurred "something's coming" teaser only (never the
  content); otherwise → omit entirely. The loop/Claude must treat masked rows as **absent** for
  people they're hidden from — never hint, confirm, deny, or spoil.
- **Press feedback:** buttons scale to 0.97 on press. **Toast:** transient confirmation pill
  above the tab bar.

---

## State management

Top-level state in `LiveApp`:
| State | Persisted key | Notes |
|---|---|---|
| `who` | `hg-live-who` | active lens id |
| `tripId` | `hg-live-trip` | `wellfleet` \| `chicago` |
| `tab` | `hg-live-tab` | `home` \| `now` \| `photos` \| `back` |
| `proposals` | `hg-live-proposals` | array; each `{id, tripId, spotId, from, to[], note, status, votes[], by, ts}` |
| `sel` | — | who-filter selection (array of ids); resets per lens |
| `catFilter` | — | category or null |
| `weather` | — | per current trip; resets to `clear` on trip switch |
| `sheet` | — | spot being proposed, or null |
| `toast`, `now` | — | transient; `now` ticks every 1s for the live clock |

**Persistence is `localStorage` only** in the prototype — replace with the real synced store.

---

## Data model (`live-data.jsx`)

- **`TRIPS[id]`** = `{ id, type:'beach'|'city', place, placeSub, weather, cond:[[k,v]…],
  presence:{id→{where,what,dotMood}}, moments:[{who,cap}], pantry:[…], surprises:[…] }`.
- **Pantry item** = `{ id, cat:'meal'|'energy'|'look'|'together', title, blurb, forIds:[ids],
  travel:['walk'|'drive'|'transit', minutes], when, event?:[label, hot?], tint }`.
- **`SETTINGS[id]`** = `{ outdoor:[ids], summerOnly:[ids], water:[ids], winterWin?:[ids] }` —
  drives condition re-ranking.
- **`WEATHER[id]`** = `[[key, label, weatherLine, mode]]`. `BANNER[mode]` = the reason line.
- **Surprise** = `{ id, by, title, blurb, hideFrom:[ids], reveal, tint }`.
- **Identity:** `TRAVELERS[id].dot` is the constant person color. `nameFor(id, viewer)`
  localizes inside Rafa's lens (Helen→Mama, Jonathan→Papa, Aurelia→Sissy).
- **Deciders:** `['helen','jonathan']`.

---

## Design tokens

See **`tokens.css`** for the full per-lens custom-property sets (apply via `data-lens`). Summary:

- **Identity dots (constant):** Jonathan `#2E6BB8` · Helen `#2E7D52` · Aurelia `#E8478C` · Rafa `#E8552E`.
- **Accents:** Jonathan clay `#E0654F` · Helen sage `#2E7D52` · Aurelia hot-pink `#FF3D78` · Rafa ochre `#FFB12E`.
- **Radii:** Jonathan 2 · Aurelia 4 · Helen 18 · Rafa 24 (px). Cards generally clamp to `min(radius,16)`.
- **Fonts:** Fraunces (Jonathan/Helen display), Instrument Serif italic (Aurelia display),
  Fredoka (Rafa), Inter Tight (body/UI), JetBrains Mono (labels). Google Fonts.
- **Category accents:** meal `#8A5A3C` · energy `#3C6E55` · look `#8A476A` · together `#4A5A78`.
- **Type scale:** display 22–30px, body 11.5–14px, mono labels 8–10.5px (uppercase, +0.4–1.4 tracking).

---

## Assets

No real image assets — all imagery is striped placeholders. In production, replace with:
- real place photos for pantry cards (sourced when scoping a trip),
- **on-device face grouping** to populate "who's IN the frame" for Photos & the recognizer,
- real per-person PWA manifests/icons (each install is that person's own front door).

## Production notes (what the prototype fakes)

- **Location + time + weather/traffic** are mocked via the toggle. Wire to real geolocation,
  clock, a weather API, and a routing/traffic API; recompute `travel` and condition `mode` live.
- **The pantry** is hand-authored per trip. In production it should be a scoped, editable,
  location-aware dataset per trip (with the indoor/outdoor/season/water tagging that powers
  re-ranking), refreshable as you travel.
- **Limited-time / special events** (`event`) should come from real event feeds with real windows.
- **Propose→decide** is local state; make it real-time multiplayer across the family's devices.
- **Surprise masking** must be enforced server-side as row-level visibility on every query
  (including anything an assistant sees) keyed by the requesting person — never client-only.
- **Generalization:** adding a trip type = adding its `cond`, `SETTINGS`, `WEATHER`, and pantry.
  Keep the rule "only show conditions that exist for this place."

---

## Files in this bundle

```
design_handoff_family_trips_hangout/
  README.md                  ← this file
  tokens.css                 ← per-lens design tokens (CSS custom properties)
  The Hangout — Live.html    ← the prototype (BUILD TARGET)
  tokens.jsx ui.jsx live-data.jsx live-app.jsx   ← prototype source
  exploration/               ← the design-exploration board (rationale & depth)
    The Hangout Trip.html  + its source (design-canvas.jsx, concept.jsx, dirA/B/C.jsx, …)
  screenshots/               ← key states, for fidelity (see below)
```

### Screenshots (in `screenshots/`)
Two captured sequences. The bottom **propose sheet** is a modal overlay that the static
capture pipeline can't render — it's specified in full under *Screens / Views › 5. Propose sheet*.

Baseline states (`NN-state.png`):
1. `01-state` — Home · "We could" · **Helen** · beach (baseline)
2. `02-state` — Home · **Rafa** lens (big "Ask!" cards, full re-skin)
3. `03-state` — Who-filter mid-build (Jonathan selected)
4. `04-state` — Who-filter · **Jonathan + Rafa** ("some one-on-one")
5. `05-state` — Condition re-rank · beach **Winter** (summer spots closed, banner)
6. `06-state` — Generalization · **Chicago + Traffic** (no tide; drives demoted, walk/transit up)

The propose→vote→decide→surface flow (`NN-flow.png`):
1. `01-flow` / `02-flow` — **Aurelia** lens home (film-roll skin, "we could…")
2. `03-flow` — Aurelia · "You suggested … waiting on" banner
3. `04-flow` — **Rafa** (non-decider) · incoming suggestion with **"I'm in"**
4. `05-flow` — Rafa · voted in
5. `06-flow` — **Helen** (decider) · decision card + **vote tally** → Let's go / Not now
6. `07-flow` — **Now** · conditions + on-for-now + **surprise masking** (kept + teaser) + presence
7. `08-flow` — **Look back** · the day braided + "what we ended up doing"
8. `09-flow` — **Photos** · ambient stream with "FROM · <pick>" tags
