# The Healing Model — how the app gives the family back their trip

> Status: DRAFT to argue with (2026-07-18). Supersedes `DESIGN_THE_FAMILY_WORLD_MODEL.md`, which
> forced one shape (a single hierarchy) onto signals that need many, and framed uncertainty as
> something to confess rather than the material the app works in. Plain language on purpose. This
> is a plan at the modeling altitude, not a build spec — meant to be pushed on before any code.
> Nothing here flips a knob or ships. `PHOTO_CONFIRM_MODE` and `PHOTO_FACES_MODE` stay off.

## 0. What it's for (never lose this)

Give the family back their trip. The app quietly reconstructs the missing pieces of each trip from
what it already holds, so the family can sit down and relive it — and each person can pull up
just-me or just-Rafa — without ever doing archaeology. That is the whole job. Everything below
serves it.

## 1. The one idea

Stop trying to be *sure* where a photo goes. **Heal it** — place the best graded guess from the
evidence the app already has, softly and reversibly — and keep a living, graded sense of how well
each piece is holding together. The app acts *under* uncertainty. It does not wait to be certain,
and — the part I kept getting wrong — it does not hand a photo to the family every time it falls
short of sure. Uncertainty is the material the app works in, not a reason to stop or to punt.

## 2. The asymmetry that makes acting-while-unsure safe

This is why the app can act without certainty and still be trustworthy:

- **Acting is cheap.** A placement is soft and reversible, never poses as a fact, and never
  overwrites what a person did. A graded guess that's a little wrong costs almost nothing — the app
  corrects itself as more evidence arrives, and the family may never even notice.
- **Asking is expensive.** Every question spends a finite, precious thing: the family's attention
  and delight. Ask too often and the charming feature becomes a chore no one does — and the app
  dies.

So the bar to *act* is low (act on your best graded read) and the bar to *ask* is very high (rare,
earned, a genuine pleasure). This is the exact inversion of my instinct. Falling short of "very
sure" is **not** a trigger to ask. It's a trigger to heal softly and keep watching.

## 3. How a photo gets placed

- **It settles; it isn't scored.** Candidate places and moments compete and lean on each other —
  leak and mutual push (the "Gestalt accumulator": leaky competing accumulation / relaxation
  labeling) — until the whole run of photos settles into the most coherent reading.
  Grouping-into-moments and placing settle *together*, so neither has to come first.
- **It heals from what's already held.** When a signal is missing — a stripped GPS, a lost time —
  the app reconstructs it from the photo's neighbours, its camera sequence, the family's past
  trips, even the pixels. (This is the imputation the app already does with GPS; the plan extends
  it past GPS.) A reconstructed value carries *wider doubt* and is booked as derived — it never
  poses as a real reading, and it never gets to vouch for the very neighbours it was borrowed from.
- **Agreement is discounted.** Time, place, faces and camera-order move together inside a moment,
  so the app must not count them as separate witnesses — or it becomes most confident exactly when
  it should be least. Getting this right matters more than which accumulator we pick.
- **A ladder of models, not one — and which one speaks is itself graded, local, and moving.** There
  is no "simple model" and "fancy model" that we choose between at some data scale. There's a
  *ladder*: the three plain rules at the bottom (same burst + same day + same faces → one moment,
  else leave loose), always on and needing almost nothing; the richer models — timing,
  place-recurrence, faces, composition, the full settling spine — stacked above, each **switching on
  per signal, per place, per person, exactly where the local data earns it.** The same trip can have
  one cluster resolved by the rich recurrence model (a place seen ten times) while the cluster beside
  it rests on the plain floor (a brand-new spot), in the same instant. As trips accumulate, more of
  the data climbs the ladder; where it can't climb, it degrades gracefully to the floor — so there is
  never a gap and never a crash. (This is what "impose priors now, harden as the series grows" in §6
  *is*, mechanically: a hierarchy that leans on the level above it exactly to the degree its own data
  is thin. Model-choice is not a switch flipped at a scale threshold — it's the same graded, moving
  dial as every other threshold here.)
- **Imputation feeds the ladder.** Reconstructing a missing signal — with its doubt attached — raises
  how much honest evidence a cluster holds, so imputing where it can lets parts of the data climb to
  a richer rung than their raw signals alone could reach. Healing isn't only filling holes; it's
  strengthening the dataset so more of it qualifies for better treatment.
