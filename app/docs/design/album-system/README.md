# Handoff: The Album System (Family Trips)

A three-chapter design system for the private family-trips PWA's photo album. One
data spine, four role-shaped **lenses** (Jonathan · Helen · Aurelia · Rafa). This
bundle covers three coupled features that read as one system:

1. **The album that organizes itself** — navigation, filters, tags, and "best photos."
2. **Finish the story** — retroactively settling any past day or trip.
3. **Photo moves** — the "moved because…" note + the "Move to…" hand.

---

## About the design files

The files in `prototypes/` are **design references authored in HTML/React (Babel-in-browser)**
— working prototypes that show intended look and behavior. **They are not production
code to copy.** Your task is to **recreate these designs in the target codebase's own
environment** (the real PWA — React/TS + its component library and CSS system), using
its established patterns. If a mechanic is ambiguous in prose, **run the prototype and
read the exact component** named in each spec — every interaction is live there.

`tokens.css` **is** meant to be adopted directly (or translated 1:1 into the codebase's
token format). The hex values are canonical.

## Fidelity: **High-fidelity.**

Final colors, typography, spacing, radii, copy, and interactions. Recreate pixel-faithfully
using the app's existing primitives (the prototype reuses the shipped `src/ft2/system.jsx`
spine — `Phone`, `Photo`, `Avatar`, `Ic` icons, `Mono`, `Scroll`). Match the four lenses exactly.

---

## Read these in order

| File | What it is |
|---|---|
| `tokens.css` | All design tokens — the four lens palettes, type, radii, spacing, recurring patterns. **Start here.** |
| `specs/01_album.md` | Chapter 1 full spec — the 8 answered questions, every screen/component/state. |
| `specs/02_finish_the_story.md` | Chapter 2 full spec — the doors, the past-day settle page, pooling, no-evidence, keep. |
| `specs/03_photo_moves.md` | Chapter 3 full spec — the moved-note, Move-to sheet, suggestion, letter. |
| `specs/copy_deck.md` | **Every machine-pick label + empty state + move reason, in all four voices.** Lift verbatim. |
| `prototypes/` | The runnable prototype. Open `The Album System.html`. |
| `screenshots/` | Rendered reference states, keyed to the specs. |

---

## The non-negotiable invariants (apply to ALL three chapters)

These are the product's spine. A correct implementation honors every one:

1. **Discoverable-or-invisible.** Every capability is either elegantly discoverable at the
   moment of need, or completely invisible. No janitor surfaces, no settings sprawl, no
   status noise. Keepsakes may invite, never summon. **It never nags.**
2. **Honest machine labels only.** A machine pick names *exactly what it judged* and never
   implies taste it doesn't have — the house string is **"auto-picked · clearest, closest
   shots."** Family can override any machine pick (keep/remove + 6s undo).
