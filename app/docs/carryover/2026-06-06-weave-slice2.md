# CARRYOVER — THE WEAVE slice 2 (video keepsake)

> **Read `WORKING_AGREEMENT.md` first and hold to it. This carryover is a POINTER, not truth —
> re-derive every load-bearing claim (SHAs, file:line, "it works") from the code/tests yourself (§1).
> Confirm real HEAD/branch/tree before acting.**

---

## What this is

Build the **video keepsake** for the Weave: render the woven page's staggered animation to a
portrait 1080×1350 MP4 and hand it to the OS share sheet → Save to Apple Photos. This is the
design's flagship artifact ("An image of a motion artifact is not worthwhile" — Jonathan).

Slice 1 (the on-screen woven page) is **done and deployed**. Slice 2 adds the Save button and
encodes the video. No worker changes needed — this is entirely client-side.

---

## Verified state going in

**HEAD `3fb0e74` · branch `main` · clean · local == origin** (verify with `git fetch` before
acting — a concurrent session wrote to main before; always re-fetch before committing).

**Test counts as of HEAD:**
- Worker: 64/64
- App unit (`npm test`): 298 pass / 1 pre-existing fail (claudeSystemPrompt — unchanged)
- E2e chromium: 125/125 (includes 5 weave-braid + 4 axe weave)

**Redesign status:** ALL FOUR LENSES + cross-cutting COMPLETE.
- Jonathan `173f7ff`, Helen `26f5b6f`, Aurelia `ae83798`, Rafa `01e3ec1`
- Dead-code, FamilyDock, InstallIdentity, identity-dot consolidation: all shipped
- No redesign work remains before slice 2 — build directly on top of HEAD

---

## What slice 1 built (ground truth — re-read the files)

Key files (read before touching anything):
- `app/src/views/TheWeave.jsx` — full-screen overlay; the on-screen woven page
- `app/src/lib/weave.js` — `selectWeaveDay`, `buildBeats`, `fetchWeaveNarrative`
- `app/src/lib/driveRoute.js` — `fetchRoadRoute(stops)` → real road miles via worker `/route`
- `worker/src/index.js` — `POST /weave` endpoint (Claude Haiku → `{title, opening, closing}`)
- `app/src/workers/encodeVideo.worker.js` — the EXISTING WebCodecs encode worker (reuse this)
- `app/src/lib/videoPipeline.js` — the EXISTING main-thread orchestrator for the encode worker
- `app/tests/e2e/weave-braid.spec.js` — 5 acceptance tests (all passing)
- `app/tests/e2e/a11y-axe.spec.js` — TheWeave axe gate ×4 personas (all passing)
- `worker/test/weave.test.js` — 9 worker unit tests (all passing)

**What the on-screen Weave does (verified against TheWeave.jsx):**
1. `selectWeaveDay` picks a day (active-trip window ±4 days → most-recent past day with ≥1
   memory; else discovery-mode random).
2. `buildBeats` groups that day's memories by `authorTraveler`, picks one per person
   (voice > photo > text preference), extracts a snippet.
3. Renders: TopBar (back ← / "Tonight, woven" / **empty right slot**) + staggered-reveal braid
   (BeatBlock per person: rail + dot + avatar + verb label + content by kind) + closing section
   (narrative.closing + stat + Keep button).
4. Parallel `fetchRoadRoute` + `fetchWeaveNarrative` → stat gets passed to a second narrative
   call if the route succeeds (two-pass: plain narrative first, stat-enriched if route resolves).
5. Keep button toggles Heart→Check ("In the book"), then disables. Slice 1 does NOT save anything.

**The right-slot in TopBar is already a placeholder `<div style={{width:30}}/>` with comment
"save button is slice 2 (mp4 keepsake)".** Slice 2 replaces that div with a share icon button.

---

## Scope for slice 2

### What to build

**A. Save button (TheWeave.jsx)**
- Top-right of the TopBar: a share icon button (`aria-label="Save to Photos"`) in `--accent-text`
  color. Matches the design handoff: `<Ic.share s={20} c={c.accentText} />`.
- Duplicate save button at the bottom of the closing section (next to the Keep button), filled:
  `background: var(--accent), color: var(--accent-ink)` — `<share icon> Save to Photos`.
- Both buttons trigger `saveToPhotos()`.

**B. Canvas renderer (`app/src/lib/weaveRenderer.js`)**
A pure function that draws one frame of the Weave animation onto an `OffscreenCanvas`.

```
renderWeaveFrame(canvas, { beats, narrative, stat, day, traveler, tokens, t })
```

- `t` = animation time in seconds (0 → total duration ~4s)
- `tokens` = resolved CSS token values (`bg`, `text`, `muted`, `accent`, `accentText`,
  `fontBody`, `fontDisplay`, `border`, `linesBold`) — read from `getComputedStyle(document.body)`
  BEFORE starting the encode (main thread only; the renderer runs on main thread, not in a worker)
- `traveler` = drives per-person style choices (rafa = Fredoka everywhere; aurelia = italic serifs)
- Output: draws to `canvas` (OffscreenCanvas 1080×1350)
- Called in a tight loop to produce all frames (no `requestAnimationFrame` — drive time manually)