- **Seeded.** The one spine underneath (grouping, placing, and "this place keeps recurring" as one
  object — grow a new place/moment only when the evidence demands it) starts seeded with the places
  the family already returns to (the beach house, Grandma's), so a brand-new trip isn't starting from
  nothing.
- **Every threshold is local and moving.** Per signal, per place, per person — and shifting as
  trips accumulate. A recurring place sits below the line for a trip or two, then crosses and
  stays; a brand-new place is honestly below it. Nothing is a fixed rule. "Not enough data yet"
  means a line hasn't been crossed yet, not that anything is broken.

## 4. What "unsure" does — how the app acts, and how the family sees it

Confidence doesn't split into sure / unsure. It flows into four behaviours:

1. **Strong** → file it silently. The family never has to think about it.
2. **Good enough** → heal and place it softly, reversibly, at its honest tier. Still no ask.
3. **Genuinely torn, *and* a glance would settle it, *and* it would be a pleasure to look** → the
   rare, delightful question: two options, one tap, framed as reminiscing ("the beach house or the
   harbour?"). The smallest bucket, not the default.
4. **No signal, or no single answer even exists** → leave it loose, quietly. Two places both truly
   fit (the lodging and the beach stacked on one spot), or there's nothing to go on — asking buys
   nothing, so the app stays quiet rather than spend a question no glance could answer.

The line between 3 and 4 is *torn* (a glance teaches the app something) versus *nothing to resolve*
(a glance can't). Only the first ever earns a question.

**Showing it, not just doing it (the half I had left out).** The four destinations above are all about
what the app *does* internally. A multi-model weather app makes the missing half obvious: it doesn't
just resolve its uncertainty, it **shows** it — many faint model-lines fanning out behind one bold
consensus, pinched tight where the models agree and spread wide where they don't, plus a plain
sentence ("most models show rain starting at 2 PM") and a small distribution of outcomes (71% / 29% /
6%). The uncertainty isn't hidden or flattened to one false-crisp number; it *is* the content, shown
calmly and legibly — and it asks nothing of the viewer.

That's a whole family-facing mode, and it's the *right* one for reliving a trip, because remembering
is itself uncertain ("was that Tuesday or Wednesday? the first beach or the second?"). Showing the
seams is fidelity to memory, not a weakness to hide — and it's the calm middle between acting silently
and asking a question: the family can glance and absorb it, or ignore it, at no cost. Done well it
isn't a hedge or an apology; it's its own quiet pleasure — which means communicating uncertainty
isn't a budget to spend carefully like the ask, it *adds* to the reliving. In our warm idiom, not a
dashboard:

- A moment with a **firm core and soft edges** — the shots that clearly belong drawn solid, the
  maybes faded or dotted rather than forced in or dropped. (The bold consensus line + the fan.)
- A gentle read that **owns the graded picture**: "these twelve look like one afternoon at the beach
  house — a couple near the end might be the walk home." (The plain sentence.)
- Where there's a real fork, the **alternatives shown as a small spread**, information first — "most
  likely the beach house, maybe the harbour." The same object as the rare two-tap ask above, but seen
  *before* it is ever a question: shown, not demanded. (The distribution bars.)
- Firmness that **moves across the album** — solid where the app is sure, soft where it's reaching —
  which is "confidence is local and moving" (§3) made visible, exactly as the forecast's fan is tight
  at dawn and wide by afternoon.

So the family-facing side has **two modes, not one**: the everyday **show** (communicate the graded
read) and the rare **ask** (resolve a genuine fork). And this needs no new machinery — the
distribution *is* the conformal set (§9.4), the fan *is* the model ensemble / the ladder (§3, §9.2),
the tight-then-wide shape *is* local-and-moving confidence. I had simply not been *showing* any of it.

## 5. It never poses as a fact

- A reconstructed or guessed value sits *below* a real reading and can never overwrite a person's
  own filing. (The provenance tiers already built do this; the plan generalises them.)
- Because everything is soft and reversible, a wrong graded guess is self-correcting, not a scar.
- A derived value is never allowed to confirm the neighbours it came from — the one path by which
  imputation could manufacture false confidence.

## 6. It gets smarter every trip

The app imposes sensible priors now (seeded recurring places, gentle assumptions about rhythm) and
*replaces* them with learned structure as the family's history grows. Early on it leans on what we
tell it; over trips it leans on what it has seen. Cold start degrades gracefully to roughly what
exists today, then compounds.

## 7. How we'll know it works (the real scoreboard, not green tests)

Run the model over real trips and see where it agrees with where the photos already sit — and, more
usefully, where it *diverges*. But hold this honestly: **no single element is ever definitive — not
now, not ever.** Where a photo currently lives is one fallible witness (it's full of import defaults
and misfiles nobody blessed); a GPS-anchored shot is another; a burst is another; a future "yes" on
the card is another — and not one of them, not even the family's own tap, is ground truth (people
misremember; a default isn't a decision). So the scoreboard reads *agreement across* these soft
witnesses and treats a *disagreement* as a flag to look at — never a verdict on the model or the
filing. Its most valuable output is the divergences: the exact photos where the current organization
and the model's read part ways, which only a glance resolves (the residue again, at the level of
judging correctness). Nothing is stamped true-forever; every reference stays revisable.

**Build for the future, not just the past.** Grading against the frozen archive is a sanity check,
not the goal — the goal is a system that places *next* trip's photos well because it learned from
this one, and improves every trip. Measured reality (read-only against prod D1, 2026-07-18): ~235
memories across ~4 real trips, 210 already filed to a place, but **zero carry any provenance** — the
record of *how* each landed (deliberate hand-file vs default vs machine guess) is empty everywhere.
So the clean answer key — deliberate "yes, this is right" — *does not exist yet*. That's not a gap to
mourn; per §6, attributed truth is a **future asset the running system manufactures**: every future
file and confirm lays down durable, attributed evidence the past never had, so the world model
compounds and a real answer key *grows*. The past tells us where we start; the forward loop is where
the thing earns its keep.

## 8. What this is NOT

- Not a certainty machine. Never 100% sure; doesn't try to be.
- Not a chore generator. Uncertainty routes to the app healing softly, almost never to the family.
- Not hard rules. Every line is graded and moving.
- Not a rewrite. A spine added *under* the self-healing engine you already designed.

## 9. The machinery underneath — everything, in one system

Sections 0–8 are what the family *feels*. Here is the machine that produces it, with the
quantitative-psychology and Gestalt pieces named and put in their places. It is **one loop: the
family's living record informs how each new photo heals, and each healed photo feeds the record
back.** Seven interlocking organs.

**1. The world model — the family's living record (the persistent spine).** A durable, cross-trip
memory of the family's world: its *places* (each a fuzzy footprint + name + typical timing + a
confidence that grows every visit), its *people* (who tends to be together, who shoots what), its
*rhythms* (first-night dinner, morning-beach). Mechanically a **hierarchical Dirichlet-process
mixture**: a recurring place is a shared cluster that accrues evidence and hardens trip over trip,
with a power-law (Pitman-Yor) shape because a few places dominate and a long tail are one-offs. It is
the **top of the ladder** and the **top-down prior** that flows into every placement (Gestalt: *the
whole constrains the part* — the trip's shape helps place the photo). But it is only a *piece* — a
prior into the settling, not the whole model; alone it is the thing that would confidently misfile the
off-rhythm photo you most want right, so its feedback is clamped and its "this place recurs" belief
**decays** when a family's life changes (moved house, a death).

**2. The signals — each read by the model whose shape fits it (the federation / the rungs).**
- *Time & inter-photo gaps* → an **ex-Gaussian / changepoint** model finds moment boundaries (Gestalt
  **proximity** and **common fate** in time); bursts survive stripped timestamps via camera
  **sequence** numbering.
- *Place / GPS* → **density-based clustering + a gazetteer prior**, so proximity *proposes* and the
  other dimensions *dispose* (the Provincetown guard: identical coords are legitimate).
- *Composition / visual style* → a **flat classifier learned across the whole library irrespective of
  trip** (the "gestalt of the frame") — the pixels are the one channel never stripped, so this is the
  floor-raiser when metadata is gone.
- *Faces* → a **co-occurrence tally** (who's-together). *Uploader, weather, captions* → weak channels,
  low weight, growing with data.
Each channel's separating power is an **unequal-variance signal-detection** quantity: a GPS lock is a
tight, high-d′ distribution; a composition guess is wide and low-d′; a hand-file is a sharp "signal"
against the diffuse "open/unfiled" mass. They cannot share a threshold.

**3. The Gestalt accumulator — the settling (the integrator).** The channels don't get summed; they
**settle**. A **leaky competing accumulator** (equivalently **relaxation labeling / interactive
activation**): candidate places and moments leak and mutually inhibit, and each photo nudges its
neighbours, so the whole run relaxes into the single most coherent reading — grouping and placing
settle *together*, dissolving the chicken-and-egg. This is Gestalt made math: local ambiguity resolved
by global coherence (*whole-constrains-part*). The activations *are* the graded/fuzzy membership;
"nobody crossed the line cleanly" *is* the residue signal. The **correlation villain** lives here —
signals co-vary (**General Recognition Theory**), so the accumulator must discount redundant agreement
or it is confident exactly when it should not be. And **possibility theory** lives here: keep
*conflict* (two places both fit) separate from *ignorance* (no signal) — the genuine "fuzzy" that
probability alone flattens.

**4. The confidence scalar → the decision (the moving criterion).** The settled state is calibrated
into a confidence — best via **conformal prediction**, which is distribution-free and returns a
*set*: one element → file silently; two → the delightful two-tap card; huge/empty → honestly unsure.
The decide/heal/ask/leave-loose line is a **moving signal-detection criterion** (**Chow's reject
option**), set by base rates (how often this family comes here) and costs (a misfile vs a needless
ask) — never a fixed number. Which single photo earns a rare ask is a **value-of-information** choice
(ask only where a glance would *teach* — epistemic — never where nothing can resolve it — aleatoric);
the *rate* of asking over a series is a budgeted **optimal-stopping** problem, because delight is
finite.

**5. The ladder — how 2–4 switch on by locally-earned data (partial pooling).** **Hierarchical
partial pooling / empirical Bayes** is the substrate: each rung leans on the level above exactly to
the degree its own data is thin. The three plain rules are the always-on floor; the richer models
speak locally, per place / person / cluster, wherever the data earns them; the same trip runs
different rungs at once. **Multiple imputation feeds the ladder** — reconstructing missing signals
with their doubt carried forward (booked as derived, never vouching for the neighbours it came from),
so more clusters climb a rung.

**6. Never poses as a fact (the honesty spine).** Provenance tiers: derived sits below real, human
beats machine, a heal never clobbers a hand-file; everything soft and reversible — which is *why*
acting-while-unsure is safe. "Unfiled" is a censored, non-random (people file the flattering/legible
shots) observation — never a negative, anywhere.

**7. How we know it works (the scoreboard).** Hold out **whole trips** (not scattered photos, which
cheat via burst correlation), measure recovery of the family's own filings, reward **sharpness** not
just caution (**proper scoring** — Brier / log-loss with reliability–resolution), and **Q-Q** the
distributional assumptions against real data. First, before anything: *measure the corpus* to read how
far up the ladder today's data climbs.

The seven interlock: the world model (1) is the prior that flows into the settling (3) of the evidence
each signal-model (2) supplies; the settled confidence routes through a moving criterion (4) to four
soft destinations, the ask the smallest; the whole stack switches on locally by earned data (5) with
imputation feeding it; provenance (6) keeps every step honest; the scoreboard (7) proves it on real
trips. The "world model" isn't the plan — it's one organ of it, exactly as you said: it makes sense,
and it is incomplete alone.

## 10. How it meets the threshold you set

- Act under uncertainty, never require certainty → §1, §2.
- The ask is rare, earned, delightful — never the dumping ground for "not sure" → §2, §4.
- No hard rules; thresholds local, graded, moving → §3, §8.
- Uncertainty is the material and the invitation, not a confession → §1, §4.
- Heal from what the app already holds (the imputation you designed) → §3, §5.
- A reconstruction never poses as a fact; derived never vouches for its source; correlation is the
  villain → §3, §5.
- The Gestalt accumulator / settling; grouping and placing co-settle → §3.
- One spine, not seven → §3.
- Impose priors now, harden into learned structure as the series grows → §6.
- Many tools for many-shaped signals, and an irreducible Gestalt residue → §3 (settling) + §4
  (residue → the rare glance, or left loose).
- Honest scoreboard on real held-out trips; ground-truth-first → §7.
- Grounded in cognitive psychology (a moving criterion, evidence accumulation, possibility vs.
  probability) → throughout.
- Builds on your design, non-coder-readable, doesn't ship → §0, §8, and this whole doc.

## 11. Honest confidence (graded, per part — because a single number would be a lie)

- **High** — the *shape* is right: heal instead of classify; act reversibly on a graded read; ask
  rarely. The asymmetry in §2 is sound, and it's what makes acting-while-unsure safe rather than
  reckless. Imputation-with-doubt is your design done properly. The reversibility/provenance spine
  it leans on already exists and works today.
- **Medium** — that the one settling spine runs well on-device and stays honestly calibrated; that
  the rare ask can be made *delightful* (that's an unsolved design problem, not a solved one); that
  the seeded cold-start priors fit *this* family rather than my guess of a family.
- **A question I wrongly re-opened, now closed** — "does the settling machinery beat three plain
  rules at current scale?" was a binary I never should have posed (we settled it turns ago). It isn't
  fancy-vs-simple at one scale: the plain rules are the always-on floor, and the richer models only
  ever *add* where the local data earns them, falling back to the floor where it doesn't. There is no
  scale at which the system is "worse than the rules," because the rules are always underneath. What's
  left is not a fork to decide but a *reading to take*: how far up the ladder your real corpus can
  currently climb.
- **The deepest risk, which no model removes** — there is no perfect filing to measure against. The
  family's own filings are the closest thing to truth there is — the reference itself, not a flawed
  copy of some correct answer sitting above them — and they are *partial* (most photos left open,
  which is not-yet or no-single-home, never an error) and *personal* (many hands, different days, no
  single scheme, because they were living, not cataloguing). So a model can look perfectly faithful to
  the filings they did make and still quietly misplace the rest, and there is nothing cleaner to catch
  it, because their record *is* the answer key. Only whole-trip held-out testing and their own eye
  confirm it. (The app honors and completes that record — it never grades it as if a perfect version
  were the standard.)
- **What moves each of these** — measure the real corpus first; build the dead-simple baseline
  *first*; add settling/structure only where it beats that baseline on held-out trips.

The confidence assessment follows the plan's own rule, corrected: complexity isn't a single bet we
place and then measure to see if it paid — it *earns its place locally and continuously*, rung by
rung, wherever the data supports it, with the plain floor always beneath. "Measure the corpus first"
isn't hedging on whether to build the ladder; it's reading how far up the ladder today's data already
reaches.

## 12. The build order (pinned 2026-07-19, after a real drift back toward "floor first, then we'll see")

The drift this section exists to kill: proposing the plain floor as its own phase with the rest of
the machine waiting on a report. That re-opens the settled ladder as a fancy-vs-simple fork. The
ladder is ONE machine. Construction has a sequence, but every step builds *that machine*, and the
whole machine runs — in shadow, locally — from the first slice. The floor is its bottom rung and
permanent fallback, never a gatekeeper the other rungs petition.

1. **The evidence bench** (pure, node-tested, both mirrors): for a trip's photos, every witness laid
   out as GRADED evidence per moment — time-gaps with soft (ex-Gaussian-shaped) boundaries, place
   reads, camera-sequence bursts, faces, composition, the *current filing as one witness among peers*
   (§7), and the world-model prior. Missing signals abstain; imputed values enter with their doubt,
   booked derived (§3, §5). Much raw material already exists in the witness fleet — the new thing is
   one common shape: evidence with a grade and a tier.
2. **The settling engine**: the Gestalt accumulator over the bench — leak + mutual inhibition,
   relaxation into global coherence; moments and places co-settle. Output per photo/moment: graded
   membership, the conflict-vs-ignorance split (§9.3), one of the four destinations (§4).
   Correlation-discounting built in from day one (the §9 villain), not bolted on later.
3. **The world-model organ**: the durable cross-trip places/rhythms memory (§9.1), seeded from the
   trips the corpus already holds (the Provincetown stacked places, the bases), feeding the bench as
   a CLAMPED, decaying prior. A local artifact — no schema, no migration, until that gate.
4. **Imputation as the rung-lifter**: generalize the existing moment-scoped GPS propagation pattern
   so reconstructed time/sequence/place evidence lifts thin clusters a rung — doubt attached,
   derived-tier, never vouching for its own sources (§5).
5. **Shadow run on the real corpus**: pull the real trips (read-only), run the WHOLE ladder locally,
   read out where the engine, the floor rung, and the current filing agree and diverge (§7). The
   divergence list — the glance-worthy residue — falls out of running the real machine, not from a
   separate floor-only errand.
6. **The forward loop from first contact**: whenever the engine's writes are eventually enabled
   (a knob gate, far off — nothing writes today), every placement stamps attributed provenance, so
   the empty column §7 measured starts filling the day the machine acts; the confirm surface (built,
   knob off) supplies the human stamps. The family-visible "show" mode (§4) gets a loop-Design
   prompt before any surface is built.
7. **The scoreboard grades every rung the same way throughout** (built; local; witnesses-agreement
   semantics per §7).

Standing gates unchanged: commits, pushes, deploys, migrations, knob flips — Jonathan's, per action.

## 13. The likeliest drift (pinned): over-weighting imperfection in a channel

The guessing is not the danger — the reflex AGAINST guessing is. This build's honesty machinery
(derived tiers, abstention, never-poses-as-fact, correlation discounting) all faces one direction:
false CONFIDENCE. The likeliest real failure runs the other way: worry about invention curdles into
distrust of a whole channel — "captions are too few," "filings are unattributed," "vision names are
guesses" — and an imperfect-but-real signal gets demoted toward silence. That starves the ladder and
freezes the floor, and it is invisible: a misfile is a visible, reversible error; a muted channel
never shows you the placements it would have gotten right. It has already happened once here (the
caption matcher parked wholesale on a 9-vs-10 hard threshold — a channel switched OFF by judgment
instead of left to whisper at its measured grade). Pinned guards:

- **Imperfection is the medium, not a disqualifier.** Every channel speaks at its measured grade,
  always. There is no "too noisy to use" — only "currently weighted lower, still speaking."
  Abstention is for ABSENT signal only; it is never a demotion tool for imperfect signal. Any
  proposal to park, switch off, or hard-threshold a channel IS this drift, by definition — the
  answer is a lower graded weight, not a gate.
- **Weights are measured, never felt.** Every number in the evidence bench (kernel scales,
  per-witness weights, the noise floor) is a SEED — provisional until fit from the family's real
  data (HM-5). No channel's weight is lowered by judgment; only a measurement re-grades it,
  locally, under the moving-thresholds rule (§3).
- **Calibration is symmetric.** Under-confidence is hunted as actively as over-confidence: the
  scoreboard rewards sharpness (abstain-on-everything scores as the non-answer it is), and the
  Brier reliability–resolution split surfaces resolution left on the table — the signature of an
  under-weighted channel.
- **Ablation is the arbiter.** In the shadow run, each channel is dropped in turn and the recovery
  delta measured. A channel whose absence costs more than its assigned weight implies is
  UNDER-weighted and gets raised. The measurement replaces temperament — in both directions.

## 14. Heterogeneity and the emergent path (pinned)

The system is multi-channel (every §9.2 witness, with channels JOINING as they come online — a
channel that doesn't exist yet abstains in the same grammar as a photo missing a signal, so new
channels join without re-architecture), multinomial at the decision layer (support across ALL
candidate places, resolved to the four destinations — with memberships deliberately UNNORMALIZED
until decision time so stacked-places conflict survives instead of splitting), and multidimensional
in identity (proximity proposes, the other dimensions dispose; the correlation discount is the guard
multidimensional structure demands). The data classes are heterogeneous BY NATURE, so no single
approach is ever "the" pipeline:

- different at different MOMENTS — adjacent clusters on different rungs in the same instant (§3);
- different across TRIPS — a metadata-rich trip runs high on the ladder, a stripped-photos trip
  leans pixels + sequence, per-trip availability moves which rungs speak;
- different across the app's LIFE — cold-start priors → learned structure (§6); channels arriving
  over the development cycle (faces, confirms, captions-at-strength) join by starting to speak;
  seed weights → fitted weights (§13).

And the routing between approaches is EMERGENT, never a switchboard. There is no "if GPS present
use path A" tree — that would be the hard-rules drift wearing routing clothes. Availability itself
shapes the path: absent evidence abstains, present evidence speaks at its measured grade, local
thresholds move — so the best multi-dimensional analytic path WINS BY CONSTRUCTION wherever it is
available. The win criterion is measured, calibrated performance under BOTH guards — §9's
correlation discount against false confidence, §13's symmetric calibration against false
diffidence — never a hand-authored preference for one tool over another.

## 15. The gestalt is not evaluable in parts (pinned)

THE GESTALT IS THE POINT. A half-built machine is not a small version of the whole — it is a
different, misleading object, because the whole is not the sum of its parts. A shadow run over two
rungs would produce a divergence map that LIES: the missing organs (above all the world-model
prior, §12.3) are precisely what reshape every reading, so a fragment's numbers send us to wrong
conclusions with false confidence. Therefore: **no fragment shadow-run, no divergence map, no
"peek" at real trips until the machine is WHOLE.** Construction proceeds straight through; HM-5
runs ONLY the whole. Offering to evaluate, measure, or "take a look at" a rung mid-build IS the
drift — the same incrementalism as floor-first (§12) in a new costume. Build the whole; do not
sample it.

**The roster (pinned, AUDIT-1): "the WHOLE machine" = HM-1..6 as-built** — bench, settling
engine, world model, imputation, the vision place-witness, and the forward loop. The Learning
Spine (O7) and the lattice (O8) JOIN the roster when they land; F4's whole-or-abort test checks
against the current roster, and pre-O7/O8 shadow rows are wiring-verification only, never
promotion evidence. **Exemption (AUDIT-1): measurement ablations are sanctioned** — once the
machine is whole, the-whole-minus-one-channel runs are REQUIRED instruments (§13); their results
go to the local harness report only, never the served or shadow ledger.

## 16. Ground truth: the corpus is VISION-dominant — the machine was built for absent signals (measured 2026-07-19, real D1)

Signal availability across 271 real photos: **vision** (composition / placeType / signage / labels /
name) **97%**; time (capturedAt) 62% (usable local time far less — offset only 13%); **GPS 7%
overall, ~3% on the real family trips** (Provincetown 4/118, jackson 0/45, nyc-rafa 1/41; only the
`trip-mp2vndah` import carries GPS, 15/26); **faces 0%**; **camera-sequence 0%**; scene-hash **257
distinct of 263** (exact-match grouping never fires). placeType is a real 11-value vocabulary
(beach 50, event 49, residential 38, museum 22, restaurant 12, …); vision also carries `signage`
(OCR) and a one-line `name`.

CONSEQUENCE: the machine's place-witnesses (gps / time / faces / sequence) are absent-to-sparse on
real data, and the one abundant signal — vision — has NO placement pathway (the placeType witness is
a stub; the scene witness is exact-hash only). **As built, the whole machine is nearly BLIND to this
corpus: it would abstain and leave everything loose.** So HM-5's real run is BLOCKED until the
machine can see: it needs a **vision-placement witness** — signage→landmark, placeType→typed-stops,
and cross-corpus composition / name / label similarity to the 210 existing filings (the evidence
classifier). This is the PRIMARY place-organ for a GPS-less library, exactly the pixel lever flagged
throughout. (Parts already exist in the witness fleet — signage/landmark, vision-sameness — to fold
in.) Approach to be aligned with Jonathan before building (the modeling piece).

**RESOLVED (dated note, AUDIT-1 2026-07-19): the blocker above is CLEARED.** Jonathan
aligned the approach same-day ("Yes, build the vision-placement witness"); the witness
was BUILT and wired (visionPlacement.js: signage/placeType/lookalike), and HM-5's
honest run happened ON THE SIGHTED WHOLE (filing held out, per-day scoping): recovery
68%, ask-rate 22%, lookalike the #1 channel by ablation. The Glance's measured numbers
postdate the sighted machine and stand. This paragraph is kept for provenance; the
consequence text above no longer describes the machine.

## 16b. The four review lenses (pinned 2026-07-19): "critical" is not only truth

"Truth-critical" is a trained reflex in this project (locks, provenance, honest copy).
The other three pillars deserve the SAME review teeth, and every spec, build, and
adversarial review passes through ALL FOUR — each is a named failure class + the
question that catches it:

- **Truth-critical** — the app lies, or loses a human act. *Ask: can this path claim
  what didn't happen, or clobber a person's truth?*
- **Multidimensional-critical** — ONE dimension silently decides what dimensions must
  decide together (the founding Provincetown sin, in any clothes — proximity, lexical,
  temporal). *Ask: where does a single channel act dispositively? Every collapse/merge
  cites its agreeing dimensions or the contradiction that blocked it.*
- **Heterogeneous-data-critical** — one shape forced onto differently-shaped signals: a
  shared threshold, absence-as-negative, a parked channel, a felt weight. *Ask: does any
  channel get gated, normalized, or shaped like its neighbor instead of like itself?*
- **Gestalt-critical** — a part acted on or judged where the whole is the unit:
  per-photo acts that should be per-moment, fragment metrics, grouping before placement,
  new evidence without a whole re-settle. *Ask: would the whole read differently than
  the part this touches?*

Provenance of this section: Jonathan asked whether the truth discipline extended to the
other three; the honest answer was no — and a same-day audit of the F2 spec found a
name-only collapse (multidimensional violation), a missing whole-re-settle statement
(gestalt), and an unstated abstention posture (heterogeneous). All repaired. The lenses
exist so that never needs a person to catch again.

## 16c. The Learning Spine (pinned 2026-07-19): tuners as sophisticated as the machine

Jonathan's bar: every digested decision must GENERALIZE, like a human cognitive system —
so the same KIND of question never needs asking again — with tuners that are
multinomial, multidimensional, heterogeneous, best-shape, Gestalt-and-cog-psych-shaped.
And the failure-mode preference, encoded not promised: **slightly down-weight
fabrication, up-weight failure-to-learn** — an eager-but-soft generalization costs one
reversible placement; a failure to learn costs every future repeat of the question.

**Keystone: learning is a PURE REPLAY, never a stored state.** All learned structure is
recomputed each run as a pure fold over the ledgers the app already keeps (decisions +
answers + divergences). Auditable (the operator gauge shows what was learned from which
rows), reversible by construction, zero new write classes, trivially cheap at family
scale. The tuner is an organ of the same machine: pure, mirrored, parity-gated,
ablation-audited, §16b-reviewed.

Six altitudes of lesson extraction per digested decision (mirroring the machine's own
nesting): 1 instance (the filing + cascade — built) · 2 exemplar (vision corpus —
built) · 3 ATTENTION (error-driven, surprise-weighted per-witness credit vs the
machine's lean — Rescorla-Wagner/ALCOVE-shaped; contradictions teach most; the
divergence datum is never discarded again) · 4 CONTEXT (attention lands in a
partial-pooling hierarchy global ← trip-shape ← place-kind ← person/device; a node earns
divergence from its parent only as its data supports it) · 5 SCHEMA (kind-shaped
Gestalt induction: structure answers post rhythm hypotheses, christenings post places,
calibrations post patterns — whisper-strength, recurrence-hardened, decaying) · 6
HYPOTHESIS-CLASS TRUST (per-class per-context confirm rates; a trusted class's future
instances AUTO-APPLY SOFTLY instead of asking — the question kind retires for that
context; the show mode whispers standing assumptions so retirement is never
concealment).

The asymmetry is structural: everything learned enters derived-tier (heals softly,
never silent-files, never crosses a lock, always gauge-visible) — the honesty spine
caps fabrication's cost, and THAT is what licenses eager learning. The fit criterion
scores asks as a failure-to-learn tax; auto-apply bars are graded and moving, never
hard gates.

## 16d. The World Model, fully specified (pinned 2026-07-19): a fact lattice, not a place list

Jonathan's catch: the built world model (HM-3) holds PLACES ONLY, while §9.1 promised
people & groupings & rhythms — so §16c's schema induction had nowhere to post most of
what it learns. The tuners outran the representation. Full specification — six branches,
every one grounded in signals already held, ALL derived by the same PURE-REPLAY fold
(now over trips + memories + answer ledgers), all graded/decaying/clamped/source-cited:

- **PEOPLE (the users are first-class subjects of learning):** photographer habits (who
  shoots what/how); presence & groupings (who's where/when/with whom; who splits off);
  curation styles (who files/confirms/skips — class-trust is per-person and lives here);
  answer-routing voice (WHO-routing sharpens every answer).
- **PLACES:** recurrence/footprint/timing (built) + CHARACTER (what the family does
  there: placeType × time of filed photos) + RELATIONS — practical adjacency, and
  **dimension-signatures for stacked places** (the founding case's payoff: lodging =
  evenings+indoor, beach = midday+sand, parade = July-4 morning+crowd — proximity
  proposes, learned signatures dispose).
- **RHYTHMS (promised, now specified):** daily shape (first-night dinner, morning-beach,
  the quiet hour) as boundary/time priors; trip shapes (stay vs city-break; the road
  trip stays the rare exception) each with its own expectations; splitting patterns
  (structure answers land + generalize here); calendar cadence (Provincetown each
  July 4th) so next year starts half-organized.
- **DEVICES:** per-source clock offset, upload lag (F3 calibrations are device-facts and
  LIVE here), metadata-survival profile (which source strips GPS) — expected holes,
  never surprises.
- **LEXICON:** the family's own names (christenings, captions) feeding signage/lookalike
  matching and card warmth.
- **META:** the per-family hypothesis-class trust ledger (§16c altitude 6) is itself a
  family-fact.

Guards unchanged and extended to every branch: a fact NUDGES, never asserts (the
priorCeiling clamp + decay apply lattice-wide); the off-rhythm photo always wins on its
own evidence; every fact cites its source rows (gauge-auditable); §16b all four lenses.
Scale honesty: at ~4 trips most facts are whispers shrinking to their parents — the
lattice fills at the family's own rate.

## 16e. The consistency mechanism (pinned 2026-07-19): audits are a PHASE, not an event

The failure this kills: corrections arriving only when Jonathan catches them — because
the audit depended on me *noticing* that something new invalidated something settled.
Diagnosis: code changes get fresh-agent adversarial review by standing convention (it
caught a real bug every single time today); constitution/spec changes were getting
author-self-audit only. Author-blindness is the exact disease the review rule exists to
defeat, and it applies at LEAST as strongly to design docs as to code.

The mechanism, standing:
1. **Every constitution change ends with a delta-audit.** Any edit to this plan, the
   specs, or a settled design ends by re-passing the SETTLED MANIFEST (top of
   BUILD_SPECS_GLANCE_ENGINE.md) against the delta — bidirectionally: the new section
   against every settled item, AND any new item against every existing section. The
   result is RECORDED even when empty ("audited, no findings") so absence-of-record
   visibly means not-done.
2. **Fresh eyes at checkpoints.** At the end of each F-item and before any Opus
   handoff, the settled docs get a COLD fresh-agent consistency sweep — one reviewer
   per lens (§16b's four + underspecification/promised-vs-built + internal
   contradiction), reading the documents as strangers. Same convention as code review;
   same severity: an unpropagated delta is a finding, not a footnote.
3. **The settled manifest** enumerates what "settled" currently means, each item with
   its last-audited marker. The audit is a checklist sweep, not a vibe.

## 17. The question space (pinned 2026-07-19): kinds of asks, by what the answer DOES

Picking-among-candidates is one corner of the space. The full palette (detail in
`DESIGN_PROMPT_THE_GLANCE.md`): **picking** (built) · **expanding the world** (the closed-world
danger: when the true place is on no list, every candidate is wrong — "somewhere else?" must be a
first-class outcome, and christening creates entities) · **structure** ("were you split up?" — one
answer restructures a day; merge/split; ordering) · **calibration** (a pattern, not a photo — one
answer re-weights a channel across every trip: the biggest cascade) · **gifts** (the answer IS
album content, and manufactures the D15 caption corpus as a side effect of reminiscence) ·
**spot-checks** (retire risk before a cascade). Cross-cutting: WHO (route to the likely knower) and
WHEN (fresh beats archaeology; mid-trip is sacred; behavior is an implicit answer). Guard: every
kind competes under the same worthAsking floor and delight budget — more KINDS never means more
QUESTIONS; a good calibration or structure answer pre-empts a dozen picking ones.
