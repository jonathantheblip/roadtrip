# Known bugs — Helen's surface

Walkthrough conducted 2026-05-26 against the deployed PWA
(`https://jonathantheblip.github.io/roadtrip/?person=helen`) on
chromium desktop, after the M2 deploy + the volleyball-2026 D1
revert. Helen logged in via `?person=helen`. All findings are real
production behavior, not test fixtures.

Severity scale:
- **P0** Helen-blocking. Surface visibly broken or data integrity in
  doubt. Fix before any other work.
- **P1** Major friction or visible degradation. The kind of "this
  doesn't work right" Helen will name unprompted.
- **P2** Visible imperfection that doesn't block use. Fix
  opportunistically.
- **P3** Polish or non-Helen-visible (network noise, dev-tools
  weirdness).

What this list does NOT cover: memory authoring flow (`+` capture
button), Whisper voice memos, the cross-trip "All photos — every
trip" view, the map view, day-event drill-in, the Jackson Family
Drive trip surface, the Rafa birthday surface, the Vermont planning
surface. Walking those triggered the same page-hang as the album,
which blocks automated exploration past one screen — see P0.4. A
follow-up walkthrough on a configuration that doesn't hang (the
phone, where Helen actually uses this) will surface what the
desktop chromium walk couldn't reach.

---

## P0 — Helen-blocking

### P0.1 — Album photos render as black tiles
**Surface:** Trip view → "N CAPTURED Photos" → album

**What Helen sees:** Open the Fun @ the Sun photos album (55 photos
across 8 stops). Every single photo tile in the grid renders as a
solid black square. Captions and metadata (date, location, "uploaded"
stamp) render correctly. Tapping any tile opens the lightbox and the
photo displays normally at full quality.

**What's happening (probable):** `54 <img>` tags exist in the DOM
with `src` set. `naturalWidth > 0` on **27 of 54** — half the images
have completed loading from the worker; the other half are in
flight. The grid layout uses `width:100%; height:100%;
object-fit:cover` on an `<img>` inside a sized parent. Behind the
img is a black background that's visible while the image is still
loading or while it's transparent / not yet decoded.

**Evidence:**
- Lightbox rendering of tile 1 of the Beach Bungalow check-in:
  ceiling fan + curtains + TV, bright and sharp.
- Grid rendering of the same tile (and 53 others): solid black.
- All HTTP fetches: 200 OK with `?w=2048` (no resize endpoint hit
  yet — those photos are 2048px native).