**Animation spec — CONFIRMED 5s total = 150 frames at 30fps (Jonathan, 2026-06-06):**
- 0.0–0.6s: opening reveals (day label → title → opening line, staggered)
- 0.6–(0.6 + n×0.5)s: beats stagger in, one per person (n = beat count, max 4)
  - Beat 1 @ 0.6s · Beat 2 @ 1.1s · Beat 3 @ 1.6s · Beat 4 @ 2.1s
- Hold after last beat: 0.6s
- Closing section fades in (over ~0.5s) starting at lastBeatTime + 0.6s
- Hold on closing: ~1.5s
- Tail hold (full frame): 0.5s
- Total: 5.0s = **150 frames** (hard number, not approximate)

The video paces the stagger ~4× slower than the on-screen CSS animation (on-screen is ~1s total;
the keepsake needs to breathe as a video). The fade-in easing for each element is the same
cubic-bezier(0.22, 1, 0.36, 1) as the CSS `weave-up` keyframe — implement by clamping a
normalised 0→1 progress through that curve per element per frame.

**What the renderer must draw:**
- Background fill (`tokens.bg`)
- Day label (mono caps, `tokens.accentText`)
- Title (display font, big, per-persona style)
- Opening line (display font, italic, `tokens.muted`)
- Per beat: vertical rail (`tokens.border`), dot circle (TRAVELER_DOT[who]), avatar initial or
  dot, mono verb label, beat content:
  - TextBeat: display font italic quote
  - PhotoBeat: drawImage (pre-loaded; 4:5 ratio; caption overlay gradient)
  - VoiceBeat: waveform bars (WAVE_HEIGHTS = [8,15,11,19,14,9,17,12,20,13,7,16,10]) + transcript
- Closing: divider line, narrative.closing (display font), stat (mono), Keep button outline
  (NOT interactive — just drawn as static art)

**Font loading (do before starting the encode loop):**
```js
await document.fonts.ready  // ensures Inter Tight, Fraunces, Instrument Serif, Fredoka loaded
```
Then use these in the canvas 2D context:
```js
ctx.font = `600 56px Fraunces`  // jonathan/helen/rafa
ctx.font = `italic 56px "Instrument Serif"`  // aurelia
ctx.font = `400 18px "JetBrains Mono"`  // mono labels
```

**Image pre-loading:** Before the encode loop, load all photo URLs from photo beats into
`ImageBitmap` objects (`createImageBitmap(img)`). Pass them into the renderer alongside the beats.
Skip any photo whose URL is null/undefined (render the tinted placeholder instead).

**C. Encode orchestrator (main thread)**

```js
async function encodeWeavePage({ beats, narrative, stat, day, traveler, onProgress, signal }) {
  // 1. Resolve CSS tokens from document.body computed style
  // 2. Pre-load photo images as ImageBitmap
  // 3. await document.fonts.ready
  // 4. Spin up a new Worker(new URL('../workers/encodeVideo.worker.js', import.meta.url))
  // 5. Configure: 1080×1350, 30fps, no audio, totalFrames = Math.ceil(DURATION * 30)
  // 6. Loop t = 0 to DURATION: draw frame via renderWeaveFrame, createImageBitmap, post to worker
  // 7. Flush → worker returns { type: 'done', blob }
  // 8. Return blob (MP4)
}
```

**Reuse `encodeVideo.worker.js` exactly as-is.** The worker's message protocol already handles
`config` / `frame` (ImageBitmap, transferable) / `flush` / `done`. No changes to the worker.

**D. Share sheet (`navigator.share`)**

```js
const file = new File([blob], 'weave.mp4', { type: 'video/mp4' })
await navigator.share({ files: [file], title: narrative?.title || 'Tonight, woven' })
```

Gate on `navigator.canShare({ files: [file] })` first. On browsers that don't support file sharing
(desktop Chrome), fall back to a `<a download="weave.mp4" href={url}>Download</a>`.

**E. Progress UI (TheWeave.jsx)**

States added to the existing `state` machine: `encoding` | `sharing` | `shared`.

