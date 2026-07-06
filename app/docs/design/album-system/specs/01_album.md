# Chapter 1 — The album that organizes itself

Navigation, filters, tags, and "best photos." **Hero lens: Helen** (build first & deepest).
Live components: `album/album.jsx` (`AlbumApp`), `album/lenses.jsx`, `album/forks.jsx`.
All copy strings: `specs/copy_deck.md`. All colors/type/radii: `tokens.css`.

> This chapter answers 8 questions. Each has a **decision** (build this) and, where there was a
> real fork, the **alternatives shown** in the prototype's fork row (`album/forks.jsx`) so you can
> see why. Build the decision; the forks are rationale, not deliverables.

---

## Screen A — Per-trip Album (`AlbumApp`, Helen hero)

A vertical, window-scrolled page inside the phone. Top→bottom:

### A1 · Fixed top bar — height `52px` (`var(--topbar-h)`)
- Left: trip title, `--font-fraunces` 15px/600, `--ink`. (e.g. "Rafa's 5th · Photos")
- Right: **search** magnifier (`Ic.search`, 20px, `--muted`) → expands to a caption-search field.
  Search is a **filter, not a nav idiom** (see Q1). On **Rafa** only, search is a **mic** (voice):
  tap → "Listening…" state; never a text field.
- Background `--bg`, hairline bottom `1px var(--line)`.

### A2 · Nav tier 1 — sticky, height `40px` (`var(--daychips-h)`), sits directly under top bar
The primary nav idiom (Q1). A horizontally-scrollable row:
- **"Find" button** (left, pinned): `Ic.search`/list glyph + label. Opens **Screen B (Find sheet)**.
- **Day scrub chips**: `FRI` `SAT` `SUN`, `--font-mono` 10px, ls 1.4. Scroll-spy: the day whose
  section spans the top is active → `--accent` ink + 2px underline; others `--faint`. Tap → smooth
  scroll that day's first section to just under this strip.
- **Safari sticky trap:** this strip is sticky AND horizontally scrollable → use the **two-wrapper
  split** (outer sticky wrapper, inner scroll wrapper) or edge taps get swallowed. (Shipped precedent: DayChips.)