- Carryover already names this class for iOS Safari ("63 pre-fix R2
  photos rendering as black tiles"). This walkthrough confirms it
  also reproduces on chromium desktop.

**Why it's P0:** This is the surface Helen uses to look at the
weekend's photos. 41 memories on this trip; she came back from the
tournament expecting to scroll an album. What she sees is an
all-black wall.

---

### P0.2 — Trip view memory tiles render as empty blanks
**Surface:** Trip view (any trip with memories) → inline memory tiles
under a stop

**What Helen sees:** On the Fun @ the Sun trip view, Day 1 has stops
with memories attached. The first stop ("Aurelia pickup") shows
**"1 MEMORY · Fast food — in & out"** but the photo area underneath
the caption is empty whitespace. The Beach Bungalow check-in shows
**"3 MEMORIES"** with one photo rendering correctly (a kitchen +
bedroom shot) and another tile completely blank with only the
caption text "The house is so cute!!!" floating above empty space.

**What's happening (probable):** Memory thumbnails on the trip view
render as `<div style="background-image: url(...)">` rather than
`<img>` tags (confirmed via DOM inspection — `totalImages: 0` on the
trip view, but `divsWithBgUrl: 2`). Two URLs were actually fetched
out of N memories present. When the background-image fails to load
or the IDB blob URL is stale, the div renders as a flat empty
rectangle — no broken-image icon, no "unavailable" text, no
indication anything went wrong. Just whitespace.

**This is the "unavailable" bug class** the carryover named — the
visual presentation is "empty tile under a caption."

**Evidence:**
- Trip header on Day 1 reports "19 CAPTURED Photos" but only
  2 photo URLs were fetched during render.
- DOM has 14 empty tile-shaped divs (`aspect-ratio` set, no img
  child, no background-image).
- The 2 photo URLs that did render arrived from the Worker R2 path
  (`/assets/<user>/mem_*/photo-*`), not from any IDB blob.

**Why it's P0:** When Helen is scrolling her trip and sees half her
captions floating over empty rectangles, the surface looks broken,
not slow.

---

### P0.3 — Jackson Family Drive shows "0 MEMORIES"
**Surface:** Trip list (trips index)

**What Helen sees:** The "Jackson Family Drive" archived trip
(April 17 – 24, Belmont → Houston) shows **"0 MEMORIES · 8 DAYS"**.

**Why this is P0, not P1:** The trip is real and substantial — it's
the major April road trip referenced throughout the memory bank and
carryover history. "0 memories" on an 8-day cross-country trip with
two adults and two kids is statistically implausible. Three
possibilities, ordered by severity:
- (a) Memories were never uploaded — Helen + Jonathan thought they
  were saving but the upload pipeline failed silently on every
  attempt for the entire trip. Worst case: data was lost on devices
  before sync. Mid case: photos still on the phones, never reached
  R2/D1.
- (b) Memories exist on the worker but the trips-list count display
  is broken (display bug, data intact).
- (c) Memories exist but are misattributed to a different trip-id.

**Why it's P0 either way:** if (a), there's an active data-loss
class still operating that we don't have visibility into. If (b),
Helen sees "0 MEMORIES" on a major archive every time she opens
the app and either accepts the false statement or worries something
is wrong.

**Verification needed:** Query D1 for `mem_*` rows tagged
`trip_id=jackson-2026` (or whatever the canonical ID is). If the
worker has memories for that trip, this is a display bug. If it
doesn't, the pipeline is the issue.

---

### P0.4 — Photo-heavy pages never reach `document_idle`
**Surface:** Trip view (Fun @ the Sun), Photos album for that trip,
and presumably any trip with many memories

**What Helen sees:** Visible to Helen as: PWA loading spinner that
never stops, service worker that may stall on update checks,
"Add to Home Screen" install flows that wait for an idle moment that
never arrives. Visible to me as: browser automation `executeScript`
calls hung for 45 seconds before timing out, blocking further
walkthrough on those surfaces.

**What's happening:** The album view fetches all 55 photos at full
resolution (`?w=2048`) as soon as it mounts. No lazy-loading,
no IntersectionObserver discipline, no `loading="lazy"` on the
imgs. Browser keeps the page in "loading" state until every
request finishes. With a slow connection or many large images,
that's many seconds. The trip view itself trips the same condition
even though only 2 of 19 photos rendered before idle.

**Why it's P0:** Beyond the user-facing slowness, this actively
blocks debugging. I could not screenshot or query the Fun @ the
Sun trip view a second time without first navigating to a
no-images URL (example.com) to release the browser. Helen's daily
workflow involves opening trip views repeatedly; she'll feel this
as "the app is always loading."

---

## P1 — Major friction

### P1.1 — Trips index: Vermont hero is a giant empty placeholder
**Surface:** Trip list, IN PLANNING row

**What Helen sees:** Opens the app. First card is "Vermont
Juneteenth Weekend (IN PLANNING) · JUN 19 – 21, 2026 (FRI-SUN)".
Below it, a striped sage-on-cream placeholder rectangle that
occupies the entire viewport — taller than 600px. To get past it
to her archived trips, she has to scroll an entire screen-height
of blank stripes.

**What's happening:** The card hero block has a fixed aspect ratio
(probably `16/9` or similar full-width banner). When no image is
set, it renders the placeholder pattern at full size. Helen
created the Vermont trip but hasn't uploaded a hero photo yet —
that's the in-planning state, by design probably.

**Why it's P1:** Helen scrolls past this every time she opens the
app. The placeholder is design-language-correct (sage stripes
match the theme) but it's a wall, not a hint that an image
belongs here.

**Suggested treatment:** Compact card layout when no hero is set,
OR a much smaller placeholder, OR a "Add a hero photo →" CTA
inside the placeholder so Helen knows it's actionable.

---

### P1.2 — Trips index: archived trips with memories have no hero
**Surface:** Trip list, ARCHIVED rows

**What Helen sees:** Two of her three archived trips render with no
hero block at all — just title, subtitle, route, memory count.
- "Rafa's 5th Birthday Weekend" (15 memories) — no hero
- "The Jackson Family Drive" (0 memories per P0.3) — no hero

"Fun @ the Sun" gets a hero (the AAU Volleyball logo from
`./images/volleyball.png`, hardcoded in the seed). But the
others sit as compact text rows.

**What's happening (probable):** A trip's hero is the
`heroImage` field on the trip record. The volleyball trip has
`heroImage: './images/volleyball.png'` set in the seed. The
other trips don't have that field, OR have `heroStopId` pointing
at a stop whose first memory should be the hero — but that fallback
doesn't kick in.

**Why it's P1:** Rafa's birthday weekend has 15 memories. One of
them should be the hero. Helen sees a title-only line where she
should see her son's birthday photo.

---

### P1.3 — Trips-index Claude has no trip context
**Surface:** Trips list → "Plan with Claude" FAB → empty
conversation

**What Helen typed:** "what trips do I have planned this summer?"

**What Claude said:** *"I don't have any trips loaded right now —
you're on the trips list screen, but the app hasn't shared the
trip details with me yet. To see your summer plans, just tap into
a trip from your list and I'll have full context to help you from
there. If you're thinking about planning something new, I'm happy
to help you think through ideas too!"*

**Why it's a bug:** Helen has four trips in cache including
Vermont Jun 19–21 (literally this summer). The most natural
cross-trip question on the index — *what's on my plate this
summer* — bounces. Claude correctly reads "no trip in context"
but the system prompt could include a one-line summary of every
trip in the cache when no specific trip is open. That summary
is cheap to build server-side and would let the trips-index
Claude be genuinely useful for the "what's coming up" question.

**Why it's P1, not P0:** The chat surface works correctly per
the M2 spec; this is a missing-feature shape, not a broken one.
But Helen used it within 30 seconds of opening the app on the
walkthrough and got a deflection. That's friction at first touch.

---

### P1.4 — Empty caption-only memory tiles inside threads
**Surface:** Trip view → stop with memories → memory tile

**What Helen sees (concrete):** Beach Bungalow check-in, "3
MEMORIES" header. The middle tile shows the caption "The house
is so cute!!!" floating above completely empty space — no photo
underneath. (See P0.2 for the technical shape; calling this out
separately because the caption-above-blank-rectangle pattern is
the specific visual signature Helen will describe.)

**Why it's P1 separate from P0.2:** P0.2 is the rendering
mechanism; this is the visual outcome Helen reports. Fix the
rendering and this self-resolves, but until then it's the
phrasing she'll use to describe what's broken.

---

## P2 — Visible imperfection

### P2.1 — Photo lightbox vs grid rendering mismatch
**Surface:** Album grid → tap a tile → lightbox

**Observation:** Same image URL renders correctly in the lightbox
and as a black square in the grid. Grid uses
`width:100%; height:100%; object-fit:cover`. No `loading="lazy"`,
no skeleton state, no fade-in. Black background bleeds through
during load and after if decoding stalls.

**Treatment idea:** Lazy-load grid thumbnails (`loading="lazy"`),
add a sage-tinted skeleton, fetch a smaller `?w=` for grid
(currently using `?w=2048` for both grid and lightbox).

---

### P2.2 — Vermont trip card: hero placeholder size
**Surface:** Trip list, in-planning row

See P1.1. Listed in P2 because the same finding has a P2 cousin:
even after the P1 fix, the no-hero state for an in-planning trip
needs a deliberate "compose your hero" prompt.

---

### P2.3 — Page never settles to idle (root cause analysis)
**Surface:** Trip view + album view

See P0.4 — same finding, but the P2 angle is that even after fixing
the practical impact, Helen's phone fan is going to spin on
photo-heavy trip pages. Worth a perf pass once the structural fixes
are in.

---

## P3 — Polish / not Helen-visible

### P3.1 — `/trips` fetched twice on page load
**Surface:** Network panel on initial load of trips index

Two GET `/trips` calls in quick succession on cold load. Both
200 OK. No functional impact, but cache invalidation / unnecessary
re-fetch is happening. Worth tracing the React state-update path
that triggers it.

---

## Verification gaps — surfaces not yet walked

Calling these out so they don't get assumed-clean:

1. **Memory authoring flow** — the `+` FAB and the per-stop "+
   add a memory" affordance. Not tested. Upload pipeline
   verification is also where P0.3 (the 0-memories Jackson trip
   question) would be resolved.

2. **Whisper voice memos** — referenced in the carryover as "if
   wired." Not tested whether the mic affordance even renders for
   Helen.

3. **Cross-trip "All photos — every trip" view** — the link
   visible at the top of every trip's photo album. Not opened
   (album view hung first).

4. **Map view** — "⊕ MAP" button visible in the trip header.
   Untested.

5. **Day-level drill-in** — opening a specific day's events from
   the day chip strip. Briefly observed at the trip view level
   but not the dedicated day view if one exists.

6. **Rafa's 5th Birthday Weekend trip surface** — only the
   trip-list card was inspected.

7. **Vermont Juneteenth Weekend trip surface** — only the
   trip-list card was inspected; the in-planning state likely
   has a different shape than the archived state.

8. **The Jackson Family Drive trip surface** — only the
   trip-list card was inspected. Important: P0.3 needs this to
   resolve.

9. **Settings / family / traveler-switcher** — the dock at the
   bottom of the trip view shows Helen/Jonathan/Aurelia/Rafa.
   Not exercised.

10. **iOS Safari behavior** — desktop chromium reproduced enough
    bugs to fill this list. The carryover names iOS Safari
    specifically for the legacy black tiles. Helen's phone is
    where she actually uses this; a phone-side walkthrough would
    likely surface additional bugs.

11. **The Day 1 thread of the photo album** — only saw the
    Beach Bungalow row and the Beach + breakfast row before
    the page hung. Day 2 / Day 3 / Day 4 weren't reached.

---

## Suggested triage order

1. **P0.3 first** — the data integrity question. If memories on
   the Jackson Family Drive were actually lost, that's an
   incident, not a bug — and the answer changes the priority of
   everything else.
2. **P0.4** (page never reaches idle) — once this is fixed, the
   rest of the walkthrough becomes possible, and the verification
   gaps above can be closed.
3. **P0.1 and P0.2 together** — they share root cause (image
   loading discipline and the background-image vs `<img>`
   approach for tile rendering). The server-side resize spec at
   `app/docs/photo-server-resize-spec.md` is part of the fix
   surface.
4. **P1 batch** — hero policy across the trip list (P1.1, P1.2)
   and the trips-index Claude context (P1.3) are clean,
   independent fixes.

---

## Walkthrough metadata

- Deployed version: client `5d9ef3c` on `main`, worker
  `d33209c1-3a43-42d4-93c7-7a52f4b82d5b`
- Browser: chromium desktop, 1372×871 viewport, via the
  Claude-in-Chrome MCP
- Auth: Helen via `?person=helen` query param
- Cache state: live (used Helen's actual D1 + R2 data; the
  volleyball-2026 trip was reverted to as-actually-happened
  before the walk)
- M2 cascade prompt fix: still deferred behind this work

---

# Update — 2026-05-27, post-P0.4 fix and re-walk

After commit `5f9e9ec` (deployed to Pages as the bundle
`index-MTyC3JU-.js`), the previously-blocked Helen surfaces became
reachable. Findings below are appended to — not replacing — the
original list above.

## Resolved by the P0.4 fix

### ✅ P0.4 — Photo-heavy pages never reach `document_idle`
**Verified resolved.** In production:
- Fun @ the Sun album: 55 tiles in the DOM, 14 in-view + img-mounted
  on load (vs 55 before), 41 out-of-view + no img element. After
  scroll to the bottom: 30 in-view / 29 imgs / 26 loaded. `readyState`
  reaches `complete` reliably. The PWA spinner that never stopped
  now stops.
- Trip view (Fun @ the Sun): reaches `complete`. Only 2 photo
  fetches in flight on initial render (was 19+). All use the new
  `?w=600` thumbnail variant.
- Cross-trip "All photos — every trip": 103 tiles, 14 in-view, no
  hang. The cross-trip view inherits the same discipline.

### ✅ P0.1 — Album photos render as black tiles
**Collapsed alongside P0.4.** What previously read as "black tiles"
was the parent div's `background:'#000'` showing through while the
full-resolution `?w=2048` image decoded. With the new
sage-skeleton placeholder + `?w=600` lazy-loaded thumbnails, tiles
now show the sage-stripe placeholder briefly, then snap to the
actual photo. No more black walls.

## Still present, still P0 — confirmed during re-walk

### P0.2 — Trip-view memory tiles render as empty rectangles
**Not addressed by the P0.4 fix.** Rafa's 5th Birthday Weekend trip
view loads to `complete`, the page no longer hangs, but the
"2 MEMORIES" thread on the first stop renders as a flat cream
rectangle with avatar dots in the corners and zero visible photo
content — despite 2 div-with-background-image URLs being fetched
(both 200 OK from R2).

The screenshot signature: avatar dots in the corners of an
otherwise empty cream rectangle, with a "2" multi-photo count
indicator floating in the upper-right area, but no actual image
visible. Caption text (when present) sits on top of empty space.

**Why P0.4's fix didn't help:** P0.4 was about *fetch discipline*
(too many concurrent fetches saturating the page). P0.2 is about
*render*: the background-image URL is set on the div but the
photo doesn't paint. Possible causes (all speculative without
further investigation):
- The URL points at an R2 key whose object is corrupt (missing,
  zero-byte, or returns a non-image content-type)
