# Handoff: "Where's my family?" — Rafa lens (age 5)

## Overview
The kid version of the shipped **"Who's around"** feature in Roadtrip (family-trips PWA). It lets Rafa — who can't read much — see at a glance **where each family member is right now** and feel the delight of "Mama's at the special house, Papa's out exploring."

Instead of the older lenses' tidy presence band (avatar + live/idle dot + "Helen · at the cabin"), Rafa gets a **living storybook diorama**: the family appear as big bobbing **character bubbles** in one of exactly **two coarse zones** — the **Special house** 🏠 and **Out & about** 🧭. Faces, color, and motion carry the meaning; reading is near-zero.

This is **purely a presentation layer**. Privacy is already handled upstream: kids only ever receive coarse location, never a precise dot. There is nothing precise to draw, and nothing precise should ever be drawn.

## About the Design Files
The files in this bundle are **design references created in HTML/React-via-Babel** — prototypes showing the intended look and behavior. They are **not production code to copy verbatim**. The task is to **recreate this design inside Roadtrip's existing codebase**, using its established components, presence data layer, and patterns (the same data feed that powers the older lenses' "Who's around" band). If a feature framework already exists for the other three lenses, build the Rafa lens as a sibling view on that same data.

The HTML mock uses inline styles and a `shade()` helper because it's a standalone prototype; in the real app, prefer the tokens in `tokens.css` mapped onto Roadtrip's theme system.

## Fidelity
**High-fidelity.** Final colors, typography (Fredoka), spacing, motion, and copy are all intentional and specified below. Recreate pixel-faithfully using the codebase's libraries. The candy "stacked" shadows (solid color offset, zero blur), the bob/glow/heartbeat motion, and the two-zone diorama composition are the soul of the feature — do **not** substitute a flat list, Material cards, or generic avatars.

---

## Screens / Views

### 1. Phone home — "Where's everybody?" (primary deliverable)
**Purpose:** Rafa opens his app and instantly sees who's home and who's out, then can tap any face for a bigger, warmer look + a wave.

**Layout** (phone frame 375 × 812, internal vertical scroll):
1. **Greeting row** — `padding: 16px 20px 0`, space-between. Left: "Hi Rafa! ★" (Fredoka 700, 26px, ★ in `--rafa-sticker-0`). Right: a 46×46 circular "you" button (bg `--id-rafa`, candy shadow `0 4px 0 shade(--id-rafa,-50)`, "R" in white Fredoka 700/22).
2. **Feature heading** — `padding: 18px 20px 10px`. Title "Where's everybody? 👀" (Fredoka 700, 27px). Subline: an animated green `--rafa-good` pip (11px, glow + 1.4s blink) + "N here right now · tap a face!" (Fredoka 600, 15px, `--rafa-muted`).
3. **The diorama scene** — `padding: 0 16px`. See component below. This is the hero.
4. **Context card** — `padding: 20px 16px 0`. A candy amber card (radial gradient on `--rafa-accent`, shadow `0 7px 0 shade(accent,-52)`, radius 26): 52px rounded tile with 🚛 + "Monster trucks!" (Fredoka 700, 21px) + "in 2 sleeps 💥". This is intentional **real-home context** so the feature doesn't feel like an isolated feature page — keep something like it, but it's the app's existing home content, not part of this feature per se.
5. **Bottom nav** — flex, centered, `gap: 26px`, top border `2px solid --rafa-line`. Four items (emoji 22px + Fredoka 600/11 label): **👀 Family** (active, label in `--rafa-accent-text`), 🗺️ Map, 🎬 Movies, 🎁 Surprises (inactive at 0.5 opacity). Active tab corresponds to this feature.

### 2. Tap reveal (modal over the scene)
**Purpose:** a giant, warm, low-reading detail when Rafa taps a face — and one pure-delight action.

