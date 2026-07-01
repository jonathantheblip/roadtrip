# Roadtrip — Design Handoff (Hangout-First)

> A family-trips PWA that began as a road-trip tool but now almost always takes **stays** —
> a cabin, Grandma's, a beach house, a city weekend. This package hands Claude Code the
> design work from this engagement: a hangout-first home that keeps the simple trip
> dead-simple and gracefully scales up to a 3-city international trip, plus the four
> in-app fixes that retire driving-specific framing.

**Audience:** one family of four on phones — Jonathan (Dad/Ops), Helen (Mom/Keeper+Planner),
Aurelia (13), Rafa (~5, iPad-first). Often mid-trip, one-handed, flaky connection.

---

## The one idea
**Tight core, living heart.** The common simple trip is the lowest-friction path. Rarer
complex/international trips are *supported* but never become what the app is designed around.
Everything complex is a **module that mounts only on a real signal** (an explicit multi-part
trip, a flight, a timezone/currency delta) — so a 2-night weekend literally never renders it.

Three rules run through every spec here:
1. **Honest UI** — never show a time, label, or percentage the data doesn't truly back.
2. **Reconcile before replace** — no wired feature is deleted; things get *folded* or *scoped*.
3. **Read the trip, not a flag** — the home reshapes from the *shape of the content* (one place
   vs. many legs; on foot vs. a real drive), not a hidden internal toggle.

---

## What's in this package

| File | What it covers |
|---|---|
| `README.md` | This index + how to read it. |
| `tokens.css` | The full token system — 4 person skins (color/type/radius) + shared module tokens, as CSS custom properties. The source of visual truth. |
| `01-four-decisions.md` | The Map panel, "Getting there" (was "Leave when?"), honest "On the agenda" overflow, and the one-tap publish path. Problem → design → every state → copy → on-tap → flags. |
| `02-living-heart.md` | The home itself: anatomy, shape-awareness (stay / route / composite), phase (upcoming/during/after), data-fullness, "alive at empty," the At/In rule, and the locked "living heart" direction (incl. Idea A: the all-day Weave). |
| `03-scaling-the-home.md` | How the home scales to multi-city/international: the journey rail, orientation, **timezone honesty**, per-leg context (currency/language/weather), the leg-scoped live home, and **multi-leg flights**. |
| `04-copy-and-conditions.md` | The copy deck — the **nothing-day statement set**, microcopy catalog, the arrival moment — and the **location-adaptive conditions model** (tide only near an ocean, etc.). |
| `05-components-and-reconcile.md` | Component inventory + states, the **what-mounts-when gating matrix**, and the reconcile table (every feature, kept/scoped/enhanced) + new-screen flags. |
| `06-build-notes.md` | For implementation: data-model additions, the per-skin facelift guidance, honest-UI/timezone rules, and what to wire vs. what the prototypes fake. |
| `skins.html` | **Working** — the new living-heart home rendered in Jonathan / Helen / Aurelia skins (the facelift), + the Rafa note. |
| `skin-home.jsx` | The theme-aware home component behind `skins.html`. |

## Working prototypes (at project root)
These are live HTML, Helen's lens, on a pannable canvas. They are the visual spec.
- **`Roadtrip — Hangout-First Redesign.html`** — the four decisions, state by state (maps to `01`).
- **`Roadtrip — Scaling the Home.html`** — one home, weekend → 3-city Italy (maps to `02`+`03`).
- **`skins.html`** (in this folder) — the per-person facelift.

Existing prototype to preserve/extend: **`hangout/The Hangout - Live.html`** (the interactive
generalized model — trip types, walk/drive/transit, soft-vote, masking). The new home supersedes
its "Now" tab; the WE COULD / NOW / PHOTOS / LOOK BACK shell carries over unchanged.

## How to read this
Start with `02-living-heart.md` (the home is the center of gravity), then `03` (how it scales),
then `01` (the four point fixes that live on/around it). `tokens.css` + `05` are the
implementation contract. `06` is the build checklist.

_Visual system is intentional: warm/cool per-person palettes, Fraunces/Instrument/Fredoka
display + Inter Tight body + JetBrains Mono labels, per-person radius. Striped/tinted blocks in
the prototypes are **photo placeholders** — real imagery is the user's own._