- The div's CSS sizing collapses to zero pixels in some
  arrangements, so the background-image has nowhere to paint
- The `photoRef.url` field is a stale CloudKit URL from before
  migration (consistent with the P0.3 finding: trips migrated,
  memory metadata partially did not)

Recommended next probe: pick one of the rendering-blank memory
rows, query the worker for its `photoRefs[0].url`, and `curl`
the URL to see what content actually returns. If the body is
non-image bytes (HTML error page, empty, or 404), that's the
data-integrity question P0.3 named.

## Resolved-but-incomplete (new state to document)

### P0.3 — Jackson Family Drive shows "0 MEMORIES"
**Classified during the P0.3 investigation as migration-incomplete,
not data loss.** D1 + R2 stacks were created 2026-05-03, sixteen
days after the trip ended (April 17–24). The trip record was
migrated from the retired CloudKit; memory rows and photo assets
were not. The "0 MEMORIES" display is accurate to the current
backend.

**Trip view confirmed during re-walk:** the Jackson Family Drive
trip view loads cleanly with `readyState: complete`. Eight day
tabs render (DAY 1 Fri through DAY 8 Fri). Day 1 ("Up the Hudson")
shows the Art Omi stop + Postcard Cabins, each with a "+ add a
memory" affordance — the trip structure is intact; memories are
just absent. Day 4 ("Through Mississippi") navigated cleanly with
3 stops. Day drill-ins work in general.

