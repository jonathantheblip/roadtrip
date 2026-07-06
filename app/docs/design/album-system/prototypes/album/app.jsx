// album/app.jsx — root of the growing container. Chapter 1 is built; 2 & 3 are
// stubbed with their real theses so the system reads whole and they plug into
// the same shell next pass.

const CHAPTERS = [
  { id: 'ch1', title: 'The album that organizes itself', tag: 'Navigation · filters · best-of', ready: true },
  { id: 'ch2', title: 'Finish the story', tag: 'Settling any day, later', ready: true },
  { id: 'ch3', title: 'Photo moves', tag: 'The “moved because…” + the hand', ready: true },
];
const TOCS = {
  ch1: [
    { id: 'intro', label: 'The ask' },
    { id: 'nav', label: '1–2 · Navigation & headers' },
    { id: 'filters', label: '3–4 · Filters & tags' },
    { id: 'best', label: '5–6 · Best-of' },
    { id: 'smarts', label: '7 · Smarts & consent' },
    { id: 'states', label: '8 · Growth & empty' },
    { id: 'lenses', label: 'The other three lenses' },
    { id: 'copy', label: 'Copy deck' },
  ],
  ch2: [
    { id: 'ch2intro', label: 'The ask' },
    { id: 'door', label: '1 · The door' },
    { id: 'dayview', label: '2 · The day view' },
    { id: 'pooling', label: '3 · Pooling quiet days' },
    { id: 'noevidence', label: '4 · No-evidence days' },
    { id: 'keep', label: '5 · The keep' },
    { id: 'aurelia', label: '6 · Aurelia’s authorship' },
    { id: 'archive', label: '7 · The archive at scale' },
    { id: 'ch2copy', label: 'Copy deck' },
  ],
  ch3: [
    { id: 'ch3intro', label: 'The ask' },
    { id: 'movednote', label: '1 · Chip lifecycle' },
    { id: 'storyline', label: '2 · The story line' },
    { id: 'sheet', label: '3 · The Move-to hand' },
    { id: 'honesty', label: '4 · Who moved what' },
    { id: 'suggestion', label: '5 · The suggestion' },
    { id: 'letter', label: '6 · The letter' },
    { id: 'ch3copy', label: 'Copy deck' },
  ],
};

function ChapterStub({ n, title, thesis, breath, points }) {
  return (
    <div style={{ paddingBottom: 90 }}>
      <Section id="stub" kicker={`Chapter ${String(n).padStart(2, '0')} · next pass`}>
        <div style={{ maxWidth: 760, paddingTop: 8 }}>
          <h1 style={{ fontFamily: FONTS.fraunces, fontSize: 46, fontWeight: 600, letterSpacing: -1, lineHeight: 1.04, margin: 0 }}>{title}</h1>
          <Lede>{thesis}</Lede>
          <div style={{ background: DOC.panel, border: `1px solid ${DOC.line}`, borderLeft: `3px solid ${DOC.accent}`, borderRadius: 10, padding: '16px 18px', margin: '4px 0 8px' }}>
            <span style={{ fontFamily: FONTS.mono, fontSize: 9.5, letterSpacing: 1.6, textTransform: 'uppercase', color: DOC.accent }}>In one breath</span>
            <div style={{ fontFamily: FONTS.fraunces, fontSize: 18, fontStyle: 'italic', color: DOC.ink, marginTop: 8, lineHeight: 1.45, textWrap: 'pretty' }}>{breath}</div>
          </div>
        </div>
      </Section>
      <Section id="stubq" title="What this chapter will answer">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, maxWidth: 780 }}>
          {points.map((p, i) => (
            <div key={i} style={{ background: DOC.panel2, border: `1px solid ${DOC.line}`, borderRadius: 12, padding: '15px 16px', display: 'flex', gap: 12 }}>
              <span style={{ fontFamily: FONTS.mono, fontSize: 11, fontWeight: 600, color: DOC.accent, flexShrink: 0 }}>{String(i + 1).padStart(2, '0')}</span>
              <span style={{ fontFamily: FONTS.inter, fontSize: 13, color: DOC.ink, lineHeight: 1.5, textWrap: 'pretty' }}>{p}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 22, fontFamily: FONTS.inter, fontSize: 13, color: DOC.muted, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: DOC.good }} /> Plugs into this same container — same four lenses, same token spine, same copy discipline.
        </div>
      </Section>
    </div>
  );
}

function Root() {
  const [active, setActive] = React.useState('ch1');
  React.useEffect(() => { window.scrollTo({ top: 0 }); }, [active]);
  return (
    <DocShell chapters={CHAPTERS} active={active} onChapter={setActive} toc={TOCS[active]}>
      {active === 'ch1' && <Chapter1 />}
      {active === 'ch2' && <Chapter2 />}
      {active === 'ch3' && <Chapter3 />}
    </DocShell>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);
