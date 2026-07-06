// album/album.jsx — the live, interactive per-trip album (Helen's PhotosView,
// re-skinnable to all four lenses). One component; behaviour driven by
// LENS_CFG + fork props (navVariant / filterMode / bestSurface) so every fork
// in the memo is the SAME real component, not a mockup.
// Depends on system.jsx primitives + album/data.jsx selectors.

const A_MONTH = { 1: 'MAY 1', 2: 'MAY 2', 3: 'MAY 3' };
const A_DOW = { 1: 'FRI', 2: 'SAT', 3: 'SUN' };

function aTime(p) { // synthesize a plausible clock label per photo
  const base = { s1: '3:18 PM', s2: '5:31 PM', s3: '7:12 PM', s4: '9:41 AM' }[p.stopId];
  return base || (p.base ? (p.day === 2 ? '8:20 AM' : '7:40 PM') : '—');
}

// ── one photo tile ───────────────────────────────────────────────
function ATile({ p, c, r, cfg, showFaces, onOpen, big }) {
  return (
    <button onClick={onOpen} style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', display: 'block', width: '100%', position: 'relative' }}>
      <div style={{ borderRadius: big ? r + 4 : Math.max(3, r - 8), overflow: 'hidden', position: 'relative' }}>
        <Photo ratio={1} tint={p.tint} radius={0} />
        {p.kind === 'video' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: big ? 44 : 30, height: big ? 44 : 30, borderRadius: '50%', background: 'rgba(0,0,0,0.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }}><Ic.play s={big ? 18 : 13} c="#fff" /></div>
          </div>
        )}
        {/* honest transient chip (suppressed on Rafa) */}
        {cfg.chips && (p.kind === 'video' || p.chip) && (
          <div style={{ position: 'absolute', right: 5, bottom: 5, display: 'flex', gap: 4 }}>
            <span style={{ background: 'rgba(0,0,0,0.5)', color: 'rgba(255,255,255,0.94)', fontFamily: FONTS.mono, fontSize: 8.5, letterSpacing: 0.4, padding: '2px 6px', borderRadius: 4 }}>
              {p.chip === 'onitsway' ? 'ON ITS WAY' : p.chip === 'nosound' ? 'NO SOUND' : p.dur}
            </span>
          </div>
        )}
        {/* per-tile face dots — subtle; louder while a "with" filter is on */}
        {cfg.chips && p.people.length > 0 && (
          <div style={{ position: 'absolute', left: 5, bottom: 5, display: 'flex', gap: -4, opacity: showFaces ? 1 : 0.72 }}>
            {p.people.slice(0, 3).map((id, i) => <span key={id} style={{ width: showFaces ? 10 : 7, height: showFaces ? 10 : 7, borderRadius: '50%', background: TRAVELERS[id].dot, boxShadow: '0 0 0 1.5px rgba(0,0,0,0.35)', marginLeft: i ? -3 : 0 }} />)}
          </div>
        )}
      </div>
    </button>
  );
}

// ── section header (place-lead vs timed event), condenses when pinned ─────
function ASecHeader({ sec, c, stuck, showFaces, count }) {
  const isPlace = sec.type === 'place';
  const eyebrow = sec.type === 'loose' ? 'LOOSE' : isPlace
    ? `AT · ${A_DOW[sec.day.n]} ${A_MONTH[sec.day.n]}`
    : `${A_DOW[sec.day.n]} ${A_MONTH[sec.day.n]} · ${sec.time}`;
  const faces = showFaces && sec.photos[0]?.people?.length ? sec.photos[0].people : null;
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 4, background: c.bg, paddingTop: stuck ? 6 : 16, paddingBottom: stuck ? 6 : 9, borderBottom: stuck ? `1px solid ${c.line}` : 'none' }}>
      {isPlace && <div style={{ position: 'absolute', left: -14, top: stuck ? 8 : 18, bottom: stuck ? 8 : 'auto', width: 3, height: stuck ? 'auto' : 20, borderRadius: 2, background: c.accent, opacity: 0.9 }} />}
      {stuck ? (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: FONTS.mono, fontSize: 8.5, letterSpacing: 1.2, color: c.faint, whiteSpace: 'nowrap' }}>{isPlace ? 'AT' : sec.time}</span>
          <span style={{ fontFamily: FONTS.fraunces, fontSize: 15, fontWeight: 600, color: c.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{isPlace ? sec.loc : sec.title}</span>
          <span style={{ fontFamily: FONTS.mono, fontSize: 9, color: c.faint, marginLeft: 'auto' }}>{count}</span>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: FONTS.mono, fontSize: 9.5, letterSpacing: 1.6, color: isPlace ? c.accent : c.faint }}>{eyebrow}</span>
            <span style={{ fontFamily: FONTS.mono, fontSize: 9, color: c.faint }}>· {count}</span>
            {faces && <span style={{ display: 'flex', marginLeft: 'auto' }}>{faces.slice(0, 4).map((id, i) => <span key={id} style={{ width: 13, height: 13, borderRadius: '50%', background: TRAVELERS[id].dot, boxShadow: `0 0 0 1.5px ${c.bg}`, marginLeft: i ? -4 : 0 }} />)}</span>}
          </div>
          <div style={{ fontFamily: FONTS.fraunces, fontSize: isPlace ? 21 : 19, fontWeight: 600, letterSpacing: -0.3, color: c.ink, marginTop: 4, lineHeight: 1.15 }}>
            {sec.type === 'loose' ? 'In transit' : isPlace ? sec.title : sec.title}
          </div>
          {isPlace && <div style={{ fontFamily: FONTS.fraunces, fontSize: 13, fontStyle: 'italic', color: c.muted, marginTop: 1 }}>the day's home base</div>}
        </>
      )}
    </div>
  );
}