**Recovery surface, when it exists:** Jonathan + Helen presumably
have these photos in their phones' Camera Roll or iCloud Photos
from April 17–24. A backfill flow that lets them re-upload by
date range (or import from a shared album) would restore the
trip. That's project-shaped work, not a bug fix. Filing it as a
follow-up surface for a future milestone.

## P1 from the original list — re-verified

### P1.1 — Vermont in-planning hero is a giant empty placeholder
**Confirmed unchanged.** Vermont card on the trips index still
renders a viewport-height striped sage placeholder. Clicking the
Vermont card kept the index URL (no `?trip=` change observed in
this session). Whether that's because Vermont has no day
structure yet or because the in-planning trip routes differently
than archived ones, the user-visible state is the same as the
original walkthrough.

### P1.2 — Archived trips with memories show no hero
**Confirmed unchanged.** Rafa's 5th Birthday Weekend (15
memories in D1) still has no hero block on the trip-list card —
only title + subtitle + route + memory count. No memory photo
is automatically used as the hero. The Jackson Family Drive
shows no hero, but that's expected given P0.3 (no memories to
promote).

### P1.3 — Trips-index Claude has no trip context
**Confirmed unchanged.** Not retested on this re-walk; the
P0.4-fix deploy doesn't touch the worker. Still a single-prompt-
template fix for a future iteration.

