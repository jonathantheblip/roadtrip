# iOS compatibility — Photos pipeline

This doc lives next to the code that depends on each API so a future
maintainer can spot in one glance which browser versions matter and
what happens when a feature isn't there.

Helen + Aurelia + Rafa all use the app on iOS Safari. Jonathan uses
the latest iOS, but the others may lag by a few point releases or
upgrade only when nudged. The "minimum iOS Safari version" column
below is the version where the feature became stable enough to ship
without a per-device toggle — not where it first landed in TP.

The codebase has two related test surfaces:
- `app/tests/e2e/photos-dispatch.spec.js` — photo path (Bucket A
  silent rejection, Bucket C panel, sync pill, EXIF labeling)
- `app/tests/e2e/photos-video.spec.js` — video path (WebCodecs
  encode pipeline)

**Both run against headless Chromium only.** The headless build
diverges from iOS Safari most notably in:
- HEIC decode availability (Chromium decodes HEIC via libheif; iOS
  Safari uses the system codec — both work, but the failure modes
  differ on broken files)
- WebCodecs API surface (Chromium ships the full spec; iOS Safari
  shipped a subset in 17.4 with a few oddities around AudioEncoder
  output ordering)
- AudioContext.decodeAudioData behavior on m4a/aac files (iOS more
  lenient, Chromium stricter)

The table below documents what the app does when a given API is
missing. The user-facing copy refers to dispatchErrors.js Bucket C
outcomes (`photo-too-large`, `video-too-long`, `photo-unreadable`);
everything else is silent (Bucket A) and surfaces only through the
sync pill in the album header.

## Feature support table

| Feature | Min iOS Safari | What happens when unavailable | What the user sees | What the user can do |
| --- | --- | --- | --- | --- |
| `createImageBitmap(File)` | 15.0 | Falls back to `<img>` element decode via blob URL. JPEG/PNG decode is fine; HEIC may fail. | Picker silently resets to the picker; on a second pick that also fails, the photo-unreadable Bucket C panel appears with "This photo can't be read right now. Try sharing it again, or share a different photo." | Pick a different photo, or export the photo as JPEG from Photos first. |
| HEIC decode (`image/heic` via createImageBitmap) | 17.0 | Decode throws — pipeline retries once silently, then surfaces photo-unreadable on the second failure. | Bucket C "This photo can't be read right now…" | Export the HEIC as JPEG from Photos, share that instead. |
| `VideoEncoder` / `VideoFrame` (WebCodecs) | 17.4 | Video picker affordance is hidden. The composer header stays as "Add photo" instead of "Add photo or video". | No video picker button in the modal. No "Update iOS to share videos" copy ever appears (per §3 of the carryover). | Helen still uploads photos; videos are not offered until iOS 17.4+ is installed. |
| `AudioEncoder` (WebCodecs audio) | 17.4 | Video encode runs without audio — the resulting mp4 has video track only. | Indistinguishable from a video without an audio track. | Nothing — silent. The dev-mode upload log captures the absence for debugging. |
| `mp4-muxer` (pure JS, no platform gate) | any | n/a | n/a | n/a |
| `requestVideoFrameCallback` | 15.4 | Pipeline falls back to `currentTime` stepping. Lower-quality (coarser frame timing) but functional. | Video encode is slightly less smooth; result still plays. | Nothing — silent. |
| Background Sync API (`SyncManager`) | not supported on Safari | Service Worker `sync` event never fires. Queue drains on Page Visibility (`visibilitychange`) and a `setInterval` backstop in App.jsx. | Same — pending uploads dispatch when the tab returns to foreground. | Nothing — silent. The sync pill drops to zero when the drain completes. |
| IndexedDB | 10.0 | Queue is unavailable. The composer falls through to a session-blob preview and the upload retry loop never persists. | Tile renders from a session blob URL; if the user backgrounds the app, the queued item is lost. | The dev-mode upload log captures `IndexedDB unavailable`; in practice every iPhone in the family has IndexedDB so this is theoretical. |
| Page Visibility API | universal | n/a | n/a | n/a |
| `AudioContext.decodeAudioData` (m4a/aac inputs) | 14.0 | Audio extraction returns null. Video encodes without audio. | Silent — encoded mp4 has no audio track. | Nothing. |
| `navigator.serviceWorker` registration | 11.3 | App still works; sync pill behaves identically because the in-app foreground drain doesn't need the SW. | Nothing visible. | Nothing. |

## Family devices

Jonathan and Helen run the latest iOS. Aurelia and Rafa we assume are
on iOS 17+ (verify before any release that depends on a 17+ feature).

| Device | Owner | Assumed iOS | Notes |
| --- | --- | --- | --- |
| iPhone (latest) | Jonathan | latest | Reference device; the pipeline is shaped to what this device supports. |
| iPhone | Helen | iOS 17+ assumed — confirm if a future change relies on 17.4+ | Helen's the primary user for the Photos surface; if her iPhone is on 17.2 or below, the video picker will hide and she'll see only the photo picker. That's the designed fallback per §3 — no "Update iOS" copy. |
| iPhone | Aurelia | iOS 17+ assumed | Aurelia's the secondary user of the Photos surface. Same fallback as Helen. |
| iPad (9th gen, iPadOS 17 — **needs confirmation**) | Rafa | iPadOS 17 assumed | The oldest device in the family. The iPad 9th gen is the iPad model most likely to be stuck on iPadOS 17 (Apple's last supported release for that hardware). The video picker WILL hide on this device until/unless WebCodecs lands in Safari iPadOS 17 — which it has not, as of this writing. **Action item: confirm Rafa's actual iPad model and iPadOS version before relying on video upload working there.** |

## Why this lives here

The carryover §4 calls for this doc explicitly — Helen will use the
app on her phone tomorrow morning, and the cost of an "Update iOS to
share videos" toast on her perfectly-fine iPhone is much higher than
the cost of just hiding the video picker. The same principle applies
to every other capability check: prefer hiding the affordance to
surfacing a technical message.

Helen's vocabulary is photo, video, share, trim, screenshot. The
banned-vocabulary list in `app/src/lib/dispatchErrors.js` is the
authoritative reference for what NOT to put in user-facing copy.