// ── the best-of shelf (honest label + override + consent seam) ────
function ABestShelf({ lens, c, r, cfg, tier, setTier, mode, setMode, removed, setRemoved, onOpen }) {
  const [seam, setSeam] = React.useState(false);
  const [undo, setUndo] = React.useState(null);
  const copy = PICK_COPY[lens];
  const modes = lens === 'aurelia' ? ['hers', 'featuring'] : ['featuring', 'trip'];
  const picks = bestPicks(mode, cfg.bestSelf).filter(p => !removed.has(p.id));
  const label = (copy[mode] || copy.trip || copy.featuring)[tier];
  const remove = (id) => {
    setRemoved(s => new Set([...s, id]));
    setUndo({ id }); setTimeout(() => setUndo(u => (u && u.id === id ? null : u)), 6000);
  };
  return (
    <div style={{ background: c.bg2, borderRadius: r, padding: '13px 0 14px', margin: '4px 0 20px' }}>
      <div style={{ padding: '0 14px', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Ic.star s={13} c={c.accent} fill={c.accent} />
            <span style={{ fontFamily: FONTS.fraunces, fontSize: 16, fontWeight: 600, color: c.ink, fontStyle: lens === 'aurelia' ? 'italic' : 'normal' }}>{lens === 'aurelia' ? 'the ones that hit' : 'Best of the trip'}</span>
          </div>
          <div style={{ fontFamily: FONTS.mono, fontSize: 9, letterSpacing: 0.4, color: c.muted, marginTop: 5, textTransform: cfg.lowercase ? 'none' : 'none', lineHeight: 1.4 }}>{label}</div>
        </div>
        {/* mode switch (per-lens default already applied) */}
        {cfg.ranks && (
          <div style={{ display: 'flex', gap: 3, background: c.surface, borderRadius: 999, padding: 3 }}>
            {modes.map(m => (
              <button key={m} onClick={() => setMode(m)} style={{ border: 'none', cursor: 'pointer', borderRadius: 999, padding: '4px 9px', background: mode === m ? c.accent : 'transparent', color: mode === m ? c.accentInk : c.muted, fontFamily: FONTS.mono, fontSize: 8.5, letterSpacing: 0.6, whiteSpace: 'nowrap', textTransform: cfg.lowercase ? 'lowercase' : 'none' }}>{copy.sub[m]}</button>
            ))}
          </div>
        )}
      </div>
      {/* horizontal strip */}
      <div className="ft-scroll" style={{ display: 'flex', gap: 9, overflowX: 'auto', padding: '12px 14px 2px' }}>
        {picks.map(p => (
          <div key={p.id} style={{ width: 116, flexShrink: 0, position: 'relative' }}>
            <ATile p={p} c={c} r={r} cfg={cfg} onOpen={() => onOpen(p)} big />
            <button onClick={() => remove(p.id)} title="not this one" style={{ position: 'absolute', top: 5, right: 5, width: 22, height: 22, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'rgba(0,0,0,0.55)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic.x s={12} c="#fff" /></button>
          </div>
        ))}
        <button style={{ width: 116, flexShrink: 0, borderRadius: r + 4, border: `1.5px dashed ${c.lineBold}`, background: 'transparent', color: c.muted, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, aspectRatio: 1 }}>
          <Ic.plus s={18} c={c.muted} />
          <span style={{ fontFamily: FONTS.mono, fontSize: 8.5, letterSpacing: 0.5, textAlign: 'center', padding: '0 8px', textTransform: cfg.lowercase ? 'lowercase' : 'none' }}>{copy.override.add}</span>
        </button>
      </div>
      {/* undo + consent seam */}
      <div style={{ padding: '8px 14px 0', minHeight: 4 }}>
        {undo && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: FONTS.mono, fontSize: 10, color: c.muted }}>
            <span>{copy.override.undo.split('—')[0].trim()}</span>
            <button onClick={() => { setRemoved(s => { const n = new Set(s); n.delete(undo.id); return n; }); setUndo(null); }} style={{ border: 'none', background: 'none', color: c.accentText, cursor: 'pointer', fontFamily: FONTS.mono, fontSize: 10, textDecoration: 'underline' }}>undo</button>
          </div>
        )}
        {tier === 'onDevice' && lens !== 'rafa' && (
          <button onClick={() => setSeam(s => !s)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: c.faint, fontFamily: FONTS.mono, fontSize: 9.5, letterSpacing: 0.4, display: 'flex', alignItems: 'center', gap: 5, padding: '2px 0' }}>
            <Ic.bolt s={11} c={c.faint} /> {cfg.lowercase ? 'sharper picks?' : 'Sharper picks?'}
          </button>
        )}
        {seam && (
          <div style={{ marginTop: 8, background: c.surface, borderRadius: r - 4, padding: '11px 13px', border: `1px solid ${c.line}` }}>
            <div style={{ fontFamily: FONTS.inter, fontSize: 12.5, lineHeight: 1.5, color: c.ink, textWrap: 'pretty' }}>{SEAM_COPY.vision[lens]}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              {lens !== 'aurelia' && <button onClick={() => { setTier('vision'); setSeam(false); }} style={{ border: 'none', cursor: 'pointer', borderRadius: 999, padding: '7px 14px', background: c.accent, color: c.accentInk, fontFamily: FONTS.inter, fontSize: 12, fontWeight: 600 }}>Turn on for the family</button>}
              <button onClick={() => setSeam(false)} style={{ border: `1px solid ${c.line}`, cursor: 'pointer', borderRadius: 999, padding: '7px 14px', background: 'transparent', color: c.muted, fontFamily: FONTS.inter, fontSize: 12 }}>Not now</button>
            </div>
          </div>
        )}
        {tier === 'vision' && lens !== 'rafa' && (
          <div style={{ fontFamily: FONTS.mono, fontSize: 9, color: c.good, display: 'flex', alignItems: 'center', gap: 5 }}><Ic.check s={11} c={c.good} /> light & composition on · {cfg.lowercase ? 'turn off in settings' : 'off in Settings anytime'}</div>
        )}
      </div>
    </div>
  );
}

