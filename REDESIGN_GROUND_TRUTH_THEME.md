# REDESIGN_GROUND_TRUTH_THEME.md

Current-state THEME / COLOR model for the per-user skin redesign. **Read-only recon — describes what IS, proposes nothing.** Every "fix" temptation became a log line.

- **Grounded at:** HEAD `fef29599ad19083dc087ef7e36661fbe6a0b412d` (`main`), local **==** `origin/main` (ahead/behind `0 0`).
- **Tree state:** no modified/staged *tracked* files; working tree carries only untracked `*.md` scratch (carryovers/punchlists) + this artifact. Tracked content clean.
- **Method:** WCAG 2.x ratio with **sRGB-space src-over alpha compositing, channels rounded to 8-bit before luminance** (this is the canonical Helen-fix method — see Appendix A; validated against both anchors and all three known findings). Transparent text is flattened over its *real* backdrop before computing.
- **Fabrication guard:** every load-bearing fact second-read (re-grep/re-open), greps `-i`, content-anchored to `file:line` at this HEAD. Line numbers may drift; the anchored strings are the truth.

---

## 0. EXECUTIVE LEDGER (one screen)

### 0.1 Failing-pair inventory × persona (text under its AA bar)

Ratios computed at this HEAD. `XX` = fails even the 3.0 large/UI floor. `↓N` = fails normal 4.5 but clears 3.0 (ok only if rendered ≥24px / ≥18.66px-bold / as a UI component). `ok` = ≥4.5.

| Text token → ground | jonathan | helen | helen-dark | aurelia | rafa | Root |
|---|---|---|---|---|---|---|
| **accent → bg** | **2.92 XX** | 6.66 ok | 3.40 ↓N | 3.14 ↓N | 11.13 ok | accent-as-text |
| **accent → bg2** | **2.74 XX** | 5.86 ok | 3.10 ↓N | **2.67 XX** | 10.29 ok | accent-as-text |
| **accent → card** | **2.54 XX** | 7.66 ok | **2.78 XX** | 3.38 ↓N | 9.26 ok | accent-as-text |
| **accent2 → bg/bg2/card** | =accent | =accent | =accent | =accent | 3.67/3.39/**3.05** ↓N | rafa oxblood-as-text |
| **accent3 → bg/bg2/card** | 15.4 ok* | =accent | =accent (3.40/3.10/**2.78**) | =accent (3.14/**2.67**/3.38) | 11.1 ok* | accent3 safe **only J,R** |
| muted → bg2 | 5.56 ok | 4.66 ok | 6.28 ok | **4.26 ↓N** | 8.52 ok | muted edge (A) |
| faint → any | 2.38 | 1.98 | 2.62 | 1.99 | 3.38 | all fail, but ~only 1 decorative `<del>` use |
| **FILL: tag/accent-ink on accent** | 6.12 ok | 7.66 ok | 4.66 ok | **3.68 ↓N** | 11.13 ok | white-on-hot-pink fill fails normal |

\* jonathan `--accent3` = `#EDE6D6` (paper) and rafa `--accent3` = `#FFB833` (ochre) are deliberately high-contrast; for helen/aurelia/helen-dark `--accent3` **==** `--accent` (saturated) → same failures. **`--accent3` is a semantically inconsistent token.**

**Persona-invariant literal-island text fails:** ConfirmCard `draftEyebrow #8A6F2D` on `#F8F4E9` = **4.35 ↓N**; ConfirmCard `inkFaint` = 1.99 (strikethrough/decorative); memory-textarea placeholder = **2.67** (light) / **3.94** (dark); RafaView blue `#3D6FB8`-as-text = **3.17–3.81 ↓N** (off-palette island).

**"Almost certainly more" → CONFIRMED.** Beyond the 3 known findings (J accent 2.92, A accent 3.13, H muted now 4.97), the systemic root is **accent-as-text** (Phase 5): it fails for **jonathan (severe — fails even large on every ground), aurelia, helen-dark, and rafa's `--accent2`**. Helen and rafa-ochre are the only safe accent-as-text personas.

### 0.2 Accent FILL-vs-TEXT verdict

- **FILL-with-accent-ink (contracted, ground-independent):** safe for J/H/R; **marginal helen-dark (4.66)**; **FAILS-normal aurelia (3.68, white on `#E8478C`)** — even the "safe" path isn't safe for Aurelia at body size.
- **TEXT-on-ground (the A11Y-1c antipattern):** **PERVASIVE — ~150 `color: var(--accent*)` sites across nearly every component CSS.** Not trips-index-only. This is the redesign's central "readable-on-bg emphasis token" work.
- **BORDER-decorative:** ~148 `border*: var(--accent*)` sites — out of contrast scope.

### 0.3 Literal islands (values outside the token system)

