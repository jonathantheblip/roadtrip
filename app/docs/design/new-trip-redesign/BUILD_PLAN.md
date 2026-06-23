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

### STATUS 2026-06-23 — all SHIPPED + LIVE; HEAD `1b8f97d` (verify against git)

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

### ⏭ REMAINING (each its own build → gate → walk → push)
- **Real timed city days** — a `city` part renders a loose day-by-day (one anchor + open space). Deterministic.
- **Rafa "Ask for a trip"** — the candy proposer (reuses propose→decide pattern); a trip-WISH is NOT
  tripId-scoped, so it needs a small new channel = **D1 migration 017** (a gate Jonathan applies).
- **Surprises by sentence** — scope a part as a surprise via intake, through the EXISTING surprises
  boundary + `/cover`; author confirms the cover pre-publish; red-team leak paths (counts, weather re-rank).
- **Parts shown in the trip view/editor after save** — today parts render only in the create review;
  a saved multi-part trip falls back to the legacy day list. (Foundational for the city-days view.)
- Polish: the bespoke manual "bigger trip" parts builder; auto-send from the front-door seed.

## Shipping rule (carried)
Each increment: build → full gate (worker tests · client unit · full e2e both engines · build) →
adversarial review for high-stakes → live walk → Jonathan's push-go → watch deploy(s) green → smoke.
Never break viewing/editing existing trips (G5) — re-verify the legacy render every increment.
⚠ Don't hammer prod /claude/chat to live-verify AI (rapid calls throttle it to empty 200s) — ONE clean call.