3. **The trust grammar (Ch3).** Every "moved because…" names a **human act** ("when you named
   Race Point"), never machine-speak. A hand-move **locks** the photo — authorship outranks
   the machine.
4. **Per-lens truth:**
   - **Helen** — photo-forward; the album is most hers; warm voice. **Hero lens — build first & deepest.**
   - **Jonathan** — drier voice; his "Record" surface stacks filters (person AND day AND place);
     his best default is *best period, incl. people-less landscapes*.
   - **Aurelia** — copy is **always lowercase**; Instrument Serif italic display; her authorship
     ("she picks the shot") is a feature. Her best cut is *her own shots, ranked*. Her private
     7-word mood vocabulary stays **hers** — it does not become a family tag concept.
   - **Rafa (4/5)** — **never meets rankings, judgments, damage states, notes, chips, or move
     controls.** His cut of anything is judgment-free "look at these!" warmth. In Ch2 & Ch3 he is
     **excluded by rule** (his contributions — stamps, voice notes — surface *inside a parent's*
     flow; his own lens shows his marks later as warmth).
5. **Surprise-masking is upstream.** Album reads are already filtered per-viewer; designs must
   never reveal counts or gaps that could leak a hidden surprise's existence. Never compute a
   "total" that isn't the viewer's masked total.
6. **Mid-trip reality.** Photos arrive continuously; face/quality scans are always partially
   complete. Empty/partial states must feel **alive, never broken or naggy** — no fractions,
   counts-as-progress, meters, red dots, or the word "unfinished."
7. **Consent seam (Ch1 Q7).** On-device smarts (face + clarity/exposure) are the baseline. The
   Claude-vision tier (light & composition) is an **optional upgrade behind Jonathan's explicit
   consent**; the design degrades gracefully to on-device labels when off. Never send photos off
   device without that opt-in.

---

## Design tokens

See `tokens.css` — it is complete and canonical. Summary:

- **Fonts:** Fraunces (display, Jonathan/Helen), Instrument Serif italic (Aurelia display),
  Fredoka (Rafa everything), Inter Tight (body), JetBrains Mono (eyebrows/labels/chips).
- **Radii (the strongest per-lens tell):** Jonathan `2px`, Aurelia `4px`, Helen `18px`, Rafa `24px`.
- **Accents:** Jonathan `#E0654F`, Helen `#2E7D52`, Aurelia `#FF3D78`, Rafa `#FFB12E`.
- **Identity dots:** Jonathan `#2E6BB8`, Helen `#2E7D52`, Aurelia `#E8478C`, Rafa `#E8552E`.
- Full page/surface/ink/line ramps per lens are in `tokens.css`.

## State management (cross-cutting)

Each photo already carries (or will carry) these synced facts — **no schema change** needed
for the album work; best-of scores + Ch3 move data ride existing per-photo metadata:

- `kind` (photo|video), `dur`, capture date + `dateSource` (exif|uploaded), `author` (identity),
  `caption`, place/day/trip structure, `faces[]` (per-device index), transient chip state.
- **Best-of (Ch1):** `clarity`/`exposure` (on-device) and optional `light`/`composition`
  (vision tier, only if enabled). Overrides live in a per-set `keptIds` / `removedIds` set.
- **Move data (Ch3):** `movedFrom` + human-readable labels snapshotted at decision time +
  `reasonCode` + `who` + `when` + `locked` (bool). Synced to every device so any device tells
  the same true story later.
- **Settle (Ch2):** per-day `keptBy` + `keptAt`; per-pin `name` + `excluded`; day `pooledWith[]`.

Per-lens theming is a single `lens` value on the app root (`data-lens`); everything else reads
tokens. Face index is **per-device by promise** ("nothing leaves the iPad") — enrollment state
is device-local, not synced.

## Assets

No raster assets ship in this bundle. Photos are rendered as **tinted gradient placeholders**
in the prototype (`Photo` component); wire real images in production. Icons are the app's
existing `Ic` set (inline SVG stroke icons — `pin`, `lock`, `check`, `share`, `x`, `right`,
`grid`, `bolt`, `search`, `mic`, `star`, etc.). Emoji appear only where the brand already uses
them (Rafa stickers, the Ch3 letter envelope). Fonts load from Google Fonts (see `tokens.css`).

## Screenshots (`screenshots/`)
Rendered reference states from the prototype (the phone frames are the deliverable; the surrounding
memo chrome is just the handoff shell).
- **Chapter 1:** `01-ch1` cover · `02-ch1` **Helen hero album** (top bar, day scrub + Find, quiet filter
  row, "Photos" + count + arrival line, the "AT ·" place section leading the day, grid with face dots) ·
  `03-ch1` best-of shelf · `04-ch1` smarts & consent seam · `05-ch1` **Jonathan "The Record"** (dark, stacking filters, landscapes).
- **Chapter 2:** `01-ch2` cover · `02-ch2` **the door** (keepsake home: invite card + softened day grid with
  gold-kept/loose-ring/quiet dots + backfill letter) · `03-ch2` the past-day settle view · `04-ch2` **the gold
  keep** ("Kept by Helen…" + "Keep its page in the book?") · `05-ch2` Aurelia's "pick the day's picture".
- **Chapter 3:** `01-ch3` cover · `02-ch3` **lightbox moved-note** ("Moved here when you named breakfast at the
  Brasserie") · `03-ch3` **Move-to sheet** (places vs named moments, "here now", unfiled) · `04-ch3` **locked
  state** ("Placed here by you — stays put") · `05-ch3` suggestion at rest ("Loose ends") · `06-ch3` the backfill letter.

## Files (in `prototypes/`)

- `The Album System.html` — entry point; loads React/Babel + the spine + all chapters.
- `src/ft2/system.jsx` — the shipped token/primitive/data spine (READ-ONLY reference; the real
  app already has this). Defines `TRAVELERS`, `FONTS`, `Phone`, `Photo`, `Avatar`, `Ic`, `Mono`, `Scroll`.
- `album/kit.jsx` — the design-memo shell (sidebar, `Section`, `QA`, `Stage`, `LiveDevice`, `Exhibit`). Handoff-only chrome.
- `album/data.jsx` — Ch1 sample photos, per-lens config (`LENS_CFG`), copy source (`PICK_COPY`, `EMPTY_COPY`), selectors.
- `album/album.jsx` — **Ch1 live album** (two-tier sticky nav, Find sheet, filter row, best shelf, lightbox).
- `album/lenses.jsx` — Ch1 per-lens deltas (Jonathan Record, Aurelia roll, Rafa strip).
- `album/forks.jsx` — Ch1 side-by-side forks (nav idiom, filter view/mode, best surface).
- `album/chapter1.jsx` — Ch1 rationale + assembly.
- `album/ch2-data.jsx`, `album/finish.jsx`, `album/chapter2.jsx` — **Ch2** data, live surfaces, assembly.
- `album/ch3-data.jsx`, `album/moves.jsx`, `album/chapter3.jsx` — **Ch3** data, live surfaces, assembly.
- `album/app.jsx` — chapter router + sidebar nav.

### Running the prototype
Serve the `prototypes/` folder over http (any static server) and open `The Album System.html`
— it needs http (not file://) for the Babel script imports. The left sidebar switches chapters;
lens switchers sit above each live device.
