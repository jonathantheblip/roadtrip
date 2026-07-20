# BUILD_SPECS_GLANCE_ENGINE — the Fable-day semantics specs (F2/F3/F4)

## THE SETTLED MANIFEST (audit checklist — §16e; update on every settle/amend)
| Item | Last audited against |
|---|---|
| Plan §0–§15 (the model + build order + drift pins) | §16b–§16d retro-pass 2026-07-19 |
| Plan §16 (vision-dominant corpus) · §16b (four lenses) · §16c (Learning Spine) · §16d (lattice) · §16e (this mechanism) · §17 (palette) | fresh-eyes sweep pending (today) |
| The Glance settled spec (bundle + 4 blessed calls + actuals rule + felt-whole gate) | §16c/§16d retro-audit (A1, A5) |
| F2 christening · F3 calibration · F4 integration (+ amendments A1–A5) | §16c/§16d retro-audit 2026-07-19 |
| Built organs HM-1..HM-6 vs what the plan PROMISES of them | AUDIT-1 sweep 2026-07-19 (promised-vs-built lens; gaps → A10/A11 + O-lane owners) |
| BUILD_PLAN_HM_WEEK (F/O lanes, rails, O7/O8) | AUDIT-1 2026-07-19 |

**AUDIT-1 recorded (2026-07-19): the first §16e fresh-eyes sweep ran — 6 cold
reviewers, 44 findings (12 high / 24 medium / 8 low), ALL resolved: highs + dangerous
mediums fixed inline (plan §15/§16, Glance call 1 + deltas, F2 guard/ordering/deletion/
masking/action, A1 widening); the remainder as binding amendments A6–A15. Next sweep
due: end of F5/F6, before the Opus handoff.**