| Island | Where | Renders? | Note |
|---|---|---|---|
| `T.*` draft-slip palette (`ink/inkMuted/inkFaint/draftBg #F8F4E9/draftEyebrow #8A6F2D/oxblood*`) | ConfirmCard.jsx:36–50 | **LIVE** (intentional, persona-invariant) | cream cards can't take per-persona light text; draftEyebrow 4.35 edge |
| AureliaView inline palette (`#FBF5EC` card / `#3D2424` / `#2A1818` / `#C03671` / 5-tint array) | AureliaView.jsx:49,442–538 | **LIVE** | **3rd** Aurelia palette; text passes (4.83–15.6) but diverges from both tokens & au-* |
| RafaView blue/green mission (`#3D6FB8`, `#2E5D3A`, `#fff` badges) | RafaView.jsx:280,339,365,395 | **LIVE** | off-palette (rafa is ochre/oxblood); blue-as-text 3.17–3.81 fails normal |
| `topBarTokens()` hardcoded gradients/text | App.jsx:51–71 | **LIVE** | passes; parallel to App.css `.top-bar` rules |
| App.css `.top-bar` stale literals (helen `#2a2520`; rafa **deep-blue `rgba(8,12,22,.88)`**; jonathan **yellow glow `rgba(253,216,53,…)`**) | App.css:96,108,139,175 | **LIVE** | diverge from themes.css (rafa is warm-oxblood; jonathan has no yellow); all pass contrast |
| Chrome literals (`day-chip #8B2B1F`, `btn-solid #1A1614/#FBF8F2`, switcher pill, toggle `#8B2B1F`, memory-textarea) | platform.css:257,386,339,439,399 | **LIVE** | pass except memory placeholder 2.67/3.94 |
| index.html `themeColors` (`#16102a/#f5f1ec/#fdf0f4/#0a0e1a`) | index.html:9,60 | **LIVE (PWA chrome only)** | **drifted** from themes.css `--bg`; sets `<meta theme-color>`/status bar |
| platform.css `.jj-*` / `.au-*` / `.helen-*` bespoke palettes | platform.css:173–328 | **DEAD** (classes never applied) | divergent snapshots that never render — see Phase 8 |

### 0.4 Structural questions (full detail Phase 7)

- **helen-dark is a MODE, not a 5th persona.** Setter content-anchored at `App.jsx:230`: `traveler === 'helen' && helenDark ? 'helen-dark' : traveler`. Only Helen has a dark variant. "Dark" is **not orthogonal**: jonathan+rafa permanent-dark (hardcoded `darkSurface` App.jsx:203–206), aurelia permanent-light, helen the lone toggle (`useHelenDark`). It exists as a 5th `[data-theme]` block but is conceptually Helen's mode.
- **Privileged default = jonathan**, leaking at 6 live sites + CSS root (Phase 7.2).
- **Verification asymmetry:** axe contrast gate runs **jonathan by default**, ×4 personas only on **S1 + O1**; the rest of the app has **no axe contrast coverage** (Phase 7.3) — which is exactly why the pervasive accent-as-text fails are uncaught.

### 0.5 Dead theme paths (full detail Phase 8 — list, do not delete)

`hooks/useTheme.js` (whole file) · `components/PersonSelector.jsx` (+ `.css`) · `data/themes.js` exports `THEMES`/`THEME_ORDER`/`THEME_COLORS` (drifted palette) · platform.css `.jj-*`/`.au-*`/`.helen-*` bespoke palette families (+ their `.embed-panel`/`.memory-textarea` descendant overrides) · ConfirmCard local `Eyebrow` (line 74) · ConfirmCard `tone === 'standby'` branch · `'Newsreader'` font reference (never loaded).

### 0.6 Redesign-shaping headline

There are **two theme systems** and **five overlapping person→color maps**. The token system (themes.css `var(--…)`) is the live, mostly-clean spine. Bolted onto it: dead bespoke-palette CSS, live-but-divergent per-view inline literals (Aurelia, Rafa), a drifted PWA-chrome palette, a Helen-only dark mode, and a jonathan-privileged default + CI gate. The single highest-leverage structural gap is the **absence of an emphasis token that is readable on `--bg`** — every persona reaches for `--accent` as text and four of five fail.

---

## PHASE 1 — TOKEN DICTIONARY

**`app/src/styles/themes.css` (217 lines).** Five `[data-theme]` blocks. `:root` is aliased to jonathan (line 19: `:root, [data-theme='jonathan']`) — **jonathan is the CSS-level default** (any element outside a themed scope inherits jonathan).

Persona set (complete): **jonathan, helen, helen-dark, aurelia, rafa**. (`helen-dark` is a mode — Phase 7.1.)

### 1.1 Color token × persona matrix

