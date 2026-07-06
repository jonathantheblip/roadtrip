# Self-healing photos — Phase 3 of "document the trip we had"

> Spec + build plan, settled 2026-07-05. Companion raw research: [research-appendix.md](research-appendix.md)
> (13-agent deep round: verification, robustness, synthesis, three adversarial critics — all code-verified at `06656ef`).
> Per WORKING_AGREEMENT §1, file:line cites below are pointers to re-verify at build time, not truth.

## 0. What this is, and the settled decisions (do not relitigate)

Jonathan's vision (FAMILY_TRIPS_VISION.md §12): the agenda, the photos, and the Weave reflect the trip the
family actually had — live, self-healing, not the plan as it looked at import time. Phases 1–2 (live agenda
pull `c5bcc58`, Weave same-day regen `8f07199`) shipped. Phase 3 = photos re-file themselves when reality
changes, honestly.

**SETTLED (Jonathan, explicit picks — inform on new facts, never re-ask):**

1. **Auto-apply with a visible "moved because…" note** — not draft-then-confirm. (Settled earlier, 2026-07-05.)
2. **Foundation first** — the sync-layer holes in §3 get fixed before any healing runs.
3. **V1 targets = agenda places AND named settle-sheet moments** (the record bridge is in release one:
   on hangout weeks — the dominant trip shape — nobody back-edits the agenda; the day gets named in the
   evening settle sheet, which never writes `day.stops`).
4. **Backfill the archive's GPS** — one-time client-side EXIF re-extraction from R2 originals (keyless, no
   new deps); bulk-imported refs carry no GPS today (`photoBackfillUpload.js:187`).
5. **Boldness = strict + repair-first** (full gate list in §5).

**Standing architecture (stated to Jonathan, unobjected):** the worker is the single referee; an
off/shadow/on knob (worker secret, `WEAVE_MODEL` precedent) with a shadow period before enable; an
append-only move-audit table; move controls and suggestion banners are adult-lens only; worker-computed
suggestions are projected per-viewer; the moved-note chip and Move-to sheet get Claude Design prompts
before UI is built.

## 1. Prime directive

**A wrong silent move is worse than no move. Auto never overwrites manual. Every behavior is honest
cross-device — no device may show a move the family server hasn't confirmed, and no move may be invisible
or unexplained where it landed.**

