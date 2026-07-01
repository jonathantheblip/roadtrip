# 05 · Components, states & reconcile

Implementation contract. Component inventory + the states each must support, the
**what-mounts-when** gating matrix, and the reconcile table (every wired feature, kept/scoped/
enhanced).

---

## Component inventory (home)
All read `tokens.css` vars; all are skin-agnostic. `gate` = the signal that mounts it.

| Component | Gate | Key states |
|---|---|---|
| `JourneyRail` | trip.shape === composite | per-leg dots (done / now / upcoming); tap → Plan; shows leg-local time |
| `Hero` | always | **At** [place] (stay) / **In** [city] (composite); eyebrow per leg; conditions line; `LIVE MAP` cue → Map |
| `ContextCard` | composite **and** new-city day **and** (zone/currency/lang delta) | full card day 1 → folds to a rail line after |
| `ArrivalMoment` | first open in a new country/zone | once, then dismissed (persist "seen" per leg) |
| `WeaveStory` | always | **empty** (promise) · **forming** (live, Idea A) · **woven** (page) |
| `WhosAround` | phase === during | per person: `is-home` / `is-out` / `is-live`; wave; cross-leg + timezone-honest |
| `NextUp` | a timed thing exists | flight / train / reservation; **+1 day** when it crosses midnight; mode icon |
| `WeCould` | always (live trips) | header scoped "in [city]"; travel from current lodging; prices in local currency; weather-aware ranking |
| `Lately` | always | **empty** ("photos will gather") · carousel · post-trip wall |
| `Agenda` | always | stay events (**honest overflow** ≤4 vs +N) · **nothing-day** rotating line · composite **parts** outline |
| `QuietActions` | always | Share · Surprises · Replay · The book (folded) |
| `TabBar` | live trip | WE COULD · NOW · PHOTOS · LOOK BACK (unchanged; now available to composite) |

### Decision-specific (live on/around the home)
| Component | States |
|---|---|
| `MapPanel` | stay (presence, no bar) · city (walk/transit next-leg) · road (**drive %** bar, kept) · mixed (active-leg, mode strip) |
| `GettingThere` | walk-open (no leave-by) · walk-timed (soft nudge) · transit · drive (full countdown) → deep-link mode follows |
| `AgendaOverflow` | ≤4 (none) · 5+ (`+N more · times ⌄`) · expanded (`Show less ⌃`) |
| `CreateTrip` | floor (title/place/dates) → **Ready to publish** (pre-filled summary + seeded days) → one-tap Publish |

---

## Gating matrix — complexity can't leak down
Columns = scenarios. ✓ = mounts. (A Grandma's · B lake · C city+flight · D Italy)

| Module | A | B | C | D |
|---|:-:|:-:|:-:|:-:|
| Living heart (hero, Weave, who's-around, We-could, Lately, agenda) | ✓ | ✓ | ✓ | ✓ |
| A flight in Next-Up | – | – | ✓ | ✓ |
| Journey rail · "part X of N" | – | – | – | ✓ |
| Per-leg context (currency, language) | – | – | – | ✓ |
| Timezone "now" + arrival moment | – | – | – | ✓ |
| We-could scope qualifier ("in Florence") | – | – | – | ✓ |

**The contract:** a module mounts **only** on a real signal (explicit parts · a flight · a
zone/currency delta). No delta → no module. A/B are byte-for-byte the locked living heart.

---

## Reconcile-before-replace — nothing is deleted
Every wired feature survives; some are **scoped** or **enhanced**.

| Feature | Status |
|---|---|
| **The Weave** (nightly recap + video + book) | **kept** · gains all-day "forming" (Idea A) |
| **Surprises** (hide a part/day/trip; reveal on arrival/date/manual) | **kept** · can hide a whole leg/part; Claude-never-spoils rule intact |
| **Replay** (Ken-Burns playback) | **kept** · per-leg or whole-trip |
| **Who's-around + waves** | **kept** · now timezone-honest, cross-leg |
| **We-could tray** | **kept** · scoped to the current leg |
| **Share-a-moment · Photos · all-photos** | **kept** · unchanged |
| **Face recognizer ("show me, me")** | **kept** · unchanged |
| **Claude concierge** (sentence → trip) + shape picker | **kept** · still creates stay/city/road/bigger-trip from parts |
| **4-tab shell** (We could / Now / Photos / Look back) | **kept** · now available to composite trips |
| **Driving rail / "% of drive" everywhere** | **retired** from the common home; the drive bar survives **only** as the Map's road face + the drive "Getting there" |

---

## New screens / navigation — flags
**Zero new destinations.**
- **Journey rail** = a strip on the home; tapping a leg **reuses The Plan**.
- **Arrival moment** + **timezone note** = ephemeral banners (not screens).
- **Per-leg context** = a home module.
- **Agenda overflow** = expands in place; "full day" reuses **The Plan/Itinerary**.
- **Getting there** = the stop's own affordance, re-shaped.
- The closest thing to "new" is the **arrival moment** — kept (liked); if it should never take
  over, a non-blocking banner variant is a one-line change.
