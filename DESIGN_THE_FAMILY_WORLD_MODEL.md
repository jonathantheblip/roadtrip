# The Family World Model — a plan at the right altitude

> ⚠ SUPERSEDED (2026-07-18) by `DESIGN_THE_HEALING_MODEL.md`. This draft forced one shape (a single
> hierarchy) onto signals that need many, and framed uncertainty as something to confess rather than
> the material the app works in. Kept only as a record of the earlier thinking.

> Status: DRAFT for discussion (2026-07-18). Not a build spec, not settled — the point is to
> talk it through. The open decisions in §6 are for Jonathan to weigh in on before any code.
> Written in plain language on purpose; where a technical idea earns its place, it's explained,
> not name-dropped.

## 0. The reframe (the whole thing in one line)

**Stop classifying photos. Build and keep a living model of the family's world — its places, its
people, its rhythms — and treat every photo as an *observation* of that world.** Filing a photo
becomes "which part of the world did this observe?", answered using every level of structure at
once. The app that results doesn't *guess* where a photo goes so much as *recognize* it.

This is a different altitude from what exists today. Today the engine is flat: a stack of
independent "witnesses" (time, place, the look of a scene, faces, weather, the order shots came off
a camera) that each vote on one photo at a time. That's a good set of *observations* — but they've
been the final answer, when they should be *evidence fed into a structure*.

## 1. The structure: four nested levels

Every photo sits inside larger, more knowable things:

- **The photo** — the smallest, weakest unit. Even stripped of metadata it carries: the angle and
  color of light (time of day, rough direction it faces, season), what's in the frame, who's in it,
  who uploaded it, and the filename + its numbering (a camera's sequence tells you which shots were
  one burst — even with every timestamp gone).
- **The moment** — a cluster of photos close in sequence / scene / faces / time. This is the real
  unit of identity. A single beach photo proves little; "fourteen shots, midday sun from the south,
  the kids and the water, sequential numbers off Helen's phone" is *obviously* the beach.
- **The trip** — a set of moments with a shape: a base (where you sleep), days, a geographic
  footprint, sometimes a plan. It says "everything here is within this town, this week."
- **The series** — the family's whole history: the same beach house, the same Grandma's, the same
  first-night rhythm, over and over.

## 2. The heart: information flows both ways

- **Up (pooling):** a photo too weak to place is placed by its *moment*; a moment too weak, by the
  *trip*; the trip's ambiguities, by what the *series* already settled.
- **Down (anchoring):** one certain fact at any level — a GPS shot, a hand-file, a "yes" on the
  card, a place we've seen ten times — doesn't just place itself. It **locks its moment and sharpens
  its neighbors.**

This two-way flow is the idea. It's why "hierarchical" is the right frame and not jargon: the whole
value of a nested model is *borrowing strength across levels* — a place seen once still counts; a
moment with one known photo lends that answer to its siblings; a lonely photo inherits the
confidence of the structure around it.

## 3. The missing spine: a persistent Family World Model

The one genuinely new thing to build — and the reason the app doesn't get smarter every trip today
— is a **durable, growing model of the family's world that spans trips**, not per-trip scratch work.
It holds:

- **Places** — the recurring stops (the beach house, Grandma's, the town beach, the regular
  restaurants) with a *footprint* (rough area), a name, typical *timing*, and a confidence that
  grows every trip that visits them.
- **People & groupings** — who tends to be together, who shoots what.
- **Rhythms** — first-night-at-base dinner, morning-beach, the family's temporal habits.

It's **learned from data we already have** — every photo hand-filed by a person, every GPS-stamped
photo (self-labeled by where it was taken), every past trip's finished/settled album, every future
"yes." Using those is *not* asking the family to do labeling work; it's the app finally reading what
you've already told it by living your life. That is exactly "heal from what it already holds."

Everything else hangs on this spine. The witnesses become the *observation* layer feeding it; the
confirm card becomes the *correction* layer feeding it back.

## 4. How today's work folds in (nothing is thrown away)

- The **witnesses** (time / place / scene / faces / weather / filename-order / human words) stay —
  but as *evidence at the photo and moment levels*, not the last word. Their job is to inform the
  hierarchy, which resolves the assignment jointly.
- The **confirm card** shrinks to its true purpose: the genuine unknowns only. Once the world model
  is rich, most photos are recognitions, not questions — the card is for the truly new or truly
  ambiguous. And every answer it gets **feeds the series model**, so the app needs to ask less each
  trip.
- The **provenance/locking** work (human filings beat machine guesses) becomes how the world model
  stays honest: strong human labels anchor it, weak machine inferences never ossify.

## 5. How we know it's working (the real scoreboard — not green tests)

The honest test isn't a passing suite. **It's whether the model recovers the answers the family
already gave.** We have a mountain of settled filings (hand-files, GPS photos, finished trips). Hold
some out, hide them from the model, and measure: *does it put those photos where you already put
them, without being told?* Better than the flat engine does? That's the number that matters, and
it's measured on your real trips, not synthetic fixtures. "Create instead of passing tests" = this
is the scoreboard we build against.

## 6. The open decisions — where I need your thinking (talk this through)

These are genuine forks, not things I've decided:

1. **Moment-forming is chicken-and-egg.** Photos cluster into moments by time+scene+faces+sequence
   — but the clustering is itself uncertain, and *placing* a moment can change how it should
   cluster. Your own Provincetown rule (identical coordinates for lodging/beach/parade are
   *legitimate*, don't over-merge) is exactly this tension. Do we cluster loosely first, place, then
   *re-cluster as evidence firms* — accepting that moments can split/merge as the model learns? I
   think yes, but it's the riskiest design choice and I want your read.
2. **How literal is the math.** "Hierarchical modeling" can mean a heavy statistical machine, or a
   principled but simpler scheme where confidence flows up and down the levels. My honest lean:
   start with the *right shape* in the simplest form that borrows strength across levels, and let
   the real-data scoreboard (§5) pull us toward more sophistication only where it earns it — rather
   than opening with a big model. But you raised the heavier version deliberately; I want to know how
   far you want to reach on day one.
3. **Poisoning.** A wrong label (a mis-file, a careless "yes") could corrupt a durable world model.
   How strong should a single human label be, and how do we let later corrections *heal* the model
   instead of one bad datum setting like concrete? (This is where the human-beats-machine tiering
   we've built becomes load-bearing.)
4. **Cold start.** The very first trip has no history. The model should degrade gracefully to what
   exists today (trip-level), then compound each trip. So this is a *spine we add under* today's
   engine, not a big-bang rewrite that breaks the working app. Confirm that's the posture you want.

## 7. Phasing — at altitude, not a task list

1. **Build the Family World Model as a first-class, persistent thing** — the place/grouping/rhythm
   memory that spans trips, seeded from the labeled corpus. (The missing spine.)
2. **Make the *moment* the unit of assignment** — resolve moments jointly using bottom-up pooling +
   top-down anchoring, with the existing witnesses feeding in as observation-level evidence.
3. **Close the loop** — the confirm card + hand-files feed the world model; the richer world model
   shrinks what the app has to ask.

Validated against real held-out filings (§5) at every step — so we always know whether we're
actually making the app *know your family*, or just moving.

---

*The thing I got wrong for two weeks: I built breadth at the photo altitude and hardened its edges.
This is the altitude the problem actually lives at. I'd rather be slow and right about the shape
than fast and flat again — which is why this is a plan to argue with, not a green light.*
