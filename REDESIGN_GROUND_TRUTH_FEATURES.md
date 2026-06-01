# REDESIGN GROUND TRUTH — FEATURES / ARCHITECTURE (B of 2)

> Read-only recon for the redesign. Current-state model of what the app **does** and how it is **wired**. No app code was changed; this artifact is the only commit.
> **Recon HEAD:** `fef2959` · branch `main` · local == origin/main · tracked tree clean.
> Every load-bearing fact is anchored to `file:line`. Findings are tagged **[COMPLETE]** (structurally closed), **[HALF-BOLTED]** (real but unfinished/unwired), **[ABSENT]** (specced-only or greenfield) so increment boundaries are drawable.

---

## 0. FOUNDATIONAL ARCHITECTURE (read this first — it reframes the brief)

The brief hypothesizes CloudKit zones. **CloudKit is fully retired.** The stack is:

- **Client:** React/Vite PWA in `app/` — one App shell (`app/src/App.jsx`, 837 lines), four themed view components, a shared component/lib library. Persists locally to **localStorage** (`lib/memoryStore.js`) + **IndexedDB** (assets), and **syncs** to the worker (`lib/workerSync.js`).
- **Server:** a single **Cloudflare Worker** (`worker/src/index.js`, 1973 lines) over **D1 (SQLite)** + **R2** (asset bytes).
- **Auth:** per-traveler **bearer tokens** (`FAMILY_TOKEN_<NAME>`), `TRAVELERS = ['jonathan','helen','aurelia','rafa']` (`worker/src/index.js:33,150`). The presented token *is* the identity/principal.

Anchors that kill the CloudKit hypothesis: `worker/schema.sql:1-3` ("Single canonical store for memories + trips, **replacing CloudKit**. D1 (SQLite)"), `worker/src/index.js:1` ("Replaces CloudKit"), `lib/workerSync.js:1-2` ("Replaces the CloudKit sync that lived here before"). All 14 CloudKit/iCloud mentions are legacy comments, one `appleId` string, or a pasted **iCloud Shared Album URL** field (`views/TripEditor.jsx:314` — a link, not people/photo data).

