# Carryover — Sunday 2026-05-24 → next Code window (Claude-in-App M1)

Read top-to-bottom. The two prior carryovers in this directory cover
narrower scopes (Photos M3, Sunday wrap); this one supersedes both
for the next session. The full Claude-in-App design spec is inlined
in §5 so you don't need to bounce between files.

---

## 1. Everything shipped today

Long session — closed PUNCHLIST_3 Items 0–7, all four Photos
milestones (M1–M4), the C0/C1 follow-on punchlist, three real-device
bug fixes Helen flagged Sunday morning, the album memory-group
separator, and PUNCHLIST_4. Commit links and what's live in the
deployed PWA:

| Work | Commit | What's live |
| ---- | ------ | ----------- |
| Items 0–3 — active-trip resolver, Leave-when wiring, Sunday plan rewrite, "playoff ma" truncation fix | [`6c72bf7`](https://github.com/jonathantheblip/roadtrip/commit/6c72bf7) | PWA opens on volleyball-2026 today; Leave-when on Activity cards + Stop detail; Day 3 = Court 3 Mohegan with departure logistics held open |
| Item 7 — activity de-duplication scaffolding | [`c7e14e9`](https://github.com/jonathantheblip/roadtrip/commit/c7e14e9) | `canonicalKey()` + `findExisting()` in `app/src/data/sideActivities/canonical.js`; observed `placeId`; `npm run check-duplicates` |
| Item 6 — queue → live nearby search | [`454dbad`](https://github.com/jonathantheblip/roadtrip/commit/454dbad) | Jonathan-view Queue (Bathroom / Fast food / Outside / Emergency) opens a distance-ranked bottom-sheet modal; Worker `/places/nearby` deployed |
| Item 4 (M1) — PhotosView shell + Playwright infra | [`81be6a1`](https://github.com/jonathantheblip/roadtrip/commit/81be6a1) | `view=photos` reachable from each themed view; lightbox with kbd nav |
| Item 5 (M2) — photo upload pipeline | [`210f88c`](https://github.com/jonathantheblip/roadtrip/commit/210f88c) | Canvas downscale 2048px JPEG q=0.85, EXIF read, IndexedDB queue, sync pill, lightbox touch swipe |
| Item 5 (M2 §3 redo) — error surface collapse | [`4bba041`](https://github.com/jonathantheblip/roadtrip/commit/4bba041) | Three Bucket C strings only; everything else queues silently; dev-mode upload log |
| Item 5 (M3) — video upload pipeline | [`510bd31`](https://github.com/jonathantheblip/roadtrip/commit/510bd31) | WebCodecs encode worker + mp4-muxer + progress UI |
| Item 5 (M4) — Background Sync drain | [`5fd3897`](https://github.com/jonathantheblip/roadtrip/commit/5fd3897) | SW `sync` event handler + Page Visibility fallback for iOS Safari |
| **C0** — memory-album capturedAt | [`0150e84`](https://github.com/jonathantheblip/roadtrip/commit/0150e84) + [`006c6d6`](https://github.com/jonathantheblip/roadtrip/commit/006c6d6) | `memory.capturedAt` is the album's source-of-truth date; EXIF for photos, MP4 mvhd / Apple Keys for videos; `· uploaded` label fallback; dev-mode lightbox "Edit date" affordance |
| **C1** — Share-In v2 (paste interstitial + Web Share Target + Apple Shortcut docs) | [`964c313`](https://github.com/jonathantheblip/roadtrip/commit/964c313) + [`e810dec`](https://github.com/jonathantheblip/roadtrip/commit/e810dec) + [`df57c1a`](https://github.com/jonathantheblip/roadtrip/commit/df57c1a) | "Add from link" in Things to do; manifest `share_target` (Android); `app/docs/share-in-shortcut.md` distribution doc (iPhone); Worker `/resolve` (short-link follower, host-allowlisted) + `/draft` (Claude Haiku 4.5 default tags + per-traveler descriptions) |
| Sunday triage — black tiles / caption dup / buried entry | [`9912316`](https://github.com/jonathantheblip/roadtrip/commit/9912316) | Photos entry promoted above-the-fold on every themed view; caption renders once per memory with "N/M" badges on siblings; `<img onError>` fallback to ImageIcon |
| Album memory-group separator + burst diagnosis | [`c354051`](https://github.com/jonathantheblip/roadtrip/commit/c354051) | Within a stop, contiguous runs by `memoryId` render as separate grids with a hairline between runs — tile 5's `1/4` badge after the boundary now reads unambiguously |
| **PUNCHLIST_4** — cross-trip All Photos | [`0781a64`](https://github.com/jonathantheblip/roadtrip/commit/0781a64) | New `AllPhotosView`, second entry point on every themed view; lightbox renders TRIP NAME above the caption; swipe crosses memory → stop → trip boundaries in one swipe; read-only |

Worker deploys done by Jonathan today: `/leave-when`, `/places/nearby`,
`/resolve`, `/draft`. `ANTHROPIC_API_KEY` set as a Worker secret.
Worker URL is `roadtrip-sync.jonathan-d-jackson.workers.dev`.

**Test counts at handoff:** 100 Node + 49 Playwright, all green at
[`0781a64`](https://github.com/jonathantheblip/roadtrip/commit/0781a64).
**Cache name:** `jackson-trip-react-v42` — bump on every UI-affecting
change. **Live PWA:** `https://jonathantheblip.github.io/roadtrip/`.

---

## 2. What's next — Claude in the App

The next feature is **Claude-in-App**: a conversational interface
inside the PWA that lets Helen (and Jonathan) plan and modify trips
by talking to Claude, sharing screenshots, and reviewing drafts
before they become real. Helen's exact request: "I want to do what
you do, from the app."

This is a 3–4 week build across 6 milestones. The new Code window
reads both the design spec (inlined in §5 below) and the Design v2
visual spec rendered in JSX:

- `app/docs/CLAUDE_IN_APP_DESIGN_SPEC.md` — product spec (inlined §5)
- `app/docs/design/claude-in-app/system.jsx` — design system tokens, palette, type
- `app/docs/design/claude-in-app/claude-chat.jsx` — chat surface
- `app/docs/design/claude-in-app/claude-cards.jsx` — confirmation card system
- `app/docs/design/claude-in-app/claude-hide.jsx` — hide/reveal indicators + Reveals page
- `app/docs/design/claude-in-app/claude-rest.jsx` — audit pill, settings, error states

**Start with M1.** The design spec lists the 10 surfaces Design
covered; M1 should be the chat surface + a basic `/claude/chat`
Worker proxy that round-trips text. Subsequent milestones layer in
images, confirmation cards, audit, hide/reveal, and the budget cap.

---

## 3. Critical context the new window needs

**User-facing error policy is permanent.** Three plain-language
strings only (the photo dispatch policy from `app/src/lib/dispatchErrors.js`):
`"This video is too long to share. Trim it in Photos first, then
share the shorter version."`, `"This photo is too large. Try sharing
a screenshot of it instead."`, `"This photo can't be read right now.
Try sharing it again, or share a different photo."` — everything
else queues silently and surfaces through the dev-mode upload log
in Settings. Don't invent new Bucket C messages.

The **same posture applies to Claude-in-App chat failures.** The
spec spells out the four error strings (§5 ⇒ Error handling
section); they are the entire user-visible failure surface for
chat. Backend traceability per the existing pattern — extend
`app/src/lib/uploadLog.js` or add a `claudeLog.js` sibling.

**Confirmation card pattern is non-negotiable.** Every
Claude-proposed change is a draft Helen approves. **No silent writes
ever.** Same shape as the existing Share-In confirmation card from
C1 (`app/src/views/ImportView.jsx`), generalized. The current
ImportView is the reference implementation — read it first before
writing the generalized version.

**The visibility model (Claude-in-App M4) touches every read path.**
Every render asks "what does this user see?" before answering "what
does this look like?" Plan accordingly when modifying existing
trip-detail views. The model extends every existing record type
(Trip / Day / Stop / Activity, plus a new Detail granularity) with
`visibility: shared | hidden_from:[...] | surprise:{trigger}` and
decoy semantics. Audit existing renders before touching them — most
read paths are in `app/src/views/*.jsx` and assume universally
visible data.

**The Worker is `roadtrip-sync.jonathan-d-jackson.workers.dev`.**
Extend it; never deploy a second. New endpoints for Claude-in-App
per the spec:

- `POST /claude/chat` — streaming chat proxy. System prompt loads
  family context (trip, family profiles, memory album metadata,
  reader identity). Conversation state per (user, trip) tuple in D1.
- `POST /enrich-activity` — runs the existing
  fetchHeroImages/Places/Routes/hours chain on a single activity
  proposed by Claude. Returns the enriched record. Called when
  Claude drafts an activity that needs metadata.
- Plus extensions for budget tracking, conversation persistence,
  contingency triggers (weather check on date+location).

**Worker deploys are user-gated.** Same pattern as Share-In:
implement, commit, stop at the deploy point, give Jonathan
step-by-step instructions in chat, wait for "deployed" before
continuing. See [`964c313`](https://github.com/jonathantheblip/roadtrip/commit/964c313)
deploy steps for the exact template (`wrangler secret put` + `wrangler deploy`).

**Architecture conventions established in prior sessions:**

- Storage: D1 (binding `DB`) + R2 (binding `ASSETS`), not CloudKit
- Routing: view-state machine in `App.jsx`, not URL paths
- Package manager: npm, not pnpm
- Tests: `npm test` (Node-native, no framework, under
  `app/scripts/__tests__/*.test.mjs`) and `npm run test:e2e`
  (Playwright in headless Chromium)
- Verify in DOM with screenshots every milestone — the rule that
  caught a phantom Leave-when button still applies
- Build: `npm run build` writes to `../docs/` for GitHub Pages
- `.env` must be present at the repo root for builds to bake in
  `VITE_WORKER_URL` + family tokens. Check after build:
  `grep -c roadtrip-sync.jonathan-d-jackson.workers.dev docs/assets/index-*.js` must be ≥ 1.
- After any verified commit on this repo, `git push origin main`
  yourself — per the user's standing memory, don't hand the deploy
  step back

---

## 4. Open items, low priority

- Real-device smoke tests on Helen's photo upload from her camera
  roll (tournament-day use). The pipeline is good in headless; only
  iOS Safari quirks would surface. If a black-tile or HEIC-decode
  report comes in, prioritize over Claude-in-App work for that turn.
- Nightly Worker re-fetch for closure detection (parked indefinitely
  per prior carryover).
- Any post-tournament bug reports from the family — Helen, Jonathan,
  Aurelia, Rafa each opened the app live this weekend.
- Burst-collapse UI for multi-photo memories (PhotosView).
  Diagnosed in `c354051` as the next natural step if Helen finds the
  multi-photo memories noisy in larger albums. Compress to one
  representative tile + "+N more" chip. Not building until asked.

**Priority order if any of these surfaces during Claude-in-App
work:** (1) family-facing bug reports, (2) current Claude-in-App
milestone, (3) low-priority parked items.

---

## 5. Inlined: `CLAUDE_IN_APP_DESIGN_SPEC.md` (full spec)

> Copied from `app/docs/CLAUDE_IN_APP_DESIGN_SPEC.md` verbatim so
> the new window has the spec in one read. The canonical file in
> the repo stays the source of truth; sync any edits to both.

### What this is

A conversational interface inside the roadtrip PWA that lets Helen
(and Jonathan) plan and modify trips by talking to Claude, sharing
screenshots, and reviewing drafts before they become real. The
product Helen asked for: "I want to do what you do, from the app."

This is not a v1. There is no v2. Whatever ships in this build is
what Helen lives with.

### What ships

A persistent chat surface available from two entry points: a global
FAB on the Trips index ("Plan a trip with Claude") and a chat icon
within any trip detail view ("Modify this trip with Claude"). Both
open the same conversation panel; in-trip mode pre-loads the trip
context into Claude's working memory.

Helen can:
- Type, dictate (mic everywhere), or paste/upload images and
  screenshots
- Issue commands ("add Sift Bake Shop to Sunday morning") or ask
  for help ("I don't know what to do Saturday morning")
- Review every Claude-proposed change as a draft confirmation card
  before it touches data
- Hide specific trips, days, stops, or details from other family
  members — and set time-based or location-based reveal triggers
  for surprises
- Trigger a trip audit on demand or watch passive flags surface

Jonathan gets the same surface. Same hide/reveal capability.

### Three modes Claude operates in

Claude detects mode from Helen's language, with explicit overrides
available:

**Execute mode** — direct, do-the-thing. "Add Sift Bake Shop to
Sunday morning." "Move the Mystic Aquarium stop to 11am." "Cancel
Saturday dinner." Claude drafts the change as a confirmation card
with a single "Save" tap. No clarifying questions unless something's
structurally impossible (e.g., she asked to add a stop to a day
that doesn't exist in the trip).

**Guidance mode** — exploratory, think-with-me. "I don't know what
to do Saturday morning." "What would be fun for the kids on a rainy
day in Asheville?" Claude responds in conversation, surfaces 2-3
specific options with reasoning grounded in family profiles (Helen's
restrictions, Aurelia's interests, Rafa's tolerances), and waits
for Helen to pick or steer. Confirmation cards only fire when Helen
indicates she wants to commit.

**Override phrases** — "just do it" or "stop asking" forces execute
mode for the current request. "Help me think" or "what do you
suggest" forces guidance mode.

The transition between modes is fluid within a single conversation.
Helen can plan loosely for ten minutes, then say "okay let's lock
it in" and shift to execute.

### Confirmation card pattern

Every Claude-proposed change to trip data renders as a draft
confirmation card before saving. Same shape as the Share-In
confirmation card that already exists in the codebase, generalized:

- Hero (if applicable): image, map preview, or icon
- Editable fields: every field Helen can adjust before saving
- "Save" / "Discard" / "Edit more" actions
- Optional "ask Claude something" inline — Helen can question the
  draft without dismissing it ("why did you pick 9am?")

No silent saves. Ever. The system never writes data Helen didn't
approve.

### Context awareness

Claude in the app sees what Helen sees plus a layer below it:

- Active trip (if any): name, dates, all days, stops, activities,
  photos
- All trips Helen owns or co-owns
- Family profiles: dietary restrictions, interests, ages, tolerances
- Memory album: photos and videos from past trips, sortable by date
  and stop
- The reader's identity: Helen sees Helen's view; Jonathan sees
  Jonathan's

Claude does NOT see anything outside this app — no email, no
calendar, no external accounts.

### Image and voice input

**Voice (Whisper API, already in the project):** tap mic in any
text input, transcribe in place. Works in chat, in field edits, in
caption boxes — anywhere Helen would otherwise type.

**Image input in chat:** Helen can paste, drop, or pick an image.
Claude reads it and replies in chat conversationally — "I see a
menu from Pasta & Co. Want me to add it as a dinner stop somewhere
this trip?" Helen then directs the action. Claude does not silently
draft data from an image; the human stays in control of what
becomes structured.

Acceptable image inputs include: restaurant menus, Instagram
screenshots, hotel confirmations, Google Maps screenshots,
handwritten notes, business cards, signs.

### Audit and contingency

Two surfaces, both Helen-facing, both designed not to nag:

**Passive audit** — small "X things to review" pill in the trip
header, only when X > 0. Items it surfaces:

- Driving times that exceed family patterns (>2.5 hours flagged
  for Jonathan's call, per the existing rule)
- Stops at closed or seasonally-closed venues (uses the existing
  Places businessStatus + regularOpeningHours data)
- Stops at venues that have closed permanently since the trip was
  created (uses the nightly Worker re-fetch when it ships; for now,
  on-trip-load re-fetch)
- Pacing flags: more than 4 active stops in one day, or activities
  scheduled past 9pm with Rafa present
- Weather mismatches: outdoor anchor activity scheduled on a day
  with rain forecast

Pill tap opens a list of flagged items. Each flag has a one-tap
"ask Claude to fix this" affordance that opens a conversation with
the flag pre-loaded.

**Active audit button** — "Stress-test this trip" in trip settings.
Same checks as passive, run on demand, returns a full report
including items that aren't flagged passively (lodging dates not
contiguous, missing return travel, etc.). Helen can tap any item
to discuss with Claude.

**Contingency planning** — Claude proactively raises contingencies
only when conditions warrant. Specifically: when the trip's weather
forecast (Open-Meteo or similar, fetched per trip date+location)
suggests >40% rain probability on a day with an outdoor anchor
activity, Claude raises it in conversation: "There's a real chance
of rain Saturday in Asheville. Your anchor that day is Linville
Falls — want me to draft an indoor alternative we can swap to if
needed?"

Contingencies are NEVER pre-emptively drafted as confirmation
cards. They're conversation prompts only. Helen decides whether to
plan them.

**What is not flagged** unless Helen asks:
- Budgeting / cost
- Parenting choices (the family rule about not surfacing
  Rafa-specific risks unless Jonathan asks extends to Claude in
  the app)
- Optimization in general — Claude doesn't suggest "more efficient"
  plans unless asked

### Hide and reveal

Every level of the trip hierarchy supports a `visibility` field:

- Trip
- Day
- Stop
- Activity
- Detail (sub-stop element: time, description, address, etc.)

Visibility states per level:

- `shared` (default) — everyone with access to the trip sees it
- `hidden_from:[<user_id>...]` — explicit users can't see this
  layer or its children
- `surprise:{trigger}` — hidden until a trigger fires

Triggers are:

- `time:<ISO datetime>` — visible to specified users starting at
  that time
- `location:{lat, lng, radius_m, user_id}` — visible to the
  specified user when their device enters the geofence (uses
  existing geolocation permission)
- `manual` — Helen taps "share now" to reveal

Helen sees hide/reveal indicators throughout her view. A small lock
icon on a hidden stop or activity, with a hover/long-press detail
explaining "hidden from Jonathan until Saturday 8am."

UX for hiding: contextual menu on any item ("…" → Visibility →
Hide from Jonathan / Hide until [time] / Hide until I arrive at
[location]). The menu is the same Helen sees on all items; hiding
is just one option.

UX for reveal: a "Reveals" page in trip settings shows everything
scheduled to reveal, with timestamps and triggers. Helen can edit,
cancel, or trigger manually from there.

### How Claude handles asymmetric information

When Jonathan asks Claude something about a trip where Helen has
hidden information, Claude:

- **Hedges and points to the app:** "According to your trip plans,
  Sunday's drive is about 4 hours." (true to Jonathan's view,
  silent about the hidden Asheville detour)
- **Doesn't lie:** if Jonathan asks "is there anything I should
  know about Sunday," Claude says "I'd ask Helen — she's been
  working on parts of this trip."
- **Doesn't volunteer asymmetric existence:** Claude never says
  "Helen has hidden information from you." Existence of hidden
  content is itself part of the surprise. Claude's response when
  asked about hidden content is the same response it would give if
  there were nothing hidden — point to what's visible, suggest
  checking with Helen.

The principle: Claude's response to either of you is fully
consistent with what you can see in your view of the app, with
appropriate hedging when something might be incomplete. No active
false statements.

### Misleading vs. hidden

Hidden information is absent from a user's view. Misleading
information is present but wrong on purpose. Both are supported.

A stop or activity can be marked `decoy: true` with a `real_value`
field. The decoy renders to specified users; the real value renders
to Helen (and other authors). Claude knows about both and treats
them according to the asymmetry rules above — answering from the
reader's view, hedging when the reader asks specifically about
something where the real and decoy diverge.

When the surprise trigger fires, the decoy is replaced by the real
value in the affected users' views, with a small one-time
animation: "Helen updated this stop."

### Concurrent editing

Last-write-wins via the existing sync path. Plus a small indicator:
"Helen edited this stop 2 minutes ago." If both users edit the
same field within the same sync window, the later write silently
overrides. If this becomes a real problem, the next build adds
operational-transform merge.

### Budget cap

Anthropic API usage tracked per family. Two thresholds:

- **75% of monthly cap** — notification to Jonathan only. Helen
  sees nothing.
- **100% of monthly cap** — hard cutoff for Claude calls. Helen
  sees: "I'm out of budget for the month. Send Jonathan a message
  and he can raise the limit." Single tap to text Jonathan.

Cap value, threshold percentages, and notification routing are all
in Settings, gated to Jonathan only (Helen doesn't see this section
in her settings).

### Settings additions

New section: "Claude in the app." Gated visibility — some settings
only for Jonathan.

Helen sees:
- Voice input on/off
- Image upload on/off (default on)
- "Help me think" verbosity (concise / standard / detailed)
- Default for new items: hidden or shared (default: shared)

Jonathan sees (in addition to Helen's):
- Monthly budget cap ($)
- Soft threshold % (default 75)
- Hard threshold % (default 100)
- Notification phone number for cap warnings
- Anthropic API key (display only, configured via Worker secret)

### Error handling

User-facing error policy from the existing carryover applies.
Claude failures are silent and queued where possible:

- Network drop mid-conversation → message stays in input, retry on
  reconnect, no error
- Anthropic API timeout → "Claude's taking a moment. Try again?"
  with retry button
- Anthropic API error (non-timeout) → "Something went wrong on my
  end. Try again or rephrase?"
- Budget hit → the dedicated cap message

No technical error codes, no raw error.toString(), no stack traces
in user-facing copy.

Backend traceability per the existing pattern: every Claude call
logs to `app/src/lib/uploadLog.js` extended (or a new `claudeLog.js`)
with full request/response/error for dev-mode review.

### Out of scope for this build

- Retroactive trip building (filling in past trips from memory) —
  deferred per Jonathan's call
- Cross-trip Claude reasoning ("plan a trip similar to our
  Asheville trip last year") — deferred until past-trip data is
  structured
- Email / calendar integration — never in scope; Claude in the app
  only sees what's in the app
- Multi-modal output: Claude responds in text + confirmation cards.
  No image generation, no embedded charts.
- Claude scheduling things on its own without Helen's approval —
  every action requires confirmation

### Architecture notes for Code

These belong in the build prompt, not the Design spec, but listed
here so Design knows what's downstream:

- New Worker endpoint: `POST /claude/chat` — proxies Anthropic API
  with the family context loaded into system prompt. Streams
  responses. Maintains conversation state per (user, trip) tuple
  in D1.
- New Worker endpoint: `POST /enrich-activity` — runs the existing
  Places + Routes + hours + hero photo chain on a single activity
  proposed by Claude. Returns the enriched record. Called when
  Claude drafts an activity that needs metadata.
- New CloudKit/D1 record types: `Conversation`,
  `ConversationMessage`, `Draft` (proposed but unsaved changes).
- Visibility model extends every existing record type: `Trip`,
  `Day`, `Stop`, `Activity`, plus a new `Detail` granularity.
- Decoy model: every trip-data record gains optional `decoy` and
  `real_value` fields, plus a `visibility_for_user` resolver
  function that returns the user-appropriate view.
- Anthropic API budget tracking: per-call cost estimation, monthly
  aggregation in D1, threshold checks before each call.

### What Design covered (visual + interaction spec)

A complete visual and interaction spec covering:

1. **Chat surface** — global FAB placement, in-trip entry,
   full-screen vs. bottom-sheet vs. side-panel decision,
   conversation rendering (text bubbles, image attachments, voice
   transcription UX, streaming response feel)
2. **Confirmation card system** — the generalized pattern for any
   Claude-proposed change. Helen will see this dozens of times in
   a planning session; it has to be fast and trustworthy.
3. **Hide/reveal indicators** — lock icons, "hidden until" badges,
   reveal animation, the "Reveals" settings page
4. **Audit pill + report** — passive pill design, report page
   layout, "ask Claude to fix this" handoff
5. **Settings layout** — Helen's view vs. Jonathan's gated additions
6. **Mode transitions** — visual difference (if any) between
   execute and guidance mode responses
7. **Voice mic UX** — recording state, transcription preview,
   edit-before-send
8. **Image preview in chat** — how attached images render, how
   Claude's read of the image gets surfaced
9. **Empty states** — first conversation in a new trip, no audits
   to surface, no reveals scheduled
10. **Error states** — the three user-facing error messages, queue
    indicator, retry affordance

Helen's aesthetic from PhotosView (linen surface, Fraunces headline,
italic subtitle, photo-forward warmth) should extend here.
Jonathan's view inherits but can carry his existing dark-editorial
typography. Aurelia and Rafa don't get this feature in v1 — they're
not asking for it and the audit/contingency logic doesn't fit their
use cases.

### Constraints

- Helen is not a v1 type. Ship sanded. Every rough edge that
  surfaces in design review gets addressed before code touches it.
- False or stale information is the failure mode that frustrates
  her. Design must make confirmation cards feel trustworthy and
  the audit surface feel accurate.
- Helen experiences guidance-mode more often than Jonathan does.
  The conversation rendering should not feel sterile or
  transactional during guidance — it should feel like talking to
  someone who's thinking with her.
- The asymmetric-information feature is genuinely novel. Design
  should treat it as a first-class capability, not a hidden
  checkbox. Helen surprising the family is a use case to celebrate
  visually.
- Concurrent editing indicators ("Helen edited this 2 minutes ago")
  should feel collaborative, not alarming.

---

## 6. Pointers — files the new window will edit first

| Path | Why |
| ---- | --- |
| `app/docs/CLAUDE_IN_APP_DESIGN_SPEC.md` | Canonical spec — sync any inline edit back |
| `app/docs/design/claude-in-app/*.jsx` | Design v2 — read every file before writing M1 |
| `app/src/App.jsx` | Add new view-state `'claude-chat'`; global FAB lives outside the per-trip view structure |
| `app/src/views/ImportView.jsx` | Reference implementation for the confirmation card pattern — generalize this, don't reinvent |
| `app/src/lib/workerSync.js` | `workerFetch()` is the call shape for /claude/chat |
| `app/src/lib/uploadLog.js` | Pattern to extend (or sibling new `claudeLog.js`) for chat traceability |
| `worker/src/index.js` | Add `/claude/chat` + `/enrich-activity` endpoints; budget tracking secrets |
| `app/public/sw.js` | Bump `CACHE_NAME` every UI-affecting change |
| `app/public/manifest.json` | Already has `share_target` from C1 — no change for M1 |
| `app/scripts/__tests__/*.test.mjs` | Node-native unit tests live here |
| `app/tests/e2e/*.spec.js` | Playwright e2e + screenshot capture |

Stop reading. Read the design spec inline above, then open the
five JSX files under `app/docs/design/claude-in-app/`, then start
M1 with the chat surface + a basic `/claude/chat` Worker proxy that
round-trips text. The deploy gate stops you before the Worker
push — give Jonathan the wrangler step-by-step at that point.
