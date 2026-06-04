# IMPORTER_SPEC.md — The One True Media Importer

> ORIENT FIRST: Read **/WORKING_AGREEMENT.md** and hold to it before acting on anything below.
> This spec is a POINTER, not truth — re-derive every `file:line` claim from the code (§1) before
> building on it. Confirm real HEAD / branch / tree yourself. Decisions here are Jonathan's (locked
> 2026-06-03); the *ground-truth pointers* are verify-targets, not gospel.

Authored 2026-06-03 (after Step 2 / interstitials shipped, HEAD `8171b32`). This is the anti-drift
anchor for a multi-window feature: collapse the photo/video upload surfaces into one modern importer.

---

## 1. Why (the problem, verified 2026-06-03)

There are **three** photo/video upload entry points today, inconsistent and confusing:

1. **Single-photo dispatch** — `components/AddDispatchModal.jsx`. One photo OR one video at a time,
   with a **caption** (`:48`,`:769`) and a **manual stop pick** (`:49`,`:790`; required — save disabled
   without it `:263`,`:818`). It is **the only video path** (`accept="video/*"` `:487` + WebCodecs
   `runVideoPipeline` `:125` → `lib/videoPipeline`). It is **offline-resilient** via `lib/uploadQueue`
   (`enqueue` `:332-356` + the PhotosView **sync pill** `drain`). Opened from PhotosView's
   "Add photo or video" button (`data-testid="add-dispatch"`). **Only used by PhotosView** (`:251`).
   **Heavily tested** (~13 e2e specs grep `add-dispatch|dispatch-file-input|open-picker`).
2. **Per-stop album composer** — `components/ThreadedMemories.jsx`. Up to **6** images
   (`MAX_PHOTOS_PER_ALBUM` `:15`), inside a stop's memory. **KEPT** in the end state (just bumped).
3. **Bulk import** — entry in `views/Settings.jsx` ("Import photos from your library",
   `import-file-input` `:332-345`, `accept="image/*"` **multiple**, unlimited) → renders
   `components/PhotoBackfillTriage.jsx`. **Auto-files by GPS+time** → stops + "From A→B" interstitials
   (Step 2). No video, no caption-at-upload (`photoBackfillUpload.js` caption `''` `:97`), **no offline
   queue** (saves via `saveMemory` best-effort mirror).

**Decision (Jonathan, 2026-06-03):** collapse #1 and #3 into ONE importer. Keep #2 as the quick
per-stop add (cap 6→10). **There is no fundamental barrier** to the importer subsuming the dispatch —
the dispatch's only unique pieces are caption-at-upload + manual-stop-pick (both *less* app-like than
import-then-caption + auto-file) and the offline queue + video (both wireable). The cost is **scope +
porting the offline queue + migrating ~13 e2e specs**, not impossibility (verified by code read, not
assumed). My initial "keep both" was risk-aversion about that migration, not a real wall.

---

## 2. End state — 2 surfaces (not 3)

- **The Importer.** One picker (`image/*,video/*`, multiple). Photos auto-file by GPS+time (Step-2
  interstitials); videos encode (WebCodecs) + file by time. **Lightweight import-confirm** screen,
  **smart-skipped when clean**. **Offline-safe** (inherits the upload queue). Captions happen in the
  **album** afterward. Primary action in PhotosView; **pre-fills a stop** when opened from one.
- **Per-stop album** (`ThreadedMemories`) — unchanged except cap **6→10**.

The single-photo dispatch composer is **retired** (Stage 3).

---

## 3. Locked design decisions (Jonathan, 2026-06-03)

- **Smart-skip review.** A clean import (all photos cleanly matched, or just 1–2 items) saves silently
  with a confirmation toast — like Apple/Google Photos. The confirm screen appears **only** when
  there's something to resolve (interstitials / off-route clusters / duplicates / a large batch).
