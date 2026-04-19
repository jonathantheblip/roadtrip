# CHANGE ORDER — Sunday Apr 19 Ceremony-Morning Options

**For:** Claude Code
**Session source:** Chat Claude planning, late Saturday Apr 18 2026
**Scope:** Add Sunday morning options for Helen + Aurelia + Rafa to PWA while Jonathan is at the ceremony
**Relationship to existing change orders:** Additive to `CHANGE_ORDER_2026-04-18.md`. Does not modify any other decision.

## Context

Sunday Apr 19 schedule currently shows ceremony in the morning (Jonathan solo) and 10 AM ET wheels-up from Elizabethton. The ceremony-window time for Helen, Aurelia, and Rafa is currently unspecified in the PWA. This change order populates that window with a decision matrix of options — NOT a single locked plan. The family should be able to see all viable options on their phones and pick in the moment.

## Requirements

1. **New UI component:** "Ceremony Morning Options" card, visible on Sunday Apr 19's schedule view.
2. **Visibility:** Shown in Helen, Aurelia, and Rafa's persona views. **Hidden from Jonathan's view** (he's at the ceremony; surfacing it to him is noise and possibly worse).
3. **Framing:** Clearly labeled as OPTIONS, not a locked plan. Header text: "Options while Jonathan is at the ceremony." Never "Jonathan's ceremony" as a subtitle or label — keep the ceremony itself absent from this card. Just the options.
4. **Non-prescriptive:** No default. No "recommended" badge. Let the family decide in the moment.
5. **Preserve the decision matrix:** Each option is a card with title, drive-time from cabin, serves-whom tags, time estimate, and a one-line gotcha if any.

## Data

Cabin location: **317 E Cottage Ave, Elizabethton TN 37643**

### Options

| ID | Title | Drive from cabin | Time estimate | Serves | Gotcha |
|----|-------|------------------|---------------|--------|--------|
| A | Slow Jonesborough morning | 15 min | 2–3 hrs | Helen, Aurelia, Rafa | Verify Main Street Cafe / Corner Cup Sunday hours before driving |
| B | Covered Bridge Park, Elizabethton | 5 min | 45–60 min | Aurelia, Rafa | Short — pair with another option |
| C | Sycamore Shoals grounds + river walk | 10 min | 45–60 min | Rafa, Helen | Visitor Center CLOSED until 1 PM Sunday — skip museum, do grounds only |
| D | Jonesborough breakfast + Sycamore Shoals combo | 15 min out, 10 min return | 2.5–3 hrs | Helen, Aurelia, Rafa | Same Sunday-hours caveats as A and C |
| E | Stay at cabin | 0 | flexible | Everyone | None — legitimate option |
| F (flex) | Tweetsie Trail walk | 5 min | 45–90 min | Rafa, Aurelia | Weather-dependent; use if rain |

### Option detail text (for expanded card views)

**Option A — Slow Jonesborough morning**
- Drive to Jonesborough (~15 min). Park on Main Street.
- Breakfast at Main Street Cafe & Catering OR The Corner Cup — both local, both have vegetarian options for Helen
- Walk historic Main Street: Tennessee's oldest town (1779), brick sidewalks, 18th-19th c. storefronts
- Griffin Art Gallery on Main Street if open (James & Debbie Griffin, local artist couple)
- International Storytelling Center grounds — free to walk
- Why it works: Helen gets a real breakfast + 18th-century architecture, Aurelia gets a photogenic downtown, Rafa can run the brick sidewalks, no driving once parked

**Option B — Covered Bridge Park, Elizabethton**
- 5 min from cabin
- Elizabethton Covered Bridge (1882, still standing)
- Doe River park around it
- Free, no schedule
- Why it works: Stays close to cabin. Photogenic, short. Pair with breakfast somewhere to fill the window.

**Option C — Sycamore Shoals State Historic Park (grounds only)**
- 1651 W Elk Ave, Elizabethton · 10 min from cabin
- Park grounds + Watauga River walking path (open dawn to dusk)
- Fort Watauga reconstruction visible from outside
- **Visitor Center opens 1 PM Sundays — not available during ceremony window**
- Why it works: River walk + historic site for Helen, run-around for Rafa

**Option D — Jonesborough breakfast + Sycamore Shoals combo**
- Breakfast in Jonesborough (15 min drive)
- Return via Sycamore Shoals for 30-45 min river walk (10 min from cabin on the way back)
- Two distinct stops without feeling rushed
- Why it works: Best structure if the family wants variety without logistics hassle

**Option E — Stay at cabin**
- 0 drive time
- Slow morning, coffee on the porch, cartoons for Rafa, phone time for Aurelia, book time for Helen
- Why it works: A ceremony morning doesn't require the family to also do something. Legitimate, non-failure choice.

**Option F (flex) — Tweetsie Trail walk**
- Paved rail-trail from Elizabethton trailhead
- Stroller-friendly, stays close to town
- Weather-dependent backup if raining at any of the above

## UI implementation notes

- Card component sits **above** the "today's drive schedule" on Sunday's view but **below** the day-orientation banner (Feature 5 from v3 spec).
- Each option is a collapsible row. Collapsed: title + drive time + serves-tags. Expanded: full detail text.
- Serves-tags use family-member avatars (Helen / Aurelia / Rafa only — no Jonathan avatar on any option).
- No "book" or "reserve" buttons. No integrations. This is a read-only decision aid.
- Add a small footer: "Pick in the moment. Not locked."

## Persona-view gating

- **Jonathan's view:** The Sunday morning section shows only "Ceremony · morning · Elizabethton" with no further subcards. Ceremony-morning options are not surfaced to him.
- **Helen's view:** Full options card visible.
- **Aurelia's view:** Full options card visible, with Aurelia-serving options (A, B, D, F) visually emphasized.
- **Rafa's view:** Full options card visible, with Rafa-serving options (A, B, C, D, F) visually emphasized. Option E visually de-emphasized since "stay at cabin with cartoons" works for him but isn't his preference driver.

## Acceptance criteria

1. Sunday Apr 19 view in Helen/Aurelia/Rafa personas shows the options card above the drive schedule
2. Jonathan's Sunday view does NOT show the options card
3. Every option lists who it serves by name (uses avatars, not generic "family-friendly")
4. No option is marked default or recommended
5. Sycamore Shoals Visitor Center 1 PM caveat is surfaced on Option C's card, visible without expanding
6. Option E (stay at cabin) is presented as equally legitimate, not as a fallback or failure state
7. The word "ceremony" does not appear in the body of any option — only in the header

## Explicitly out of scope

- Weather API integration (don't build for just this card; Feature 5 banner rejected weather already)
- Booking integrations
- Pre-selection based on weather forecast
- Time-of-day filtering ("show only 8-10 AM options") — keep it simple
- Notes field ("which option did we pick?") — let Feature 1 (actual log) capture that downstream

## Non-negotiables (unchanged from v3 spec)

- Every option names who it serves and why, using specific family members
- No generic "family-friendly" language anywhere
- Option E (stay at cabin) must be presented without stigma — it is a real, valid choice

## File outputs from this session to reference

- `saturday_apr18_actual.md` (Saturday actual route, Feature 1 seed)
- `CHANGE_ORDER_2026-04-18.md` (consolidated change order for this session's schedule rebuilds)
- `ROADTRIP_PWA_BUILD_SPEC_V2.md` + `V3` (feature build specs)
- This file: `CHANGE_ORDER_2026-04-18_SUNDAY_MORNING.md`