| token | jonathan | helen | helen-dark | aurelia | rafa |
|---|---|---|---|---|---|
| `--bg` | `#0E0F11` | `#F2EFE7` | `#14110D` | `#FCE8EE` | `#1A0A0B` |
| `--bg2` | `#15171A` | `#E6E1D2` | `#1F1B14` | `#F8D2DF` | `#2A1012` |
| `--bg-nav` | `rgba(14,15,17,.86)` | `rgba(242,239,231,.86)` | `rgba(20,17,13,.88)` | `rgba(252,232,238,.86)` | `rgba(26,10,11,.88)` |
| `--card` | `#1C1E22` | `#FFFFFF` | `#2A241B` | `#FFF2F6` | `#3C1518` |
| `--text` | `#EDE6D6` | `#15201A` | `#F2EBDA` | `#3D0E22` | `#FFF6E8` |
| `--muted` | `rgba(237,230,214,.58)` | `rgba(21,32,26,.65)` ◀A11Y-1b | `rgba(242,235,218,.62)` | `rgba(61,14,34,.62)` | `rgba(255,246,232,.70)` |
| `--faint` | `rgba(237,230,214,.30)` | `rgba(21,32,26,.32)` | `rgba(242,235,218,.32)` | `rgba(61,14,34,.32)` | `rgba(255,246,232,.38)` |
| `--accent` | `#A33A2E` | `#2E5D3A` | `#B0463F` | `#E8478C` | `#FFB833` |
| `--accent2` | `#A33A2E` | `#2E5D3A` | `#B0463F` | `#E8478C` | `#C9342A` ◀differs |
| `--accent3` | `#EDE6D6` ◀=text | `#2E5D3A` | `#B0463F` | `#E8478C` | `#FFB833` |
| `--accent-ink` | `#FFF6E8` | `#FFFFFF` | `#F2EBDA` | `#FFFFFF` | `#1A0A0B` |
| `--border` | `rgba(237,230,214,.16)` | `rgba(21,32,26,.13)` | `rgba(242,235,218,.13)` | `rgba(61,14,34,.14)` | `rgba(255,246,232,.18)` |
| `--tag` | `#A33A2E` | `#2E5D3A` | `#B0463F` | `#E8478C` | `#FFB833` |
| `--tag-text` | `#FFF6E8` | `#FFFFFF` | `#F2EBDA` | `#FFFFFF` | `#1A0A0B` |

**Token-matrix GAPS:** none — all 5 blocks define the full color set. The only intra-token variation is `--accent2` (rafa = oxblood `#C9342A` ≠ its ochre `--accent`; all others `--accent2`==`--accent`) and `--accent3` (jonathan paper, rafa ochre; others ==`--accent`).

### 1.2 Non-color tokens × persona (redesign owns these too)

| token | jonathan | helen | helen-dark | aurelia | rafa |
|---|---|---|---|---|---|
| `--radius` | 6px | 4px | 4px | **14px** | 4px |
| `--heading-weight` | 600 | 500 | 500 | 600 | **700** |
| `--body-weight` | 400 | 400 | 400 | **500** | **500** |
| `--font-body` | `'Inter Tight', …` (all five identical) |
| `--font-display` | `'Fraunces', 'Iowan Old Style', Georgia, serif` (all five identical) |
| `--shadow-card` / `-hover` | per-persona tinted (oxblood/sage/pink/ochre) — see themes.css:39–42,66–69,93–96,120–123,147–150 |

### 1.3 `:root`-only constant tokens (not per-theme)

themes.css:158–164 — `--person-helen #2d8a4e`, `--person-aurelia #c2185b`, `--person-rafa #e65100`, `--person-jonathan #1565c0`, `--person-everyone #5e35b1`. Constant across themes by design ("Person-tag colors stay constant"). **Duplicated verbatim** in `data/themes.js PERSON_COLORS` (Phase 2.4).

### 1.4 Body washes (gradient surfaces, themes.css:186–217)

Localized radial gradients over `--bg`; transparent except where noted: rafa (ochre-top + oxblood-bottom washes), helen (`#FBF7EE` paper-bright top, **opaque-ish**), helen-dark (oxblood top 10%), jonathan (oxblood top 6%), aurelia (`none`, flat). They tint the top/bottom of the viewport; the bulk of each surface is base `--bg`, so contrast math uses base `--bg` (washes noted, not load-bearing for text).

### 1.5 Font system is SPLIT (two loaders, legacy fonts still loaded)

- **platform.css:17** `@import` loads the **authoritative** families: Fraunces + Inter Tight + JetBrains Mono.
- **index.html:16** loads a **different** set: DM Sans + DM Serif Display + Playfair Display.
- **reset.css:24** base `body` font = `'DM Sans'`.
- `.f-*` utility classes (platform.css:29–36): legacy names (`.f-dm`, `.f-news`, `.f-cap`, `.f-arc`) **remapped** to the authoritative families (so markup adopts the new look without renames).
- Live DM-Sans use remains: chrome buttons/switcher/toggle (platform.css:358,375,384,434) + body base. Playfair referenced in component CSS comments (App.css:93, NavBar.css, Navigation.css "Playfair") — loaded by index.html.
- `ConfirmCard FONT` (ConfirmCard.jsx:51–55) re-declares serif/sans/mono inline — duplicates `--font-display`/`--font-body`.
- `'Newsreader'` referenced (platform.css:403 memory-textarea) but **never loaded** → silently falls back to Georgia (dead font ref).

---

## PHASE 2 — SOURCE COUNT (start from one)

**`themes.css` is the SOLE LIVE source of theme tokens.** It is the only file defining `[data-theme]` custom-property blocks; `App.jsx:230–232` (+ index.html:57–58 bootstrap) is the only live setter of `data-theme`. Confirmed: `grep -rin data-theme` shows only themes.css (definitions), App.css/component CSS (consumers, `[data-theme='X'] .foo` overrides), App.jsx (setter), index.html (bootstrap setter).

### 2.1 Orphan / parallel sources (live-vs-dead, second-read)

