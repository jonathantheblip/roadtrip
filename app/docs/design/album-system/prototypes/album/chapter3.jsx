// album/chapter3.jsx — "Photo moves." Rationale for the 6 questions + the live
// moved-note / Move-to hand / suggestion / letter + a per-voice copy deck.
// Rafa excluded by rule.

function Ch3LensSwitch({ lens, setLens }) {
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

// Q3 exhibit: the picker open over a dimmed photo
function MoveSheetDemo({ lens }) {
  const t = TRAVELERS[lens]; const c = t.pal; const r = t.radius;
  return (
    <div style={{ height: '100%', position: 'relative', background: t.dark ? '#08080A' : '#171512' }}>
      <div style={{ padding: 22 }}><Photo ratio={3 / 4} tint={MOVED_PHOTO.tint} radius={8} grain /></div>
      <MoveSheet lens={lens} c={c} r={r} onClose={() => {}} onPick={() => {}} />
    </div>
  );
}

function Ch3CopyDeck() {
  const cols = ['jonathan', 'helen', 'aurelia']; const Q = CH3_COPY;
  const rz = (k) => cols.map(l => Q.reasons[k][l]);
  const rows = [
    { grp: 'The moved-note — every “because” names a human act' },
    { label: 'A moment was named', cells: rz('named') },
    { label: 'The plan changed', cells: rz('plan') },
    { label: 'Location resolved', cells: rz('gps') },
    { label: 'A nightly catch-up', cells: rz('catchup') },
    { label: 'Locked (hand-placed)', cells: cols.map(l => Q.locked[l].replace('{n}', 'Helen')) },
    { grp: 'The one-visit marks' },
    { label: 'Section line', cells: cols.map(l => Q.sectionLine[l]) },
    { grp: 'The suggestion' },
    { label: 'Machine unsure', cells: cols.map(l => Q.suggest[l]) },
    { label: 'Dismissed, at rest', cells: cols.map(l => Q.suggestRest[l]) },
    { label: 'New evidence arrives', cells: cols.map(l => Q.suggestNew[l]) },
    { grp: 'The letter' },
    { label: 'The backfill letter', cells: cols.map(l => Q.letter[l]) },
  ];
  return (
    <div style={{ overflowX: 'auto', borderRadius: 14 }}><div style={{ minWidth: 640, border: `1px solid ${DOC.line}`, borderRadius: 14, overflow: 'hidden', background: DOC.panel2 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '150px repeat(3, 1fr)', background: DOC.panel, borderBottom: `1px solid ${DOC.lineBold}` }}>
        <div style={{ padding: '11px 14px', fontFamily: FONTS.mono, fontSize: 9, letterSpacing: 1, color: DOC.faint, textTransform: 'uppercase' }}>Reason / state</div>
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
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: TRAVELERS.rafa.dot }} /> Rafa — no notes, no chips, no move controls. His photos are simply always in the right place.
      </div>
    </div></div>
  );
}