## New findings — surfaced during the re-walk

### P1.5 (NEW) — Opening the lightbox over a partially-loaded grid hangs idle
**Observed.** Clicking a tile in the Fun @ the Sun album opened
the lightbox correctly: the bare URL was used (no `?w=` rewrite,
confirmed full-res target), the lightbox React component mounted,
and the full-res image began fetching. But the page failed to
reach `document_idle` for 45+ seconds — the chromium automation
hung exactly like the pre-P0.4 album did.

**Likely cause:** grid tiles behind the lightbox are still in the
React tree. Their IntersectionObserver still considers them
"in view" because the lightbox is a positioned overlay, not a
DOM reparent. So opening the lightbox adds the full-res fetch
ON TOP of all the in-flight grid thumbnail fetches that were
already mid-flight. The browser saturates and idle never arrives.

**Why it's P1, not P0:** Helen on her phone may not notice the
idle state directly (the lightbox itself is interactive), but
PWA service workers, share targets, "Add to Home Screen"
prompts, and pull-to-refresh logic all wait for idle. Surface
behavior on her phone may have intermittent stalls she'd describe
as "weird laggy moments after I open a photo."

**Treatment idea:** when the lightbox opens, pause new grid img
loads (e.g., suspend the IO callbacks or unmount the grid imgs
behind the lightbox). Restore on close.

