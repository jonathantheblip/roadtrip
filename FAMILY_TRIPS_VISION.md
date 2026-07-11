# FAMILY TRIPS — THE VISION (north star)

> **What this is:** the durable statement of what this app is *for*, written down so it stops
> evaporating into closed chat windows (WORKING_AGREEMENT §0). Every family-trips / place-model
> feature scopes against this. It is the *why* and the *what*, in plain language — not a build spec.
> **Status:** living. Owner: Jonathan. Drafted 2026-06-20 from Jonathan's own words (session
> `a50cb529`, 2026-06-19, + on-device feedback 2026-06-20). Amend only with Jonathan's approval.

---

## 0. THE SHIFT, IN ONE LINE

> **SETTLED — do not relitigate, re-scope, or RE-DISCOVER.** This has surfaced as a "key insight"
> several times now; it is well past time it STUCK. Every window builds *toward* it and never
> re-derives a road-trip-centric version. Baked into CLAUDE.md, WORKING_AGREEMENT §2 #7, and MASTER_SPEC §0
> so it loads as real context every session — not as advice that evaporates when the window closes.

**This is a FAMILY-TRIPS app. The trips we mostly take are HANGOUTS and MIXED-STYLE STAYS at a place**
— a cabin weekend, a beach week, a flight to Grandma's, a city break, a museum day, a lazy stay with
nothing planned. **A ROAD TRIP IS AN EXTREMELY RARE EXCEPTION** — not the default, not a second "mode,"
not a different home.

**NEVER design to road-trip logic.** Drive plans, ETAs, "the next stop on the drive," route geometry,
"% of this drive," an always-on driving rail — these are RETIRED. Never centered, never "carefully
preserved for the road-trip case." There is **ONE home for every trip** (the living heart + the 4-tab
shell); the rare road trip uses that *same* home, shape-aware (lead with the day's focus, never force a
single "At [place]" onto a moving trip). **Do not build a route fork** or quietly narrow features back
to the driving engine.

⚠ **The repo name "roadtrip", the GitHub Pages path, and the road-trip fixtures (`volleyball-2026`,
`FIXTURE_ROUTE_TRIP`) are a TRAP** — they pull every window back toward driving. Ignore that pull; they
are the app's origin, not its canon.

> *"This is no longer a 'road-trip' app. It is a 'family trips' app, and road trips are an EXTREMELY RARE
> exception in that canon. We should NEVER EVER design the trip to follow road-trip logic. 'Hangout trip'
> and 'mixed-style' trips are what we're most likely to be doing."* — Jonathan, 2026-06-29 (*"we've had
> this 'key moment of insight' several times now, and it's well beyond time for it to stick"*)
>
> *"We really need to evolve the app towards 'Family trips' which include just being in a place and not
> being so event- and travel-driven."* — Jonathan, 2026-06-19
>
> *"We built it originally for a family roadtrip, but the vast majority of our family trips will NOT have
> that structure."* — Jonathan, 2026-06-20

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

