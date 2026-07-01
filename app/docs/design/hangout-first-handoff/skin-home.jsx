// roadtrip_handoff/skin-home.jsx — the living-heart home, theme-aware.
// SAME structure for every person; only the skin (palette / display font / radius)
// changes — proving the facelift carries across lenses. Reads system.jsx globals.
// Rafa is intentionally excluded here (he keeps his simpler iPad pad).

const SKIN = {
  jonathan: {
    hero: 'At the lake house', low: false,
    weaveKick: 'The day, logged', weave: '3 logged · dock at 16:00, one named frog',
    nearbyKick: 'Nearby', nothing: null,
  },
  helen: {
    hero: 'At the lake house', low: false,
    weaveKick: 'The day’s story', weave: '3 moments in · Rafa named a frog at the dock',
    nearbyKick: 'We could… on the lake', nothing: null,
  },
  aurelia: {
    hero: 'at the lake house', low: true,
    weaveKick: 'the day, braided', weave: '3 shots in · the frog got a name (gary II)',
    nearbyKick: 'we could…', nothing: null,
  },
};
const SKIN_PRESENCE = [
  { id: 'jonathan', where: 'The dock', dot: 'home' },
  { id: 'rafa', where: 'The water', dot: 'live' },
  { id: 'helen', where: 'Hammock', dot: 'home' },
  { id: 'aurelia', where: 'Kayak', dot: 'out' },
];
const SKIN_EVENTS = [['10:00', 'Swim off the dock'], ['6:30', 'Grill on the deck']];
const SKIN_NEARBY = [{ title: 'Kayaks at the cove', meta: '3 MIN WALK', tint: '#3A6E66' }, { title: 'Ice cream in town', meta: '8 MIN DRIVE', tint: '#94506A' }];

