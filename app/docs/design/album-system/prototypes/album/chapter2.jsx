// album/chapter2.jsx — "Finish the story." Rationale for the 7 questions +
// the live finish-a-past-day flow + forks + per-voice copy deck. Rafa excluded.

function Ch2LensSwitch({ lens, setLens }) {
  return (
    <div style={{ display: 'inline-flex', gap: 3, background: DOC.panel2, border: `1px solid ${DOC.line}`, borderRadius: 999, padding: 4 }}>
      {['helen', 'jonathan', 'aurelia'].map(id => {
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

// the rejected alternative for Q2 — a cramped stacked-form sheet
function FinStackedMock({ lens }) {
  const c = TRAVELERS[lens].pal; const r = TRAVELERS[lens].radius;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', color: c.ink, padding: '10px 16px' }}>
      <div style={{ fontFamily: FONTS.fraunces, fontSize: 18, fontWeight: 600 }}>Name the moments</div>
      <div style={{ fontFamily: FONTS.mono, fontSize: 9, color: c.faint, marginTop: 3, marginBottom: 14 }}>SUN AUG 11 · 2 PLACES</div>
      {[['Race Point Beach', '11–1 · 12 photos'], ['the harbor — lobster shack', '6–7 PM · 8 photos']].map(([p, m]) => (
        <div key={p} style={{ borderBottom: `1px solid ${c.line}`, padding: '12px 0' }}>
          <div style={{ fontFamily: FONTS.mono, fontSize: 9.5, color: c.muted }}>{p} · {m}</div>
          <div style={{ marginTop: 8, height: 34, borderRadius: r - 8, border: `1px solid ${c.lineBold}`, background: c.bg2, display: 'flex', alignItems: 'center', padding: '0 11px', fontFamily: FONTS.inter, fontSize: 12, color: c.faint }}>Type a name…</div>
        </div>
      ))}
      <div style={{ marginTop: 'auto', height: 44, borderRadius: 999, background: c.bg2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONTS.inter, fontSize: 13, color: c.faint }}>Keep</div>
    </div>
  );
}

function Ch2CopyDeck() {
  const cols = ['jonathan', 'helen', 'aurelia'];
  const Q = CH2_COPY;
  const rows = [
    { grp: 'The doors — invite, never nag' },
    { label: 'The door on a finished trip', cells: cols.map(l => Q.door[l]) },
    { label: 'Permission to ignore', cells: cols.map(l => Q.doorSub[l]) },
    { grp: 'The day view' },
    { label: 'Name a moment', cells: cols.map(l => Q.pinHint[l]) },
    { label: 'Leave one out', cells: cols.map(l => Q.leaveOut[l]) },
    { label: 'Rafa’s note, surfaced', cells: cols.map(l => Q.rafaNote[l]) },
    { grp: 'Quiet & empty days' },
    { label: 'A quiet day', cells: cols.map(l => Q.quiet[l]) },
    { label: 'Pool the quiet stretch', cells: cols.map(l => Q.pooled[l]) },
    { label: 'No located photos', cells: cols.map(l => Q.noEvidence[l]) },
    { grp: 'The keep' },
    { label: 'Kept', cells: cols.map(l => Q.kept[l]) },
    { label: 'Still open', cells: cols.map(l => Q.keptSub[l]) },
    { label: 'Into the book?', cells: cols.map(l => Q.book[l]) },
    { grp: 'The archive letter' },
    { label: 'The backfill letter', cells: cols.map(l => Q.backfill[l]) },
  ];
  return (
    <div style={{ overflowX: 'auto', borderRadius: 14 }}><div style={{ minWidth: 640, border: `1px solid ${DOC.line}`, borderRadius: 14, overflow: 'hidden', background: DOC.panel2 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '150px repeat(3, 1fr)', background: DOC.panel, borderBottom: `1px solid ${DOC.lineBold}` }}>
        <div style={{ padding: '11px 14px', fontFamily: FONTS.mono, fontSize: 9, letterSpacing: 1, color: DOC.faint, textTransform: 'uppercase' }}>Situation</div>
        {cols.map(id => (
          <div key={id} style={{ padding: '11px 12px', display: 'flex', alignItems: 'center', gap: 6, borderLeft: `1px solid ${DOC.line}` }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: TRAVELERS[id].dot }} />
            <span style={{ fontFamily: FONTS.inter, fontSize: 12, fontWeight: 600 }}>{TRAVELERS[id].name}</span>
            <span style={{ fontFamily: FONTS.mono, fontSize: 8, color: DOC.faint, marginLeft: 'auto' }}>{id === 'jonathan' ? 'drier' : id === 'aurelia' ? 'lowercase' : 'warm'}</span>
          </div>
        ))}
      </div>
      {rows.map((row, i) => row.grp ? (
        <div key={i} style={{ padding: '13px 14px 7px', fontFamily: FONTS.mono, fontSize: 9.5, letterSpacing: 1, color: DOC.accent, textTransform: 'uppercase', background: DOC.panel, borderTop: i ? `1px solid ${DOC.line}` : 'none' }}>{row.grp}</div>
      ) : (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '150px repeat(3, 1fr)', borderTop: `1px solid ${DOC.line}` }}>
          <div style={{ padding: '12px 14px', fontFamily: FONTS.inter, fontSize: 12, fontWeight: 600, color: DOC.ink }}>{row.label}</div>
          {row.cells.map((cell, j) => (
            <div key={j} style={{ padding: '12px 12px', borderLeft: `1px solid ${DOC.line}`, fontFamily: FONTS.inter, fontSize: 11.5, lineHeight: 1.5, color: DOC.muted, fontStyle: cols[j] === 'aurelia' ? 'italic' : 'normal', textWrap: 'pretty' }}>{cell}</div>
          ))}
        </div>
      ))}
      <div style={{ padding: '12px 14px', fontFamily: FONTS.inter, fontSize: 11.5, color: DOC.faint, borderTop: `1px solid ${DOC.line}`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: TRAVELERS.rafa.dot }} /> Rafa — this surface never appears on his lens. His stamps & voice notes surface <em>inside</em> a parent’s flow (see the day view), and his marks show up later in the finished story.
      </div>
    </div></div>
  );
}

function Chapter2() {
  const [lens, setLens] = React.useState('helen');
  return (
    <div style={{ paddingBottom: 90 }}>
      <Section id="ch2intro" kicker="Chapter 02 · the ask">
        <div style={{ maxWidth: 760, paddingTop: 8 }}>
          <h1 style={{ fontFamily: FONTS.fraunces, fontSize: 50, fontWeight: 600, letterSpacing: -1.1, lineHeight: 1.03, margin: 0 }}>Finish the story</h1>
          <Lede>Documenting a day — or a whole past trip — in the moment, weeks later, or years later, so <Strong>the order never matters</Strong> (photos first, names later; names first, photos after) and it always feels like a ten-minute couch ritual with the family shoebox, never homework.</Lede>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, maxWidth: 680, margin: '4px 0 8px' }}>
          {[['Doors, never knocks', 'The app never initiates about the past. Every entry waits where you already reminisce — “they’re safe here.”'], ['Led by the material', 'Full-bleed photos; evidence pins are captions awaiting a word. Never led by the blanks.'], ['Keeping ≠ closing', 'A kept day counts, but stays open — late photos, names and stamps still slide in.']].map(([h, b]) => (
            <div key={h} style={{ background: DOC.panel, border: `1px solid ${DOC.line}`, borderRadius: 12, padding: '14px 15px' }}>
              <div style={{ fontFamily: FONTS.fraunces, fontSize: 15.5, fontWeight: 600, letterSpacing: -0.2, marginBottom: 6 }}>{h}</div>
              <div style={{ fontFamily: FONTS.inter, fontSize: 12.5, color: DOC.muted, lineHeight: 1.5 }}>{b}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 30, background: DOC.panel, borderRadius: 24, border: `1px solid ${DOC.line}`, padding: '26px 24px 30px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
            <span style={{ fontFamily: FONTS.mono, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: DOC.accent }}>Live — tuck in a loose day, name a moment, keep it</span>
            <Ch2LensSwitch lens={lens} setLens={setLens} />
          </div>
          <LiveDevice key={lens} lens={lens} scale={0.94}><FinishApp lens={lens} /></LiveDevice>
          <div style={{ fontFamily: FONTS.inter, fontSize: 12.5, color: DOC.muted, marginTop: 18, maxWidth: 440, textAlign: 'center', lineHeight: 1.5 }}>
            Tap <em>Finish the story</em> → a loose day opens as an album page → name a moment (or leave it) → keep. Rafa is excluded by rule; his voice note surfaces <em>inside</em> the day.
          </div>
        </div>
      </Section>

      <Section id="door" kicker="Question 1" title="The door on a finished trip" sub="Where the pass lives once a trip has become a keepsake.">
        <QA n={1} q="What does the keepsake home offer — and where does a whole-trip pass live vs a single day?" decision="Both a quiet action row and the softened day grid, together. The keepsake home keeps a single low card — “two days are still loose — want to tuck them in?” — that opens the loosest day directly (a single-day pass). Below it the day grid returns in an after-trip form: gold dots for kept days, a dashed ring for a loose day, a soft mark for a quiet one — tap any to open that day. The whole-trip pass lives one level down, on the archive (Q7), because a still-warm trip only has a day or two loose; a cold one is where “go through all of it” belongs. The Looking-back card and the reel’s day sheet stay as the ambient, no-pressure entrances.">
          <P>The card names a number only as reassurance, never as a score — “two days,” not “2 of 6.” It opens the day, it doesn’t open a backlog. And it never interrupts the current trip’s home.</P>
        </QA>
      </Section>

      <Section id="dayview" kicker="Question 2" title="The day view itself" sub="Led by the photographs, not by the empty fields.">
        <QA n={2} q="Album-page, or the stacked-form sheet? And where do Rafa’s notes and “leave this out” live?" decision="An album page. Each evidence pin is a full-bleed band of its own photos with the machine’s guess sitting under it as a dashed, mono caption — “Race Point Beach · 11–1 · 12 photos” — waiting for a word. Tap it, type a name (or don’t). ‘Leave this out’ is a quiet link on each pin, findable but never procedural. Rafa’s pending voice note rides at the top of the day in his identity color — ‘Rafa told about this day — have a listen’ — so his contribution is felt without ever putting him in front of settle machinery. One keep at the bottom.">
          <div style={{ fontFamily: FONTS.mono, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: DOC.accent, margin: '18px 0 2px' }}>Fork — the day view</div>
          <Exhibit>
            <Stage label="A · album page" caption="Photos big; pins are captions awaiting a word. Named or not, it’s already a page." rec><LiveDevice lens="helen" scale={0.6}><FinishApp lens="helen" start="day" /></LiveDevice></Stage>
            <Stage label="B · stacked form" caption="Today’s sheet. Correct, but it reads as a form to complete — homework." tone="off"><LiveDevice lens="helen" scale={0.6}><FinStackedMock lens="helen" /></LiveDevice></Stage>
          </Exhibit>
        </QA>
      </Section>

      <Section id="pooling" kicker="Question 3" title="Pooling in the past tense" sub="Quiet days keep together, in one gesture.">
        <QA n={3} q="Does a past-trip pass pool quiet days, and what does the combined keep look like?" decision="Yes — the same live rule, past tense. Consecutive low-evidence days offer to be kept as one: ‘the middle of the week was quiet — keep those two together?’ The pooled view is a single soft page (‘we stayed put, gloriously’) with one keep that signs off the whole stretch, so a restful three days never becomes three little chores.">
          <Exhibit>
            <Stage label="A quiet day, poolable" caption="One keep signs off the whole quiet stretch."><LiveDevice lens="helen" scale={0.62}><FinishAppAt lens="helen" n={3} /></LiveDevice></Stage>
          </Exhibit>
        </QA>
      </Section>

      <Section id="noevidence" kicker="Question 4" title="No-evidence days" sub="A day with no located photos still gets a graceful, restful offer.">
        <QA n={4} q="What does a day with zero located photos offer? And where does the backfill letter land?" decision="It offers rest first, words second — never a blank to fill. ‘No photos found their way here. This day can just rest — or tell it in a few words.’ Two soft choices: let it rest, or tell it (type or voice). The GPS backfill’s one-time ‘letter’ per trip lands on the keepsake home as a single warm line — ‘214 photos found their places — have a look’ — a gift, not a task, and it links straight into the newly-placed days.">
          <Exhibit>
            <Stage label="No located photos" caption="Rest, or a few words. Never a demand."><LiveDevice lens="jonathan" scale={0.62}><FinishAppAt lens="jonathan" n={5} /></LiveDevice></Stage>
          </Exhibit>
        </QA>
      </Section>

      <Section id="keep" kicker="Question 5" title="The keep moment" sub="Gold. And the story that writes itself.">
        <QA n={5} q="What changes when a past day is kept — and how does its new story surface?" decision="The day turns gold — a filled dot on the grid, a ‘kept by Helen’ line — and, per the one-keep rule, the same gesture offers the page, not a second chore: ‘keep its page in the book?’ The Weave regenerates for that day from what was just named; ‘in the book’ collects it toward the keepsake book, ‘not now’ leaves it kept and open. Nothing is closed — late photos still land, and re-opening to name one more moment feels like adding a caption, not redoing paperwork.">
          <Exhibit>
            <Stage label="Kept — gold" caption="‘Tonight’s story writes itself from this.’ One gesture also offers the book page."><LiveDevice lens="helen" scale={0.62}><FinKeptDemo lens="helen" /></LiveDevice></Stage>
          </Exhibit>
        </QA>
      </Section>

      <Section id="aurelia" kicker="Question 6" title="Aurelia’s authorship" sub="She picks the day’s picture. It’s a feature, not a filter.">
        <QA n={6} q="Where does ‘pick the day’s picture’ live, and how does her keep read?" decision="Inside the day view, as her one privileged gesture: a light-touch ‘pick the day’s picture’ over the day’s frames — one tap sets the shot that drives the day chip, the Looking-back card and the book page. Her keep reads ‘kept by aurelia’ in every look-back, lowercase, in her voice. It’s authorship surfaced, never a chore assigned.">
          <Exhibit>
            <Stage label="Aurelia · pick the day’s picture" caption="One tap. It drives the chip, the resurface card, the book page."><LiveDevice lens="aurelia" scale={0.62}><FinAureliaPick /></LiveDevice></Stage>
          </Exhibit>
        </QA>
      </Section>

      <Section id="archive" kicker="Question 7" title="The archive at scale" sub="Two years old, 300 photos, nothing named — and still calm.">
        <QA n={7} q="What’s the honest shape of ‘finish this whole trip’ that never becomes a checklist?" decision="Material-led, a day at a time, strongest first — framed as wandering, not clearing. The archive door reads ‘Disney is all here, just unnamed — want to wander back through it?’ Then the biggest days surface as invitations (‘Day 3 · the castle · 31 photos’), each opening the same album-page settle. No counter, no progress bar, no ‘0 of 6’; ‘stop whenever’ sits at the bottom. It’s a shoebox to browse, not a queue to drain.">
          <Exhibit>
            <Stage label="Archive · a whole cold trip" caption="Strongest days first, as invitations. ‘Stop whenever.’"><LiveDevice lens="helen" scale={0.62}><FinArchiveDemo lens="helen" /></LiveDevice></Stage>
          </Exhibit>
        </QA>
      </Section>

      <Section id="ch2copy" kicker="Lift-ready" title="Copy deck" sub="Doors, the day view, the pooled keep, the no-evidence day, the keep, and every permission-to-ignore line — three voices. Rafa excluded by rule.">
        <Ch2CopyDeck />
      </Section>
    </div>
  );
}

// small wrappers to open FinishApp at a specific state for the exhibits
function FinishAppAt({ lens, n }) {
  const t = TRAVELERS[lens]; const c = t.pal; const r = t.radius;
  const [view, setView] = React.useState({ v: 'day', n });
  const day = view.n != null ? cabinDay(view.n) : null;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', color: c.ink }}>
      {view.v === 'day' && <FinDaySettle lens={lens} c={c} r={r} day={day} onBack={() => setView({ v: 'day', n })} onKeep={() => setView({ v: 'kept' })} />}
      {view.v === 'kept' && <FinKept lens={lens} c={c} r={r} onBook={() => setView({ v: 'day', n })} onDone={() => setView({ v: 'day', n })} />}
    </div>
  );
}
function FinKeptDemo({ lens }) {
  const t = TRAVELERS[lens]; return <FinKept lens={lens} c={t.pal} r={t.radius} onBook={() => {}} onDone={() => {}} />;
}
function FinArchiveDemo({ lens }) {
  const t = TRAVELERS[lens]; return <FinArchive lens={lens} c={t.pal} r={t.radius} onBack={() => {}} />;
}

Object.assign(window, { Chapter2 });