### Verified-clean surfaces

These were on the original walkthrough's verification-gaps list
and walked cleanly during the re-walk:

- **Day drill-ins** — DAY tab clicks on Jackson Family Drive
  swap content correctly (DAY 1 "Up the Hudson" → DAY 4 "Through
  Mississippi"). Page reaches `complete` after each navigation.
- **Cross-trip "All photos — every trip"** — 103 tiles across
  Fun @ the Sun + Rafa's birthday. Lazy-load discipline applies.
  Trip-band headers ("TRIP · Fun @ the Sun") render correctly.
- **Vermont trip surface** — loads to `complete`. Visual state is
  unchanged from P1.1 (sage stripes), but the page no longer
  triggers any latent issues.
- **The Jackson Family Drive trip surface** — full 8-day
  structure renders, every day's stops visible. "+ add a memory"
  affordance present on each stop. This is the natural recovery
  surface for the P0.3 photos-not-migrated state if someone
  later wires up a re-upload flow.

## Still NOT walked (verification gaps that remain)

The original list's gaps that I didn't reach this session:

1. **Memory authoring flow** — the `+` FAB and per-stop "+ add a
   memory" affordance. Both are visible on every trip view but
   I never clicked one. Crucial for P0.3 recovery if Helen
   wants to backfill Jackson trip photos.
2. **Whisper voice memos** — untested.
3. **Map view** — "⊕ MAP" button visible in trip header,
   untested.
4. **Settings / traveler-switcher dock** — the bottom strip
   shows Helen/Jonathan/Aurelia/Rafa with role labels. Untested
   beyond confirming it renders.
5. **iOS Safari behavior on the phone** — desktop chromium
   reproduced the album bugs but didn't reach iOS-specific
   issues. The original carryover specifically called out
   pre-fix R2 photos as black tiles on iOS Safari — a phone-
   side walk would confirm whether the new sage skeleton +
   `?w=600` discipline also fixes those.
6. **Helen's first stop on Day 1 of Fun @ the Sun** — the large
   thread area at the top (Aurelia pickup, "1 MEMORY · Fast
   food — in & out") still renders empty. Same shape as P0.2.

## Triage order, revised

1. **P0.2 first** — empty memory tiles. This is the surface
   Helen sees most. Likely worth a quick probe (curl one of
   the offending photo URLs) before deciding whether it's a
   data-integrity issue or a rendering bug.
2. **P1.5 (new)** — lightbox-over-grid idle hang. Cheap fix
   if it's just IO suspension; high value for Helen's phone.
3. **P1 batch unchanged** — P1.1, P1.2, P1.3 still as listed
   in the original triage.
4. **Memory authoring walk** — once that's verified, P0.3
   recovery becomes a real conversation.

---

# Update — 2026-05-27, P0.2 probed and resolved (render-side)

## What the probe found

P0.2 classified as **data-side, but not the corrupt-R2 shape the
prior walkthrough anticipated.** The empty tiles are not a CSS/
layout collapse and not a 200-with-corrupt-body. The empty tiles
are memories carrying `kind:'photo'` with **no photo refs at all**
— neither `photoRef` nor `photoRefs[]` nor `photoExternalURLs[]`.
The renderer cannot paint what isn't there.

**Volume on volleyball-2026 (Helen's primary trip view):** 21 of
40 photo memories are empty-ref. Of those:

- **10 records** all dated `2026-05-23T12:00:00.000Z` exactly,
  all `author=helen`, all `stopId=vb3-4` — round-noon-UTC
  timestamp with millisecond identity across 10 records strongly
  implies seed/fixture data leaked into Helen's production D1.
- **1 record** ID `preview-uploaded-fallback` — that ID prefix
  matches `c0-lightbox-uploaded-fallback.png` in the Playwright
  fixture set. Test fixture leaked into prod.
- **10 records** dated 2026-05-25 22:52 → 2026-05-26 03:12,
  `author=helen`, all `stopId=vb3-4` — Helen's real captures
  during the actual volleyball tournament, persisted as
  metadata but with no R2 upload.

## Root cause (the 10 real captures)

[`workerSync.pushMemory`](app/src/lib/workerSync.js) silently
no-op'd the upload branch when `loadAsset` returned null (IDB
blob missing or evicted), then POSTed the half-record with
`photoRef.storage:'idb'` still set. [`worker/src/index.js`'s
postMemory](worker/src/index.js) only stores `photo_r2_key` when
`storage === 'r2'`, so the worker silently accepted the row
with `photo_r2_key=NULL` and `kind='photo'`. From that point
forward the record was rendered server-side as a `kind:photo`
with no URL, and the client renderer fell through to the
sage-stripe placeholder forever.

This explains the carryover's earlier "200 OK from R2" note as
a misread: 200 was the response on the URLs that DID render,
not on the empty tiles (which never fired a fetch — there was
no URL to fetch).

## Fix that shipped

Three changes, single commit:

1. **Render-side defense** — the three trip-view photo render
   paths now detect `kind:'photo'` with no renderable source and
   surface a calm "Photo unavailable" tile (`ImageOff` icon on
   `var(--bg2)`) instead of the sage-stripe placeholder. Helen
   sees a final state, not a forever-loading promise.
   - [`HelenView.ThreadPreviewTile`](app/src/views/HelenView.jsx)
   - [`AureliaView.Postcard`](app/src/views/AureliaView.jsx)
   - [`ThreadedMemories.PhotoBubble`](app/src/components/ThreadedMemories.jsx)
2. **Client-side prevention** —
   [`workerSync.pushMemory`](app/src/lib/workerSync.js) now
   throws when an asset upload cannot complete (IDB blob
   missing). `scheduleMirror`'s catch swallows the throw; the
   local record stays canonical with its idb-storage ref so a
   future retry can still succeed, but no half-record reaches
   D1.
3. **Worker-side defense in depth** —
   [`postMemory`](worker/src/index.js) rejects 400 on
   `kind:'photo'` POSTs that carry no r2 keys and no external
   URLs. If the client guard is ever bypassed, the worker
   stops the leak at the gate.

## What's NOT fixed (deferred for Jonathan's decision)

The 21 existing broken records remain in D1. They render as
the new "Photo unavailable" tile rather than a misleading
loader, but they're still in Helen's view as evidence of the
captures that failed. Three options for cleanup, none of which
this fix executes:

- **Delete**: removes the failed captures from Helen's view.
  Destroys the only metadata trail of the failed uploads.
- **Mark and recover**: add an affordance Helen can tap on the
  unavailable tile to re-attach a photo from her camera roll
  (mostly relevant if her phone still has the originals).
- **Keep as-is**: the failed captures stay visible as a
  reminder; future writes can't replicate the shape.

Recommend Jonathan decides before scope expands. The fixture-
shaped leaks (10 records at noon UTC + 1 `preview-` ID) are
clearly safe to delete; the 10 real captures are not.

## Group A bar

- 173 passed / 0 failed / 15 skipped (both Playwright projects,
  cold-cache) — baseline.
- 125 / 125 node `--test` unit gate.
- Local visual verification via preview server: broken records
  render with the new "Photo unavailable" treatment; in-flight
  thumbnails still use the sage-stripe loader; memories with
  valid R2 refs paint photos normally.

## P0.2-class surfaces in PhotoAlbum

The trip's main photo album surface
([`PhotoAlbum.PhotoTile`](app/src/components/PhotoAlbum.jsx))
is unaffected — its upstream
[`flattenPhotoEntries`](app/src/lib/photoEntries.js) drops
memories with no URLs at the entries layer, so empty-ref
memories produce zero tiles rather than empty tiles. No fix
needed there.