- z-index above section headers; background `--bg` (opaque, so content doesn't bleed through).

### A3 · Filter row — quiet, below nav tier 1 (not a toolbar)
Three quiet affordances, styled as **mono text chips** (matches Aurelia's shipped mood-chip idiom),
NOT boxed buttons — so the calm album never reads as a control panel:
- **Kind** — segmented `ALL · PHOTOS · VIDEOS` (`--font-mono` ~9.5px). Active segment: `--accent`.
- **With ⟨person⟩** — label + face **dots** (`--dot` per person, 14px). Tap → person picker.
- **✧ Best** — toggle. Off = `--muted`; On = `--accent` fill/underline + reveals the **Best shelf** (A5).
- When any filter is active, a **clear-all ✕ chip** appears at the row's end; the **count line** (A4) rewrites.
- Day & Place are **deliberately NOT here** — the nav (chips + Find sheet) owns them; avoids redundancy (Q3).

### A4 · Header block (scrolls away)
- Serif title "Photos" — `--font-display`-ish, 22px/600, ls -0.4 (Aurelia: lowercase "photos", italic).
- **Count line** — `--font-mono` 10px `--muted`: **"45 photos across 6 stops"**. Updates live under filters
  (e.g. "12 photos with Rafa across 3 stops"). **Never** a total that leaks surprise-masked items.
- **Ambient arrival line** (Q8, continuous arrival) — soft, no nagging badge: Helen "A few new since this
  morning." / Jonathan "3 added since 09:00." / aurelia "couple new ones." / Rafa "New pictures! ✨"

### A5 · Best shelf (visible only when ✧ Best is on) — Q5/Q6
- **Honest label** (names what the machine judged; per lens + tier — full strings in copy deck):
  - on-device: Helen "Auto-picked — the clearest, closest shots of you" · Jonathan "Auto-picked —
    sharpest frames, people or not" · aurelia "auto-picked — your sharpest ones"
  - vision tier (only if enabled): "…best light & composition…"
- **Per-lens default source** (one control, different default):
  - Helen / Aurelia → **featuring them** (face + quality). Aurelia's special cut = **her own shots, ranked**.
  - Jonathan → **best of the trip, incl. people-less landscapes.**
  - A small sub-switch **"featuring you / the whole trip"** lets any lens flip source.
- **Layout:** horizontal strip of ~8 tiles below the label; the normal album continues under a hairline
  "— the rest of the trip, in order —". The album is NEVER hidden (calm). 
- **Override (communal taste):** each shelf tile has a quiet **✕ "not this one"**; the album offers
  **"＋ add one"** to promote a missed shot. Both keep/remove are **undoable (6s)** — mirrors the face
  "Not this person" ✕. Overrides sync (family taste, not per-device).
- **Consent seam (Q7):** if the viewer wants more than clarity, one quiet one-time invite appears here
  (adults / Jonathan only): "Want sharper picks? …Photos would go to Claude to score, then come back —
  off unless you turn it on." Off / shadow / on. When off, composition claims simply never appear (no gap, no nag).

### A6 · Sections (the album body)
Ordered **day by day**. Within a day: an optional **place section leads**, then **timed event sections**.

**Place section** (the day's ambient "home base" — e.g. "At the cabin"; deliberately leads the day, Q2):
- Eyebrow: `AT · FRI MAY 1` — `--font-mono` 9.5px, **quieter** than events, `--accent` or `--faint`.
- Title: base place, `--font-display` 20px/600 (e.g. "40 E 38th St — the Airbnb"). Softer treatment
  (no time chip; it's ambient).

**Timed event section:**
- Eyebrow: `FRI MAY 1 · 3:15 PM` — `--font-mono` 9.5px, `--accent`. Crisper than the place section.
- Title: event name, `--font-display` 20px/600 (e.g. "School pickup → the road").

**Sticky section header (tier 2, Q2):** pins directly under nav tier 1 (`top: var(--daychips-h)`).
When pinned it **compresses** to a single line: small serif title + `· mono time ·` + **count**.
Face **dots** appear on the pinned header **only when a "With X" filter is active** (otherwise noise).
Place-section pinned header keeps its quieter "AT ·" italic styling; timed events are crisper.

**Photo grid:** CSS grid `repeat(auto-fill, minmax(100px, 1fr))`, `gap: 6px` (≈3 cols at phone width;
~140px+ on real devices). Tiles use `.photo-tile` (radius `max(3px, var(--radius) - 8px)`).
- **Honest chips** bottom-right (`.tile-chip`) — TRANSIENT only: video duration, "on its way", "stuck",
  "no sound". **Suppressed entirely on Rafa.**
- **Face dots** per tile when relevant (shipped precedent) — small `--dot` dots bottom-left.
- **Best ✧** — a subtle corner mark on tiles that are in the best set.

**Unfiled / In transit** — photos matching no stop sit at the very bottom under a quiet "In transit" /
"Unfiled" header (a separate upstream fix re-anchors these into their days chronologically).

### A7 · Filtering behavior (Q3) — **thin in place, do NOT switch surfaces**
Active filter thins the grid **with headers intact**:
- Sections that empty out collapse to a one-line ghost — "— nothing from ⟨place⟩ —" (`--faint`), OR vanish.
- Day scrub chips with zero matches **dim** (not removed — the spine must not jump).
- The count line rewrites; clear-all ✕ appears.
- This is a **mode on the same surface**, never a separate results screen (keeps the album's spine + context).

---

## Screen B — Find sheet (the index) — Q1 secondary idiom
Bottom sheet (`.sheet`). The precise jump-to affordance behind "Find" (A2). **Tabs, in this order:**
- **Events** (DEFAULT — location-forward): each named moment/event, `--font-fraunces` 15.5px, with a
  `--font-mono` sub "DAY · PLACE" (e.g. "Grand Brasserie / SAT · Grand Central"). Leads because the user
  thinks in events+places, not abstract days.
- **Places** — each place once (**deduped** — never list "Murray Hill" twice), pin glyph.
- **Days** — FRI / SAT / SUN.
Tap any row → dismiss sheet, smooth-scroll target under the sticky strip. Current section marked.
On **Rafa**: this whole surface simplifies to warm voice ("Find something!") — no tabbed index.

---

## Screen C — Lightbox
Full overlay over the album. (Also the mount point for Ch3's moved-note + Move-to — see spec 03.)
- **Top row:** counter "3 / 45" (`--font-mono`), share (`Ic.share`), **delete (author-only)**, close.
- **Photo:** centered, max-width ~320, radius 6–10.
- **Footer** (on dark scrim, white ink): author+date "HELEN · MAY 2 AT 9:34 AM" (`--font-mono` 9.5px);
  place line(s) with `Ic.pin`; caption (tap to edit, author-only); **"Edit date"** chip (dev/author).
- **Navigation:** swipe between siblings (prototype: prev/next + keyboard ←/→).

---

## Empty & partial states (Q8) — alive, inviting, never a task list
Render these as warm cards in the relevant filtered region. Full four-voice copy in the deck; keys:
- **No faces enrolled on this device** → invites enrollment ("Teach it your family — a couple each is
  plenty. Nothing leaves this iPad."). This is also the **per-device face seam** (Q7): embrace it —
  "This iPad knows your family. Teach your phone too →" (Helen). Never hidden, never a nag.
- **No scores yet** (scan partial) → "Still looking through today's photos for the clearest ones…"
- **Zero videos this trip** → "No videos this trip — all stills." (honest, done, calm)
- **Zero filter matches** → "Nothing matches that here — try fewer filters."
- All above have Jonathan-drier / aurelia-lowercase / Rafa-warm variants. **Rafa never sees "no scores"
  (he has no rankings)** — his empties are pure warmth ("More coming! Take some pictures!").

---

## Q4 — Do human tags exist? **Decision: NO. Structure IS the tags.**
No freeform/vocab human-tag concept is added (it would be a janitor surface). The filterable facts —
**place · day · person (face) · kind · caption search** — already form a rich, chore-free tag system.
**Aurelia's private 7-word mood vocabulary ('quiet','chaos','beautiful','overstimulated','finally',
'worth it','one more time') stays HERS** — a private lens on her own roll, never graduated to a family
concept, never imposed on others.

---

## Per-lens deltas (`album/lenses.jsx`)
- **Jonathan — "The Record":** dark editorial (`data-lens="jonathan"`, radius 2). Filters **STACK**
  (person AND day AND place simultaneously) — his shipped idiom — instead of Helen's single quiet row.
  Best default = **best of the trip, incl. landscapes**; drier labels. Chips shown.
- **Aurelia — "the roll":** dark film-roll (radius 4, Instrument Serif italic, lowercase copy). Best =
  **her shots, ranked** (her eye). Mood chips remain, private. Face dots in `--dot` pink.
- **Rafa — "My pictures":** bright chunky (radius 24, Fredoka). **NO filters, NO best label, NO scores,
  NO chips.** A warm big-tile strip titled **"Look what you did!"** (never "best"), video-forward. Pure
  "look at these!" warmth.

## The three forks shown (rationale — `album/forks.jsx`)
1. **Nav idiom (Q1):** DayChips-only · Index-sheet-only · **Hybrid (recommended → built):** Find (events&places) leads, day scrub assists.
2. **Filter: view vs mode (Q3):** **Thin-in-place (recommended → built)** · Results surface.
3. **Best-of surface (Q5):** **Shelf (recommended → built)** · Filter-only · Reel.
