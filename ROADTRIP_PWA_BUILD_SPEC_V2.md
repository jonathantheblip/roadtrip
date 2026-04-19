# Roadtrip PWA — Build Spec v2

**Author:** Jonathan (via Chat Claude planning session, Sat Apr 18 2026)
**Target implementer:** Claude Code
**Scope:** Three additions to the existing roadtrip PWA (GitHub Pages, "roadtrip" repo) to reduce dependence on Chat Claude during active travel.

## Background

The existing PWA presents a locked itinerary across four themed views (Jonathan, Helen, Aurelia, Rafa). During the trip, real-time juggling is happening in Chat Claude — stop changes, drive-time recalculation, reality checks against the plan. Three additions would absorb most of that work into the app itself.

**What stays in chat:** qualitative judgment (aesthetic comparisons, constraint-rebuilding, novelty checks). **What moves to the app:** route logging, on-route re-planning, drive-time math.

---

## Feature 1 — Actual Route Log (priority: ship first)

### Purpose

Capture what actually happened on each day, separate from the planned itinerary. Serves two functions: (1) real-time record during trip, (2) automatic trip memoir when we get home.

### User story

Jonathan opens the app mid-drive or at day's end. Adds a stop that happened — name, time, notes. Can see the plan and the actual side by side. After the trip, exports the full actual log as markdown.

### Data model

```
ActualStop {
  id: uuid
  date: string (YYYY-MM-DD)
  arrivalTime: string (HH:MM, local time)
  departureTime: string | null
  name: string
  type: enum ['meal', 'activity', 'gas', 'overnight', 'drive-by', 'other']
  location: string (free text — city, state)
  notes: string (free text)
  servedWhom: string[] (family member names, optional tags)
  wasPlanned: boolean (was this on the original itinerary?)
  plannedStopRef: string | null (if wasPlanned=true, reference the planned stop)
}

ActualDay {
  date: string (YYYY-MM-DD)
  stops: ActualStop[]
  totalDrivingHours: number (calculated or user-entered)
  departureLocation: string
  overnightLocation: string
  reflection: string (free text — "what worked," "what we learned")
}
```

### Storage

IndexedDB via a thin wrapper (dexie.js is overkill — plain IndexedDB is fine for this volume). Schema version 1. Export to markdown on demand.

### UI

- **New tab in each persona view:** "Today" (planned) and "Log" (actual). Toggle between them.
- **Add stop form:** single screen, 4 fields minimum (time, name, notes, type). Everything else optional.
- **Day view:** list of stops chronologically. Swipe to edit/delete.
- **Trip view:** all days, collapsible. Total driving hours per day.
- **Export:** single button, generates markdown file matching the format of `saturday_apr18_actual.md` (see attached). Copies to clipboard or triggers download.

### Acceptance criteria

- Can add a stop in under 15 seconds while stopped at a light (one-handed, mobile)
- Works offline; syncs when online is not required for v1 (everything local)
- Saturday Apr 18's log (attached markdown) can be imported as seed data
- Export markdown matches the handwritten format closely enough that Jonathan would send it as-is

### Explicitly out of scope for v1

- Cloud sync (local-only is fine)
- Photo attachments
- Map visualization
- Sharing with other family members' phones

---

## Feature 2 — Drive-Time Calculator (priority: ship second, simpler than it sounds)

### Purpose

Answer questions like "Can we make Meridian by 8 PM if we leave at 10?" without going to Chat Claude. Replaces 40% of real-time planning dialogue.

### User story

Jonathan taps a "Time Check" button. Enters or selects: current location, target location, planned departure time, and any fixed stops in between with their durations. App returns: honest total driving time, honest total door-to-door time, arrival time at destination, and flags on any stretch >2.5 hours.

### Inputs

- **From:** location (current, or named city)
- **To:** location (named city)
- **Departure:** time (default: now + 15 min)
- **Stops:** array of `{location, duration_minutes}` in order
- **Buffer preference:** strict (Google Maps time), realistic (+15% for gas/bathroom), Rafa-mode (+25% for reality)

### Outputs

- **Pure drive time** (sum of legs)
- **Door-to-door time** (drive + stops + time-zone adjustments)
- **Arrival time** at destination, in destination's local time
- **Stretch analysis:** longest stretch, median stretch, any stretches >2.5 hours flagged
- **Feasibility verdict:** "works," "tight," "don't," with one-line reasoning

### Implementation notes

