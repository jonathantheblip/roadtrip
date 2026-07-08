# Self-healing photos, v2 — **Time & Evidence first**

> Design spec, drafted 2026-07-07 (Jonathan: "manual is not acceptable — reimagine self-healing to give it
> real value"; then "this is worth it, write it up as a full spec" — including the vision tier).
> Successor to [SPEC.md](SPEC.md) (v1, the shipped Stage D matcher). v2 **keeps every safety invariant of v1
> §1** and **replaces the healing model of v1 §5** — the change is the gate philosophy, not the guardrails.
> Per WORKING_AGREEMENT §1, every file:line and SHA below is a pointer to re-verify at build time, not truth.
> The real-data findings this hangs on are the 2026-07-07 live-D1 probe — see the Appendix; they are the
> spine of the argument, re-derivable with `worker/… d1 execute` + the `heal_probe.mjs` harness.

---

## 0. Why v2 — the problem, proven on live data

v1 shipped and works exactly as designed. The problem is that **the design is inert for this family.** Running
the *real* v1 matcher against all 235 live memories on 2026-07-07 (the `heal_probe.mjs` faithful replay):

- **0 auto-moves. Ever. Across every trip.**
- 61 "suggestions" — and **all 61 were the same shape**: `weak-match · by time · → the trip base`. Not one
  proposed a specific place. The system's entire vocabulary on this data is "put it at the base."

Why: v1 is **GPS-first**, and its safety is **refusal**:

1. **The photos have no GPS.** Only **10 of 235** photo-memories carry any coordinate — the upload pipeline
   (`photoPipeline.js` `downscaleImage`) canvas-re-encodes every photo and strips EXIF/GPS (SPEC v1 §5 C, the
   corrected finding). GPS-forward capture (C-a, `471f674`) helps *new* imports, but the archive — and any
   indoor/no-signal shot — has none, forever.
2. **v1 gate-1 says "time-only NEVER moves"** (SPEC v1 §5 D). So the one signal the family's photos *do* carry
   — capture time — is the one the matcher is forbidden to act on.
3. **No-GPS default is always the base.** A no-GPS photo's only confident home is "At [place]." So every real
   moment — the parade, breakfast, dinner, the fireworks — collapses to one undifferentiated bucket.

Three concrete failures Jonathan surfaced reviewing the shadow output, each a *class*:

- **Files to the trip you *planned*, not the trip you *had*.** Jackson Drive: the matcher offered to move
  photos to **Barber Motorsports Museum** and **Collin Street Bakery** — places the family **never visited**.
  They're on the itinerary, they have a scheduled time, so time-matching drags photos onto them. This is the
  exact inversion of the whole vision (FAMILY_TRIPS_VISION §12: *document the trip we had*).
- **Co-located events collapse.** Provincetown July 4: the parade route ran ~100 m from the lodging. Every
  parade photo reads as "near the base" → dumped at the base. The genuine event vanishes into the place.
- **Unusable agenda times.** The P-town parade stop `pt4-4-1` existed but its time was the literal string
  **"Afternoon"** with no coordinates — unparseable, so the matcher couldn't file anything to it even if it
  wanted to. Vague plan data silently defeats the matcher.

And the tell that v1's *fix* is manual-only: after hand-filing the 16 parade photos to `pt4-4-1`, re-running
the matcher showed it wanted to **pull them right back to the base** — because a no-GPS photo at a specific
stop with legacy (NULL) provenance is `legacy-suggest → base` (`photoHeal.js:289`). The only thing that makes
a placement stick is a **manual lock**. **That is the state Jonathan rejected: a self-healing system whose only
durable answer is "the human did it by hand."**

### The core mismatch (one sentence)

> v1 trusts **GPS** and treats **uncertainty as a reason to do nothing**; this family's truth is **time + what
> actually happened**, and *doing nothing* is worthless. v2 makes **time and evidence** first-class and
> redefines "safe" as **reversible and confirmable**, not inert.

---

## 1. The reframe — and what stays sacred

**Preserved verbatim from v1 §1 (these do not change — reconcile-before-replace):**

- **Prime directive:** a *wrong silent move* is worse than no move; **auto never overwrites manual**; every
  behavior is honest cross-device (no device shows a move the family server hasn't confirmed; no move is
  invisible or unexplained where it landed).
- **Order independence** (deterministic matcher · a re-match trigger for *every* input class · idempotent
  application · the only order-pinned states are the manual lock and legacy-repair, both repairable through
  ordinary affordances). Gated by permutation property tests.
- **Discoverable or invisible** — no janitor surfaces, no settings, no status noise.
- **Kid-lens exclusion** (Rafa never meets a move/note/chip/ranking), **masking/surprise projection**
  (per-viewer; counts never leak surprise shape by arithmetic), **worker = single referee**, the
  **`off | shadow | on` knob**, the **append-only audit ledger**.

**The one thing that changes — the gate philosophy:**

> v1: *"move only on a clear GPS winner; when unsure, refuse."*
> v2: *"reconstruct the day's real timeline from evidence; place each **moment** on it by the **best available
> signal** (time, GPS, content); **auto-file only what's clear, ask one light question when it isn't, and make
> everything one tap to undo."*

"Safe" is now carried by **confidence + reversibility + a session-level confirm**, not by inaction. A photo can
move on time alone — but only to a place the family *demonstrably was*, only as part of a *whole moment*, only
above a confidence bar, and always undoably. That combination is what makes acting-on-time safe.

---

## 2. The three pillars

### Pillar 1 — **Evidence over plan** (kills "files to the trip you planned") — DORMANT, NOT ERASED

> ⚠ CORRECTED 2026-07-07 (Jonathan caught it on the Jackson prototype). The first draft said "a stop with no
> photos filed to it is unvisited → gate it out." **That is exactly backwards for self-healing.** On the
> Jackson trip the family *did* visit Rothko Chapel, the Menil, and Rice — but those stops have **0 photos
> filed**, because the Houston photos are misfiled (a pile on "Barber Motorsports Museum") or unfiled, and
> **31 of 45 are EXIF-stripped — no GPS AND no capture time.** "Is a photo filed here?" can't tell *never went*
> from *went, but the photo is misfiled/undated*. Absence of filed photos means **absence of signal, not
> absence of a visit.**

A place is a *confident auto-target* only with **positive evidence the family was there**:
- a photo with **GPS** near it, **or**
- a **named record moment** (`day.record.entries` — a person affirmed it), **or**
- a **vision** recognition of the place (§6), **or**
- a **human confirm** (the family said yes).

A planned stop with only **time-fit** (a photo's time lands in its window, no GPS/record/vision) is a
**suggest/confirm target, never an auto-file and never erased** — because time-fit alone can't separate a
visited stop from a *coincidentally-timed skipped* one (the museum-they-drove-past risk). A planned stop with
**no signal at all** is **dormant**: still a valid place, still offered in naming/finish-the-story, just not a
magnet — it can become evidenced at any later time (GPS backfilled, a moment named, vision run, a photo
confirmed). **Never hard-deleted from the target set.**

- Mechanically: `buildDayIndex` keeps every stop; v2 adds an **evidence *tier*** per stop (confident /
  time-only / dormant), which drives the action tier in Pillar 3 — it does **not** remove stops.
- This removes the *false-positive* half of the Jackson class (a photo won't silently jump onto a
  time-coincident museum) **without** the false-negative I nearly shipped (hiding Rothko because its photos
  were misfiled).
- Order-independence: evidence tier is a deterministic function of current signals; the re-match trigger set
  (§4) recomputes it on any signal change, per §1.

**The metadata-blind archive (the hard floor — new, from the Jackson finding).** A large slice of the real
archive has **no GPS and no capture time** (Jackson: 31/45). For these, Pillars 1–2 (time + evidence) are
**structurally powerless** — there is no metadata to reason from. Their *only* automatic path is **§6 vision**
(recognize the place from the image), and their only manual path is **naming** (settle-the-day / assign a
session to a moment). This is why vision is **essential, not optional**, for the archive — and why "self-heal
everything automatically by metadata" is a promise the data cannot keep for pre-EXIF-forward photos. Honest
scope: time+evidence heals the **time-bearing** set (recent imports, and everything post GPS-forward capture);
vision + naming reach the **metadata-blind** set; nothing silently pretends to place a photo it has no signal for.

### Pillar 2 — **Sessions on a time-spine** (makes time trustworthy without GPS)

Stop judging 235 lonely photos. The family shoots in **bursts** — real moments. The live data shows it plainly
(P-town July 4: a burst 10:46–11:09, another at 11:59, a distinct evening cluster 17:21–19:11). Reframe the
unit of filing from *the photo* to **the session**.

- **Detect sessions** by capture-time gaps within an author/day (a session breaks after ~a configurable idle
  gap; a lone photo is a session of one). The GPS+time clustering in **`evidence.js`** (`buildPins` /
  `photoMatch.js:619` cluster helper) already does exactly this shape of work — v2 promotes it from a parallel
  Record-only system to the **primary filing unit**. (v1 §8 explicitly deferred this unification; v2 does it.)
- **Build the day's time-spine:** the ordered sequence of *evidenced* events (Pillar 1) with real time
  windows. Then **snap each session to the spine** — the evidenced event whose time window best contains /
  abuts the session. A no-GPS session is confidently placeable because *a whole burst at 11 a.m. next to an
  evidenced 11 a.m. event* is strong signal in a way a single stray photo never is.
- **Agenda-time inference (bidirectional — the "Afternoon" fix):** when an evidenced stop has a vague/missing
  time (`"Afternoon"`, `null`) but a photo session sits squarely on it, **infer the stop's real time from the
  session** and write it back (as inferred, distinguishable from a human-set time). The parade stop learns it
  was 11 a.m.; the agenda becomes *truer*, and every later match against it gets sharper. Photos organize the
  agenda as much as the agenda organizes photos — which is the "document the trip we had" loop closing.
- If GPS *is* present on even one photo in a session, it **upgrades** confidence and can break time ties — but
  is never required.

### Pillar 3 — **Confidence-tiered action** (auto when clear · ask once when not · undo always)

Replace v1's binary "auto-move vs suggest" with a **confidence score per (session → event) candidate** and
three tiers:

- **High → auto-file**, with a quiet per-lens moved-note and one-tap undo. (This is where v1 was empty; v2
  fills it, safely, because the unit is a whole evidenced session and it's reversible.)
- **Medium → one *session-level* confirm** — the delightful human layer, **not** photo-dragging: *"These 16
  photos from late morning — the parade? ✓ / put somewhere else."* One tap files the whole moment. This is the
  parade-vs-lodging case: real ambiguity, resolved by a single glance.
- **Low → leave** at base/unfiled and offer it in the existing finish-the-story pass. Never nag.

Confidence signals and how they combine live in §3. The crux: **auto-file on time alone is allowed at the High
tier** (evidenced event · well-anchored time · clear margin over any runner-up · reversible) — the precise
thing v1 forbade, made safe by the session unit + evidence-gating + undo + confirm-when-ambiguous.

---

## 3. The confidence model

For each **session S** and each **evidenced event E** on S's day, score a candidate:

| Signal | What it measures | Notes |
|---|---|---|
| **Time fit** | how well S's window sits inside/abuts E's (inferred or set) window | dominant signal; needs a *real* E time (Pillar 2 inference supplies it) |
| **Evidence weight** | strength of E's evidence (named moment > hand-filed photo > 1 auto photo) | 0 for unvisited plan → E not a candidate at all (Pillar 1) |
| **GPS agreement** | if any photo in S is located, distance to E (when E located) | optional; big tie-breaker; distinguishes co-located-in-time events when present |
| **Vision agreement** | (tier 3) does S's content class match E's kind? parade↔parade, meal↔restaurant | optional; the strongest disambiguator for co-located events; §6 |
| **Cohesion** | S is a tight burst (size, short span) vs scattered | a real "moment" places more confidently than stragglers |
| **Margin** | winner E score vs runner-up E score | the ambiguity detector → drives the tier |

**Tiers (thresholds are tuned in shadow, not guessed now):**

- **High** = strong time-fit to a well-anchored evidenced event **AND** clear margin over runner-up
  (no serious rival) **AND** (GPS/vision, if available, agree — never contradict). → auto-file.
- **Medium** = a plausible best event but a real runner-up (margin small), or co-located ambiguity GPS can't
  split, or the event's time is inferred with low support. → session confirm.
- **Low** = no evidenced event fits the session's time. → base/unfiled, finish-the-story only.

**Worked against the real data:**
- *P-town, 10:46 a.m.–1 p.m. burst (16):* evidenced parade event (has the hand-filed photos + a named stop),
  time inferred to 11 a.m., no rival midday event → **High → auto-parade.** (Today: 0. v2: correct, automatically.)
- *P-town evening 17:21–19:11:* no evidenced evening event on the spine, base always-eligible but not
  time-specific → **Low → base**, offered in finish-the-story ("name the evening?"). Honest.
- *Jackson museum/bakery:* unvisited → **not a candidate** (Pillar 1) → photos never proposed there. Fixed.
- *Parade vs lodging (co-located):* time splits them (parade window vs all-day base); if still close, **Medium
  → confirm**, and **vision seals it** (the photo shows a parade) → High. Fixed.

**The shadow win:** because v2 auto-files sessions, the `memory_stop_moves` ledger in shadow finally shows
*real would-moves with their confidence + signals* — so "review the ledger before enabling" becomes a
meaningful review (v1's ledger was structurally empty on this data; that's why Jonathan saw nothing).

---

## 4. Architecture — reused / new / changed

**Reused (this is a recomposition, not a rewrite):**
- `evidence.js` session/pin clustering → promoted to the primary filing unit.
- `photoMatch.js` `buildDayIndex` / `allStops` / base-yield / the worker parity mirror → kept; extended.
- `photoHeal.js` gate skeleton, provenance normalization, masking/surprise/cooldown gates → kept; gate-1
  rewritten.
- The record bridge (`__record__:<iso>:<entryId>` targets), the `off|shadow|on` knob, the audit ledger, the
  per-viewer suggestion projection, the live memory channel (A-3), GPS-forward capture (C-a) → all kept.

**New:**
- **Session builder** (shared client/worker, parity-tested) — day → sessions with time windows + cohesion.
- **Evidence filter** on the target set (Pillar 1).
- **Confidence scorer** (§3) — pure, deterministic, parity-tested; emits `{event, tier, signals}`.
- **Agenda-time inference** writer — sets an *inferred* time on a vague evidenced stop (flagged distinct from
  human-set; never overwrites a human time).
- **Session-confirm surface** (Pillar 3 medium tier) — new UI (Design-prompt gated, §5).
- **Vision adapter** (§6) — optional signal provider behind the consent gate.

**Changed:**
- **Gate-1** `'gps+time only, time-only never moves'` → **`session → evidenced-event, tiered by confidence`**
  (§3). Time-only *can* file, at High tier, to an evidenced event, reversibly. Everything else in the gate
  (manual-lock wins, masking, surprise, cooldown, unanimity-within-session, margin) is **preserved**.
- **Unit** photo → session. Whole-session unanimity replaces whole-memory unanimity (a superset).
- **Provenance** gains a source value: `auto` now records the *tier + signals + confidence* it fired at, so a
  low-confidence auto-file is distinguishable from a high one and the moved-note can be honest ("we think…").
  `manual` still wins forever; legacy still repair-only.

**Triggers:** unchanged set (agenda / record / photo-evidence / reveal / daily sweep — v1 §5), because the
order-independence guarantee *is* that set. Agenda-time inference and evidence-gain/loss are photo-evidence and
agenda-change events already covered; verify at build that an inference write re-enters cleanly (idempotent).

---

## 5. Human surfaces (Design-prompt gated — UX briefs, per v1 §1 "discoverable or invisible")

Each is a *new surface* → its own Claude Design prompt describing the current state in detail before build.

- **The session-confirm card (the centerpiece of "not manual").** Moment of need: a medium-confidence session
  after an import or on opening Photos. One card = one moment: a representative thumbnail strip, the read
  ("late morning · 16 photos"), the proposed place, and **one tap to confirm** or a light "somewhere else"
  that opens the day picker *pre-scrolled to the likely alternatives*. Never a per-photo chore; never a queue
  of nags (batch the day's confirms into one calm pass; permission-to-ignore copy). Adults only; Aurelia
  lowercase; **Rafa never sees it**.
- **Moved-note** (kept from v1 §6, now confidence-aware): quiet per-photo chip; lightbox tells the story from
  snapshotted labels + reason + *confidence* ("filed to the parade — late-morning burst, right by where you
  stayed"). Rafa: no note, photos are simply right. Chip quiets after first viewing.
- **Undo** — every auto-file and every confirm is one-tap reversible; an undo writes a **manual lock** (the
  person just told us where it goes) so it never re-heals.
- **Agenda-time-inferred marker** — an inferred stop time renders subtly distinct (e.g. "~11 AM" vs "11 AM"),
  editable to promote it to human-set. Discoverable, not noisy.
- **Rendering honesty** (kept from v1 §6): invalidation tick on stop patches; regroup only when idle (never
  mid-lightbox / mid-scroll).

---

## 6. The vision tier (consent-gated) — Jonathan: "this is worth it"

The strongest disambiguator for the cases metadata can't touch (parade vs lodging, museum-photo vs
street-photo): **the picture itself.** Designed as a *signal provider* into §3, never a separate system.

- **Two engines, one interface:** an **on-device** classifier first (coarse content tags — crowd/parade,
  fireworks, food, landscape, indoor), and an **off-device Claude-vision** tier for the hard ties. Same
  `visionAgreement` signal to the scorer either way; the scorer works fully **with vision off** (degrades to
  time+evidence+GPS — i.e. everything in §2–3 still stands).
- **Consent gate designed first (its own knob, distinct from `PHOTO_HEAL_MODE`):** `vision = off | on-device |
  cloud`. **Default = `cloud` (Jonathan, 2026-07-07).** On-device is the degrade path when cloud is off (no
  photo leaves the phone). Cloud stays **adults-only control** (Jonathan/Helen can turn it off globally) with
  **transparency to the family** — plain-language "what leaves the device, to whom, why, and that you can turn
  it off and it forgets." Runs only on the *ambiguous* sessions the cheaper signals couldn't resolve.
  ⚠ **Deferred sub-decision (vision phase):** cloud-default means the ambiguous set includes photos of Rafa +
  Aurelia — decide then whether the kids' photos ride cloud or stay on-device. Not on the Phase-1 path.
- **Shadow parity:** vision has its own off/shadow/on so its *contribution* to decisions can be watched in the
  ledger before it's allowed to change filings.
- **Cost/latency honesty:** cloud vision runs only on the *ambiguous* sessions the cheaper signals couldn't
  resolve (not the whole library) — a small, bounded set — and only when opted in.
- Ties into the already-designed **best-of scoring** vision tier (album-system Ch "best-of") — same consent
  surface, same engine; self-healing and best-of share it.

---

## 7. Preserved from v1 (the do-not-lose inventory — verify each survives at build)

Prime directive · order-independence (+ permutation tests) · discoverable-or-invisible · manual-lock supremacy ·
legacy repair-only · masking/surprise per-viewer projection (counts don't leak) · Rafa/Aurelia lens rules ·
`off|shadow|on` knob · append-only audit ledger · worker-single-referee · per-viewer suggestion projection +
synced "Not now" dismissal · live memory channel (A-3) · GPS-forward capture (C-a) · the record bridge
(`__record__` targets) · cooldown/quiesce convergence · rendering-honesty (idle-only regroup). **None of these
change; v2 is a new gate + a new unit inside the same guardrails.**

---

## 8. Rollout — cheapest-highest-value first (each shippable + gated per the standing loop)

1. **Sessions + time-spine + evidence-*tier* + agenda-time inference + confidence scorer** (Pillars 1–2 + §3,
   corrected: evidence *tiers* targets, never erases). Gate-1 rewrite; parity + permutation tests. Shadow
   first — and now the ledger is *meaningfully* reviewable (real tiered would-moves + their signals), the
   learning tool of decision #1. This is the core, and it delivers the **time-bearing** wins (parade,
   monster-trucks, lunch, fireworks) safely. *(Was "evidence-gating alone" — corrected 2026-07-07: gating on
   absence-of-photos wrongly hid Rothko/Rice; the tier model replaces it.)*
2. **Session-confirm surface** (Pillar 3 medium tier) — Design prompt → build. The "not manual" payoff, and the
   only reach into the metadata-blind archive short of vision (name a session → its photos land).
   ⚠ **GATING PRECONDITION (adversarial review, 2026-07-07):** the Phase-1 shadow ledger `memory_heal_decisions`
   records surprise/masked stop names with NO surprise/mask filter (the scorer by design doesn't gate masking;
   `buildDayIndex` includes every stop). Safe while nothing reads it — but **before ANY family-visible surface
   reads that table, RESTORE v1's per-viewer surprise/mask gate** (v1's runner has it via `buildHealCtx`/
   `isSurpriseStop`; project it per-viewer so counts/names never leak surprise shape). Non-negotiable, else a
   surface leaks a hidden surprise.
3. **Vision tier** (§6) — **elevated: essential, not last.** For the EXIF-stripped archive (no GPS, no time) it
   is the *only* automatic signal. Consent surface designed first; cloud default (decision #4); own shadow.
   May run in parallel with 2 rather than strictly after, given how much of the archive it alone can reach.

Each phase: unit + full TZ=UTC e2e both projects + independent adversarial review → local commit; batched
pushes; Action green + live SW hash verified; the whole auto-file truth-table gated in **worker vitest** (e2e
mocks the network). `PHOTO_HEAL_MODE` stays **off/shadow**; **never auto-`on`** — Jonathan's flip, after a
shadow ledger that finally shows real decisions.

---

## 9. Decisions — SETTLED (Jonathan, 2026-07-07; do not re-ask)

1. **Auto-file confidence bar: START CONSERVATIVE.** More session-confirms, fewer silent auto-files; relax as
   the shadow ledger earns trust. **The shadow ledger is an explicit LEARNING TOOL** — it must surface *why*
   each decision would fire (tier + signals + confidence + runner-up), so Jonathan can watch it get things
   right before trusting it up a tier. (Design the ledger view for learning, not just audit.)
2. **Agenda-time inference: YES** — the matcher may write an *inferred* time onto a vague/empty evidenced stop
   (clearly marked as inferred; never over a human-set time).
3. **Session-confirm cadence: BOTH** — surface confirms right after an import (in the moment) AND batched into
   a calm "settle the day" pass.
4. **Vision reach: CLOUD DEFAULT.** Cloud vision is the standing default (not on-device-only), with a clear
   off-switch, transparency to the family, and adults-only control; on-device is the degrade path when cloud
   is off. Runs only on the *ambiguous* sessions. ⚠ DEFERRED sub-decision (resolve at the vision phase, not
   now): does cloud-default include the KIDS' photos, or keep Rafa/Aurelia's on-device? (Cloud-default means
   the ambiguous set — which includes photos of the children — is sent to Claude; surfaced as a logistics fact.)
5. **Phase 1: PROTOTYPE FIRST.** Prototype evidence-gating (+ the session/time-spine core, read-only) against
   the real trips so Jonathan sees it work before committing to the production Pillar-2 build.

---

## Appendix — the live data this hangs on (2026-07-07, re-derivable)

- 235 non-deleted photo-memories; **10** carry any GPS (`trip-mp2vndah` 7 · Provincetown 2 · nyc-rafa 1).
- v1 matcher faithful replay (`heal_probe.mjs`, imports the real worker modules): **0 auto-moves**, **61
  suggestions, all `weak-match · by time · → base`** (Provincetown 46 · Vermont 10 · Jackson 5).
- Failure exemplars: Jackson → **Barber Motorsports Museum** / **Collin Street Bakery** (never visited);
  P-town parade `pt4-4-1` time = **"Afternoon"**, no coords; parade route ~100 m from lodging `690 Commercial
  St`; hand-filed parade photos re-suggested **→ base** (legacy-suggest) until manually locked.
- The manual P-town reorganization done this session (parade/evening/fireworks re-filed, `pt4-4-1` given
  11 AM + coords) is exactly the work v2 would do **automatically** — it stands as the target output to test
  Pillar 2 against.
