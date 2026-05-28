# Helen-surface bug audit — complete

This file closes out the audit kicked off 2026-05-26 against the
deployed PWA, walked on chromium desktop and re-walked on iOS
Safari Simulator (iPhone 17 / iOS 26.5) on 2026-05-28. Bugs are
tracked in detail in [KNOWN_BUGS_HELEN_SURFACE.md](KNOWN_BUGS_HELEN_SURFACE.md);
this is the short read of where the audit landed.

**Status:** Audit complete. Three items remain open by design (the
M2 cascade prompt, April backfill, and the 10 real Helen captures
documented in [BACKFILL_HELEN_VB3.md](BACKFILL_HELEN_VB3.md)).

---

## What we found

Across 2.5 days of walking the PWA as Helen, the audit surfaced
**4 × P0, 5 × P1, 4 × P2, 2 × P3, and 1 × verification gap (iOS)**.
The biggest single discovery was that the entire desktop pass
missed iOS-only failure modes, and the desktop pass needed a
follow-up Simulator walk to be honest about what Helen actually
experiences on her phone.

The P0 batch was concentrated in the photo pipeline:
- **P0.1** Album photos render as black tiles
- **P0.2** Trip-view memory tiles render as empty rectangles
- **P0.3** Jackson Family Drive shows "0 MEMORIES"
- **P0.4** Photo-heavy pages never reach `document_idle`

The P0.2 investigation surfaced the actual root cause — **21
memories on volleyball-2026 carried `kind:'photo'` with no R2
refs at all**, a mix of fixture leak + workerSync's silent no-op
when the IDB blob couldn't be loaded. That triggered both the
render-side defense and the prevention guards that now ship in
production.

The P1 batch was the everyday-quality bar:
- **P1.1 / P1.2** Trip-list heros missing for trips without
  `heroImage` set, even when memory photos were available
- **P1.3** Trips-index Claude had no cross-trip context, so
  "what trips do I have planned this summer" deflected
