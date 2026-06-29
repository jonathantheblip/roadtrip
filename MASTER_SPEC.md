> **PROCESS ANCHOR — read [WORKING_AGREEMENT.md](WORKING_AGREEMENT.md) first.** That file is the durable
> anti-drift contract; this file is the *product* spec it refers to. Where the two ever conflict on *how we
> work*, the working agreement wins.
>
> **PROVENANCE & HOW TO READ THIS:** committed from the founding handover so it stops depending on a re-pasted
> chat doc (WORKING_AGREEMENT §8). It was scoped adversarially before committing and found sound.
> - **Durable (authoritative): §0, §0.1, §1 Golden Rules, §2 Protocol, §5.** These are the real contract.
> - **Snapshot (verify, don't trust): §3 Current State, §4 Parking Lot.** Frozen at the handover (HEAD
>   `01237fa`) and now substantially out of date — much of the parking lot has shipped (GPS extraction is
>   live and durable cross-device; LEG-C done; the GPS+time auto-filer is wired and verified). Re-derive
>   any load-bearing claim here from `git log` + `memory/` before acting on it (WORKING_AGREEMENT §1). Do
>   not treat §3/§4 as the live state of the app.

# FAMILY TRIPS PWA — MASTER SPEC & HANDOVER
Owner: Jonathan Jackson. Primary implementer: Claude Code (CLI). Design: Claude Design.
Status: living document. Code re-reads this at the top of every work window and scopes against it.

═══════════════════════════════════════════════════════════════════════
## 0. WHAT THIS IS
A family travel platform — one PWA across all Jackson family trips. Three jobs:
  1. PLANNING SURFACE — the itinerary (whatever its shape), before and during a trip.
  2. LIVE COMPANION — where we are right now and what's next (the living heart + the map).
  3. MEMORY ARCHIVE — photos/videos captured on trips, filed to where they were taken,
     replayable as the shape of the trip.

