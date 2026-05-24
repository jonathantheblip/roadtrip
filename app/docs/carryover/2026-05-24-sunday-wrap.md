# Carryover — Sunday morning, 2026-05-24 → next Code session

Read this top-to-bottom before touching code. The prior carryover at
[`2026-05-24-photos-m3.md`](./2026-05-24-photos-m3.md) covers the
error policy that's still in force (§4 here references it but doesn't
re-state it). Today is the Mohegan Sun consolation-bracket day; the
family will use the app live. Real-world bug reports are the priority.

---

## 1. What's shipped

The Saturday-into-Sunday-overnight session series closed nearly all of
[`PUNCHLIST_3.md`](../../../PUNCHLIST_3.md):

| Item | What's live |
| ---- | ----------- |
| **Item 0** — Active trip resolver | `pickActiveTrip()` returns the trip whose `[startDate, endDate]` window contains today; PWA opens on volleyball-2026 today. (`6c72bf7` era) |
| **Item 1** — Leave-when wiring | Buttons rendered on Activity cards + Stop detail; derives `homeBase` from lodging stop when `trip.homeBase` is absent. (`6c72bf7`) |
| **Item 2** — Sunday plan rewrite | Day 3 = 8 stops on Court 3 Mohegan, factual tone, no Saturday-loss language, departure logistics held open as two options. (`6c72bf7`) |
| **Item 3** — Spelling + truncation | "Mohegan" canonicalized; Day 2 description completed. (`6c72bf7`) |
| **Item 6** — Queue → live Places search | Jonathan-view Queue (Bathroom / Fast food / Outside / Emergency) opens a bottom-sheet modal with distance-ranked results; Worker `/places/nearby` deployed. (`454dbad` + user deploy) |
| **Item 7** — De-duplication scaffolding | `canonicalKey(activity)` + `findExisting()` in `app/src/data/sideActivities/canonical.js`; observed `placeId` captured; `npm run check-duplicates` CLI. (`c7e14e9`) |
| **Items 4 + 5 — Photos** | PhotosView shell (M1, `81be6a1`); photo upload pipeline (M2, `210f88c`); §3 error-surface collapse to Bucket A silent + 3 Bucket C strings (`4bba041`); video upload pipeline with WebCodecs encode worker + mp4-muxer + progress UI (M3, `510bd31`); Background Sync drain + Page Visibility fallback (M4, `5fd3897`). |

State at the end of the last session:

