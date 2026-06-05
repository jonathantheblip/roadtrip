# REDESIGN — DESIGN INTENT BRIEF

> Companion to (a) the new design and (b) the two recon docs `REDESIGN_GROUND_TRUTH_FEATURES.md` /
> `REDESIGN_GROUND_TRUTH_THEME.md`. The recon docs say what's **built**; this says what each person is
> **promised** and what's still to build, plus the product decisions Jonathan locked 2026-06-04.
> These are the family's decisions about their own kids and trip — design parameters, not open questions
> (except the ones explicitly flagged OPEN at the end). Verify any code claim against HEAD; the recon docs
> have some stale file references.

---

## The shape: one trip, four lenses
One trip-data spine; four role-shaped views select by person (`helen → HelenView`, `aurelia → AureliaView`,
`rafa → RafaView`, else `JonathanView`) on the **same data**. Not four apps. The redesign reskins the four
lenses + builds the shared features below; it should not fork the data model.

---

## The four people

**Jonathan — dad. Dark editorial. Planning + the structural view of a trip.**
A control-panel feel: masthead, drive/flight/ETA ticker, hairline rules, no decoration. His "Queue" is a
live nearest-X search (bathroom / food / outside / emergency), not a journal. Navigation opens **Waze**.
*Built.* Wanted next: a real **Closure & Risk Watch** ("X is closed Mondays" before it bites) — richly
specced, only a thin "open loops" version exists today.

**Helen — mom. Sage/brass, photo-forward. The memory archive + location labels — AND a full trip co-planner.**
*New decision:* Helen wants to **design trips the way Jonathan does**. She gets the **same planning tools** —
the structural planning view, the Claude trip-design chat, card-based editing — in her own theme, **and keeps**
the photo archive + GPS location labels she already owns. Navigation opens **Apple Maps**.
*Dropped for Helen:* the dark-mode toggle and the curated podcast list — **out**.

**Aurelia — 13. Warm pink. Her photo & scrapbook world; sharing out; her letter.**
*Signature shift:* the live map + replay are **shared** features now (see below), **not** Aurelia's surface.
Aurelia's signature is her **postcard scrapbook** (rotated polaroid cards, mood, the family thread), her
**"send my best photo out"** verb (to Messages / Instagram / Snap), and — **must-keep** — the **"note from
Dad" letter** at the top of her view (she found it and liked it; the redesign must not lose it). Navigation:
Apple Maps (TikTok-first nav was specced but is optional).

**Rafa — 5. Red/blue command center. Bold, not babied. Video-forward.**
A "mission deck": near-black + ochre, three-word block-serif titles, big chunky finger targets, a giant
"TELL A STORY" voice button, and **PICTURES** — the album he pulls up himself. *Built.* His device is an
**iPad** (bigger touch targets / use the width — specced, mostly unbuilt). Known **color drift to reconcile**
(original deep-blue/red vs current ochre; an off-palette blue still lingers in his view).

> The founding rule, unchanged: **every surface names who it serves and what it gives them.** A feature that
> can't say which family member it's for isn't scoped.

---

## The features (mostly cross-cutting; this is where the real work is)

### 1 · Designing a trip — now Jonathan **and** Helen
Card-driven trip building + a Claude planning chat that can actually act on trip structure are built. The new
ask: give **Helen the same power**, in her lens. Treat "who can design trips" as **both parents**, not just
Jonathan.

### 2 · Photos & memory
- **Capture + archive + auto-file** by GPS+time, with friendly location labels — *built and shipped.*
- **"Show me, me" — person grouping.** Group/filter photos by **who's IN them** (today the app only knows who
  *uploaded* them). No recognizer exists yet — greenfield. This is the make-or-break increment.
- **Dual-purpose per kid (a requirement on that grouped surface):**
  **Aurelia → her best-light stills, surfaced to share out. Rafa → video-forward.** Same recognizer, two
  different payoffs. Neither exists yet.