// ── lightbox ─────────────────────────────────────────────────────
function ALightbox({ flat, i, setI, lens, c, cfg, onClose }) {
  const item = flat[i]; const p = item.p; const sec = item.sec;
  React.useEffect(() => {
    const h = (e) => { if (e.key === 'ArrowRight') setI(x => Math.min(flat.length - 1, x + 1)); if (e.key === 'ArrowLeft') setI(x => Math.max(0, x - 1)); if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [flat.length]);
  const dateLabel = sec?.day ? `${A_DOW[sec.day.n]} ${A_MONTH[sec.day.n]} AT ${aTime(p)}` : aTime(p);
  return (
    <div style={{ position: 'absolute', inset: 0, background: c.dark ? '#08080A' : '#141210', zIndex: 40, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px 8px', color: '#fff' }}>
        <span style={{ fontFamily: FONTS.mono, fontSize: 11, opacity: 0.75 }}>{i + 1} / {flat.length}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer' }}><Ic.share s={19} c="rgba(255,255,255,0.85)" /></button>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.85)', fontSize: 19 }}>✕̶</button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><Ic.x s={21} c="#fff" /></button>
        </div>
      </div>
      <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px' }}>
        <button onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0} style={{ position: 'absolute', left: 10, zIndex: 3, width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.12)', cursor: i === 0 ? 'default' : 'pointer', opacity: i === 0 ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic.left s={20} c="#fff" /></button>
        <div style={{ width: '100%', maxWidth: 330 }}>
          <Photo ratio={3 / 4} tint={p.tint} radius={cfg.chips ? 6 : 20} grain />
          {p.kind === 'video' && <div style={{ position: 'relative', marginTop: -180, marginBottom: 150, textAlign: 'center' }}><div style={{ display: 'inline-flex', width: 56, height: 56, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}><Ic.play s={22} c="#fff" /></div></div>}
        </div>
        <button onClick={() => setI(Math.min(flat.length - 1, i + 1))} disabled={i === flat.length - 1} style={{ position: 'absolute', right: 10, zIndex: 3, width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.12)', cursor: 'pointer', opacity: i === flat.length - 1 ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic.right s={20} c="#fff" /></button>
      </div>
      <div style={{ padding: '14px 18px 22px', color: '#fff' }}>
        <div style={{ fontFamily: FONTS.mono, fontSize: 9.5, letterSpacing: 1.2, opacity: 0.7 }}>{TRAVELERS[p.author].name.toUpperCase()} · {dateLabel}</div>
        {sec?.loc && <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, opacity: 0.82 }}><Ic.pin s={12} c="rgba(255,255,255,0.7)" /><span style={{ fontFamily: FONTS.inter, fontSize: 12.5 }}>{sec.loc}</span></div>}
        {p.cap && <div style={{ fontFamily: FONTS.fraunces, fontSize: 16, fontStyle: 'italic', marginTop: 9, lineHeight: 1.4, textWrap: 'pretty' }}>{cfg.lowercase ? p.cap : p.cap}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button style={{ border: '1px solid rgba(255,255,255,0.22)', background: 'transparent', color: 'rgba(255,255,255,0.85)', borderRadius: 999, padding: '6px 12px', fontFamily: FONTS.mono, fontSize: 9.5, letterSpacing: 0.6, cursor: 'pointer' }}>EDIT DATE</button>
          {/* seam left for Ch.3: "Move to…" slots in beside Edit date */}
        </div>
      </div>
    </div>
  );
}

// ── index sheet (jump to day / place / event) ────────────────────
function AIndexSheet({ sections, onJump, onClose, c, r }) {
  const [tab, setTab] = React.useState('events');
  const days = TRIP.days;
  const rows = tab === 'events'
    ? sections.filter(s => s.type === 'event').map(s => ({ key: s.key, label: s.title, sub: `${A_DOW[s.day.n]} · ${s.loc}` }))
    : tab === 'places'
      ? (() => { const seen = new Set(); return sections.filter(s => s.type === 'place' && !seen.has(s.title) && seen.add(s.title)).map(s => ({ key: s.key, label: s.title, sub: s.loc })); })()
      : days.map(d => ({ key: sections.find(s => s.day?.n === d.n)?.key, label: `${A_DOW[d.n]} · ${d.name}`, sub: d.date }));
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 45, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} />
      <div style={{ position: 'relative', background: c.surface, borderTopLeftRadius: r + 8, borderTopRightRadius: r + 8, padding: '10px 16px 26px', maxHeight: '70%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ width: 38, height: 4, borderRadius: 3, background: c.line, margin: '4px auto 12px' }} />
        <div style={{ display: 'flex', gap: 4, background: c.bg2, borderRadius: 999, padding: 3, marginBottom: 12 }}>
          {[['events', 'Events'], ['places', 'Places'], ['days', 'Days']].map(([k, lab]) => (
            <button key={k} onClick={() => setTab(k)} style={{ flex: 1, border: 'none', cursor: 'pointer', borderRadius: 999, padding: '7px 0', background: tab === k ? c.accent : 'transparent', color: tab === k ? c.accentInk : c.muted, fontFamily: FONTS.mono, fontSize: 10, letterSpacing: 0.6 }}>{lab}</button>
          ))}
        </div>
        <div className="ft-scroll" style={{ overflowY: 'auto' }}>
          {rows.map((row, i) => (
            <button key={i} onClick={() => { onJump(row.key); onClose(); }} style={{ width: '100%', textAlign: 'left', border: 'none', borderBottom: `1px solid ${c.line}`, background: 'transparent', cursor: 'pointer', padding: '12px 4px', display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ flex: 1, fontFamily: FONTS.fraunces, fontSize: 16, fontWeight: 500, color: c.ink }}>{row.label}</span>
              <span style={{ fontFamily: FONTS.mono, fontSize: 9, color: c.faint }}>{row.sub}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ATile, ASecHeader, ABestShelf, ALightbox, AIndexSheet, A_DOW, A_MONTH, aTime });