**Order independence (Jonathan, 2026-07-05 — a named invariant, not an aspiration):** the documented state
of a trip converges to the same organized truth regardless of the ORDER events arrive in — photos first and
naming months later; naming first, photos after; more photos again later; GPS backfilled at any point.
Enforcement recipe: (a) the matcher is deterministic given its inputs; (b) EVERY input class has a re-match
trigger (§5 — agenda changes, record-entry changes, photo-evidence changes, reveals), with the daily sweep
as the eventual-convergence backstop; (c) application is idempotent; (d) the ONLY order-pinned states are a
manual lock (deliberate — a person's decision pins the moment it was made) and legacy repair-only status —
both visible, both repairable through the ordinary Move-to/suggestion affordances, never a special recovery
flow. Verified by permutation property tests (§7), not by hope.

**Discoverable or invisible (Jonathan, 2026-07-05 — the UX bar):** every capability is either elegantly
discoverable at the moment of need (the manual edit/sort options — Move-to, suggestions, the
finish-the-story pass) or completely invisible (the reconciliation machinery). Nothing in between: no
janitor surfaces, no settings, no status noise. Every Stage-E Design prompt is written as a UX brief
(moment of need, entry point, progressive disclosure — not just visuals), and a dedicated UX-discoverability
audit gates Stage E before build.

## 2. Ground facts the design hangs on (verified 2026-07-05)

- `memories.stop_id` is a dedicated column; the worker upsert binds a **fixed column whitelist**
  (`worker/src/index.js:1049–1120`) and `rowToMemory` emits a **fixed shape** (`:1279–1413`). Unknown fields
  are silently dropped; memories have no catch-all blob. A winning pull wholesale-replaces local records
  (`memoryStore.js:641–650`). → **Provenance must be a real column. Migration 017.** No JSON ride-along
  (every candidate column is whitelist-reserialized, surprise-entangled, or clobber-prone — appendix,
  verify-0). Rafa "Ask for a trip" migration becomes 018.
- **Memories have no periodic pull** — the 20s heartbeat is trips-only; memory `pullAll` runs on cold load +
  foregrounding (`App.jsx` ~433–521). Without a live channel, moves/notes arrive hours late.
- `matchPhotoToStop` is pure, deterministic, plain-`.js` importable — **mirrorable into the worker**, which
  already holds per-ref GPS (`photo_r2_keys_json`) and verbatim trip `data_json`. The worker sees the whole
  truth (no masked views); phones see censored projections (`index.js:849–864`).
- Only the running best match is tracked today — **no runner-up/margin exists** (`photoMatch.js:392`);
  margin-gating needs a small matcher addition.
- Implicit-base ids are **date-keyed** (`__trip_base__:<iso>`, `photoMatch.js:158–161`) — the place they
  denote is re-derived from current lodging. A lodging edit re-labels every base-filed photo silently.
- Kept record entries already store `lat/lng`, `span`, and member `memoryIds` with stable ids
  (`evidence.js:236–243`) — the record bridge has real anchors to target.
- Server weave membership uses bare `day.stops` (`weaveGen.js:182–184`) — base-filed memories are invisible
  to Phase 2's freshness check.

## 3. Stage A — FOUNDATION (prerequisite; nothing in §4+ ships before all of this)

Grouped into batches; each fix gated per the standing loop (unit + full TZ=UTC e2e both projects +
independent adversarial review → local commit; pushes batched; push needs Jonathan's go-ahead).

### A-1 · Trips honesty batch
- **F1 — real trip conflict protection.** `pushTrip` sends `baseUpdatedAt`; client handles the 409 the
  worker already implements (`index.js:1514–1538`, currently dead code because no base is ever sent,
  `workerSync.js:560–575`). **Worker half too:** `getTrips` must emit the row's `updated_at` (today the
  server stamp is only on push responses, so pull-only devices have no base to send), and the trip OCC read
  must include tombstoned rows (`:1526` filters them out, so the guard skips deleted trips → stale-device
  resync resurrects them).
- **F2 — show the stuck-sync truth.** `unsyncedCount` is computed and rendered nowhere; SaveBadge shows a
  green check for "saved locally, never reached the family." Render the count + queue-entry age; honest copy.
- **F5 — serialize** `await resyncPending()` before `refresh()` (`useTrips.js:296–301`) — kills the
  20-second revert-flicker of your own edit.
- **F6 — pull watchdog.** One hung fetch latches `refreshingRef` forever (iOS-PWA suspension class);
  AbortSignal.timeout or latch-age check.

### A-2 · Memory-store integrity batch (one coherent unit — all in `memoryStore.js` + drains)
- **Carried from A-1 (deliberately deferred, do not lose):** the `saved-queued` SaveBadge state can outlive
  its truth — nothing flips "still reaching the family…" to confirmed when the background resync later
  lands, because dequeue alone is ambiguous (delete-adoption and refusal also dequeue). Fix here by giving
  the sync queues a per-outcome signal (synced / refused / delete-adopted) that both the trips and the new
  memory queue emit uniformly; the badge subscribes. Errs pessimistic today (never a false green check).
- **A-1 expectation line (documented contract, not a bug):** trip conflict recovery is whole-object
  deliberate-edit-wins on a fresh base — it stops blind/stale/deleted clobbers, NOT concurrent-edit field
  merging. Field-level trip merge is out of scope for the whole arc.
- **Intent-based retry queue for memory saves** (tripSyncQueue precedent). A failed non-409 mirror is
  currently swallowed silently (`memoryStore.js:584–592`) — permanent device fork. The queue replays stored
  **intent** (`{memoryId, stopId, prov}` through a provenance-aware reapply), NOT a merge-from-live-record
  at drain time. ⚠ These are opposite semantics from the A-2 outbox fix below — do not conflate (appendix,
  critique-0 #2).
- **Delete guards.** `resolveSaveConflict` treats `fresh.deletedAt` as adopt-the-delete (today it checks
  only `!fresh || fresh.masked`, `:535` — a stale device's conflict recovery resurrects deleted memories via
  `ON CONFLICT … deleted_at = NULL`, `index.js:1101`). Worker upsert preserves `deleted_at` (no implicit
  un-delete).
- **Outbox-drain fix.** All **three** drain copies (`uploadQueueRunner` in App.jsx, `PhotosView.triggerDrain`,
  `uploadOrQueueVideo`) re-save enqueue-time `stopId` verbatim with a live OCC base — a silent revert that
  passes the 409 guard. Fix: preserve-on-undefined semantics for `stopId`(+`stopProv`) in `saveMemory`
  (the pattern `capturedAt`/interstitial/mask already have); drains stop passing `stopId`.
- **Foreground 409 reapply becomes stop-field-aware.** The no-closure branch re-pushes the whole stale
  record (`:536`, "last deliberate edit wins") — a caption edit on a behind device would revert a heal and
  (post-017) mis-lock it manual. Preserve `fresh.stopId`/`stopProv` unless the op IS a move.
- **Clock-skew restamp.** Extend the conflict path's server-restamp rationale (`:541–548`) to the ordinary
  success path (`:580–583`), or prefer `serverUpdatedAt` in `shouldTakeRemote` — else a clock-ahead device
  refuses heals for the skew duration.
- **Refusal adoption.** When the worker refuses an auto-over-manual stop change (§4 rule 2) the push
  response carries the stored row — the client must adopt it (sync-honesty: read the per-item result).

### A-3 · Live memory channel
Periodic memory pull piggybacked on the existing heartbeat. Cost-shape decision at build time (documented,
not open-ended): trip-scoped and/or `?since=` delta — a full multi-year `pullAll` every 20s is not
acceptable. Interval-driven ⇒ its e2e is chromium-only (page.clock/WebKit rule).

### A-4½ · Record-trust fold-ins (from the 2026-07-05 vision audit — see ../document-the-trip/VISION.md §5)
- **Surprise filter on the evidence→settle→keep path (SHIP-BLOCKER for the nightly habit):** evidence pins
  must exclude unrevealed-surprise memories; SettleSheet gains per-pin "leave this out" (wiring the
  reserved-but-dead `record.skipped[]`); record entries pass through per-viewer masking like memories.
  Today one absent-minded keep publishes a surprise to every lens (incl. Rafa's stamp list) within seconds.
- **Kept-row exemption in `getStoredWeave`:** the freshness 204 currently applies to kept rows too —
  opening a kept page from the book silently regenerates it, violating the settled kept-is-frozen
  principle. Also: re-keep must stop destroying the prior kept text (confirm-and-replace).
- **Settle-sheet promised verbs:** ship per-pin skip + who-correction chips, or cut the "fix what's wrong…
  skip what you like" copy. Ship the verbs.
- **Fix the stale comment** at dayRecord.js:124–126 (claims Weave/photo-filing read `namedRecordEntries` —
  false today; a future window will inherit the lie).

### A-4 · Weave + lens batch
- **F3 — server weave learns the implicit base** (use `dayStopIds` semantics, not bare `day.stops`) —
  base-filed memories, the settled core shape, currently never trip the Phase-2 freshness check; a kept
  page's signature never matches again after a base move. Needs the implicit-base derivation mirrored
  server-side + a parity test.
- **F8 — NULL `beat_signature` rows** treated as recompute-eligible for non-kept rows (else pre-move
  content serves forever once moves begin).
- **F4 — decide knowingly:** past-day moves permanently de-cache that day's weave (client rebuilds are
  never persisted; cron does one day). Persist on-demand rebuilds, or widen the cron — pick at build time.
- **Kid-lens gate on the existing "Sort to places" banner** (`PhotosView.jsx:364–397` has no persona gate
  today — Rafa can meet "Everyone will see the change"). SyncPill gentling precedent is three lines away.

## 4. Stage B — PROVENANCE (migration 017 + worker rules)

**Migration `017_memory_stop_provenance.sql`:**
- `ALTER TABLE memories ADD COLUMN stop_prov_json TEXT` (NULL back-compat per the 007 template).
- **Append-only audit table** `memory_stop_moves` (memory_id, from_stop, to_stop, source, reason, trip_rev,
  at, by) — written worker-side on every accepted stop change. `stop_prov_json` is a single slot the next
  move overwrites; without the ledger, a bad matcher release is undiagnosable afterward. D1 Time Travel
  (30-day PITR) is the disaster backstop.
- ⚠ **Apply order:** migration applied manually FIRST (safe under old worker code), THEN the worker push —
  deploy-worker.yml does not run migrations; new code INSERTing the column against an unmigrated DB 500s
  every memory write. D1-Edit token gate; Jonathan approves the migration explicitly.

**`stopProv` shape** (client/API field, whitelist-reserialized by the worker like everything else):
`source: 'auto'|'manual'` (the lock) · `at`, `by` (traveler id, `'matcher'`, or **null when inferred**) ·
`movedFrom`, **`movedFromLabel` + `targetLabel`** (human labels snapshotted at decision time — orphan moves
happen precisely because the old stop no longer exists; live resolution would render dev-speak) ·
`reason` code (`'agenda-change'|'stay-located'|'orphan-repair'|'import'|'hand-filed'`; prose rendered
per-lens at display time, never stored) · auto-only: `matchType`, `distanceMeters`, `tripRev`
(**the server row stamp**, not the client-visible device-clock `updatedAt`), `baseAnchor` (lodging
fingerprint — detects the date-keyed-base-id re-label, §2).

**Worker write rules (`postMemory`, enforced in JS before the bind — this is where the lock is real):**
1. Incoming `stopId` == stored → preserve stored provenance (no churn from re-saves).
2. Incoming differs, body carries `stopProv` → reserialize via whitelist. **Stored `manual` + incoming
   `auto` → REFUSE the stop change** (keep stored, return the stored row — the client adopts it, A-2).
3. Incoming differs, no `stopProv` → stamp `{source:'manual', by: null, reason:'unknown'}` — manual is the
   safe lock direction, but **never attribute an inferred stamp to a person** (a stale drain must not put
   "Jonathan moved this" on a revert no human made). Only the explicit Move-to path earns `by: person /
   'hand-filed'`.
4. **INSERT path (new row, no stored to compare):** bare-stopId insert lands provenance **NULL (legacy)** —
   NOT rule-3 manual — else every old-SW import gets manual-locked forever during the mixed-fleet window.
   New-enough clients stamp `'import'`/auto explicitly.
5. Worker auto-moves are guarded targeted UPDATEs (compare stored `updated_at`), never blind upserts, and
   skip `deleted_at IS NOT NULL` rows.

**Backfill semantics: NULL = legacy** — neither auto nor manual. Legacy is **repair-eligible only**: auto-move
only when currently unfiled or orphaned (stopId resolves nowhere, including a vanished/moved-anchor base).
A filed legacy photo whose re-match says "elsewhere" becomes a suggestion, never a silent move. No data
migration; the first move or hand-filing stamps it.

## 5. Stage C+D — the healing service

**C — GPS.** (a) Import-forward: persist per-ref `lat/lng` (small `baseRef` change). (b) Archive backfill:
one-time client-side pass — fetch R2 originals, re-run the existing EXIF extractor, push per-ref GPS through
the existing `photo_r2_keys_json` path. Keyless, no deps, idempotent, resumable.

**D — worker-side matcher.**
- Mirror `photoMatch.js` into `worker/src/` (surprises.js precedent) **plus an automatic parity test**: one
  shared fixture corpus run through both copies in worker vitest (the existing mirror never got one).
- Matcher addition: track runner-up → margin gate.
- **The auto-apply gate (strict + repair-first — ALL must hold):**
  1. `'gps+time'` match only — time-only NEVER moves anything (the stay-default is a prior, not evidence).
  2. Target eligibility: current filing is null, orphaned, or `source:'auto'`; `manual` never moves; legacy
     (NULL) repair-only per §4.
  3. Margin: winner beats runner-up and clears its threshold by ≥ max(100m, 25%).
  4. Whole-memory unanimity across located photos (`refilePlaces.js:65–68` precedent).
  5. Fresher, pulled-clean agenda: trip **server row stamp** strictly newer than the memory's `tripRev`.
  6. Not masked/surprise-flagged; target not an unrevealed surprise stop; not inside the direction-flip
     cooldown. Fails 1/3/4 but passes 2 → suggestion. Fails 2 → nothing, silently.
- **Triggers — the complete input-class set (this list IS the §1 order-independence guarantee; a missing
  class breaks the invariant):**
  (1) *Agenda changes* — postTrip via `ctx.waitUntil` (never inline latency), **debounced on agenda
  quiescence** (N minutes stable — a lodging clear-then-retype must not mass-scatter base filings in the
  gap, appendix critique-0 #5).
  (2) *Record-entry changes* (a moment named/kept/renamed/removed) — if `day.record` rides the trip object,
  postTrip already covers this (verify at build; if it lives elsewhere, it gets its own explicit trigger).
  (3) *Photo-evidence changes* — a completed import already matches its own batch; a GPS-backfill write and
  a capture-date edit (`updateMemoryCapturedAt` — today re-runs nothing) must ALSO enqueue a re-match for
  the affected memories.
  (4) *Reveals* — reveal-time is the natural heal moment for a surprise's photos; scheduled reveals bypass
  postTrip entirely, so the reveal path triggers explicitly.
  (5) *The daily cron sweep* — repair + post-reveal + anything a trigger missed: the eventual-convergence
  backstop. Event + sweep — both, not either/or.
- **Convergence:** overlapping runs need a quiesce loop (after applying, re-read the trip row stamp; if it
  moved during the run, re-run) — the guarded-UPDATE alone silently drops the *fresher* decision (appendix
  critique-0 #7). Never orphan-repair off a base id that resolved within the last M minutes.
- **Record bridge (settled into v1):** kept record entries (stable id, lat/lng, span) join the target set
  alongside `dayStopIds`. Precedence + id-space rules to be designed in this stage's plan pass — every
  consumer of `stopId` must resolve or gracefully label a record-entry id before one can be written.
- **Knob:** worker secret `PHOTO_HEAL_MODE` = `off | shadow | on`. Shadow computes + writes the would-move
  ledger only. **Enable order: deploy off → shadow period on real trips → Jonathan reviews the ledger →
  on.** Auto-apply does not enable until the SW fleet has saturated past the mixed-fleet window.
- **Suggestions:** worker-computed objects riding the pull, projected per-viewer through the same masking as
  memories (counts must not leak surprise shape by arithmetic), synced dismissal (one "Not now" quiets all
  devices), gate-6 filtered.

## 6. Stage E — surfaces (Design-loop gated)

- **Moved-note:** quiet per-photo chip; full story in the lightbox ("moved here when Tuesday's dinner
  changed to 7pm") rendered from snapshotted labels + reason code, per-lens (Rafa: no note at all — photos
  are simply in the right place; Aurelia: lowercase). Chip quiets after first viewing / section-level line —
  the permanent-badge-vs-calm-album tension is decided in the Design prompt, which must describe the
  existing transient-chip system (`PhotoAlbum.jsx:232–299`) in detail.
- **Move-to sheet** ("Move to…" beside Edit-date in the lightbox): day-by-day picker in the existing sheet
  style; any adult; a hand-move stamps `manual` + locks. **This is what makes the lock real.** Also a new
  surface → its own Design prompt.
- **Unfiled:** no new screen. Section explains itself with permission-to-ignore copy ("they're safe here"),
  covers the "In transit" flavor too; near-miss suggestions reuse the existing two-step banner. All
  adult-lens only.
- **Rendering honesty:** an invalidation tick on `mergeFromRemote`/stop patches (no memory-change event bus
  exists — without it, moves are invisible until remount) — but regroup applies **only when idle**: never
  while a lightbox is open or a scroll is in flight (the mid-swipe sibling-list swap, appendix critique-1
  #5); freeze the open group, reconcile on close.

## 7. Test + rollout map (repo-rule constrained)

- Worker vitest (real D1/R2 pool): the postMemory rule matrix (rules 1–5 incl. refusal + insert), gates 1–6
  truth table, quiesce/debounce, audit-ledger writes, parity corpus. **The entire auto-move behavior is
  gateable only here** — e2e mocks all network.
- **Order-independence permutation tests (worker vitest):** one fixture trip + a fixed event set (import
  batch A · name/keep moments · agenda edit · import batch B · GPS backfill · one manual move) applied in a
  fixed list of several permutations must converge to the IDENTICAL final filing + provenance state, modulo
  the documented manual-lock pinning. This is §1's invariant as an executable gate.
- App unit (`node --test`, no `.jsx`): matcher margin/runner-up, intent-queue reducer logic, provenance
  stamping helpers. TZ=UTC locally for day-window tests.
- e2e (chromium+webkit): arrival/rendering from mocked pull payloads carrying `stopProv`; anything
  interval-driven (memory pull heartbeat, F1 resync-409) chromium-only; seed trips into local cache first
  (`?trip=` §8 sidestep); no move-affordance may navigate via `?trip=` URL.
- Standing gates: full TZ=UTC e2e both projects + independent adversarial review per fix before local
  commit; batched pushes; Action green + live SW hash verified per deploy; never two Playwright runs at once.

## 8. Explicitly out of scope / deferred

- Full evidence↔photoMatch engine unification (v1 bridges kept entries as targets; merging the two systems'
  day-attribution regimes — UTC vs leg-local — is its own later decision).
- Batch multi-select hand-moves (after the single-photo Move-to settles).
- The `?trip=` mount-time deep-link gap (WORKING_AGREEMENT §8 — pre-existing, not this arc's).
- Ad-hoc traveler roster drops + budget tracking (pre-existing parking lot).
