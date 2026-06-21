# FAMILY TRIPS — THE VISION (north star)

> **What this is:** the durable statement of what this app is *for*, written down so it stops
> evaporating into closed chat windows (WORKING_AGREEMENT §0). Every family-trips / place-model
> feature scopes against this. It is the *why* and the *what*, in plain language — not a build spec.
> **Status:** living. Owner: Jonathan. Drafted 2026-06-20 from Jonathan's own words (session
> `a50cb529`, 2026-06-19, + on-device feedback 2026-06-20). Amend only with Jonathan's approval.

---

## 0. THE SHIFT, IN ONE LINE

> **SETTLED — do not relitigate or re-scope.** This direction is decided. New windows build *toward* it; they
> do not reopen "is this a road-trip app?" or quietly narrow features back to the road-trip engine. Surface new
> *facts*, never re-pose this *question*. (WORKING_AGREEMENT §2 #7.)

This is a **family-trips app for ANY kind of trip** — a cabin weekend, a city break, a beach week,
a flight to Grandma's, a museum day, a lazy stay with nothing planned. We *built* it for a family
**road trip**, but **the vast majority of our trips will NOT have that structure.** The road-trip
shape is ONE shape, not the default. Making the app fit every shape is worth a **deeper overhaul**,
not just patches on the road-trip machinery.

> *"We really need to evolve the app towards 'Family trips' which include just being in a place and
> not being so event- and travel-driven."* — Jonathan, 2026-06-19
>
> *"We built it originally for a family roadtrip, but the vast majority of our family trips will NOT
> have that structure."* — Jonathan, 2026-06-20

---

## 1. WHY THIS DOC EXISTS (the failure it fixes)

Jonathan has corrected the road-trip framing repeatedly (the memory note literally records *"for the
millionth time"*). Yet feature after feature has shipped as a **narrow patch on the road-trip
engine** — because the full vision was only ever captured as a single phase's carryover, never as a
north star. So each new session reconstructs a thinner version and Franken-fixes the road-trip app
instead of shifting it. This file ends that: the vision is now **real memory** (committed), so the
work can finally build *toward it* instead of *around it*.

> *"the fixes aren't landing... We had scoped this to be a shift towards a family-trips app rather
> than Franken-fixing a road-trip app."* — Jonathan, 2026-06-20

---

## 2. TRIP SHAPES — the app adapts to the trip, not the other way around

A trip is **not always** "a sequence of stops you drive between." Real family trips include:

- **STAY** — anchored on a *place* you're staying (a cabin, a beach house, Grandma's). The place is
  the home the days hang off; "events" (a dinner out) are the exception, not the spine. Little or no
  driving. **This is the most common shape and the worst-served today.**
- **ROUTE / ROAD TRIP** — stops + driving between them (the original; volleyball-2026). Still valid,
  just no longer the assumed default.
- **ITINERARY / CITY BREAK** — flights + timed things (museums, dinners, shows), little/no driving.
- **LOW-EVENT / HANGOUT** — barely anything planned; the trip *is* the time together in a place.

The app should **recognize the shape and present accordingly.** A stay should not be forced to wear
road-trip clothing (a "drive %", a driving plan, a "where's the nearest bathroom/fast-food" queue).

---

## 3. THE CORE IDEA: "BEING AT A PLACE" IS FIRST-CLASS

Today the app has only two ways to think about a moment: a **timed event** ("dinner, 7:30") or
**travel between events** ("from A to B"). It has **no concept of just *being somewhere*** — and that
is exactly what a family trip mostly *is*. "At the cabin" must be a first-class state, equal to
events and travel — *the* thing the day hangs off, not a stop you happen to be "nearest to."

> *"We don't have a specific event for just hanging out in a place... this whole trip is about
> hanging out in the cabin, [but] the video shows up in the dinner section... We need to generalize
> the interstitials to allow for spaces like these, where we're just exploring and hanging out at
> the cabin."* — Jonathan, 2026-06-19

---

## 4. HOW THE APP KNOWS WHERE YOU ARE (the load-bearing principle)

"We're at the cabin" should be **automatic**, and it should come from things the app actually knows:

1. **What you declared** — the trip's place(s) and their **addresses**. You told it where you're
   staying.
2. **Live signals** — the family is **sharing location**, so the app can see you're *at* that address
   right now.

It should **NOT** depend on **photo EXIF GPS** (cabin photos often have none) or on **the clock**
(picking "the stop whose scheduled time is closest"). Those are road-trip-era proxies, and they are
the source of the mishmash.

> *"That should be an automatic organization, especially if there's a clear address, and we're
> obviously at the address (since we're sharing location)."* — Jonathan, 2026-06-19

---

## 5. "AT THE CABIN" SHOWS UP EVERYWHERE, NOT IN ONE PLACE

Being at a place is **the whole experience**, not a photo section. When the family is at the cabin:

- **The live rail / "now"** says **"At the cabin"** — not "Anniversary Dinner" picked by the clock.
- **Photos** taken while hanging out file to **"At the cabin"** automatically; an event (a dinner
  out) is the exception that pulls a photo away, only when it clearly belongs there.
- **The home view leads with the place** ("At the cabin · three nights") and **sheds road-trip-only
  scaffolding** (drive distance, the driving plan, the "nearest bathroom / fast food" queue) for a
  trip that isn't a drive.
- **Replay / the woven story** treat the stay as a real chapter, not a gap.

The current contradiction is the bug to kill:

> *"even though the photos are being auto-assigned to the dinner restaurant, the live rail shows that
> we're still at lunch. So there's a mishmash of assumptions about where we are and what we're doing
> that don't add up."* — Jonathan, 2026-06-19

---

## 6. ANTI-PATTERNS (how we keep getting this wrong)

- **Don't Franken-fix the road-trip matcher.** Bolting a "base" onto the event/travel engine is the
  trap we keep falling into. The shift is structural.
- **Don't infer "where we are" from photo GPS or the clock.** Use the declared address + shared live
  location.
- **Don't bake driving/waypoint/"nearest-X" assumptions into every trip.** They belong to the route
  shape only.
- **Don't make "being at a place" a manual toggle** when the trip clearly *is* a stay — it should be
  automatic, with manual override available.
- **Don't fix one surface and call it done.** Photos, the live rail, and the home view are one idea.

---

## 7. HONEST CURRENT STATE (what's shipped, and why it falls short)

Two slices have shipped toward this, both **GPS/photo-based** and **neither touching the live rail
or live location** — i.e. still the road-trip engine:

- **Place model P1 (`86ed339`)** — you can manually mark a *stop* as a base (lodging = base by
  default). Requires the cabin to be a planned stop; a destination-less stay has none.
- **Place model P1.5 (`b3f40f9`)** — the trip's lodging/home anchor becomes an implicit base, and
  cabin photos GPS-match to it. **Falls short:** depends on the photos carrying GPS (the cabin's
  often don't) and on saved coordinates; does nothing for the live rail; isn't driven by live
  location. On a real cabin trip it didn't visibly land.

The home view still leads with "DRIVE / FLIGHT / THE PLAN / nearest bathroom"; the live rail still
picks a stop by the clock. **The road-trip framing still dominates.** These slices are stepping
stones, not the destination.

---

## 8. THE OVERHAUL MANDATE

Jonathan has authorized a **deeper overhaul** if that's what it takes — this is not a "find a smaller
patch" exercise. Treating **trip shape** as first-class, and **location as a live-signal model**
(declared places + shared location) rather than a road-trip-derived one, may require real changes to
the data model and the core surfaces (home, live rail, filing). That is expected and approved in
principle; the *specific* schema / dependency / structural changes still come to Jonathan as decision
gates (WORKING_AGREEMENT §3) — the mandate is the *direction*, not a blank check on each step.

The road-trip shape is **generalized, not discarded** — a road trip stays a valid shape; it just
stops being the assumption every trip is forced into.

---

## 9. HOW THIS SCOPES THE WORK (not a build plan — a checkpoint)

Before building any "family-trips / place" feature, check it against this file:

- Does it serve **a stay / low-event / flight trip**, not just a drive?
- Is "where we are" coming from **declared address + live location**, not photo GPS / the clock?
- Does it move **the live rail and the home view**, not only the photo album?
- Is it **generalizing** the model, or bolting another patch onto the road-trip engine?

The place-model phases fold under this: **P2 (auto-detect "we're here") and P3 (one shared
"where are we" so the live rail and the filer agree) are the heart of the vision, not optional
polish** — they are where the live-location signal and the live rail finally land. The detailed
build plan for the overhaul is scoped separately, against this north star.

---

*Sources of truth for this doc: Jonathan, session `a50cb529` (2026-06-19) and on-device feedback
(2026-06-20). Related durable memory: `all-family-trips-not-roadtrips`, `family-trips-place-model`.*
