# Research appendix — self-healing photos (Phase 3 deep round, 2026-07-05)

Raw agent reports backing SPEC.md. Round-2 verification supersedes round-1 where they conflict.

---

## verify-0

All five claims verified against the live tree (branch `fix/foolproof-video-import`, worktree at `/Users/jjackson/dev/roadtrip`). Report follows.

---

## CLAIM 1 — CONFIRMED (line range slightly off)

`stop_id` is a dedicated TEXT column: `/Users/jjackson/dev/roadtrip/worker/schema.sql:8` (`stop_id TEXT,` inside `CREATE TABLE IF NOT EXISTS memories`, lines 5–29).

The worker INSERT is at `/Users/jjackson/dev/roadtrip/worker/src/index.js:1049–1101` (statement) + `:1102–1120` (bind) — so the claim's "~1049–1068" undersells it; the full upsert runs to 1120. Every column is listed explicitly (index.js:1050–1056), and the conflict clause has `stop_id = excluded.stop_id` at index.js:1068. `stopId` is bound from the body at index.js:1103 (`body.id, body.tripId || null, body.stopId || null`). This is the ONLY memories INSERT in worker/src (grep: one hit, line 1049); the only other memory writes are the scheduled-reveal UPDATE (index.js:443–448) and the soft-delete UPDATE (index.js:1137).

## CLAIM 2 — CONFIRMED

`grep -rn "stopIdSource|stop_id_source|provenance"` over app/src + worker/src: zero data-field hits. The word "provenance" appears only in comments about unrelated concepts (app/src/lib/replayPresence.js:3, app/src/lib/evidence.js:22,139, app/src/lib/mapsLink.js:35, app/src/views/ImportView.jsx:39). Also checked `stopSource|autoFiled|filedBy|stop_source`: zero hits. No provenance flag exists today.

## CLAIM 3 — COLUMNS CONFIRMED; the "ride-along without migration" half is REFUTED for most of them

Columns exist: `reactions_json` (schema.sql:19), `photo_r2_keys_json` (schema.sql:24), `photo_external_urls_json` (schema.sql:25), `interstitial_json` (migration `worker/migrations/007_memory_interstitial.sql`, last line), `hide_from_json`/`reveal_json`/`conceal`/`cover_json`/`surprise_json`/`revealed_at` (migration `worker/migrations/010_memory_surprises.sql`, last 6 lines).

But "a new logical field could ride inside one WITHOUT a migration" is FALSE for most, because the worker does NOT store these verbatim — it re-serializes through whitelists:

- **photo_r2_keys_json — REFUTED as a carrier.** The worker rebuilds it via `photoEntry` (index.js:929–939: copies only `key, mime, lat, lng, capturedAt, posterKey`) and `pieceEntry` (index.js:950–960). An unknown per-ref key is silently dropped on push.
- **interstitial_json — REFUTED.** Whitelisted to exactly `{before, after}`: index.js:1006–1012 (`interstitialJson = JSON.stringify({ before: body.interstitial.before ?? null, after: body.interstitial.after ?? null })`), and rowToMemory re-whitelists on read (index.js:1359–1367).
- **hide_from_json / cover_json / surprise_json — REFUTED/unsafe.** All gated on the memory being a surprise: `hideFromJson` only when non-empty array (index.js:1020–1021), and its presence MARKS the row a surprise (comment index.js:1018–1019); `coverJson` requires `concealVal === 'cover'` (1025–1028); `surpriseJson` requires `hideFromJson` (1029–1032). For a normal memory all write NULL.
- **reveal_json — verbatim but unsafe.** `JSON.stringify(body.reveal)` when object (index.js:1022–1023), surfaced verbatim (1376, 1404) — BUT it is COALESCE-only on conflict (1095, can never be cleared) and the cron does `json_extract(reveal_json, '$.type')` / `'$.at'` on it (index.js:447–448). Riding provenance here would entangle with surprise-reveal logic.
- **reactions_json — the only genuinely verbatim array.** Worker: `const reactionsJson = body.reactions?.length ? JSON.stringify(body.reactions) : null` (index.js:914); conflict: `reactions_json = excluded.reactions_json` (1086, plain overwrite); read: `try { reactions = JSON.parse(r.reactions_json) } catch {}` (1349–1351). An extra object element WOULD survive. Hazard: it is overwritten wholesale by every push and is a live-mutated field (reaction toggles from other devices) → clobber-prone; also empty-array pushes null it.
- **photo_external_urls_json — verbatim but hazardous.** `body.photoExternalURLs?.length ? JSON.stringify(body.photoExternalURLs) : null` (index.js:996–998), read verbatim (1352–1355), plain overwrite on conflict (1092). Hazard: a non-empty ride-along value counts as a "photo source" in the half-record gate at index.js:1040 (`if (body.kind === 'photo' && !photoR2Key && !photoR2KeysJson && !photoExternalUrlsJson) return 400`), weakening that defense; renderers expect URL strings.

Note the 007 migration's own comment states the project's precedent: per-memory-grain data "earns a real top-level column instead of the JSON-extension trick" (007_memory_interstitial.sql, comment block). `stopIdSource` is per-memory grain.

## CLAIM 4 — FULL ROUND-TRIP TRACE: a new top-level field is DROPPED by the worker AND erased client-side on the next pull; no *_json column is a safe verbatim carrier

**Client push** (`/Users/jjackson/dev/roadtrip/app/src/lib/workerSync.js`, `pushMemory` lines 295–382): the client serializes the ENTIRE local record verbatim:
```js
const updated = { ...memory }            // workerSync.js:312
...
const r = await workerFetch('/memories', {
  method: 'POST',
  body: JSON.stringify(updated),         // workerSync.js:375–377
}, { asTraveler: asAuthor })
```
So a new top-level `stopIdSource` WOULD be transmitted. (The only mutations before send: blob refs rewritten to r2 (319–366), `baseUpdatedAt` attached (372–373); worker strips `baseUpdatedAt` at index.js:896.)

**Worker store**: `postMemory` binds ONLY the explicit columns (index.js:1102–1120):
```js
).bind(
  body.id, body.tripId || null, body.stopId || null,
  traveler,
  body.visibility || 'shared',
  body.kind || null,
  body.text || null, body.caption || null,
  body.transcript || null, body.transcriptLang || null,
  body.transcriptionStatus || null,
  body.durationSeconds ?? null, body.mood || null,
  reactionsJson,
  audioR2Key, audioMime, photoR2Key, photoMime,
  photoR2KeysJson, photoExternalUrlsJson, interstitialJson,
  hideFromJson, revealJson, concealVal, coverJson, surpriseJson, revealedAt,
  createdAt, updatedAt
).run()
```
There is NO catch-all blob for memories — unlike `trips`, which have `data_json TEXT NOT NULL -- whole trip object` (schema.sql:40). `body.stopIdSource` never reaches a column → **silently dropped at store time**.

**Worker serve-back**: `rowToMemory` (index.js:1279–1413) constructs a fixed-shape object (return literal at 1381–1412: `id, tripId, stopId, authorTraveler, visibility, kind, text, caption, transcript, transcriptLang, transcriptionStatus, durationSeconds, mood, reactions, photoRef, photoRefs, pieces?, photoExternalURLs, interstitial, audioRef, hideFrom?/reveal?/conceal?/cover?/surprise?/revealed?, createdAt, updatedAt, deletedAt`). No unknown fields survive. Reads also pass through `maskMemoryForViewer` (index.js:863) which replaces the row with a `masked: true` stub for hidden-from viewers (worker/src/surprises.js:43, 74).

**Client-only storage is ALSO not durable**: `mergeFromRemote` replaces the local record wholesale when remote wins — `bucket.set(r.id, stampServer(existing ? preserveLocalPhotoMeta(r, existing) : r))` (memoryStore.js:641–650). `preserveLocalPhotoMeta` (memoryStore.js:692–731) carries forward ONLY `lat/lng/capturedAt/posterKey/posterUrl` per-ref plus `interstitial` — nothing else. And remote typically wins after any push, because the server stamps `updated_at = Date.now()` (index.js:910) and `shouldTakeRemote` takes `remote.updatedAt > local.updatedAt` (memoryStore.js:677). So a client-only `stopIdSource` is **erased on the first winning pull** — which the periodic auto-sync makes routine.

**Conclusion for the plan**: the provenance flag needs either (a) a real D1 column via **migration 017** (the 007 pattern is the documented template, including the NULL-back-compat and rowToMemory-omit-when-NULL discipline), or (b) an explicit extension of BOTH the worker whitelist serializers AND `preserveLocalPhotoMeta` — option (a) matches the project's stated precedent for per-memory-grain data. Riding inside `reactions_json`/`photo_external_urls_json` technically survives verbatim but both carry real hazards (wholesale overwrite / photo-source gate at index.js:1040). I could not find any safe existing JSON carrier.

## CLAIM 5 — updateMemoryStop, full body + sync-honesty verdict

`/Users/jjackson/dev/roadtrip/app/src/lib/memoryStore.js:829–859` (comment + entire body):
```js
// Re-file a memory to a different stop (used by the "sort to places" re-file when
// the trip's implicit base appears AFTER photos were already imported). Patches the
// single stopId field + re-mirrors so other devices pick up the move. Idempotent
// (a no-op when already there); a masked projection is never a valid target.
export function updateMemoryStop(memoryId, stopId) {
  if (!memoryId) return null
  const tryUpdateIn = (key) => {
    const list = readJson(key)
    const idx = list.findIndex((m) => m.id === memoryId)
    if (idx < 0) return null
    if (list[idx].masked) return list[idx]
    if (list[idx].stopId === stopId) return list[idx] // already filed there
    const now = new Date().toISOString()
    const patched = { ...list[idx], stopId, updatedAt: now }
    list[idx] = patched
    writeJson(key, list)
    scheduleMirror({
      type: 'save',
      record: patched,
      reapply: (fresh) => ({ ...fresh, stopId, updatedAt: new Date().toISOString() }),
    })
    return patched
  }
  const inShared = tryUpdateIn(SHARED_KEY)
  if (inShared) return inShared
  for (const traveler of ['jonathan', 'helen', 'aurelia', 'rafa']) {
    const result = tryUpdateIn(PRIVATE_KEY(traveler))
    if (result) return result
  }
  return null
}
```

**"Re-mirrors" concretely**: `scheduleMirror` (memoryStore.js:563–593) appends to a serial promise chain and fire-and-forgets: dynamic-imports workerSync, then `const res = await sync.pushMemory(op.record, { baseUpdatedAt: op.record.serverUpdatedAt })` (line 580) — a whole-record POST /memories with the optimistic-concurrency base. On success it records the server-stamped version (`recordServerUpdatedAt`, lines 581–583, 496–514). On a 409 it runs `resolveSaveConflict` (585; body 526–558): re-pulls as the author, re-applies ONLY the stopId onto the fresh server row via the `reapply` closure (memoryStore.js:848 / 536), retries up to `MIRROR_CONFLICT_RETRIES = 2` (516, 550–551), and on final failure adopts the fresh server row locally (557) so no island forms.

**"Masked projection never a valid target" concretely**: `if (list[idx].masked) return list[idx]` (memoryStore.js:839) — returns the untouched stub. `masked: true` is stamped by the worker's surprise projections (worker/src/surprises.js:43 and :74); `pushMemory` independently refuses to push any masked record (workerSync.js:302 `if (memory?.masked) return null`).

