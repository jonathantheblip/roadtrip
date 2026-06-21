// hangout/dir-common.jsx — the per-direction "legend" panel.

function DirThesis({ letter, name, tagline, idea, lead, rail, photos, look, tint }) {
  const CP = window.HG_PAPER;
  const Row = ({ k, children }) => <div style={{ padding: '11px 0', borderTop: `1px solid ${CP.line}` }}>
    <div style={{ fontFamily: CP.mono, fontSize: 9.5, letterSpacing: 0.8, textTransform: 'uppercase',
      fontWeight: 600, color: tint, marginBottom: 4 }}>{k}</div>
    <div style={{ fontSize: 12.5, lineHeight: 1.45, color: CP.ink, textWrap: 'pretty' }}>{children}</div>
  </div>;
  return <div style={{ width: '100%', height: '100%', background: CP.bg, color: CP.ink, fontFamily: CP.body,
    padding: 30, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: tint, color: '#15120c',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: CP.mono, fontWeight: 700, fontSize: 19 }}>{letter}</div>
      <div>
        <div style={{ fontFamily: CP.mono, fontSize: 9.5, letterSpacing: 1.4, textTransform: 'uppercase', color: CP.faint }}>Direction {letter}</div>
        <div style={{ fontFamily: CP.display, fontWeight: 600, fontSize: 25, letterSpacing: -0.6, lineHeight: 1 }}>{name}</div>
      </div>
    </div>
    <div style={{ fontFamily: CP.display, fontStyle: 'italic', fontSize: 16, color: CP.accent, marginTop: 16, lineHeight: 1.25 }}>{tagline}</div>
    <div style={{ fontSize: 13, lineHeight: 1.5, color: CP.muted, marginTop: 10, textWrap: 'pretty' }}>{idea}</div>
    <div style={{ marginTop: 14 }}>
      <Row k="a · Home — what leads">{lead}</Row>
      <Row k="b · The 'now' rail">{rail}</Row>
      <Row k="c · Photos">{photos}</Row>
      <Row k="d · Look-back">{look}</Row>
    </div>
  </div>;
}

Object.assign(window, { HG_DirThesis: DirThesis });
