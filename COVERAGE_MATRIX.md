# COVERAGE_MATRIX.md

The authoritative surface × persona × state × tier map for the roadtrip PWA.
Built in **Phase 1** of the QA coverage system (read-only audit). Extends
`TEST_STRATEGY_SPEC.md`'s tier model with the surface enumeration and the
capability grid.

- **Grounded at:** HEAD `4b04639` (`main`, == origin), 2026-05-31.
- **Anchors verified against this tree:** client root `app/src/App.jsx`;
  worker `worker/src/index.js`; Claude chat `app/src/components/ClaudeChat.jsx`;
  cards `app/src/components/ConfirmCard.jsx`.
- **Phase 2/3 status (2026-05-31):** all five capture tiers are now **built**
  (Phase 2 — persona `a876757`, security `24a1b7e`/`cf096da`/`fd75e51`, axe
  `fcf691a`, dead-code `14ab6a0`, instrument `b27b4e0`). The §1 Status column and
  the governing-spec note are refreshed accordingly; capability columns (§3) are
  unchanged. Phase 3 fills **Walked / Findings**.
- **Governing-spec note:** at Phase-1 grounding (HEAD `4b04639`)
  `QA_COVERAGE_SYSTEM_SPEC.md` did not yet exist, so this matrix was grounded in
  the Phase-1 task brief + the parent `TEST_STRATEGY_SPEC.md`. The spec was
  **committed later at `352f752`** and now governs; section references below
  (§3/§4/§5/§6) correspond to it.

## How to read / maintain this (living document)

- **Phase 1 records CAPABILITY** — which tiers *can* reach a cell, not what
  has been walked. Nothing has been walked yet.
- **Phase 3 (capture) fills in two new columns per surface:** `Walked tiers`
  (what actually ran) and `Findings` (what it caught). Leave the
  capability columns intact; append results.
- **Classification per cell:** `overlap` (≥2 tiers can reach) · `thin`
  (exactly 1) · `gap` (0).
- Do not put real secret values in this file — it is committed and pushed.
  Secrets are referenced by **name and string-pattern only**.

---

## 1. Tier legend (§4)

