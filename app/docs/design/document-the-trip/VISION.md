# The trip remembers itself — the complete vision for "document the trip we had"

> Settled 2026-07-05 with Jonathan (extends FAMILY_TRIPS_VISION.md §12; the engineering spec for the
> photo-healing arc is [../self-healing-photos/SPEC.md](../self-healing-photos/SPEC.md)). Grounded in a
> 13-agent audit of every surface (tense-audit, past-trip walk, persona walks, three adversarial critics —
> reports in ../self-healing-photos/research-appendix.md and the session scratchpad). Per WORKING_AGREEMENT
> §1, file:line cites are pointers to re-verify at build time.

## 0. The vision

Every trip documents itself as the trip the family actually had. Photos can arrive before, during, or
months after; the day can be named in the moment or years later; more photos can come after that — and in
every order, everything stays as organized as the evidence honestly allows.

> **The family authors the trip — captures it, names it, keeps it. The app does all the filing, converges
> every surface it can honestly converge, rests visibly where evidence is thin, keeps chosen things exactly
> as chosen, and never chases anyone.**

What the family feels is two absences: **they are never asked twice, and they are never contradicted.** Two
surfaces never disagree about a day; a question answered once (by a name, a keep, a hand-move) is answered
everywhere, forever.

## 1. The corrected words (drift guards — the naive phrasings license real mistakes)

- Not **"master copy."** Reality does not overwrite the plan — "we planned the whale watch, biked the dunes
  instead" stays tellable forever (the three-tenses rule). Reality is **what surfaces render from**, never
  what other tenses sync to.
- Not **"every surface follows."** **Chosen things are inputs, never targets**: the plan, a manual photo
  placement, a kept day, a kept book page. Unchosen surfaces (albums, reels, maps, live stories, share
  labels) converge; chosen things change only when a person re-chooses them.
- Not **"converges automatically" (total).** Strict + repair-first is settled: evidence-decisive moves
  happen silently-with-a-note; thin evidence **rests visibly** as a suggestion or an honest "Unfiled." A
  wrong silent move is worse than no move.
- Not **"the family never does bookkeeping."** The family never does bookkeeping **for convergence** — but
  a hand-move, a keep, a name are *authorship*, and authorship is load-bearing: it outranks the machine
  forever.
- **"LIVE" means honestly:** ~20 seconds while the app is open (once the memory channel ships); on next
  open otherwise. No push channel exists or is planned. Copy never promises faster than the plumbing.
- **GPS line (anti-drift):** photo GPS is retired as a *live where-are-we* source (FAMILY_TRIPS_VISION §4)
  and embraced as a *retrospective evidence* source (the evidence engine, healing, pins). These do not
  conflict; do not "re-discover" a contradiction here.

## 2. The ask-economy (settled)

1. **The app initiates exactly once per day: the evening settle moment.** Everything else waits behind a
   door. No other surface may summon, badge, count, or chase — keepsakes may invite, never summon.
