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

**1 — Parts foundation (client, structural; INVISIBLE, non-breaking).**
New `lib/tripParts.js`: `getParts(trip)` (returns `trip.parts` if present, else derives ONE
synthetic part wrapping the legacy trip) + `deriveTripShape` (generalizes `inferTripShape`).
Every existing trip becomes a one-part trip with ZERO visible change. Gate: unit tests + full
e2e shows no regression. Ships bundled with #2 (nothing to see alone).

**2 — The concierge front door (client; reuses `/claude/chat` + `/draft`). FIRST VISIBLE.**
The new "New trip" = a compose surface in the creator's skin: talk/type, with the five-shape
picker one tap away as the escape. Claude drafts a `parts[]` trip → the assembled timeline →
per-part review (editable, sourced guesses, dates optional) → save a real trip. A simple stay
or road trip comes out as a one-part trip that renders exactly like today. NewTrip's current
manual form becomes the shape-picker escape (kept, not thrown away). Push = client deploy.

**3 — Screenshots → parts (worker: new vision intake endpoint + client).**
Drop a flight conf / Airbnb / itinerary screenshot → Claude reads it into parts. New worker
endpoint (Claude vision, reuses the Anthropic seam + key). Worker + client deploy gate.

**4 — Surprises by sentence (client; reuses the surprises boundary + `/cover`).**
"…and the last two days are a surprise for Helen" → the part is written `visibility`-scoped
through the SAME server masking boundary; the author confirms the cover the family will see
before publish. Red-team the leak paths (counts, weather re-rank, save-back) as before.

**5 — Real timed city days (client).** A `city` part renders a loose day-by-day (one anchor +
open space, per the family-pacing research). May split to its own pass.

**6 — Rafa "Ask for a trip" (client; reuses propose→decide).** The candy proposer replaces the
planner form in Rafa's lens; sends a delight-only proposal to the deciders.

## Order & shipping
Build 1+2 together (first walkable, first push). Then 3, 4, 5, 6 each as its own
build→gate→walk→push. Hold any genuinely risky step for Jonathan. Never break viewing/editing
existing trips (G5) — re-verify the legacy render every increment.