| Tier | Engine / target | Reaches | Status |
|---|---|---|---|
| **sim** | Real iOS WebKit via safaridriver + webdriverio (`app/tests/simulator/`) | On-device render, WebCodecs, IDB+Blob, real photo decode | **Built**; now **RT_PERSONA**-parameterized (`a876757`) — drives all 4 personas |
| **playwright** | Bundled Chromium + bundled WebKit, dev server (`app/tests/e2e/`) | Deterministic client logic, card render, mode detection, photo pipeline (non-iOS), journeys, network matrix, visual baselines | **Built**; now **RT_PERSONA**-parameterized (`a876757`) — drives all 4 personas |
| **axe** | axe-core a11y scan | WCAG/contrast/roles/labels on any rendered surface | **Built** (Phase 2 #2, `fcf691a`) |
| **chrome** | Agent-driven real Chrome, **deployed** GitHub Pages build | Post-deploy live-site sanity end-to-end | Manual/agent; not codified as a tier |
| **instrument** | dev-log + worker-log harvest (`app/src/lib/uploadLog.js` `logUploadEvent`; worker `console.warn/error`) | Asserting on emitted event codes (`storage-quota`, `queue-insert-failed`, `claude_card_apply`, etc.) | **Built** (Phase 2 #4, `b27b4e0`) |
| **dead-code** | static unused-export/file scan (knip / ts-prune) | Orphaned views, hooks, exports | **Built** (Phase 2 #3, `14ab6a0`) |
| **security** | 3 dedicated checks (auth-boundary · no-secret-in-bundle · user-string render) | See §4 | **Built** (Phase 2 #5–7, `24a1b7e`/`cf096da`/`fd75e51`) |

Worker tier (miniflare/vitest, `worker/test/`) exists for worker-layer logic
(7 specs; TEST_STRATEGY Units 1/2/4/6 built) and is the engine the **security
auth-boundary** check will run on.

---

## 2. Surface × state enumeration (authoritative)

Derived from `App.jsx` (`view.name` enum + always-mounted overlays) and the
mounted-component graph. **Reachability verified** — two view files are
orphaned (see §6 dead-code).

### Full-screen views (App `view.name`)

| # | Surface | `view.name` | Component | States (applicable) |
|---|---|---|---|---|
| S1 | Trips index | `index` | `TripIndex` | empty (no trips) · populated · (cold-start landing when no trip active today) |
| S2 | Trip home (themed) | `trip` | `JonathanView` / `HelenView` / `AureliaView` / `RafaView` | populated · (draft → redirected to editor) · loading (pre-sync) |
| S3 | Stop detail | `stop` | `StopDetail` | populated · stop-not-found (guard) |
| S4 | Settings | `settings` | `Settings` | populated · offline-aware (one of the few) · drafts list |
| S5 | New trip | `new` | `NewTrip` | idle · saving · done · validation-error · save-error |
| S6 | Trip editor | `edit` | `TripEditor` | populated · empty (no days) · recording (voice) |
| S7 | Activities | `activities` | `ActivitiesView` | empty · populated |
| S8 | Photos (per-trip) | `photos` | `PhotosView` | empty · populated · uploading (sync-pill) · offline (queued) · dispatch-composer-open |
| S9 | All photos (cross-trip) | `all-photos` | `AllPhotosView` | empty · populated · **(not gated on active trip — back→trip can blank)** |
| S10 | Share-in (import) | `import` | `ImportView` | url-paste · enriching · confirming · save-error · saved |

### Overlay / panel surfaces (mounted within views or at App level)

| # | Surface | Component | Mounted in | States |
|---|---|---|---|---|
| O1 | Claude chat panel | `ClaudeChatPanel` | App (always) | loading · list (past convos: loading/empty/populated) · chat (empty-hint / streaming / populated / error) · unconfigured |
| O2 | Confirm/Action cards | `ConfirmCard` | inside O1 bubbles | drafting · idle · committing · saved · discarded · error · superseded — for 6 card types: add / move / cancel / multi / trip-settings / create_trip |
| O3 | Dispatch composer | `AddDispatchModal` | `PhotosView` | open · photo-pick · video-pick (WebCodecs-gated) · preview · sending |
| O4 | Leave-when / logistics | `LeaveWhenModal` | `ActivitiesView`, `StopDetail` | computing · result · error (Places) |
| O5 | Nearby results | `NearbyResultsModal` | `JonathanView` **only** | loading · results · empty |
| O6 | Postcard composer | `PostcardComposer` | `AureliaView` **only** | compose · sending |
| O7 | Photo lightbox | `PhotoAlbum` (shared) | PhotosView, AllPhotosView, ThreadedMemories, AddDispatchModal | open · swipe between photos · cross-memory/stop/trip boundaries (all-photos) |
| O8 | Photo backfill triage | `PhotoBackfillTriage` | `Settings` | triage list · applying |
| O9 | Flight status | `FlightStatus` | `HelenView`, `StopDetail` | loading · on-time · delayed/changed |

State vocabulary applied per spec: empty / populated / loading / error /
offline — listed per surface only where that state is reachable.

---

## 3. The coverage matrix — surface × persona (capability)

**Persona axis:** Jonathan (J), Helen (H), Aurelia (A), Rafa (R).
Most surfaces are **persona-agnostic in structure** — only the *theme* differs
(CSS `data-theme`), so the same tiers reach all 4 cells. Persona-*specific*
surfaces are flagged. Cells show **tiers that CAN reach** + classification.

Legend: `pw`=playwright `sim`=sim `ax`=axe `sec`=security `inst`=instrument
`dc`=dead-code. **(none built that aren't already in the repo today are marked
"—".)** "Walked" left blank for Phase 3.

| Surface | J | H | A | R | Tiers that CAN reach (any persona) | Class | Walked (Phase 3) | Findings (Phase 3) |
|---|---|---|---|---|---|---|---|---|
| S1 Trips index | ✓ | ✓ | ✓ | ✓ | pw, sim, ax, chrome | overlap | **axe ×4** (J/H/A/R) · pw smoke+visual | **clean** — no new serious/critical; A11Y-1 contrast (allowlisted, M6); **A/R newly scanned** |
| S2 Trip home (themed) | ✓ | ✓ | ✓ | ✓ | pw, sim, ax, chrome | overlap | **pw visual ×4** (J/H/A/R) | **themes correctly ×4** (bounds wrong-theme bug to Claude/C2); C1-GAP-2 (no axe contrast on S2) |
| S3 Stop detail | ✓ | ✓ | ✓ | ✓ | pw, sim, ax, chrome | overlap | — none — | **C1-GAP-1** — zero walked coverage (no existing stop-detail spec); deferred |
| S4 Settings | ✓ | ✓ | ✓ | ✓ | pw, sim, ax | overlap | | |
| S5 New trip | ✓ | ✓ | ✓ | ✓ | pw, ax | overlap | | |
| S6 Trip editor | ✓ | ✓ | ✓ | ✓ | pw, ax | overlap | | |
| S7 Activities | ✓ | ✓ | ✓ | ✓ | pw, ax, chrome | overlap | | |
| S8 Photos (per-trip) | ✓ | ✓ | ✓ | ✓ | pw, **sim**, ax, inst, chrome | overlap | **pw ×4 both engines** (chromium 45✓ / webkit 45✓) · visual album ×4 · **sim** photo-render (real iOS, helen) | **C3a: clean** — album themes correctly ×4 (no bleed; bounds P3-01 to Claude); sim render **non-black** (founding bug no-repro); **C3a-GAP-1** (no axe). *Render-states only — write-states → C3b.* |
| S9 All photos | ✓ | ✓ | ✓ | ✓ | pw, ax, chrome | overlap | **pw ×4 both engines** (all-photos 4✓) · visual all-photos ×4 | **C3a: themes correctly ×4** (no bleed); aggregation green. Back→blank nav edge **→ C4** (not walked, Jonathan's call); **C3a-GAP-1** (no axe) |
| S10 Share-in | ✓ | ✓ | ✓ | ✓ | pw, ax, chrome | overlap | | |
| O1 Claude chat panel | ✓ | ✓ | ✓ | ✓ | pw, ax, sec(render) | overlap | **pw 22✓ · axe ×4 · sec(render)** | **P3-01** wrong-theme bleed (Helen palette, all personas); XSS-inert ✓; axe clean (A11Y-1 contrast); H/A/R newly scanned |
| O2 Confirm cards | ✓ | ✓ | ✓ | ✓ | pw (replay), ax, sec(render) | overlap | **pw 6 card types ✓ · sec(render)** | **P3-01** (cards hardcode Helen T); behavior 22✓; **C2-GAP-1** (instrument not wired on cards) |
| O3 Dispatch composer | ✓ | ✓ | ✓ | ✓ | pw, **sim**(WebCodecs), inst | overlap | | |
| O4 Leave-when | ✓ | ✓ | ✓ | ✓ | pw, sec(api-proxy) | thin→overlap | | |
| O5 Nearby results | **J only** | – | – | – | pw | **thin** | | |
| O6 Postcard composer | – | – | **A only** | – | pw | **thin** | | |
| O7 Photo lightbox | ✓ | ✓ | ✓ | ✓ | pw (swipe), **sim** | overlap | **pw both engines** (swipe + visual) · sim (photo-render decode) | **C3a: clean** — R1 [resolved] swipe holds on webkit; lightbox visual green; **C3a-GAP-1** (no axe) |
| O8 Photo backfill triage | ✓ | ✓ | ✓ | ✓ | pw | thin | **pw both engines** (reconcile-archive → PhotoBackfillTriage, helen) | **C3a: clean, NOT a gap** — triage list/applying walked (overturns Phase-1 "no coverage"); **C3a-GAP-2** (helen-only); **C3a-GAP-1** (no axe) |
| O9 Flight status | – | **H** | – | – | pw | **thin** | | |

### Persona-coverage reality (critical gap)

> **Update (2026-05-31, Phase 2 #1 `a876757`):** both walking tiers are now
> `RT_PERSONA`-parameterized — the single-persona limitation described below is
> **RESOLVED**; all 4 personas are reachable. The analysis is retained as the
> pre-Phase-2 rationale for why the harness was built.

The two built walking tiers are **single-persona**:
- **playwright** seeds **Jonathan** (`app/tests/e2e/_fixtures/withTrip.js:21`).
- **sim** seeds **Helen** (`?person=helen`, all `app/tests/simulator/*`).

Consequences recorded here so Phase 3 doesn't mistake green for covered:
- **Aurelia and Rafa cells have ZERO journey/sim coverage.** Any persona-only
  surface for them (none today) or theme regression on their palettes is
  invisible.
- The **cross-persona theme bug (§5/known-bug)** is *structurally invisible*
  to single-persona walks — you must switch persona to see Helen's palette
  bleed onto J/A/R. This is why persona-parameterizing the harness (Phase 2
  build-list #1) is a prerequisite to walking the theme cells.
- O5 (Jonathan-only), O6 (Aurelia-only), O9 (Helen-only) are each reachable by
  exactly the persona the matching walker does **not** cover for two of them:
  O6 (Aurelia) and parts of O9 are unreachable by today's J-pw / H-sim split
  unless persona is overridden.

### Surfaces with NO journey / sim / visual coverage today (existing gaps)

(Capability ≠ walked; these have no *authored* spec/journey/baseline at HEAD.)
- **O5 Nearby results**, **O6 Postcard composer**, **O8 Photo backfill triage**,
  **O9 Flight status** — no dedicated spec found; persona-specific, single-tier.
- **S5 New trip / S6 Trip editor** — creation path has specs
  (`claude-create-trip`, manual via journeys?) but the **manual NewTrip
  back/exit affordance** (see §5) is unverified.
- **S9 All photos** empty-state + the **back-to-blank-trip** edge (see §5 nav).
- Every surface's **Aurelia/Rafa** column (persona axis, above).

---

## 4. Security boundaries (grounds §5 seams)

### 4a. Auth mechanism

- **4 family bearer tokens**, secrets `FAMILY_TOKEN_{JONATHAN,HELEN,AURELIA,RAFA}`
  (`wrangler secret put`, not in `wrangler.toml`).
- `authenticate()` (`worker/src/index.js:150`): `Authorization: Bearer <token>`,
  loops the 4 travelers, `timingSafeEqual(token, env[FAMILY_TOKEN_<T>])`
  (constant-time, `:162`). Returns the matched traveler id or `null` → `401`.
- **Every route requires a token EXCEPT** `GET /assets/:key` (`:47`) — public by
  design so `<img>/<audio>` render; R2 keys are opaque
  `<traveler>/<memoryId>/<kind>-<rand>`, learnable only via authed `GET /memories`.
- **CORS** (`:172`): allow exact `ALLOWED_ORIGINS` ∪ any `*.github.io` ∪ any
  `localhost:<port>`. Note: `*.github.io` is broad (any GitHub Pages origin).
- Route table (all authed unless noted): `/memories` GET/POST, `/memories/:id`
  DELETE; `/trips` GET/POST, `/trips/:id` DELETE; `/assets/(audio|photo)/:id`
  POST; `/leave-when` POST; `/places/nearby` POST; `/resolve` GET; `/draft`
  POST; `/claude/chat` POST; `/claude/conversations` GET/POST,
  `/claude/conversations/:id/messages` GET; `/` GET. **No `/calendar/import`
  route present** (CALENDAR_IMPORT_TOKEN secret may be vestigial).

**Auth-boundary check to build:** every authed route → `401` without a valid
token; a token-A request cannot read token-B's **private** memory (see 4d);
`GET /assets/:key` is intentionally public.

### 4b. No-secret-in-bundle — allow-set + deny-patterns

Verified: `vite.config.js` `loadEnv` reads **repo-root** `.env` and forwards
**only `VITE_`-prefixed** vars into `import.meta.env`. Built `docs/` grep for
deny-patterns = **0 matches** (clean); VITE_ values present as expected.

**DENY (must NEVER appear in built `docs/`):**
- `AIzaSy[0-9A-Za-z_\-]{33}` — Google API key (GOOGLE_PLACES_API_KEY; a live one
  currently sits in **`app/.env`**, gitignored + never committed, *not* read by
  vite — latent risk only).
- `sk-ant-[0-9A-Za-z_\-]+` — Anthropic API key.
- `sk-(proj-)?[0-9A-Za-z]{20,}` — OpenAI key (dev whisper proxy; never bundled).
- CALENDAR_IMPORT_TOKEN value; Cloudflare API-token patterns
  (`[0-9a-f]{37}` / account-id hex).

**ALLOW (client-public BY DESIGN — present in `docs/` legitimately):**
- `VITE_WORKER_URL` (the `*.workers.dev` URL).
- `VITE_FAMILY_TOKEN_{JONATHAN,HELEN,AURELIA,RAFA}` — 32-char `[A-Za-z0-9_\-]{32}`
  bearer tokens. A naive entropy scan WILL flag these; the check must whitelist
  the `VITE_FAMILY_TOKEN_` assignment context / the 4 known values.

### 4c. User-/model-string render surfaces (XSS)

- **Markdown path is LOCKED on react-markdown@9** (`ClaudeChat.jsx`), plugins
  `remark-gfm`/`remark-breaks`/`rehype-external-links`, **no `rehype-raw`** →
  raw HTML in model output is escaped, not injected. **`marked` + `dompurify`
  drift is GONE** (0 imports repo-wide; rollback landed `72ad418`).
- **ConfirmCard** renders all **model-supplied** card fields (titles, notes,
  field values, stop names/descriptions/addresses, trip title/subtitle) as
  **escaped React text** — safe.
- **User strings** (trip names/subtitle in NewTrip/editor; stop notes;
  chat user bubbles; pasted share-in content) render as React text/inputs —
  escaped.
- **4 `dangerouslySetInnerHTML` sites** render **static authored data** only
  (`CeremonyMorningOptions.jsx:93`, `HoustonFriday.jsx:16,26`,
  `KennedaleDay.jsx:82`; `data/kennedale.js:6` documents the intent).
  **Assert-never-user-string** guard: these must only ever receive curated
  `data/*.js` content, never user/model input.

**Render check to build:** assert no `rehype-raw` in the markdown pipeline;
assert the 4 innerHTML sites' inputs trace to static data; (optional) inject a
`<script>`/`<img onerror>` payload through a card field + a chat reply and
assert it renders inert.

### 4d. Persona isolation — answer

**Primarily a UI axis, NOT a hard data boundary**, with **one genuine security
sub-boundary**. Worker header (`:4`): *"Anyone with a valid token can read every
shared memory + their own private memories, and write/delete on behalf of the
traveler their token belongs to."*

- **Memories** (`:196`): `WHERE … (visibility='shared' OR author_traveler=?)`
  → shared visible to all; **private memories scoped to author** ← the real
  boundary worth a security check (token-H must not read token-J's private memory).
- **Trips** (`getTrips`, `:92`): **no traveler param** — all tokens read / write
  / delete all trips. Fully shared by design (not a boundary).
- **Conversations** (`:1440/:1452`): scoped by `user_id`, but taken from the
  **URL query / conversation-id**, not the authed token → weak, obscurity-gated
  (random ids). Flag for Phase 3, not a hard boundary.

**Decision:** persona-isolation = one real check (**private-memory author
scoping**) + two weak/by-design surfaces (trips shared; conversation
addressability). It is **not** a four-way per-traveler data wall.

---

## 5. Known-bug cross-reference (confirmed in code; walk in Phase 3)

| Bug | Status at HEAD `4b04639` | Root cause | Isolated or class |
|---|---|---|---|
| Theme wrong for everyone but Helen (Claude-in-app) | **Confirmed** | `ClaudeChat.jsx` `T` (`:43`) + `ConfirmCard.jsx` `T` (`:29`) hardcode Helen's linen/sage palette; panel interior never reads `data-theme`/persona. File comments: "Helen's palette is the M1 default… Jonathan's skin lands in M6." Entry button *does* theme via `var(--accent)`. | **Bounded class** = the Claude-in-app surface family (O1 panel + O2 all 6 card types). Rest of app themes correctly via CSS vars. Deliberate M6 deferral, not a logic bug. |
| New-trip flow has no back/cancel | **Not reproduced as stated** | `NewTrip.jsx:110` renders a working "← Trips" back (since `1fc7a9f`, predates HEAD). **Actual gap:** App suppresses global top-bar back + bottom Switcher on `view==='new'\|'edit'` (`App.jsx:590,798`), so the lone exit is a small top-left link with no symmetric Cancel by the bottom "Create" CTA. `TripEditor` (`:255`) shares the shape. | **Narrow class** = the two full-screen flows (new, edit) that opt out of global chrome. The 5 overlay modals (O3–O6, O8) all render close/cancel controls — NOT part of this class. |

### Navigation map (flag-for-Phase-3, not fixed)

- In-app nav is **React state only**. `history.replaceState` is used for
  `?person=`/`?trip=` but there is **no `pushState` and no `popstate` listener**
  → **browser/hardware Back does not drive in-app nav** (likely exits/no-ops).
- **Deep links**: `?person=` (cookie→localStorage fallback, `App.jsx:78`),
  `?trip=` (`:114`), `?url=`/`?text=`/`?action=import` (Share-In, `:33`).
- **Cold-load override** (`:372`): if `?trip=` isn't active today → bounce to
  active trip, else drop to index. Skips when `view==='import'`.
- **Draft guard** (`:406`): `trip` view pointed at a draft → redirect to editor.
- **all-photos** (S9) is the only deep view not gated on an active trip; its
  back → `setView('trip')` can blank if no trip is active. **Flag.**
- **Archived trips:** `visibleTrips` filters `draft`; no separate "archived"
  flag found in `App.jsx` (reconcile-archive.spec.js exists — confirm the
  archived model in Phase 3).
- **Lightbox** (O7): swipe nav within/across memory→stop→trip boundaries
  (all-photos); WebKit swipe was a prior bug class (KNOWN_BUGS R1, resolved).

---

## 6. Dead-code / orphan findings (seed the dead-code tier)

- **`app/src/views/RoadSearch.jsx`** — not mounted anywhere (orphan view).
- **`app/src/views/DiscoverView.jsx`** — not mounted anywhere (orphan view).
- **`app/src/hooks/useTheme.js`** — no live importers; `App.jsx` manages persona
  + sets `data-theme` inline. The hook's per-person **manifest swap / icon swap /
  theme-color & apple-title meta** logic is **not running** → latent regression
  (per-person PWA install capture). Confirm in Phase 3.

---

## 7. Phase 2 build-list (prerequisites before capture)

| # | Tier to build | One-line note |
|---|---|---|
| 1 | **Persona-parameterized harness** | Today: e2e fixture hardcodes `rt_person_v2='jonathan'` (`withTrip.js:21`); sim hardcodes `helen` (all `simulator/*`). Lift persona to a param + drive the `?person=`/cookie/localStorage triad so all 4 personas (and the theme bug) become reachable. |
| 2 | **axe-core integration** | No `@axe-core` dep. Add `@axe-core/playwright`, run on each rendered surface in the e2e tier. |
| 3 | **dead-code scan** | No scanner. Add knip / ts-prune; seed with §6 findings (RoadSearch, DiscoverView, useTheme). |
| 4 | **instrumentation harvest** | `logUploadEvent` (`app/src/lib/uploadLog.js`) + worker `console.*` exist but nothing harvests them. Build a capture harness that asserts on emitted event codes. |
| 5 | **security tier — auth-boundary** | New worker/miniflare tests: every authed route 401s without token; private-memory author scoping (§4d); `/assets` public-by-design. |
| 6 | **security tier — no-secret-in-bundle** | Grep built `docs/` for §4b deny-patterns (assert-absent); whitelist §4b allow-set. |
| 7 | **security tier — user-string render** | Assert markdown pipeline has no `rehype-raw`; assert the 4 `dangerouslySetInnerHTML` sites only take static data; optional XSS-payload inert-render assertion through a card field + chat reply. |

Worker miniflare scaffold (TEST_STRATEGY Units 1/2/4/6) and the Playwright +
sim engines already exist — items 5–7 build on the worker engine; items 1–4
extend the existing client tiers.
