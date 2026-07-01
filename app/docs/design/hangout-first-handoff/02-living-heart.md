# 02 · The living heart (the home)

The home is the center of gravity. **One component**, themed per person (`01`/`tokens.css`), that
reads the trip and reshapes. Prototypes: `Roadtrip — Scaling the Home.html` (scaling) + the
"alive at empty" frame in `Roadtrip — Hangout-First Redesign.html`.

---

## Anatomy (top → bottom)
Every module is **conditional**. On a bare weekend most are a single warm line; on a 3-city trip
they fill in and a few extra mount on top.

1. **Journey rail** — *composite only.* "Part 2 of 3 · Rome ✓ · Florence ● · Venice" + leg-local
   time. (See `03`.)
2. **Hero** — full-bleed place photo (`--hero-h` 248px). **"At [place]"** (stay) / **"In [city]"**
   (composite). Eyebrow = leg + day; a faint conditions line. Carries a **`LIVE MAP`** cue
   (fixes the old "no tappable affordance" gap). Tap → the live Map (Decision 1).
3. **Per-leg context card** — *composite, new-city day only.* Local time, weather, currency,
   language. Folds to a quiet rail line after day one. (See `03`.)
4. **The day's story (Weave)** — entry to the auto-woven recap. **Empty → a promise** ("Your
   weekend's story will write itself here"); **forming → live** ("3 moments in · Rafa named a frog
   at the dock"); **woven → the page.** (Idea A, below.)
5. **Who's around** — *during only.* Live presence band: avatar + where + a `is-home/is-out/is-live`
   dot, with a one-tap **wave**. Timezone-honest across legs ("Aurelia's still in Rome").
6. **Next up** — *when a timed thing exists.* The most imminent flight/train/reservation, just-in-
   time, with honest cross-midnight/zone framing (See `03` flights). Icon by mode.
7. **We could…** — nearby tray, **scoped to the current leg** ("We could… *in Florence*"), travel
   from this leg's lodging, weather-aware. (See `03`.)
8. **Lately** — recent photos. **Empty → "Photos will gather here as you go"** (dashed); else a
   horizontal carousel; a fuller "wall" after the trip.
9. **On the agenda** — a stay's few events (honest overflow, `01`), or — composite — the parts →
   days outline. Empty → a rotating **"nothing-day" line** + a soft "Add something." (`04`)
10. **Quiet actions** — a demoted row: Share a moment · Surprises · Replay · The book.
    *(Folded, never deleted.)*

---

## Three axes the home reads

### Shape
- **Stay** — one base you return to (the common case). Hero **"At [place]."** No rail, no parts.
- **Route** — the rare road trip; leads with the day's focus + the drive (Decision 1 "road").
- **Composite** — explicit *parts* (flights + multiple cities). Hero **"In [current city]"** +
  the journey rail. (See `03`.)

### Phase
- **Upcoming** — a countdown; gentle "fills in as you go" prompts; Next-Up shows the outbound
  travel (e.g. the red-eye, `03`).
- **During** — live: who's-around, leg-scoped We-could, the forming Weave.
- **After** — a keepsake: the woven story + a photo wall + "Relive the trip."

### Data fullness
Empty → **alive-at-empty promises** (never sad blanks). A little → first photos appear, Weave
"forming." Full → the woven story + carousel. *Same modules; richer as data lands.*

---

## "Alive at empty" (the rule that makes a fresh trip feel complete)
A just-created trip is **complete, not blank**. Each empty module states its *future*, warmly:

| Module | Empty state |
|---|---|
| Hero | "At Grandma's" over a warm frame — a place you're going, not a form. |
| Weave | "Your weekend's story will write itself here." |
| Lately | "Photos will gather here as you go." |
| Agenda | "Nothing planned — and that's allowed." + "Add something" |
| Door | One gentle "See what you could do nearby." |
| Who's coming | the four avatars + "all four of you" |

This is the look the team loved — extend the same warmth to **every skin** (`skins.html`, `06`).

---

## The At / In rule (one-place trip reads simple)
Render **simple** ("At [place]") unless the trip has **≥ 2 places/legs** OR a **timed multi-event
day** — then render **composite** ("In [city]" + the journey rail + "The plan").

- A trip's lone internal **"part" no longer forces** the complex frame. The **shape of the
  content** decides, not a hidden flag.
- Grandma's weekend, the lake house → **At**. Rome→Florence→Venice, the NY birthday (drive +
  flight + multi-stop days) → **In**.

---

## Locked "living heart" direction (from review)
- **Idea A — the page forms as you go.** *Keep.* The Weave doesn't wait for bedtime; from the
  day's first photo/voice note the home shows it taking shape all day. Being-there becomes the
  keepsake in real time.
- **The living heart *is* the stay's heartbeat.** On a stay, the home leads with **who's around +
  the day's light** (location-adaptive conditions — tide only near an ocean; otherwise sunset /
  feels-like / etc., see `04`/`05`) — not an agenda. An empty day reads *inhabited*, not blank.
- **"Nothing days" are common and welcome.** Replace the single "Today's yours" with a **wide,
  rotating set** of permission-giving lines (full set in `04`). Same sentiment, never repeated two
  days running.
- **Arrival moment — keep** (liked in review). A once-per-city card on entering a new
  country/timezone ("Welcome to Italy — clocks +6, € now, Italian"). Ephemeral, then gone. (`03`)

---

## Per-skin facelift (the wish)
The home renders for **Jonathan / Helen / Aurelia**, re-themed via the skin tokens; **Rafa keeps
his simpler iPad pad** but inherits the same warmth and type energy. The editorial polish shown in
Helen's lens should carry to each skin — same structure, each skin's color/type/radius. See the
working `skins.html` and the guidance in `06`.