> ⚠ **STALE as of 2026-07-04 — the state below is a snapshot from BEFORE the recenter overhaul (§8-11)
> shipped.** The overhaul this section says is still needed is now **COMPLETE**: the 4-tab living-heart
> shell (§10/§11), the full slices 1–8 roadmap (recentered home, "We could…" tray, propose→decide,
> real conditions, "Who's around" shared presence incl. Rafa's diorama + bidirectional waves) all SHIPPED +
> DEPLOYED — see `memory/recenter-on-family-trips.md` for the full ship log. Since then: the Record (three
> tenses — plan/now/what-actually-happened, incl. Rafa's stamp + tell-about-today), per-user skins, share-out,
> editable composite legs, and multi-leg flights have ALSO shipped (see `CARRYOVER_FEATURES_QUEUE.md` and
> `memory/` for the current state — this section is kept for historical context, not as a live status).

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

## 10. WHERE THE BUILD IS NOW (decided 2026-06-21 — a pointer that ages; verify against `memory/recenter-on-family-trips`)

> ⚠ **STALE as of 2026-07-04 — "being built" below is done.** The 4-tab shell, every roadmap slice (1–8),
> and Rafa's phone+iPad "who's around" + bidirectional waves are SHIPPED + LIVE. Current work is the `#7`
> features queue (editable legs ✅, multi-leg flights ✅, metric units + Aurelia lowercase remaining) — see
> `CARRYOVER_FEATURES_QUEUE.md` for the live pointer.

The recenter is being **built**, not just planned. The shape is settled:

- **The home is a four-tab shell — "We could… · Now · Photos · Look back"** (from Jonathan's `/design:user-research`
  pass — the authority, committed at `app/docs/design/family-trips-hangout/`) leading with a **"living heart"**
  (a cinematic place/day hero + the day's woven story + who's-around + a "Lately" photo carousel + an "On the
  agenda" of the day's events). ⚠ **SUPERSEDED 2026-06-29:** the earlier "stays get the shell; road trips keep
  the old dock + drive scaffolding" branch is **GONE.** Per §0, the living heart + 4-tab shell is the **ONE home
  for EVERY trip**; the road-trip dock/drive-rail/masthead are **retired**, not branched-around. (See §11.)
- **Every device is single-enrolled** — each family member has their *own* device (Rafa's iPad is Rafa's). There
  is no shared device and no multi-person switching in production, so the person-switcher is moot (a quiet
  identity, not a switcher). This *refines* the older "shared iPad" assumption — it doesn't happen.
- **"Where are we" is still the heart (§4)** — the live "At the cabin" readout + shared-location presence are the
  big remaining pieces, sequenced after the shell stands up.

---

## 11. THE LIVING HEART IS THE ONE HOME FOR EVERY TRIP — SHAPE-AWARE (decided 2026-06-29)

There is **ONE home** — the living heart + the 4-tab shell — and **every trip uses it**, no exceptions, no
forks. What changes by trip is not *which* home but *what the living heart surfaces*:

- **STAY / HANGOUT / MIXED (the norm):** lead with the place ("At [place]"), the day's story, who's-around, the
  "Lately" carousel, and a light "On the agenda" of the day's few events. A hangout with little/no plan must
  still feel alive (place + countdown + "what you could do" + "photos will gather here" — never a sad blank).
- **The rare ROAD TRIP:** the *same* home, shape-aware — lead with the **day's focus** ("Pool play", "Day 2"),
  not a single "At [place]" that doesn't fit a moving trip. The agenda carries the stops. **No** drive ticker,
  ETA rail, or route fork.
- **COMPLEX / ITINERARY trips (city break, flights, timed things) — Jonathan, 2026-06-29:** *still the living
  heart*, but it "needs to look a little different… it'll need to surface the right **just-in-time information**
  — perhaps **screenshots of tickets, routing information, timeliness**, etc." So the agenda/now-surface becomes
  **time-aware + document-aware**: the next timed thing, its ticket/boarding-pass image, where to be and when,
  what's imminent. **[✅ DONE, updated 2026-07-04 — the separate `PartsTripView` is RETIRED; a composite trip
  now flows through the SAME shape-aware living heart (leads with the current leg + a just-in-time "Next up"
  ticket, the full plan folds in below via `PartsOutline`).** The leg data model (per-leg tz/currency/locale,
  the journey rail, per-leg geocoding) shipped, and — as of this session — a composite trip's legs are
  editable in TripEditor and can carry real multi-segment (connecting) flights with their own zones/layovers/
  "+N day" honesty, per the design's own §5 spec (`app/docs/design/hangout-first-handoff/03-scaling-the-home.md`).
  Ticket/boarding-pass IMAGE attachment is not yet built — see `CARRYOVER_DOCUMENT_THE_TRIP.md` for current state.**

The principle for ALL home/nav work: **don't ask "what trip shape is this, which home?" — there is one home;
ask "what does *this* trip need surfaced *right now*?"**

---

## 12. THE THIRD TENSE — document the trip we had, not just the one we scheduled (decided 2026-07-02, extended 2026-07-05)

The app tells **three tenses**: the PLAN, NOW, and what **actually happened**. It has always done the first
two reasonably well; the third barely existed until The Record (`day.record` — evidence-drafted settle
cards, the editor's record mode, the two-tense unfold; see `memory/the-record-three-tenses.md`, capture+read
arc shipped 2026-07-03). **Jonathan's framing, verbatim spirit, extended 2026-07-05:** "document the trip we
had, not the trip that was or wasn't scheduled." He named this as several concrete asks that all point at
ONE thing — the agenda, the photos, and the Weave should all reflect what actually happened, LIVE, not just
once at capture time:

- **Live agenda updates**: an edit made on any device should show up everywhere promptly — not wait for a
  device to be foregrounded or reloaded to notice a change another family member made.
- **Self-healing photo↔agenda matching**: a photo/video should end up pinned to what the family actually did
  that day, regardless of whether the agenda item existed before or after the upload — "unfiled" photos
  should be re-filed automatically once better evidence exists, not stuck forever against the plan as it
  looked at import time.
- **The Weave should follow**: any of the above changing should prompt an updated Weave, not leave it
  narrating a day that's since moved on.

**The complete vision was settled 2026-07-05/06 and lives in
[app/docs/design/document-the-trip/VISION.md](app/docs/design/document-the-trip/VISION.md)** ("the trip
remembers itself") with the engineering plan in
[app/docs/design/self-healing-photos/SPEC.md](app/docs/design/self-healing-photos/SPEC.md). The
principles that govern everything here (each was a real gap in this section's earlier text):

1. **Reality is what surfaces RENDER FROM, never what other tenses sync to.** The plan is never rewritten
   by the record — "we planned the whale watch, biked the dunes instead" stays tellable forever. (This
   also retires the import-reconcile flow's old habit of rewriting `day.stops`; it records instead.)
2. **On plan-less trips (the dominant hangout shape), the RECORD is the spine** — evidence pins + the
   names a person gives them; the agenda is one input. A KEPT day is read from its record everywhere
   (album titles, story, replay, shares), plan quoted alongside. (Settled 2026-07-05.)
3. **Every backward-looking surface follows** — not just agenda/photos/Weave: replay, resurfacing, the
   album's sections, share pages, the kids' read-faces. One shared place-resolver + one clock (leg-local
   day attribution) are the enforcement, not per-surface patches.
4. **Chosen things are inputs, never targets.** Kept days stay open to new material but their KEPT PAGES
   are prints — they change only when a person re-keeps them, and re-keeping never destroys the version
   that was chosen. Manual placements never move; the machine defers to authorship forever.
5. **The ask-economy:** the app initiates once per day (the evening settle moment; quiet days pool),
   everything else is a door that stays open forever — any loose day, any trip age, can be settled
   ("finish the story"), and the app never chases, counts, or nags about the past.
6. **Order independence:** photos-then-naming, naming-then-photos, more photos months later, locations
   backfilled anytime — the documented state converges identically in every order (gated by permutation
   tests, not hope). **Capture feels like keeping, not homework** — a nothing-day is a valid record.

**Status (verify against git/memory, this ages):**
- ✅ **Live agenda updates — SHIPPED** (`c5bcc58`, 2026-07-05), with real conflict protection + honest
  pending notes added 2026-07-06 (`cbbba10`: a stale device can no longer silently erase another's edit
  or resurrect a deleted trip).
- ✅ **Weave same-day regeneration — SHIPPED** (`8f07199`), and the server learned the implicit base
  2026-07-06 (batch A-4): stay-trip photos filed "at the place" finally produce stories; kept pages are
  exempt prints; NULL-signature rows converge.
- ✅ **Memory-sync integrity — SHIPPED 2026-07-06** (`ea502d0`): photo edits are remembered/retried
  honestly, delete-safe, move-safe — the foundation auto-healing runs on.
- 🔭 **SELF-HEALING TRIPS — the reframe (Jonathan, 2026-07-07), the fullest form of this whole section.**
  Following the thread — keep GPS, spread it across a moment, infer the agenda's times from the photos,
  recognize places by sight, let a tap name the rest — lands somewhere bigger than "photos file themselves":
  **the whole trip documents itself.** The agenda corrects to what happened, the photos land on it, the
  moments name themselves, the Weave follows — continuously, from accumulating evidence, no bookkeeping.
  WHY the reimagining: v1's matcher was GPS-first and *inert* on this family's data (only ~10 of 235 photos
  carry GPS — the pipeline strips it; v1 auto-moved 0, only ever suggested "→ base"), and its "safety" was
  *refusing to act* — useless. v2 makes **time + evidence** first-class and redefines *safe* as **reversible
  + confirmable, not inert**: sessions (bursts) are the unit; one located photo anchors a whole moment (GPS
  inheritance); a place auto-files only with positive evidence (GPS / a named record moment / the base) —
  a planned stop matched by time-only is a *one-tap confirm*, never a silent auto (kills "files to the trip
  you *planned*"); the metadata-blind archive (no GPS + no time) is reachable only by vision or naming.
  Jonathan: "let's do all of the options" — a **4-phase program**: (1) the engine, (2) keep more GPS,
  (3) the surfaces (auto + one-tap confirm + settle-the-day), (4) vision (cloud default). Spec:
  [app/docs/design/self-healing-photos/SPEC_V2_TIME_AND_EVIDENCE.md](app/docs/design/self-healing-photos/SPEC_V2_TIME_AND_EVIDENCE.md).
- ✅ **Self-healing v2 — MULTI-DIMENSIONAL + the trip names itself (LIVE + POPULATED, shadow, 2026-07-08).**
  The reframe matured past "time+evidence first" into its real form (Jonathan drove it): a moment must
  **EMERGE from the OVERLAP of every available dimension at once** — time · GPS · **composition** (a
  perceptual scene hash) · faces · **vision** (what the photo shows) — each votes, a missing one abstains,
  and naming comes from whichever dimension can supply it. Never lean on a single axis (the agenda least of
  all — hangout trips have no plan). All three metadata-independent dimensions are now LIVE + populated on
  real data: the engine (`buildMoments`, weighted clustering), the composition backfill (263/263 photos,
  from the pixels that survived upload), and vision naming (263/263). On the real Provincetown weekend the
  shadow ledger went **2 auto · 17 confirm · 22 leave → 5 · 35 · 0** — every moment now has a place or a
  name (the 28-photo beach afternoon = "Sand dune adventure"). ⚠ **The load-bearing lesson: each dimension
  has a distinct job** — composition = COHERENCE (groups, doesn't file), vision = the NAMING leaf-reducer,
  GPS = LOCATION (and it dissolves over-splitting, so "combine these into one event" is not a heuristic —
  it falls out of GPS). Still shadow (records to `memory_heal_decisions`, moves/writes nothing
  family-visible). ⚠ carry-forward: restore the surprise/mask gate before any *family-visible* reader of the
  ledger.
- ✅ **The GPS lever — SHIPPED 2026-07-10, then SUPERSEDED the same night.** The live capture-offset leak is
  plugged at import, and a re-source scan SURFACE ("Find your photos' locations," Settings) shipped —
  content-verified matching, proven the hard way across eight adversarial review rounds. Jonathan then
  opened it on his own phone and judged it **dead on arrival**: nobody hunts an unsorted camera roll from
  memory. That verdict is what produced §13 (the signal fleet) — the picker stays as an optional power
  tool but **nothing load-bearing rests on it**; the archive is healed from §13's builds instead. See §13
  for what actually shipped after. Faces is the remaining parallel device-lever, same shape, still unbuilt.
- ⏳ **Finish-the-story (retro-settle), the resolver, the record bridge, kid read-faces** — sequenced as
  V1–V5 in VISION.md §5.

---

## 13. THE SIGNAL FLEET — many unreliable witnesses, never discard a signal again (decided 2026-07-10)

**The decision (Jonathan, 2026-07-10, SETTLED — do not relitigate):** the archive is healed from signals
the app **already holds** — never from asking the family to redo work. He opened the shipped re-source
picker on his phone and called it what it is: dead on arrival — nobody re-selects an unsorted camera roll
from memory, and a workaround that is also a chore "isn't the way to get back to good." The picker stays
as an optional power tool; **nothing load-bearing rests on human archaeology again.**

Two governing principles, his words' spirit:

1. **Many partially-reliable witnesses, in overlap.** No source is ever 100% reliable, so the trip is
   organized by "2 or 6 or 14" dimensions at once (the numbers illustrative, the plurality not) — each
   votes, a missing one abstains, every inferred fact carries provenance and is reversible. The agenda is
   one witness among many: a weak prior that trips wander away from (the way the family wandered around
   Provincetown), never the reference — §12's agenda-free rule stands untouched.
2. **Never throw away a signal at intake.** The upload pipeline stripping EXIF is the original sin this
   whole arc exists to repair; it must never happen to another signal class.

**What the 2026-07-10 audit found (4-reader fan-out over live code — the concrete shape of the sin):**
import parses the **entire** EXIF tag set, then keeps five fields (`capturedAt`, `lat`, `lng`,
`offsetMinutes`, `mime`) and discards the rest in memory: camera make/model (whose phone really took it —
`authorTraveler` records the importer, a known trap), burst / Live-Photo pairing IDs, the original
filename (a per-device monotonic sequence — true ORDER even when clocks lie), lens/focal length
(front-vs-back camera), ISO/flash/exposure (indoor/outdoor, dark/bright), altitude/heading, even the
`capturedAtSource` provenance the bulk importer computes. **Videos are worse: iPhone clips carry GPS in
the QuickTime location atom and import never reads it** — video refs are hard-coded `lat: null`. The fix
is cheap because every one of these is already in hand at import: persist the full parsed tag set as a
small additive sidecar on the ref (`photo_r2_keys_json` is the proven migration-less home — GPS, offset,
poster, sound, scene, vision all rode it; mind its two constraints: the push/pull whitelists strip unknown
fields, and a client re-save clobbers worker-only fields, so a non-recomputable sidecar must ride the
whitelists). The rule applies to **every** intake path, including the picker tool itself.

**The signal map — where witnesses live (open-ended; add witnesses, never bet on one):**
- **In the file** (import-time only; gone for the archive): capture instant + zone, GPS/altitude/heading,
  camera model, front/back camera, burst & Live-Photo links, filename sequence, exposure, video location.
- **In the pixels** (held forever — works on the whole archive): scene fingerprint (live), vision naming
  (live) and scene TYPE, readable signage (storefronts name the place), faces (today local-only under an
  explicit privacy promise), light/weather in frame.
- **In the app's context**: the stay's coords (`stayPlaceCoords`), the agenda as weak prior (planned stops
  mostly carry coords), cross-device echoes (two phones, one scene), created-at clustering, the
  manual-moves ledger + dismissals (append-only human ground truth), notes/captions/the Record's entries.
- **In the world's records** (free): sunrise/sunset per place+date (a daylight sanity-check on any clock —
  the sun math is already on-device, `sunTimes.js`), historical weather (rain in frame = the rainy
  afternoon; external), place databases (find-places, live).
- **From the family, cheaply** (the ask-economy holds): confirm-tier answers accumulate as anchors.

**Two structural gaps the audit exposed (both feed the near-term work):**
1. **Per-photo signal fields carry NO source tag** — a ref's `lat`/`offsetMinutes` look identical whether
   EXIF-read, scan-recovered, or inferred. Anything inferred must carry provenance and always yield to
   reference data; building that tag precedes any inferred write.
2. **A trip doesn't reliably know its timezone** — `trip.tz` is read but never written; only AI-created
   international legs carry one. The clocks fix derives it from the stay's coords and writes it durably.

**Near-term sequence (tracked as tasks; verify against memory, this ages) — THREE OF FIVE SHIPPED
2026-07-10, same night as this section was written:**
1. ✅ **The intake sidecar** — every intake path now persists the full useful original-file metadata
   (camera/lens/exposure/orientation/original filename+mtime/capturedAtSource), plus the video-GPS fix
   (iPhone clips' QuickTime location atom, previously never read).
2. ✅ **The clocks fix** — both structural gaps this section named are now CLOSED: every signal field
   carries a `prov` tag (`exif`/`scan`/`inferred-manual`/`inferred-place`; reference data can never be
   overwritten by an inferred guess, an inferred guess always yields to reference data on arrival); trip
   timezone is now derived from the stay's coordinates and written durably. The retroactive backfill
   labeled the whole existing archive's provenance too (not just new writes), per Jonathan's explicit
   "future-proof, not just fix moving forward." An offset-inference engine writes corroborated (real
   sunrise/sunset math vs. the photo's own vision label) capture offsets — gated `mode==='on'` only, a
   promotion decision that is explicitly NOT this build's to make.
3. ✅ **Vision place-sameness** — bridges time-adjacent bursts that are probably the same OUTING (not
   necessarily the same spot) via a new constrained `placeType` field on the vision label. **A second,
   independent opinion caught a real design flaw before any code was written**: the first-draft gate
   ("bridge only when GPS AND the scene hash are both absent") was checked against live data and proved a
   no-op — 116 of 118 Provincetown photos already carry a scene hash. Corrected to gate on GPS-absence
   only (a scene mismatch never vetoes a place-type match — they answer different questions). **Run for
   real against the whole archive** (263/263 vision-labeled photos re-processed for the new field,
   Jonathan-authorized spend): the live Provincetown shadow ledger went from 22 moments to 18 — the
   fragmented town wander partially healed, the July 4th parade's 13+2 split into one 15-photo moment,
   July 3rd's beach 6+3 split healed — with every should-stay-separate boundary (including the wander's
   own adjacent beach burst) correctly staying separate. Still shadow: nothing family-visible moved.
4. ⏳ **Landmark pinning** (find-places on vision's names) — not yet built.
5. ⏳ **Sparse-GPS spreading** (one located photo places its whole scene-cluster) — not yet built.

Faces remains the parallel device-lever, still fully unbuilt. Full build-by-build detail, the process
lessons (including the one caught by a second opinion, not this project's own review apparatus), and the
real before/after numbers: `memory/self-healing-agenda-free.md`.

---

*Sources of truth for this doc: Jonathan, session `a50cb529` (2026-06-19) and on-device feedback
(2026-06-20). §12 added 2026-07-05 per Jonathan's own extension of The Record's three-tenses framing (his
words, not a proposed reframe — see `memory/the-record-three-tenses.md`'s prior standing-amendment note,
which this settles). §13 added 2026-07-10 per Jonathan's signal-fleet direction, the same night as his
picker-DOA verdict — see `memory/self-healing-agenda-free.md`. Related durable memory:
`all-family-trips-not-roadtrips`, `family-trips-place-model`, `recenter-on-family-trips`,
`the-record-three-tenses`, `document-the-trip-we-had`.*