**F5 delta-audit (§16e, 2026-07-19): fitted weights {placeType 0.6, worldModel 0.2}
landed in SETTLE_DEFAULTS with the measurement citation; checked against the manifest —
consistent with §13 (floor held, citation in code), §15/AUDIT-1 (ablation-as-instrument,
results local-only), F4 (the F5 baseline 71%/20%/2.6% becomes the promotion gate's
incumbent-side reference and Opus's no-regress bar). No settled text contradicted.
Audited, no findings.**

> Read WORKING_AGREEMENT.md first; this spec is a pointer, not truth. Status 2026-07-19.
> These are the truth-critical semantics Opus builds against (O2/O4 in
> BUILD_PLAN_HM_WEEK.md). Every mechanic here rides an EXISTING write class — zero new
> write classes, per the Glance handoff's invariant. Everything ships inert behind
> PHOTO_CONFIRM_MODE.

## F2 — "Somewhere else" + christening (the closed-world escape)

**The problem it solves:** every picking question is closed-world. When the family went
somewhere no list knows, every candidate is wrong — and without this path the machine's
only honest options are silence or a wrong guess. "Somewhere else" is the escape; a
typed name is a **christening**: the answer doesn't pick an entity, it CREATES one.

### The two gestures
1. **"Somewhere else" + a typed name → CHRISTENING.** Creates a real place and files the
   moment there (details below).
2. **"Somewhere else" + empty field (dismissed/blurred) → SKIP.** Identical to the S1
   quiet skip: no write, residue-free, the question may return. (The field is never
   pre-focused; abandoning it must never half-write.)

### Guard: a christening that names an existing place is a PICK — decided
MULTIDIMENSIONALLY, never by the name alone
Before creating anything, the typed name is soft-matched (Dice, same as the signage
witness; threshold a seed) against the day's candidates + the trip's stops. But a name
match ALONE never collapses (one dimension must not be dispositive — the founding
lesson in lexical clothes: "the beach" typed at a different beach than the existing
"Town Beach"):
- **Collapse to a PICK requires a strong name match PLUS at least one independent
  AGREEING dimension** (the moment's located coords near the stop's; a signage/lookalike
  match to the stop's exemplars). **Silence is NOT corroboration** (AUDIT-1: on this
  corpus the other dimensions are usually silent, so silence-collapse makes the name
  dispositive — the founding sin). And two discounts: a kind-word in the name means
  name↔placeType agreement is NOT independent ("the beach"→beach proves nothing); the
  DISPLAYED candidates the family just declined by tapping "somewhere else" are
  contradicted-by-human-act — they can never collapse-collect the christening.
- **Any contradicting dimension, or all-silent → christen a DISTINCT stop.** The family
  typed a name; if the dimensions don't positively say it's the existing place, a new
  place is what they mean. A wrong split is cheap (the settled fact shows the name; a
  later human merge is one act); a wrong merge mints a false D13-locked confirm the
  machine may never correct. The settled fact RECORDS the citation either way
  ("matched on name + location" / "'the beach' exists now") — §16b's citation rule.
- Either way the settled fact names what actually happened ("Angel Foods, settled" vs
  "'the beach' exists now") so the equivalence/divergence is visible and correctable.
Duplicate entities are the closed-world bug in reverse; never mint a twin — but never
merge across a contradiction either.

### What a christening creates — a REAL day stop (existing write class)
- A new stop appended to `trip.days[dayN].stops`: `{ id: newStopId(dayN), name: <the
  family's words, verbatim>, kind: 'stop' }` — the exact shape + id convention the
  Claude-card builder already mints (`claudeCardApply.js:105`). No coords (none are
  known — coords arrive later honestly: a GPS-bearing photo filed there, a future
  locate action, never invented).
- One small optional field: `origin: { christened: { by: <traveler>, at, fromMoment } }`
  — the birth certificate. `data_json` is schema-free; no migration. Engine-readable,
  family-invisible.
- Persisted via the EXISTING trip write path (`pushTrip`, workerSync.js:620) riding the
  trip-sync queue + conflict guard. The stop is family-authored content on the shared
  agenda — visible to all, editable/renamable/deletable in the trip editor like any
  hand-added stop (the family owns it; we never auto-merge or auto-rename).

### The ordering guarantee (the #5 orphan lesson, mandatory)
A filing must never point at an id the album can't render. Strict order:
1. Mutate the trip + `pushTrip`; **await the ack** (offline: the queued trip push holds
   the front of the line).
2. Only then file the moment's photos to the new id via the standard S1 path
   (`confirmWritePlan` → `updateMemoryStop(..., {source:'confirmed'})`) — the christened
   id is a REAL stop, so `isFilableStop` passes and the server D13 stamp + lock apply
   untouched.
3. Only then `POST /heal-confirm` (action 'corrected' w/ the christened id as
   correctedPlaceId), so the worker's re-heal runs against the already-synced agenda.
**Receipt timing (AUDIT-1):** the christening receipt renders ONLY after the trip ack —
before it, an honest pending state ("saving your place…"). A terminal failure replaces
the PENDING state with the S1 words-kept copy; a shown receipt is never retroactively
falsified.
**Degraded path (trip push fails terminally):** no filing, no confirm POST — the words
land as S1 feedback words only, and the copy falls back to the S1 free-text promise
("kept your words"), never the christening receipt. The surface must not promise an
entity that doesn't exist (the #4 honest-copy lesson).
**Step-3 failure (AUDIT-1):** a failed /heal-confirm POST after the filings landed is
QUEUED AND RETRIED through the existing sync-honesty queue, carrying the A1 snapshot —
the answer's ledger row (the Learning Spine's food) must eventually land or the retry
surfaces as unsynced. O4 tests this path.
**The confirm action (AUDIT-1 — code-verified conflict):** the christening POST uses
action **'confirmed' with the christened id as the confirmed place** — it IS a human
confirm of a real, now-synced stop — so the server D13 stamp and re-heal fire under
their EXISTING 'confirmed' gates. It must NOT ride 'corrected' (the flip-blocker #3 fix
deliberately gates stamp+re-heal off 'corrected'; that fix stands unreversed).
**Deletion semantics (AUDIT-1):** deleting a christened (or any) stop that carries
D13-locked filings must not orphan them — the delete releases those locks and re-opens
the photos as loose, with a visible notice ("N photos from 'the jetty spot' are loose
again"). Never a silent strand on an unrenderable id. O4 tests delete-after-filing.
**Masking (AUDIT-1 — replaces the earlier "invariant untouched" claim, which was
unsupported):** a christening question inherits the projection's fail-closed masking
(it can only be asked about moments unmasked FOR THE ANSWERER) — but the created stop
lands on the SHARED agenda. Therefore: a christening born from a moment that is masked
for ANY family member has its agenda entry DEFERRED (engine-held) until the surprise
reveals; the answerer's receipt stays honest ("saved — it'll join the trip when the
surprise does"). The leak class is closed, not accepted.

### What it teaches (the forward loop)
- The confirmed photos become lookalike EXEMPLARS keyed to the new stop
  (`confirmedAsExemplars`) — the corpus immediately knows what "the jetty spot" looks
  like; TAUGHT/postcard fire when lookalikes exist.
- The world model gains the place NAME-KEYED (worldModel.js matches by name, never
  coords) — so "the jetty spot" recurs on the next trip: the receipt's "this trip and
  any you go back" is literally true through the name-keyed prior. Its recurrence
  confidence starts at one-visit strength (a whisper), exactly per §13.
- Level-2 coord propagation does NOT fire (no coords; nothing to propagate — and
  nothing invented).
- **The whole re-settles around the new entity (gestalt-critical).** The christened stop
  joins the candidate set for the trip-wide re-heal (step 3's `runHealForTrip`), so OTHER
  loose moments that belong there can heal to it — the entity exists for the whole trip's
  reading, not just the asked moment. The ripple's honest reach includes these.
- **The coordless stop competes only through the channels that can see it
  (heterogeneous-data-critical):** name/signage/lookalike/world-model — GPS and time
  simply abstain toward it (the abstention grammar working, not a defect), and it gets NO
  compensating boost (weights are fit, never felt, §13). Coords arriving later lift it
  into the spatial channels naturally.

### Revisability (§7: no single element definitive)
A christening is a human speech act — it locks its filings like any confirm — but the
ENTITY stays the family's: rename/delete in the editor; a later merge with an existing
stop is a human action, never automatic. The engine treats a christened stop exactly as
any stop thereafter (no special pleading in the witnesses).

### Lens / routing guards
Christening questions never route to Rafa (spec 02: only gifts do). The christened name
is family-authored content on the shared agenda — same visibility class as a hand-added
stop; the masking invariant is untouched (the QUESTION was already projection-masked).

### O4's lesson-asserting tests (minimum)
1. Empty field → zero writes anywhere (skip-identical).
2. Near-duplicate name + NO contradicting dimension → PICK (no twin); near-duplicate
   name + a contradicting dimension (far coords / clashing placeType) → a DISTINCT stop
   is christened (the name alone never decides).
3. Ordering: no `updateMemoryStop` before the trip ack; no `/heal-confirm` before both.
4. Terminal trip-push failure → words-only feedback + S1 promise copy (never the
   christening receipt).
5. The christened id passes `isFilableStop`; the server stamp lands (D13).
6. Exemplar teaching fires for the new id; the world model resolves the name next trip.
7. The album renders the christened stop + its filings (no orphan).

---

## F3 — Calibration questions (bounded channel re-grading; the most powerful write)

**What it is:** a question about a PATTERN, not a photo — "Helen's photos land about a
day late — right?" One answer re-grades a channel's evidence across every trip. Power
demands bounds; all four lenses apply from birth.

### What may be ASKED — measured, human-knowable, enumerated
A calibration question exists ONLY when all three hold:
1. **Measured.** The engine already holds the pattern from its own instruments — v1's
   closed set: (a) per-author/device upload LAG (`importLagClass` 'long-demote'
   consistently on one author's photos), (b) per-device clock OFFSET (`offsetInference`
   corroborations converging on a constant shift). Never a fishing question; the family
   confirms a hypothesis, they never generate one.
2. **Human-knowable.** The pattern must be the kind a person actually knows about their
   own life ("my photos upload late", "that camera's clock ran an hour off"). Channel
   abstractions ("is the scene signal reliable?") are NEVER askable — no human knows.
3. **Routed to the pattern's owner (WHO).** Only the device/author's own person is asked
   about their pattern, second person, per the palette's routing. Never Rafa.
Extending the set later requires all three plus a bounded-effect definition — additions
are spec events, not code events.

### What a YES may CHANGE — re-grade the pattern, never the channel
- The answer lands as a mig-021 feedback row (the EXISTING write class — the ledger IS
  the calibration store; no new store, no migration). The engine derives the adjustment
  from accumulated rows at heal time.
- **Effect shapes are per-kind, not one knob (heterogeneous-critical):** a confirmed LAG
  re-grades that author's created-at-upper-bound points (a known pattern, no longer
  blanket-suspect — trust tier shifts, nothing zeroes); a confirmed OFFSET lets the
  existing offset machinery apply that device's corroborated shift at its existing
  provenance grade (`inferred-manual`-class, derived tier — PROV_OFF_VALUES untouched).
  There is NO generic weight knob a calibration can turn.
- **Magnitude comes from the measurement, never the human (and never felt, §13).** The
  person confirms THAT the pattern is real; how large it is stays the instrument's
  number. A yes can never silence a channel, touch another person's device, or move the
  per-witness multipliers wholesale.
- **Placement stays multi-witness (multidimensional-critical):** a confirmed pattern
  re-grades TIME evidence; it never files a photo by itself. Locks hold absolutely: the
  corpus-wide re-settle a calibration triggers moves AUTO-tier filings only — every
  manual/confirmed filing is D13-locked, untouchable.

### What a NO changes — equally informative, equally bounded
The hypothesis is RETIRED (recorded in the same row): the channel keeps its default
grading, and the question is not re-asked unless the measurement later strengthens
materially (threshold a seed, §13). A no is never treated as noise.

### The receipt — words at settle; numbers only as actuals (F1's rule, and it AMENDS
the design's example)
The handoff's calibration receipt ("31 photos across four trips re-sorted") violates
the actuals rule at settle time: the corpus-wide re-settle is asynchronous, so no true
number exists when the receipt shows. **v1 calibration receipts are WORDS ONLY** ("Got
it — I'll read Helen's photo times that way from now on"), same class as the gift
receipt. A measured actual may surface LATER through the show mode/album once the
re-settle lands — reporting what DID move, never predicting. This is a small copy-deck
deviation (calibration `receiptT` switches to words); the design's own guardrail
("delight must never lie") mandates it. Flagged for the deck; no new design round
needed.

### Gestalt + reversibility
A confirmed calibration re-reads the WHOLE corpus (all trips re-heal, shadow-gated,
locks holding) — the pattern touches everything, so the whole must settle, not a
fragment. And it stays influence, not fiat (§7): later contrary answers or contrary
measurements re-grade again; the ledger keeps the full history; nothing sets like
concrete.

### O4's lesson-asserting tests (minimum)
1. No measurement → no calibration question exists (fishing is structurally impossible).
2. WHO-routing: the pattern's owner only; never Rafa; never a third party's device.
3. A YES re-grades exactly the measured pattern's evidence (lag→that author's
   upper-bound points; offset→that device's shift) and nothing else — channel
   multipliers, other devices, other channels: bit-identical before/after.
4. A YES can never move a manual/'confirmed' filing (D13 holds through the re-settle).
5. A NO retires the hypothesis (not re-asked below the strengthen threshold) and
   changes zero grading.
6. The settle-time receipt contains no digits; a later reported number equals the
   measured actual.
7. Magnitude always equals the instrument's estimate, never a human-supplied or
   hand-tuned value.

---

## F4 — Engine integration: incumbent serves, challenger shadows, one contract
(the architecture fork, decided once)

**The decision: one ledger, one projection contract, two producers — the INCUMBENT
(sessionScorer) keeps serving, the CHALLENGER (the whole Healing Model) shadows inside
the same rows, and promotion is a measured, gated flip.** Not replace (the incumbent
survived the S1 gauntlet — five flip-blockers, e2e, red-team — and the confirm surface
files REAL photos off served decisions; the challenger hasn't earned that trust yet).
Not a second table/ledger (a migration gate for no gain — `tier` is free TEXT and
`signals_json` is schema-free, verified: both engines fit one row today).

### The shape
- `recordHealDecisions` runs BOTH engines per trip (the challenger = the WHOLE machine,
  every organ — §15: never a partial wiring). Each row stays keyed by the INCUMBENT's
  decision (served fields unchanged — zero behavior change on merge); the challenger's
  full read (destination, membership, conflict/ignorance, question kind, actual-set)
  rides INSIDE `signals_json` under `hm:`. One `PHOTO_DECISION_ENGINE` var
  ('v1' default | 'hm') selects which producer fills the SERVED fields — the promotion
  flip is config, not code, and it is Jonathan's gate.
- **The projection contract is engine-agnostic:** /heal-decisions serves QUESTION
  objects (kind, momentName, named candidates, stakes-words, the actual-set for
  receipts). The incumbent maps its confirms into picking questions (all it can
  produce); the challenger supplies the full palette — so the Glance (O5) builds against
  ONE contract and never knows which engine spoke. Kinds 2–6 appear only when 'hm'
  serves.
- **Two-pass posture (settled here):** the WORKER batch run stays the authoritative
  pass — it writes the ledger and re-settles whole trips. The CLIENT mirrors compute
  exactly one thing at answer time: the answer's own cascade (the receipt's actuals,
  deterministic from the projection) — the same split S1 already uses. Parity tests
  (O1) keep the mirrors byte-identical so the two passes can never disagree by drift.
- The per-viewer projection/masking layer (`healDecisionsView`) is UNTOUCHED and sits
  downstream of both producers — masking is fail-closed regardless of engine.

### Promotion criteria (measured, never felt — §13; the flip is Jonathan's)
'hm' may be proposed for serving only when, on the honest harness over the real corpus
(whole trips held out, filing masked): (1) recovery ≥ incumbent's; (2) silent-misfile
rate ≤ incumbent's; (3) ask-rate within the delight budget; (4) the shadow diff shows
ZERO constitution violations (no lock would have been crossed, no mask would have
thinned, no synthetic-id filing); (5) the divergence list reviewed as evidence (the
operator gauge — Call 4's instrument), not skimmed as a score. Then the flip itself:
Jonathan's explicit call, reversible by the same var.

### O2's lesson-asserting tests (minimum)
1. Merge is a no-op while 'v1' serves: served fields byte-identical to today's, with
   and without the challenger riding.
2. Both engines' reads coexist in one row; DELETE+INSERT keeps them atomic per trip.
3. The projection emits the SAME question shape from either producer; the Glance
   renders both indistinguishably.
4. Flipping PHOTO_DECISION_ENGINE swaps producers with no code path change; flipping
   back restores exactly.
5. The challenger runs WHOLE (all organs) or not at all — a partial challenger aborts
   the shadow write (never a fragment read in the ledger, §15).
6. Masking layer output is identical under both producers for every viewer fixture.

---

## Amendments from the §16c/§16d retro-audit of F1–F4 (2026-07-19)

When the Learning Spine (§16c) and the World-Model lattice (§16d) landed, F1–F4 were
re-passed (Jonathan prompted; the retro-rule now includes new SECTIONS, not just new
lenses). Findings, most severe first:

**A1 (LOAD-BEARING — F1+F4): the answer row must be self-sufficient for replay.**
Pure-replay attention learning reconstructs ask-time-lean vs answer, but
`memory_heal_decisions` is DELETE+INSERT per run — the ask-time lean is overwritten.
Therefore the ANSWER row carries a snapshot: `lean_json` = { engine id, question
classId, top-k membership, **the per-witness bench reads for the asked moment (witness
id / tier / contribution) + the conflict-vs-ignorance marker, + the §16b
dimensions-citation for any collapse** (AUDIT-1 widening: top-k alone cannot be
decomposed into per-witness credit — the exact capability A1 exists for; and the
citation field is what lets F4's promotion gate detect multidimensional violations, not
just truth ones). **Migration 021 is verified UNAPPLIED in prod** (sqlite_master checked
2026-07-19) → amend 021 in place to add `lean_json TEXT` — zero new-migration cost; the
apply stays Jonathan's existing gate. The projection contract adds `classId` per
question; the /heal-confirm body carries the snapshot through. Without A1 the Learning
Spine cannot credit witnesses — it is a prerequisite of O7, and its three deliverables
are OWNED BY O2.

**A2 (F3): class-trust auto-apply.** §16c-6 extends F3: once a hypothesis CLASS crosses
the graded per-context trust bar (repeated confirms), new instances AUTO-APPLY at
derived tier WITHOUT asking — the question kind retires for that context — and the show
mode whispers the standing assumption (a new copy class for the deck, same register as
the existing hedges; flagged, no new round). A retired class un-retires if a later
answer or measurement contradicts (graded, both directions).

**A3 (one fold, one lattice).** F3's "derive calibrations from ledger rows" IS the
§16d DEVICES branch of the world-model fold — O4/O8 build ONE derivation, never two
parallel plumbing paths. The lattice fold is WORKER-AUTHORITATIVE (it needs the answer
ledgers); the client never derives the lattice — client parity tests use fixture
lattices only.

**A4 (F2): a christening also posts to the LEXICON branch** (the family's name, warm
matching) **and begins the new place's dimension-signature** from its confirmed photos
(placeType × time) — automatic once O8's fold lands; stated so O4/O8 connect.

**A5 (F1): WHO-routing consumes person-facts when the lattice holds them** (curation
styles / answer voice) — the uploader heuristic is the seed, the learned person-fact
the refinement. Contract note only.

---

## AUDIT-1 (2026-07-19): the first §16e fresh-eyes sweep — remaining binding amendments

Six cold reviewers; 44 findings (12 high / 24 medium / 8 low). Highs and the dangerous
mediums were fixed INLINE above and in the plan/Glance prompt. The rest are settled
HERE as binding amendments — **where an amendment conflicts with earlier text, the
amendment governs**:

- **A6 (F2 ripple honesty):** the settle-time ripple/receipt covers ONLY the answer's
  own cascade (the write plan's actuals). Other-moment heals from the re-settle, and
  ALL cross-trip effects (TAUGHT, exemplar reach), surface later via the show
  mode/postcard as measured actuals — F3's later-reporting pattern is the universal
  rule for every kind.
- **A7 (F2 cross-trip mechanism):** a christening's exemplar/lexicon/world-model deltas
  enqueue the same corpus-wide, lock-holding, shadow-gated re-settle a calibration
  does — the promised cross-trip healing has a mechanism, not a hope.
- **A8 (§16c-6 auto-apply is settle-input, never bypass):** a trusted class's
  auto-apply = the hypothesis entering the SETTLE as derived-tier, trust-graded
  evidence under the lattice clamp. An instance whose own dimensions contradict its
  class is NOT auto-applied and un-retires the question for that instance. Every
  auto-apply records class-trust + dimensions consulted. (O7 test: "an instance
  contradicting its trusted class is never auto-applied.")
- **A9 (world-model entity identity is multidimensional):** same-name entries stay
  DISTINCT lattice entities until a second dimension agrees to merge (coord proximity,
  or signature agreement); contradiction keeps them split; coords are never averaged
  across an unmerged pair. The world model keys christened stops by STOP ID with the
  name as a lexicon alias (rename-safe); F2's receipt promise softens to what is
  durable. (O8 test: same name + far coords → two entities.)
- **A10 (derived-never-vouches needs ENFORCEMENT):** the built relax loop borrows
  symmetrically, so an imputed coordinate can boost its own donors — the pinned §12.4
  guard is currently unenforced. O7 owns the fix (exclude a photo's derivedFrom donors
  from borrow-back), plus: the bench scales derived damping by `imputeConfidence`
  (currently computed and consumed nowhere).
- **A11 (scope truths):** imputation v1 = coordinates only (§12.4 reads as GPS-v1,
  dated); §16d PLACES corrects to "recurrence built; footprint + typical-timing = O8";
  §4's "conformal set" names the real object (the unnormalized membership fan;
  conformal calibration is a future refinement, unowned until scheduled); the card
  takes a small set (2–3 candidates), matching the shipped design.
- **A12 (channel join-conditions recorded, §13 compliance):** captions join at
  measured whisper grade when the gift corpus produces them (the gifts loop IS the
  join trigger); uploader + weather witnesses join via O-lane seeding at whisper
  grade. Recorded so no channel is parked without a stated, measured join condition.
- **A13 (calibration source key):** lag/offset facts key on person × device (falling
  back to person alone when the device is unknown) — one definition shared by F3, the
  §16d DEVICES branch, and WHO-routing.
- **A14 (christening Dice threshold):** reuses the Dice METRIC but carries its OWN
  seed threshold, fitted separately from the signage witness's (§13).
- **A15 (structure/gifts/spot-checks DESCOPED until spec'd):** no document defines
  their write semantics — they are removed from O4/O5's buildable scope and queued as
  **F7** (the next Fable session): structure-answer, gift, and spot-check write
  semantics at F2/F3 rigor. The palette renders them in design only until then.
