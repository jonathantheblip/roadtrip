// hangout/ui.jsx — in-skin primitives shared by every mock surface.
// All consume a traveler token `t` (HG_T[id]) so a component renders in that
// person's palette / font / radius automatically.

const { HG_shade: shade2 } = window;

// ─── text helpers ───────────────────────────────────────────────
function Mono({ children, c, s = 10.5, ls = 1.4, style }) {
  return <span style={{ fontFamily: window.HG_FONTS.mono, fontSize: s, letterSpacing: ls,
    textTransform: 'uppercase', fontWeight: 600, color: c, ...style }}>{children}</span>;
}

// ─── identity ───────────────────────────────────────────────────
function Dot({ id, size = 8, ring }) {
  return <span style={{ display: 'inline-block', width: size, height: size, borderRadius: size,
    background: window.HG_T[id].dot, boxShadow: ring ? `0 0 0 2px ${ring}` : 'none', flexShrink: 0 }} />;
}
function Avatar({ id, size = 26, viewer }) {
  const tt = window.HG_T[id];
  let label = tt.initial;
  return <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: size, height: size, borderRadius: size, background: tt.dot, color: '#fff',
    fontFamily: window.HG_FONTS.inter, fontWeight: 700, fontSize: size * 0.42, flexShrink: 0 }}>{label}</span>;
}
function FaceRow({ ids, size = 20, gap = -6 }) {
  return <span style={{ display: 'inline-flex' }}>
    {ids.map((id, i) => <span key={id} style={{ marginLeft: i ? gap : 0, zIndex: ids.length - i,
      borderRadius: size, boxShadow: '0 0 0 1.5px var(--ring)' }}>
      <Avatar id={id} size={size} /></span>)}
  </span>;
}

// ─── image placeholder (striped, with mono caption) ─────────────
function Photo({ tint = '#6b6357', h = 120, cap, round = 6, label, style }) {
  const a = shade2(tint, 16), b = shade2(tint, -14);
  return <div style={{ position: 'relative', height: h, borderRadius: round, overflow: 'hidden',
    background: `repeating-linear-gradient(135deg, ${a} 0 9px, ${b} 9px 18px)`, ...style }}>
    {label && <div style={{ position: 'absolute', top: 8, left: 9 }}><Mono s={8.5} ls={1.2} c="rgba(255,255,255,0.66)">{label}</Mono></div>}
    {cap && <div style={{ position: 'absolute', left: 9, bottom: 8, right: 9 }}>
      <span style={{ fontFamily: window.HG_FONTS.mono, fontSize: 10, color: 'rgba(255,255,255,0.92)',
        textShadow: '0 1px 4px rgba(0,0,0,0.5)', lineHeight: 1.3 }}>{cap}</span></div>}
  </div>;
}

