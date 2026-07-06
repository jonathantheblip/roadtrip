// album/chapter1.jsx — "The album that organizes itself." Rationale + live
// prototype + forks + per-lens deltas + copy deck. Reads copy from data.jsx so
// the deck and the UI are the same strings.

function LensSwitch({ lens, setLens }) {
  return (
    <div style={{ display: 'inline-flex', gap: 3, background: DOC.panel2, border: `1px solid ${DOC.line}`, borderRadius: 999, padding: 4 }}>
      {TRAVELER_LIST.map(id => {
        const on = id === lens; const t = TRAVELERS[id];
        return (
          <button key={id} className="lens-seg" onClick={() => setLens(id)} style={{ border: 'none', cursor: 'pointer', borderRadius: 999, padding: '7px 14px', background: on ? t.dot : 'transparent', color: on ? '#fff' : DOC.muted, display: 'flex', alignItems: 'center', gap: 7, fontFamily: FONTS.inter, fontSize: 13, fontWeight: 600 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: on ? '#fff' : t.dot }} />{t.name}
          </button>
        );
      })}
    </div>
  );
}

function StateCard({ lens, which }) {
  const c = TRAVELERS[lens].pal;
  return (
    <div style={{ width: 234, borderRadius: 22, overflow: 'hidden', background: c.bg, border: `1px solid ${DOC.line}`, boxShadow: '0 10px 30px rgba(0,0,0,0.10)' }}>
      <div style={{ padding: '10px 14px 4px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: `1px solid ${c.line}` }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: TRAVELERS[lens].dot }} />
        <span style={{ fontFamily: FONTS.mono, fontSize: 8.5, letterSpacing: 1, color: c.faint, textTransform: 'uppercase' }}>{TRAVELERS[lens].name}</span>
      </div>
      <div style={{ minHeight: 176, display: 'flex', alignItems: 'center' }}><AEmpty which={which} lens={lens} c={c} /></div>
    </div>
  );
}

// ── the copy deck ────────────────────────────────────────────────
function CopyDeck() {
  const cols = TRAVELER_LIST;
  const P = PICK_COPY;
  const rows = [
    { grp: 'Machine-pick labels — honest, name what was judged' },
    { label: 'Best, on-device · the default cut', cells: cols.map(l => l === 'rafa' ? P.rafa.stripTitle : P[l][LENS_CFG[l].bestDefault].onDevice) },
    { label: 'Best, light & composition · opt-in', cells: cols.map(l => l === 'rafa' ? '— no ranking, ever —' : P[l][LENS_CFG[l].bestDefault].vision) },
    { label: 'The cut is named', cells: cols.map(l => l === 'rafa' ? 'your day, the fun parts' : P[l].sub[LENS_CFG[l].bestDefault]) },
    { label: 'Override a pick', cells: cols.map(l => l === 'rafa' ? '—' : P[l].override.remove + ' / ' + P[l].override.undo) },
    { grp: 'Empty & partial states — alive, inviting, never a task list' },
    { label: 'No faces on this device', cells: cols.map(l => EMPTY_COPY.noFaces[l]) },
    { label: 'Still finding the clearest', cells: cols.map(l => EMPTY_COPY.noScores[l]) },
    { label: 'No videos this trip', cells: cols.map(l => EMPTY_COPY.noVideos[l]) },
    { label: 'A filter matches nothing', cells: cols.map(l => EMPTY_COPY.zeroMatch[l]) },
    { label: 'New photos arriving', cells: cols.map(l => EMPTY_COPY.arriving[l]) },
    { grp: 'The consent seams' },
    { label: 'Turn on light & composition', cells: cols.map(l => l === 'rafa' ? '—' : SEAM_COPY.vision[l]) },
    { label: 'Teach another device faces', cells: cols.map(l => l === 'rafa' ? '—' : SEAM_COPY.teachDevice[l]) },
  ];
  return (
    <div style={{ overflowX: 'auto', borderRadius: 14 }}><div style={{ minWidth: 700, border: `1px solid ${DOC.line}`, borderRadius: 14, overflow: 'hidden', background: DOC.panel2 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '150px repeat(4, 1fr)', background: DOC.panel, borderBottom: `1px solid ${DOC.lineBold}` }}>
        <div style={{ padding: '11px 14px', fontFamily: FONTS.mono, fontSize: 9, letterSpacing: 1, color: DOC.faint, textTransform: 'uppercase' }}>Situation</div>
        {cols.map(id => (
          <div key={id} style={{ padding: '11px 12px', display: 'flex', alignItems: 'center', gap: 6, borderLeft: `1px solid ${DOC.line}` }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: TRAVELERS[id].dot }} />
            <span style={{ fontFamily: FONTS.inter, fontSize: 12, fontWeight: 600 }}>{TRAVELERS[id].name}</span>
            <span style={{ fontFamily: FONTS.mono, fontSize: 8, color: DOC.faint, marginLeft: 'auto' }}>{id === 'jonathan' ? 'drier' : id === 'aurelia' ? 'lowercase' : id === 'rafa' ? 'warmth' : 'warm'}</span>
          </div>
        ))}
      </div>
      {rows.map((row, i) => row.grp ? (
        <div key={i} style={{ padding: '13px 14px 7px', fontFamily: FONTS.mono, fontSize: 9.5, letterSpacing: 1, color: DOC.accent, textTransform: 'uppercase', background: DOC.panel, borderTop: i ? `1px solid ${DOC.line}` : 'none' }}>{row.grp}</div>
      ) : (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '150px repeat(4, 1fr)', borderTop: `1px solid ${DOC.line}` }}>
          <div style={{ padding: '12px 14px', fontFamily: FONTS.inter, fontSize: 12, fontWeight: 600, color: DOC.ink }}>{row.label}</div>
          {row.cells.map((cell, j) => (
            <div key={j} style={{ padding: '12px 12px', borderLeft: `1px solid ${DOC.line}`, fontFamily: FONTS.inter, fontSize: 11.5, lineHeight: 1.5, color: cell.startsWith('—') ? DOC.faint : DOC.muted, fontStyle: cols[j] === 'aurelia' ? 'italic' : 'normal', textWrap: 'pretty' }}>{cell}</div>
          ))}
        </div>
      ))}
    </div></div>
  );
}