- **New lightweight import-confirm view** — NOT the heavy reconcile triage. The existing
  `PhotoBackfillTriage` reconcile flow (stop states / didn't-happen / auto-add / archive) stays for the
  **explicit "reconcile / archive trip"** action only (keep it reachable — decide its entry in Stage 1
  or 3; candidate: stays in Trip Settings as "Reconcile this trip").
- **Captions** in the album post-import, not at import.
- **Video v1** files by **time** (date from `lib/videoMeta.extractVideoCreationDate`; videos carry no
  extractable GPS today — GPS-for-video is a future option, not v1).
- **Opened from a specific stop** → pre-files there (skip matching).
- **Offline upload must survive** — a hard, written stop-condition before Stage 3 retires dispatch.

---

## 4. Staging — each ≈ one context window, each independently shippable

### Stage 1 — Importer as primary (additive, LOW risk)
- Move the bulk importer (`import-file-input` + the triage render block) OUT of `views/Settings.jsx`
  (`:191-204`, `:322-354`) INTO `views/PhotosView.jsx` as the primary **"Import photos"** action.
- Thread `tripsApi` into PhotosView (App.jsx `:831-837` — PhotosView doesn't get it today; Settings
  does at `:797`). PhotoBackfillTriage needs it (`upsertTrip`).
- Bump `ThreadedMemories.MAX_PHOTOS_PER_ALBUM` 6→10.
- **Dispatch (`AddDispatchModal`) UNTOUCHED** — stays as the secondary "Add photo or video" (still the
  video + offline path). No dispatch-spec changes this stage.
- Tests: update `reconcile-archive.spec.js` `openReconcileTriage` (`:110-119`) — opens the importer
  from PhotosView now, not "Trip settings" (keep the `import-file-input` testid so only nav changes).
- G8: the new PhotosView layout (import + dispatch buttons) may shift `album-<persona>` baselines →
  LOOK at the diff, re-bless narrowly.
- **Ships:** bulk-as-primary, out of Settings, cap 10. Nothing broken.

### Stage 2 — Capabilities into the importer (offline + video) · MEDIUM risk
- Wire `lib/photoBackfillUpload` through `lib/uploadQueue` (`enqueue` on failed worker push + the
  sync-pill `drain`) — mirror `AddDispatchModal.queueSilently` (`:332-356`). Importer → offline-safe.
- One picker accepts `image/*,video/*`; partition by type. Photos → existing match/triage. Videos →
  `videoPipeline.encodeVideo` + `videoMeta.extractVideoCreationDate`, filed by time, **sequential
  encode with progress** (reuse the EncodingPanel pattern).
- Build the **lightweight import-confirm view** + the **smart-skip** logic (clean → toast, else show).
- **HARD stop-condition:** prove offline upload survives — a photo/video imported while offline still
  uploads on reconnect via the queue. A REAL test (sim/e2e), not asserted.
- **Ships:** importer does everything dispatch does. Dispatch still present (redundant).

### Stage 3 — Retire dispatch + migrate specs · MEDIUM risk
- Remove the single-photo dispatch entry; reduce/retire `AddDispatchModal` (video already folded into
  the importer in Stage 2).
- Migrate the ~13 e2e specs off the dispatch path onto the importer; re-verify offline + video there.
  (`photos-dispatch`, `photos-video`, `photos-offline`, `photos-screenshots-m2/m4`,
  `journey-02/03/07`, `instrumentation-harvest`, `network-matrix/photo-upload`, + simulator seeds.)
- Retire/replace the dispatch-composer visual baselines.
- **Ships:** ONE importer + the per-stop album. End state.

---

## 5. Hard stop-conditions (every stage)
- **Don't break the working path** (§G5): before shipping each stage, re-verify against real input —
  dispatch upload, **offline upload**, JPEG/HEIC EXIF, and Step-2 interstitials.
- **Offline resilience must carry to the importer BEFORE dispatch is retired** (the Stage-2 gate).
- **e2e-gated deploy; look before you bless** (§G8) — album/all-photos baselines are NOT masked.
- This is **client-only** (no worker/D1 change expected) → single client deploy per stage, no migration.
- **Decision gates** (§3): commit / push(=deploy) / re-bless go to Jonathan each time.

---

## 6. Ground-truth pointers to VERIFY (re-derive; line numbers may drift)
- Dispatch `AddDispatchModal.jsx`: caption `:48`/`:769`, stop pick `:49`/`:790`/req `:263`,`:818`,
  enqueue `:332-356`, video inputs `:476-491`, `runVideoPipeline` `:125`, `PickPanel` `:561`. Sole
  user PhotosView `:251`.
- Bulk: `Settings.jsx` import input `:332-345`, triage render `:191-204`, Photos section `:322-354`;
  `PhotoBackfillTriage.jsx`; `photoBackfillUpload.js` (caption `''` `:97`, no queue).
- Album cap: `ThreadedMemories.jsx:15`.
- `tripsApi`: `App.jsx:195` (`useTrips`), → Settings `:797`, NOT PhotosView `:831-837`.
- Offline: `lib/uploadQueue.js` (`enqueue`/`drain`); SyncPill + `triggerDrain` in `PhotosView.jsx`
  (`:111`, `:262-295`).
- Video: `lib/videoPipeline.js` (`encodeVideo`, `isVideoEncodeSupported`), `lib/videoMeta.js`.
- Stage-3 e2e blast radius: grep `add-dispatch|dispatch-file-input|open-picker|open-video-picker`
  under `tests/` (~13 specs + simulator).

---

## 7. Status / handoff
- Spec authored 2026-06-03. Predecessor: Step 2 interstitials shipped (HEAD `8171b32`, both deploys
  green, migration 007 live). See `memory/photo-intake-ground-truth.md`.
- **NEXT = Stage 1**, ideally a fresh context window that opens by reading this spec + WORKING_AGREEMENT.
- Root `.md` ⇒ no deploy; committing this is safe (documentation), but commit is still a §3 gate.