function SkinHome({ id }) {
  const t = TRAVELERS[id], c = t.pal, s = SKIN[id];
  const serif = t.font.display;
  const ital = s.low ? 'italic' : 'normal';
  const rad = Math.min(t.radius, 16);
  const dotColor = { home: c.good, out: '#C9A24B', live: c.live };
  const lc = (x) => (s.low && typeof x === 'string' ? x.toLowerCase() : x);

  const Eyebrow = ({ children, col }) => <span style={{ fontFamily: FONTS.mono, fontSize: 9, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: 600, color: col || c.accentText }}>{lc(children)}</span>;
  const Sect = ({ children, sub }) => (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '0 0 11px' }}>
      <span style={{ fontFamily: serif, fontStyle: ital, fontSize: 19, fontWeight: 600, letterSpacing: -0.3, color: c.ink }}>{lc(children)}</span>
      {sub && <Eyebrow col={c.faint}>{sub}</Eyebrow>}
    </div>
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: c.bg, color: c.ink, fontFamily: t.font.body }}>
      <div className="ft-scroll" style={{ flex: 1, overflowY: 'auto' }}>
        {/* hero */}
        <div style={{ position: 'relative', height: 224, flexShrink: 0 }}>
          <Photo ratio={null} tint="#3A5A5E" radius={0} grain style={{ position: 'absolute', inset: 0, height: '100%' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(20,24,20,0.14) 0%, transparent 30%, rgba(15,18,15,0.76))' }} />
          <div style={{ position: 'absolute', top: 12, right: 14 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(10,12,10,0.5)', backdropFilter: 'blur(4px)', borderRadius: 999, padding: '5px 10px 5px 8px' }}>
              <Ic.map s={12} c="#fff" /><span style={{ fontFamily: FONTS.mono, fontSize: 8, letterSpacing: 0.8, color: '#fff', fontWeight: 600 }}>{lc('LIVE MAP')}</span>
            </span>
          </div>
          <div style={{ position: 'absolute', left: 18, right: 18, bottom: 14 }}>
            <Eyebrow col="rgba(255,255,255,0.82)">WINNIPESAUKEE · DAY 3</Eyebrow>
            <div style={{ fontFamily: serif, fontStyle: ital, fontSize: 30, fontWeight: 600, letterSpacing: -0.7, color: '#fff', lineHeight: 1.02, marginTop: 4 }}>{s.hero}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <span style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 13, color: 'rgba(255,255,255,0.82)' }}>{lc('Day 3 of 7')}</span>
              <span style={{ width: 3, height: 3, borderRadius: 3, background: 'rgba(255,255,255,0.5)' }} />
              <span style={{ fontFamily: FONTS.mono, fontSize: 8.5, letterSpacing: 0.6, color: 'rgba(255,255,255,0.7)' }}>{lc('WATER 70° · SUNSET 8:01')}</span>
            </div>
          </div>
        </div>

        <div style={{ padding: '16px 18px 22px' }}>
          {/* weave — forming (Idea A) */}
          <button style={{ width: '100%', textAlign: 'left', background: t.dark ? c.surface : '#14180F', border: t.dark ? `1px solid ${c.line}` : 'none', borderRadius: rad, padding: '15px 16px', cursor: 'pointer', marginBottom: 20, position: 'relative' }}>
            <div style={{ position: 'absolute', top: 15, right: 15, display: 'flex' }}>{['jonathan', 'helen', 'aurelia', 'rafa'].map((p, i) => <span key={p} style={{ width: 9, height: 9, borderRadius: 9, background: TRAVELERS[p].dot, marginLeft: i ? -3 : 0, border: `1.5px solid ${t.dark ? c.surface : '#14180F'}` }} />)}</div>
            <Eyebrow col={t.dark ? c.accentText : '#C9B98A'}>{s.weaveKick} · forming</Eyebrow>
            <div style={{ fontFamily: serif, fontStyle: ital, fontSize: 16.5, fontWeight: 600, color: t.dark ? c.ink : '#F4F0E7', marginTop: 6, lineHeight: 1.25 }}>{lc(s.weave)}</div>
            <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 12.5, color: t.dark ? c.muted : 'rgba(244,240,231,0.6)', marginTop: 4 }}>{lc('It keeps weaving as the day goes.')}</div>
          </button>

          {/* who's around */}
          <Sect sub="LIVE">Who’s around</Sect>
          <div style={{ display: 'flex', gap: 14, overflowX: 'auto', marginBottom: 20 }} className="ft-scroll">
            {SKIN_PRESENCE.map((p) => (
              <div key={p.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 62, flexShrink: 0 }}>
                <div style={{ position: 'relative' }}>
                  <Avatar id={p.id} size={44} />
                  <span style={{ position: 'absolute', right: 0, bottom: 0, width: 12, height: 12, borderRadius: 12, background: dotColor[p.dot], boxShadow: `0 0 0 2.5px ${c.bg}` }} />
                </div>
                <span style={{ fontFamily: FONTS.mono, fontSize: 8, letterSpacing: 0.3, color: c.muted, textAlign: 'center' }}>{lc(p.where)}</span>
              </div>
            ))}
          </div>

          {/* we could — nearby */}
          <Sect>{s.nearbyKick}</Sect>
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            {SKIN_NEARBY.map((it) => (
              <div key={it.title} style={{ flex: 1, background: c.surface, borderRadius: rad, overflow: 'hidden', border: `1px solid ${c.line}` }}>
                <div style={{ height: 62, position: 'relative' }}><Photo ratio={null} tint={it.tint} radius={0} grain style={{ position: 'absolute', inset: 0, height: '100%' }} /></div>
                <div style={{ padding: '9px 10px 10px' }}>
                  <div style={{ fontFamily: serif, fontStyle: ital, fontSize: 13, fontWeight: 600, color: c.ink, lineHeight: 1.1 }}>{lc(it.title)}</div>
                  <div style={{ fontFamily: FONTS.mono, fontSize: 8, letterSpacing: 0.6, color: c.faint, marginTop: 5 }}>{lc(it.meta)}</div>
                </div>
              </div>
            ))}
          </div>

          {/* agenda */}
          <Sect>On the agenda</Sect>
          <div style={{ background: c.surface, borderRadius: rad, padding: '4px 14px', border: `1px solid ${c.line}` }}>
            {SKIN_EVENTS.map((e, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 2px', borderTop: i ? `1px solid ${c.line}` : 'none' }}>
                <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: c.muted, width: 46, flexShrink: 0 }}>{e[0]}</span>
                <span style={{ flex: 1, fontFamily: t.font.body, fontSize: 14, color: c.ink, fontWeight: 500 }}>{lc(e[1])}</span>
                <Ic.right s={14} c={c.faint} />
              </div>
            ))}
          </div>

          {/* quiet actions */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', paddingTop: 16 }}>
            {['Share a moment', 'Surprises', 'Replay', 'The book'].map((a) => <span key={a} style={{ fontFamily: FONTS.mono, fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase', color: c.faint, fontWeight: 600 }}>{lc(a)}</span>)}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { SkinHome });