2. **Quiet days pool** (Jonathan's pick): a rich day gets its card that evening; quiet days accumulate and
   are offered together, warmly ("the last two days — quiet ones? keep them both"). The app initiates
   *less* on the weeks that need less.
3. **Asked once, answerable forever.** The ask window and the answer window are different things: any loose
   day — including on a trip finished years ago — stays answerable through the same settle experience
   ("finish the story," §5 V2). A missed evening is never a permanent hole; it is also never nagged about.
4. **The trust grammar of automation:** every "moved because…" note names a **human act** ("moved when you
   named Race Point," "moved when Wednesday's plan changed"). The daily sweep is catch-up, so its notes
   inherit the act they catch up on. A reason that can't name a person's act is a gate failure, not a copy
   problem. Suggestions are sticky-dismissed per photo↔place pair — "Not now" is remembered family-wide and
   only genuinely NEW evidence may re-raise one.
5. **The archive backfill is a letter, not a hundred chips.** Reorganizing years of sediment in one pass is
   an earthquake if told photo-by-photo. It runs only when Jonathan knowingly starts it (visible progress,
   his device choice), and each old trip gets one warm summary ("214 photos from the Vermont week found
   their places — have a look") instead of per-photo notes.

## 3. Keep semantics (settled)

- **Gold means "this day counts" — never "this day is closed."** A kept day keeps accepting: late photos,
  late names on unnamed pins, Rafa's stamps. Aurelia keeping the day at 5pm is participation, not
  foreclosure — the 8pm campfire slides in behind her keep. Anyone in the family can keep.
- **Kept book pages are prints** (Jonathan's pick): a kept page stays exactly as kept. Only someone already
  holding that page may see a quiet "the day has more photos now — weave it again?", and re-weaving **never
  destroys the kept version**. No badges, no counts, no staleness language on the shelf, ever.
- **One keep.** "Keep the day" (record) and "keep this page" (book) were designed as one act and shipped as
  two; they merge back into one evening envelope (§5 V2) — keeping the day is the moment the story is
  offered, Rafa's pending note is surfaced ("Rafa told about today · listen"), and per-pin "leave this out"
  exists (which is also the surprise escape hatch).

## 4. The five unifying commitments (what makes it one machine, not features)

1. **THE RESOLVER.** One mirrored place-reference module — client lib + worker copy (the `lib/surprises.js`
   precedent, this time WITH a parity test) — is the only code allowed to interpret a stopId-shaped
   reference (planned stop · `__trip_base__:` id · record-entry id): label, coords, day. `dayStopIds`,
   `groupByStop`, `findStopName`, both server beat-builders, RafaMap counts, resurface, and Replay's day
   index all become views of it. (Today the client resolver family exists but the worker has three forks
   that don't use it — and zero readers of `day.record` at all.)
2. **THE SPINE RULE** *(approved 2026-07-05)*. **A kept day is read from its record, everywhere.** One
   selector — kept → the family's named moments (names, spans, stamps, the nothing-verdict) as the day's
   structure with the plan quoted alongside; not kept → plan+evidence fallback. Consumed by album section
   titles, Weave beats + narration + its freshness signature, Replay, resurface, share labels, the
   after-trip home (whose record faces are currently hidden), and the kid read-faces. This is the one move
   that makes "Tonight's story writes itself from this" true — copy that ships today and has never once
   been kept.
3. **ONE KEEP, ONE EVENING ENVELOPE, DOORS OPEN FOREVER.** §3's merged keep + §2's pooling + retro-settle
   for any loose day (§5 V2). The material gates the flow, never the moment — the deepest single finding of
   the audit was that every structuring affordance is welded to a *moment* (import time, the live evening,
   the active-trip cron) while the engines underneath are already moment-free.
4. **ONE CLOCK.** One leg-local day-attribution function shared by import matching, the evidence engine,
   the album, and the worker. (Today photoMatch bins by UTC while evidence bins leg-local — the 9pm s'mores
   photos are tonight's kept pin AND tomorrow's album section, permanently. Also closes the long-parked TZ
   bug.)
5. **ONE REALITY-WRITER** *(approved 2026-07-05)*. Plan immutability becomes app-wide: the import
   reconcile flow stops deleting didn't-happen stops and rewriting `day.stops` — it emits record verdicts
   instead (`originalPlan`, its write-only stash, retires). And every record mouth becomes anchor-grade:
   entries created by typing or by Claude's record-day card get best-effort geocoding on create (keyless
   Nominatim, existing helper), because a named truth without coords can never attract its photos.

## 5. Sequencing (after the engineering spec's stages A–E, which proceed unchanged)

Fold-ins to the foundation stages (proceed on settled principles; listed in SPEC §3):
- **Surprise filter on the evidence→settle→keep path — ship-blocker.** Today one absent-minded "keep it"
  can publish an unrevealed surprise to every lens within seconds, loudest on Rafa's stamp list. Evidence
  pins exclude unrevealed-surprise memories; the sheet gets per-pin "leave this out" (the reserved, dead
  `record.skipped[]` finally gets its writer); record entries pass through per-viewer masking like
  memories.
- **Kept-row exemption in `getStoredWeave`** — opening a kept page currently regenerates it silently,
  violating the already-settled kept-is-frozen principle. Bug against a settled decision; fix, don't
  re-ask. Re-keep stops destroying the prior text (confirm-and-replace until/unless a history table earns a
  migration slot — 019+, behind its own gate).
- **Settle-sheet honesty:** the copy promises "fix what's wrong, name what's nameless, skip what you like"
  and delivers only naming. Ship skip (above) and who-correction chips (pins credit camera-holders only —
  wrong "who was there" facts must be fixable BEFORE the Weave starts narrating from record facts), or cut
  the copy. Ship the verbs.
- **Kill the aspirational comment** at dayRecord.js:124–126 claiming the Weave/photo filing consume
  `namedRecordEntries` — they don't yet; a future window will inherit the lie.

Then, in dependency order (V-numbers; no time estimates):
- **V1 — the resolver teach-in (client).** Teach the `dayStopIds` family + `groupByStop` + graceful labels
  to resolve record-entry ids the moment Stage D can write one. Converts Replay, resurface, album, day-jump
  in one move. (Arguably Stage D work — it is SPEC §5's own precondition.)
- **V2 — retro-settle ("finish the story").** The same SettleSheet fed with ANY loose day's evidence
  (`buildDayEvidence` already takes any date; `keepDay` already takes any day — only their callers are
  gated). Entry points where reminiscing already happens: the tappable "Still loose" ring, a quiet action
  on the after-trip keepsake home, the Looking-back card. Led by the material, never by blanks: full-bleed
  photos, pins as captions awaiting a word, Rafa's pending story right there, one keep at the end. **Ritual
  test:** no counts, no meters, no "unfinished," nothing on Rafa's lens. New surface ⇒ full Claude Design
  prompt (written as a UX brief). Archive value requires the GPS backfill to have run (§2.5's letter).
  *Candidate rider needing a one-line decision at build: union-merge `day.record` by entry id inside trip
  conflict recovery, so Rafa's stamp can't lose a whole-object conflict — currently the blob contract
  accepts that loss.*
- **V3 — the Weave learns the record.** The worker record-reader (today: zero `day.record` readers
  server-side), record facts join beats AND the freshness signature (naming a moment finally changes the
  story), `findStopName`/`dayHasSharedMemory` learn the resolver, a day-picker + persist-on-generate for
  finished trips (the F4 pick lands as persist — V2/V3 both depend on generated past pages surviving; today
  the cron cannot touch a finished trip, ever, and on-demand pages evaporate on close).
- **V4 — kept-book policy build-out** per §3 (print + quiet offer + never-destroy).
- **V5 — the kid read-faces.** Rafa: kept days on his pad with his stamps big, playback of his placed voice
  notes ("YOU TOLD THIS PART"), no machine guess-text on his cards, a past tense for his headers; decide
  whether his map's landmarks become named moments (bespoke design pass — his lens, his rules). Aurelia:
  "make this the day's picture" (one tap, drives the day chip, resurface card, book page) and her keeps
  visible in look-back. Last, because it must be built on surfaces that are already true.

**Cut lines (explicitly not doing):** no push channel (polling stands); no field-level trip merge (the V2
record-union rider is the one narrow exception, and it needs its own yes); no cron widening (the finishing
pass is a door, not a demon); no full evidence↔photoMatch engine unification (parked, SPEC §8).

## 6. Honesty labels (copy commitments — G6 applied to the whole arc)

The Weave: *"updates when you open it."* · Kept pages: *"stay exactly as kept unless you weave them
again."* · Another device's changes: *"arrive within about 20 seconds while open; on next open
otherwise."* · The album: *"regroups when idle — never mid-scroll, never under an open photo."* · A missed
evening: *"stays loose until someone finishes the story; the app won't chase you."* · The archive: *"can't
heal until the one-time location pass runs — Jonathan starts it, it shows its progress."* (Its premise —
that R2 originals retain EXIF — is unverified; re-verify before promising, and carve out honestly if some
imports were re-encoded.) · Manual placements: *"never move."* · Thin evidence: *"rests as a suggestion or
stays honestly unfiled."*

## 7. Verification additions (beyond SPEC §7)

- **Order-independence permutation tests** (SPEC §7) extended to cover naming-before-photos,
  photos-before-naming, late-GPS-backfill, and retro-settle orderings.
- **A copy-truth audit as a standing gate for this arc:** every promise-line in settle/keep/heal copy maps
  to a mechanism that exists ("writes itself from this" → spine rule; "skip what you like" → skipped[]).
  The audit found two shipped promise-lines with no mechanism; zero is the bar.
- **Resolver parity corpus** (client copy vs worker copy — the one existing mirrored lib never got one).