**Layout:** full-bleed scrim `rgba(20,12,5,0.74)`, centered sheet max-width 320, `--rafa-surface` bg, radius 36, padding `30px 26px 28px`, candy shadow `0 16px 0 var(--rafa-bg2)`, "pop" entrance. Contents, centered:
- **Hero bubble** 120px (same bubble component, with its live/idle treatment).
- **Name** — `displayName(id,'rafa')` → Rafa's family nicknames: **Mama / Papa / Sissy** (Fredoka 700, 34px). His own bubble shows "me".
- **Place pill** — `--rafa-bg2`, radius 999, big emoji (🏠 special house / 🧭 out) + "at the special house" or "out & about" (Fredoka 700, 20px). For Rafa himself: "that's you!".
- **State line** — live: green `--rafa-good` blinking pip + "here right now!"; idle: 💤 + "back in a little bit" (`--rafa-muted`).
- **Wave action** (only for others) — full-width button, radius 26, bg `--rafa-sticker-1` (#3DA5E0), candy shadow `0 7px 0 shade(#3DA5E0,-45)`, 👋 (bobbing) + "Wave hi!" (Fredoka 700, 22px white). On tap → bg flips to `--rafa-good`, 💛 + "Wave sent to Mama!". (No new data leaves the device implied — it's a presence ping, wire to whatever the app uses.)
- Close: 46×46 circle top-right, `--rafa-bg2`, ✕.

### 3. Family character bubble (the atom — used everywhere)
A `<button>`, vertical flex. The bubble itself:
- Circle sized `size` px. Fill = `radial-gradient(120% 120% at 50% 28%, shade(idColor,+30), shade(idColor,-22))`. Candy drop shadow `0 {size*0.1}px 0 shade(idColor,-48)`. Initial letter centered (Fredoka 700, `size*0.42`, white).
- **Buddy sticker badge** bottom-right: white circle (`size*0.42`) with the person's constant buddy emoji (Mama 🌿 / Papa 🧭 / Sissy 🎞️ / Rafa 🚛).
- **Live-right-now:** whole bubble **bobs** (`ftBob`, ~1.8s, staggered per index), a colored **glow ring** pings outward (`ftPing` 2.2s: `box-shadow: 0 0 0 4px idColor, 0 0 22px idColor`), 3px solid white border, and a **green heartbeat pip** (`--rafa-good`) top-right.
- **Last-seen-a-while-ago:** no motion, `opacity: 0.7`, `filter: saturate(0.6)`, thin translucent border, and a **💤** top-left. No clock, no timestamp — "a while ago" is a feeling, not a number.

### 4. Diorama scene
Frame: radius 30, overflow hidden, sky→grass gradient `linear-gradient(#bfe3f2 0%, #d8eecf 58%, #cfe6c0 58%, #b9dca6 100%)`, candy shadow `0 9px 0 shade(accent,-55)` + inset white. Decor: ☀️ (glowing, bobbing), ☁️×2, 🌼/🌷 ground tufts, and a dashed white **center divider** splitting the two zones. Two equal `Zone` columns:
- **Left = Special house:** white pill label "🏠 Special house", big back landmark 🏡, people standing on the ground.
- **Right = Out & about:** pill label "🧭 Out & about", back landmark ⛰️.
- Each zone's people render as bubbles (62px on phone) bottom-aligned "on the ground", live ones bobbing on a stagger.

---

## Interactions & Behavior
- **Tap a face** (anywhere — scene or iPad map) → opens the reveal modal for that person. Tap scrim or ✕ to close.
- **Wave** → optimistic state flip (button → green "Wave sent"), disabled after. Wire the actual ping to the app's existing nudge/presence channel; it is delight, not new data.
- **Motion** (all gated behind `@media (prefers-reduced-motion: no-preference)` — reduced-motion shows the settled state):
  - `ftBob`: translateY 0 → -7px → 0, ease-in-out, ~1.8–5s, infinite. Bubbles staggered by `index*0.25s`.
  - `ftPing`: scale 0.9→1.5, opacity 0.6→0, 2.2s ease-out infinite (live glow ring).
  - `ftBlink`: opacity 1→0.25→1, 1.4s infinite (the "now" pips).
  - Reveal sheet: "pop" entrance (scale/opacity, ~320ms).
- **Entrance:** sections use a staggered `Reveal` (up/scale, ~520ms) on mount.
- No hover states needed (touch-first), but keep ≥44px hit targets and visible press feedback on the candy buttons.

## State Management
- `pick` — which person id the reveal is open for (`null` = closed).
- `waved` — per-reveal optimistic flag for the wave button.
- **Presence data** per person (the only inputs, all coarse): `{ place: 'cabin' | 'out', live: boolean, isMe?: boolean }`. In the mock this is `RW_FAMILY` in `rafa-whosaround.jsx`; in production it comes from the same presence feed as the other lenses — map the older lenses' richer string ("at the cabin", "bakery run") down to the two coarse zones. **Never** pass through a precise coordinate, timestamp, or sub-place to this lens.
- Static identity (color, initial, buddy emoji, nickname) is global and shared across all lenses.

## Design Tokens
See **`tokens.css`** for the complete, exact set (palette, per-person identity colors, sticker palette, fonts, radii, the candy-shadow formulas, and the `shade()` helper). Key values:
- Palette: bg `#1B1108`, surface `#33200F`, ink `#FFF3DF`, accent `#FFB12E`, good/heartbeat `#4CC36E`, wave-blue `#3DA5E0`.
- Identity: Mama `#2E7D52` 🌿, Papa `#2E6BB8` 🧭, Sissy `#E8478C` 🎞️, Rafa `#E8552E` 🚛.
- Type: **Fredoka** (Google Fonts, weights 400/500/600/700) for everything; JetBrains Mono only for tiny dev labels.
- Radii: bubbles 50%, scene 30, cards 26, sheet 36, pills 999.
- Shadows: candy "stacked" — solid color offset, **zero blur**, derived via `shade(base,-N)`.

## Assets
- **No bitmap assets.** All characters/landmarks are **emoji** (☀️ ☁️ 🏡 ⛰️ 🌼 🌷 + buddies 🌿 🧭 🎞️ 🚛 + 💤 👋 💛). In production, decide whether to keep system emoji or commission matching illustrated sprites — if illustrated, keep the bob/glow/heartbeat treatment identical.
- **Fonts:** Fredoka + JetBrains Mono via Google Fonts (see `injectFonts()` in `system.jsx`).
- **Identity colors/buddies** must match the shared family system already in the app.

## iPad — Adventure Map placement (see screenshot 01, right panel)
Rafa's iPad world is a storybook **Adventure Map** (`src/ft2/rafa-map.jsx`) — the trip's stops as landmarks on a winding road with a vehicle that drives along. "Where's my family?" lives here as an **additive layer, not a new screen**: the *same* family bubbles are **parked as characters on the map** — Mama & Rafa at the Special-house landmark, Papa out near a stop, Sissy resting (💤) further down the road. Live ones bob/glow; tapping opens the **same reveal modal**. Still **no precise dot** — placement is by coarse zone only (snap to the relevant landmark/region), conveying *who's home vs. who's out* in the map's own visual language. Reuse the map's existing road/landmark system; do not introduce real-coordinate pins. `RWMapFamily` in the mock is an illustration of this idea.

## Files
- `Family Trips - Rafa Whos Around.html` — the runnable mock (phone home + iPad panel). Open in a browser.
- `src/ft2/rafa-whosaround.jsx` — **the feature**: `RWBubble`, `RWScene`, `RWReveal`, `RWHome`, `RWMapFamily`, and the `RW_FAMILY` / `RW_BUDDY` data.
- `src/ft2/system.jsx` — shared spine: `TRAVELERS` (identity colors/initials), `FONTS`, `shade()`, `displayName()`, `Phone`, `Reveal`, `Mounted`, `Scroll`, `Ic`. Reference for tokens + nickname logic.
- `src/ft2/rafa.jsx` — the rest of Rafa's lens, for visual-vocabulary reference (candy buttons, scale, tone).
- `tokens.css` — canonical design tokens.
- `screenshots/01-overview.png` — phone home + iPad map side by side.
- `screenshots/02-tap-reveal.png` — the tap reveal open on Papa.
