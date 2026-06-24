# New-trip redesign — Phase 1 build plan

> Approved 2026-06-23: direction + beauty bar locked (see SPEC.md + the four-lens mockup).
> Build beautiful-and-in-step, in small WALKABLE increments. Each increment: build → full
> gate (worker tests · client unit · full e2e both engines · build) → adversarial review →
> live walk → bring to Jonathan for the push-go (push = deploy) → watch green → smoke.
> Jonathan is not a coder — gates come to him in plain language.

## The big de-risk
`trip.parts[]` rides inside the trip's existing `data_json` blob (the worker stores trips as
JSON). **No D1 migration.** The screenshot-vision step is the only NEW worker endpoint (a
worker deploy gate, not a migration). So Phase 1 is mostly client work on proven seams.

## What's reused (not rebuilt)
Streaming Claude chat + tools (`/claude/chat`, `compute_drive_time`, `find_places`), trip
drafting (`/draft`), voice (`/transcribe`), surprise masking boundary (`worker/src/surprises.js`)
+ cover drafting (`/cover`), the draft-on-device + worker draft-hide we just shipped, the
per-lens skins, the propose→decide loop (for Rafa).

## Increments

### STATUS 2026-06-24 — PHASE 1 COMPLETE, all SHIPPED + LIVE; HEAD `e063db0` (verify against git)

> The whole Phase-1 queue shipped 2026-06-23/24 (verify each SHA in `git log`):
> increments 1–4 (`74965e1`/`8676e59`/`f507ee1`/`1b8f97d`), real timed city days +
> parts-after-save (`4890d2f`), the manual composite builder + auto-send the seed
> (`b1089d8`), and surprises by sentence — Slice 1 worker masking boundary (`ab9c8de`)
> + Slice 2 authoring (`fd94ee0`) — all prod-deployed green. Plus the dark-contrast
> sweep + the unmappable-name warning (`e063db0`). DEFERRED: Rafa's "Ask for a trip"
> (needs D1 mig 017). Detail/red-team history: memory `new-trip-redesign`.


**✅ 1 — Parts foundation** (`74965e1`). `lib/tripParts.js`: `getParts`/`deriveTripShape`/`partCount`;
every legacy trip derives to ONE part, zero visible change. 8 unit tests.

**✅ 2 — Shape-first front door** (`74965e1`). `views/NewTripStart.jsx` "What kind of trip?" — leads
with the concierge ("Tell me about the trip"), 5 shapes as the escape; `NewTrip` preset by shape +
writes a part; App `newform` view + P0b guards extended.

**✅ 2b — Front-door seed** (`8676e59`). Typing in the front-door box → opens the planner with the
composer PREFILLED (`ClaudeChat` `seedMessage`, additive/guarded). Common-case prefill (no auto-send).

**✅ 3 — Claude emits multi-part trips** (`f507ee1`). Worker create_trip prompt emits an optional
`parts[]` for 2+-leg trips (conditional, additive); `cardToTrip` carries+validates them; the create
review renders a "The parts" timeline. LIVE-VERIFIED via the screenshot check.

**✅ 4 — Screenshot intake / vision** (`1b8f97d`). Worker `buildChatUserContent` → Claude vision blocks
(bounded; Sonnet-4.6); `ChatComposer` attach control → base64 → `streamClaudeChat({images})`. LIVE-VERIFIED
(Claude read a synthetic booking image → Rome/Tuscany + parts). v1 attaches in the chat composer.

### ✅ SHIPPED (2026-06-24) — the rest of the Phase-1 queue
- **✅ Real timed city days + parts-after-save** (`4890d2f`) — a saved composite renders `views/PartsTripView.jsx`
  (jonathan/helen/aurelia; rafa keeps storybook); `lib/tripParts.partsWithDays` derives each part's days by date
  (clamped windows; empty days = loose "open space"); editor "The parts" section. Legacy byte-identical (G5).
- **✅ Manual "bigger trip" builder + auto-send the seed** (`b1089d8`) — `views/NewTripComposite.jsx` (hand-built
  parts, dates auto-derive) + the front-door seed now AUTO-SENDS (`ClaudeChat` effect, configured-only, prefill fallback).
- **✅ Surprises by sentence** — Slice 1 worker masking boundary for parts (`ab9c8de`, DORMANT) + Slice 2 authoring
  (`fd94ee0`, ACTIVATES it): Claude suggests `part.surprise`, author confirms audience + cover (`/cover`) in the create
  review; author always from session, teaser-safe default, fail-closed. 3 independent red-team passes. `partDayOwner`
  = one shared server↔client day-ownership (the part + its days are ONE secret). NO migration.
- **✅ a11y/UX follow-ups** (`e063db0`) — NewTrip/TripEditor dark-contrast sweep (`*`+error → `--accent-text`);
  the surprise review warns on an unmappable name.

### ⏭ REMAINING
- **Rafa "Ask for a trip"** — DEFERRED (the candy proposer; reuses propose→decide; a trip-WISH is NOT tripId-scoped →
  needs **D1 migration 017**, a gate Jonathan applies via the CF dashboard). NOT the planner form.
- **Follow-ups (low, own pass):** the stale-weave-serving class (stored/kept weaves served unmasked, never invalidated
  when a part becomes secret — affects ALL surprise types, matters once memories/weaves exist); a `share-moment.spec.js:93`
  webkit-mobile flake (passes 3/3 isolated). Possible niceties: per-person surprise-audience editing; a richer composite editor.

## Shipping rule (carried)
Each increment: build → full gate (worker tests · client unit · full e2e both engines · build) →
adversarial review for high-stakes → live walk → Jonathan's push-go → watch deploy(s) green → smoke.
Never break viewing/editing existing trips (G5) — re-verify the legacy render every increment.
⚠ Don't hammer prod /claude/chat to live-verify AI (rapid calls throttle it to empty 200s) — ONE clean call.