function Chapter1() {
  const [lens, setLens] = React.useState('helen');
  return (
    <div style={{ paddingBottom: 90 }}>
      {/* ─ masthead ─ */}
      <Section id="intro" kicker="Chapter 01 · the ask">
        <div style={{ maxWidth: 760, padding: '10px 0 0' }}>
          <h1 style={{ fontFamily: FONTS.fraunces, fontSize: 52, fontWeight: 600, letterSpacing: -1.2, lineHeight: 1.02, margin: 0 }}>The album that<br />organizes itself</h1>
          <Lede>Navigation, filtering, tags and “best photos” for a private family album — designed so every capability is either <Strong>discoverable at the moment of need, or completely invisible</Strong>. No janitor surfaces. No control panel. The four skins are the brand; this surface is most Helen’s.</Lede>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, maxWidth: 680, margin: '4px 0 8px' }}>
          {[['Find by event & place', 'People recall what happened and where — not the date. A Find sheet leads with named moments and places; day-chips just scrub.'], ['Filters thin in place', 'The calm album keeps its shape — sections stay, the grid just gets quieter.'], ['Structure is the tags', 'Place · day · face · kind · caption. No tagging chore is ever added.']].map(([h, b]) => (
            <div key={h} style={{ background: DOC.panel, border: `1px solid ${DOC.line}`, borderRadius: 12, padding: '14px 15px' }}>
              <div style={{ fontFamily: FONTS.fraunces, fontSize: 15.5, fontWeight: 600, letterSpacing: -0.2, marginBottom: 6 }}>{h}</div>
              <div style={{ fontFamily: FONTS.inter, fontSize: 12.5, color: DOC.muted, lineHeight: 1.5 }}>{b}</div>
            </div>
          ))}
        </div>
        {/* live hero */}
        <div style={{ marginTop: 30, background: DOC.panel, borderRadius: 24, border: `1px solid ${DOC.line}`, padding: '26px 24px 30px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
            <span style={{ fontFamily: FONTS.mono, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: DOC.accent }}>Live — tap a day, a filter, a photo</span>
            <LensSwitch lens={lens} setLens={setLens} />
          </div>
          <LiveDevice key={lens} lens={lens} scale={0.94}><AlbumApp lens={lens} /></LiveDevice>
          <div style={{ fontFamily: FONTS.inter, fontSize: 12.5, color: DOC.muted, marginTop: 18, maxWidth: 420, textAlign: 'center', lineHeight: 1.5 }}>
            The same album, re-skinned. Helen’s is the reference build; switch lenses to feel Jonathan’s Record, Aurelia’s roll, and Rafa’s judgment-free warmth.
          </div>
        </div>
      </Section>

      {/* ─ Q1 / Q2 nav & headers ─ */}
      <Section id="nav" kicker="Questions 1–2" title="Navigation & the stuck header" sub="People reach for the event and the place first; the day is only a scrub.">
        <QA n={1} q="One nav idiom or two — and how does it stack under the fixed bar?" decision="People recall a photo by what happened and where — the event and the place — far more than by which calendar day. So the finder leads with those: a standing ‘Find’ sheet lists named moments and places first, days last, and de-duplicates a repeated place (one Airbnb, not one row per night). Day-chips remain only as a lightweight always-visible scrub for quick day-to-day movement, not the main way in. Chrome is fixed (bar + chips + filter row ≈ the 60–76px budget); section headers are the only sticky layer, so there’s no nested-sticky trap.">
          <P>“Take me to the monster trucks,” or “the morning at Grand Central” — event and place is how anyone actually reaches for a shot; “day two” almost never is. The Find sheet answers that directly (Rafa reaches it by voice — he taps the mic and says it). The chips are there for the occasional “just show me Saturday.”</P>
        </QA>
        <QA n={2} q="What does a header say when it pins?" decision="Unpinned: mono eyebrow (day · time, or “AT · FRI MAY 1” for a place) + big serif title. Pinned: it condenses to one line — time · title · count. Face dots stay off (noise) until a ‘With’ filter is on, then the filtered person’s dot rides the header. The place section that leads each day gets a distinct treatment: an accent tick, the italic ‘the day’s home base’, no clock — it’s the ambient pool, not a timed event.">
          <P>Scroll the hero: watch a section header shrink to a single line as it reaches the top, and the day chip it belongs to light up. The “At the Airbnb” lead reads visibly softer than “9:00 AM · Grand Brasserie”.</P>
        </QA>
        <div style={{ fontFamily: FONTS.mono, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: DOC.accent, margin: '22px 0 2px' }}>Fork — the nav idiom</div>
        <Exhibit>
          <Stage label="A · chips only" caption="Fast, but no way to reach a moment or place by name." tone="off"><LiveDevice lens="helen" scale={0.58}><AlbumApp lens="helen" navVariant="chipsOnly" /></LiveDevice></Stage>
          <Stage label="B · find only" caption="Event/place-first, but a sheet for every ‘show me Saturday’ is friction." tone="off"><LiveDevice lens="helen" scale={0.58}><AlbumApp lens="helen" navVariant="indexOnly" /></LiveDevice></Stage>
          <Stage label="C · find + chips" caption="Find leads with the events & places people recall; chips just scrub days." rec><LiveDevice lens="helen" scale={0.58}><AlbumApp lens="helen" navVariant="hybrid" /></LiveDevice></Stage>
        </Exhibit>
      </Section>

      {/* ─ Q3 / Q4 filters & tags ─ */}
      <Section id="filters" kicker="Questions 3–4" title="Filters & tags" sub="A filter should quiet the album, not replace it. And the album already knows its own tags.">
        <QA n={3} q="Filters: view or mode?" decision="A mode on the same surface. Photos/Videos, ‘With ⟨person⟩’, and Best earn top-level presence (day & place belong to the nav, so they’re not repeated here). An active filter thins the grid in place: headers stay, emptied sections show a quiet ‘— nothing here —’, day chips with no match dim rather than vanish, and the count line rewrites (‘12 with Rafa · 3 stops’). Nothing jumps; the spine holds.">
          <P>The alternative — a dedicated results grid — is faster to build but throws away the reader’s place in the story. The whole point of the album is the day-by-day spine; a filter borrows it, never breaks it.</P>
        </QA>
        <QA n={4} q="Do human tags exist at all?" decision="No freeform tags. Structure IS the tags: place · day · face · kind · caption-search cover every ‘tag as filter / search / label’ the brief names, with nothing to maintain. Aurelia’s 7-word mood vocabulary stays hers — a private lens on her own roll, never graduated to a family concept. Her authorship is a feature, not a filter imposed on everyone.">
          <P>Adding a tag vocabulary would be the janitor surface the product refuses. The one honest exception is Aurelia’s moods, which already ship on her roll and remain scoped to her.</P>
        </QA>
        <div style={{ fontFamily: FONTS.mono, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: DOC.accent, margin: '22px 0 2px' }}>Fork — an active filter (“With Rafa”)</div>
        <Exhibit>
          <Stage label="A · thin in place" caption="Sections & headers stay; empty ones ghost; the spine never moves." rec><LiveDevice lens="helen" scale={0.6}><AlbumApp lens="helen" filterMode="inplace" demo={{ withP: 'rafa' }} /></LiveDevice></Stage>
          <Stage label="B · results surface" caption="One flat grid. Faster, but the story’s structure is gone." tone="off"><LiveDevice lens="helen" scale={0.6}><AlbumApp lens="helen" filterMode="results" demo={{ withP: 'rafa' }} /></LiveDevice></Stage>
        </Exhibit>
      </Section>

      {/* ─ Q5 / Q6 best-of ─ */}
      <Section id="best" kicker="Questions 5–6" title="Best-of — honest, overridable, per-lens" sub="Name what the machine judged. Let the family outrank it. Default the cut to the person.">
        <QA n={5} q="Best-of honesty, override, and where it lives." decision="Best is a toggle that reveals a shelf at the top of the album — the album stays reachable below it (not a filter that hides everything, not a heavyweight reel). The label names exactly what was judged: ‘auto-picked · clearest, closest shots’ on-device; ‘best light & composition’ only if the vision tier is on. Every pick carries a quiet ✕ (‘not this one’, 6-second undo) and the shelf ends with ‘add one you love’ — taste stays communal and honest.">
          <P>Toggle <Strong>Best</Strong> on the hero (Helen): the shelf appears with its honest one-liner, a per-cut switch, and per-tile overrides. The rest of the trip sits calmly beneath it.</P>
        </QA>
        <QA n={6} q="Per-lens best-of split." decision="One control, per-lens defaults. Helen & Aurelia default to ‘featuring you’ (face + quality); Jonathan defaults to ‘the whole trip’, landscapes included. Aurelia’s special cut is ‘your shots, ranked’ — her eye, her authorship — set as her default. Rafa gets no ranking at all: a warm ‘Look what you did!’ strip, video-forward, never scored, never called ‘best’.">
          <div style={{ fontFamily: FONTS.mono, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: DOC.accent, margin: '18px 0 2px' }}>Fork — the best-of surface</div>
          <Exhibit>
            <Stage label="A · shelf" caption="Foregrounds the picks; album stays one scroll away." rec><LiveDevice lens="helen" scale={0.58}><AlbumApp lens="helen" bestSurface="shelf" demo={{ bestOn: true }} /></LiveDevice></Stage>
            <Stage label="B · filter" caption="Best-only grid. Clean, but the album disappears." tone="off"><LiveDevice lens="helen" scale={0.58}><AlbumApp lens="helen" bestSurface="filter" demo={{ bestOn: true }} /></LiveDevice></Stage>
            <Stage label="C · reel" caption="Cinematic, but heavy for an everyday glance." tone="off"><LiveDevice lens="helen" scale={0.58}><AlbumApp lens="helen" bestSurface="reel" demo={{ bestOn: true }} /></LiveDevice></Stage>
          </Exhibit>
        </QA>
      </Section>

      {/* ─ Q7 smarts & consent ─ */}
      <Section id="smarts" kicker="Question 7" title="Where the smarts run — and the consent seam" sub="On-device is the floor. The vision tier is an invitation, never an assumption.">
        <QA n={7} q="On-device only, or the Claude-vision tier — and how honest is the seam?" decision="On-device (face + clarity/exposure) is the baseline and needs no consent. Light & composition is an opt-in tier gated on Jonathan’s explicit go: it surfaces once, at the moment of need — the ‘Sharper picks?’ line under the Best shelf — states plainly that photos go to Claude to be scored then come back, and stays off until turned on. The label degrades gracefully: no vision, no composition claims, no gap. The face index is per-device by promise, so the design embraces the seam — ‘this iPad knows your family; teach your phone too’ — as an invitation, never a nag.">
          <P>Open Best on Helen and tap <Strong>Sharper picks?</Strong> — the consent card explains the new privacy flow in one breath. Accept it and the shelf’s label updates live from “clearest, closest” to “best light &amp; composition.” That live swap is the whole degrade-gracefully story in one gesture.</P>
        </QA>
      </Section>

      {/* ─ Q8 growth & empty ─ */}
      <Section id="states" kicker="Question 8" title="Growth & empty states" sub="Mid-trip, everything is partially scanned and always arriving. Empty must feel alive.">
        <QA n={8} q="Continuous arrival, partial scans, per-filter empties." decision="Arrival is ambient, never a badge: a soft ‘a few new since this morning’ on the count line. Partial scans say so warmly (‘still looking for the clearest…’). Every empty state is an invitation or an honest full-stop, never a task: no-faces-here becomes ‘teach the app — a couple each is plenty, nothing leaves this iPad’; zero-videos is a calm ‘all stills this trip’; a dead filter offers ‘try fewer filters.’ Each in the lens’s own voice.">
          <div style={{ fontFamily: FONTS.mono, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: DOC.accent, margin: '18px 0 2px' }}>The states, in three voices</div>
          <Exhibit>
            <StateCard lens="helen" which="noFaces" />
            <StateCard lens="jonathan" which="noScores" />
            <StateCard lens="aurelia" which="noVideos" />
          </Exhibit>
        </QA>
      </Section>

      {/* ─ per-lens deltas ─ */}
      <Section id="lenses" kicker="Per-lens truth" title="The other three lenses" sub="Same spine, four minds. Here’s only what changes.">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 30, justifyContent: 'center', background: DOC.panel, borderRadius: 22, border: `1px solid ${DOC.line}`, padding: '34px 26px' }}>
          {[
            { lens: 'jonathan', props: { demo: {} }, title: 'Jonathan — the Record', body: 'His filters STACK (person ∧ day ∧ place) via the Record’s tab model — the one lens that is a control surface by design. Best defaults to ‘the whole trip’, landscapes included; the copy is drier (‘sharpest frames, people or not’). No ‘show me, me’ — he filters instead.' },
            { lens: 'aurelia', props: { demo: { bestOn: true } }, title: 'Aurelia — the roll', body: 'Lowercase throughout. Her Best defaults to ‘your shots, ranked’ — the machine ordering her own eye, not judging her. Mood chips stay her private lens. Her keep reads ‘kept by aurelia’ in the look-back.' },
            { lens: 'rafa', props: {}, title: 'Rafa — no rankings, ever', body: 'No filters, no scores, no chips. A warm ‘Look what you did!’ strip leads, video-forward, then big chunky two-up tiles. Machinery folded entirely into softness — his cut of anything is a judgment-free ‘look at these!’.' },
          ].map(d => (
            <div key={d.lens} style={{ width: 250 }}>
              <LiveDevice lens={d.lens} scale={0.64}><AlbumApp lens={d.lens} {...d.props} /></LiveDevice>
              <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: TRAVELERS[d.lens].dot }} />
                <span style={{ fontFamily: FONTS.fraunces, fontSize: 16, fontWeight: 600 }}>{d.title}</span>
              </div>
              <div style={{ fontFamily: FONTS.inter, fontSize: 12.5, color: DOC.muted, lineHeight: 1.55, marginTop: 7, textWrap: 'pretty' }}>{d.body}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* ─ copy deck ─ */}
      <Section id="copy" kicker="Lift-ready" title="Copy deck" sub="Every machine-pick label and empty state, in four voices. The UI above reads these same strings.">
        <CopyDeck />
      </Section>
    </div>
  );
}

Object.assign(window, { Chapter1 });