**Data shapes:**
- `memories` table = **columns** (id, trip_id, stop_id, **author_traveler**, **visibility**, kind, text/caption/transcript, audio/photo R2 keys, created/updated/deleted_at) — `worker/schema.sql:5-32`.
- `trips` table = thin columns + **`data_json` blob** holding the whole trip object — `worker/schema.sql:34-44`. Trip *structure* lives in the blob, queryable only by load+parse, not by SQL.
- `conversations` / `conversation_messages` / `family_profiles` (chat persistence + Claude's seed context) — `worker/migrations/006_claude_conversations.sql`.

---

## EXECUTIVE SUMMARY (one screen)

| Phase | Verdict |
|---|---|
| **1 · Visibility** | **ONE mechanism, not N.** A single first-class `memories.visibility` column (`'shared'｜'private'`) scoped to `author_traveler`, enforced server-side in SQL and mirrored client-side. **2 of the brief's 4 cases ARE this mechanism** (Aurelia's private journal; Jonathan-hiding) — but it's **binary + author-scoped** (private = hidden from *everyone but the author*; no per-recipient/"from-Helen-specifically" targeting). **Helen's M4 hide/reveal/decoy + geofence/time = ABSENT** (specced, explicitly deferred). **Claude's "hedge about hidden content" = ABSENT** (the chat never sees memories at all). Redesign can **unify on the existing field**; targeting, triggers, and Claude-awareness are greenfield. |
| **2 · Person-grouping ("show me, me")** | **No recognizer of any kind exists.** Apple people-albums: not read (no PWA path). Claude-as-recognizer: not built (no vision pass anywhere; archive has **no per-person labeled corpus**). Standalone face-grouping: absent. The only "person" signals are `author_traveler` (who *uploaded*), a manual compose-time `tagged[]`, and manual stop-level `persons/who/for` curation. The cross-trip read seam (**AllPhotosView**) groups by **trip→stop→date**, with **no person axis**. Fallback chain is **entirely to-build**; the divergent per-kid targets (Aurelia stills→share-out, Rafa video) don't exist yet. |
| **3 · Resurfacing / replay** | **ABSENT.** No on-this-day / last-trip / unprompted surfacing / slideshow. All-Photos is **pure storage**. BUT the **structure data a replay needs is PRESENT and rich**: day-sequence, stop-order, per-stop time/location/lat-lng, `who[]`-present, and memories joinable by `stop_id`. The engine is greenfield; the substrate is ready. |
| **4 · Planning: talk vs act** | **The chat ACTS on trip *structure* (complete) but every real-world *quantity* is talk-only (the jank).** `/claude/chat` has **zero tools**; it emits a text **`card`** the client applies → create_trip / add / move / cancel / multi / trip-settings, all wired. But **drive time** (real compute lives at `/leave-when` → Google Routes), **places** (`/places/nearby`, `/resolve` → Google Places), and **calendar** (`lib/icsExport`) are **separate UI endpoints the chat cannot call** — so in-chat the model *estimates* drive-vs-fly and is told *never to invent venues*. Gap = the chat has no tool-use; the compute already exists. No persisted "hold/leave-this-open" object. |
| **5 · Share-out / composition** | **Both under-built.** Share-**out** = `navigator.share` of **text only** (a stop's name+pitch) — not a photo/memory. Share-**in** (Web Share Target + Shortcut + paste → ImportView) is the mature, first-class direction. **Composition** = single-memory **PostcardComposer** (one postcard) + single hero-**image** selection; **no surface composes a trip's memories into an artifact.** Pipeline is ingest-biased. |
| **6 · Spine vs four rooms** | **One trip-data spine, four role-shaped lenses — already.** Shared state + shared data + `data-theme`-per-traveler + `switch(traveler)` rendering 4 views with the **same props**. Duplication is at the **view-composition / theme-token** layer, not the data layer. Redesign is **build-the-absent-verbs-on-the-spine**, not a re-architecture. |

**Net:** the **data spine, the visibility ACL, and card-driven trip editing are complete and sound.** The redesign's headline features — person recognizer, resurfacing, share-out, memory composition, tool-backed chat, M4 hidden-content — are **clean greenfield increments on an existing spine**, not refactors of it. The one true *refactor* candidate is collapsing the thick per-view composition duplication.

---

## PHASE 1 — VISIBILITY MODEL

### The one mechanism
- **Field:** `memories.visibility TEXT NOT NULL -- 'shared' | 'private'`, paired with `author_traveler` (`worker/schema.sql:9-10`), indexed `(author_traveler, visibility)` (`:32`).
- **Server enforcement (the ACL):** `getMemories()` — `worker/src/index.js:193-198`:
  ```sql
  SELECT * FROM memories
  WHERE updated_at > ?
    AND (visibility = 'shared' OR author_traveler = ?)   -- ? = bearer-token traveler
  ```
  A `private` memory is returned **only to its author**. This is **app-side ACL in SQL keyed to the authenticated traveler** — there is no zone scoping (no CloudKit). `postMemory` defaults `visibility || 'shared'` and stamps `authorTraveler || traveler` (`:292-293`).
- **Client mirror (same model):** `lib/memoryStore.js` — `SHARED_KEY` (one shared bucket) + `PRIVATE_KEY(traveler) = rt_memories_private_<traveler>_v1` (per-author private bucket); reads return "all shared + that traveler's own private" (`:6-8, :39, :75-85`). Sync reconciles the two zones (`:237-279`).

**Property of the model:** binary, **author-scoped**. "Private" = hidden from *everyone except the author*. There is **no per-recipient ACL** — you cannot hide from Helen specifically while showing Aurelia.

### The brief's four cases mapped
1. **Aurelia's private journal** — **[COMPLETE]**, *is* this mechanism. Her postcards are `private` memories in her bucket (`lib/memoryStore.js:344` "Try every traveler's private bucket — **Aurelia's postcards live here**"). Not a separate zone or implementation.
2. **Jonathan hiding from Helen** — **[COMPLETE] as binary**, but the *"from Helen"* framing is not a feature. It's the same `private` flag → hidden from all non-authors. Targeted/directional hiding does **not** exist.
3. **Helen's hide/reveal/decoy + geofence + time triggers (M4)** — **[ABSENT]**. No `decoy`/`geofence`/`revealAt`/`hideUntil` columns or code anywhere in `app/src` or `worker/src`. Confirmed **specced and deferred**: `CARRYOVER_HELEN_SURFACE.md:83` "M4 hide/reveal/decoy — deferred" (and `:41` lists it in the unbuilt wishlist).
4. **Claude's asymmetric chat (hedges about hidden content without lying)** — **[ABSENT]**. The chat's context (`buildClaudeSystemPrompt`, `worker/src/index.js:1488-1775`) is **family profiles + reader identity + open-trip structure** (or cross-trip summaries). It **never loads memory bodies or the visibility field** — only a per-trip memory *count* in summaries (`:1861`). There is no hedging instruction and nothing to hedge about. Not bolted, not built.

### Asset-layer caveat (matters for the redesign)
`GET /assets/:key` **bypasses bearer auth** (`worker/src/index.js:47-70`) so `<img>/<audio>` render on receiver devices. R2 keys are opaque randoms under `<traveler>/<memoryId>/<kind>-<rand>`. So a *private* memory's **bytes are capability-protected (unguessable URL), not ACL'd** — privacy is enforced only at the **listing** layer (`GET /memories`). A leaked/forwarded asset URL is reachable by anyone.

### Verdict
**Visibility is a first-class property of records via ONE mechanism (binary, author-scoped), enforced app-side, implemented twice (D1 + localStorage mirror).** It is *not* N bolted features. The redesign should **unify on this field** and treat (a) per-recipient targeting, (b) M4 reveal/decoy/geofence/time triggers, (c) Claude visibility-awareness, and (d) asset-layer ACL as **additive greenfield** on top of it.

---

## PHASE 2 — PERSON-GROUPING SEAM ("show me, me")

**Contract the redesign needs:** trip → media grouped by *person depicted*. **Nothing in the codebase delivers this today.**

### Recognizer paths (all to-build)
- **Apple people-albums** — **[ABSENT]**. No code reads iCloud Photos people-grouping; there is no PWA API for it. The only iCloud surface is a **pasted Shared Album URL** (`views/TripEditor.jsx:314`, `views/Settings.jsx:387`) — a link to an album, carrying no people metadata. *Posture: treat PWA→Apple people-data as unavailable barring a native Shortcut bridge; not attempted in-repo.*
- **Claude-as-recognizer (vision over the R2/D1 archive)** — **[ABSENT but feasible]**. No vision pass exists; the worker's only Anthropic calls are **text** (`/claude/chat` and `/draft`, no image content blocks — confirmed zero `tool_use`/image-block handling, `worker/src/index.js:1253-1341`). **Archive shape:** photo memories = `memories` rows (`kind='photo'`) with R2 keys `<traveler>/<memoryId>/<kind>-<rand>`, metadata `trip_id / stop_id / author_traveler / caption / capturedAt / GPS-derived stop`. **No per-person labeled reference corpus exists** (no face crops, no identity index). *Archive object count lives in production D1/R2 and is **not assertable from the repo** — test posture, do not assert a number.* Building this = stand up a labeled corpus (multi-angle photos per family member) + wire Anthropic image blocks; the worker already proxies Anthropic, so the seam is short.
- **Standalone face-grouping (off-the-shelf)** — **[ABSENT]**. No face lib, no embedding/cluster-by-face step. (The `cluster` code is **GPS deviation clustering** in photo backfill — `components/PhotoBackfillTriage.jsx`, `lib/photoMatch.js` — *not* faces.)

### What "person" signal *does* exist (none is who-is-in-the-photo by recognition)
- `author_traveler` = who **uploaded** the memory (not who's depicted).
- **PostcardComposer** `tagged[]` = a **manual, compose-time** who-is-in-it tag, defaulting to the stop's `for` list ∪ author (`components/PostcardComposer.jsx:39,52-60`). Optional, human-entered.
- Stop-level `persons` / `who` / `for` arrays = **manual curation** in trip data (`utils/filterStops.js:5`, stop seeds).

### Photo attachment is spatiotemporal, not identity
`lib/photoMatch.js` matches a photo to a day/stop by **EXIF `capturedAt` (time) + optional GPS via haversine** (`:1-37`), emitting deviation clusters for off-route GPS. Identity never enters.

### Seam consumer (exists, wrong axis)
**AllPhotosView** (`views/AllPhotosView.jsx`) is the cross-trip read: `listAllLocalMemories(traveler)` → group **trip → stop → memory → date**, newest trip first, read-only (`:7-37, :24-52`). The consumer is built; it has **no person grouping axis**.

### Fallback chain + targets
**Apple people-albums** (likely impossible in pure PWA) → **Claude vision over R2 archive** (feasible; needs labeled corpus + image-block wiring) → **standalone face-grouping lib** (cheapest off-shelf per-person filter). **Each delivers per-person filtering; none is present.** The **divergent per-kid targets** — Aurelia best-light stills (→ share-out) vs Rafa video-forward — are a **requirement on the grouped surface**, independent of which recognizer fires; **neither the recognizer nor the targets exist.** (Video *ingest* exists — `workers/encodeVideo.worker.js`, `lib/videoPipeline.js` — but no person/replay layer consumes it specially.)

**Verdict:** **[ABSENT]** seam with a **[HALF-BOLTED]** consumer (cross-trip reader present, person dimension missing). This is the make-or-break increment; recommend prototyping the Claude-vision path first (shortest seam to existing infra).

---

## PHASE 3 — RESURFACING / REPLAY

### Shipped vs specced
**[ABSENT].** No `on-this-day`, `resurface`, `slideshow`, `throwback`, or unprompted last-trip surfacing anywhere in `app/src` (the only `replay` hits are SSE test-harness plumbing in `lib/claudeChat.js`). The "interactive replay" build conversation did **not** ship a resurfacing feature. **All-Photos is pure storage** (read-only browse; `views/AllPhotosView.jsx:21-22`).

### Structure data available to drive a structure-aware replay — **[PRESENT, rich]**
A trip's `data_json` (seen via `formatTrip` `worker/src/index.js:1931-1963` and the `create_trip` schema `:1710-1748`) carries:
- `days[]` → `{ n (day number), date, name }` (day **sequence**),
- `stops[]` → `{ id, time, kind/category, name, location/address, lat/lng, who[], description, driveFromPrevious }` (stop **order**, timing, geography, **who-was-present**),
- **per-stop memories** join via `memories.stop_id` (`worker/schema.sql:8`); per-trip memory counts already computed (`:1833-1840`).

So **route / day-sequence / stop-order / per-stop memory text / who-was-present are all queryable per trip** — exactly the structure Apple Photos structurally cannot use and the app can. **The replay engine is greenfield; the substrate is ready** — a clean increment that consumes existing data with no schema change.

---

## PHASE 4 — PLANNING ASSISTANT: TOOLS WIRED vs CONVERSATIONAL

### The chat has no tools — it has a text card protocol
`POST /claude/chat` (`worker/src/index.js:1201-1382`) streams Anthropic with `{ model, max_tokens, stream, system, messages }` and **no `tools` parameter**; the stream transform only handles `text_delta`/`message_delta` (**zero** `tools`/`tool_use`/`tool_choice`/`input_schema`/`function_call` anywhere in the worker). Context = `buildClaudeSystemPrompt` (family profiles + reader + open-trip structure, or cross-trip summaries).

**The act mechanism is a fenced ` ```card ` JSON block the *client* applies** — `ClaudeChat.jsx` detects fenced card blocks (`:377-429`) → `ConfirmCard` (user edits/saves) → `lib/claudeCardApply.js applyCardToTrip` / `lib/createTripCard.js cardToTrip` → `upsertTrip`. **"The card is the only way trip data changes"** (`worker/src/index.js:1518`).

### ACT — what the chat genuinely does (trip *structure*) — **[COMPLETE]**
- **`create_trip`** (trips-list): builds a complete trip — days, stops, categories, `who`, `driveFromPrevious` — from a destination + family defaults (`:1669-1759`).
- In-trip: **`add` / `move` / `cancel` / `multi` (cascades) / `trip-settings`** (`:1580-1639`), with a two-mode policy: **GUIDANCE** (surface 2–3 options, *don't* propose) vs **EXECUTE** (emit card) (`:1510-1521`), cascade-preservation rules (`:1537-1577`), and emit-don't-ask authority (`:1525-1534`).
- All appliers are **implemented and live**: `applyAdd/applyMove/applyCancel/applyMulti/applySettings/applyCardToTrip` (`lib/claudeCardApply.js:111,168,209,228,260,295`). ⚠️ The file header comment ("move/cancel/multi … stubbed", `:8-9`) is **STALE M2-era text — verified false against the code.**

### TALK-ONLY — capability exists in the worker but is **not exposed to the chat** (the named jank)
- **Drive / travel time:** real compute exists at **`POST /leave-when` → Google Routes API** (`routes.googleapis.com/directions/v2:computeRoutes`, TRAFFIC_AWARE, iterative leave-by — `worker/src/leaveWhen.js:1-18,126`). The **chat cannot call it.** In `create_trip` the model is told *"do not guess. Estimate the real one-way driving time … 6h threshold"* with **baked worked examples** (`worker/src/index.js:1699`) and fills `driveFromPrevious`/detour as **model text**. → *The chat discusses/asserts travel time; it never computes one.*
- **Places / options:** real **Google Places** at `/places/nearby` (`:111-112`, key kept off client `:14`) and `/resolve` trip-hero (`places:searchText`, `:529-534`). **Not chat-accessible**; the chat is instructed *"Never invent venues, hours, or addresses"* (`:1619`) → it defers. No real Places options surface in chat.
- **Calendar:** `.ics` export is **client-side** (`lib/icsExport.js`), **not a chat action** and not wired to it.
- **`/draft`** (trip-from-text via Anthropic, `:1047`) is a **separate client surface** (ImportView), not a chat tool.

### Propose-vs-Hold
**Partial.** GUIDANCE-vs-EXECUTE distinguishes "give me options" from "make the change." But there is **no persisted "hold / leave-this-gap-open" object** — the system either fills (emits a card) or talks (guidance); a deliberate empty slot is not a data type.

### Named talk↔act gaps (this *is* the jank)
1. **Drive time** — computed at `/leave-when`, only *estimated* in chat.
2. **Places** — fetched at `/places/nearby` + `/resolve`, *forbidden-to-invent* in chat.
3. **Calendar** — client `.ics`, not a chat verb.
4. **Hold** — conversational only, no durable object.

**Verdict:** card-driven **trip-structure** editing = **[COMPLETE]**. Tool-backed **planning compute** = **[HALF-BOLTED]** — the endpoints are complete but unwired to the chat. Closing the gap is **additive**: add Anthropic tool-use to `/claude/chat` and register the existing `/leave-when` + `/places` (+ a calendar verb) as tools. No new compute to build.

---

## PHASE 5 — SHARE-OUT + COMPOSITION (the two under-built author verbs)

### Share-OUT — **[HALF-BOLTED, text-only]**
`utils/share.js shareStop(stop, person)` calls `navigator.share({ title, text })` where `text` = stop name + persona pitch, clipboard fallback (`:13-29`); surfaced by `components/ShareButton.jsx`. It shares a **stop *suggestion* as text** — **no photo, no memory, no file** in the share payload. Aurelia's real verb (*send my best photo out* to Snap/WhatsApp/Messages) is **not built**; the system share sheet only ever receives text.

### Share-IN — **[COMPLETE, first-class]** (the opposite direction — already mature)
Web Share Target + Apple Shortcut + paste-interstitial all funnel into **ImportView** (`App.jsx:29`, `views/ImportView.jsx:14`, `lib/shareIn/parseShareUrl.js`). **The app is ingest-biased: share-IN is robust, share-OUT is a text afterthought.**

### Composition (Helen's "interactive memory object") — **[ABSENT]**
- **PostcardComposer** (`components/PostcardComposer.jsx`) = guided **single-memory** authoring: Photo → Words → Tag → Mood → "Send" (where **"Send" = `saveMemory`**, i.e. save to archive, not share out) (`:8-19,31-41`). Produces **one postcard**.
- **tripHero** (`lib/tripHero.js`) selects **one hero *image*** per trip (Jonathan-set or Places-resolved) — `hasExplicitHero` (`:24-27`). Not a composed artifact.
- **No surface composes a trip's many memories into an "interactive memory object" / hero memory.** The pipeline is **ingest-only** (EXIF/video/backfill in; postcard authoring in) with **nothing that makes a shareable composition out**. Composition-of-artifact = greenfield.

---

## PHASE 6 — SPINE vs FOUR ROOMS

### Verdict: **one trip-data spine, four role-shaped lenses — already built that way.**
- `App.jsx` holds **shared state** (`traveler`, `tripId`, a `view` state-machine: index｜trip｜stop｜settings｜new｜edit｜activities｜photos｜all-photos｜import — `:183-185`) and **shared data** (trips via `useTrips`, memories via `memoryStore`).
- Theme is presentation only: `data-theme` = traveler (`:230`), CSS variables in `styles/themes.css`.
- **The room switch:** `switch (traveler) { helen → HelenView; aurelia → AureliaView; rafa → RafaView; default → JonathanView }` rendering with the **same `props`** (`:561-583`). One data model, four lenses selected by `traveler` — **not four parallel apps.**
- Views compose a **shared component/lib library**: `memoryStore` (listMemoriesForTrip/Stop), `memAssets` (loadAsset), `thumbUrl`, `useInView`, `Avatar/AvatarStack`, plus `ThreadedMemories`, `StopCard`, `ItineraryView`, `ConfirmCard`, `ClaudeChat`, `PhotoAlbum`. Role-specific surfaces exist (PostcardComposer→Aurelia; NearbyResultsModal→Jonathan).

### Where a shared concern is re-derived per view (the franken-bolt smell) — **[HALF-BOLTED]**
- The four views are **thick** (Helen 674 · Aurelia 834 · Rafa 509 · Jonathan 788 lines) and each re-implements its own **layout/composition**.
- Acknowledged render duplication: `AllPhotosView.jsx:257-262` ("Same … StopGroup pattern … duplicated here … easier to read than threading a flag").
- **Theme tokens re-derived in ≥3 places:** `App.jsx topBarTokens` (`:51`) + `styles/themes.css` + `data/travelers.js TRAVELER_DOT/color` (`:14-70`).
- `hasExplicitHero` is **intentionally byte-duplicated** across app + worker (separate Vite/Wrangler deploy units, unit-tested to stay identical — `lib/tripHero.js:18-23`).

**Verdict:** the **data spine is sound and shared**; duplication is confined to **view-composition and theme tokens**, not data. The redesign is **"build the absent verbs on the existing spine,"** *not* a re-architecture. The single genuine refactor candidate is consolidating the thick per-view composition (and unifying theme-token derivation).

---

## INCREMENT-BOUNDARY LEDGER (for closed, complete increments)

**[COMPLETE] — ship-ready spine pieces (don't rebuild):**
binary author-scoped visibility ACL (D1 + client mirror) · trip-data spine + 4 lenses · card-driven trip editing (create/add/move/cancel/multi/trip-settings, with cascades + two-mode) · photo→stop spatiotemporal backfill · cross-trip All-Photos read · share-IN pipeline (Share Target/Shortcut/paste) · trip-hero image resolve · per-memory postcard authoring · worker compute endpoints (`/leave-when` Routes, `/places/nearby`, `/resolve`, `/draft`).

**[HALF-BOLTED] — finish-the-wire increments:**
planning chat (acts on structure, but real-world quantities are model-estimated — **endpoints exist, unexposed to chat**) · person seam (cross-trip reader exists, **person axis absent**) · share-OUT (exists but **text-only**) · per-view composition duplication on a clean data spine.

**[ABSENT] — greenfield increments (clean boundaries, substrate often ready):**
person recognizer (all 3 fallback paths) · resurfacing/replay engine (**structure data ready**) · share-OUT of photo/memory · trip-memory composition artifact · Helen **M4** hide/reveal/decoy + geofence/time triggers · Claude visibility-awareness · per-recipient (targeted) visibility · persisted planning "hold".

---

## RECON METHOD / CONFIDENCE
Read-only, direct (no subagent workflow). Load-bearing facts second-read and content-anchored to `file:line`. Notable trap caught: `claudeCardApply.js` header claims move/cancel/multi are "stubbed" — **verified false** against the live appliers. One deliberate non-assertion: the production photo-archive **object count** is in live D1/R2 and is **not stated** (not derivable from the repo).