**Sync-honesty verdict — the weak spot the plan must know about**: the mirror does NOT rely on `res.ok` (workerFetch throws on non-2xx; the 409 path reads `err.status`), and it DOES read the per-item object result (`res.updatedAt`, lines 581–582). BUT a non-409 failure (offline, worker 5xx, unconfigured, thrown blob-missing) is **silently swallowed**: line 586 comment `/* else offline / unconfigured / Worker error — local stays canonical */`, plus the outer `catch {}` (588–590) and `mirrorChain.catch(() => {})` (592). `updateMemoryStop` returns `patched` synchronously (line 850) BEFORE the mirror even runs — the caller gets no signal, and I confirmed there is **no retry queue for failed memory-save mirrors** (deletes get a tombstone re-fired on the next pull, memoryStore.js:618–621; trips get `lib/tripSyncQueue`; memory saves get neither — the only recovery is the manual Settings "Push all" referenced at workerSync.js:299–301). The failed-mirror device keeps the move locally (its device-clock `updatedAt` is newer, so `shouldTakeRemote` at 677 won't revert it), while every other device never learns of it — **silent cross-device divergence until some later successful push of that same record**. For Phase 3's "auto-apply with a visible note," this is a real robustness gap: an auto-move whose mirror fails would look applied on one device and be invisible everywhere else, with no honest failure surface.
---

## verify-1

All six claims verified against live source (branch `fix/foolproof-video-import`). Report:

---

## 1. matchPhotosToStops call sites — CONFIRMED (with one precision note)

Repo-wide grep (app/src + worker) finds exactly three call sites of `matchPhotosToStops`:
- `app/src/components/ImportFlow.jsx:191`
- `app/src/components/PhotoBackfillTriage.jsx:174`
- `app/src/lib/reconcileDraft.js:156` — `const matchResult = opts.matchResult || matchPhotosToStops(photoList, trip)`

The reconcileDraft fallback is dead-in-practice **in the app**: both runtime callers of `buildReconciliationDraft` pass a precomputed `matchResult` (`ImportFlow.jsx:192`, `PhotoBackfillTriage.jsx:177`). It IS live in tests (`app/scripts/__tests__/reconcileApply.test.mjs:44,67,83,90,154,164` call without `matchResult`).

Nothing re-runs it on a trip/agenda edit: the full importer list of photoMatch.js (`weave.js:3`, `resurface.js:12`, `photoEntries.js:23`, `evidence.js:24`, `routeProgress.js:18`, `TripEditor.jsx:10`, `ReplayView.jsx:6`, `PhotosView.jsx:8`, `useSurpriseAutomation.js:8`, plus the three above and `refilePlaces.js:13`) shows edit-path files (`TripEditor.jsx`) import only display helpers (`stopIsBase`); no sync/pull/save code imports any matcher.

**Precision note:** there is a fourth *re-matching* path the claim's wording hides — `refilePlaces.js:66` re-runs the per-photo `matchPhotoToStop` (not `matchPhotosToStops`). It is manual-only (see claim 3), but any "the matcher only runs at import" summary should account for it.

## 2. Algorithm shape — CONFIRMED

- GPS-first, explicit: comment + logic at `photoMatch.js:374–459`; nearest-stop attach gated by `gpsMatchMeters: 1_000` (`photoMatch.js:109`, gate applied at :432); base priority with per-base radius (`photoMatch.js:411–428`, `stopBaseRadiusMeters` default = gpsMatchMeters at :144–148); `baseYieldMeters: 150` yield-to-specific-stop exception (`photoMatch.js:116`, applied :412–415).
- Capture time: day bucketing by **UTC** calendar windows `T00:00:00.000Z`–`T23:59:59.999Z` (`photoMatch.js:351–352`); no-GPS time-only binding to the bracketing clock stop (`photoMatch.js:489–513`).
- Stay + no GPS → defaults to the day's base place (implicit base first, then planned base), gated by `isStay && !isHomeDay` (`photoMatch.js:471–487`).
- No place-name text matching: confirmed across the whole file. The only text regexes are `HOME_LODGING` (`photoMatch.js:168`, gates the implicit base, never matches photos to stops) and `parseStopTime`'s time-label parsing (`photoBackfill.js:201–235`). No photo↔stop-name comparison exists.
- Extras the claim omits (not refuting, but real): interstitial GPS clusters (500m union-find, min 3) can be promoted to `deviation` when >2000m off the day's route polyline (`photoMatch.js:101–120, 524–622`).

## 3. refileTripToPlaces — CONFIRMED

- Only re-files onto the implicit base: `refilePlaces.js:70` — `if (!isImplicitBaseId(target) || target === m.stopId) continue`. Bails entirely when no implicit base (`refilePlaces.js:54`).
- Unanimity: `refilePlaces.js:65–68` — `stopIds.size !== 1` → skip ("photos disagree → don't split a memory"). Masked memories skipped (`:61`).
- Only fired from PhotosView's two-step confirm: sole importer is `PhotosView.jsx:9`; offer→confirm UI at `PhotosView.jsx:364–393` (`confirmRefile` two-step state :78–84, apply in `runRefile` :139–140). Note the **dry run** (`dryRun: true`, no mutation — `refilePlaces.js:73` guards the write) executes automatically on every PhotosView render to count candidates (`PhotosView.jsx:72–75`).
- Writes go through `updateMemoryStop` (`memoryStore.js:833`), which patches only `stopId` + `updatedAt` and rides the sync mirror with a reapply closure (`memoryStore.js:842–849`). Confirming the plan's premise: the record shape (`memoryStore.js:12`) carries **no provenance field** — nothing distinguishes auto from manual filing today.

## 4. No manual per-memory re-file UI — CONFIRMED

- `updateMemoryStop` has exactly one caller: `refilePlaces.js:73` (bulk, base-only). No other code mutates a memory's `stopId` post-creation.
- The lightbox (`PhotoAlbum.jsx:5`) imports only `updateMemoryCapturedAt`, `updateMemoryCaption`, `removePhotoFromMemory` — no stop move.
- No stop picker / drag-drop / "move to…" found anywhere in app/src touching `stopId`. `ThreadedMemories.jsx:75,100,190` set `stopId` only at memory **creation**.
- Boundary caveat: the import-time triage (`PhotoBackfillTriage.jsx:244–260` + `reconcileEdits.js` rename/retime/merge/split/demote/didn't-happen) does let a human reshape stop↔photo assignment — but only on the pre-persistence draft during import, not on an existing memory.

## 5. evidence.js — CONFIRMED

- Gates 200m/90min: `EVIDENCE_DEFAULTS = { radiusMeters: 200, gapMinutes: 90 }` (`evidence.js:29`); GPS+time union-find single-linkage clustering (`evidence.js:99–159`).
- Needs no stops: `photosForDay`/`clusterPhotos`/`buildDayEvidence` take `(memories, isoDate)` only — no trip/stop input anywhere.
- Consumers: only `LivingHeartHome.jsx:31` (SettleCard is defined in that same file, `LivingHeartHome.jsx:805`, rendered :506) and `SettleSheet.jsx:9`; plus test files (`scripts/__tests__/evidence.test.mjs`). No other src importer.
- Shares only `haversineMeters` with photoMatch.js (`evidence.js:24`). (It separately imports `localDateIso` from `localDate.js` — different module, claim intact.)
- Relevant contrast for Phase 3: evidence.js is **deliberately device-local-timezone-sensitive** (`localDateIso` with no tz → device-local, `evidence.js:38–42, 62`; `hourInTz` falls back to `d.getHours()` :193), whereas photoMatch buckets by UTC day. Two different day-attribution regimes coexist by design.

## 6. photoMatch.js purity / determinism — importable: CONFIRMED; deterministic: YES with one input-shaped caveat

**Import list (verbatim, `photoMatch.js:15–16`):**
```js
import { parseStopTime } from './photoBackfill.js'
import { stayPlaceCoords, isStayTrip } from './tripShape.js'
```
Both extension-full `.js` — no `.jsx`, no extension-less imports.

**Plain-node importable: CONFIRMED by execution.** `node --test scripts/__tests__/photoMatch.test.mjs` (which imports the real `../../src/lib/photoMatch.js` at `photoMatch.test.mjs:11–29`) ran in this session: **63 tests, 63 pass, 0 fail**. Transitively safe because: `tripShape.js` has zero imports; `photoBackfill.js:17` statically imports `./exifRead.js`, but exifRead's only package dependency is a **dynamic** `await import('exifreader')` inside `loadExifTags` (`exifRead.js:28`) — never executed at module load.

**Non-determinism scan:** photoMatch.js contains no `Date.now()`, no `new Date()`, no `Intl`, no `toLocale*`, no `getTimezoneOffset`. Its only time reads are `Date.parse(photo.capturedAt)` (`photoMatch.js:345`) and UTC-anchored day windows (`photoMatch.js:351–352`). `parseStopTime` is likewise UTC-anchored (`Date.parse(\`${dayIsoDate}T00:00:00.000Z\`)`, `photoBackfill.js:205`) and pure string→offset arithmetic. Cluster ids are counter-based, pin-free — no randomness. Iteration order follows `trip.days` array order — identical on identical trip JSON.

**The one landmine — precisely:** `Date.parse(photo.capturedAt)` at `photoMatch.js:345` is deterministic **only if the string carries a zone designator**. Per the ES spec, a date-time form without offset ("2026-07-04T14:00:00") parses as *device-local* time → the same stored memory could bucket into different days on devices in different timezones → divergent auto-moves. Importer-produced values are safe: `toIsoString` always ends in `Z` via `Date.prototype.toISOString()` (`photoBackfill.js:93–103`), and refilePlaces feeds those stored strings back (`refilePlaces.js:29–31`). What I could NOT confirm: that every historical/synced memory's `capturedAt` (and per-ref `capturedAt`) in live data ends in `Z`/offset — no schema enforces it, and `updateMemoryCapturedAt` (dev date-override path, `PhotoAlbum.jsx:5`) is another producer I did not audit. Phase 3 should either normalize/assert a zone designator on `capturedAt` before matching, or treat a zone-less timestamp as unmatchable. Secondary (semantic, not determinism): the UTC day bucketing means a late-evening Americas photo files to the *next* UTC day — deterministic across devices, but a known drift evidence.js explicitly works around (`evidence.js:38–42`).
---

## robust-0

All investigation done read-only. Report follows.

# Memory-record sync under failure & conflict — factual map for Phase 3

## 1. The push/pull/mirror pipeline

**Architecture** (stated + verified): localStorage is the canonical local cache; the Worker is a write-through mirror. "Local writes are synchronous and offline-tolerant; remote pushes fire-and-forget after the local write returns" — `app/src/lib/memoryStore.js:1-4`.

**Write path.** Every memory edit (`saveMemory`, `deleteMemory`, `updateMemoryStop/Caption/CapturedAt/Poster`, `revealSurprise`, `removePhotoFromMemory`) writes localStorage synchronously, then calls `scheduleMirror(op)` (`memoryStore.js:334-339`, `842-850`). `scheduleMirror` is a serial promise chain (`memoryStore.js:563-593`):
- **save**: `await sync.pushMemory(record, { baseUpdatedAt: record.serverUpdatedAt })` (`:580`). On success it reads the *per-item* result — `res.updatedAt` — and stamps it via `recordServerUpdatedAt` (`:581-583`, `:496-514`). On `err.status === 409` it runs `resolveSaveConflict` (`:585`). **Any other error is swallowed with no queue and no retry**: `/* else offline / unconfigured / Worker error — local stays canonical */` (`:586`) and the outer `catch {}` (`:588-592`).
- **delete**: reads the honest tri-state from `deleteRemote` — `true` confirmed / `null` unconfigured / `false` failure — and clears the persistent tombstone only on `!== false` (`:569-576`; `deleteTombstones.js:1-16, 54-92`).

**pushMemory** (`app/src/lib/workerSync.js:295-382`): uploads any IDB blobs first and **throws** rather than posting a half-record when a blob is missing (`:331-334, 342-345, 357-361`); refuses to push a masked projection (`:302`); attaches `baseUpdatedAt` only when finite (`:372-373`); returns the stored server row, or `true` on a JSON-parse miss (`:379-381`), or `null` when the worker isn't configured (`:296`).

**Pull path.** `App.jsx` `runSync()` (`app/src/App.jsx:449-462`): `pullAll()` → `mergeFromRemote(remote)` → `tripsApi.refresh?.()`. Fired on cold load (`:493`) and on visibilitychange (`:496-501`). `pullAll` is always a **full pull** (no `since` param sent — `workerSync.js:255`) and on failure returns `[]` with an `errors` array (`:270-275`). Note the deliberate decision that both sides of the LWW compare stay **ISO strings** (`workerSync.js:257-269`).

**mergeFromRemote** (`memoryStore.js:600-658`): per-record —
- tombstone guard: a locally-deleted id is never re-added; the delete is re-fired (`:618-622`) — this is the memory-side resurrection guard, same `deleteTombstones.js` engine the trips side uses;
- server `deletedAt` → remove local copy (`:623-635`);
- else LWW via `shouldTakeRemote` (`:668-680`): remote wins if `remote.updatedAt > local.updatedAt` (string compare of ISO stamps), plus masked-stub and R2-upgrade exceptions;
- when remote wins, `preserveLocalPhotoMeta` gap-fills local-only EXIF/poster/interstitial onto it (`:692-732`) and `stampServer` records `serverUpdatedAt` (`:475-478`).

**Clobber-guard equivalence to trips:** memories have (a) delete tombstones (same engine as trips) and (b) an *implicit* pull-clobber guard — a local unsynced edit carries a newer device-clock `updatedAt`, so `shouldTakeRemote` refuses the older remote row. But memories have **no equivalent of `lib/tripSyncQueue` + `resyncPending`** (trips: `hooks/useTrips.js:294-316` re-pushes stranded edits every 20 s). The only memory re-push mechanisms are: the blob `uploadQueue` drain (`App.jsx:464-491` — blobs and posters only, not row edits), and the **manual** Settings "Push all" backfill (`views/Settings.jsx:196-210`, which does read per-item results honestly: `null`=skipped / falsy=failed).

## 2. Sync-honesty audit of `updateMemoryStop` and the general push path — TODAY

`updateMemoryStop` (`memoryStore.js:833-859`): finds the record in shared then each traveler's private bucket, refuses masked projections (`:839`), no-ops when already filed there (`:840`), patches `stopId` + device-clock `updatedAt`, writes local, mirrors with a reapply closure (`:845-849`).

**Compliant parts:** the mirror path does read the honest per-item result (`res.updatedAt`, `memoryStore.js:580-583`), does send the OCC base, and does handle 409 with a real merge protocol (`resolveSaveConflict`, `:526-559`, including push-then-write so a mid-recovery failure can't strand local ahead of server, `:548-558`).

**Silent-success holes an auto-refile inherits:**
1. **Non-409 push failure is a permanent silent drop.** No queue, no retry, no user signal (`:584-592`). The local record's newer `updatedAt` then makes every future pull refuse the server row (`:677`) — the device shows the move forever; no other device ever learns of it. This is exactly the class the sync-honesty memory says is "STILL OPEN: worker silent-success audit."
2. **The caller can't tell.** `updateMemoryStop` returns the patched local record unconditionally; `refileTripToPlaces` (`lib/refilePlaces.js:73-75`) counts it as "moved" and PhotosView toasts it as moved everywhere (`views/PhotosView.jsx:140`) even if the mirror later fails.
3. **Parse-miss fallback `true`** (`workerSync.js:379-381`) skips `recordServerUpdatedAt` → the next patch sends a stale base → spurious 409 → a blind-reapply cycle (self-heals, but multiplies the field-blind reapply below).

## 3. Conflict semantics: A auto→X, B manual→Y

**Worker side — no per-field merge.** The upsert is whole-row for `stop_id`: `ON CONFLICT(id) DO UPDATE SET ... stop_id = excluded.stop_id` (`worker/src/index.js:1066-1068`). `COALESCE` protects only media/mask columns against null-overwrites (`:1087-1099`); `stop_id`, `text`, `caption`, `visibility`, `kind` are unconditional overwrites. Author is immutable (`:1069-1076`).

**OCC guard** (`worker/src/index.js:894-908`), quoted:
```
const baseUpdatedAt =
  Number.isFinite(body.baseUpdatedAt) ? body.baseUpdatedAt : null
if ('baseUpdatedAt' in body) delete body.baseUpdatedAt
if (baseUpdatedAt != null) {
  const storedRow = await env.DB.prepare(
    'SELECT updated_at FROM memories WHERE id = ?'
  ).bind(body.id).first()
  if (storedRow && Number(storedRow.updated_at) > baseUpdatedAt) {
    return json(
      { error: 'conflict', id: body.id, storedUpdatedAt: Number(storedRow.updated_at) },
      409, cors)
  }
}
```
No base sent → the check is skipped entirely (pure last-push-wins). And the server stamps `updated_at = Date.now()` **at arrival** (`:909-910`) — server ordering is last-*arrival*-wins, not last-edit-wins.

**What actually happens in the A/B scenario** (both edits based on server version s0):
- Whichever push **arrives first** is accepted. The second gets a 409, and its `resolveSaveConflict` re-pulls the fresh row and runs the reapply closure — which for `updateMemoryStop` is **field-blind**: `reapply: (fresh) => ({ ...fresh, stopId, updatedAt: new Date().toISOString() })` (`memoryStore.js:848`), then re-pushes on the fresh base (`:536-548`) and wins.
- So **the last-arriving edit always wins the stopId**, regardless of which was manual. If A's auto-move was queued behind a bad network and arrives after B's manual move, A's 409 recovery re-imposes stop X over B's manual Y — silently, on every device after the next pull. Nothing in the row, the client, or the reapply distinguishes auto from manual today. The OCC machinery prevents *whole-row blind clobbers*, but the reapply mechanism deliberately re-asserts the one field — it was designed for fields where re-assertion is correct (caption, capturedAt override), and `stopId` inherits that semantics.
- Retry depth: `MIRROR_CONFLICT_RETRIES = 2` (`memoryStore.js:516`), after which the client **adopts the server row** (gives up its own edit — `:553-558`). That's conservative in the right direction, but only after 3 attempts at imposing its own value.

## 4. Offline-3-days / startup ordering

Trace of a cold boot:
1. `useTrips` hydrates state **synchronously from the stale localStorage cache** (`hooks/useTrips.js:84-85`); UI renders with the stale agenda immediately.
2. `useTrips`'s own lifecycle effect fires `resyncPending()` + `refresh()` at mount and every 20 s (`useTrips.js:294-316`). `refresh()` pulls trips with clobber/draft/resurrection guards (`:110-144`) and sets `source: 'worker'` only after a successful pull (`:145`).
3. Independently, `App.jsx` fires `runSync()` on cold load: memories `pullAll` → `mergeFromRemote` → `tripsApi.refresh()` (`App.jsx:449-462, 493`).

**There is no ordering guarantee.** Two async chains race: `useTrips`'s mount `refresh()` can complete before or after the memories merge; components see stale cached trips first in all cases. If Phase 3 triggered a re-match off "trip object changed" React state, the first trigger on a 3-days-offline device could be (a) the stale cached trip at mount, or (b) a fresh trip pulled *before* remote memories (with their fresher stopIds/manual re-files) have merged — computing moves against a stale memory set, then pushing them with stale bases → 409 → field-blind reapply → overwriting the other device's newer filings.

**Ordering hook Phase 3 needs (none exists today):** a "both fresh" join point. Candidates visible in code: `useTrips.source === 'worker'` (`useTrips.js:145`) signals trips-fresh; `runSync` in `App.jsx:449-462` is the only place where memories-merge *then* trips-refresh happen sequentially in one chain — a re-match hook placed after `await tripsApi.refresh()` inside `runSync` would be the only spot with a guaranteed order (memories merged, then trips fresh) — but `useTrips`'s independent 20 s heartbeat would still fire trip changes outside that chain, so the trigger must additionally gate on "a memories pull has completed this session," which no current flag records.

Also note: a re-match run while offline produces `updateMemoryStop` calls whose mirrors all fail silently (hole #1) — **permanent per-device divergence**, since nothing re-pushes memory row edits on reconnect.

## 5. Memory identity

Ids are client-minted: `` `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}` `` (`memoryStore.js:64-66`; duplicated verbatim in `photoBackfillUpload.js:29`). `saveMemory` uses it only when the caller passes no id (`:296`); the import/drain paths reuse the id captured at enqueue (`views/PhotosView.jsx:221-222`). Collision requires two devices minting in the same millisecond with the same 5-char base36 suffix (~1 in 60M per same-ms pair) — negligible for a family of four, but there is **no server-side uniqueness beyond the PK**: a collision would silently upsert one memory over the other (`worker/src/index.js:1066`), keeping the first author (`:1076`). Not a practical Phase 3 risk; convergence per id is otherwise sound (single-writer-per-id in practice).

## Ranked sync-layer holes Phase 3 must not build on unpatched

1. **No memory-edit resync queue — failed mirror pushes are dropped forever** (`memoryStore.js:584-592`; contrast trips' `tripSyncQueue` + heartbeat `useTrips.js:294-316`). An auto-refile on a flaky/offline device becomes a permanent local-only move that also blocks future pulls of that row (LWW favors the local stamp, `:677`). Highest priority: auto-moves will run in background bursts exactly when networks are worst.
2. **Field-blind 409 reapply makes arrival order decide auto-vs-manual** (`memoryStore.js:845-849` + worker `:894-910`). A late-arriving auto-move overwrites an earlier manual one via conflict "recovery." Phase 3's `stopIdSource` gate must be enforced *inside* the reapply (check `fresh`'s provenance before re-asserting), not only at match time.
3. **Provenance cannot be client-only.** A pull replaces the local record wholesale when remote wins (`mergeFromRemote` `:642-648`; `preserveLocalPhotoMeta` gap-fills only EXIF/poster/interstitial, `:692-732`), and `postMemory` binds an explicit column list (`worker/src/index.js:1048-1120`) while `rowToMemory` emits a fixed shape (`:1279-1414`) — any `stopIdSource` field not round-tripped by the worker is erased on the first sync. It needs a column (next D1 mig = 017 per memory) or a ride-along in an existing JSON column, plus upsert semantics that a stale push can't clear (the `COALESCE` family, `:1087-1099`, is the precedent — but note COALESCE alone can't express "manual beats auto").
4. **LWW timestamps are device wall clocks client-side and arrival time server-side** (`memoryStore.js:841, 677`; `worker/src/index.js:909-910`; string-compare rationale `workerSync.js:257-269`). Clock skew can make a stale device shadow newer edits locally — an already-acknowledged hazard (`memoryStore.js:541-548`). Auto-moves multiply the number of writes exposed to it.
5. **No trips-fresh/memories-fresh ordering hook** (§4). Without one, a re-match can run against a stale agenda or a stale memory set on reconnect — the exact wrong-silent-move scenario.
6. **`updateMemoryStop` reports success from the local write alone**; `refileTripToPlaces`' counts (`refilePlaces.js:71-75`) and the UI toast overstate durability. Phase 3's "moved because…" note must not claim a cross-device move the mirror hasn't confirmed.
7. Minor: `pushMemory`'s parse-miss `return true` fallback (`workerSync.js:379-381`) skips `serverUpdatedAt` capture → spurious 409s → extra blind-reapply cycles (amplifies hole 2).

Positive foundations Phase 3 *can* rely on: the OCC base/409 protocol end-to-end (`worker:894-908`, `memoryStore.js:580-585`), delete tombstones + resurrection guard (`deleteTombstones.js`, `memoryStore.js:618-622`), push-as-author (`workerSync.js:317, 395-397`), masked-projection refusal on both ends (`workerSync.js:302`, `worker:878-880`), and the idempotent no-op in `updateMemoryStop` (`memoryStore.js:840`).
---

## robust-1

All load-bearing facts verified. Report follows.

---

# Convergence, oscillation, and confidence — Phase 3 re-matching analysis

## 1. Determinism verdict

**`matchPhotoToStop` is pure and fully deterministic given identical inputs.** The non-determinism risk lives entirely in how the inputs are *produced*, not in the matcher.

Verified inside `app/src/lib/photoMatch.js`:

- **No clock reads.** No `Date.now()` / `new Date()` anywhere in `photoMatch.js` or `refilePlaces.js` (grep confirmed). Only `Date.parse` of input strings (photoMatch.js:345, 351–352).
- **Day bucketing is UTC-window, confirmed.** photoMatch.js:351–352 builds day windows as `Date.parse(`${isoDate}T00:00:00.000Z`)` … `T23:59:59.999Z` — explicit `Z`, so `Date.parse` is TZ-independent on every device. Same in `parseStopTime` (photoBackfill.js:205) and `parseDayBoundary` (photoBackfill.js:184–190). **Given the same `capturedAt` string, two devices in different TZs bucket identically.**
- **BUT the `capturedAt` string itself is device-TZ-dependent at creation.** EXIF dates carry no zone; `exifDateToDate` parses them as a **local-time** Date (`new Date(+y, +mo-1, +d, +h, +mi, +se)`, exifRead.js:53) and `toIsoString` converts to UTC (photoBackfill.js:93–103; photoPipeline.js:72 `dt.toISOString()`). So the same file imported on a UTC-4 device vs a UTC+1 device produces `capturedAt` strings 5 hours apart — which can cross the UTC day boundary and file to a **different day** (e.g. 8 PM July 4 EDT → `2026-07-05T00:00:00Z` → July 5's stops). The EXIF `OffsetTimeOriginal` IS extracted into `offsetMinutes` (photoBackfill.js:68–81) but **has zero consumers** — grep across `app/src` finds no use outside photoBackfill.js itself. This is the known "TZ fix" parking-lot item. Critically for Phase 3: **once stored, re-matching from the stored string is consistent everywhere**; the TZ skew only bites when two devices independently EXIF-parse the same bytes.
- **Iteration/tie-break order: deterministic.** Day pick iterates `dayIndex.values()` — Map insertion order = `trip.days` array order (photoMatch.js:284, 350), identical on all devices since the trip syncs as one JSON blob. Nearest-stop tie-break is strict `d < best.distance` (photoMatch.js:392) → first stop in `day.stops` order wins an exact tie. `sortedClockStops.sort` (photoMatch.js:297) is stable (ES2019+), ties keep stop-array order. No object-key iteration anywhere on the hot path.
- **Floating point:** haversine (photoMatch.js:20–38) is fixed-order arithmetic; the only theoretical cross-device divergence is that `Math.sin/cos/atan2` are implementation-approximated per the ES spec, so JavaScriptCore vs V8 could differ in the last ulp. That only matters when a distance sits *exactly* at a threshold (150/1000m) — sub-millimeter. Real, but negligible next to the margin gate proposed below.
- `clusterInterstitialPhotos` cluster **ids** depend on input photo order (photoMatch.js:537, 586), but clusters never assign a `stopId` (deviation photos keep `stopId: null`), so this cannot cause stop flapping.
- `isStayTrip`/`stayPlaceCoords`/`tripImplicitBase` are pure functions of the trip JSON (tripShape.js:142–156, 193–210; photoMatch.js:203–226) — no clock, no environment.

**One genuinely non-deterministic *input* across devices:** per-photo GPS does not sync for the bulk-import path. Bulk-imported memories get a single `photoRef` of `{ kind, mime, capturedAt }` — **no lat/lng** (photoBackfillUpload.js:187 `baseRef`, and no `lat` anywhere in that file). Only the composer/dispatch paths write ref-level coords (ThreadedMemories.jsx:176–186), which then ride `photo_r2_keys_json` through sync (worker/src/index.js:929–933, LEG-C; gap-preserved on pull by `preserveLocalPhotoMeta`, memoryStore.js:692–711). Consequence: a Phase-3 re-match of a bulk-imported memory is **GPS-blind on every device including the importer** (GPS existed only in the transient `entry.exif` at import). `refilePlaces.locatedPhotos` already silently skips these (refilePlaces.js:27–33: `Number(r?.lat)` → NaN → excluded). Phase 3 either persists `entry.exif.lat/lng` onto the import ref (a small `baseRef` change) or accepts that the largest memory population can only ever re-match as `'time'` — which under the gate below means *never auto-moved*.

## 2. Oscillation threat list + damping rules

The stored state is only `memory.stopId` (matchType/distanceMeters are **not persisted** — photoBackfillUpload.js:113–137 saves `{stopId, capturedAt, interstitial}`; nothing else from the match record).

**(a) Equidistant photo near the 150m base-yield / 1000m gate.** A photo ~near-equidistant between two specific stops flips winner with any coordinate edit to either stop (re-geocode, manual pin move); a photo at ~150m from a specific stop near a base flips between base and stop as `nearestSpecific.distance` crosses `baseYieldMeters` (photoMatch.js:411–428). Distances are continuous; thresholds are cliffs.
*Damping:* **margin requirement** — auto-move only when the new winner beats both (i) the current stop's distance and (ii) the runner-up, by an absolute margin (e.g. ≥100m or ≥25% of the winner's distance, whichever is larger), and never move when the photo sits within ±margin of the 150m/1000m thresholds. Also: **never move to a worse-or-equal match** — if the currently-filed stop is itself within `gpsMatchMeters` and the new winner isn't closer by the margin, do nothing.

**(b) Agenda edits that ping-pong (time moved, then moved back).** For GPS matches, stop *time* is irrelevant by design (photoMatch.js:374–381 — time is not a gate), so time edits can't flap GPS-filed photos. But `'time'`-matched photos bind to the temporal bracket `before` stop (photoMatch.js:489–503): move a stop's time across a photo's timestamp and back, and the photo's binding flips A→B→A, generating two "moved because…" notes and two sync mirrors per photo.
*Damping:* (1) **debounce/cooldown** — re-match on agenda *settle* (e.g. after the trip push/pull round-trip completes, minimum N minutes between auto-runs per trip), never per keystroke; (2) time-only evidence never auto-moves (see gate policy) — this eliminates the whole class, since GPS matches are time-edit-invariant.

**(c) Implicit base appearing/disappearing.** `tripImplicitBase` returns null unless: stay shape AND located anchor AND no planned located base stop AND (named non-"home" lodging OR multi-day) (photoMatch.js:203–226). Four distinct toggles can create/destroy it: geocoding lodging coords ("Locate this stay"), clearing/renaming lodging to "home" (HOME_LODGING regex, photoMatch.js:168), adding/removing a located `isBase`/lodging stop (`hasPlannedBaseStop`, photoMatch.js:188–195), and flipping `trip.shape`. When it disappears, every memory filed to `__trip_base__:<date>` becomes an **orphan id** (`dayStopIds` no longer contains it, photoMatch.js:243–249) — and a naive re-match run would mass-move them; re-add the base and they mass-move back. Note base priority also *extends 1000m from the anchor* (photoMatch.js:144–148, 411), so a lodging-coords tweak of a few hundred meters can flip many photos between base and a nearby specific stop.
*Damping:* (1) treat implicit-base transitions as a **batch event with its own confirmation-free but throttled semantics**: run once per transition, not continuously; (2) a photo already at a *planned* stop is never auto-pulled onto a base unless the base wins by the margin AND the photo is `stopIdSource:'auto'` (this generalizes refilePlaces' existing "never pulled off a planned stop onto a non-base" rule, refilePlaces.js:9–10, 70); (3) orphaned `__trip_base__` ids are the one case where moving is *always* better than not moving — special-case them as "repair," not "re-match."

**(d) Two devices, different trip versions mid-sync.** Device A has the agenda edit, device B doesn't; both re-match the same memory to different targets. `updateMemoryStop`'s no-op check (memoryStore.js:840) does NOT help here — the targets differ, so both devices write, and memory LWW/OCC means the **later pusher wins regardless of which trip version was fresher**. B then pulls the trip edit, re-matches, moves again → each memory converges only after every device has both the trip and its own re-run; in between, real A→B→A churn is possible, each hop a visible "moved because…" note.
*Damping:* (1) **stamp the trip version into the move** — record `matchedAgainstTripUpdatedAt` alongside `stopIdSource:'auto'`, and refuse to auto-move when the memory's stamp is ≥ the local trip's `updatedAt` (i.e. this device's agenda is not newer than what already decided the filing). Devices with stale trips then keep their hands off. (2) Re-match only *after* a successful trip pull (piggyback on the existing live cross-device pull, `c5bcc58` per memory/), never from a locally-dirty unsynced trip. (3) The no-op guard plus OCC already prevents duplicate rows (see §5); the trip-version stamp prevents the ping-pong.

**Universal rules (all scenarios):** only ever auto-move memories whose `stopIdSource` is `'auto'` or absent-and-unfiled (`stopId: null`); `'manual'` is immovable — this alone bounds every oscillation to the auto population. And a per-memory move **cooldown** (don't auto-move the same memory twice within, say, 24h in opposite directions) converts any residual flap into a one-time move plus a surfaced suggestion.

## 3. The unanimity precedent (refilePlaces.js)

The rule: all *located* photos of a memory must match the same single stopId, else skip (refilePlaces.js:65–68 — `stopIds.size !== 1 → continue`, "photos disagree → don't split a memory"). Note its exact scope: photos without finite coords never enter `photos` (refilePlaces.js:30), and located photos that match *interstitial* (`stopId: null`) are dropped by `.filter(Boolean)` (refilePlaces.js:66) — so an off-stop walk photo doesn't veto; only two photos matched to two *different* stops veto.

**Phase 3 should inherit it unchanged.** The memory is the unit the family sees (whole-memory moves, refilePlaces.js:37–39), and a wrong split is exactly the "wrong silent move" Phase 3 ranks worst.

**Fraction realistically blocked: small, and structurally bounded.** The dominant population — bulk imports — creates **one memory per photo** (photoBackfillUpload.js:112–137, one `makeMemoryId()` per loop entry), so unanimity is vacuous there. Multi-photo memories come from the composer (`photoRefs[]`, ThreadedMemories.jsx:188–196) and E4 "moment" pieces — deliberately composed single-event artifacts. For a veto you need two located photos in one composed moment whose nearest stops differ *and* both clear their gates: e.g. a moment spanning a walk where one shot is ≤150m inside a restaurant (base yields) and another sits on the cabin porch (base claims), or two shots near different stops ≥ a few hundred meters apart. With the 1000m attach radius and base-priority absorbing most of a stay's photos onto one id, disagreement requires a genuinely two-place moment. Expect low single-digit percent of multi-photo memories — and those are precisely the ones a human should file, so "blocked → surface, don't move" is the correct outcome, not a cost.

## 4. Confidence gating

**Computable today, per `matchPhotoToStop` record** (photoMatch.js:333–514):
- `matchType`: `'gps+time'` (GPS-decisive) vs `'time'` (clock-window or stay-default guess) vs `'interstitial'`/`'deviation'`/`'unmatched'` — the single strongest signal, and it is *returned* but **not persisted** on the memory today.
- `distanceMeters`: winner's distance, returned for GPS matches (photoMatch.js:425, 441) and even for interstitials (nearest-stop distance, photoMatch.js:454). Also not persisted.
- Base-vs-specific structure: the single pass already tracks `nearestBase` and `nearestSpecific` separately (photoMatch.js:385–399), so "how contested was the base call" is one comparison away.
- Dwell: `clusterDwellMs` exists for deviation clusters (reconcileDraft.js:150, 170) — cluster-level only, not per stop.

**Needs new plumbing:**
- **Second-best margin**: the loop keeps only the running best (photoMatch.js:392); tracking runner-up distance (and its stop id) is a ~5-line addition. This is the load-bearing gate input and does not exist yet.
- **Persisted provenance**: `stopIdSource` does not exist anywhere yet (grep across app/ and worker/: zero hits) — nor do persisted `matchType`/`distanceMeters`. All three should ride the memory record together (`stopIdSource`, `matchType`, `matchDistanceMeters`, `matchedAgainstTripUpdatedAt`).
- **Ref-level GPS for the import path** (§1) — without it, "GPS-backed" is uncomputable at re-match time for bulk-imported memories.
- GPS accuracy (HDOP) — not extracted by exifRead.js at all; skip it.

**Proposed auto-apply gate (all must hold):**
1. Re-match is `'gps+time'` — never `'time'` (the stay-default at photoMatch.js:471–487 is a *prior*, not evidence; it must not overwrite anything).
2. Current filing is `stopId: null`, orphaned (id not in `dayStopIds` for any day — includes the vanished-implicit-base case), or `stopIdSource:'auto'`. `'manual'` never moves.
3. **Unambiguous margin**: winner beats runner-up by ≥ max(100m, 25%) AND winner's distance clears its threshold by the same margin (no cliff-edge moves).
4. **Whole-memory unanimity** (§3) across located photos.
5. **Fresher agenda than the last decision**: local trip `updatedAt` > memory's `matchedAgainstTripUpdatedAt`, and the trip is pulled-clean (not locally dirty).
6. Not masked (refilePlaces.js:61 precedent) and not moved-in-opposite-direction within the cooldown window.

Everything failing 1/3/4 but passing 2 → **surface as a suggestion** ("these 3 might belong at X"), never auto-move. Everything failing 2 → do nothing silently.

## 5. Idempotency and 4-device convergence

- **`updateMemoryStop` is a confirmed no-op at target**: memoryStore.js:840 `if (list[idx].stopId === stopId) return list[idx]` — returns before any write and before `scheduleMirror`, so an already-converged device generates **zero pushes**. It also refuses masked projections (line 839).
- **Same-target race, 4 devices in 20s**: each device patches locally and pushes with `baseUpdatedAt = serverUpdatedAt` (memoryStore.js:580). The worker enforces OCC — a stale base gets 409 (worker/src/index.js:894–904) — and writes are an upsert by id (`ON CONFLICT(id) DO UPDATE`, worker/src/index.js:1066), so **no duplicate rows are possible**. First push wins; the other three 409 → `resolveSaveConflict` re-pulls the fresh row (which already has the target stopId), re-applies the same `stopId` on top, and re-pushes with the fresh base (memoryStore.js:526–551, reapply at 848). Result: identical final state (same stopId) on server and all devices; cost is up to 4 pushes + up to 3 conflict re-push cycles of *content-identical* writes, each bumping `updated_at` (harmless churn — subsequent pulls LWW-adopt the same stopId). Retries cap at `MIRROR_CONFLICT_RETRIES = 2` (memoryStore.js:516) with a no-island fallback that adopts the server row (memoryStore.js:557). **Convergent, duplicate-free, mildly chatty.** A cheap improvement for Phase 3's batch runs: make the reapply a no-op (skip the push) when `fresh.stopId` already equals the target — today it re-pushes anyway (memoryStore.js:848 unconditionally restamps).
- **Different-target race** (divergent trip versions): converges only via LWW to the *last* pusher, not the best-informed one — this is threat 2(d); the trip-version stamp in §2(d) is the fix.

## Bottom line

The matcher itself will settle: it is a pure, deterministic function, and same-target concurrent application is convergent and duplicate-free. The instability lives in three places the plan must address before auto-apply: (1) the inputs — per-photo GPS is not persisted for bulk imports (photoBackfillUpload.js:187) and `capturedAt` is import-device-TZ-skewed with the EXIF offset extracted but unused (exifRead.js:53, photoBackfill.js:71–81); (2) threshold cliffs with no margin or runner-up tracking (photoMatch.js:392) — add second-best tracking and a beat-by-margin rule; (3) cross-device races against divergent trip versions — add `matchedAgainstTripUpdatedAt` next to `stopIdSource` and only act on pulled-clean, strictly-newer agendas. With the gate policy in §4 (GPS-only, margin-cleared, auto-or-unfiled-only, unanimous, cooldown), every enumerated oscillation is either eliminated (time-edit flaps, manual overwrites) or bounded to a single move plus a surfaced suggestion.
---

## robust-2

All findings below are from live source on branch `fix/foolproof-video-import` (repo `/Users/jjackson/dev/roadtrip`). Line numbers verified this session.

# Consumers of a MEMORY's stopId — what breaks when it changes after import

## 0. The mutation path itself (context for everything below)

- `updateMemoryStop(memoryId, stopId)` — `app/src/lib/memoryStore.js:833-859`. Patches the single field, refuses masked projections (`:839`), mirrors with OCC base (`:845-849` via `scheduleMirror` → `pushMemory` with `baseUpdatedAt`, `memoryStore.js:580`).
- **CONFIRMED HAZARD — conflict reapply is provenance-blind:** the `reapply` closure (`memoryStore.js:848`) stamps the stopId unconditionally onto the *fresh* server row inside `resolveSaveConflict` (`memoryStore.js:526-558`). If an auto-move 409s because a *manual* move landed in between, recovery re-applies the auto stopId on top of the manual one and pushes. The planned `stopIdSource` guard must live inside this reapply (read the fresh row's provenance), not just at move-decision time.
- **CONFIRMED HAZARD — no memory-change event bus.** There is no dispatch/subscription for memory writes (grep of `memoryStore.js`/`workerSync.js` for events: none). Views re-read via memoized deps that do NOT include memory state: PhotosView/AllPhotosView use a local `memoryTick` bumped only by their own import flows (`PhotosView.jsx:40-53`, `AllPhotosView.jsx:79-83`); LivingHeartHome `[trip.id, traveler]` (`LivingHeartHome.jsx:284`); TripIndex `[traveler, trips.length]` (`TripIndex.jsx:66-90`); RafaMap `[trip, traveler]` (`RafaMap.jsx:130-140`); PersonView `[trip, trips, traveler]` (`PersonView.jsx:100-113`). A background auto-move (or one arriving via `mergeFromRemote`, `App.jsx:456`) is invisible until remount/navigation. **An invalidation hook is REQUIRED for the move — and its "moved because…" note — to be visible at all.**
- **CONFIRMED HAZARD — outbox snapshots revert moves.** Upload-queue items snapshot `stopId` at enqueue (`photoBackfillUpload.js:225, 341`); the drain re-saves the whole memory with `item.stopId` (`App.jsx:206-211`, `PhotosView.jsx:221-230`). `saveMemory` has NO preserve-on-undefined semantics for stopId (it's written verbatim into the record, `memoryStore.js:295-298` — unlike `capturedAt`/`interstitial`/mask which do preserve, `:176-293`). A video stuck in the outbox for hours will silently revert a Phase 3 move when it drains.
- **Provenance flag needs schema work:** memories are column-mapped, not a JSON blob — the worker upsert has a fixed column list (`worker/src/index.js:1050-1103`) and `rowToMemory` rebuilds from an allowlist (`:1360-1400`). An arbitrary `stopIdSource` field will NOT round-trip; it needs a D1 column (next mig = 017) or must ride an existing JSON column.

## 1. interstitial_json ({before, after} brackets)

- **Writers:** import reconcile assigns `photoBindings[pid] = null` + `photoInterstitials[pid] = {before, after}` from the bucket's bounding stop ids (`reconcileApply.js:131-143`); persisted via `photoBackfillUpload.js:135`; preserved-on-undefined by `saveMemory` (`memoryStore.js:197-212`).
- **The ONLY on-screen reader:** `groupByStop` (`photoEntries.js:265-292`), and only when `entry.stopId` is null — "A real stopId always wins" (`photoEntries.js:265-272`). Labels/positions are re-derived from the CURRENT trip at every render via `interstitialCtx` (`photoEntries.js:231-261`).
- **Late-change behavior:**
  - Auto-refile assigns a stopId to an interstitial memory → the bracket is silently ignored (stop wins). No on-screen contradiction, but the "From A to B" identity is dormant, not gone.
  - Auto-refile sets stopId back to null (e.g. the target stop was deleted) → a possibly-years-stale bracket resurrects and governs placement. If bracket stops were deleted/renamed by the agenda edit, the section degrades to "Before X" / "After X" / "In transit" and sorts to day 99 at the album's end (`photoEntries.js:237-260`) — that IS the visible contradiction.
  - **The server can never clear a bracket:** `interstitial_json = COALESCE(excluded…, memories…)` (`worker/src/index.js:1093`) — a null push preserves the stored value. A Phase 3 re-file that wants to genuinely retire a bracket cannot do it through the normal push.
- Risk: MEDIUM. An honest move of an interstitial memory should also rewrite (or explicitly clear — currently impossible server-side) the bracket.

## 2. Surprises / masking

- Both projections PRESERVE stopId: client `coverStandIn` (`app/src/lib/surprises.js:191`, comment: "so downstream React keys + stop grouping stay stable"); worker `teaserStub` (`worker/src/surprises.js:34`) and `coverStandIn` (`:56`), both `masked:true` (`:43, :74`).
- **Move of a hidden memory (run author-side):** propagates to the recipient on next pull as a moved projection. A *teaser* never stop-groups in normal reads (dropped by `maskForViewer`, `memoryStore.js:87`; shown only as a blurred card on the Surprises screen) — no placement leak. A *cover* DOES group under its stopId in the recipient's album — it visibly jumps stops with no explanation. And because both projections copy an enumerated field allowlist, a new "moved because…" note field would be STRIPPED from the projection automatically (safe against leaking the reason, but it means cover moves are unavoidably silent for the hidden-from viewer — a policy decision to make explicitly).
- **Flip side — can a masked-viewing device corrupt the real row?** Three guards for pushes: `updateMemoryStop` skips `list[idx].masked` (`memoryStore.js:839`); `pushMemory` returns null for `memory.masked` (`workerSync.js:297-302`); worker `postMemory` refuses `body.masked` (`worker/src/index.js:874-879`). `resolveSaveConflict` also bails on a masked fresh row (`memoryStore.js:535`). BUT there is a gap for Phase 3: on a persona-switched device (real rows local, re-viewed as the hidden-from person), the **client** `coverStandIn` sets `isCover:true` but NOT `masked:true` (`app/src/lib/surprises.js:186-216` — no masked field). `refileTripToPlaces` iterates the masked read and its `m?.masked` skip (`refilePlaces.js:61`) does NOT catch a client cover stand-in; today it's saved only because a text cover has no located photos (`refilePlaces.js:62-63`). `updateMemoryStop` then patches the RAW (unmasked) local record by id. **A Phase 3 matcher that uses time-only signals could move the real memory based on the cover's fabricated identity.** Requirement: Phase 3 must run over RAW records (or skip `isCover` + `isMaskedFrom` items explicitly), ideally author-device-only for surprises.
- **Weave secrecy interlock (nasty):** `secretWeaveDaySet` maps a hidden memory's `stop_id` via `trip.days` stops only; unmappable → the WHOLE trip's stored weaves are withheld (`worker/src/weaveGen.js:144-165`, fails closed per `:91-92`). An auto-refile of a hidden memory to an **implicit-base id** (which never appears in `trip.days`) — exactly what `refilePlaces` does for normal memories — would blank every stored weave page for the trip. Equally, an agenda edit that deletes a stop holding a hidden memory does this today; self-healing must re-file hidden memories to REAL stops or leave them alone.
- Risk: HIGH (the implicit-base × hidden-memory × weave interaction; the cover-identity refile gap).

## 3. Share-out (migs 011/012)

- `shares` stores `memory_id, trip_id` only — no stop (`worker/src/index.js:1188-1190`). Token slug bakes in the mint-time stop name (`:1186`) — cosmetic only.
- Resolve re-derives everything LIVE per view: `shareViewFromMemory` sets `place: findStopName(trip, memory.stopId)` (`worker/src/share.js:260, :75-83`) → **an already-published page's place caption silently changes after a move.**
- `isShareable` re-checks at resolve against the CURRENT stopId (`share.js:33-51`; stop-surprise check `:40-48`): auto-moving a shared memory ONTO an unrevealed surprise stop makes the public link stop resolving (`not-shareable` 409, `index.js:1183-1185`); moving it off re-enables it. Deliberate design for became-secret, but an auto-move can now flip a family's live link without anyone acting.
- Risk: MEDIUM. A "moved because…" surface should note when a move re-labels or disables a live share.

## 4. Replay / REEL / "Looking back"

- ReplayView: sequence ORDER is by capturedAt, not stop (`ReplayView.jsx:234-243`) — a move never reorders playback. stopId feeds only the "Day N · Stop" chip (`:253-275, :454`), day-picker anchors (`:281-291`), initial cursor (`:297-303`), and which day's weave to fetch (`:319-321`). A memory whose new stopId isn't in any day's `dayStopIds` loses its chip and drops out of day-jump anchors. Mid-viewing it only shifts if a re-render recomputes `hydratedMems`; no subscription exists, so typically stable until reopen. Risk: LOW.
- `pickResurface` filters photos by `dayStopIds(trip, day).has(m.stopId)` (`resurface.js:46-47`): moves change which days qualify and photo counts, silently, on the next daily rotation. A stale stopId (deleted stop) removes those photos from resurfacing entirely. Risk: LOW-MEDIUM (silent history rewrite, but self-consistent).

## 5. The Record

- **No coupling.** `dayRecord.js` entries carry their own id/name/time; the only memory linkage is `pending` voice-memo IDs (pointers, no stopId — `dayRecord.js:83-88, 283-297`). `evidence.js` and `SettleSheet.jsx` have zero `stopId` references (grep clean). Risk: NONE.

## 6. photoEntries.groupByStop + album views

- Pure functions, fully re-derived per call: `flattenPhotoEntries` copies `m.stopId` (`photoEntries.js:76`); `groupByStop` buckets by it, unknown/stale id → "Unfiled" group sorted to day 99 (`photoEntries.js:295-331, :304, :319`). No hidden caches inside the lib.
- The staleness is in the CALLERS' memoization (§0): PhotosView/AllPhotosView (`memoryTick`), PersonView face-index entries, RafaMap sticker counts, LivingHeartHome "N ENTRIES" per agenda row (`LivingHeartHome.jsx:339-343`), TripIndex hero photo — `mems.find((m) => m.stopId === t.heroStopId)` (`TripIndex.jsx:74-76`): a move off the heroStopId swaps the trip card's cover photo at next recompute, silently.
- `ThreadedMemories` reads `listMemoriesForStop(stop.id)` (`ThreadedMemories.jsx:32, :61`, store at `memoryStore.js:91-96`): a moved memory vanishes from the old stop's thread and appears in the new one with no trace — a "moved because…" placeholder/note is REQUIRED here for honesty.
- Risk: MEDIUM (honesty + staleness, not corruption).

## 7. Weave — client vs worker day-membership: **THEY DO NOT MATCH**

- Client: `buildBeats` / `selectWeaveDay(ForTrip)` use `dayStopIds` = planned stops PLUS the per-day implicit base id (`weave.js:24-26, :80-81, :97-99`; `photoMatch.js:243-249`). TheWeave.jsx computes beats this way (`TheWeave.jsx:194-197`).
- Worker: `buildBeatsServer` uses `new Set((day.stops||[]).map(s=>s.id))` — planned stops ONLY (`weaveGen.js:182-184`), same in `dayHasSharedMemory` (`weaveGen.js:306-308`) and the `/weave/latest` staleness signature check (`worker/src/index.js:3253-3280`).
- Consequence for Phase 3: a re-file to/from the implicit base ("At the cabin") changes the client-rendered beats but neither enters the nightly weave nor invalidates the stored signature → stored narrative and on-screen beats drift, with no 204 fallback. Moves between PLANNED stops on the same day don't change beats at all (membership-based); cross-day planned moves DO change the signature → `/weave/latest` 204s → client rebuilds (this is the round-1 finding, confirmed, `index.js:3261-3280`). Risk: MEDIUM (divergence pre-exists; auto-refile to base makes it routine).

## 8. Worker: other readers of memories.stop_id

Complete list of `FROM memories` sites (`worker/src/index.js:853, 899, 983, 1123, 1146, 3262, 4597` + `weaveGen.js:152, 285`):
- `getMemories` sync read (`:853`, masked per viewer `:863`) — passthrough.
- Push guards (`:899, :983`) — no stop_id reads.
- Share mint (`:1123`) + share resolve (`:1146`) — §3.
- `/weave/latest` signature (`:3262`) and nightly weave (`weaveGen.js:285`) — §7.
- Weave secrecy `secretWeaveDaySet` (`weaveGen.js:152`) — §2.
- `loadTripsSummary` Claude counts (`:4597`) — trip_id only, no stop_id.
- Claude trip-context `[stopId]` lines (`:4731`) are TRIP stops, not memory stopIds. `/diag/trips` (`:143-170`) reads trips only. **No other server-side memory-stop_id reader found.**

## Inventory table

| # | Consumer | file:line | On late stopId change | Risk | Note/hook required? |
|---|----------|-----------|----------------------|------|---------------------|
| 1 | updateMemoryStop 409-reapply | memoryStore.js:848, 526-558 | Auto re-clobbers an interleaved manual move | **HIGH** | provenance check inside reapply |
| 2 | Upload outbox drain | App.jsx:206-211; PhotosView.jsx:221-230; photoBackfillUpload.js:225,341 | Drain re-saves snapshot stopId → reverts the move | **HIGH** | merge stopId, don't snapshot |
| 3 | Phase-3 matcher vs client cover stand-in | surprises.js:186-216 (no masked flag); refilePlaces.js:61 | Time-based matcher could move REAL row off cover identity | **HIGH** | operate on raw records / skip isCover |
| 4 | Weave secrecy fail-closed | weaveGen.js:144-165 | Hidden memory re-filed to implicit-base id (or left on deleted stop) → ALL stored weaves for trip withheld | **HIGH** | never auto-file hidden memories to non-trip.days ids |
| 5 | Cover recipient's album | worker/surprises.js:56; groupByStop | Cover visibly jumps stops, note field stripped by projection allowlist | MED | explicit policy decision |
| 6 | Share page place + gate | share.js:260, 33-51; index.js:1183-1190 | Published caption changes; link can 409 if moved onto unrevealed surprise stop | MED | surface in "moved because…" |
| 7 | Interstitial bracket | photoEntries.js:265-292; index.js:1093 (COALESCE) | Stop wins/bracket dormant; null-refile resurrects stale bracket; server can't clear | MED | rewrite/clear bracket on move (needs worker change to clear) |
| 8 | ThreadedMemories stop thread | ThreadedMemories.jsx:32,61 | Memory silently vanishes from old stop's thread | MED | "moved because…" REQUIRED |
| 9 | Album grouping + staleness | photoEntries.js:295-331; PhotosView.jsx:49-53; AllPhotosView.jsx:79-96 | Correct on recompute; invisible until memoryTick/remount | MED | invalidation hook REQUIRED |
| 10 | TripIndex hero photo | TripIndex.jsx:74-76 | Trip card cover silently swaps | MED-LOW | note optional; invalidation |
| 11 | Client weave beats vs stored | weave.js:97-99 vs weaveGen.js:182-184, index.js:3253-3280 | Planned-stop cross-day move → 204/rebuild (good); implicit-base move → silent drift, no invalidation | MED | align membership or extend signature |
| 12 | LivingHeartHome "N ENTRIES" | LivingHeartHome.jsx:284,339-343 | Stale counts until remount | LOW-MED | invalidation |
| 13 | Resurface "Looking back" | resurface.js:46-47 | Day candidates/photo counts shift silently next rotation | LOW-MED | none (self-consistent) |
| 14 | ReplayView chip/day anchors | ReplayView.jsx:253-321,454 | Chip/day-jump follows; order unchanged (capturedAt) | LOW | none |
| 15 | RafaMap sticker counts / PersonView face entries | RafaMap.jsx:130-140; PersonView.jsx:100-113 | Stale until deps change | LOW | invalidation nice-to-have |
| 16 | Surprises wrap-picker place label | surprises.js:104-116 | Live label, follows move | LOW | none |
| 17 | The Record / SettleSheet / evidence | dayRecord.js (all) | No coupling | NONE | none |
| 18 | Worker getMemories/trip summary/diag | index.js:853,4597,143 | Passthrough / no stop read | NONE | none |

## Additional Phase-3-relevant facts
- Refile precedent already exists and is the template: `refileTripToPlaces` (`refilePlaces.js:53-76`) — conservative (all located photos must agree, never splits, base-target only), rides `updateMemoryStop`.
- A viewer's device cannot see memories hidden from them (teasers dropped at `memoryStore.js:87`; the worker never sends real rows), so self-healing runs per-device will produce per-device coverage gaps for surprises — inconsistency, not corruption.
- `shouldTakeRemote` LWW (`memoryStore.js:668-680`) means the auto-move's device-clock `updatedAt` competes with other edits; the OCC base + 409 path is what actually protects, hence the reapply fix in row 1 is load-bearing.
---

## robust-3

All claims below re-derived from the live tree at HEAD `06656ef` (branch `fix/foolproof-video-import`). Read-only; nothing modified.

# Phase 3 research: re-match triggers + write authority

## 1. Trip/agenda change paths (trigger-point inventory)

Every client-side trip write funnels through **one choke point**: `useTrips.upsertTrip` (app/src/hooks/useTrips.js:173–228), which writes the local cache synchronously (:174–181) then `pushTrip`s to the worker. The only other client caller of `pushTrip` is the resync loop inside the same hook (:258). Server-side, every device's push lands in **`postTrip`** (worker/src/index.js:1501). Inventory:

| Path | Where | Funnels through | Hookable? |
|---|---|---|---|
| TripEditor edits (all fields, incl. `moveStop` :275, `removeStop` :285, stop add/update) | app/src/views/TripEditor.jsx — debounce `flush` → `tripsApi.upsertTrip` :156, unmount flush :183 | upsertTrip | Yes — but no need to hook here individually |
| Claude-card applies | `applyCardToTrip` (app/src/lib/claudeCardApply.js:407, pure) applied at app/src/App.jsx:963–964 → upsertTrip; delete_trip → removeTrip :946 | upsertTrip | Yes |
| Claude create_trip | App.jsx:1103–1135 (`handleClaudeCreateTrip` → upsertTrip :1134) | upsertTrip | Yes |
| Manual NewTrip create | App.jsx:1229 | upsertTrip | Yes |
| Draft publish | App.jsx:1739 | upsertTrip | Yes |
| Share-in import record | App.jsx:894–900 | upsertTrip | Yes (doesn't touch stops) |
| Record keep/stamp/pending-note | App.jsx:1019–1020, 1032–1033, 1043–1044 | upsertTrip | Yes (day-record only, not stops) |
| **Auto-locate on create** (stay lodging + composite legs) | App.jsx:978–988 (`locateTripBestEffort`), :1070–1081 (`locatePartsBestEffort`), invoked :1118–1127 | upsertTrip | Yes — and it changes `trip.lodging.lat/lng`, which changes the implicit base (photoMatch.js:203–226) |
| **"Locate this stay" / "Locate this leg"** | App.jsx:1048–1062 (`onLocateStay`), :1087–1101 (`onLocateLeg`); editor-side lodging geocode TripEditor.jsx:1633–1664 | upsertTrip | Yes — the exact case refilePlaces was built for |
| Photo-import reconciliation (auto-added deviation stops etc.) | ImportFlow.jsx:193 + :314; PhotoBackfillTriage.jsx:298 (`applyReconciliation` output → upsertTrip) | upsertTrip | Yes |
| **Phase-1 heartbeat pull landing a remote edit** | useTrips.js `refresh()` — `writeCache(merged)` + `setTrips(merged)` :143–144, fired on mount/online/visibility/20s interval :294–316 (`TRIP_RESYNC_INTERVAL_MS` :40) | **not** upsertTrip — replaces the whole array | Hookable at :143, but wholesale (see §3) |
| **Worker-side writes that never pass through any client hook**: cron date-reveal of a whole-trip surprise (`runScheduledTripReveals`, worker/src/index.js:461–474), trip-hero resolution (`UPDATE trips` :1826), heroMiss marker :1652 (deliberately no updated_at bump) | worker only | postTrip is NOT in this path | Only a worker-side or signature-compare trigger sees these |

Hookability summary: a client "trip changed" hook has exactly **two** attach points that cover everything the client does — `upsertTrip` and `refresh()`'s merge. A worker "trip changed" hook has **one** for all device-originated writes — `postTrip` (:1501, single `INSERT … ON CONFLICT` :1567) — plus the two cron/hero mutators above.

## 2. Photo-side change paths

- **Import completion**: ImportFlow.jsx:191 runs `matchPhotosToStops` once; per-item `stopId` computed :214–218; saved via `uploadBackfillPhotos` → `saveMemory({ stopId … })` (app/src/lib/photoBackfillUpload.js:72–73, :92–118). Same for triage: PhotoBackfillTriage.jsx:174 (match), :262–305 (`handleSave` → upsertTrip + uploadBackfillPhotos). This is the "matching runs ONCE" moment.
- **Backfill triage completion**: PhotoBackfillTriage.jsx:298 — same save path, with manual `photoBindings` overriding the matcher (:272–274). **These are human decisions — the future `stopIdSource:'manual'` cases.**
- **Capture-date edit**: `updateMemoryCapturedAt` (app/src/lib/memoryStore.js:758–794) — changes the date the matcher files by; a re-match trigger candidate.
- **Re-file**: `updateMemoryStop` (memoryStore.js:833–859) — the existing single-field move: idempotent (:840), refuses masked (:839), mirrors with OCC base + 409 re-apply of just `stopId` (:845–849 → scheduleMirror :580, `resolveSaveConflict` :526). Only caller today: `refileTripToPlaces` (app/src/lib/refilePlaces.js:73), a **deliberate one-tap, conservative re-match** (unanimity rule :65–70 — every located photo must agree, never pulled off a planned stop) surfaced in PhotosView.jsx:73/:140. **This is the Phase-3 prototype in miniature.**
- **Remote memory changes landing**: App.jsx `runSync` (:449–457) → `pullAll` → `mergeFromRemote` (memoryStore.js:600–658, LWW by updatedAt :677) — another device's move/edit arrives here.
- **GPS backfill**: none exists (grep for gpsBackfill/backfillGps: empty). The closest thing is pull-side gap-fill `preserveLocalPhotoMeta` (memoryStore.js:692–732) and poster retry `updateMemoryPoster` (:865) — neither changes stopId.

## 3. Detection vs event

The heartbeat pull replaces the trips array wholesale (useTrips.js:144) — no per-trip diff exists anywhere today. Precedents for changed-detection:

- **`beatSignature`** (worker/src/weaveGen.js:237–242): sorted `who:kind:snippet` join; nightly run skips Claude+write when signature unchanged (:318–326); and — the closest precedent to Phase 3 — **`8f07199` added a compare-on-READ**: `/weave/latest` recomputes the current signature and 204s when stale (worker/src/index.js:3252–3282). Detection by signature-compare, not by eventing every write path.
- **`arrivalSignature`** (app/src/lib/legArrival.js:14–17 + localStorage seen-set :19–47): pure signature + per-trip "seen" store — the client-side fire-once pattern.

A **per-trip stops-signature** mirroring these is straightforward and matcher-shaped: hash exactly the fields the matcher reads — per day: stop `id/lat/lng/time/isBase/kind/baseRadiusMeters` (photoMatch.js:130–148, :271–323), plus `lodging.lat/lng/name`, `homeBase`, day `lodging` strings and `isoDate`s (inputs to `tripImplicitBase` :203–226 and `isHomeDay` :233), plus the shape inputs (tripShape.js `isStayTrip`). Compare against a stored last-matched signature per trip; only a mismatch re-runs matching. This works identically whether the compare runs client-side after `setTrips(merged)` or worker-side in `postTrip`/cron — and it inherently answers "WHICH trip changed" without diffing: one cheap string per trip per pull.

## 4. Authority

**Ground truth on namespacing/permissions first:**
- Local: memories live in `rt_memories_shared_v1` + `rt_memories_private_${traveler}_v1` (memoryStore.js:41–42). A device holds **all shared memories + only its own traveler's private ones** — the worker read enforces it: `WHERE visibility='shared' OR author_traveler = ?` (worker/src/index.js:849–857). Shared memories hidden-from this traveler arrive as **masked stubs** (:858–864), and every client patch function refuses `masked` targets (memoryStore.js:839 etc.).
- **Can device A re-file device B's shared memory today? Yes.** `postMemory` accepts any authenticated traveler updating any row: `stop_id = excluded.stop_id` on conflict (worker/src/index.js:1068), author immutable (:1071–1077), author stamped from the token on insert (:1105–1109), gated only by opt-in OCC (`baseUpdatedAt` → 409, :894–908). Device B's **private** memories, however, are physically absent from device A.

**Options:**

**(a) Any-device-with-guards.** The machinery mostly exists: `updateMemoryStop` is idempotent, OCC-based, and its 409 recovery re-applies only `stopId` onto the fresh row (memoryStore.js:845–849, :526–558) — concurrent movers computing the *same* answer converge. The killer problem: **devices don't see the same inputs.** A traveler hidden-from a surprise stop gets a stub/cover instead of the real stop (surprises masking, index.js:858–864; trip-side `maskTripStops`), so their matcher would compute "no stop here" and could silently move a correctly-filed photo OFF a hidden stop — exactly the wrong-silent-move Phase 3 must not make. Plus masked memories are unpatchable on that device, plus 4 devices redundantly re-matching every trip on every pull. Convergence guards don't fix divergent inputs.

**(b) Author's-device-only.** Covers private memories (only place they exist), but bulk imports make the importer the author of the whole family batch — so this degenerates into (c), and an away/offline authoring device strands the re-match indefinitely. Nothing in the code distinguishes "the device that imported" today.

**(c) Designated matcher device.** No precedent in the codebase for device-level roles; would need new coordination state, and inherits (b)'s offline-stranding.

**(d) Worker-side matching.** Assessed seriously — the data is there:
- Trip agenda: full `data_json` blob stored verbatim (postTrip :1584), already parsed server-side by the weave (weaveGen.js:258–266) and the regen check (index.js:3255–3258) — days, stops, coords, lodging all available.
- Photo GPS/dates: per-ref `lat/lng/capturedAt` persisted in `photo_r2_keys_json` (photoEntry, index.js:929–940; single-photo mirror :975–985) and re-emitted by rowToMemory (:1323). Confirmed round 1.
- Sees **everything**: all four travelers' private rows, unmasked surprise rows, `stop_id` — no masking blind spot, no missing-private-bucket gap.
- Single-writer by construction: `INSERT INTO memories`/`UPDATE memories` exist in exactly three places (postMemory :1049, deleteMemory :1137, cron reveals :443).
- Propagation back is free: bumping `updated_at` makes the next 20s heartbeat (`runSync` App.jsx:449–457 + `mergeFromRemote` LWW) deliver the move + note to every device; a device holding an in-flight edit converges via the existing 409→re-apply path.

What the worker **lacks today**:
1. The matcher itself — client-side JS. Purity check: photoMatch.js is deliberately pure ("no network, no DOM, no IndexedDB", :10–13). Its imports: `tripShape.js` (zero imports — fully pure, mirrorable as-is) and `parseStopTime` from `photoBackfill.js` (:15) — photoBackfill.js statically imports exifRead.js (:17), whose ExifReader load is a *dynamic* import (exifRead.js:21–22), so it wouldn't hard-break a worker bundle, but the clean move is extracting `parseStopTime` (photoBackfill.js:201, itself pure) rather than dragging photoBackfill into the worker.
2. A memory-level `captured_at` column — **does not exist** (postMemory column list :1050–1056; grep confirms no `captured_at` anywhere in worker/src or migrations). The client's top-level `capturedAt` never round-trips. Not fatal: `refileTripToPlaces` already matches from **per-ref** coords+dates only (refilePlaces.js:20–35, requiring finite lat/lng), and refs with GPS almost always carry their own capturedAt (photoEntry writes both). But it narrows the fallback refilePlaces.js:29 uses.
3. Schema: `stop_id_source` (provenance) + a "moved because…" note field → a migration. Per memory, **next D1 migration number is 017**.
4. A trigger that also covers the non-postTrip mutators: cron trip-reveals (:461) can un-hide a stop and thereby change the correct filing — a postTrip-only hook misses that; a stored stops-signature compared in postTrip AND in the existing cron (the weave-regen pattern) covers all writers by construction.

## 5. The mirrored-lib precedent (surprises.js)

**It is not a copy, a shared file, or a build step.** app/src/lib/surprises.js (686 lines, client UX + display helpers) and worker/src/surprises.js (451 lines, "the mirror of app/src/lib/surprises.js, and the real security boundary" — worker/src/surprises.js:3–6) are **two hand-maintained files sharing a semantic contract**, with overlapping-but-different export sets (client has ~40 exports incl. display helpers; worker has 17, incl. worker-only `preserveHiddenStops`/`preserveHiddenParts`). Drift is guarded only by parallel test suites (worker/test/stop-surprise.test.js:43 "pure worker mirror", memory-surprises/trip-surprise/part-surprise tests) — **no automated parity check exists**. It has held because the masking contract is small and settled. photoMatch.js is a better mirroring candidate than surprises.js was: it's already pure, self-contained, and — crucially — if the worker becomes the *only* re-matcher, most client call sites can eventually stop needing the full matcher (import-time first-guess can stay client-side or also move), reducing the mirror to a transition state rather than a permanent dual maintenance burden. The realistic hazard is `MATCH_THRESHOLDS` tuning (photoMatch.js:101–120 — tuned twice already per its comments) drifting between copies; a shared-fixture parity test (same photos+trip → same stopIds, run in both suites) is the missing guard and is cheap since both are pure.

## 6. Recommendation

**Worker-side re-matching (option d), triggered by a stored per-trip stops-signature compared in `postTrip` and in the existing cron — not by instrumenting client write paths.**

Reasoning, grounded above:
- **Robustness is the stated top priority, and (a)–(c) all have a wrong-move or stranded-move failure mode**: any-device matches against masked/partial views (the silent wrong move); author/importer-device strands re-matches on an absent device. The worker sees the true agenda, all private rows, and is the single memory writer already — concurrency disappears by construction rather than by guards.
- **The trigger inventory collapses server-side.** Client-side you must cover upsertTrip + refresh-merge + know the cron mutators exist anyway; worker-side, `postTrip` catches every device's every trip write in one place, and a signature check in the scheduled path (exactly the `8f07199` weave pattern, index.js:3252–3282) catches cron reveals. Signature-compare also gives per-trip change detection for free (§3), answering "which trip" without a diff engine.
- **The propagation story already exists**: updated_at bump → 20s heartbeat pull → `mergeFromRemote` LWW, with the 409/OCC machinery protecting in-flight client edits.
- **Costs, stated honestly**: mirror photoMatch.js + tripShape.js + extracted parseStopTime into worker/src (add the shared-fixture parity test the surprises mirror never got); migration 017-or-later for `stop_id_source` + move-note; accept that memory-level capturedAt doesn't exist server-side (match from per-ref data, as refilePlaces already does — and adopt its unanimity + never-off-a-manual-stop conservatism as the move rule, now gated by `stopIdSource !== 'manual'`); worker moves should be guarded targeted updates (compare stored `updated_at`) so an auto-move can't clobber a simultaneous client push.
- **Provenance plumbing note**: `postMemory` currently takes `stop_id = excluded.stop_id` from any client body (:1068) — Phase 3 must define whether a plain client re-save resets `stop_id_source` (it should: a human placing = 'manual'; the triage `photoBindings` path PhotoBackfillTriage.jsx:272 is 'manual', the matcher path ImportFlow.jsx:217 is 'auto').

Key files: app/src/hooks/useTrips.js, app/src/App.jsx, app/src/views/TripEditor.jsx, app/src/lib/photoMatch.js, app/src/lib/refilePlaces.js, app/src/lib/memoryStore.js, app/src/lib/tripShape.js, app/src/lib/photoBackfill.js, app/src/components/ImportFlow.jsx, app/src/components/PhotoBackfillTriage.jsx, app/src/lib/photoBackfillUpload.js, app/src/lib/legArrival.js, worker/src/index.js, worker/src/weaveGen.js, worker/src/surprises.js, app/src/lib/surprises.js.
---

## robust-4

**PHASE 3 UI-PRECEDENT REPORT — "moved because…" note + unfiled triage (all paths under /Users/jjackson/dev/roadtrip)**

---

## 1. Inventory of existing "something happened / is happening" affordances

| Affordance | Location | Pattern | Transient vs persistent | Local vs synced | Dismissible |
|---|---|---|---|---|---|
| "N deletes still confirming…" | `app/src/views/TripIndex.jsx:186-203` (note render, `data-testid="pending-deletes-note"`); state from `app/src/lib/deleteTombstones.js:16` (localStorage `rt_delete_tombstones_v1`) + `subscribePendingDeletes` (TripIndex.jsx:37-38) | Mono 10.5px muted line + spinner, tucked under the page subtitle; comment at TripIndex.jsx:31-36 explains the placement logic ("the one place that's always open") | Persistent-until-resolved — cleared only when the server confirms (deleteTombstones.js:1-14) | **Local-only** (per-device tombstones) | No — it disappears itself |
| SaveBadge / honest "Saved ✓" | `app/src/views/TripEditor.jsx:734-752` (component), rendered at 514 | 5 states: idle / saving / `saved` ("Saved · synced") / `saved-unsynced` ("Saved", no false "synced") / error ("Saved locally · sync failed"). Driven by the honest per-item sync result, never `res.ok` (App.jsx:945 comment; agreement in `memory-sync-lww` note) | Persistent status readout | Local render of a synced outcome | No — state-reflecting |
| Per-lens sync pill | `app/src/views/PhotosView.jsx:441-488` (`SyncPill`, `data-testid="sync-pill"`), fed by the IndexedDB upload-queue subscription at PhotosView.jsx:148-179 | Header pill; amber (`--kept`, never red) when stuck; tap = drain now (an action, not a dismiss). Rafa's stuck folds into calm "saving…" (443-448) | Persistent until the queue empties | **Device-local** (the outbox is per-device) | No |
| "on its way" / "stuck" tile chips | `app/src/components/PhotoAlbum.jsx:204-302`: veil 207-219, duration chip 221-225, size chip 227-231, "on its way" 233-255, stuck overlay 259-287 + amber corner dot 289-291, Rafa "saving…" 293-302; chip primitive `TileChip` 449-468 | State chips ON the photo tile itself; live queue signal with `entry.pending` fallback from the synced ref (PhotoAlbum.jsx:71-72, photoEntries.js:121-124); tap-stuck = retry | Persistent until upload resolves | Mostly device-local; `pending` flag rides the ref | No |
| Refile-offer two-step banner | `app/src/views/PhotosView.jsx:364-397` (`refile-to-places` / `refile-offer` / `refile-confirm` / `refile-cancel`); apply at 139-146 → `refilePlaces.js:73` → `updateMemoryStop` | Card above the photo groups: offer sentence → confirm step that says **"Everyone will see the change."** → Move / Not now. Two-step per Jonathan's explicit rule (PhotosView.jsx:77-78) | Persistent while candidates exist — it's **derived from data** (dry-run count at 72-76), so it self-resolves and re-appears identically on every device | Effectively cross-device (same derivation everywhere) | "Not now" collapses to the offer; no permanent dismiss |
| Import toast | `app/src/lib/importToast.js:9-27` (the one honest summary line, incl. the 3882c28 all-failed fix); component `app/src/components/ImportFlow.jsx:951+` (`role="status"`, `aria-live="polite"`); 3.4s auto-hide (PhotosView.jsx:128) | Bottom toast, one line | **Transient** | Local-only, only on the device that ran the import | Auto |
| LiveDock ledge | `app/src/lib/liveDock.js` + App.jsx:651-694 | Ambient now/next line, upgrades to GPS ETA; jonathan/helen get the live ledge, aurelia cue-only, rafa none (App.jsx:690-694) | Ambient state, not an event record | Local computation | n/a |
| Settle card / SettleSheet | `app/src/views/LivingHeartHome.jsx:801+` (`settle-card`, states keep/nothing/kept) + `app/src/views/SettleSheet.jsx:64-135` (bottom sheet, per-lens `v.lc()` voice) | Gold `--kept` card on the home; sheet is the look-them-over surface; drafts stay honest dashed guesses | Persistent until the day is kept; kept state + `keptBy` visible cross-device | Synced | Keep resolves it |
| ProposalsBanner | `app/src/components/ProposalsBanner.jsx:1-13` | Pending "on the table" cards; **per-lens action gating** (decider / proposer / voter), worker is the real gate; synced via proposals (mig 014) | Persistent until decided | **Synced, cross-device** | Decision resolves |
| Provenance label (underused precedent) | `PhotoAlbum.jsx:406-421` tile "· uploaded" badge + title tooltip; lightbox metadata row `PhotoAlbum.jsx:817-901` (`lightbox-date-source`, author dot · date · stopName · location · Edit date) | A quiet, permanent, non-dismissible label explaining WHERE a displayed fact came from (`capturedAtSource`: memory/exif/createdAt) | Permanent metadata | Synced (derived from the memory) | Never |

---

## 2. The "moved because…" note — candidate assessment + data home

**Hard constraint discovered (load-bearing):** memories are **column-mapped, not `data_json`** — `worker/schema.sql:5-29` defines fixed columns; the client push sends named fields and `rowToMemory` (`worker/src/index.js:1279+`) reconstructs strictly from whitelisted columns and whitelisted per-ref JSON fields (lat/lng/capturedAt/posterKey…). **Any client-only field on a memory is silently dropped on the worker round-trip.** So the provenance flag + moved-note data cannot just be added to the local record; they need a new nullable memory column. The repo has the exact template: migration `007_memory_interstitial.sql` — whose header explicitly reasons that a **per-memory-grain** field earns a top-level column rather than riding inside `photo_r2_keys_json` (which is per-photo grain). `stopId` is per-memory, so the same reasoning applies. The upsert already has the right preserve pattern: `COALESCE(excluded.X, memories.X)` (`worker/src/index.js:1093-1100`). Next migration number is 017 (memory index).

**Recommended data home:** one new column, e.g. `stop_prov_json TEXT`, holding the whole object `{source:'auto'|'manual', movedFrom, reason, at, movedBy?}` — the lock (`source`) and the note (movedFrom/reason/at) are one fact and should never diverge. Client write path already exists: `updateMemoryStop(memoryId, stopId)` at `app/src/lib/memoryStore.js:833-859` patches `stopId` + `scheduleMirror` with a `reapply` closure for the 409-resync — extend its signature to stamp provenance atomically with the move. Its only current caller is `refilePlaces.js:73` (there is otherwise **no manual re-file UI at all** — confirmed, and the carryover says the same at `CARRYOVER_DOCUMENT_THE_TRIP.md:163-180`).

**Candidates:**

- **Toast at re-match time** — wrong as the record (transient + device-local, importToast.js), but right as the immediate ack on the device that ran the re-match, mirroring `runRefile`'s "Moved N photos to…" toast (PhotosView.jsx:143-145). Keep as a secondary layer only.
- **Home-band card** — heaviest option; a genuinely NEW surface → would trigger the Design-prompt rule; also poor day-later discoverability once rotated out. Not recommended.
- **Per-group note under the stop heading** — good for batch moves ("3 photos moved here when Dinner moved to 7pm"); precedent is the refile banner's placement and the StopGroup header chrome (PhotosView.jsx:500+). Works, but the note dies when the group re-renders differently and aggregation hides per-photo WHY.
- **Per-photo chip + lightbox sentence (RECOMMENDED)** — the app already has exactly this two-tier provenance pattern for dates: a tiny persistent tile badge ("· uploaded", PhotoAlbum.jsx:419-421) plus the full explanation in the lightbox metadata row with a tooltip (PhotoAlbum.jsx:844-859). Mirror it: a quiet `TileChip`-style "moved" mark on affected tiles, and in the lightbox footer metadata row the full sentence — WHAT (this photo/clip), FROM ("was under Dinner at Rosa's"), WHY ("the agenda's Tuesday changed"), WHEN — rendered from the synced `stop_prov_json`. Cross-device visibility is automatic (it rides the memory through D1); discoverability days later is at the photo itself, which is where the family would notice a move; **no dismissal/ack semantics needed** — like "· uploaded" it's honest permanent metadata, not an alert demanding action. This matches the user-facing rule: every device tells the same true story because the data, not a device event, carries the note.

---

## 3. Unfiled triage + the manual re-file affordance

**Today:** unfiled = the `'__unassigned'` bucket, `app/src/lib/photoEntries.js:295-304` — `stopName: 'Unfiled'` (line 304/342), `_dayN: 99` so it sorts last (319, 352-355), `_dayLabel: ''` → blank eyebrow. It's an ordinary StopGroup, not a surface.

**Precedents for dedicated-surface vs in-place:**
- Drafts: NOT a new screen — a labelled section inside TripIndex (`TripIndex.jsx:206-219`, local-only, "so a freshly-created draft never vanishes").
- PhotoBackfillTriage (`app/src/components/PhotoBackfillTriage.jsx:38-53`): a full takeover surface, but only for an in-flight batch (phases extracting→…→done) — it's modal work, then gone. Not a standing triage home.
- Day-picker sheet (`ReplayView.jsx:315,561+`) and SettleSheet (`SettleSheet.jsx:87-133`): the house pattern for "pick one from a short list" is a **bottom sheet**, per-lens voiced via `v.lc()`.

**Recommendation (b) — manual re-file:** a "Move to…" affordance in the **PhotoLightbox footer action row**, next to "Edit date" (`PhotoAlbum.jsx:874-900` — a small bordered mono pill button; the top bar at 598-690 holds Delete-with-inline-confirm / Share / Close and is already crowded). Tapping opens a stop-picker bottom sheet (SettleSheet/day-picker chrome), grouped day → stop like the album; on pick, call the extended `updateMemoryStop` with `source:'manual'`. Permission note: date-editing is author-only (`canEditDate`, PhotoAlbum.jsx:497-503), but the refile banner already lets **any viewer** move photos regardless of author (refilePlaces walks all of `listMemoriesForTrip`) — so filing is established as family metadata, not author-locked content; recommend any adult lens can re-file, and a manual move by anyone sets the lock.

**Recommendation (c) — triage surface: an upgrade to existing surfaces, NOT a new screen.** The pieces are: (1) keep the Unfiled group but give it a real eyebrow ("couldn't match these — open one to file it") instead of the blank; (2) per-photo "Move to…" in the lightbox (above); (3) reuse the refile-banner two-step card slot (PhotosView.jsx:364-397) for any residual "N photos could now file to X" offers that fall below the auto-apply confidence bar. Since auto-apply is Jonathan's settled choice, the triage load shrinks to the genuinely unmatchable residue — which doesn't justify a dedicated screen. **However**, the moved-note chip + the Move-to sheet + the four-lens copy for "moved because…" are new interactions/clutter risk on an existing surface, and the note needs a per-lens voice deck (Rafa should arguably never meet "moved because…" complexity — precedent: he never meets stuck/amber, `videoCopy.js:106-134`; Aurelia lowercase, `videoCopy.js:83-105`) — so per the loop-design rule this warrants a **short Claude Design prompt for the note copy + placement** (precedent: `DESIGN_PROMPT_VIDEO_FEEDBACK.md` at repo root produced the videoCopy deck verbatim, videoCopy.js:1-7), while the plumbing (mig 017 column, provenance-gated matcher, lightbox Move-to) needs none.

---

## 4. Per-lens branch points for photo surfaces (verified)

- PhotosView/AllPhotosView are **one shared view for all four lenses**, themed by CSS vars (PhotosView.jsx:35-37); Rafa reaches them via `rafa-photos-entry` / `rafa-all-photos-entry` (`app/src/views/RafaView.jsx:528, 554`); routing passes `traveler` straight through (App.jsx:1831-1845).
- Behavior forks are point-checks, not separate components: `isRafa` in PhotoTile (PhotoAlbum.jsx:68-75) and SyncPill (PhotosView.jsx:443-448); copy via `videoCopy(traveler)` deck (videoCopy.js:31-140) and `homeVoice(t).lc()` (homeVoice.js:83-92). Rafa is also excluded from the trip editor door (App.jsx:1800-1806, "a kid lens gets no destructive path").
- So Phase 3 should follow suit: same surfaces, a per-lens copy deck for the moved-note, Rafa's variant either omitted or reduced to nothing scary (his photos just appear in the right place), Aurelia's line lowercase.

**Unconfirmed / out of scope:** I did not find any existing per-memory "ack/read" mechanism anywhere (nothing to reuse for a "seen the note" state — consistent with recommending the note be permanent metadata, not an alert). I also did not verify the exact confidence thresholds in `photoMatch.js` (matcher internals were out of this topic's scope beyond confirming it's pure and runs once at import, photoMatch.js:1-13).
---

## robust-5

All claims below re-derived from the working tree at branch `fix/foolproof-video-import` (files read this session). Paths are absolute; line numbers from the current files.

# Phase 3 research: evidence.js vs photoMatch.js — unify, parallel, or staged

## 1. The two systems' actual shapes (confirmed, with one correction to the framing)

**photoMatch.js files photos onto existing structure — mostly true, with one big caveat.**
- Input: photos with EXIF `capturedAt` + optional GPS; a trip's `days[].stops` (`app/src/lib/photoMatch.js:1-13`). Output: per-photo `{stopId, matchType, ...}`; the memory's single `stopId` field is the durable result (`app/src/lib/memoryStore.js:12`, worker column `stop_id`, `worker/src/index.js:1050`).
- Matching is GPS-first within 1000m of the nearest stop in the day (`photoMatch.js:101-120, 374-443`), with base-priority (`:402-428`), a no-GPS-on-a-stay default to the day's base (`:461-487`), and day binding by **UTC calendar window** (`:350-357`).
- **Caveat: photoMatch's import pipeline already drafts structure FROM photos.** Interstitial GPS clusters (3+ photos within 500m) whose centroid is >2km off the day's route — and on a day with <2 located stops the route distance is Infinity, so **any** qualifying cluster passes (`photoMatch.js:90-98, 602-621`) — become `auto_added` stops after a 20-minute dwell gate (`app/src/lib/reconcileDraft.js:45-47, 170-185, 220-243`), and `applyReconciliation` writes them into `trip.days[].stops` as **real planned stops** (`app/src/lib/reconcileApply.js:34-36`). ImportFlow accepts this draft as-is (`app/src/components/ImportFlow.jsx:190-192`). So the "photos→structure" capability exists in BOTH systems today; photoMatch writes it into the PLAN (`day.stops`), evidence writes it into the RECORD (`day.record`). This is a pre-Record design and sits in tension with the Record's "the plan is never rewritten" rule (`app/src/lib/dayRecord.js:8-10`) — worth surfacing to Jonathan as context, not relitigating.

**evidence.js drafts structure from photos alone — confirmed.**
- Clusters a day's located photos by single-linkage 200m/90min (`app/src/lib/evidence.js:29, 93-159`) into pins; day attribution is **leg-local** via `localDateIso`, explicitly NOT photoMatch's UTC window (`evidence.js:38-43, 62`). Keeping a day persists pins as unnamed draft record entries (`pinsToDraftEntries`, `evidence.js:227-246`); a human names them in SettleSheet (`app/src/views/SettleSheet.jsx:80`). Consumed only by LivingHeartHome's settle card (`app/src/views/LivingHeartHome.jsx:307, 332, 519`).
- Two facts that matter enormously for the options below:
  1. **Pin ids are unstable; kept record-entry ids are stable.** A pin's id hashes its member photo set — one new photo changes the id (`evidence.js:86-91, 147`); once named/kept, the entry persists decoupled from re-clustering (`evidence.js:83-85, 218-226`). Filing targets must therefore be **kept record entries, never live pins**.
  2. **An evidence-born record entry already carries the bridge data**: `lat/lng` (centroid), `span`, and `photos: memoryIds` — the exact memories that formed it (`evidence.js:236-243`). For those entries, "filing" needs no geometry at all: the membership list already exists (today consumed only as a count, `app/src/views/PartsOutline.jsx:115`).

**Which system does the real work on the dominant shape (a stay/hangout)?** Both, on different surfaces. Filing (album/Weave/resurface/Replay) is 100% photoMatch: on a stay with a located anchor, every day gets the implicit base as a target (`photoMatch.js:271-323`), so at-place and no-GPS photos file to "At the cabin". The Record (settle card → `day.record`) is 100% evidence.js. **On a day with zero stops and no located anchor** (stay whose lodging never geocoded): `tripImplicitBase` returns null (`photoMatch.js:208-215`), `allStops` is empty, GPS photos fall through to time-only with no clock stops → `stopId: null` (`photoMatch.js:456-459, 489-513`) → the `'__unassigned'` "Unfiled" bucket (`app/src/lib/photoEntries.js:295, 304`). "Self-healing matching" on such a day is literally vacuous unless record entries/pins become filing targets — there is nothing to re-match TO.

## 2. Does stop-only re-matching serve "document the trip we had"? (honest answer: only partially)

FAMILY_TRIPS_VISION.md §12 (`/Users/jjackson/dev/roadtrip/FAMILY_TRIPS_VISION.md:252-284`) states the ask: "a photo/video should end up pinned to what the family actually did that day, regardless of whether the agenda item existed before or after the upload." The three-tenses memory explicitly lists the unbuilt downstream: "photo filing targets the record pins" (`/Users/jjackson/.claude/projects/-Users-jjackson-dev-roadtrip/memory/the-record-three-tenses.md:102-104, 117`).

On a hangout stay, the structure the family creates **after** import is almost never an agenda stop — it's a named record entry from the settle sheet ("Race Point Beach, 11–1"). Stop-only re-matching never sees `day.record`. So stop-only self-healing serves §12 for: (a) planned trips whose agenda gets edited later, (b) the late-geocoded-lodging case (currently a manual `refileTripToPlaces` tap, `app/src/lib/refilePlaces.js:53-76`), (c) unfiled photos retried when a stop gains coords. It does NOT serve the hangout-day core of the vision. **Structurally, yes: the §12 vision for the dominant trip shape requires the record-entries-as-targets bridge.** That said, "what actually happened" on those days is captured — by evidence pins in the Record — it just never feeds back into where photos FILE. The gap is the feedback loop, not capture.

## 3. Option A — unify (one engine, stops + record entries both filing targets)

Touch list (concrete):
- `photoMatch.buildDayIndex` ingests each day's **named, kept** record entries with coords as loose-stop-like targets (`photoMatch.js:271-323`); a precedence rule vs planned stops and the base must be designed (record entries were clustered at 200m; stops attach at 1000m — two radii in one scan).
- `dayStopIds` (`photoMatch.js:243-249`) adds record-entry ids. This is the single best fact for Option A: it is the self-described "one source of truth" and weave.js (`:24,80,98`), resurface.js (`:46`), and ReplayView (`:283-300`) all already route through it — extending it teaches all three surfaces at once. The implicit-base synthetic-id precedent (`__trip_base__:<iso>`) proves the pattern works end-to-end.
- `groupByStop`'s stopIndex adds record entries (`photoEntries.js:210-224`), else record-filed photos render "Unfiled" (`:304`).
- Nothing **crashes** on an unknown stopId — I found no consumer that throws. Ids can't collide: stops are `stop_<hex>` (`app/src/views/TripEditor.jsx:256`), record entries `rec-<cardId>-<i>` or `pin-<date>-<hash>` (`dayRecord.js:29-38`, `evidence.js:147`). The failure mode is **silent drop**: weave/resurface/replay filter memories by `dayStopIds` membership, so an untaught surface silently loses record-filed photos — the exact failure the comment at `photoMatch.js:239-242` warns about, and the worst outcome under this project's honesty rules. surprises.js degrades to an empty place name (`app/src/lib/surprises.js:104-112`) — graceful. I did not exhaustively verify ThreadedMemories/ShareComposer; flag as unchecked.
- The two engines disagree on **what day a photo belongs to** (UTC window vs leg-local, `photoMatch.js:350-352` vs `evidence.js:38-43`) — an 11pm photo belongs to different days in the two systems. Unification forces reconciling this (probably migrating photoMatch to leg-local, which changes existing filing behavior — a real regression surface).
- The reconcile/import triage (`reconcileDraft.js`, `reconcileApply.js`) would need record entries surfaced like the implicit base (`reconcileDraft.js:245-252` precedent) or photos filed there become invisible in the triage editor.

Cost: broad but shallow — the resolver choke points are consolidated. Risk: the day-attribution merge and the precedence rule are genuine design problems where a wrong answer produces wrong silent moves (the stated worst outcome).

## 4. Option B — parallel + reconciliation layer

Shape: matching keeps targeting stops; a new module maps kept record entries ↔ stops/memories after the fact (centroid-vs-stop distance, or directly via `entry.photos` memberships). What stays broken: hangout-day photos still file only to base/unfiled — the album stays one undifferentiated "At the cabin" pile even after the family named "Race Point · 11–1" in the settle sheet; weave/resurface/replay still can't group by the named place. Two clustering engines with different gates (1000m/UTC vs 200m/leg-local) continue to drift, and the reconciliation layer becomes a third place where matching semantics live. It buys robustness isolation but permanently forfeits the §12 value on the dominant trip shape — or defers it into a layer that is effectively Option A's hard part without Option A's payoff.

## 5. Option C — staged (3a stops-only self-heal, 3b pins/record-entries as targets)

Reusability of 3a's machinery by 3b — mostly 100%, with one bake-in risk:
- **Provenance flag: fully reusable.** `stopIdSource: 'auto'|'manual'` guards writes to `memory.stopId` regardless of what id space the target lives in. But note a hard fact all options share: the worker's memories table has a **fixed column list** — an extra body field is silently dropped on sync (`worker/src/index.js:1050-1056, 1103`; the GET maps only known columns, `:1384`). Cross-device provenance therefore needs migration 017 (reserved; schema = decision gate) or riding an existing JSON column. A client-only flag would let device B's auto-rematch clobber device A's manual move. `updateMemoryStop` grows a source param + manual-lock guard, and its `reapply` resync closure must carry the flag (`memoryStore.js:833-848`).
- **Trigger machinery: fully reusable — with a bonus.** `day.record` lives inside the trip's `data_json`, so a settle-sheet keep IS a trip edit and fires the same Phase-1 20s pull heartbeat a stop edit does; Phase 2's `beatSignature` invalidation covers the Weave. 3b needs zero new trigger plumbing.
- **The bake-in risk:** if 3a's re-matcher or its safety guard assumes "a valid target is in `day.stops`" (e.g. validates targets against `day.stops` instead of `dayStopIds`, or hard-codes the "moved because" copy to stop language), 3b reworks it. The codebase already mandates the fix: route all target resolution through `buildDayIndex`/`dayStopIds` (`photoMatch.js:239-249`), which 3b then widens. If 3a holds to that one rule, staging bakes in essentially no rework. The day-attribution (UTC vs leg-local) question can also be deferred to 3b — but should be flagged now so 3a's tests don't pin the UTC behavior as a contract.

## 6. The implicit-base day (cabin week) — honest value quantification

On the commonest day, import-time matching already: files at-place GPS photos and ALL no-GPS photos to the base, and promotes unplanned outings of ≥3 photos with ≥20min dwell into auto_added stops (route distance is Infinity on a stop-less day, so clusters qualify — `photoMatch.js:90-98, 610-611`). What stop-targeted self-healing adds there beyond `refileTripToPlaces`: automation of that one manual tap (late-located lodging — roughly once per trip), plus re-filing when someone retro-adds an agenda stop (rare on hangouts — this family's post-hoc structure is the settle sheet, not the agenda editor). What it can never fix there: the 1-2-photo ice-cream stop (below cluster minimum → interstitial forever) — which evidence.js **can** capture (no minimum cluster size, `evidence.js:99-159`; singleton pins are legal) and the settle sheet can name. I cannot give a numeric split (no usage telemetry exists), but structurally: on stays, most of Phase 3's §12 value lives in pins/record-entries-as-targets; stop-targeting's value concentrates on planned/edited-agenda trips plus one automation of an existing manual affordance.

## 7. Recommendation (for Jonathan to decide, plain-language trade-off)

**Option C, with 3a built target-agnostic.** Reasons: Option A up front couples the risky design problems (precedence rule, UTC-vs-leg-local day merge) to the already-delicate auto-apply safety work — most wrong-silent-move surface area in one step, against the stated top priority. Option B permanently under-serves the trips this family actually takes. Option C ships the provenance flag + trigger + "moved because…" note on the smaller stop-target space first (where `refileTripToPlaces` proves the move mechanics), and 3b then widens `dayStopIds`/`buildDayIndex` to **kept, named record entries only** (stable ids), where evidence-born entries can file their member memories directly via the already-stored `entry.photos` list — no geometry, hence no new wrong-move risk for exactly the hangout case that matters most. Two conditions make staging safe: (1) 3a resolves targets only through `dayStopIds`/`buildDayIndex`; (2) the provenance flag's sync design (mig 017 vs JSON-column ride-along) is settled first — it is a schema decision gate and the one piece every option needs.

Key files: `/Users/jjackson/dev/roadtrip/app/src/lib/photoMatch.js`, `/Users/jjackson/dev/roadtrip/app/src/lib/evidence.js`, `/Users/jjackson/dev/roadtrip/app/src/lib/dayRecord.js`, `/Users/jjackson/dev/roadtrip/app/src/lib/photoEntries.js`, `/Users/jjackson/dev/roadtrip/app/src/lib/refilePlaces.js`, `/Users/jjackson/dev/roadtrip/app/src/lib/reconcileDraft.js`, `/Users/jjackson/dev/roadtrip/app/src/lib/reconcileApply.js`, `/Users/jjackson/dev/roadtrip/app/src/lib/memoryStore.js`, `/Users/jjackson/dev/roadtrip/worker/src/index.js`, `/Users/jjackson/dev/roadtrip/FAMILY_TRIPS_VISION.md` (§12).
---

## robust-6

Adversarial robustness audit — Phase 1 (cross-device live agenda pull) + Phase 2 (Weave same-day regen). All claims re-derived from the working tree at HEAD `06656ef` (branch `fix/foolproof-video-import`). Ranked by real-world likelihood × family-visible impact.

---

## F1 — REAL, CONFIRMED (highest severity): Trip pushes are last-write-wins; the Phase-1 resync heartbeat can silently erase another device's agenda edit family-wide

- `app/src/lib/workerSync.js:560-575` — `pushTrip` POSTs the raw trip object. It never attaches `baseUpdatedAt`. Repo-wide grep confirms `baseUpdatedAt`/`serverUpdatedAt` appear ONLY in the memory-sync paths (`workerSync.js:288-373`, `memoryStore.js`), never for trips.
- `worker/src/index.js:1514-1519` — postTrip's OCC is opt-in: "an older client sends no base → we skip the check and keep last-write-wins exactly as before." The 409 guard at `index.js:1532-1538` is therefore dead code for every real client today.
- `app/src/hooks/useTrips.js:234-264` — `resyncPending` re-pushes the FULL cached trip for every queued id, every 20s, on `online`, and on foregrounding (`useTrips.js:294-316`).
- The only server-side merge protection is surprise-specific (`preserveHiddenStops`/`preserveHiddenParts`, `index.js:1541-1559`) — nothing protects an ordinary agenda edit.

Failure story: Jonathan tweaks the trip on his phone in a dead zone — the edit queues (`markUnsynced`, `useTrips.js:224`). An hour later Helen reorders tomorrow's agenda at home; it syncs to everyone. Jonathan's phone regains signal; within 20s `resyncPending` pushes his stale full-trip copy; the worker accepts it (no base → LWW). Helen opens the app and sees her agenda reordering gone — on every device, with no conflict, no note, and both devices showed green "Saved". This is precisely the concurrency pattern Phase 1 exists to create (multiple devices editing live), and Phase 3's auto-moves will multiply concurrent writers. The worker already implements the fix's server half; the client just never sends the base.

## F2 — REAL, CONFIRMED: A persistently-failing push leaves the device stale forever on that trip, and there is NO user-visible indicator anywhere

- Clobber guard carries the whole local trip while pending: `useTrips.js:120-137` — so every remote edit to trip T is invisible on this device until its own push succeeds. Correct by design, but:
- `resyncPending` swallows all push errors with no retry cap (`useTrips.js:261-263`), and `lib/tripSyncQueue.js` stores `{id, author}` only — no timestamp, so "stuck for 5 days" is undetectable even in principle.
- `unsyncedCount` is computed and returned (`useTrips.js:90, 377`) but grep confirms ZERO consumers in `app/src` outside the hook itself. The honest "N changes haven't reached the family" indicator was plumbed and never rendered.
- The author's only cue is transient: TripEditor's SaveBadge shows `'saved-unsynced'` as a green-check "Saved" (`app/src/views/TripEditor.jsx:743`) — visually a success. Settings surfaces only PULL errors (`Settings.jsx:761` "Trip pull error"), never push-queue depth.
- A deterministic failure mode exists: a revoked session post-cutover — `workerFetch` drops the session, retries once, then throws 401 every time (`workerSync.js:141-149`). Any trip shape postTrip 500s on behaves the same.

Failure story: Rafa's iPad session gets revoked. Aurelia edits the agenda there → green "Saved". The family never receives it, AND the iPad never shows anyone else's edits to that trip (clobber guard carries the stale local copy forever). Nothing on any screen ever says so. For Phase 3 this matters doubly: the provenance flag plan assumes agenda state converges; this device is a permanently-forked replica with no signal.

## F3 — REAL, CONFIRMED: The server weave stack ignores the implicit base ("At the cabin") — Phase 2's freshness check is blind to exactly the memories a stay-trip produces

- The client's declared single source of truth: `app/src/lib/photoMatch.js:238-249` (`dayStopIds` = planned stops + implicit base), with the explicit warning that every surface grouping memories by stop must use it. Client weave complies (`app/src/lib/weave.js:98`).
- The server does not: `buildBeatsServer` filters by `day.stops` only (`worker/src/weaveGen.js:183-184`); `dayHasSharedMemory` in the cron likewise (`weaveGen.js:306-309`); the Phase-2 recompute in `/weave/latest` uses `buildBeatsServer` (`worker/src/index.js:3276`). The weaveGen header lists deliberate divergences (shared-only, no discovery) — implicit base is NOT among them, so this looks like drift, not a decision.

Three concrete consequences:
1. A cabin/Grandma's day where all shared memories are base-filed has no shared-memory day in the cron's eyes → no nightly weave at all (`runNightlyWeave` returns `skipped`, `weaveGen.js:311-316`).
2. A mid-day base-filed photo add (or a Phase-3 auto-move to/from the base) never changes the server signature → `/weave/latest` keeps serving the stale stored row. The Phase-2 guarantee ("regenerate when today's facts changed") is silently void for the app's settled core trip shape.
3. Signature schism on keep: `keepWeave` stores the sig of CLIENT beats (which include base beats — `weave.js` keepWeave → `index.js:3325-3327`), but the serve-time recompute builds SERVER beats (no base) → sigs differ → permanent 204 for that day → every open pays an on-demand Claude call (`TheWeave.jsx:249`) and the "instant, pre-made" page is gone forever for that day.

Failure story: at Grandma's, everyone's photos file to "At Grandma's". The ✦ ready cue never fires; when Helen keeps a page, that day's weave never serves stored again.

## F4 — REAL, CONFIRMED (convergence): 204-on-mismatch never converges except via the nightly cron, and the cron regenerates exactly ONE day

- The client's on-demand rebuild is never persisted: `POST /weave` generates and returns only (`index.js:3059-3087`); the only writers of `weaves` rows are the cron (`weaveGen.js:344-362`) and explicit keep (`index.js:3309-3348`). `fetchWeaveNarrative` stores nothing (`weave.js:150-169`).
- The cron picks a single day — the active trip's freshest past day with (server-visible) shared memories (`weaveGen.js:55-61`) — and "active" ends at `dateRangeEnd + 4` days (`weaveGen.js:33-38`).

So any signature-mismatched row for a non-freshest day, or for any trip past its grace window, 204s on every open forever: spinner + Claude call each time instead of the instant page. Today that's an edge case; after Phase 3 it becomes the norm — auto-matching re-files photos on PAST days by design, so each auto-move permanently de-caches that day's stored weave with no regeneration path. Cost/latency, not data loss, but it's the direct interaction between Phase 3 and shipped Phase 2. (Answer to Q7: no, the client's rebuild never persists; convergence exists only for the one cron-picked day.)

## F5 — REAL but self-healing: unserialized resync+refresh race can transiently revert a just-synced edit on screen

- `attempt()` fires `resyncPending()` and `refresh()` concurrently without awaiting (`useTrips.js:296-301`). `refresh` reads `pendingIds()` only AFTER `await pullTrips()` resolves (line 120 vs 110). If the concurrent push lands and `markSynced` runs in that window, the clobber guard no longer carries the local copy, and `setTrips` renders the server's pre-push snapshot. The push did land, so the next heartbeat (≤20s) restores it. A 20s revert-flicker of your own edit — confusing, not lossy. Trivial fix: `await resyncPending(); refresh()`.

## F6 — PLAUSIBLE (cannot confirm from code alone): no fetch timeout — one hung pull latches `refreshingRef` and kills live-pull until relaunch

- `workerFetch` has no AbortController/timeout (`workerSync.js:117-152`); `refresh`'s `finally` reset (`useTrips.js:159-162`) only runs if the promise settles. A fetch that never settles (the iOS-PWA-resumed-after-long-suspension class — this family's exact install mode) leaves `refreshingRef.current === true`, and every future trigger returns at `useTrips.js:105` — heartbeat, `online`, and visibilitychange alike. Silent (`loading` stuck true is also unconsumed). I cannot verify from the repo that iOS actually strands fetches unsettled — marking PLAUSIBLE. Hardening is cheap (AbortSignal.timeout or a latch-age watchdog).
- The benign version of Q1's question: visibilitychange-during-an-in-flight-pull just drops the trigger and waits ≤20s — fine. The latch above is the only real starvation path found.

Q3 (iOS background) from code: only `visibilitychange` + `online` + interval are handled (`useTrips.js:303-309`); no Page Lifecycle `freeze/resume`. A backgrounded/suspended PWA runs no interval (platform behavior — not verifiable here); foregrounding fires `attempt()`, and a days-later relaunch re-mounts and drains cleanly. Nothing breaks by firing after days — EXCEPT that a days-old queued edit re-pushed via F1 clobbers days of everyone else's edits, so long suspension makes F1 strictly worse.

## F7 — GUARDED/negligible: 20s thundering herd

Four unsynchronized 20s loops (`presence.js:22`, `proposals.js:72`, `useTrips.js:40`, `App.jsx:447`) ≈ under 1 req/s for four devices — a non-issue on a Cloudflare Worker. Error surfacing for persistent pull failure is folded into F2: Settings-only (`Settings.jsx:761`), nothing in-flow.

## F8 — Negligible today, real post-Phase-3: NULL `beat_signature` rows are permanently un-invalidatable

- `index.js:3252` skips the freshness check when sig is NULL. Writers: the cron always writes a sig (`weaveGen.js:361`); `keepWeave` writes NULL only when the client sent no beats, and COALESCE (`index.js:3342`) prevents nulling an existing sig. The NULL population is therefore ≈ empty today. Once Phase 3 starts moving photos, any such row serves pre-move content forever — a one-line backfill (or treating NULL as "recompute" for non-kept rows) closes it before Phase 3 ships.

## F9 — THEORETICAL-BUT-GUARDED: TZ

- The Phase-2 serve/204 decision has no "today"/TZ input at all: `beatSignature` is date-free (`who:kind:snippet`, membership via stopId sets — `weaveGen.js:237-242, 183-184`), and the client requests an explicit `day_iso` (`TheWeave.jsx:218`) compared string-to-string (`index.js:3211, 3258`). UTC is used only for day SELECTION in the cron (`weaveGen.js:255`) which fires at 08:00 UTC (`worker/wrangler.toml:50`) = 3–4am ET, when UTC and US-local dates agree. Worst case is a cron-vs-client day-pick disagreement → day-specific fetch 204s → on-demand build (cost only). No wrong-day-content path found.

## Q5 enumeration (recompute-failure → stale-forever) — narrower than feared

- Unparseable trip `data_json`: pre-empted — `secretWeaveDaySet` FAILS CLOSED on the same condition (`weaveGen.js:112-114, 123`) → 204 at `index.js:3204` before the sig check ever runs. Not a stale-serve.
- Memories-query failure: non-schema D1 errors propagate out of `secretWeaveDaySet` (`weaveGen.js:163`) → 500 → client reads it as null (`weave.js:185, 189-190`) → on-demand build. Transient.
- The real fall-through: `row.day_iso` no longer in `trip.days` after an agenda date edit → `if (day)` at `index.js:3258-3259` silently skips the check → stored row served un-checked. But day-specific client requests only ever ask for days the client's trip copy contains (`TheWeave.jsx:177-184`), so this row is reachable only via the NO-day "latest" query — used solely for the ✦ ready cue (`App.jsx:821-825`). Worst case: a stale ✦ cue. THEORETICAL.

---

### Summary for Phase-3 planning

The two shipped self-healing pieces are internally solid, but three confirmed gaps directly intersect Phase 3: **F1** (trips never send `baseUpdatedAt`; the server's 409 guard is unused — auto-apply moves will multiply concurrent trip/memory writers over an LWW channel), **F3** (server weave stack violates the `dayStopIds` single-source-of-truth — base-filed memories, the core family pattern, are invisible to the Phase-2 signature), and **F4** (every Phase-3 auto-move on a past day permanently de-caches that day's weave with no regeneration path). **F2** (no stuck-sync indicator; `unsyncedCount` rendered nowhere) violates the project's own sync-honesty rule and should ship before auto-apply, since "moved because…" notes are worthless on a device that is silently forked.

Key files: `/Users/jjackson/dev/roadtrip/app/src/hooks/useTrips.js`, `/Users/jjackson/dev/roadtrip/app/src/lib/workerSync.js`, `/Users/jjackson/dev/roadtrip/app/src/lib/tripSyncQueue.js`, `/Users/jjackson/dev/roadtrip/app/src/lib/weave.js`, `/Users/jjackson/dev/roadtrip/app/src/lib/photoMatch.js`, `/Users/jjackson/dev/roadtrip/app/src/views/TheWeave.jsx`, `/Users/jjackson/dev/roadtrip/worker/src/index.js`, `/Users/jjackson/dev/roadtrip/worker/src/weaveGen.js`, `/Users/jjackson/dev/roadtrip/worker/wrangler.toml`.
---

## synthesis

All six spot-checks confirm the round-2 findings verbatim (no provenance field anywhere; 016 is the highest migration; the field-blind reapply closure; pushTrip carries no OCC base; unsyncedCount has zero consumers; non-409 mirror failures silently swallowed). Where round 1 and round 2 conflicted, round 2 wins and I verified the tiebreaker myself. The synthesis follows.

---

# PHASE 3 SYNTHESIS — Self-healing photo↔agenda matching, auto-apply, "moved because…", provenance lock

Branch verified against: `fix/foolproof-video-import` @ `06656ef`, worktree `/Users/jjackson/dev/roadtrip`. Prime directive (Jonathan, settled): **a wrong silent move is worse than no move; auto must never clobber manual; every behavior honest cross-device.** Auto-apply is SETTLED and not reopened here.

---

## 1. GROUND FACTS

**Storage and round-trip (the facts the provenance design hangs on)**

- `stop_id` is a dedicated TEXT column on `memories` (`worker/schema.sql:8`); the worker upsert binds an explicit column list only (`worker/src/index.js:1049–1120`, `stop_id = excluded.stop_id` at :1068) and `rowToMemory` emits a fixed shape (:1279–1413). Memories have **no catch-all blob** (unlike trips' `data_json`, `schema.sql:40`). Any unknown field on a pushed memory is **silently dropped**.
- A client-only field is also erased locally on the first winning pull: `mergeFromRemote` replaces the record wholesale (`memoryStore.js:641–650`); `preserveLocalPhotoMeta` carries forward only per-ref EXIF/poster + interstitial (:692–731). **Provenance cannot be client-only.**
- No existing `*_json` column is a safe carrier (round 2, refuting round 1): `photo_r2_keys_json`/`interstitial_json` are whitelist-reserialized (`index.js:929–960, 1006–1012, 1359–1367`); the surprise family is gated and semantically loaded (:1018–1032); `reveal_json` is COALESCE-only and cron-parsed (:447–448, 1095); `reactions_json`/`photo_external_urls_json` survive verbatim but are wholesale-overwritten / weaken the photo-source 400 gate (:914, 996–998, 1040, 1086, 1092). Migration `007`'s own comment states the precedent: per-memory-grain data earns a real column. **Next free migration = 017** (highest on disk `016_waves.sql`; re-verified this session).
- No provenance flag exists anywhere today (grep `stopIdSource|stop_id_source|stopProv|stop_prov` over app/src + worker/src + migrations = zero; re-verified this session).

**Matching**

- The matcher runs **once, at import** (`ImportFlow.jsx:191`, `PhotoBackfillTriage.jsx:174`); nothing re-runs on a trip/agenda edit. `groupByStop` only re-labels stored `stopId`s.
- `matchPhotoToStop` is pure and deterministic on identical inputs (63/63 tests pass under plain node; no clock/locale/random reads). GPS-first within 1000m (`photoMatch.js:109`), base priority with a 150m yield to specific stops (:116, 411–428), UTC day windows (:351–352), stay-with-no-GPS defaults to the day's base (:471–487). No place-name text matching. Only the running best is tracked — **no runner-up/margin exists** (:392).
- **Bulk-imported memories carry no ref-level GPS** — `baseRef` = `{kind, mime, capturedAt}` only (`photoBackfillUpload.js:187`); GPS lived only in transient import EXIF. `matchType`/`distanceMeters` are not persisted either. The largest memory population is GPS-blind at re-match time.
- `capturedAt` landmine: importer output always ends in `Z` (`photoBackfill.js:93–103`), but nothing enforces it; a zone-less string parses device-local at `photoMatch.js:345`. EXIF `offsetMinutes` is extracted (`photoBackfill.js:68–81`) but has **zero consumers**.

**The one existing mover, and its holes**

- `updateMemoryStop` (`memoryStore.js:833–859`) is the only post-import `stopId` mutator; sole caller `refilePlaces.js:73` (unanimity rule :65–68, implicit-base-only target :70, two-step human confirm in `PhotosView.jsx:364–397`). It is idempotent at target (:840) and refuses masked (:839).
- Its mirror is fire-and-forget: OCC base + honest per-item result on success (:580–583), 409 → `resolveSaveConflict` (:526–558), but **any other failure is silently swallowed with no queue and no retry** (:584–592; re-verified). Memory saves have **no equivalent of `tripSyncQueue`**; the device that failed keeps the move (its newer local stamp blocks pulls, :677) — permanent silent fork.
- The 409 **reapply is field-blind**: `(fresh) => ({ ...fresh, stopId, updatedAt: now })` (:848; re-verified) — it re-imposes its stopId over whatever landed in between, retries ×2, then adopts the server row (:516, 553–558). Last-arriving edit wins `stop_id` (server stamps arrival time, `index.js:909–910`; OCC is opt-in, :894–908).
- The upload outbox snapshots `stopId` at enqueue and the drain re-saves it verbatim (`photoBackfillUpload.js:225, 341`; `App.jsx:206–211`) — a stuck video reverts any later move when it drains.

**Environment**

- No memory-change event bus; every consuming view memoizes without memory deps (`PhotosView.jsx:40–53`, `LivingHeartHome.jsx:284`, `TripIndex.jsx:66–90`, …) — a background move is invisible until remount.
- Devices see **divergent inputs**: masked stubs for hidden-from viewers, no other travelers' private rows (`index.js:849–864`); the client cover stand-in lacks `masked:true` (`app/src/lib/surprises.js:186–216`). The **worker sees everything** and is already the single memory writer (three write sites total). Per-ref `lat/lng/capturedAt` round-trips through `photo_r2_keys_json` (`index.js:929–940`), and trip `data_json` is stored verbatim — the worker has the matcher's inputs (except a memory-level `captured_at` column, which doesn't exist; per-ref data suffices, as `refilePlaces.js:20–35` proves).
- Trip pushes send **no OCC base** (`workerSync.js:560–575`; re-verified) — the worker's trip 409 guard (`index.js:1514–1538`) is dead code; `resyncPending` re-pushes stale full trips every 20s (`useTrips.js:234–264, 294–316`). `unsyncedCount` is computed but rendered **nowhere** (re-verified).
- Server weave membership uses `day.stops` only (`weaveGen.js:182–184, 306–308`; `index.js:3253–3280`), not the client's `dayStopIds` (planned stops + implicit base, `photoMatch.js:243–249`) — base-filed memories are invisible to the Phase-2 signature. Weave secrecy fails closed: a hidden memory whose `stop_id` can't map to `trip.days` withholds **every** stored weave for the trip (`weaveGen.js:144–165`).
- `evidence.js` is a deliberate parallel system (200m/90min clustering, needs no stops, leg-local days vs photoMatch's UTC, `evidence.js:29, 38–43`); a **kept** record entry has a stable id and already stores `lat/lng`, `span`, and its member `photos: memoryIds` (`evidence.js:236–243`). The pins→filing bridge is documented unbuilt future work.
- Change-detection precedent: `beatSignature` compare-on-read (`8f07199`, `index.js:3252–3282`) and `arrivalSignature` (`legArrival.js:14–47`). Trip-write choke points: client `upsertTrip` + `refresh()` merge; worker `postTrip` (`index.js:1501`) + cron reveals (:461–474).

---

## 2. THREAT MODEL

Ranked by likelihood × family-visible impact. "Depends on" names the design choice (§3/§4) the mitigation rests on.

**T1 — Auto overwrites a manual fix (the cardinal sin). Certainty-level likelihood without the flag; worst impact.**
Three vectors: (a) nothing distinguishes auto from manual today, so any re-match can move a human-placed photo; (b) the field-blind 409 reapply (`memoryStore.js:848`) re-imposes an auto stopId over an interleaved manual move *during conflict recovery* — arrival order, not intent, decides; (c) `postMemory` takes `stop_id` from any body (`index.js:1068`), so a stale client re-save can revert and re-label a move.
**Mitigation:** the provenance lock (§3), enforced in **three** places: at match time (never move `manual`), inside the reapply closure (read `fresh.stopProv`; abort if manual, no-op if already at target), and **in the worker upsert** (an auto-sourced stop change may never replace a stored manual one — server-side enforcement makes the lock robust against stale/buggy clients). Depends on: mig 017 + worker write rules (§3).

**T2 — Wrong silent move from divergent or blind inputs. High likelihood; worst impact.**
(a) A device matching against its masked view could move a real memory off a hidden stop or off a cover's fabricated identity (client cover stand-in isn't flagged `masked`, `surprises.js:186–216`). (b) A re-match against a stale agenda or stale memory set (no trips-fresh/memories-fresh ordering hook exists; cold-boot chains race). (c) The GPS-blind bulk-import population can only ever re-match as `'time'` — a guess, not evidence. (d) Zone-less `capturedAt` buckets to different days on different devices.
**Mitigation:** run matching **worker-side** (sees true agenda + all rows unmasked, single canonical state — kills a, b, d structurally); gate auto-moves to `'gps+time'` only (kills c: time-only never moves anything); persist ref-level GPS on import going forward (small `baseRef` change) so new imports are healable; treat zone-less timestamps as unmatchable. Depends on: authority model (D2) + gate strictness (D3).

**T3 — Half-applied move / permanent device fork. High likelihood (auto runs in background bursts exactly when networks are worst); high impact (family sees different albums, invisibly).**
A client-side auto-move whose mirror fails non-409 is dropped forever (no queue, `memoryStore.js:584–592`); the device shows the move, nobody else ever learns, and LWW blocks the fix from pulling in (:677).
**Mitigation:** worker-side authority makes auto-moves server-originated (they propagate via the existing 20s pull + LWW/OCC — no client mirror to fail). Manual moves still ride the client path, so add a **memory-save retry queue** mirroring `tripSyncQueue`, or at minimum an honest per-move "reaching the family… / hasn't reached the family" state — never claim a cross-device move the worker hasn't confirmed. Depends on: D2, plus the queue regardless.

**T4 — Moves silently invisible or dishonestly reported. Certain without fixes; medium impact (honesty).**
No memory-change event bus → the move AND its note don't render until remount; `updateMemoryStop` returns success from the local write alone; the refile toast already overstates ("moved everywhere").
**Mitigation:** an invalidation hook (bump a store tick on `mergeFromRemote` and on any stopId patch) is **required** for the feature to be visible at all; the "moved because…" note must be synced data riding the memory (it arrives only where and when the move truly did). Depends on: note design (D4).

**T5 — Outbox drain reverts a move. Medium-high likelihood (stuck videos are a known reality — the whole foolproof-video arc); medium impact, very confusing.**
Queue items snapshot `stopId` at enqueue; the drain re-saves it hours later, undoing the heal — and under §3's default-manual rule it would get stamped *manual*, locking in the revert.
**Mitigation:** the drain must merge `stopId` + `stopProv` from the live record at drain time (or `saveMemory` gains preserve-on-undefined semantics for stopId, as it already has for `capturedAt`/interstitial/mask). Hard prerequisite, independent of every other choice.

**T6 — Trips-side LWW clobber and the forked device (shipped-phase F1/F2), amplified. Pre-existing, high likelihood under Phase 3.**
A stale device's `resyncPending` full-trip push erases another device's agenda edit family-wide (no base sent; server guard dead code) — then the matcher re-runs against the reverted agenda and the moves flip too. A permanently-stuck push (e.g. revoked session) forks a device forever with zero indicator (`unsyncedCount` rendered nowhere).
**Mitigation:** ship F1 (send `baseUpdatedAt` on `pushTrip` + 409 handling) and F2 (render the unsynced indicator) **before** auto-apply. Depends on: §5, prerequisite-grade.

**T7 — Oscillation and note-spam. Medium likelihood; medium impact (churny albums, two "moved because…" notes for one round trip).**
Threshold cliffs (150m/1000m) flip winners on small coordinate edits; implicit-base appear/disappear mass-moves base-filed memories; two devices on divergent trip versions ping-pong a memory; time edits flip time-bound photos.
**Mitigation:** track the runner-up and require a margin (winner beats runner-up and clears its threshold by ≥ max(100m, 25%)); never move to a worse-or-equal match; time-only never auto-moves (eliminates the time-edit class); stamp `tripRev` (the trip `updatedAt` the decision used) and only re-match on a strictly-newer, pulled-clean agenda; special-case orphaned `__trip_base__:*` ids as *repair* (moving is always better than a dangling id); per-memory direction-flip cooldown as backstop. Depends on: gate strictness (D3) + matcher plumbing (runner-up tracking is new, ~small).

**T8 — Surprise interactions: weave blank-out, cover jumps, share flips. Lower likelihood; severe-and-silent impact.**
Auto-refiling a *hidden* memory to an implicit-base id (not in `trip.days`) trips the fail-closed secrecy guard → **all** stored weaves for the trip withheld. A cover stand-in visibly jumps stops for the recipient with no explanation (the note is stripped by the projection allowlist — correctly, but silently). Moving a shared memory onto an unrevealed surprise stop 409s its live public link; place captions on published pages change silently.
**Mitigation:** v1 policy — the auto-matcher **skips any surprise-flagged memory entirely** and never targets an unrevealed surprise stop; the note surface flags share-affecting moves. Depends on: gate policy (D3), one-line worker checks.

**T9 — Weave staleness economics (F3/F4/F8 interaction). Medium likelihood; low-medium impact (cost/latency, stale ✦ cue — not data loss).**
Base-filed moves never invalidate the stored weave (server ignores implicit base); any auto-move on a past day permanently de-caches that day's weave (204 forever; the cron regenerates only one day of active trips); NULL-signature rows can never invalidate.
**Mitigation:** fix F3 (align server membership with `dayStopIds`), F8 (treat NULL sig as recompute for non-kept rows) before ship; decide F4 (persist on-demand rebuilds) knowingly. Depends on: §5.

**T10 — Interstitial bracket resurrection. Low likelihood; low-medium impact.**
A move onto a stop leaves the old `{before, after}` bracket dormant; a later null-refile resurrects a stale bracket; the server can never clear one (COALESCE, `index.js:1093`).
**Mitigation:** an honest move rewrites or explicitly clears the bracket — needs a small worker change to allow clearing (a sentinel or clear flag). Fine as a fast-follow if v1 never nulls a stopId.

*(Flag, not a threat: photoMatch buckets days by UTC while evidence.js is leg-local — two attribution regimes by design. Don't let 3a's tests pin UTC as a contract; the merge question belongs to 3b.)*

---

## 3. THE PROVENANCE FLAG DESIGN

**Where it lives: a real D1 column, via migration 017. Not a JSON ride-along, not client-only.** Grounded: the worker drops unknown fields (fixed column list + fixed `rowToMemory` shape), a pull erases client-only fields, and every candidate JSON column is either whitelist-reserialized, semantically entangled (surprises/reveal), or hazardous (wholesale-overwritten `reactions_json`; `photo_external_urls_json` weakens the photo-source 400 gate). The 007 migration states the house rule: per-memory-grain data earns a column.

**Shape — one column, one object.** The lock and the note are one fact and must never diverge, so they travel together:

- D1: `ALTER TABLE memories ADD COLUMN stop_prov_json TEXT` (migration `017_memory_stop_provenance.sql`, NULL back-compat per the 007 template).
- Client/API field `stopProv`:
  - `source`: `'auto' | 'manual'` — the lock.
  - `at` (ISO), `by` (traveler id, or `'matcher'` for worker moves) — who/when.
  - `movedFrom` (previous stopId or null), `reason` (short code: `'agenda-change' | 'stay-located' | 'orphan-repair' | 'import' | 'hand-filed'`) — the "moved because…" note's raw material; copy is rendered per-lens at display time, never stored as prose.
  - Auto-only extras: `matchType`, `distanceMeters`, `tripRev` (the trip `updatedAt` the decision was computed against — the anti-ping-pong stamp).

**Worker write rules (`postMemory`) — where the lock is actually enforced.** Plain `stop_id = excluded.stop_id` + COALESCE cannot express "manual beats auto," so the rule is JS, before the bind:

1. Incoming `stopId` equals stored `stop_id` → preserve stored `stop_prov_json` (COALESCE-style; no churn from ordinary re-saves).
2. Incoming `stopId` differs and the body carries `stopProv` → whitelist-reserialize it (house style). **If stored provenance is `manual` and incoming is `auto` with a different stopId → refuse the stop change** (keep stored `stop_id` + provenance; return the stored row). This makes the lock hold even against a stale device's blind reapply.
3. Incoming `stopId` differs with no `stopProv` → stamp `{source:'manual', at: now, by: token-traveler, movedFrom: stored, reason:'hand-filed'}`. Default-to-manual is the safe failure direction: a wrong `manual` only means auto stops touching that memory. (This rule is why the T5 outbox-drain fix is a hard prerequisite — a stale drain must not get itself stamped manual.)
4. `rowToMemory` emits `stopProv` omit-when-NULL. Worker auto-moves are guarded targeted UPDATEs (compare stored `updated_at`) so they can't clobber a simultaneous client push.

**Client rules.** `updateMemoryStop(memoryId, stopId, prov)` stamps `stopProv` atomically with the move; its reapply closure becomes provenance-aware — abort (adopt server) when `fresh.stopProv?.source === 'manual'`, and skip the push entirely when `fresh.stopId === stopId` (today it re-pushes content-identical writes). `mergeFromRemote` needs no change — the field rides the record. New writers stamp real provenance going forward: import matcher → `auto`; triage `photoBindings` → `manual`; composer-at-stop creation → `manual`; the Move-to sheet → `manual`; the "Sort to places" banner → `auto` (target is machine-computed; the confirm is batch-level, and stamping it auto lets later healing still refine it); worker heal → `auto`.

**Backfill semantics for existing memories: leave NULL, and NULL means "legacy" — neither auto nor manual.** Reasoning: every existing filing was machine-made at import (fact), so blanket-`manual` would permanently freeze the whole archive and gut the healing value ("only going forward" violates the backfill rule). But blanket-`auto` is wrong too: triage manual bindings and composer-at-stop creations were genuine human decisions that are indistinguishable in the data today, and the family has lived with these albums — a filed photo may have been silently relied on. So: **legacy memories are eligible for *repair only*** — auto-move only when currently unfiled (`stopId: null`) or orphaned (stopId absent from every day's `dayStopIds`, including vanished implicit bases). A filed legacy memory whose re-match says "somewhere else" becomes a *suggestion*, never a silent move. No data migration needed — NULL is the encoding; the first move or hand-filing stamps it.

**The auto-apply gate (all must hold), inheriting `refilePlaces`' conservatism:**
1. Match is `'gps+time'` — never `'time'` (the stay-default is a prior, not evidence).
2. Target eligibility — current filing is `null`, orphaned, or `source:'auto'`; `manual` never moves; legacy (NULL) per the repair-only rule above.
3. Margin — winner beats the runner-up and clears its own threshold by ≥ max(100m, 25%) (requires the small runner-up-tracking addition at `photoMatch.js:392`).
4. Whole-memory unanimity across located photos (`refilePlaces.js:65–68` precedent; interstitial-matched photos don't veto).
5. Fresher, pulled-clean agenda — trip `updatedAt` strictly newer than the memory's `tripRev`.
6. Not masked, not surprise-flagged, target not an unrevealed surprise stop, not inside the direction-flip cooldown.
Fails 1/3/4 but passes 2 → surface as a suggestion. Fails 2 → do nothing, silently.

---

## 4. DECISION MENU FOR JONATHAN

Plain language; what the family experiences. My recommendation is first in each. (Auto-apply itself is settled and not on this menu.)

**D1 — What can photos heal onto?**
- **(Recommended) Start with agenda places, built ready for named moments.** First release: photos re-file among the places on the trip's agenda (including "At the cabin"). The machinery is deliberately built so the *next* release can also heal photos onto the moments you name in the evening settle sheet ("Race Point Beach, 11–1") — where, honestly, most of the value lives for the stays we actually take. Trade-off: on a cabin week, release one mostly automates the "Sort to places" tap and fixes photos when the agenda changes; the settle-sheet payoff comes second. It's the sequence with the least chance of a wrong move while the safety layer is new.
- **Everything at once.** Photos heal onto agenda places *and* named settle-sheet moments from day one. Most value fastest, but it stacks the two riskiest design problems on top of brand-new safety machinery — the most wrong-silent-move surface in one step.
- **Agenda places only, permanently.** Simplest, but photos on hangout days stay one big "At the cabin" pile forever even after you've named the day's moments — it under-serves the trips this family actually takes.

**D2 — Who decides a move: one referee, or every phone for itself?**
- **(Recommended) The family's server decides; phones just receive.** One place computes every move, sees the *complete* truth (including surprises hidden from individual people — a phone literally can't see those, so a phone deciding moves can get them wrong), and every device receives the same move the same way it receives everything else. A move can never half-happen on one phone and be missing on the others. Trade-offs: the matching rules live in a second copy that must be kept in step (we add an automatic same-answers test, which the one existing mirror never got), and a move lands within about twenty seconds rather than instantly.
- **Each phone heals what it sees.** Feels instant on the phone that notices, but each phone sees a censored version of the trip (surprises), four phones redundantly compute the same answer, and a phone with bad signal can apply a move locally that never reaches anyone — the exact silent-divergence failure we're trying to kill. Needs a pile of extra guards and still can't fix the censored-view problem.
- **Phones propose, server referees.** The most machinery of all, and not safer than server-only.

**D3 — How bold is the automation, and what about the photos already filed?**
- **(Recommended) Strict + repair-first.** Only moves with real GPS evidence, a clear winner by a comfortable margin, and every photo in the memory agreeing — and anything a human ever placed is untouchable. Time-of-day guesses *never* move anything. Photos filed before this feature existed get healed only when they're genuinely broken (unfiled, or pointing at a place that no longer exists); if the system merely *thinks* an old filed photo belongs elsewhere, it asks instead of moving. You'll occasionally see a suggestion where you'd wish it had just acted — that's the cost of never being silently wrong.
- **Strict + full healing of old photos.** Same evidence bar, but old filed photos can also be silently moved when the evidence is strong. More healing; small risk of moving something someone had quietly relied on.
- **Repair-only everywhere.** Only ever fixes unfiled/orphaned photos, never moves a filed one. Nearly zero risk, but agenda edits stop healing anything already filed — most of the point evaporates.

**D4 — How does the family learn a photo moved?**
- **(Recommended) A quiet mark on the photo, with the full story one tap away.** Moved photos get a small permanent chip (like the existing "uploaded" mark), and opening the photo shows the plain sentence: what moved, from where, and why ("moved here when Tuesday's dinner changed to 7pm"). It syncs with the photo, so every device tells the same true story, days later, with nothing to dismiss. Per the design-loop rule this needs a short Claude Design prompt for the exact wording, placement, and per-person voice (Rafa shouldn't meet "moved because…" at all — his photos just appear in the right place; Aurelia's line lowercase) before the UI is built.
- **A pop-up message at move time.** Vanishes in seconds, appears only on one device, and says nothing to whoever opens the album tomorrow — dishonest by omission.
- **A card on the home screen.** Heavy new surface for what is usually a small tidy-up, and it rotates away before most people see it.

**D5 — Can a person move a photo by hand? (Today: no way to do it at all.)**
- **(Recommended) Yes — "Move to…" on the photo.** Next to "Edit date" in the photo view: pick the right place from a simple day-by-day list (the same sheet style the app already uses). Any adult can do it, and a hand-move **locks** that photo — the automation never second-guesses a person. This is also what makes the lock real: without a manual path, "manual beats auto" protects nothing.
- **Hand-moves plus multi-select batch moves.** More power, more surface; fine as a later addition once the single-photo move has settled.
- **No manual control.** Unacceptable alongside auto-apply — the family would have no way to overrule a wrong guess.

**D6 — What happens to the "Unfiled" pile and to near-miss guesses?**
- **(Recommended) Upgrade what exists; no new screen.** The "Unfiled" section stays where it is but explains itself ("couldn't match these — open one to file it"), each photo gets the Move-to control, and near-miss guesses reuse the existing two-step banner ("3 photos might belong at Rosa's — Move / Not now"). With auto-apply doing the confident cases, the residue is too small to justify a dedicated triage screen.
- **A dedicated "sort your photos" screen.** A real surface for a shrinking pile — clutter that would itself need the design loop.

**D7 — When does healing run?**
- **(Recommended) Right after an agenda change lands.** Edit the agenda and the album quietly settles within a minute or so, on every device — using the same change-fingerprint trick the Weave already uses, so it costs nothing when nothing changed. One quiet batch per change, not a drip of notes.
- **Overnight only.** Calmest possible; but the album stays visibly wrong all day after an agenda fix, which reads as "the app didn't notice."

---

## 5. SHIPPED-PHASE FIXES (from the Phase 1/2 audit)

Ranked. The first four are prerequisite-grade — auto-apply multiplies concurrent writers over exactly these holes.

1. **F1 — Trips get real conflict protection** (`pushTrip` sends `baseUpdatedAt`; handle the 409 the worker already implements at `index.js:1514–1538`). Today a stale phone's 20s resync silently erases another device's agenda edit family-wide — and Phase 3 would then re-match against the reverted agenda. Effort: **small–medium** (client-side base plumbing + a conflict path; server half exists as dead code).
2. **F2 — Show the stuck-sync truth.** `unsyncedCount` is plumbed and rendered nowhere; the SaveBadge shows a green check for "saved but never reached the family"; a forked device has zero indicator forever. "Moved because…" notes are worthless on a silently-forked device. Effort: **small** (render the count + an age on the queue entries + honest badge copy).
3. **F3 — Server weave learns the implicit base** (`buildBeatsServer`/`dayHasSharedMemory`/signature check use `dayStopIds` semantics, not bare `day.stops`). Today base-filed memories — the settled core trip shape — are invisible to the Phase-2 freshness guarantee, nightly weaves skip cabin days, and a kept page's signature never matches again. Phase 3 base-moves make the drift routine. Effort: **medium** (mirror the implicit-base derivation server-side + parity test).
4. **F8 — NULL `beat_signature` rows** treated as "recompute" for non-kept rows (or backfilled). One-line-ish; closes "serves pre-move content forever" before moves start happening. Effort: **small**.
5. **F5 — Serialize resync before refresh** (`await resyncPending()` then `refresh()`, `useTrips.js:296–301`). Kills the 20-second revert-flicker of your own edit. Effort: **small** (one line).
6. **F6 — Pull watchdog.** No fetch timeout; one hung pull latches `refreshingRef` and silently kills live-pull until relaunch (the iOS-PWA suspension class — this family's install mode). Effort: **small** (AbortSignal.timeout or latch-age check).
7. **F4 — Past-day weave regeneration path.** Every Phase-3 move on a past day permanently de-caches that day's stored weave (client rebuilds are never persisted; the cron regenerates one day). Cost/latency only — but decide it knowingly: persist on-demand rebuilds, or widen the cron. Effort: **medium**.

Batch per the deploy preference: gate each locally, push several together, one green-wait.

---

## 6. WHAT I DID NOT VERIFY

- **Live data contents.** No D1 queries were run. That every historical `capturedAt` (and per-ref capturedAt) carries a zone designator is unconfirmed — no schema enforces it, and the `updateMemoryCapturedAt` producer (dev date-override path) was not audited. The design therefore treats zone-less timestamps as unmatchable rather than assuming cleanliness.
- **iOS suspension stranding fetches** (F6) is PLAUSIBLE from code shape only — not reproduced on a device.
- **ThreadedMemories / ShareComposer behavior on unknown or record-entry stopIds** was flagged unchecked in the unification analysis; "nothing crashes on an unknown stopId" was verified for the major surfaces, not exhaustively for these two.
- **No usage telemetry exists** — the claim that most §12 value on stays lives in the record-entries bridge (D1) is structural reasoning, not measurement.
- **Cross-engine floating-point** (JavaScriptCore vs V8 last-ulp trig differences at exact threshold distances) is asserted negligible on theory; unmeasured — the margin gate makes it moot regardless.
- **Round-1 vs round-2 conflicts were resolved in round 2's favor** per the stated rule, and I independently re-verified six of the most load-bearing claims this session (no provenance field; migration 016 highest; the field-blind reapply closure verbatim; `pushTrip` without OCC base; `unsyncedCount` with zero consumers; the silent mirror swallow). Two round-1 claims are explicitly corrected in this document: "a JSON column can carry the flag without a migration" (refuted — §3) and "the weave signature already fully covers re-filing" (true only for planned-stop moves; implicit-base moves are blind — F3/T9). All other citations trust round-2's re-derivation against `06656ef` and were not individually re-checked this session.
- **Worker-side matcher feasibility** was established from code reading (pure module, mirrorable imports, per-ref data availability), but no worker-bundle build of `photoMatch.js` was actually attempted.
---

## critique-0

All suspicions verified against live code. Assembling the ranked findings.

RANKED FINDINGS — data-integrity / distributed-correctness attack on the Phase 3 synthesis. Verified against `fix/foolproof-video-import` @ `06656ef` this session. The synthesis survives several of its own claims (worker rules for the direct auto-vs-manual arrival race, gate 1 for GPS-blind bulk memories, D2 for masked-view matching, F1's framing of the trips clobber) — but it has eight real holes, the top three prerequisite-grade.

---

**1. Deletes/tombstones are entirely absent from the threat model — and every Phase-3 write path is a resurrection gun.**
The word "delete" never appears in §2/§3; T1–T10 model no delete interaction. The code makes this lethal:

- Scenario: Helen deletes memory M (worker soft-deletes, bumps `updated_at` — `worker/src/index.js:1136-1138`; her client tombstone is cleared on confirm — `memoryStore.js:574`, so no client guard remains anywhere). Jonathan's device is a pull behind and still shows M. He uses the new D5 "Move to…" (or any caption edit, or a heal-409'd reapply): push carries a stale base → 409 (memory OCC read has no `deleted_at` filter, `index.js:898-901`) → `resolveSaveConflict` pulls fresh; `getMemories` serves tombstones (`index.js:852-857`, `rowToMemory` emits `deletedAt` at :1411); the guard checks only `!fresh || fresh.masked` — **never `fresh.deletedAt`** (`memoryStore.js:535`) → reapply re-pushes onto the tombstone with the tombstone's own `updatedAt` as base → OCC passes → the upsert's `ON CONFLICT … deleted_at = NULL` (`index.js:1101`) **resurrects M family-wide**, and under proposed worker rule 3 stamps it `manual` — locked against healing, attributed to Jonathan.
- Trips are worse: the postTrip OCC read filters `deleted_at IS NULL` (`index.js:1526`), so for a deleted trip `storedRow` is null and the 409 check is **skipped** (:1532) → a stale device's `resyncPending` re-push resurrects the trip directly via :1578 — meaning **F1 as specified does not close trip resurrection at all**.
- Why the synthesis fails it: worker rules 1–3 (§3) never consult `deleted_at`; the heal's guarded UPDATE is specified but the matcher's read-set filter isn't; §5 lists no delete-related prerequisite. Phase 3 multiplies exactly the traffic (heal-induced `updated_at` bumps → more 409s → more `resolveSaveConflict` runs; D5 → more deliberate stale-device moves) that fires this gun.
- Fix: `resolveSaveConflict` must treat `fresh.deletedAt` as adopt-the-delete (drop local, never re-push); postMemory upsert preserves `deleted_at` (no implicit un-delete); worker matcher reads and manual-move writes filter/refuse `deleted_at IS NOT NULL`; the trip OCC read must include tombstoned rows. Add this to §5 as prerequisite-grade.

**2. The cardinal sin survives via the offline path: an offline manual move is silently erased by a later auto-heal — and the synthesis's two proposed fixes contradict each other.**
- Scenario: at the cabin (no signal), Jonathan hand-moves M to S1. `updateMemoryStop` patches locally (device stamp T1) and mirrors; the push fails and is **swallowed with no queue** (`memoryStore.js:584-592`). Agenda syncs from Helen's phone; the worker heal later moves M to S2 (server stamp T2 > T1). Jonathan reconnects: pull → `shouldTakeRemote` (:677, `remote.updatedAt > local.updatedAt`) → `mergeFromRemote` wholesale-replaces the record (:648; `preserveLocalPhotoMeta` :692-731 carries only EXIF/poster/interstitial — provenance and stopId are not preserved). The manual move and its `manual` stopProv vanish with zero trace; worker rule 2 never fires because the manual write never arrived.
- Why the synthesis fails it: T1's mitigation enforces the lock only at match time, in the reapply, and in the worker upsert — all require the manual write to *arrive*. T3 offers "a memory-save retry queue … **or at minimum** an honest per-move state"; the "at minimum" branch leaves the clobber standing. Worse, T5's prescription ("the drain must merge stopId + stopProv **from the live record** at drain time") applied to any retry queue destroys the fix: after the pull already replaced local with the heal, merging-from-live re-pushes the *auto* state. The queue must replay stored *intent* (`{memoryId, stopId, prov}` via a provenance-aware reapply) — the exact opposite semantics of the T5 drain fix — and the synthesis never distinguishes the two.
- Fix: make the retry queue mandatory (not "at minimum") and intent-based; additionally teach `mergeFromRemote` to carry a pending-unsynced `manual` stopProv forward (same pattern as `preserveLocalPhotoMeta`) and re-fire the push, mirroring how tombstones self-heal at :618-621.

**3. Heal reverts that never trip OCC: `saveMemory` pairs stale field values with a live base, and the no-reapply 409 branch re-imposes whole stale records.**
- Scenario A (no 409 at all): a video sits in the outbox with enqueue-time `item.stopId` (`photoBackfillUpload.js:219-229`). The worker heal moves M; the device *pulls the heal* (local record fresh). The drain (`App.jsx` `uploadQueueRunner`, ~:206-212) calls `saveMemory({... stopId: item.stopId ...})`: `saveMemory` takes `stopId` verbatim — the one field family with **no preserve-on-undefined** (contrast capturedAt/interstitial/mask, `memoryStore.js:176-293`) — but re-reads `serverUpdatedAt` **live** at save time (:326). Stale payload + fresh base → the push **passes** the 409 guard → silent revert, then stamped `manual/hand-filed` by proposed rule 3, misattributed to the item's author. The synthesis's T5 narrative ("a stuck video reverts any later move" via snapshot re-save) undersells it: OCC — the layer the design leans on — is structurally blind to this shape, and there are **three** drain copies (`uploadQueueRunner`, `PhotosView.triggerDrain`, `uploadOrQueueVideo` — the code comments say they're deliberate mirrors), not just the two cites in the synthesis.
- Scenario B (the 409 branch): any full-record save *without* a reapply closure — `saveMemory`'s own mirror is `scheduleMirror({type:'save', record})` with no reapply (:338) — that 409s against a heal executes `merged = { ...op.record }` (`memoryStore.js:536`, "foreground → last deliberate edit wins") → the **entire stale snapshot** is re-pushed over the fresh row: stopId, caption, reactions, everything. Every heal bumps `updated_at`, so Phase 3 turns this from a rare race into routine traffic.
- Fix: preserve-on-undefined for `stopId`+`stopProv` in `saveMemory` (and stop passing stopId from all three drains); give the drains a gap-fill reapply like `updateMemoryPoster`'s (:877); the "last deliberate edit wins" no-reapply default must at minimum exclude stopId/stopProv once provenance exists.

**4. F1 as scoped cannot protect the most common cross-device edit, and gate 5's `tripRev` is specified against a non-monotonic field clients can't even see correctly.**
- Verified: trips' row `updated_at` is server-stamped (`index.js:1565`) but `getTrips` returns only `JSON.parse(data_json)` + date overlays (:1451-1457) — the row stamp is emitted **only on push responses** (:1587). So the client-visible `trip.updatedAt` is the last editor's *device clock* inside `data_json`, and a device that has only ever *pulled* a trip (Helen editing an agenda Jonathan created — the normal case) **has no server base to send**. F1 as written ("client-side base plumbing + a conflict path; server half exists as dead code") ships a guard those pushes bypass un-based → the T6 LWW clobber persists exactly where it matters, and §5's prerequisite is partially theater. F1 needs a worker change too: `getTrips` must emit the row's `updated_at`.
- Consequently `tripRev` (gate 5, the anti-oscillation keystone) must be pinned to the **row** stamp read worker-side. Captured from the pulled object's `trip.updatedAt`, it inherits device-clock skew: a behind-clock editor's agenda change yields `updatedAt` older than stored `tripRev` → "strictly newer" never passes → **healing silently stops for that trip**; an ahead-clock editor inflates it → later real edits can't re-trigger. The synthesis leaves the source ambiguous.

**5. Implicit-base ids are date-keyed, not place-keyed: a lodging edit silently re-labels every base-filed photo, the synthesis's orphan test can never fire on it — and the transient case turns the proposed damping against itself.**
- Verified: `implicitBaseIdForDay` = `__trip_base__:<isoDate>` (`photoMatch.js:158-161`); the place it denotes is re-derived from *current* lodging (`tripImplicitBase`, :203-228; `dayStopIds` :243-249).
- Scenario A (permanent, invisible): the family corrects the lodging (different cabin, fixed address). Same ids now denote a different physical place; every base-filed memory — auto, legacy-NULL, and *manual* — silently displays under the new place's name. The orphan test ("stopId absent from every day's `dayStopIds`") returns false (the id still resolves), so legacy repair never fires; gate 1 can't move them (old-place GPS matches nothing → 'time' → blocked). No move, no note, permanently wrong label — the "wrong silent" class the prime directive forbids, unreachable by every §3 guard.
- Scenario B (transient): lodging cleared-then-retyped = two pushes seconds apart. On the intermediate state `tripImplicitBase` → null → **all** base filings orphan at once → D7 ("right after an agenda change lands") heals them; photos within 1000m of any dinner pass the full strict gate (gps+time, margin trivially cleared with no competitor, unanimity) → mass-scatter onto restaurants. Lodging returns → the move *back* is blocked by the direction-flip cooldown proposed as the backstop. **The damping freezes the wrong state instead of preventing it.**
- Fix: stamp base identity (anchor coords or a lodging fingerprint) into `stopProv` and treat anchor-moved-beyond-footprint as orphaned; debounce heal runs on agenda quiescence (N minutes stable), not on landing; never orphan-repair off a base id that resolved within the last M minutes.

**6. Worker rule 3 applied to inserts poisons provenance at scale during the stale-SW rollout window.**
Rules 1–3 (§3) are written for the conflict/update path; the insert path is unspecified, and the natural implementation (same rule: "stopId differs, no stopProv → stamp manual/hand-filed") misfires on every memory a stale client creates. Stale SW on family devices is a documented recurring reality in this repo, and an old-app *import* pushes brand-new machine-matched memories with `stopId` set and no `stopProv` → whole imports get manual-locked (healing gutted for them forever) and falsely recorded as hand-filed by whichever person's token pushed. Default-to-manual is the safe direction for *stop changes on existing rows* only. Fix: on INSERT with no `stopProv`, stamp NULL — the legacy/repair-eligible semantics §3 already defines — and reserve the manual default for a changed `stop_id` on an existing row.

**7. Overlapping heal runs do not converge to the latest agenda — the Weave precedent is compare-on-READ, this is compare-on-WRITE.**
Two agenda edits seconds apart (fix the time, then the name — normal editing) → two worker heal runs overlap. Run 2 (fresher agenda) reads before run 1 writes; run 1's guarded UPDATE lands and bumps `updated_at`; run 2's `WHERE updated_at = <pre-run-1>` guard no-ops → the *fresher* decision is silently dropped, and nothing re-triggers until the next agenda edit — which may never come (the last edit of a trip). The `beatSignature` mechanism the synthesis cites as precedent self-corrects because it re-compares on every read (`index.js:3252-3282`); a write-side heal needs an explicit quiesce loop (after applying, re-read the trip row's `updated_at`; if it moved during the run, re-run) or per-trip run serialization. The synthesis specifies neither.

**8. Clock skew blocks heal propagation on exactly the devices that edited the memory — a half-fixed asymmetry the codebase already documents.**
`shouldTakeRemote` compares device-ISO vs server-ISO strings (`memoryStore.js:677`). Any local edit on a clock-ahead device (a mis-clocked kid's iPad) leaves `updatedAt` in the server's future; every subsequent heal to that memory is refused on pull until server time passes the stamp — the move and its "moved because…" note are invisible there for the skew duration, violating D4's "every device tells the same true story." The conflict path already server-stamps local `updatedAt` for precisely this reason (:541-548), but the ordinary success path records only `serverUpdatedAt` (:580-583), leaving the future-dated LWW stamp live. Fix: restamp local `updatedAt` from the push response everywhere (extend :548's rationale to :580-583), or prefer `serverUpdatedAt` in `shouldTakeRemote` when both sides carry it.

---

Checked and NOT holes (existing guards or the synthesis's own design demonstrably cover them): the direct auto-vs-manual arrival race in both orderings (worker rule 2 + guarded UPDATE + provenance-aware reapply, given finding 2's queue); stale-auto-over-newer-auto (subsumed by finding 3's vehicle); GPS-blind bulk memories auto-moving (gate 1); client matching against masked views (D2 worker-side); a stop deleted under a healed memory (next-edit orphan repair); zone-less `capturedAt` (§6 already treats as unmatchable); memory `updated_at` monotonicity (server-stamped, `index.js:909-910` — trips were the problem, finding 4); the weave ALL_SECRET blank-out (real — `weaveGen.js` hidden-memory pass maps via `d.stops` only and returns ALL_SECRET on an unmappable hidden stop_id, and is in fact already reachable today via `refilePlaces` filing a hidden memory to a base id — but T8's skip-surprises policy plus F3 own it).

Key files: `/Users/jjackson/dev/roadtrip/worker/src/index.js`, `/Users/jjackson/dev/roadtrip/app/src/lib/memoryStore.js`, `/Users/jjackson/dev/roadtrip/app/src/lib/photoMatch.js`, `/Users/jjackson/dev/roadtrip/app/src/lib/deleteTombstones.js`, `/Users/jjackson/dev/roadtrip/app/src/hooks/useTrips.js`, `/Users/jjackson/dev/roadtrip/app/src/App.jsx`, `/Users/jjackson/dev/roadtrip/app/src/lib/photoBackfillUpload.js`, `/Users/jjackson/dev/roadtrip/worker/src/weaveGen.js`.
---

## critique-1

All verification complete. Here is the review.

---

# ADVERSARIAL REVIEW — family-experience lens on the Phase 3 synthesis

**Verdict: does not fully survive.** The plan already covers most of the classic failures I went hunting for (manual-clobber, outbox revert, surprise skip-list, weave staleness, the sync fork). But seven concrete family-experience failures remain, ranked. Each was verified against UI code at `06656ef`, not taken from the synthesis's own citations.

---

**1. The photos already in the app mostly cannot keep the §12 promise — and the decision menu never tells Jonathan.**
Verified: bulk-import refs persist no GPS (`app/src/lib/photoBackfillUpload.js:187` — `baseRef = {kind, mime, capturedAt}`; only `PhotoBackfillTriage`/`ImportFlow` transient EXIF objects ever hold `lat`, and album `exifLat` reads `ref?.lat` which nothing in the import path writes — `app/src/lib/photoEntries.js:100`). Gate #1 says only `gps+time` moves. So the archive's misfiled photos — Helen's beach-afternoon shots from the June cabin week, filed under a bottom-of-album section literally titled "In transit" with no date (`photoEntries.js:240,260` — no clock stops on a lazy day means before/after are null) — are the *exact* photos Jonathan's own §12 words describe ("not stuck forever against the plan as it looked at import time"), and they can never self-heal, even after he names "Race Point Beach." Only photos imported *after* the release heal. D1/D7's pitch ("Edit the agenda and the album quietly settles") reads to a non-coder as "my album fixes itself." He will approve expecting retroactive healing and get none.
**Fix:** one plain sentence in the menu: "Photos already imported mostly can't heal themselves — we didn't keep their location at import; they get the ask-first banner and the Move-to control instead." Persist ref GPS going forward (planned), and name the kept-record-entry bridge (`evidence.js:236–243` entries already store `lat/lng` + member `memoryIds`) as the archive's only real healing path — in release one or as an explicitly priced deferral.

**2. Release one's trigger is wired to the surface the family doesn't use on the dominant trip shape.**
Verified: the evening settle sheet and `dayRecord` **never write `day.stops`** (`app/src/views/SettleSheet.jsx:6` "nothing here writes to the plan"; `app/src/lib/dayRecord.js:9,242`). D7 fires healing on *agenda* changes; but on a hangout-at-a-place trip, after-the-fact truth gets named in the nightly record, not by back-editing the agenda. So on the trips this family actually takes, release-one auto-heal ~never fires; its value concentrates on the rare shape where someone edits planned stops. That is the repo's road-trip gravity acting through the back door.
**Fix:** either give release one a minimal record bridge (a kept record entry with coords triggers the same heal path, even if only as suggestions), or rewrite the D1/D7 pitches honestly: "on a cabin week you'll mostly see this when plans change mid-trip; healing from the nightly 'name the day' is release two." Jonathan must not pick D1-option-1 believing it listens to the settle sheet.

**3. The "moved because…" note cannot tell its story for the most common move.**
The raw material is `movedFrom` (a stopId) + a reason code, with prose rendered at display time. But orphan-repair and agenda-change moves happen precisely *because the old stop no longer exists* — and verified, names resolve only from live `trip.days` (`photoEntries.js:297,304`: a dead id renders "Unfiled"; trips keep no stop tombstones). So Aurelia taps the chip and gets "moved here from —" or a raw id: dev-speak by accident, on every device, forever. Bonus verified confusion the plan can cite in its favor: today each dead stopId becomes its *own* bottom-sorted section titled "Unfiled" (one bucket per sid), so an agenda cleanup can leave three sections all named "Unfiled" — orphan repair genuinely fixes a real mess.
**Fix:** snapshot the human labels into `stopProv` at decision time (`movedFromLabel`, `targetLabel`); render family prose from the snapshot, keep codes for logic only.

**4. Suggestions and the Move-to control leak onto kid lenses — and, moved worker-side, across masked views.**
Verified: the existing two-step banner D6 reuses has **no persona gate** (`app/src/views/PhotosView.jsx:364–397`), and both kid lenses route into this shared PhotosView (`RafaView.jsx:524`, `AureliaView.jsx:264`) — Rafa on the iPad can already meet "12 photos belong at 'At the cabin'. Sort them →" and "Everyone will see the change." The SyncPill/PhotoTile Rafa-gentling precedent exists three lines away (`PhotosView.jsx:443–448`, `PhotoAlbum.jsx:65–75`) but was never applied to the banner. Meanwhile D2 moves computation to the worker, and the synthesis never says suggestions are projected per-viewer: teasers are *dropped entirely* from the hidden-from person's album (`surprises.js:229–230`), so a worker-computed "3 photos might belong at Rosa's" shown to Helen when she can see 1 says "there are two photos somewhere you're not allowed to see" — a surprise leak by arithmetic. Gate 6 as written covers only auto-apply; the suggestion rule ("fails 1/3/4 but passes 2 → suggestion") never mentions gate 6.
**Fix:** banner + Move-to are adult-lens only (jonathan/helen), matching the SyncPill precedent; suggestions pass through the same `maskForViewer` projection as memories and inherit gate 6 verbatim (skip surprise-flagged memories AND unrevealed-surprise-stop targets). Pin this in the spec, not the design prompt.

**5. A heal landing mid-evening yanks the album while someone is inside it.**
The plan *requires* the invalidation hook (T4), which means pull-driven regrouping now fires while the view is open. Verified: the lightbox re-resolve effect (`PhotosView.jsx:97–117`) finds the moved photo in its NEW group and silently swaps the sibling list — Helen, swiping through Tuesday-dinner photos during the sofa recap, is suddenly swiping "At the cabin" photos; below the lightbox, sections reflow under her thumb. This is the "photo vanishing from the section you were just looking at," upgraded to happening mid-gesture.
**Fix:** apply remote-driven regroup only when idle — never while a lightbox is open or a scroll is in flight; freeze the open group's entry list and reconcile on close/next entry. The chip tells the story afterwards. (The plan's hook is necessary; it just needs this one deferral rule.)

**6. Rule 3 can put a family member's name on a move they never made.**
Worker rule 3 stamps any prov-less stop change `{source:'manual', by: token-traveler, reason:'hand-filed'}`. Verified the live vector: both drain runners re-save the enqueue-time `stopId` wholesale (`PhotosView.jsx:221–230`, mirrored in App.jsx) — the stuck-video-drains-at-home reality this repo just spent a whole arc on. A stale drain or any old-SW device re-save that survives OCC would then be recorded as a deliberate hand move — and the D4 story surface would tell Helen "Jonathan moved this here" about a revert no human performed, while the manual lock freezes the wrong filing. Wrong *attribution* is a different family injury than wrong placement: it manufactures a person to blame.
**Fix:** the T5 drain fix stays prerequisite; additionally, only the explicit Move-to path (which sends `stopProv`) may earn `by: person` / 'hand-filed'. A prov-less stop change stamps `source:'manual'` (safe direction) but `by: null, reason:'unknown'`, and note copy never names a person for an inferred stamp.

**7. A permanent per-photo chip fights the calm album (lighter).**
Every existing tile chip is a *transient state* (on-its-way, stuck, saving — `PhotoAlbum.jsx:232–299`), not a forever-mark. After one healthy agenda edit, a dozen photos in Helen's linen-calm album each wear a permanent badge, which reads as "something is wrong with all of these." Rafa's tiles must never carry it at all (the plan says so for the note; the chip is the note's doorway).
**Fix:** permanent story lives in the lightbox; the tile chip goes quiet after first viewing (or becomes one section-level line: "3 photos moved here when the day changed"). The D4 Claude Design prompt the plan already mandates must describe the existing transient-chip system in detail so this tension is decided there, not discovered on-device.

---

**What I attacked and the plan survived:** auto-clobbering a manual fix (three-point lock incl. server-side is sound); the silent half-applied move (D2 server authority kills the client-mirror hole); the masked-photo *auto-move* leak (gate 6 covers auto; only the suggestion path was open — #4); the weave narrating a moved-on day (F3/F8 are correctly prerequisite-grade; verified TheWeave is fetch-on-open, no mid-view yank); "unfiled as homework" is mostly answered by D6's no-new-screen stance — the copy just needs permission-to-ignore phrasing ("they're safe here") rather than an instruction ("open one to file it"), and it must also cover the "In transit"/"From A to B" sections, which are the second flavor of not-really-filed the family actually sees on stays.

Files load-bearing for the findings: `/Users/jjackson/dev/roadtrip/app/src/views/PhotosView.jsx`, `/Users/jjackson/dev/roadtrip/app/src/lib/photoEntries.js`, `/Users/jjackson/dev/roadtrip/app/src/lib/photoMatch.js`, `/Users/jjackson/dev/roadtrip/app/src/lib/photoBackfillUpload.js`, `/Users/jjackson/dev/roadtrip/app/src/lib/surprises.js`, `/Users/jjackson/dev/roadtrip/app/src/lib/memoryStore.js`, `/Users/jjackson/dev/roadtrip/app/src/views/SettleSheet.jsx`, `/Users/jjackson/dev/roadtrip/app/src/lib/dayRecord.js`, `/Users/jjackson/dev/roadtrip/FAMILY_TRIPS_VISION.md` (§12).
---

## critique-2

Verified against the live tree at `06656ef` before ranking (files cited below were read this session). The synthesis is strong on data-model and threat analysis but is missing several whole workstreams. Ranked list of genuine omissions:

**1. The propagation channel it relies on does not exist — memories have no periodic pull.**
D2 promises worker-side moves "land within about twenty seconds via the existing 20s pull." Verified false for memories: `pullAll → mergeFromRemote` runs only on cold load and `visibilitychange→visible` (`app/src/App.jsx` ~433–521); the 20s intervals are the upload-queue *drain* (App.jsx:513) and the trips resync/re-pull (`app/src/hooks/useTrips.js:284–316`). Phase 1's live pull (`c5bcc58`) was trips-only. As designed, a worker auto-move and its "moved because…" note appear on other open devices only after backgrounding or relaunch — hours later on a propped-up kitchen iPad. Missing component: a periodic memory pull (piggyback on the trips heartbeat or an interval around `runSync`, which already has `SYNC_THROTTLE_MS`), plus a cost decision — `pullAll` every ~20s on a multi-year archive needs a `?since=`/delta or trip-scoped variant. This item also carries the T4 honesty claims, so it is prerequisite-grade, and it is interval-driven (see 2).

**2. No test plan at all, and the repo's actual gates constrain the design in unstated ways.**
Verified: app unit = `node --test scripts/__tests__/*.test.mjs` (`app/package.json:16`; `photoMatch.js`'s import chain is plain `.js`, so the runner-up/margin change is unit-gateable there); worker = vitest + `@cloudflare/vitest-pool-workers` with local D1/R2 (`worker/package.json`, `worker/test/`); e2e = chromium + webkit-mobile with **all network page.route-mocked** (`deploy-worker.yml` comments). Consequences the synthesis never draws: (a) e2e can never exercise the worker matcher or the postMemory rule matrix — the entire auto-move behavior is gateable only in worker vitest; e2e can only verify arrival/rendering from mocked pull payloads carrying `stopProv`; (b) the new memory pull, F1's resync-409 path, and D7 latency are interval-driven → chromium-only (page.clock never fires a live setInterval on WebKit); (c) day-window matcher tests must run TZ=UTC locally. The promised "automatic same-answers test" for the client/worker matcher mirror has no stated home — concrete: a worker vitest file importing both `app/src/lib/photoMatch.js` and the worker mirror over one shared fixture corpus, living in the suite that already gates worker deploys. Missing: the per-behavior gate map (worker rules 1–4 matrix incl. refusal + insert paths, gates 1–6 truth table, outbox-drain merge test, margin unit tests).

**3. Rollout sequencing and the mixed-fleet window are entirely absent.**
(a) *Migration ordering:* `deploy-worker.yml` runs `npx wrangler deploy` only — no `d1 migrations apply` step; per WORKING_AGREEMENT G9, D1 migrations are a manual, D1-Edit-token step. New worker code INSERTs an explicit column list including `stop_prov_json`; if the push deploys before 017 is applied manually, every memory write 500s. Required order (apply 017 first — safe under old code — then push) is nowhere in the plan. (b) *Old-SW clients* (a known recurring gotcha) send stop changes with no `stopProv` until refreshed: worker rule 3 stamps them `manual`, so the old client's machine-driven "Sort to places" moves get mis-locked — and worse, verified at `memoryStore.js:526–558`: a foreground save without a reapply closure resolves a 409 by re-pushing the whole local record ("last deliberate edit wins", `{...op.record}`), so a mere caption edit on a device that hasn't pulled a worker auto-move will revert the move AND lock the reversion as manual. The synthesis fixes only `updateMemoryStop`'s closure; the generic foreground reapply is a fourth enforcement point it never touches (make it stop-field-aware: preserve `fresh.stopId/stopProv` unless the op is a move), and auto-apply should not enable until the SW fleet saturates (see 4). (c) *Insert path unspecified:* rules 1–3 compare incoming vs stored; a brand-new memory has no stored row — spec that a bare-stopId insert lands NULL/legacy (not rule-3 manual) and new-client imports stamp auto.

**4. No kill switch, no shadow mode, no staged enablement.**
Auto-apply mutates family data in the background; push=deploy; rollback costs a full green-wait. Missing: a worker-side flag (precedent: the `WEAVE_MODEL` knob, `ADMIN_DIAGNOSTIC_KEY`; a secret can be flipped without a git push) with off / shadow / on. Shadow mode — compute and log would-move decisions, apply nothing — run for a stretch against real data is the only way to measure the wrong-move rate before the family sees it (§6 admits no telemetry exists), and it is what makes 3(b)'s "wait for SW saturation" enforceable.

**5. No durable audit trail — `stopProv` is a single slot the next move overwrites.**
Angle (f) fails as designed: after a human corrects a wrong auto-move, the evidence of the wrong move is gone (the slot now reads manual); a bad matcher release can't even be enumerated afterward; Workers logs aren't retained. Concrete: since 017 is being minted anyway, include an append-only `memory_stop_moves` table (memory_id, from_stop, to_stop, source, reason, trip_rev, at, by), written worker-side on every accepted stop change, prunable — or a bounded `history[]` inside `stop_prov_json`. And name D1 Time Travel (30-day point-in-time restore) as the disaster backstop; the plan currently has no recovery story for a bad bulk move.

**6. Suggestions have no mechanism.**
D3 ("asks instead of moving" for legacy) and D6 ("might belong at Rosa's" banner) depend on suggestions, but nothing says where they are computed, stored, or synced. If clients recompute them locally, the synthesis's own D2 argument applies verbatim: a phone computing suggestions against its masked view can suggest wrongly or leak surprise shape. If the worker computes them, they need a carrier and a synced dismissal state (so "Not now" on one device doesn't re-nag three others). Missing entirely; simplest honest v1 is worker-computed suggestion objects riding the pull with per-person dismissal.

**7. Trigger coverage stops at postTrip.**
Verified: scheduled reveals write memories and trips directly inside the cron handler (`worker/src/index.js:440+`, `runScheduledReveals` / `runScheduledTripReveals` / per-stop variant), bypassing any postTrip hook — so under gate 6 the natural heal moment for a surprise's photos is reveal time, which the proposed trigger never fires on. Also uncovered: "Edit date" (`updateMemoryCapturedAt`) changes the matcher's input and re-runs nothing; composer-created unfiled memories heal only if the agenda happens to change. Concrete: the existing daily cron (`crons = ["0 8 * * *"]`, `worker/wrangler.toml:49–50`) should carry a repair/post-reveal sweep alongside the postTrip trigger — D7's menu falsely presents event-vs-overnight as either/or when the complete design is both. Also spec postTrip healing as `ctx.waitUntil`, not inline request latency.

**8. Scope and decision-gate bookkeeping.**
(i) §5's F1–F8 rework shipped Phase 1/2 and the weave server; the synthesis asserts four as prerequisites but they appear on no menu — per the agreement they need a one-line surface to Jonathan as added scope, not silent inclusion. (ii) Migration 017 is itself a schema decision gate and takes the number the deferred Rafa "Ask for a trip" work was waiting on (its migration becomes 018) — one line so the collision is conscious. (iii) D5's Move-to sheet is a new surface/interaction; the loop-Design rule the synthesis applies to D4 applies to D5 too. (iv) Leaving legacy bulk imports GPS-blind forever is exactly the "only going forward → backfill old data" pattern Jonathan has corrected before: originals are in R2 and the client already owns the EXIF extractor, so a one-time client-side re-extraction backfill (fetch original → parse → push per-ref lat/lng through the existing `photo_r2_keys_json` path; no new dep, keyless) is feasible and belongs on the menu — without it the largest population is doubly ineligible (legacy AND GPS-blind) and the headline feature barely touches the existing archive.

**9. Client handling of a worker refusal is unspecified.**
Rule 2 returns the stored row when the worker refuses an auto-over-manual change, but the mirror path only reads `res.updatedAt` (`recordServerUpdatedAt`, `memoryStore.js` ~495–560) — nothing adopts a refused result, so the refusing device keeps displaying its refused move until the next pull (per finding 1, possibly hours). Spec: `pushMemory` response handling must detect "server kept a different stopId" and write the server row locally (the sync-honesty rule: read the honest per-item result, never success alone).

**10. Angle (e), `?trip=` §8 — checked; no proposed trigger interacts, two guardrails to write down.**
Healing is worker-side, the note lives in the photo view, and suggestions render inside an already-mounted trip, so nothing new reads `?trip=` at mount. Residual: (i) any "photos moved" affordance must navigate via in-app state, never a `?trip=` URL — a deep link to a trip this device hasn't pulled silently falls through to the index and never re-resolves (WORKING_AGREEMENT §8, OPEN); (ii) every cross-device move-arrival e2e must seed the trip into local cache first, the documented sidestep.

Minor confirmations, no action: zone-less `capturedAt` parses deterministically as UTC on the worker (workerd runs UTC), so "treat as unmatchable" is a policy choice, not a correctness need, server-side; the parity test's cross-package import is viable in either runner since `photoMatch.js`'s chain uses explicit `.js` extensions.