// ─── phone screen frame ─────────────────────────────────────────
function Screen({ t, children, scroll, pad = 0, head }) {
  const p = t.pal;
  return <div style={{ width: '100%', height: '100%', background: p.bg, color: p.ink,
    fontFamily: t.font.body, display: 'flex', flexDirection: 'column', position: 'relative',
    overflow: 'hidden', ['--ring']: p.bg }}>
    {/* status bar */}
    <div style={{ flexShrink: 0, height: 30, display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', padding: '0 18px 0 20px' }}>
      <span style={{ fontFamily: window.HG_FONTS.inter, fontWeight: 600, fontSize: 11.5, color: p.ink }}>9:41</span>
      <span style={{ display: 'flex', gap: 4, alignItems: 'center', opacity: 0.85 }}>
        <span style={{ width: 15, height: 8, borderRadius: 2, border: `1px solid ${p.muted}` }} />
        <span style={{ width: 4, height: 8, borderRadius: 1, background: p.muted }} />
      </span>
    </div>
    <div style={{ flex: 1, padding: pad, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>{children}</div>
  </div>;
}

function ScreenHead({ t, kicker, title, sub, right, big }) {
  const p = t.pal;
  return <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
    <div>
      {kicker && <div style={{ marginBottom: 6 }}><Mono c={p.accentText} s={9.5}>{kicker}</Mono></div>}
      <div style={{ fontFamily: t.font.display, fontWeight: t.id === 'rafa' ? 600 : 600,
        fontSize: big || 22, lineHeight: 1.05, letterSpacing: t.id === 'aurelia' ? 0 : -0.4,
        fontStyle: t.id === 'aurelia' ? 'italic' : 'normal', color: p.ink }}>{title}</div>
      {sub && <div style={{ fontSize: 12.5, color: p.muted, marginTop: 5, lineHeight: 1.35,
        fontStyle: t.id === 'helen' ? 'italic' : 'normal' }}>{sub}</div>}
    </div>
    {right}
  </div>;
}

// ─── bottom dock (four front doors) ─────────────────────────────
function Dock({ t, active }) {
  const p = t.pal;
  return <div style={{ flexShrink: 0, display: 'flex', gap: 6, padding: '8px 10px 12px',
    borderTop: `1px solid ${p.line}`, background: p.bg }}>
    {window.HG_ORDER.map((id) => {
      const on = id === active; const tt = window.HG_T[id];
      return <div key={id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 4, padding: '6px 2px', borderRadius: 10,
        background: on ? (t.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)') : 'transparent' }}>
        <Dot id={id} size={on ? 9 : 7} ring={on ? p.bg : null} />
        <span style={{ fontFamily: window.HG_FONTS.mono, fontSize: 8, letterSpacing: 0.6,
          textTransform: 'uppercase', color: on ? p.ink : p.faint, fontWeight: 600 }}>{tt.name}</span>
      </div>;
    })}
  </div>;
}

// ─── a pantry / suggestion card ─────────────────────────────────
// The unit the family actually needs: a pre-scoped place, tagged to people.
function SuggestCard({ p: sug, t, ph = 74, showCat = true }) {
  const p = t.pal; const cat = window.HG_CAT[sug.cat];
  const r = Math.min(t.radius, 16);
  return <div style={{ background: p.surface, borderRadius: r, overflow: 'hidden',
    border: `1px solid ${p.line}` }}>
    <Photo tint={sug.tint} h={ph} round={0} label="PLACE" />
    <div style={{ padding: '9px 11px 11px' }}>
      {showCat && <div style={{ marginBottom: 4 }}><Mono s={8} ls={0.9} c={cat.tint}>{cat.label}</Mono></div>}
      <div style={{ fontFamily: t.font.display, fontWeight: 600, fontSize: 14.5,
        fontStyle: t.id === 'aurelia' ? 'italic' : 'normal', color: p.ink, lineHeight: 1.1,
        letterSpacing: t.id === 'aurelia' ? 0 : -0.2 }}>{sug.title}</div>
      <div style={{ fontSize: 11.5, lineHeight: 1.4, color: p.muted, marginTop: 5, textWrap: 'pretty' }}>{sug.blurb}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 9 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Mono s={8} ls={0.8} c={p.faint}>FOR</Mono>
          <FaceRow ids={sug.forIds} size={17} />
        </span>
        <Mono s={8.5} ls={0.5} c={p.faint}>{sug.when}</Mono>
      </div>
    </div>
  </div>;
}

// compact pantry row (no photo) for tight rails
function SuggestRow({ p: sug, t }) {
  const p = t.pal; const cat = window.HG_CAT[sug.cat];
  return <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0',
    borderBottom: `1px solid ${p.line}` }}>
    <div style={{ width: 38, height: 38, borderRadius: Math.min(t.radius, 10), flexShrink: 0,
      background: `repeating-linear-gradient(135deg, ${shade2(sug.tint, 16)} 0 6px, ${shade2(sug.tint, -12)} 6px 12px)` }} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontFamily: t.font.display, fontWeight: 600, fontSize: 13.5, color: p.ink,
        fontStyle: t.id === 'aurelia' ? 'italic' : 'normal' }}>{sug.title}</div>
      <div style={{ marginTop: 2 }}><Mono s={8} ls={0.6} c={cat.tint}>{cat.label}</Mono>
        <span style={{ color: p.faint, fontSize: 10, marginLeft: 6 }}>{sug.when}</span></div>
    </div>
    <FaceRow ids={sug.forIds} size={16} />
  </div>;
}

// ─── a single moment in the feed ────────────────────────────────
function MomentRow({ m, t, viewer }) {
  const p = t.pal; const who = window.HG_T[m.who];
  const nm = (viewer === 'rafa' ? window.HG_RAFA_NAME[m.who] : who.name);
  return <div style={{ display: 'flex', gap: 10, padding: '11px 0', borderBottom: `1px solid ${p.line}` }}>
    <Avatar id={m.who} size={26} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 12.5, color: p.ink, fontFamily: t.font.body }}>{nm}</span>
        <Mono s={8.5} c={p.faint} ls={0.5}>{m.ago}</Mono>
      </div>
      {m.kind === 'photo' && <div style={{ marginTop: 6 }}><Photo tint={m.tint} h={104} cap={m.cap} round={Math.min(t.radius, 10)} /></div>}
      {m.kind === 'text' && <div style={{ marginTop: 4, fontSize: 13, lineHeight: 1.4, color: p.ink,
        fontStyle: t.id === 'helen' ? 'italic' : 'normal', fontFamily: t.font.display }}>{m.body}</div>}
      {m.kind === 'log' && <div style={{ marginTop: 5, fontFamily: window.HG_FONTS.mono, fontSize: 12,
        letterSpacing: 0.5, color: p.accentText }}>{m.body}</div>}
      {m.kind === 'voice' && <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 9,
        background: p.surface, border: `1px solid ${p.line}`, borderRadius: 20, padding: '7px 12px' }}>
        <span style={{ width: 20, height: 20, borderRadius: 20, background: p.accent, color: p.accentInk,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9 }}>▶</span>
        <span style={{ display: 'flex', gap: 2.5, alignItems: 'center', flex: 1 }}>
          {[6, 11, 16, 9, 13, 7, 14, 10, 5, 12, 8, 15, 6, 10].map((hh, i) =>
            <span key={i} style={{ width: 2.5, height: hh, borderRadius: 2, background: p.muted }} />)}
        </span>
        <Mono s={8.5} c={p.faint}>{m.dur}</Mono></div>}
      {m.cap && m.kind === 'photo' ? null : null}
      {m.kind === 'voice' && <div style={{ marginTop: 5, fontSize: 12, color: p.muted, fontStyle: 'italic' }}>{m.body}</div>}
    </div>
  </div>;
}