| Source | Status | Evidence |
|---|---|---|
| `hooks/useTheme.js` | **DEAD** (DEADCODE-1) | `grep -rn "import.*useTheme"` → **empty**. Only mentions are *comments* (appIcon.js:8, themes.js:7). App.jsx uses its own `readTraveler()`+`useHelenDark`+`setAttribute` instead. |
| `data/themes.js` `THEME_COLORS` | **DEAD** | sole consumer is dead useTheme.js (themes.js:11 def; useTheme.js:10 use). The **drifted** palette (below) does **not** leak through JS. |
| `data/themes.js` `THEMES`,`THEME_ORDER` | **DEAD** | consumers = useTheme.js (dead) + PersonSelector.jsx (also dead — never imported anywhere). |
| `data/themes.js` `PERSON_COLORS` | **LIVE** | CeremonyMorningOptions.jsx:3,74 (`background: PERSON_COLORS[p]`). **Duplicate** of themes.css `--person-*`. |
| `data/travelers.js` `TRAVELERS`/`TRAVELER_DOT`/`TRAVELER_ORDER` | **LIVE** (~20 importers) | App.jsx, Avatar, PhotoAlbum, ConfirmCard, Switcher, Settings, StopDetail, TripIndex, … |
| index.html `themeColors` (lines 59–64) | **LIVE** (PWA chrome only) | bootstrap sets `<meta theme-color>` + status-bar style. Same drifted values as themes.js THEME_COLORS. |

### 2.2 Does a dead source carry a concept the live one lost?

**Yes — the PWA-chrome background color, and it has DRIFTED:**

| persona | themes.css `--bg` (live surface) | themes.js `THEME_COLORS` (dead) / index.html `themeColors` (live chrome) |
|---|---|---|
| jonathan | `#0E0F11` (near-black) | `#16102a` (**purple-black**) |
| helen | `#F2EFE7` | `#f5f1ec` (close, not equal) |
| aurelia | `#FCE8EE` | `#fdf0f4` (close, not equal) |
| rafa | `#1A0A0B` (warm oxblood-black) | `#0a0e1a` (**deep blue**) |

The `<meta name="theme-color">` / iOS status bar therefore paints **the wrong/old background** (notably rafa deep-blue vs warm-oxblood, jonathan purple vs near-black). themes.js's own comment (line 9) says "Keep in sync with :root backgrounds in themes.css" — they are **not** in sync. The "rafa = deep-blue mission-control" concept survives only here (the live themes.css rafa is warm oxblood). Static fallback `index.html:9 content="#16102a"` paints jonathan-purple before JS runs, for every persona.

### 2.3 Five overlapping person→color maps (the redesign must reconcile)