> ⚠ **FAMILY TRIPS, NOT ROAD TRIPS — SETTLED; make it stick.** The trips we mostly take are **hangouts and
> mixed-style stays at a place**. **A ROAD TRIP IS AN EXTREMELY RARE EXCEPTION** — never the default, never a
> different home. **NEVER design to road-trip logic** (drive plans, ETAs, "the next stop on the drive," route
> geometry, "% of this drive," an always-on driving rail) — it is RETIRED, never centered. There is **ONE home
> for every trip** (the living heart + the 4-tab shell); the rare road trip uses that same home, shape-aware.
> The repo name "roadtrip" + the road-trip fixtures are a trap, not a signal. Full statement: CLAUDE.md,
> WORKING_AGREEMENT §2 #7, FAMILY_TRIPS_VISION §0. (This kept getting "re-discovered" — it is baked in here now.)
Deployed: GitHub Pages (docs/ folder), jonathantheblip.github.io/roadtrip/. Add-to-Home-Screen,
offline via service worker. Backend: Cloudflare Worker + D1 + R2 (Workers Standard plan).
Stack: Vite/React. EXIF reader: ExifReader (exifr removed — abandoned, couldn't read HEIC).

## 0.1 WHO IT SERVES (every feature names this)
- Jonathan: dark editorial theme; planning + the structural view of a trip.
- Helen: sage/brass, photo-forward; the memory archive and location labels.
- Aurelia (13): warm pink; the live map during trips, the replay.
- Rafa (5): red/blue command center; bold, not babied.
A feature that can't say which family member it serves and what it gives them is not scoped.

═══════════════════════════════════════════════════════════════════════
## 1. GOLDEN RULES — assert these in EVERY carryover and EVERY work window
Code states, at the top of every window, that it has read these and is holding to them.
Each one is here because violating it has already cost real work on this project.

### G1 — GROUND TRUTH OVER MEMORY
Never act on a remembered fact about the code when the code is readable. Second-read every
load-bearing claim against actual file content, with real line numbers, before building on it.
A summary, a memory note, or a prior report is a POINTER to the truth, not the truth. The biggest
errors on this project came from trusting a stale recollection instead of opening the file.

### G2 — VERIFY AT RUNTIME, NOT FROM DOCS
A README, a changelog, or a type definition says what SHOULD happen. Run the real thing against
the real input and report what ACTUALLY happened, verbatim. The GPS bug shipped because every test
fed clean stubs and no test ever decoded a real photo; the `gps:true` sign bug and the HEIC guard
were only ever found by running real fixtures. When a claim is load-bearing, prove it with a run.

### G3 — REPORT REAL, NEVER INFERRED
Every SHA, every test pass/fail, every deploy status, every decode value comes from actual command
output, quoted. Never report "committed" for "staged," "deployed" for "pushed," "passing" for
"should pass." Committed ≠ pushed ≠ deployed are three different states on this project and the
distinction is load-bearing. If you didn't see it in output, you don't report it as done.

### G4 — SCOPE IS A CONTRACT; DRIFT HALTS, IT DOESN'T EXPAND
Every window opens by naming what's IN scope and what's explicitly OUT (and which later pass owns
the out-of-scope work). If the work pushes past that boundary — a new leg appears, a leg is bigger
than scoped, the change wants to touch a file outside the named set — STOP and surface it in plain
language. Do not quietly absorb it. Name the structural addition (a new file, a new abstraction)
even when it's "just an implementation detail." Jonathan decides whether scope grows.

### G5 — DON'T BREAK THE WORKING PATH TO FIX THE BROKEN ONE
When a change touches code that already works (the JPEG reader, an existing test, a shipped
feature), re-verify the working path against real input BEFORE proceeding, and name that
re-verification as a stop-condition. A swap that fixes HEIC but regresses JPEG is a net loss.

### G6 — THE UI ONLY PROMISES WHAT THE PLUMBING DELIVERS
No cosmetic label, toggle, or status that isn't backed by working machinery. If the card says
"taken at the Rothko Chapel," the coordinate survived extraction, save, AND sync. If a feature is
half-wired (works locally, not cross-device), say so explicitly — don't let the UI imply complete.

### G7 — TESTS MUST BE ABLE TO FAIL FOR THE RIGHT REASON
A test that would pass even if the value were wrong is worse than no test — it's false confidence.
Assert the thing that actually matters (correct sign, real capture date not upload time, the
coordinate within tolerance of the known answer). If a test can't assert what it should, say so;
don't ship green-but-hollow.

### G8 — THE DEPLOY IS E2E-GATED; LOOK BEFORE YOU BLESS
Client deploys gate on Playwright visual baselines. When a change shifts a baseline, LOOK AT THE
DIFF IMAGE before re-blessing — confirm the change is exactly what was intended and nothing is
hiding behind it (a stray canvas, a layout shift, dynamic content masking a real regression).
Re-bless as narrowly as the tooling allows. Never bless blind to force green. The top bar is
masked from the trip-view baseline (it's the volatile entry-point staging area); album/all-photos
top bars are NOT masked (they stayed sub-threshold by page height — a large enough change there can
still trip them).

### G9 — SECRETS NEVER ENTER A CHAT
API keys, tokens, secrets go to local .env or Cloudflare secrets only, via terminal (silent-paste:
` read -s VAR` with leading space → `echo -n "$VAR" | npx wrangler secret put VAR`). Never pasted
into any chat interface, ever. D1 migrations need a token with explicit D1 Edit permission (the
default Workers-Edit template lacks it — error 10000 without it).

### G10 — COMMUNICATE IN PLAIN LANGUAGE FOR DECISIONS
Jonathan makes the calls; Code's job is to give him full information in plain language to decide
with. When a decision has a trade-off, lay out the options, the real costs (numbers, not vibes),
and what each one means in ordinary terms — not just the technical shape. If a choice rests on a
concept he may not have (what a library is, what a migration costs, why frozen-dep cuts both ways),
explain it before asking him to choose. A decision made on a misunderstanding is the expensive
kind. (This rule is why the EXIF-library swap got explained as "replace the dead translator" before
he picked it.)

### G11 — NO TIME ESTIMATES
Don't estimate how long work will take. It has no anchor in his reality and reads as noise.

### G12 — PARENTING & DOMAIN CALLS ARE PARAMETERS, NOT PROMPTS
Decisions Jonathan or Helen have made about their kids, their family, their trip, their work are
the parameters of the task — not openings to revisit, risk-flag, or script. Logistics that change
a plan get shared as logistics. The shape of a day belongs to the parents.

═══════════════════════════════════════════════════════════════════════
## 2. WORK-WINDOW PROTOCOL (Code follows this every session)
1. OPEN: state the golden rules are read and in force. State the scope: what's in, what's out,
   which pass owns the out-of-scope.
2. ORIENT: re-read the load-bearing files against actual content (G1). Report real HEAD/branch/
   clean-state (G3).
3. NAME STOP-CONDITIONS for this window (the things that should halt rather than be worked around —
   always includes the working-path re-verify per G5 when a change touches working code).
4. BUILD: hold to scope (G4). Surface drift in plain language (G10), don't absorb it.
5. VERIFY: real fixtures/runs (G2), non-hollow tests (G7), real results (G3), baseline-impact check
   (G8), build green, suite status (account for the known pre-existing claudeSystemPrompt failure).
6. REPORT: plain language, real numbers, what's done vs. what's deferred and to which pass. State
   what's committed vs. pushed vs. deployed precisely (G3). Confirm tree state.
7. CARRYOVER: write the next-window state — HEAD, what's done, what's pending, the parking lot,
   AND re-assert the golden rules at the top of the carryover so the next window inherits them.

═══════════════════════════════════════════════════════════════════════
## 3. CURRENT STATE (as of this handover — Code verifies, doesn't trust)
> » SNAPSHOT, HEAD `01237fa`. OUT OF DATE — the GPS pass below shipped & is live; LEG-C is done; the
> GPS+time auto-filer is wired and verified. For live state see `git log` + `memory/`. Verify, don't trust.

SHIPPED & LIVE (HEAD 01237fa):
  - Replay (zoomable time-spine: archive→trip→day→stop, play/scrub at every level).
  - EXIF capture-DATE preserved through intake (was JPEG-only; HEIC now closed in the uncommitted pass).
  - Live map (generalized straight-line route + live progress, % of drive + % of trip, any trip).
  - Top bar masked from trip-view visual baseline.
BUILT, UNCOMMITTED (this session's last pass — Code to commit + deploy as next relay):
  - GPS extraction via ExifReader (exifr removed). JPEG + HEIC both yield finite correct-sign GPS
    and capture date. Album save carries lat/lng. Real-decode test added. Baseline impact: none.
    Files: NEW src/lib/exifRead.js, scripts/__tests__/photoExifReal.test.mjs; MOD photoPipeline.js,
    photoBackfill.js, ThreadedMemories.jsx; package.json/lock (exifr→exifreader).

## 4. PARKING LOT (each names what it gates, and its known shape)
> » SNAPSHOT — the first three items (GPS commit/deploy, LEG-C, auto-filing wire) have SHIPPED. Verify
> against `memory/photo-intake-ground-truth.md` before acting.

- [NEXT RELAY] Commit + deploy the GPS extraction pass (e2e-gated client; baseline impact none, so
  expect green without a re-bless — but G8 still applies, look).
- [THEN] LEG C — worker D1 schema: add lat/lng (and arguably captured_at) columns to the memories
  table + carry them through postMemory/rowToMemory and the {key,mime} ref serialization. Until C
  lands, extracted GPS is correct LOCALLY but stripped on every cross-device sync — and the server's
  newer updated_at can overwrite the capturing device's own local copy on the next pull (G6: the
  location label is not truly delivered until C). Separate worker deploy; needs the D1-Edit token (G9).
- [AFTER C] AUTO-FILING: photoMatch.js engine exists; gated on photo GPS (now flowing) — confirm
  it's WIRED, then dump-intake → timestamp+GPS sort into event/interstitial, manual override,
  recognition on the residue with confidence-routing (low confidence → review, never confident-misfile).
- PERSON-GROUPING ("show me, me"): Claude-as-recognizer, volume-gated (earns its keep once the
  archive fills); REQUIRES first adding a persistent "depicted-in" field (photos store who SHOT them,
  not who's IN them).
- INTAKE breadth: MAX_PHOTOS_PER_ALBUM=6 raise (separate decision); bulk camera-roll import (why the
  road trip is barely in the app); a caption moment in the flow.
- iOS-STRIP residual: GPS/date proven on camera-roll originals (Helen's accepted primary path);
  Messages/share-sheet re-saves may strip — accepted, real-device-confirmed, not a code defect.
- THE REDESIGN: real entry points for replay AND the map (both currently temp top-bar buttons —
  ▶ Replay, ▣ Map); rich photo rendering; road-accurate route geometry (routing API) for precise
  drive % (straight-line currently mis-picks on doubling-back routes — Aurelia's volleyball trip);
  rich MapCard/NextUpCard; dead-code hygiene. Skin redesign comes AFTER surface-adding features.

═══════════════════════════════════════════════════════════════════════
## 5. WORKFLOW MECHANICS (carried from prior practice)
- Code works DIRECTLY — not the parallel subagent workflow (it dies on an MCP schema).
- Design produces bundled HTML exports; extract assets via the regex/base64/magic-byte script.
  Design bundles are authoritative and supersede "polish not redesign" constraints.
- Cloudflare secrets via the silent-paste pattern (G9). D1 migrations need explicit D1-Edit token.
- Known pre-existing test failure: claudeSystemPrompt.test.mjs (1 fail) — unrelated to features,
  account for it in every suite report, don't chase it as if the current change caused it.