// ─── presence row (who's around) ────────────────────────────────
function PresenceRow({ id, t, viewer }) {
  const p = t.pal; const pr = window.HG_PRESENCE[id];
  const nm = (viewer === 'rafa' ? window.HG_RAFA_NAME[id] : window.HG_T[id].name);
  const live = pr.dotMood === 'live';
  return <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0' }}>
    <div style={{ position: 'relative' }}>
      <Avatar id={id} size={30} />
      <span style={{ position: 'absolute', right: -1, bottom: -1, width: 9, height: 9, borderRadius: 9,
        background: live ? p.live : p.good, boxShadow: `0 0 0 2px ${p.bg}` }} />
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontWeight: 600, fontSize: 12.5, color: p.ink }}>{nm} <span style={{ color: p.faint, fontWeight: 400 }}>· {pr.where}</span></div>
      <div style={{ fontSize: 11.5, color: p.muted, marginTop: 1 }}>{pr.what}</div>
    </div>
  </div>;
}

// soft section divider label
function Rule({ t, children, accent }) {
  const p = t.pal;
  return <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '4px 0 2px' }}>
    <Mono c={accent ? p.accentText : p.faint} s={9.5}>{children}</Mono>
    <span style={{ flex: 1, height: 1, background: p.line }} />
  </div>;
}

Object.assign(window, { HG_Mono: Mono, HG_Dot: Dot, HG_Avatar: Avatar, HG_FaceRow: FaceRow,
  HG_Photo: Photo, HG_Screen: Screen, HG_ScreenHead: ScreenHead, HG_Dock: Dock,
  HG_SuggestCard: SuggestCard, HG_SuggestRow: SuggestRow, HG_MomentRow: MomentRow,
  HG_PresenceRow: PresenceRow, HG_Rule: Rule });