When Save is tapped:
- A modal sheet slides up (same pattern as the design's `exp` state: `idle→saving→done`)
- Shows a thumbnail preview of the woven page (draw a small 132×165 canvas preview)
- While encoding: animated dots + "Creating your weave…" in display font italic
- When share sheet returns (or download triggered): green check + "Saved to Photos" + Done button

**F. Detect support**

`isVideoEncodeSupported()` already lives in `videoPipeline.js` — import and reuse it. When false,
hide the save button entirely (no "Update iOS" copy — per §3 rule, never prompt to update the OS).

---

## Critical constraints

**1. Token resolution must happen on the main thread, before the encode loop.**
`OffscreenCanvas` + its 2D context run in a worker. The CSS var values are NOT available there.
Read them once from `getComputedStyle(document.body)` on the main thread and pass as a plain
`tokens` object to the renderer function.

**2. The `--faint`-as-text trap — fifth time.**
The renderer draws text. All readable labels use `tokens.muted`, never `tokens.faint`. Decorative
lines/dividers may use `tokens.border`. See `WORKING_AGREEMENT.md` §5 and the C2 durable rule.

**3. Accent fill ink flip.**
When drawing a filled button or highlight using `tokens.accent`, the ink ON it uses
`tokens.accentInk` (dark ink on clay/pink/ochre — the C1/Stage-2 fill-ink trap, now WELL-KNOWN).

**4. Device-only test (hard gate).**
The actual share-sheet + Photos save is DEVICE-ONLY — CI cannot verify it. This is the same gate
as Stage 2 video (`tests/simulator/import-video.test.mjs`). For CI: write a
`tests/simulator/weave-video.test.mjs` that mocks the encode worker and share API and proves the
correct calls are made. The on-device part is verified manually (Jonathan's device).

**5. WebCodecs-gated (iOS 16.4+).**
`isVideoEncodeSupported()` → hide the button on unsupported devices. Don't render a disabled state
— just absent (per `WORKING_AGREEMENT.md` §3: "surface the should-we" — don't show UI for
capabilities the device doesn't have).

**6. Audio: none in slice 2 — CONFIRMED.**
Pass `audio: undefined` in the worker config message. No audio encoder, no R2 fetch.
**Future (slice 3+, Jonathan's note):** when audio is added to the keepsake, pair each voice clip
with its *relevant photo* from the same stop/day — i.e. the video frame for a VoiceBeat should
show the associated photo (if one exists) while the audio plays. This is a design note for that
future increment; do not build it in slice 2.

---

## Confirmed decisions (Jonathan, 2026-06-06)

All four pre-build questions resolved — no open questions remain. Build can start immediately.

| # | Decision |
|---|----------|
| Q1 | **5s total.** 150 frames at 30fps. Animation spec above is locked. |
| Q2 | **Pixel-perfect match.** Use the exact same font family, size, weight, color, and layout values as the on-screen component. Canvas 2D shares the same loaded font files (after `document.fonts.ready`), so rendered glyphs are identical at this resolution. Subpixel AA differences at 1080px are imperceptible — "pixel-perfect" is achievable in practice. |
| Q3 | **No audio in slice 2.** Visual-only keepsake. Future slice 3+: pair voice clips with their relevant photo from the same stop (see constraint #6 above). |
| Q4 | **2 Mbps H.264 confirmed.** ~1.25 MB for a 5s keepsake — right-sized for share sheet / Photos. |

---

## Files to read, in order

1. `WORKING_AGREEMENT.md` — process contract
2. `WEAVE_SCOPE.md` — the locked decisions (verify they're still current)
3. `app/src/views/TheWeave.jsx` — the slice 1 component (slice 2 modifies this)
4. `app/src/workers/encodeVideo.worker.js` — the encode worker (reuse exactly as-is)
5. `app/src/lib/videoPipeline.js` — shows the isVideoEncodeSupported() + worker message pattern
6. `app/src/lib/weave.js` — selectWeaveDay / buildBeats (the data the renderer draws)
7. `app/src/data/travelers.js` — TRAVELER_DOT colors
8. `app/tests/e2e/weave-braid.spec.js` — the 5 slice-1 tests (slice 2 adds to these)
9. Design handoff: `/tmp/ft_design3/design_handoff_family_trips/src/ft2/shared.jsx` lines 774–920
   (the `TheWeave` design component — the save button / progress sheet reference)

---

## New files to create

- `app/src/lib/weaveRenderer.js` — per-frame canvas renderer
- `app/src/lib/weaveEncode.js` — encode orchestrator (token resolution, image pre-load, worker
  management, share-sheet call)
- `app/tests/simulator/weave-video.test.mjs` — simulator-level gate (mocked worker + share API)

## Files to modify

- `app/src/views/TheWeave.jsx` — add Save button (top-right slot + bottom duplicate), progress
  modal, `encoding`/`sharing`/`shared` state handling, import `weaveEncode.js`

---

## Test strategy

**CI-verifiable:**
- Unit/simulator: `tests/simulator/weave-video.test.mjs` — mock the worker + `navigator.share`;
  prove: (a) encode is called with correct dimensions (1080×1350, no audio); (b) share is called
  with a File whose type is `video/mp4`; (c) `isVideoEncodeSupported() false` → Save button absent
  (in the existing `weave-braid.spec.js`)
- Axe: no new axe tests needed — the existing TheWeave ×4 personas gate already covers the
  overlay; the new Save button + progress modal add to that covered surface

**Device-only (not CI):**
- The actual encode + Photos save on Jonathan's iPhone
- Use `tests/simulator/import-video.test.mjs` as the reference for the "real device only" comment
  pattern

---

## What this is NOT

- No new worker endpoint (the video is encoded in the browser)
- No nightly auto-generation (slice 3, deferred)
- No "the book" (accumulate kept weaves into a trip-wide video, slice 3+)
- No audio track in the video (visual-only keepsake, slice 2)
- No iCloud shared-album direct write (PWA cannot; share sheet is the honest path)