- **Test counts** — 62 Node unit tests + 29 Playwright e2e tests, all green at [`5fd3897`](https://github.com/jonathantheblip/roadtrip/commit/5fd3897)
- **Cache name** — `jackson-trip-react-v37` (bump on every UI-affecting change)
- **iOS compat doc** — [`app/docs/ios-compatibility.md`](../ios-compatibility.md)
- **Dev-mode upload log** — gated by `localStorage.rt_dev_mode === 'true'`, rendered as a section in Settings (`DevModeUploadLog` in `app/src/views/Settings.jsx`). Provides histogram, Refresh / Copy all / Clear, newest-first entry list with Bucket A/C colouring.
- **Worker deploy state** — `/leave-when` and `/places/nearby` both reported deployed; `/assets/photo/:id` and `/assets/video/:id` (same route, mime-routed) live without any new Worker change for M3/M4.

---

## 2. Smoke-test results from real devices

Jonathan smoke-tested on his phone Saturday night:

- Happy-path photo upload — worked
- Airplane-mode queue-and-resume — worked (pill went to 1, came back online → pill drained silently)

Rafa's iPad — confirmed on current iPadOS; the video picker WILL surface
for him. Update the "needs confirmation" flag in
[`app/docs/ios-compatibility.md`](../ios-compatibility.md) when next
touched: Rafa is on current iPadOS, not iPadOS 17 stuck-on-old-hardware.

**Not yet smoke-tested:** Helen's phone, Aurelia's phone. Today (Sunday)
is the consolation-bracket day; the family will use the app live. Any
report from Jonathan today is a real-world bug report against shipped
code, not a new feature request.

---

## 3. Today's work — three categories

### Category A — Real-device polish (reactive)

Jonathan will surface rough edges as they appear. Likely candidates
based on what shipped + what hasn't been touched by a real iPhone yet:

1. **Photo upload from Helen's actual camera roll** — HEIC handling
   (iOS 17 decodes natively but check that `createImageBitmap(File)`
   returns the right dimensions); large file behavior (raw iPhone HEICs
   can be 5–8MB pre-downscale); EXIF date sorting in the live album
   (the §3 work made EXIF the primary date; verify the sort within a
   stop group reflects capture order, not upload order).
2. **Video upload from a real iPhone** — encode time on actual A-series
   hardware (Playwright headless is generous; iPhone may be slower);
   progress UI feel (does Helen think it's frozen between ticks?);
   the H.264 baseline 3.1 profile choice — confirm playback works in the
   album lightbox.
3. **Background Sync drain on real iOS** — the Page Visibility fallback
   is the path that fires (Safari doesn't support the Background Sync
   API). Confirm the sync pill actually drains when Helen backgrounds
   and re-foregrounds the app.
4. **Leave-when on the actual Sunday departure** (~2:00–2:15pm from
   41 Lower Blvd) — first real production use of the iteration loop
   with live Routes API traffic data. The 60-min duty buffer applies
   (3:30pm coach call time → 2:30pm leave-by under base conditions;
   traffic may push earlier).
5. **Queue → Places search at the venue** — Bathroom and Fast food are
   the most likely tapped categories. The Worker is deployed; the
   client-side modal expects `{ name, vicinity, distanceMeters,
   placeId, lat, lng }` shape.

**Process for every report:**

- Reproduce in Playwright first if possible. The headless Chromium has
  WebCodecs, IndexedDB, Service Worker, Background Sync, and all the
  Canvas APIs — most real-device bugs can be reproduced.
- If a real-device bug can't be Playwright-reproduced (iOS HEIC quirks,
  iPhone-specific WebCodecs subset, Safari-only behavior), document
  the manual repro in the test file's header comment and propose how
  to validate the fix before Jonathan re-tests.
- Apply the §3 error policy (see §4 below) to any new failure mode.

### Category B — Loose ends from the Saturday work

These weren't blockers but are worth closing while at the tournament:

1. **`vb1-3` stop coord audit** — the last session fixed `homeBase` to
   `41.3225, -72.0943`, but the original `vb1-3` itinerary stop entry
   may still carry the old `41.3052, -72.1072`. Low priority. Grep
   `41.3052` and `vb1-3` first; only update if the stop's coords are
   genuinely wrong, not just different from `homeBase`.

2. **"Mohegan" curly-serif confusion** — Jonathan flagged a screenshot
   where the Fraunces typeface rendered "Mohegan" ambiguously, reading
   like "Mohegen". Text is correct; typeface is the cause. If a font
   swap or kerning tweak in the Fraunces stack reads less ambiguously
   (e.g., switching that specific string to `f-mono` or a more upright
   serif), it's a low-effort fix. Only do this if a clean change reads
   better — don't add per-string font overrides as a pattern.

3. **Verify Worker `/places/nearby` is deployed** — Code reported it as
   deployed end-of-session, but worth confirming. Run:
   ```
   curl -i 'https://roadtrip-sync.jonathan-d-jackson.workers.dev/places/nearby?lat=41.4923&lng=-72.0934&type=restroom&radius=2000' \
     -H "Authorization: Bearer $VITE_FAMILY_TOKEN_JONATHAN"
   ```
   Expected shape: `{ results: [{ name, vicinity, distanceMeters,
   placeId, lat, lng, businessStatus, isOpen }] }`. If the endpoint
   404s or returns malformed JSON, the deploy hasn't happened yet.

4. **Lyman Allyn closed-day warning** — should clear automatically
   today (Sunday May 24) since the `closedDates` entry was specifically
   `2026-05-25`. Verify it cleared by opening Things to do → finding
   the Lyman Allyn card → confirming no orange "Closed today" pill.

### Category C — Parked items, ordered by ROI

If the family is at the tournament and no bugs are surfacing, the
next-most-valuable items are:

1. **Share-In v2** (~half-day) — per `SIDE_ACTIVITIES_BUILD.md` Section
   8, but the original spec's CloudKit assumptions are dead. Current
   architecture: D1 + R2, npm not pnpm, view-state routing not URLs,
   the existing roadtrip-sync Worker. The de-duplication layer shipped
   in Item 7 (`canonicalKey`, `findExisting`) is the foundation
   Share-In's confirmation card leans on — wire that path before
   building the share intent handler.

2. **Nightly Worker re-fetch for closure detection** — v3 spec from
   earlier sessions. Cron trigger on the existing Worker, daily ~3am
   ET. Re-fetch `businessStatus` + `regularOpeningHours` for activities
   in trips within the next 30 days. Diff against current values;
   surface deltas in a "needs review" queue in the activities view.
   The data shape lands in D1, no new R2 keys, no new Worker route —
   just the cron handler.

3. **Photo album cross-trip browsing** — current `PhotosView` is
   single-trip scoped. Helen may eventually want a "all our photos"
   surface that spans every trip. The data is already in
   `rt_memories_shared_v1`; the work is mostly UI (a top-level entry
   from the trip index that opens a cross-trip grouped view).

Anything else from the parked lists in prior carryovers is lower
priority than these three.

---

## 4. Error policy — still applies

The user-facing error policy from [`2026-05-24-photos-m3.md`](./2026-05-24-photos-m3.md)
is **permanent**, not session-specific. Repeated here in compressed
form for quick reference:

- **Bucket A — silent.** Network, worker 5xx, worker auth, storage
  quota, missing-file, decode/encode retry-1, video-encode-failed,
  webcodecs-unavailable, and the iOS-picker-unreachable codes (is-video,
  not-image, unsupported-image, too-large-input). User sees nothing
  except the sync pill incrementing.
- **Bucket C — three plain-language strings, verbatim:**
  1. `"This video is too long to share. Trim it in Photos first, then share the shorter version."` (video-too-long)
  2. `"This photo is too large. Try sharing a screenshot of it instead."` (photo-too-large)
  3. `"This photo can't be read right now. Try sharing it again, or share a different photo."` (photo-unreadable)
- **Banned vocabulary** (enforced by `containsBannedVocabulary` in
  `app/src/lib/dispatchErrors.js`): HEIC, EXIF, codec, queue,
  IndexedDB, MB, KB, bytes, compression, encoding, ffmpeg, WebCodecs,
  mp4-muxer, blob, R2, Worker, token, auth, sync, drain, retry-loop,
  attempts.
- **Backend traceability** preserved via `app/src/lib/uploadLog.js`
  (localStorage ring buffer, 200 entries) + dev panel in Settings.

**Any new error path introduced today must conform.** If a new failure
mode surfaces that doesn't fit the three Bucket C strings or any
Bucket A silent path, **stop and ask Jonathan** — do not invent a
fourth Bucket C message.

---

## 5. Constraints reaffirmed

These applied to every prior milestone and still apply:

- **Verify in DOM with screenshots, not in commit messages.** Every new
  surface gets a Playwright screenshot test (`app/tests/e2e/photos-screenshots-*.spec.js`
  is the pattern). The earlier session shipped a Leave-when button to
  a commit message but not to the DOM; that failure mode is the reason
  for the rule.
- **Helen and Aurelia are not the QA testers.** Every flow gets a
  Playwright or Vitest test that exercises the real DOM and real
  Canvas/WebCodecs APIs where possible. The iOS Safari subset is the
  documented gap — call it out, don't pretend headless covers it.
- **Worker deploys are user-gated.** Claude doesn't run `npx wrangler
  deploy`. When `worker/src/` changes, flag clearly in the report:
  "Worker deploy required: run `cd worker && npx wrangler deploy`
  before this lands in production."
- **Aurelia's morning state may be tender** if Saturday's loss is still
  landing. Tone of any Sunday plan edits stays factual. No editorializing,
  no "rebound / redemption / another chance" framing. The departure
  logistics stay held open as two options.
- **Push when shipping.** Per the user's memory, `git push origin main`
  is part of the deploy step for this repo — don't hand it back to the
  user after a verified commit.

---

## 6. Open questions for Jonathan

If anything surfaces during today's real-device use that this carryover
doesn't anticipate, **log it explicitly and ask** rather than papering
over. Specific things worth flagging if they come up:

1. **Helen's iPhone iOS version.** If the video picker doesn't appear,
   it means `typeof VideoEncoder !== 'function'` — confirm her iOS is
   ≥17.4. No "Update iOS" copy ever appears per §3; the picker just
   silently hides. If she expects a video picker and doesn't see one,
   the upload log (dev mode) will show a `webcodecs-unavailable`
   entry.
2. **Aurelia's iPhone iOS version.** Same as Helen.
3. **The 25 MB video size cap** — if a real iPhone video routinely
   exceeds the cap after encode, the Bucket C #1 string ("Trim it in
   Photos first…") is the right answer per the carryover. If Jonathan
   wants the cap raised, that's a one-line constant change in
   `app/src/components/AddDispatchModal.jsx` (`VIDEO_MAX_OUTPUT_BYTES`).
4. **Re-auth flow.** The §3 design says a token-rejected upload (a
   `worker-auth` code) queues silently and logs to dev panel. There's
   no re-auth UI today. If a token actually expires during the
   tournament and uploads silently stack up in the queue, Jonathan
   will need to flip dev mode on to see the situation. Worth building
   a real re-auth flow if this becomes a real problem, but not today.
5. **`forcePushSeed` for photos / activities** — out of scope unless
   asked. Current Settings panel covers it for trips only.

---

## 7. Pointers — files most likely to be edited next

| Path | Why |
| ---- | --- |
| `app/src/components/AddDispatchModal.jsx` | Any photo / video pipeline edit |
| `app/src/lib/dispatchErrors.js` | New error code? — add to ALL_CODES and bucket map, then update tests |
| `app/src/lib/uploadLog.js` | If logging shape needs richer context |
| `app/src/lib/videoPipeline.js` | Real-iPhone WebCodecs issues land here first |
| `app/src/workers/encodeVideo.worker.js` | Encode loop, bitrate, keyframe tweaks |
| `app/src/views/PhotosView.jsx` | Album surface — tile sort, lightbox, sync pill |
| `app/src/App.jsx` | Drain triggers (visibility, online, SW message, interval) |
| `app/public/sw.js` | SW sync handler; **bump CACHE_NAME on every UI change** |
| `app/docs/ios-compatibility.md` | Update Rafa's row to remove the "needs confirmation" flag |
| `app/scripts/__tests__/*.test.mjs` | Unit tests (Node-native, no framework) |
| `app/tests/e2e/*.spec.js` | Playwright e2e + screenshot capture |

Stop reading. Open Jonathan's bug report (or pick from §3 Category B/C
if none has landed yet) and start.
