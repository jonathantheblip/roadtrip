# Chapter 2 — Finish the story

Retroactively documenting a past day or trip — in the moment, weeks later, or years later —
so the order never matters and it always feels like a **ten-minute couch ritual with the family
shoebox, never homework.** Live components: `album/finish.jsx` (`FinishApp`), `album/chapter2.jsx`.
Copy: `specs/copy_deck.md`. **Rafa is excluded by rule** — he never sees settle machinery; his
contributions (stamps, voice notes) surface *inside a parent's* flow. Voices: Helen / Jonathan / Aurelia.

> **Disqualifying signals (hard constraints).** Any of these is a bug: a fraction or count
> ("3 of 7 days"), completeness meters, red dots, the word "unfinished," enumerated backlogs, or an
> entry point that interrupts the CURRENT day's home. Six dashed rings must never whisper "you failed
> six times." **The app never initiates about the past — doors, never knocks.** Permission-to-ignore
> copy everywhere ("they're safe here"). A kept day stays OPEN (late photos/names/stamps still slide in).

---

## The engines are ready — this design is only the DOORS
The pin-builder takes ANY date; the keep-writer takes ANY day; the book accepts ANY day's page.
Today those are welded to the live evening ritual. This chapter unwelds them. Do not rebuild the
engines — expose them through the surfaces below.

---

## Screen A — The door (on a finished trip's keepsake home)
The finished-trip home is a keepsake (photo wall + replay). Add a **quiet action row**, never a banner:

- A single soft invite card, led by warmth, not blanks. Copy (permission-to-ignore built in):
  - Helen "Two days from the cabin week are still loose — want to tuck them in?" + "No rush — they're safe here."
  - Jonathan "Two days never got signed off. Worth a look?" + "No deadline. They keep."
  - aurelia "two days are still floaty. keep 'em?" + "whenever. they're not going anywhere."
- Below it, the **softened after-trip day grid** returns (it's hidden today once a trip ends). Dots:
  **gold = kept**, a quiet **ring = loose** (has evidence, unnamed), **faint = quiet day**. **No "Still
  loose" verdict text, no counts on the grid.** Tap any day → Screen B / C / D.
- **Whole-trip pass vs single-day:** the card is the whole-trip entry (leads into a guided, material-led
  day-by-day pass, Screen G); tapping a single grid dot enters just that day. Both also reachable from the
  **"Looking back" resurfacing card** and the **reel's day-picker sheet** (existing reminiscing entry points).

---

## Screen B — The past-day settle page (`DayPage`) — Q2
**Album-page layout, led by the material** — NOT the current stacked-form sheet. Top→bottom:
- Day header: date + (if named) name; `--font-display`.
- **Photos big** — a full-bleed-ish column/grid of the day's photos (this is the couch-shoebox feel).
- **Evidence pins as caption slots**: each machine-guessed moment renders as a **caption awaiting a word** —
  dashed border + `--font-mono`, e.g. `RACE POINT BEACH · 11–1 · 12 PHOTOS` rendered dashed/italic until named.
  Tap → inline text field → type a name → it sets (dashed → solid, the family's word). Hint copy:
  Helen "Give it a name — or leave it, it's fine as it is." / Jonathan "Name it, or leave it." / aurelia "name it. or don't."
- **"Leave this out"** — a quiet per-pin action (findable, not procedural): a small `× leave out` on each pin,
  not a prominent destructive control.
- **Rafa's pending contributions surface HERE, inside the parent's flow**: "Rafa told about this day — listen"
  (a voice-note chip) and his stamps appear on the relevant photos. The parent settles; Rafa never sees settle UI.
- **One keep at the end** — a single gold "Keep this day" button (Screen E). Never per-pin "save" buttons.
- **Order never matters:** naming works with zero, some, or all photos present; late photos slide in after a keep.

---

## Screen C — Pooled quiet days — Q3
The live rule pools quiet days; the past tense pools too. When a stretch of low-evidence days is selected
(or offered on the whole-trip pass): one combined card, one keep — not three separate settles.
- Helen "The middle of the week was quiet — keep those three together?" / Jonathan "Three quiet days. Keep
  them as one?" / aurelia "the quiet stretch — keep 'em as one?"
- The combined keep writes all pooled days as kept in one gesture; each still independently accepts late material.
- A single quiet day on its own: Helen "We stayed put, gloriously." / Jonathan "A quiet one. Nothing to log."
  / aurelia "a nothing day. kind of perfect."

---

## Screen D — No-evidence day — Q4
A past day with zero located photos (GPS backfill hasn't run, or there truly are none):
- Offer **rest or a few words** — never a blank form: "This day can just rest — or tell it in a few words."
  (Helen) / "No located photos this day. Leave it, or add a line." (Jonathan) / "no pics landed here. let it
  rest, or say what happened." (aurelia). Typing OR voice only.
- The **GPS backfill "letter"** may land here too (one-time, per trip): Helen "214 photos from the Cape found
  their places — have a look." → jumps into the now-located days. (This is the sibling of Ch3's backfill letter.)

---

## Screen E — The keep moment — Q5
What changes when a past day is kept:
- The day goes **gold**. Confirmation, warm, one line: Helen "Kept by Helen. Tonight's story writes itself
  from this." / Jonathan "Signed off. The record stands." / aurelia "kept. it's yours now."
- **Keeping means "this day counts," never "this day is closed."** The kept day keeps accepting late photos,
  names, and stamps. Re-opening it to name one more moment must feel like **adding a caption, not redoing paperwork.**
- **The book, in the same gesture** (honor the one-keep rule): the Weave page regenerates for that day and is
  offered immediately — Helen "Keep its page in the book?" / Jonathan "Add its page to the book?" / aurelia
  "want its page in the book?" Kept book pages are prints.

---

## Screen F — Aurelia's authorship — Q6
Her "**pick the day's picture**" is a first-class, one-tap gesture (a feature, not a filter):
- Inside the day page (her lens), one tap on a photo marks it the day's picture — it then **drives the day
  chip, the resurface card, and the book page.**
- Her keep reads, in look-back, as **"kept by aurelia"** (gold, lowercase). Her authorship is visible and credited.

---

## Screen G — The archive at scale — Q7
A trip from two years ago, 300 photos, nothing named. The honest, calm shape of "finish this whole trip":
- **Material-led, not a checklist.** Lead with highlights the material offers (best/densest moments first),
  not an enumerated day list. A guided **day-by-day pass** is available but framed as a gentle sequence you can
  **stop at any time** ("stop whenever — the rest keeps"), never a progress bar or "X of Y."
- Reuse Screen B's day page for each day; reuse Screen C pooling for the quiet stretches. One keep per day/pool.
- The whole-trip pass is the destination of Screen A's invite card. It never nags; leaving mid-pass loses nothing.

---

## State (Ch2)
- Per day: `keptBy`, `keptAt`, `pooledWith[]`. Per evidence pin: `name` (null until named), `excluded` (leave-out).
- Kept ≠ closed: keep does not lock the day; late material appends.
- Rafa's contributions: `voiceNotes[]`, `stamps[]` referenced by day, surfaced only inside a parent lens's DayPage.
- Aurelia: `dayPicId` (the chosen day's picture) drives chip/resurface/book.
- **Surprise-safe:** pins for unrevealed-surprise photos never appear to non-conspirators (upstream filter);
  never render a count that would leak one.