1. themes.css per-theme `--accent`/`--accent2`/`--accent3` — surface accents.
2. themes.css `:root --person-*` **≡** themes.js `PERSON_COLORS` — tag-chip colors (**duplicated** css+js).
3. travelers.js `TRAVELER_DOT` — author-attribution dots: `{jonathan #1E3A6F navy, helen #2E5D3A, aurelia #E8478C, rafa #C9342A}`. Mirrors accents **except jonathan** (navy, not oxblood).
4. travelers.js `TRAVELERS[].color` — "legacy integration-attribution": `{#1A1614, #8B2B1F, #C77A45, #E63333}`. **LIVE** (Settings.jsx:435,437 active-pill bg/border).
5. themes.js `THEME_COLORS` **≡** index.html `themeColors` — PWA chrome bg (drifted; #5-dead-in-js / live-in-html).

---

## PHASE 3 — SURFACE TYPING

Effective color = nominal flattened over backdrop (sRGB, rounded). `bg-nav` (alpha .86–.88 over same-hue `--bg`) flattens to **≈ base `--bg`** for every persona → top-bar text contrast == the `--bg` column.

### 3.1 Token surfaces

| surface | opacity | backdrop | effective (J / H / Hd / A / R) | role |
|---|---|---|---|---|
| `--bg` | opaque | — | `#0E0F11` / `#F2EFE7` / `#14110D` / `#FCE8EE` / `#1A0A0B` | text-bearing page ground |
| `--bg2` | opaque | — | `#15171A` / `#E6E1D2` / `#1F1B14` / `#F8D2DF` / `#2A1012` | text-bearing secondary |
| `--card` | opaque | — | `#1C1E22` / `#FFFFFF` / `#2A241B` / `#FFF2F6` / `#3C1518` | text-bearing card |
| `--bg-nav` | .86–.88 | `--bg` | `#0E0F11` / `#F2EFE7` / `#14110D` / `#FCE8EE` / `#1A0A0B` | text-bearing nav (top-bar) |
| `--tag`/`--accent` (as fill) | opaque | — | accent hue | decorative fill carrying `--tag-text`/`--accent-ink` |

### 3.2 Literal / hardcoded surfaces

| surface | nominal | opacity | backdrop | effective | role |
|---|---|---|---|---|---|
| ConfirmCard `draftBg` | `#F8F4E9` | opaque | — | `#F8F4E9` | text-bearing (universal draft slip) |
| ConfirmCard `oxbloodBgFill` | `rgba(163,58,46,.08)` | .08 | draftBg | `#F1E5DA` | text-bearing (oxblood label) |
| ConfirmCard `oxbloodBgSoft` | `rgba(163,58,46,.06)` | .06 | draftBg | `~#F2E6DB` | decorative wash |
| AureliaView card | `#FBF5EC` | opaque | — | `#FBF5EC` | text-bearing (3rd Aurelia palette) |
| AureliaView pink wash | `rgba(232,71,140,.22)` | .22 | card | varies | decorative |
| RafaView blue badge | `#3D6FB8` | opaque | — | `#3D6FB8` | text-bearing (`#fff`) + used as text/border |
| RafaView green badge | `#2E5D3A` | opaque | — | `#2E5D3A` | text-bearing (`#fff`) |
| day-chip.active | `#8B2B1F` | opaque | — | `#8B2B1F` | text-bearing (`#F2EBDA`) |
| switcher pill | `rgba(20,16,14,.86)` | .86 | `--bg` | `#13100E`(J)…`#332F2C`(H) | text-bearing (`#FBF8F2`) — stays dark all personas |
| btn-solid | `#1A1614` / inv `#F2EBDA` | opaque | — | — | text-bearing |
| memory-textarea | `#FBF8F2` / dark `#1F1A14` | opaque | — | — | text-bearing (input) |
| App.css helen top-bar | `rgba(250,246,239,.82)` | .82 | `--bg` | `#FAF6EF` | text-bearing (helen title `#2a2520`) |
| App.css rafa top-bar | `rgba(8,12,22,.88)` | .88 | `--bg` | `#0B0E15` (**deep-blue**) | text-bearing — drift from warm rafa |
| `.helen-photo`/`.grid-bg` washes | white/black/ochre @ .04–.20 | — | — | — | decorative only |

---

## PHASE 4 — CONTRAST LEDGER (core deliverable)

Full text-token × ground × persona matrix (round=true). Bars read per use: **normal 4.5 / large ≥24px or ≥18.66px-bold 3.0 / UI-component 3.0.** Most `color: var(--accent*)` sites are small-to-medium labels/links/numbers → **4.5 unless explicitly large**.

### 4.1 Token text on token grounds (ratio; `XX`<3.0, `↓N`=3.0–4.49, else ok)

```
            ──bg──        ──bg2──       ──card──
jonathan
  text      15.42 ok      14.44 ok      13.42 ok
  muted      5.70 ok       5.56 ok       5.37 ok
  faint      2.38 XX       2.41 XX       2.42 XX
  accent     2.92 XX       2.74 XX       2.54 XX     ← fails even large, all grounds
  accent3   15.42 ok      14.44 ok      13.42 ok     (=#EDE6D6 paper, safe)
helen
  text      14.58 ok      12.82 ok      16.75 ok
  muted      4.97 ok       4.66 ok       5.23 ok     ← A11Y-1b fix lands (bg 4.97)
  faint      1.98 XX       1.95 XX       2.01 XX
  accent     6.66 ok       5.86 ok       7.66 ok     ← helen accent-as-text SAFE
helen-dark
  text      15.84 ok      14.42 ok      12.93 ok
  muted      6.56 ok       6.28 ok       5.85 ok
  faint      2.62 XX       2.66 XX       2.62 XX
  accent     3.40 ↓N       3.10 ↓N       2.78 XX     ← fails normal; card fails large too
aurelia
  text      13.95 ok      11.89 ok      15.01 ok
  muted      4.53 ok       4.26 ↓N       4.66 ok     ← bg2 edge
  faint      1.99 XX       1.95 XX       2.01 XX
  accent     3.14 ↓N       2.67 XX       3.38 ↓N     ← fails normal; bg2 fails large too
rafa
  text      17.95 ok      16.59 ok      14.93 ok
  muted      8.95 ok       8.52 ok       7.93 ok
  faint      3.38 ↓N       3.35 ↓N       3.29 ↓N     ← fails normal (rafa faint highest)
  accent    11.13 ok      10.29 ok       9.26 ok     ← rafa ochre accent-as-text SAFE
  accent2    3.67 ↓N       3.39 ↓N       3.05 ↓N     ← rafa OXBLOOD-as-text fails normal
```

### 4.2 Fill text (tag-text / accent-ink on accent fill)

| persona | ratio | verdict |
|---|---|---|
| jonathan `#FFF6E8` on `#A33A2E` | 6.12 | ok |
| helen `#FFFFFF` on `#2E5D3A` | 7.66 | ok |
| helen-dark `#F2EBDA` on `#B0463F` | 4.66 | ok (marginal) |
| **aurelia `#FFFFFF` on `#E8478C`** | **3.68** | **fails normal 4.5** (ok as 3.0 UI/large) |
| rafa `#1A0A0B` on `#FFB833` | 11.13 | ok |

### 4.3 Literal-island text (persona-invariant unless noted)

| pair | ratio | bar | verdict |
|---|---|---|---|
| `T.ink #15201A` / draftBg | 15.25 | 4.5 | ok |
| `T.inkMuted` / draftBg | 4.56 | 4.5 | ok (barely) |
| `T.inkFaint` / draftBg | 1.99 | 4.5 | fail (strikethrough/decorative) |
| **`T.draftEyebrow #8A6F2D` / draftBg** | **4.35** | 4.5 | **fails normal** (small eyebrow caption) |
| `T.oxblood #A33A2E` / draftBg | 5.97 | 4.5 | ok |
| `T.oxblood` / oxbloodBgFill `#F1E5DA` | 5.30 | 4.5 | ok |
| day-chip `#F2EBDA`/`#8B2B1F` | 7.17 | 4.5 | ok |
| btn-solid both directions | 16.95 / 15.12 | 4.5 | ok |
| switcher `#FBF8F2` / pill (all personas) | 12.5–17.9 | 4.5 | ok |
| **memory placeholder (light)** `rgba(26,22,20,.42)`/`#FBF8F2` | **2.67** | 4.5 | **fail** (placeholder) |
| **memory placeholder (dark)** `.45`/`#1F1A14` | **3.94** | 4.5 | **fails normal** (placeholder) |
| AureliaView `#3D2424`/`#2A1818` on `#FBF5EC` | 13.12 / 15.60 | 4.5 | ok |
| AureliaView `#C03671` on `#FBF5EC` | 4.83 | 4.5 | ok (barely) |
| **RafaView `#3D6FB8` (text/border) on bg / card** | **3.81 / 3.17** | 4.5 | **fails normal** (off-palette blue) |
| RafaView `#fff` on blue/green badge | 5.04 / 7.66 | 4.5 | ok |
| App.css helen title `#2a2520` / `#FAF6EF` | 13.96 | 3.0(lg) | ok |
| App.css rafa sub `#FFB833` / deep-blue bar | 11.29 | 4.5 | ok |
| jj-ox `#C0573F` / `#14110D` (**DEAD**) | 4.19 | 4.5 | n/a (never renders) |

### 4.4 Reconciliation of the three known findings

| finding | recomputed | claimed | status |
|---|---|---|---|
| jonathan accent-as-text, trips-index (`--bg`) | **2.92** | 2.92 | ✓ exact |
| aurelia accent-as-text, trips-index (`--bg`) | **3.14** | 3.13 | ✓ (±0.01 rounding) |
| helen `--muted` on `--bg` (A11Y-1b) | **4.97** | 4.97 | ✓ clears 4.5 |

(Also A11Y-1c "jonathan 2.92 / aurelia 3.13 trips-index" is the same accent-on-bg pair as row 1/2 of §4.1 — confirmed, and shown to be one instance of the app-wide pattern.)

---

## PHASE 5 — ACCENT CONSUMPTION (fill vs text)

`grep -rin "var(--accent"` / `"var(--tag"` across all source, classified by property:

- **TEXT-on-ground (`color: var(--accent*)`):** **~150 sites, PERVASIVE.** Present in essentially every component CSS: App.css, BottomNav, DiscoverView, EmergencyFab, EssentialsCard, FilterBar, FlightHomeCard, GasWarning, HoustonFriday, ItineraryView, JonathanQueue, KennedaleDay, MapCard, NavBar, Navigation, NextUpCard, PersonSelector(dead), PlaceholderView, PodcastSection, PrepCard, ShareButton, StopCard, TonightCard, TripView, YouTubeSection; plus inline `style={{color:'var(--accent)'}}` in Helen/Aurelia/Rafa/Jonathan views, ClaudeChat, TripIndex. Split ≈ `--accent` (most), `--accent3` (emphasis), occasional `--accent2`.
- **FILL-with-accent-ink (`background: var(--accent*)` + `color: var(--accent-ink|--tag-text)`):** ~96 `background…var(--accent*)` sites (StopCard chips/dots, rafa `.rafa-bg-*`, App.css rafa underbar, tag chips via `color: var(--tag-text)` ×15). Contract-safe except Aurelia (§4.2).
- **BORDER-decorative (`border*: var(--accent*)`):** ~148 sites — out of scope.

**Answer — is accent-as-text trips-index-only or pervasive?** **PERVASIVE.** trips-index is one of ~150 sites. The redesign needs a dedicated **readable-on-`--bg` emphasis token** (distinct from the saturated fill accent) because `--accent3` only solves it for jonathan (paper) and rafa (ochre); helen/aurelia/helen-dark set `--accent3`==`--accent` and inherit the failure.

**Token-semantics note:** `--accent3`'s intent ("a brighter, readable emphasis") is honored only by jonathan/rafa. This is the latent hook for the missing emphasis token.

---

## PHASE 6 — COMPONENT COMPLIANCE + LITERAL ISLANDS

### 6.1 Live theming paths (compliant — read CSS vars)

- **View components** render via inline `style={{… 'var(--…)'}}`: JonathanView (56 var refs / 1 decorative literal), HelenView (46 / 8), AureliaView (44 / **27**), RafaView (15 / **18**). JonathanView+HelenView are effectively token-clean.
- **Live utility classes (token-driven):** `.surface-light`/`.surface-dark` (template-literal className in TripEditor:252, StopDetail:36, NewTrip:105, Settings:193,207), `.embed-panel`, `.btn-pill` (56×), `.btn-solid`, `.day-chips`/`.jj-day-chip`/`.rafa-day-chip`, `.switcher`. All pull from `var(--…)` (or pass contrast as literals).
- **Component `.css` files** use `[data-theme='X'] .foo` overrides + `var(--…)` — token-compliant. The live helen-dark surface is the **`data-theme="helen-dark"` attribute → themes.css warm tokens**.

### 6.2 Live VIOLATORS (render their own literals)

| component | island | impact |
|---|---|---|
| **AureliaView** | `#FBF5EC`/`#3D2424`/`#2A1818`/`#C03671` + 5-tint array + pink shadows (lines 49,442–538) | 3rd Aurelia palette; text passes but diverges from themes.css aurelia AND dead au-* |
| **RafaView** | blue `#3D6FB8` + green `#2E5D3A` mission badges/labels (280,339,365,395) | off-palette (rafa = ochre/oxblood); **blue-as-text fails normal (3.17–3.81)**; platform.css comment claims this was "collapsed to ochre+oxblood" — **only platform.css was migrated, not the view** |
| **ConfirmCard** | `T.*` draft-slip (36–50) | **intentional** persona-invariant cream-slip; draftEyebrow 4.35 edge |
| **App.jsx** | `topBarTokens()` gradients/text (51–71) | passes; parallel to App.css `.top-bar` |
| **App.css** | top-bar stale literals: rafa deep-blue `rgba(8,12,22,.88)`, jonathan yellow `rgba(253,216,53,…)`, helen `#2a2520` | diverge from themes.css; pass contrast |
| **platform.css** | chrome literals (day-chip/btn/switcher/memory/toggle) | pass except memory placeholders (2.67/3.94) |

### 6.3 COVERAGE_MATRIX cross-check (did capture cover every component?)

`COVERAGE_MATRIX.md` (grounded at older HEAD `4b04639`) maps **19 surfaces** — S1–S10 full-screen views + O1–O9 overlays — by surface×persona×state×tier, **not** a per-component theme-compliance pass. Theme/contrast was actually walked via:
- **axe (contrast) tier:** only **S1 (×4 personas)** and **O1 (×4)**. Explicitly *no* axe contrast on S2 (C1-GAP-2), S3 (zero coverage, C1-GAP-1), S4/S5/S6/S7/S10 (C4/C5-GAP-4), S8/S9 (C3a-GAP-1), and overlays O2–O9.
- **visual pw ×4:** S2, S8, S9 — catches **wrong-theme bleed**, not contrast ratios.

**Themed-but-unwalked-for-contrast surfaces:** S2 trip-home (the four View components — incl. the RafaView/AureliaView islands above), S3 StopDetail, S4–S7, S10, and O2–O9. The ~150 accent-as-text sites and the §4 failing pairs live overwhelmingly in these un-axe'd surfaces — which is why CI is green while the matrix says "fails almost certainly more."

### 6.4 Does any other component still snapshot a palette?

Live snapshots: AureliaView, RafaView (§6.2). **Dead** snapshots (defined, never applied — Phase 8): platform.css `.jj-*` (jj-paper `#14110D`…), `.au-*` (peach palette), `.helen-bone.helen-dark` (Jonathan-cold mirror). The dead au-* palette ironically **passes** contrast (6.8–13.4) better than themes.css aurelia.

---

## PHASE 7 — STRUCTURAL QUESTIONS (surfaced, not answered)

### 7.1 helen-dark — fifth persona or MODE?

**MODE, Helen-only.** Content-anchored:
- Setter `App.jsx:230`: `const themeName = traveler === 'helen' && helenDark ? 'helen-dark' : traveler`.
- `darkSurface` `App.jsx:203–206`: `traveler==='jonathan' || traveler==='rafa' || (traveler==='helen' && helenDark)`.
- `topBarTokens` `App.jsx:52,59`: jonathan/rafa branch + helen&&helenDark branch share one dark token set.
- `useHelenDark` (hooks/useHelenDark.js): localStorage `rt_helen_dark_v1`, broadcast via custom event; comment line 5 "Jonathan/Aurelia/Rafa palettes are fixed."

**No other persona has a dark variant.** Dark is **not orthogonal to persona**: 2 permanent-dark (jonathan, rafa), 1 permanent-light (aurelia), 1 toggleable (helen). It occupies a 5th `[data-theme]` block but is conceptually Helen's second mode. The redesign must decide whether "dark" becomes a first-class axis (×N personas) or stays a per-persona property.

### 7.2 Privileged default — where jonathan leaks into code

| # | site | leak |
|---|---|---|
| 1 | themes.css:19 | `:root, [data-theme='jonathan']` — **jonathan == the CSS default**; unthemed scopes get jonathan tokens |
| 2 | index.html:56 | bootstrap `if (!p) p = 'jonathan'` |
| 3 | index.html:9 | static `<meta theme-color content="#16102a">` (jonathan-drifted) before JS |
| 4 | App.jsx:100 | `readTraveler()` returns `'jonathan'` fallback |
| 5 | a11y-axe.spec.js:17 | `resolvePersona('jonathan')` — **CI contrast gate defaults to jonathan** |
| 6 | useTheme.js:42 (dead) | `const DEFAULT = 'jonathan'` |

**Fallback-literal leaks (inconsistent, no single default):** reset.css:80 `outline: var(--accent, #c0734a)` (copper — matches no persona); NavBar.css:194 `var(--accent2, #e53935)` (red); NavBar.css:106 `var(--tag-text, #fff)`; AureliaView/RafaView `var(--accent-ink, #fff|#1A0A0B)`. The CSS-var fallbacks disagree with each other and with every live persona.

### 7.3 Verification asymmetry — walkable ×4 vs keyed-to-one

- **Walkable ×4** via `RT_PERSONA` (persona.js fixture: e2e→jonathan, sim→helen by default; `RT_PERSONA=rafa …` rotates): the full e2e/sim suites + the axe scan *can* run any persona.
- **Keyed to one in CI:** the axe contrast gate runs **jonathan by default**, ×4 only on **S1 + O1** (it had the O1/O2 allowlist removed at `7146701`). Everywhere else contrast is unverified unless someone manually rotates `RT_PERSONA`.
- **Gap the redesign should close structurally:** contrast verification is jonathan-on-2-surfaces; the ~150 accent-as-text sites on S2–S10/O2–O9 across helen-dark/aurelia/rafa are outside any automatic gate. Visual ×4 (S2/S8/S9) catches *bleed*, not *ratio*.

---

## PHASE 8 — DEAD CODE (list, do not delete)

All confirmed via `grep -i` + second-read at this HEAD.

| path / symbol | evidence of death |
|---|---|
| `hooks/useTheme.js` (whole file) | no `import` anywhere; only comment mentions (DEADCODE-1) |
| `components/PersonSelector.jsx` + `PersonSelector.css` | never imported/rendered (`grep -ri PersonSelector` → only its own files) |
| `data/themes.js` → `THEMES`, `THEME_ORDER`, `THEME_COLORS` | only consumers are useTheme.js + PersonSelector.jsx (both dead). `THEME_COLORS` = the drifted palette. (`PERSON_COLORS` stays — live.) |
| platform.css `.jj-paper`/`.jj-soft`/`.jj-faded`/`.jj-ox`/`.jj-inverse`/`.jj-rule` (276–291) | **zero** `className` occurrences (code or template) — only comments |
| platform.css `.au-cream`/`.au-blush`/`.au-coral`/`.au-deep`/`.au-ink`/`.au-rule`/`.au-tape` (294–304) | **zero** className occurrences |
| platform.css `.helen-bone`/`.helen-paper`/`.helen-soft`/`.helen-faded`/`.helen-rule` + `.helen-bone.helen-dark` (153–183) | **zero** className occurrences (App.jsx/NewTrip hits are *comments*); the `.helen-dark` cold-mirror `#0E0F11`/`#EDE6D6` never renders (live helen-dark = `data-theme` tokens) |
| platform.css descendant overrides keyed to dead classes: `.jj-paper .embed-panel`, `.helen-bone.helen-dark .embed-panel`, `.jj-paper .memory-textarea`, `.helen-bone.helen-dark .memory-textarea` (206–207,415–428) | selectors can never match (the `.surface-dark` siblings ARE live, so embed/memory still flip dark correctly) |
| ConfirmCard local `Eyebrow` (ConfirmCard.jsx:74) | no `<Eyebrow>` in ConfirmCard. **Eyebrow is copy-pasted 6×** (ConfirmCard, PostcardComposer:703, AureliaView:785, RafaView:494, TripIndex:531, HelenView:546); the other 5 are each used locally — only the ConfirmCard copy is dead. (Duplication finding, not just dead.) |
| ConfirmCard `tone === 'standby'` branch (ConfirmCard.jsx:176) | only the read; no caller passes `tone="standby"` (kennedale.js "standby" is unrelated trip content) |
| `'Newsreader'` font (platform.css:403) | family never `@import`-ed or `<link>`-ed → silent Georgia fallback |

---

## APPENDIX A — METHOD / CALCULATOR VALIDATION

No committed contrast calculator exists in the repo (a11y is enforced at runtime by axe-core: `app/tests/e2e/a11y-axe.spec.js` + `_fixtures/axe.js`). Calculator **rebuilt** for this recon (`/tmp/wcag.cjs`, outside the repo — no tree change):

1. Parse `#hex` / `rgba()`.
2. **src-over composite in sRGB (gamma) space**, then **round each channel to nearest 8-bit int** (this is what makes it reproduce the Helen fix — it computes on the actually-rendered color, as a browser/axe does).
3. Relative luminance per WCAG (`c/12.92` or `((c+.055)/1.055)^2.4`; `.2126/.7152/.0722`); ratio `(L1+.05)/(L2+.05)`.

**Anchor validation (round=true reproduces BOTH exactly; float path is off by ~0.003):**

| anchor | flattened | ratio | expected |
|---|---|---|---|
| old helen `--muted` `rgba(21,32,26,.62)` / `#F2EFE7` | `#696F68` | **4.4856** | #696F68 / 4.4856 ✓ |
| helen-dark `--muted` `rgba(242,235,218,.62)` / `#14110D` | `#9E988C` | **6.5641** | #9E988C / 6.5641 ✓ |
| new helen `--muted` `rgba(21,32,26,.65)` / `#F2EFE7` | `#626862` | **4.9719** | ~#626862 / 4.97 ✓ |

Known-finding reproduction: jonathan accent/bg **2.92** (=2.92), aurelia accent/bg **3.14** (≈3.13), helen muted/bg **4.97** (clears). Calculator + persona token tables are sound; all §4 numbers derive from this method.