function Chapter3() {
  const [lens, setLens] = React.useState('helen');
  return (
    <div style={{ paddingBottom: 90 }}>
      <Section id="ch3intro" kicker="Chapter 03 · the ask">
        <div style={{ maxWidth: 760, paddingTop: 8 }}>
          <h1 style={{ fontFamily: FONTS.fraunces, fontSize: 50, fontWeight: 600, letterSpacing: -1.1, lineHeight: 1.03, margin: 0 }}>Photo moves</h1>
          <Lede>How the family <Strong>learns</Strong> a photo moved, and how a person <Strong>moves</Strong> one by hand. The whole thing rides one rule: every “moved because…” names a <Strong>human act</Strong> — “when you named the Brasserie,” “when Saturday’s breakfast shifted” — never machine-speak. And a hand-move locks the photo, because authorship outranks the machine.</Lede>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, maxWidth: 680, margin: '4px 0 8px' }}>
          {[['Visible, then quiet', 'A move shows once — a soft chip, a section line — then quiets. The album never fills with forever-marks.'], ['The story, one tap deep', 'The full “moved because…” lives in the lightbox, in family language, synced to every device.'], ['Authorship outranks the machine', 'A hand-move locks the photo. After that the machine may suggest, never move it.']].map(([h, b]) => (
            <div key={h} style={{ background: DOC.panel, border: `1px solid ${DOC.line}`, borderRadius: 12, padding: '14px 15px' }}>
              <div style={{ fontFamily: FONTS.fraunces, fontSize: 15.5, fontWeight: 600, letterSpacing: -0.2, marginBottom: 6 }}>{h}</div>
              <div style={{ fontFamily: FONTS.inter, fontSize: 12.5, color: DOC.muted, lineHeight: 1.5 }}>{b}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 30, background: DOC.panel, borderRadius: 24, border: `1px solid ${DOC.line}`, padding: '26px 24px 30px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
            <span style={{ fontFamily: FONTS.mono, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: DOC.accent }}>Live — read the story, then tap “Move to…” and place it</span>
            <Ch3LensSwitch lens={lens} setLens={setLens} />
          </div>
          <LiveDevice key={lens} lens={lens} scale={0.94}><MoveLightbox lens={lens} /></LiveDevice>
          <div style={{ fontFamily: FONTS.inter, fontSize: 12.5, color: DOC.muted, marginTop: 18, maxWidth: 440, textAlign: 'center', lineHeight: 1.5 }}>
            The italic line names why it moved. Tap <em>Move to…</em> → the day-sectioned picker → choose a place or a named moment → the line becomes “placed by you — stays put,” and the machine won’t touch it again.
          </div>
        </div>
      </Section>

      <Section id="movednote" kicker="Question 1" title="The chip lifecycle" sub="A move is news for exactly one visit — then the album is calm again.">
        <QA n={1} q="What quiets the chip, and what remains after?" decision="A freshly-moved photo carries a small ‘moved’ chip (bottom-left, distinct from the transient state chips at bottom-right) and its section gets one gentle line — ‘3 photos moved here when the day changed.’ Both quiet after the first album visit after the move — not after opening each photo; you shouldn’t have to. Afterwards nothing remains on the tile: no permanent badge, no dot. The story never disappears though — it lives in the lightbox, one tap deep, forever.">
          <Exhibit>
            <Stage label="One-visit marks" caption="A soft ‘moved’ chip + a section line, gone after this visit."><LiveDevice lens="helen" scale={0.62}><MovedSection lens="helen" /></LiveDevice></Stage>
          </Exhibit>
        </QA>
      </Section>

      <Section id="storyline" kicker="Question 2" title="The lightbox story line" sub="Name the human act. Firm up when a person places it.">
        <QA n={2} q="The exact copy shape for each reason — and the locked state." decision="Below the place line, one quiet italic sentence names the human act behind the move: ‘Moved here when you named breakfast at the Brasserie,’ ‘Moved here when Saturday’s breakfast shifted to 9am,’ ‘Settled here once its location came through.’ A nightly catch-up inherits the act it’s catching up on (‘Caught up here when the breakfast stop moved’). After a hand-move the line firms up with a small lock and gold ink — ‘Placed here by you — stays put’ — the one line in the album that isn’t quiet, because it’s authorship. (Full reason-code copy in the deck below.)">
          <P>Read it on the centerpiece above, in each voice: Helen’s warm, Jonathan’s clipped (‘Moved: you named the Brasserie stop.’), Aurelia’s lowercase.</P>
        </QA>
      </Section>

      <Section id="sheet" kicker="Question 3" title="The Move-to hand" sub="A day-sectioned picker of places and the family’s own named moments.">
        <QA n={3} q="Day-sectioned vs map vs recents — and how do moments read vs places?" decision="Day-sectioned, matching the album’s spine and the day-picker/SettleSheet precedent. Under each day, places read upright with a pin; named moments read in serif italic with a quote glyph and a small ‘a named moment’ tag — the family’s words, visibly theirs. The current home is marked ‘✓ here now’ and isn’t tappable. ‘Leave it unfiled’ always sits at the bottom as a real, honest destination. It lives beside ‘Edit date’ in the lightbox; any adult can move (fixing the album is communal), while delete stays author-only. Batch select is a later release.">
          <Exhibit>
            <Stage label="Move to… (open)" caption="Places (pin) and named moments (italic) read differently; ‘here now’ marked; unfiled always exists."><LiveDevice lens="helen" scale={0.62}><MoveSheetDemo lens="helen" /></LiveDevice></Stage>
          </Exhibit>
        </QA>
      </Section>

      <Section id="honesty" kicker="Question 4" title="Who moved what" sub="The same true story, on every device.">
        <QA n={4} q="A hand-move by Helen — what does Jonathan’s device show, and where?" decision="Exactly the same story, synced and attributed: on Jonathan’s device the photo’s lightbox reads ‘Placed by Helen. Locked.’ (his drier rendering of the same fact), and on his next album visit it may carry the one-visit ‘moved’ chip like any other move. Nothing is hidden — the album is communal — and because the labels are snapshotted at decision time, every device tells the identical story days later.">
          <Exhibit>
            <Stage label="On Jonathan’s device" caption="Helen’s hand-move, seen by Jonathan: attributed, locked, identical."><LiveDevice lens="jonathan" scale={0.62}><MoveLightbox lens="jonathan" moverName="Helen" startPlaced={{ label: 'Grand Central' }} /></LiveDevice></Stage>
          </Exhibit>
        </QA>
      </Section>

      <Section id="suggestion" kicker="Question 5" title="The suggestion" sub="When the machine is unsure, it asks once — for the whole family.">
        <QA n={5} q="Where does a dismissed suggestion rest, and how does it come back?" decision="It reuses the shipped two-step banner — ‘These 3 might belong at Rosa’s — Move / Not now’ — adults only. ‘Not now’ sticky-dismisses family-wide: it won’t reappear on any device until genuinely new evidence arrives. Dismissed, it rests as a single quiet ‘Loose ends’ line at the very bottom of the album — findable if sought, invisible otherwise. When new evidence does land, it returns named as new: ‘New: these 3 now look like Rosa’s — move them?’ — so a ‘no’ is respected, never nagged.">
          <Exhibit>
            <Stage label="Banner → rest" caption="Tap ‘Not now’: it quiets family-wide and settles into ‘Loose ends’."><LiveDevice lens="helen" scale={0.62}><SuggestDemo lens="helen" /></LiveDevice></Stage>
          </Exhibit>
        </QA>
      </Section>

      <Section id="letter" kicker="Question 6" title="The backfill letter" sub="A one-time archive pass arrives as one warm note, not a hundred chips.">
        <QA n={6} q="Where does the letter land, and where does ‘have a look’ go?" decision="On the trip’s Looking-back card (the keepsake home) as a single warm letter — an envelope, the count, one line, ‘have a look.’ Never a per-photo chip storm. ‘Have a look’ jumps into that trip’s album with the newly-placed sections gently marked for one visit (the same one-visit section line — ‘214 found their places’), which then quiets like any other move. It’s the archive equivalent of the moved-note: honest, warm, and gone once seen.">
          <Exhibit>
            <Stage label="The letter" caption="One envelope per trip. ‘Have a look’ lands on the newly-placed days, marked for one visit."><LiveDevice lens="helen" scale={0.62}><MoveLetter lens="helen" /></LiveDevice></Stage>
          </Exhibit>
        </QA>
      </Section>

      <Section id="ch3copy" kicker="Lift-ready" title="Copy deck" sub="Every reason code, the locked line, the suggestion and its dismissal, and the letter — three voices. Rafa excluded by rule.">
        <Ch3CopyDeck />
      </Section>
    </div>
  );
}

Object.assign(window, { Chapter3 });