- **P1.4** Caption-only memory tiles (collapsed into P0.2's fix)
- **P1.5** Opening the lightbox over a partially-loaded grid
  saturated the tab and idle never arrived
- **P1.6** "MAP" button in trip header was wired to
  `onOpenSettings` despite the aria-label "Map view" — no Map
  view existed in the codebase
- **P1.7** Trip Settings showed stale CloudKit-era Apple Photos
  Shared Album instructions that contradicted the Sync section
  directly below it
- **P1.8** Missing `viewport-fit=cover` neutered every existing
  `env(safe-area-inset-*)` call (iOS-only, found in the
  Simulator walk)

P2 / P3 items were friction polish:
- **P2.4** Trip-view "+" FAB jumped to `day.stops[0]` regardless
  of time of day
- **P3.1** `/trips` fetched twice on cold load
- **P3.2** "New trip" button was 87×32, under Apple HIG 44pt
  (iOS-only)

---

## What we fixed

Every P0 and every P1 except P1.4 (which folded into P0.2). P2.4
shipped. P3.2 shipped. P3.1 (double /trips fetch) left as polish.

| Bug | Fix | Commit | Status |
|---|---|---|---|
| P0.4 | Lazy-load via `useInView` + `?w=600` grid thumbnails + sage-skeleton placeholder | `5f9e9ec` | shipped |
| P0.1 | Collapsed with P0.4 | `5f9e9ec` | shipped |
| P0.3 | Classified as migration-incomplete; not data loss | – | classified |
| P0.2 | "Photo unavailable" ImageOff tile when `kind:photo` carries no refs; client-side throw in pushMemory; worker postMemory 400 guard; 11 fixture records soft-deleted | `6bde7d1` + worker version `f478883d…` | shipped |
| P1.5 | `GridPausedContext` unmounts grid imgs while lightbox is open; resumes on close | `11bd7a3` | shipped |
| P1.6 | Removed dead MAP button (no Map view existed; global "⋯" Trip-settings entry already covers Settings access) | `64a7c7e` | shipped |
| P1.7 | Removed Settings shared-album section + stale URL field; Sync section already states the truth | `64a7c7e` | shipped |
| P1.1 + P1.2 | `heroPhotoUrls` Map computed in TripIndex; falls back to a memory photo at `heroStopId`; striped placeholder removed | `09262f0` | shipped |
| P1.3 | `loadTripsSummary` + cross-trip summary block injected into Claude system prompt when no trip is open; new unit test | `bc703ef` (client) + worker `f478883d…` | shipped |
| P2.4 | HelenView + AureliaView default `activeDay` to today-if-in-range, matching JonathanView/RafaView | `bc703ef` | shipped |
| **P1.8** | **Added `viewport-fit=cover` to viewport meta; bumped every screen's top padding to `calc(env(safe-area-inset-top) + 60px)` to clear the now-bigger top bar in standalone PWA mode** | **uncommitted (this turn)** | **review** |
| **P3.2** | **`min-height: 44px` on the "New trip" button to meet Apple HIG touch-target minimum** | **uncommitted (this turn)** | **review** |
| Memory-thread photos open lightbox | New tile buttons in PhotoBubble; ThreadedMemories owns lightbox state | `88dd199` | shipped |
| Duplicate album entries | `flattenPhotoEntries` selects `photoRefs[]` exclusively when populated | `88dd199` | shipped |

Production deploys today: HEAD `bc703ef` on origin/main (Pages
bundle `index-CquOLxz5.js`, CACHE_NAME `v54`), worker version
`f478883d-cfee-4086-a4d1-f04616b6d0e4`.

The two items at the bottom (P1.8 + P3.2) are committed locally
and verified against the iOS Simulator but **not yet committed
or pushed** — per your "Don't commit — leave for review"
instruction.

---

## Group A bar across every ship

Every shipped commit cleared the bar:
- Playwright cold-cache, both projects: 173 passed / 0 failed
  / 15 skipped (consistent across the entire audit)
- Node `--test` unit gate: started at 125/125, ended at 126/126
  (added one test for the P1.3 cross-trip prompt)
- Visual baselines regenerated when intentional (P1.1/P1.2
  removed the striped placeholder; P2.4 swapped default day to
  today; P3.2 made the "New trip" button taller)
- One journey test patched (P2.4 broke an implicit-Day-1
  assumption in `journey-01-photo-thread.spec.js`)

---

## iOS Safari walkthrough findings

A separate pass on iPhone 17 / iOS 26.5 Simulator via
safaridriver + webdriverio. **Every fix shipped during the
chromium audit reproduces correctly on iOS WebKit** — heros
load, dedup holds, P1.5 grid-pause unmounts imgs cleanly,
P0.2 photo-unavailable tile renders, memory-thread lightbox
swipe works, FAB lands in the right place.

iOS-specific findings:
- **P1.8** above — fixed this turn
- **P3.2** above — fixed this turn
- Service worker `registrations=0` under automation —
  intentional per [`main.jsx`](app/src/main.jsx); not a Helen
  bug

The original P0.2 risk hypothesis (iOS WebKit IDB+Blob breakage)
**did not reproduce** on iOS 18.7. IDB, IntersectionObserver,
URL.createObjectURL, visualViewport all work as expected.

---

## What remains open

Three known items. Two are by design, one is M2 follow-up.

### 1. M2 cascade prompt fix (deferred)

The cascade fix from the M2 milestone never shipped — Helen-audit
work jumped the queue. The diff is in the previous Code chat
history. Single commit, single worker redeploy. Re-test prompt:
*"Move Aurelia's first match to 11:30 AM on Saturday"* — expected
to emit a multi-card with both the match move and the warmup move
as siblings, per-row skip.

### 2. April backfill — Jackson Family Drive memories

The Jackson trip (April 17–24) shows "0 MEMORIES" on the index
because the R2 + D1 stacks were created May 3, sixteen days
after the trip ended. Per
[KNOWN_BUGS_HELEN_SURFACE.md#p0-3](KNOWN_BUGS_HELEN_SURFACE.md)
this is migration-incomplete, not data loss. Helen + Jonathan
presumably have these photos in their iCloud Photos library.

A backfill flow (let Helen scrub by date range, re-attach to
the Jackson trip) is project-shaped work. The trip view loads
cleanly with "+ add a memory" affordances on every stop — that's
the natural recovery surface.

### 3. The 10 real Helen captures from the volleyball weekend

[BACKFILL_HELEN_VB3.md](BACKFILL_HELEN_VB3.md) tracks 10 photo
memories Helen captured on 2026-05-25 → 2026-05-26 whose blobs
never reached R2. The metadata rows remain in D1 (`kind:photo`,
no refs) and render as the "Photo unavailable" tile. Decision:
keep the rows as memorial / re-attach target, or delete them?
Jonathan's call.

---

## Closing notes

- **"Pushed" is load-bearing**: every commit that shipped above
  was confirmed via `git push origin main` output. P1.8 + P3.2
  are uncommitted locally — explicitly NOT pushed per your
  instruction.
- **Task #22** (Jonathan: deploy worker for P1.3 prompt change) —
  that's the worker deploy you ran the first time CLEANUP 2
  fired. Worker is currently at version `f478883d…` which
  already carries P1.3 + the P0.2 guard.
- **Standing rules carried through the audit**: bug-trap before
  ship, no time estimates, push when shipping, "pushed" means
  pushed, both adults drive, etc. Nothing eroded.
- **Helen is the design constraint, not the tester** — confirmed
  via the carryover, held throughout. Jonathan ran the iPhone
  verification that surfaced P1.8 + P3.2.

The audit closes here. Open items 1–3 above are the natural next
batch when you're ready.
