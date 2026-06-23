# New-trip creation redesign — design pass v2 (P3)

> Status: PROPOSAL awaiting Jonathan's approval (2026-06-23). No wiring yet — design first.
> Synthesizes two perspectives commissioned this session: a travel-planning domain study
> (how the best itinerary tools model multi-part trips + make intake effortless, what
> families value) and an independent design exploration grounded in this repo.
> Grounded in FAMILY_TRIPS_VISION.md + memory/recenter-on-family-trips. Owner: Jonathan (not a coder).

## 0. What Jonathan decided
- Build all five trip types incl. a **bigger/composite trip** made of parts.
- **Beautiful first, design and build in step** — never wire-then-polish.
- **Flexible, not complex:** a trip with many moving parts must NOT take longer to set up.
  Headline mechanism: **feed it screenshots + talk to it in plain language → the app lays
  the big parts in place (surprises included) → you just review.**
- **City trips are genuinely real** — timed, day-by-day, not a stay in disguise.

## 1. The data model — one shape to hold them all (engineering owns this; it won't break existing trips)

The proven, shape-agnostic model (TripIt's lesson, validated across the field): **a trip is a
flat, ordered list of typed parts; legs / days / routes are *derived views*, not stored.**

```
Trip {
  id, name, shape,                 // shape is DERIVED from parts (like inferTripShape today)
  dateStart?, dateEnd?,            // both optional
  parts: Part[]                    // a stay = 1 part; a road trip = drives+stays; a big trip = many
}
Part {
  type: 'stay'|'city'|'drive'|'flight'|'event'|'train'|'ferry'|'cruise',
  place(s),                        // 1 for a stay; from→to for a flight/drive
  dateStart?, dateEnd?,            // OPTIONAL — "a weekend at Grandma's" needs no times
  items[],                         // reservations, activities, notes, photos within the part
  visibility,                      // surprise scoping lives HERE (§4)
}
```
Why: a single stay, a flight-only trip, and a 12-part international odyssey all fall out of the
SAME schema — no shape is privileged (kills the road-trip bias). Adjacency ("A → B") comes free
from order+type. **Days are rendered, never stored** (storing days forces the "fake the terminal
as a place" hack that day-grid apps suffer). **Existing single-shape trips become one-part trips**
— a migration the engineer designs so Vermont et al. keep working untouched (G5).

## 2. The front door — a concierge that turns authoring into confirming

Tapping "New trip" opens **one generous, skin-themed surface** (the creator's lens): *"Tell me
about the trip — or drop what you've got."* It accepts, in any mix:
- **Natural language** (typed or spoken — reuses the live `/transcribe` Whisper seam),
- **Screenshots / photos / a forwarded confirmation** (a flight conf, an Airbnb, an itinerary),
- **a quiet "or pick a kind of trip"** escape (the five-shape picker) for when you have nothing to paste.

Shape is **inferred from what you give**, never demanded. Claude returns a **draft of parts**, not
a form. For a complex trip, the parts **assemble into a vertical timeline as it reads each artifact**
— this is how "lots of moving parts" reads as *flexible, not complex*: you watch it build, you don't
build it.

**This is mostly wiring onto seams that already ship:** streaming Claude chat with tool use
(`/claude/chat` + `compute_drive_time` + `find_places`), surprise-cover drafting (`/cover`),
`/draft`, `/transcribe`. The one genuinely new call is **vision: screenshot → structured parts.**

## 3. Review = confirm a near-complete draft (where every itinerary tool lives or dies)

- **Per-part confirm, not a wall** — progressive disclosure; most parts confirm with one tap.
- **Inline field-level fix** — a wrong date opens a scrubber; a wrong place, a one-line search.
- **AI-filled values are flagged, sourced guesses** — "dates from your flight screenshot" — to
  fight rubber-stamping and make trust legible.
- **Confidence-scored dedupe** (flight# + date, or traveler + date-range + place) — never silent duplicates.
- **Dates/timezones get special care** — the #1, most damaging error class everywhere (red-eye
  day-rollover, city→zone). Always optional; never invent a time.
- **Always a manual fallback** — a parse miss is never a dead end. Always Cancel. Only a title required.

## 4. Surprises through intake — parse, then quarantine (safety is load-bearing)

You say "…and the last two days are a surprise for Helen — don't let her see it." The intake (the
planner is authorized) parses it, but the part is **written already tagged `visibility:{audience,mode}`**
and routed through the **same server-side masking boundary that already protects surprises today**
(`worker/src/surprises.js` — mask before data leaves the worker). Rules carried from the shipped surprises work:
- **Mask at the source, per-viewer, before the model** — never filter a secret *after* it reaches an AI.
- **The author confirms the mask out loud before publish** and sees the cover the family will see
  (drafted via the live `/cover` seam) — closing the red-team gap the surprises memory flags
  (live create→mask was device-only).
- **Graduated secrecy** ("hide from kids" vs "+ co-parent"); the surprised party gets the thinnest
  projection and **cannot self-unmask** (gift-registry pattern).
- **Audit side-channels** on the masked view: counts, badges, the weather/tide re-rank (a weather
  widget for the secret place IS a location leak), save-back/clobber — all compute over masked data.

## 5. Family-tuned principles (this is not a business-travel tool)
- **Loose intentions, not rigid times** — "beach afternoon," not "2:00 PM sharp." Date/time optional everywhere.
- **Under-schedule by default** — one "big thing" per day + open space; resist itinerary density.
- **Real co-ownership** — both parents edit live, can split by category; each person sees their lens.
  (Real-time co-edit is the biggest gap in incumbents — we already have multiplayer sync.)
- **The pre-trip window is a feature** — anticipation; countdowns; "picture the trip" (esp. for the kids).
- **Age-scoped ownership** — the teen gets real autonomy / "her day"; the 5-yo gets picture-choices.

## 6. Rafa (5) does not get the planner's form
No "New trip" in Rafa's nav. Instead **"Ask for a trip"** — one candy button (his Fredoka/bubble
idiom) that sends a delight-only *proposal* to the deciders (reuses the propose→decide loop + the
wave channel): "Rafa wants to go to the beach!" He stays a participant; a kindergartner never meets
the booking form.

## 7. Recommended direction & phasing
**Direction:** the **concierge intake as the front door**, the **five-shape picker one tap away** as
the escape, both producing the **unified parts model**. (The exploration's hybrid: concierge leads,
shape-picker scaffolds the cold start, and as the concierge matures it simply *becomes* the open box.)

- **Phase 1 — the front door + the parts model, real but bounded.** Intake (NL + screenshots + the
  shape-picker escape) → draft parts → per-part review → write a real `parts[]` trip; surprises by
  sentence, confirmed pre-publish; existing trips migrated to one-part. Stays/road trips fully real.
- **Phase 2 — genuinely-timed city days + richer composite editing** (the day-by-day city rhythm;
  parts staging/drag; event/train/ferry/cruise types). Its own decision gate.

Each schema/structural step is a decision gate (WORKING_AGREEMENT §3); the *direction* is approved here.

## 8. Anti-patterns to avoid (the recurring villain: structure imposed before the user is ready)
Forcing exact dates/times · business-traveler density · required fields / can't save half-formed ·
single-shape bias (a stay rendering an empty route UI) · over-automation you can't correct (propose,
don't commit; one-tap fix) · blank-canvas paralysis (start from a shape with defaults) · view-only
sharing · paywalling basics · filtering secrets *after* they reach the AI.

## 9. Constraints carried
Minimal at creation · always Cancel · only Title required · never ask twice · never road-trip-first ·
finish in the editor · draft-on-device-until-published · per-person skin in the real build.