- Use Google Maps Distance Matrix API or Mapbox Directions API for leg times. Cache results per (origin, destination) pair for 24 hours.
- Time zone handling: detect time zone at each waypoint. All user-facing times in local time, labeled (ET/CT/MT/PT).
- The "buffer preference" multiplier is the key realism lever. Google Maps times are optimistic by ~15% on long interstate drives with kids. Default to "realistic."

### UI

- Single screen. Stops list is add/remove as user builds the route.
- Results update live as inputs change.
- Save a computed route to "Plan candidates" — can be compared side by side.
- One-tap "Apply to today's log" if a plan becomes the actual.

### Acceptance criteria

- Sunday's question ("10 AM ET wheels-up, Elizabethton → Meridian with Knoxville + Chattanooga + Barber stops") returns accurate totals within 5 minutes of what Chat Claude computed
- Handles Eastern → Central time zone crossing without bug
- Offline fallback: if no network, use last cached leg times and flag as stale

### Explicitly out of scope for v1

- Turn-by-turn navigation (that's Waze/Apple Maps)
- Traffic prediction beyond what the API returns
- Route optimization (we're deciding the route manually)

---

## Feature 3 — Live Re-Plan with Alternatives (priority: this is the whole point)

### Purpose

When the plan blows up mid-day — late start, closure, weather, someone's had it — surface viable replacement stops on route that actually serve this family, not a generic family. **This is the feature that replaces Chat Claude during active travel.** If it doesn't suggest alternatives that reflect each family member's real preferences and veto real-world bad options (chains, tourist traps, rushed stops), it's worthless.

### The test case this must pass

Scenario from Saturday Apr 18: "We are at the West Va welcome center. What are my stops for the rest of the day? It's 5:21pm."

App must return, in under 30 seconds of interaction:
- Remaining drive time to Elizabethton with realistic buffers
- Dinner recommendation off I-81 S that (a) isn't a chain, (b) serves Helen's vegetarian needs with a real entrée, (c) has novelty relative to last night's Italian, (d) is 5 minutes or less off highway
- Any short vivid photo-stop worth the 15 min (like Mill Mountain Star)
- Honest arrival time at final destination

And it must do this with the same judgment Chat Claude applied — not a Yelp scrape dumped on screen.

### Inputs

- **Current location** (GPS, with manual override)
- **Current time**
- **Remaining planned stops** (pulled from today's itinerary)
- **Destination** (today's overnight or final stop)
- **What changed:** optional dropdown ["running late," "stop canceled/closed," "need food," "need run-around for Rafa," "weather," "everything's fine I just want options"]
- **Which family members are in play:** default all four, but can be flagged (e.g., "Jonathan solo" for the Elizabethton ceremony morning)
- **Novelty constraints:** last 24-48 hours of meal types, so it won't suggest Italian if we just had Italian

### Outputs

- **Updated schedule** with revised arrival times, time-zone-correct
- **Risk flags:** "Barber closes before you'd arrive," "Hunter Museum gets cut to 20 min — skip or commit"
- **Alternatives** (the critical output): 1-3 concrete options for each slot that needs filling, each with:
  - Exact name, address, exit/off-highway distance
  - Confirmed open-now status for today's day-of-week and time
  - Named family member(s) served and WHY (specific, not generic)
  - A one-line tradeoff vs. the planned option
  - Novelty verdict ("we already did Italian last night — this is Mediterranean" / "same genre as last night, skip")

### Family-preference tagging (this is the core IP)

Each family member has a layered preference model, not a flat tag list:

```yaml
Jonathan:
  loves: motorcycles, engineering, roots-americana, music-history,
         Appalachian-blues, architectural-preservation, roadside-Americana,
         working-rail-machinery
  neutral: most-food-styles, parks
  avoids: kitsch, tourist-traps
  dietary: omnivore
  vibe: "Rice alum, appreciates restoration and adaptive reuse,
         hates beige"

Helen:
  loves: Abstract-Expressionism, Rothko, Tworkov, Twombly, art-museums,
         historic-architecture, sculpture-gardens, brutalism, 1920s-40s-design,
         wabi-sabi, collected-not-curated, brass-fixtures, teal-tile,
         white-beadboard
  neutral: roadside-Americana (tolerates, doesn't love)
  avoids: chain-restaurants, gray-Airbnb-staging, farmhouse-kitsch,
          "Live Laugh Love" energy, West-Elm-bland, word-art
  dietary: VEGETARIAN — must have a real entrée, not salad-minus-chicken.
           Pasta, grain bowls, Mediterranean, Indian, veggie pizza with
           character, Thai, brick-oven vegetables all work. Single sad
           veggie burger as the only option is a fail.
  vibe: "Artist's eye. Her Pinterest is teal tile, brass, beadboard.
         Hates beige. Novelty of aesthetic matters — won't want the
         same restaurant vibe two nights running."

Aurelia:
  loves: photogenic-architecture, murals, historic-districts,
         concert-posters, pink-zellige, vintage-shops, food-halls,
         neon-signage, rooftop-views, cliff-edges, adaptive-reuse,
         real-teen-hangs, The-Hills-aesthetic
  neutral: museums (will tolerate if photogenic), food (mostly flexible)
  avoids: cutesy, babied, Chuck-E-Cheese energy, anything
          "for kids" that talks down
  dietary: omnivore, flexible
  vibe: "13 and has real taste. Genuine photographer's eye.
         Short vivid moments land big — 15 seconds of 'whoa' is real
         teen currency. Will ignore a 20-min museum but will
         remember a neon star for years."

Rafa:
  loves: monsters, Godzilla, motorcycles, dinosaurs, big-machines,
         playgrounds, running-space, Spider-Man, cars, size-comparisons
  neutral: most-food (plain pasta / grilled cheese / cheese pizza are
           guaranteed wins), short-walks
  avoids: long-still-sits, babied-interfaces, cutesy
  dietary: kid-easy — plain pasta, pizza, grilled cheese, chicken nuggets
  attention-span: 30-45 min per stop
  vibe: "Almost 5. Watches GrayStillPlays. Bold not cutesy. Bedtime
         7:15 but can push later for truly great stops."
```

Alternatives are scored by:
- **Serves count:** how many family members have a "loves" tag matching this stop
- **Veto count:** does any family member have an "avoids" tag matching? (disqualifying)
- **Novelty:** does it repeat the last 24-48 hours of the same category?
- **Logistics fit:** is it on route, open now, 5-min-or-less off highway, will accommodate the required dwell time?

### Data sources

- **Google Places API + overrides.** Places API gives open-now, hours, location, category. But it doesn't know Helen is vegetarian or that a brewpub is "the same vibe as last night's brewpub."
- **Curated stop library (seed + grow):** A data file of known-good stops tagged by family preference. Seeded from trip planning research (Barber, Hunter Museum, Threefoot, Fort Kid, Yassin's, Mill Mountain Star, etc.). Grows with each actual stop logged via Feature 1.
- **Chain blacklist:** Applebee's, Chili's, Olive Garden, IHOP, Cracker Barrel, TGI Friday's, Denny's, Panera, Chipotle, Subway, McDonald's (unless explicitly the fallback). Never surface as a "recommendation" — only as "if all else fails, CFA is the least sad."
- **Categorical novelty tracker:** Last 48 hours of meal categories from Feature 1's log. "Italian last night" → don't suggest Italian tonight unless user overrides.

### Vetoes that must be absolute

The feature fails if it ever:
- Suggests a chain restaurant as a real recommendation (fallback-only tier is OK)
- Suggests a stop with "only a sad veggie burger" for Helen
- Suggests a stop under 30 min as a real stop (drive-by photo stops are flagged as such)
- Repeats a meal category (Italian → Italian) without a novelty-override from user
- Describes a stop as "family-friendly" or "the kids will love it" — must name specific family members and what specifically they'd love
- Suggests a tourist-trap-coded stop (Ripley's, Wax Museum, etc.)
- Suggests an overnight outside the current day's feasible range

### UI

- **Single screen entry:** "Re-plan my day." Defaults populated from current itinerary + GPS.
- **Two-column result:** left column shows updated schedule with risk flags in red. Right column shows suggested alternatives for each flagged/empty slot, with full context cards.
- **Context card per alternative:**
  - Name + one-line "why this"
  - Distance off route, drive time to get there
  - Who it serves (family member avatars with tag tooltips)
  - Novelty verdict badge
  - "Accept" / "Show 2 more like this" / "Not this one" buttons
- **Accept flow:** tapping Accept updates today's schedule, recalculates downstream stops, updates the Actual Log via Feature 1.

### Implementation notes

- **The preference model is the product.** Don't cut corners here. A shallow tag list will produce shallow recommendations. Build the layered `loves/neutral/avoids` structure from day one.
- **Scoring transparency matters.** When the app suggests Box Office Brewery over Roma Casual, it should be able to show: "Serves Aurelia (loves historic-architecture, 1918 theater), Serves Jonathan (loves adaptive-reuse), Veto check clear for Helen (Beyond Burger + build-your-own veggie pizza confirmed), Novelty check passes (Italian last night — this is brewpub)." If the reasoning surfaces on request, Jonathan can audit and override.
- **Fall back gracefully.** If Places API is unavailable (no network), use the curated stop library only and flag results as "offline mode — may be stale."
- **Learn from overrides.** If user rejects a suggestion, log the reason. Over time, the preference model sharpens.

### Acceptance criteria

Must pass all of these, or it's not shipped:

1. **Saturday 5:21 PM test case:** given WV welcome center at 5:21 PM, Elizabethton as destination, and "Italian last night" in recent-meals log, produces Box Office Brewery (or equivalent non-chain non-Italian) as a dinner suggestion with Helen's vegetarian options named and the 1918 theater noted for Aurelia.

2. **Sunday 10 AM test case:** given Elizabethton at 10 AM ET, Meridian as destination, and Barber locked noon-6 PM CT, produces a schedule with Knoxville + Chattanooga stops sized correctly, flags Barber-close risk if departure slips past 11 AM ET, and suggests alternatives for any stop that gets squeezed under 30 min.

3. **Chain veto test:** manually inject an Applebee's into the Places API response. Confirm it never surfaces as a recommendation.

4. **Helen vegetarian veto test:** manually inject a BBQ joint with no veggie entrée. Confirm it's flagged "fails Helen's dietary" and downgraded.

5. **Novelty test:** with "Italian" in the last-48-hour log, confirm no Italian restaurant surfaces in the top 3 without explicit user override.

6. **Rafa attention-span test:** confirm no stop under 30 min surfaces as a primary dinner/activity suggestion.

7. **"Who does this serve?" test:** every alternative surfaces with at least one named family member and a specific reason. No "great for families."

### Out of scope even for this fuller version

- Multi-day re-plans (only today)
- Budget tracking
- Restaurant reservation integration (just show phone number)
- Route optimization algorithms (we still choose the route)

---

## Build order and sequencing

**Reordered priority:** Feature 3 is the whole point. Feature 1 is valuable but secondary. Feature 2 is table stakes.

1. **Feature 3 (Live Re-Plan with Alternatives)** — ship this first. This is what replaces Chat Claude during active travel. Without it, the app is a read-only itinerary and we keep reaching for chat every time the plan bends. Target: working MVP by end of Tuesday, iteration through the rest of the trip.
2. **Feature 2 (Drive-Time Calculator)** — ship second. Mid-complexity. Feature 3 can use the same drive-time logic under the hood, so build this as a library Feature 3 calls. Target: working by end of Monday as part of Feature 3's foundation.
3. **Feature 1 (Actual Route Log)** — ship third. Lowest complexity, but also lowest active-travel urgency. The log can be backfilled from chat transcripts if needed. Use Saturday Apr 18's markdown as seed data. Target: working by mid-trip.

### What to ship incrementally for Feature 3

Even within Feature 3, ship in layers so it's usable partway:
- **Layer A (Monday night):** Schedule update + risk flags only. No alternatives yet. Still useful — answers "does our plan still work?"
- **Layer B (Tuesday):** Curated stop library integration. Alternatives from seeded data only. Doesn't call Places API yet.
- **Layer C (Wednesday):** Places API integration with chain blacklist + veto logic.
- **Layer D (Thursday+):** Novelty tracking, scoring transparency, override learning.

Each layer is independently shippable. Don't block on Layer D to get Layer A live.

## Constraints

- Must work offline. The Texas stretches have spotty connectivity.
- Must be one-handed usable on iPhone while stopped at a light.
- Existing four-persona theming must be preserved. Any new UI respects the theme per view.
- Known bug to fix while you're in there: TikTok links in Aurelia's view produce blank screen. Fix uses `window.open` not anchor tags.

## Known existing files to reference

- `ROADTRIP_PWA_BUILD_SPEC.md` (original build spec)
- `Jackson_Family_Road_Trip_Complete.html` (master itinerary)
- `CHANGE_ORDER_2026-04-14.md` (last consolidated change order)

## Seed data for Feature 1

`saturday_apr18_actual.md` (attached) is the format. Ingest it as the first day's log so the app ships with one real entry.

## Deployment

Same as current: push to `roadtrip` repo main branch, GitHub Pages auto-builds. Test locally with `npx serve` before push. Service worker cache must bump version to force update on installed devices.

---

## Non-negotiables

- Every new feature must preserve the core rule of the trip planner: **every stop names who it serves and why.** Anything the app suggests or logs must reflect this. No "family-friendly" hand-waving. No "the kids will love it."
- No generic recommendations. No chain restaurants in suggestions.
- Realistic drive-time defaults. No Google Maps optimism.