- **Share-OUT.** Sending a photo/memory out to the system share sheet — **Aurelia's real verb** — is **not
  built** (only sharing a stop as *text* was ever specced, and even that code is gone now). Build the real
  photo/file share-out.

### 3 · Surprises & masking — NEW, first-class
Let a family member **hide or obscure a whole trip or an individual detail to surprise the others.** Locked:
- **Granularity:** works on **whole trips** and on **single details** (a stop, a memory, a photo).
- **Who you can hide from: both** — (a) **specific people** (a surprise just for Aurelia, hidden from Helen),
  and (b) **everyone until you reveal** (a surprise for the whole family).
- **Reveal: both** — **manual** ("reveal now") **and automatic** (on **arrival** at the place, or at a **set
  date/time**), chosen per surprise.
- **Who can create one: anyone in the family,** including the kids (Aurelia can hide a surprise for Jonathan;
  Rafa for Helen).
- **Claude never lies, and gives nothing away.** Claude does **not** surface, hint, confirm, or deny hidden
  content to anyone it's hidden from. The clean way to honor both rules at once: **masked content is simply
  absent from Claude's view** for the people it's hidden from (Claude isn't withholding — it genuinely
  doesn't see it), while the **author** (and anyone it's been revealed to) sees it normally. So Claude never
  has to evade and never states a falsehood; the surprise stays a surprise.

### 4 · Replay / "on this day" — **shared**
The "shape of the trip" playback (archive → trip → day → stop, scrub through the route + memories) and
unprompted resurfacing ("on this day"). The replay ladder is **built** (currently behind a temp button); make
it a **shared** feature any family member opens — not tied to one person. Resurfacing is still to-build.

### 5 · Claude — tool-backed + visibility-aware
The assistant should *act* (plan trips, find places, compute drive times) not just talk, and must obey the
**never-lie / give-nothing-away** rule on masked content (§3). Treat per-recipient targeting + the surprise
triggers as additive on top of the existing single visibility mechanism.

### 6 · Kids' "for the drive" content — keep it, lightweight
Aurelia and Rafa each keep a **small content spot for the drive** (Aurelia's YouTube creators; Rafa's videos).
**Separate from the adult podcasts, which are out.** Keep it light — it's not the heart of the app.

---

## Dropped — don't let these creep back in
- **Dark mode** (Helen's toggle, and as a general per-person axis) — out.
- **Adult podcasts** (Helen's curated list; Jonathan's Overcast queue / Media tab) — out.

## Must-keep through the redesign
- **Aurelia's "note from Dad" letter.** She found it and likes it — preserve it.
- **Person persistence + launch-as-the-right-person** (already works) — and **rebuild the per-person PWA
  install appearance** (each member's home-screen app name / icon / color), which went dark in a refactor.
- **Every surface still answers "who does this serve."**

## OPEN — for Design / a later decision (not yet locked)
- Rafa's **color/theme reconciliation** (which palette wins) — a redesign call.
- **Jonathan's privileged-default** status (he's the fallback persona + the only one the accessibility gate
  checks) — keep, or make all four first-class? A structural decision the new theming should settle.
- Aurelia's **TikTok-first navigation** — wanted, or drop with the other social-nav bits?
- The pile of older per-persona UX bits (Next-Up card, swipe-between-days, emergency FAB, day banner) buried
  in pre-rebuild specs — mine for intent if Design wants the fuller original vision.

## Source docs to hand to Design alongside the new design
1. **`REDESIGN_GROUND_TRUTH_FEATURES.md`** — current feature recon (built / half-built / absent).
2. **`REDESIGN_GROUND_TRUTH_THEME.md`** — per-person color/token ground truth.
3. **`MASTER_SPEC.md` §0–§0.1** — the authoritative per-person promises.
4. **`ROADTRIP_PWA_BUILD_SPEC.md` "Four Themes"** — the richest *original* per-person voice/vibe (intent only;
   the implementation is superseded).
5. **This brief** — the decisions locked 2026-06-04 that the above don't yet reflect.
