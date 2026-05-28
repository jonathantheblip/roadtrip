# Trip Creation via Claude — Spec

## Purpose

Helen says "we're going to Asheville in October, four nights, I want
an art day" and gets a complete trip draft she can review, tweak, and
save. No manual stop entry, no scaffolding by Jonathan. This is the
"do what you do, from the app" promise delivered on the creation side.

## Where it lives

The trips-index Claude chat surface (not inside a trip). P1.3 already
gave this surface trip summaries for cross-trip questions. This spec
adds EXECUTE capability: Claude can emit a new card type — `create_trip`
— that drafts a full trip and presents it for confirmation.

## UX flow

### Helen's experience

1. Opens the app → trip list → taps the Claude chat.
2. Types: "Plan a long weekend in Asheville in October. Four nights.
   I want an art day and a hike."
3. Claude responds conversationally — acknowledges the request, may
   ask one clarifying question if the input is genuinely ambiguous
   (e.g., "October — any specific weekend, or wherever the best
   rates land?"). But it does NOT require answers to proceed.
   If Helen ignores the question and says "just do it," Claude
   builds with reasonable defaults.
4. Claude emits a `create_trip` card: a scrollable draft showing
   the trip title, dates, day-by-day structure with stops, drive
   times, descriptions, and a "Save trip" button.
5. Helen can:
   - Tap "Save trip" → trip is created in D1, appears in trip list
   - Tap individual stops to expand details
   - Tap "Skip" on any stop she doesn't want
   - Send a follow-up message: "swap the hike for a winery" →
     Claude emits an updated `create_trip` card
6. After saving, she's in the trip and can use the existing M2
   EXECUTE surface (move, add, cancel, multi) to refine.

### The hybrid contract

Claude builds a complete trip from whatever Helen gives it. The
minimum input is a destination. Everything else has a sensible
default:

| Input | Default if not provided |
|---|---|
| Destination | Required — Claude asks |
| Dates | "Next available weekend" or the month named |
| Duration | 3 nights for a weekend, 5 for "a week" |
| Travelers | Full family (Jonathan, Helen, Aurelia, Rafa) |
| Vibe / interests | Helen's taste profile: art, food, architecture |
| Budget | Mid-range (boutique hotel or quality Airbnb, not hostel, not Four Seasons) |
| Driving vs flying | Inferred from distance — <6 hrs = drive, >6 hrs = fly |

Claude may surface one question to improve the trip ("any specific
weekend?" or "hotel or rental house?") but must not block on the
answer. If Helen doesn't respond to the question and instead says
"go" or "just plan it," Claude proceeds with defaults.

The prompt instruction: "You may ask ONE clarifying question per
trip request. Offer it alongside your initial acknowledgment. If
the reader's next message doesn't answer it, proceed with the
default. Never ask a second question. Never refuse to build because
details are missing."

---

## Card shape: `create_trip`

Extends the existing card system (add, move, cancel, multi) with
a new type for trip scaffolding.

```json
{
  "type": "create_trip",
  "trip": {
    "title": "Asheville Long Weekend",
    "subtitle": "Art, mountains, and good food",
    "startCity": "Belmont, MA",
    "endCity": "Belmont, MA",
    "dateRangeStart": "2026-10-09",
    "dateRangeEnd": "2026-10-12",
    "travelers": ["Jonathan", "Helen", "Aurelia", "Rafa"],
    "days": [
      {
        "dayNumber": 1,
        "title": "Friday — Settle In",
        "date": "2026-10-09",
        "stops": [
          {
            "id": "ash-1-1",
            "time": "2:00 PM",
            "name": "Check in at The Foundry Hotel",
            "address": "51 S Market St, Asheville, NC 28801",
            "category": "LODGING",
            "description": "Boutique hotel in a converted warehouse. Walking distance to downtown galleries.",
            "who": ["Jonathan", "Helen", "Aurelia", "Rafa"],
            "driveFromPrevious": null
          },
          {
            "id": "ash-1-2",
            "time": "4:00 PM",
            "name": "River Arts District",
            "address": "Riverview Station, Asheville, NC",
            "category": "ACTIVITY",
            "description": "Open studios in converted industrial buildings along the French Broad. Helen: Odyssey Co-Op has ceramics worth the walk. Aurelia: several studios let you paint.",
            "who": ["Helen", "Aurelia"],
            "driveFromPrevious": "8 min"
          }
        ]
      }
    ]
  }
}
```

### Card rendering

The `create_trip` card renders as a scrollable trip preview:

- **Header:** Trip title, subtitle, dates, traveler dots
- **Day sections:** Collapsible, showing stops as compact rows
  (time, name, who-dots, drive time). Tappable to expand the
  full description.
- **Per-stop Skip:** Each stop has a Skip toggle — same pattern
  as the multi card's per-row skip. Skipped stops are excluded
  from the saved trip.
- **Bottom bar:** "Save trip" (primary) + dismiss (×)

Visual language matches the existing card system — sage/brass
on Helen's view, dark confirmation on save.

### What happens on Save

1. Generate a `tripId` (slug from title + date)
2. Write the Trip record to D1 via the existing worker POST
3. Write each non-skipped Day + Stop
4. Trigger a hero image fetch for the first stop with a photo
   source (existing heroStopId fallback handles this)
5. Navigate to the new trip's view
6. Trip appears in the trip list immediately

### What happens on follow-up refinement

If Helen sends "swap the hike for a winery" after seeing the card
but before saving, Claude emits a new `create_trip` card with the
updated trip. The old card is replaced (not stacked). Same
interaction pattern as the M2 cards — one card per turn.

---

## Prompt additions (worker system prompt)

Add to the trips-index system prompt (the no-active-trip branch):

```
## Trip creation

When the reader asks to plan, create, or start a new trip, build
a complete trip and emit a `create_trip` card.

Use everything you know about the family:
- Helen: vegetarian, art (Tworkov, Rothko, Twombly, Pollock,
  Packard), architecture, collected-not-curated aesthetic
- Aurelia: 13, volleyball, genuine aesthetic taste, interested
  in Rice University
- Rafa: almost 5, Godzilla, Spider-Verse, dinosaurs, cars,
  size/gravity comparisons
- Jonathan: cognitive neuroscientist, direct, efficient

Every stop names who it serves and what it gives them. A 13-year-old
and a 5-year-old want different things.

Build from the destination and the reader's stated interests. Fill
in what they don't specify with family defaults. You may ask ONE
clarifying question alongside your acknowledgment; if the next
message doesn't answer it, proceed with defaults. Never block on
missing details.

Drive times must be realistic. Stretches over 2.5 hours get a note.
Days must breathe — unscheduled time is not wasted time.

Food stops: Helen is vegetarian. Surface compatible menu items
without flagging or labeling the dietary constraint.

The card's `trip.days[].stops[]` array is the complete stop list.
Each stop needs: id, time, name, address, category (LODGING,
ACTIVITY, FOOD, LOGISTICS, TRANSIT), description (who it's for
and what it gives them), who (traveler array), driveFromPrevious.

Categories:
- LODGING: where they sleep
- ACTIVITY: the thing they're doing
- FOOD: restaurants, cafes, markets
- LOGISTICS: car rental, check-in, flights
- TRANSIT: driving segments worth naming (scenic routes, rest stops)

After the reader saves, the trip is real and editable via the
normal M2 surface (move, add, cancel, multi).
```

---

## Claude icon refresh

The current Claude chat icon is a low-resolution glowing dot.
Replace with a clean SVG of the Claude spark (✦). Render at
the chat surface entry point (the FAB or header icon) and as
the avatar next to Claude's messages in the chat thread.

**Spec:**
- Shape: the Anthropic Claude spark mark (✦) — a four-pointed
  star with slightly organic, rounded points
- Color: `var(--accent)` in each theme (sage on Helen's view,
  warm pink on Aurelia's, red/blue on Rafa's, dark on Jonathan's)
- Size: 24px at the message avatar, 20px in the chat header
- No glow, no animation, no blur. Clean vector, sharp at all
  sizes.
- Render as inline SVG (not an image load) so it's instant and
  theme-responsive

The SVG path for the Claude spark:

```svg
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 2C12 2 14.5 8.5 12 12C9.5 8.5 12 2 12 2Z" fill="currentColor"/>
  <path d="M12 22C12 22 9.5 15.5 12 12C14.5 15.5 12 22 12 22Z" fill="currentColor"/>
  <path d="M2 12C2 12 8.5 9.5 12 12C8.5 14.5 2 12 2 12Z" fill="currentColor"/>
  <path d="M22 12C22 12 15.5 14.5 12 12C15.5 9.5 22 12 22 12Z" fill="currentColor"/>
</svg>
```

If the actual Anthropic mark is available as a public SVG asset,
use that instead of the approximation above. The key properties:
clean, sharp, theme-colored, not a raster image.

---

## Scope boundaries

**In scope:**
- `create_trip` card type (prompt + render + save)
- Hybrid input flow (one optional question, never blocks)
- Claude icon replacement (SVG spark)
- Family context in the trips-index prompt
- Save writes Trip + Days + Stops to D1

**Out of scope:**
- Hero photo auto-fetch for new trips (future — Google Places
  pipeline already exists, just needs to run on new stops)
- Lodging booking links
- Flight search integration
- Budget tracking (M6)
- Sharing trip drafts with Helen before save (she's the one
  creating it)

**Dependencies:**
- P1.3 (trips-index Claude with summaries) — already shipped
- M2 card system (add/move/cancel/multi) — already shipped
- Worker POST endpoints for trips and stops — already exist

---

## Build order

1. **Claude icon SVG** — replace the glowing dot across all
   surfaces (chat FAB, chat header, message avatar). Quick win,
   ships independently.

2. **`create_trip` card renderer** — new card component that
   renders the trip preview with day sections, stop rows,
   per-stop skip, and Save button. Wire to the existing card
   system. Can test with hardcoded data before the prompt
   is live.

3. **Prompt update** — add the trip-creation instructions to
   the trips-index system prompt in the worker. Deploy worker.

4. **Save flow** — wire Save button to write Trip + Days + Stops
   to D1 via existing worker endpoints. Navigate to the new
   trip after save.

5. **Refinement loop** — handle follow-up messages that modify
   the draft before save (emit updated `create_trip` card,
   replace previous).

6. **Integration test** — end-to-end: open trips-index chat,
   request a trip, review card, skip a stop, save, verify trip
   appears in list and is editable.

Each step is independently testable. Steps 1-4 are the critical
path. Step 5 is the polish. Step 6 is the verification.
