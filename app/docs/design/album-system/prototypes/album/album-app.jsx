// album/album-app.jsx — AlbumApp: assembles the album for a lens. Fixed top
// chrome (bar + day strip + quiet filter row) over a scroll body with sticky,
// condensing section headers. Fork props swap nav idiom / filter behaviour /
// best-of surface without changing the component.

function AEmpty({ which, lens, c, onTeach }) {
  const txt = EMPTY_COPY[which]?.[lens] || '';
  const icon = which === 'noFaces' ? Ic.heart : which === 'noVideos' ? Ic.play : which === 'zeroMatch' ? Ic.grid : Ic.star;
  return (
    <div style={{ textAlign: 'center', padding: '30px 26px', color: c.muted }}>
      <div style={{ width: 46, height: 46, borderRadius: '50%', background: c.bg2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>{icon({ s: 20, c: c.faint })}</div>
      <div style={{ fontFamily: FONTS.fraunces, fontSize: 15.5, fontStyle: 'italic', lineHeight: 1.5, color: c.ink, maxWidth: 250, margin: '0 auto', textWrap: 'pretty' }}>{txt}</div>
      {which === 'noFaces' && <button onClick={onTeach} style={{ marginTop: 14, border: 'none', cursor: 'pointer', borderRadius: 999, background: c.accent, color: c.accentInk, fontFamily: FONTS.inter, fontSize: 12.5, fontWeight: 600, padding: '8px 16px' }}>{lens === 'aurelia' ? 'teach the app' : 'Teach the app'}</button>}
    </div>
  );
}

// quiet calm filter row (Helen / Aurelia)
function ACalmFilters({ c, cfg, lens, kind, setKind, withP, setWithP, bestOn, toggleBest, query, setQuery, active, clear }) {
  const [withOpen, setWithOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const lc = cfg.lowercase;
  const seg = (v, lab) => (
    <button onClick={() => setKind(v)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '0 2px', fontFamily: FONTS.mono, fontSize: 10, letterSpacing: 0.8, color: kind === v ? c.ink : c.faint, borderBottom: `2px solid ${kind === v ? c.accent : 'transparent'}`, paddingBottom: 3, textTransform: lc ? 'lowercase' : 'uppercase' }}>{lab}</button>
  );
  return (
    <div style={{ flexShrink: 0, padding: '2px 16px 10px', background: c.bg }}>
      <div className="ft-scroll" style={{ display: 'flex', alignItems: 'center', gap: 14, overflowX: 'auto' }}>
        {seg('all', lc ? 'all' : 'All')}{seg('photo', lc ? 'photos' : 'Photos')}{seg('video', lc ? 'videos' : 'Videos')}
        <span style={{ width: 1, height: 14, background: c.line, flexShrink: 0 }} />
        <button onClick={() => setWithOpen(o => !o)} style={{ border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: FONTS.mono, fontSize: 10, letterSpacing: 0.8, color: withP ? c.ink : c.faint, textTransform: lc ? 'lowercase' : 'uppercase', paddingBottom: 3, borderBottom: `2px solid ${withP ? c.accent : 'transparent'}`, whiteSpace: 'nowrap' }}>
          {withP ? <span style={{ width: 12, height: 12, borderRadius: '50%', background: TRAVELERS[withP].dot }} /> : null}{withP ? displayName(withP, lens) : (lc ? 'with' : 'With')}
        </button>
        <button onClick={toggleBest} style={{ border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: FONTS.mono, fontSize: 10, letterSpacing: 0.8, color: bestOn ? c.ink : c.faint, textTransform: lc ? 'lowercase' : 'uppercase', paddingBottom: 3, borderBottom: `2px solid ${bestOn ? c.accent : 'transparent'}`, whiteSpace: 'nowrap' }}>
          <Ic.star s={12} c={bestOn ? c.accent : c.faint} fill={bestOn ? c.accent : 'none'} /> {lc ? 'best' : 'Best'}
        </button>
        <button onClick={() => setSearchOpen(o => !o)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: c.faint, paddingBottom: 3, display: 'flex' }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={query ? c.accent : c.faint} strokeWidth="1.9" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg></button>
        {active && <button onClick={clear} style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', color: c.accentText, fontFamily: FONTS.mono, fontSize: 9.5, letterSpacing: 0.6, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 3 }}><Ic.x s={11} c={c.accentText} />{lc ? 'clear' : 'Clear'}</button>}
      </div>
      {withOpen && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {TRAVELER_LIST.map(id => (
            <button key={id} onClick={() => { setWithP(withP === id ? null : id); setWithOpen(false); }} style={{ border: 'none', background: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, opacity: withP && withP !== id ? 0.4 : 1 }}>
              <Avatar id={id} size={34} ring={withP === id} ringColor={c.accent} />
              <span style={{ fontFamily: FONTS.mono, fontSize: 8, color: c.muted, textTransform: lc ? 'lowercase' : 'none' }}>{displayName(id, lens)}</span>
            </button>
          ))}
        </div>
      )}
      {searchOpen && (
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, background: c.bg2, borderRadius: 999, padding: '7px 14px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.faint} strokeWidth="1.9" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder={lc ? 'search captions…' : 'Search captions…'} style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: c.ink, fontFamily: FONTS.inter, fontSize: 13 }} />
          {query && <button onClick={() => setQuery('')} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><Ic.x s={13} c={c.faint} /></button>}
        </div>
      )}
    </div>
  );
}

// Jonathan's Record: filters STACK (person AND day AND place)
function AStackFilters({ c, cfg, kind, setKind, stack, setStack, bestOn, toggleBest, active, clear }) {
  const [tab, setTab] = React.useState('person');
  const opts = tab === 'person' ? TRAVELER_LIST.map(id => ({ v: id, label: TRAVELERS[id].name }))
    : tab === 'day' ? TRIP.days.map(d => ({ v: 'd' + d.n, label: `${A_DOW[d.n]} · ${d.name}` }))
      : [...new Set(albumSections().filter(s => s.loc).map(s => s.loc))].map(l => ({ v: l, label: l }));
  const axis = stack[tab] || [];
  const toggle = (v) => setStack(s => ({ ...s, [tab]: (s[tab] || []).includes(v) ? s[tab].filter(x => x !== v) : [...(s[tab] || []), v] }));
  const chips = [...(stack.person || []).map(v => ({ ax: 'person', v, l: TRAVELERS[v].name })), ...(stack.day || []).map(v => ({ ax: 'day', v, l: v.toUpperCase() })), ...(stack.place || []).map(v => ({ ax: 'place', v, l: v }))];
  return (
    <div style={{ flexShrink: 0, background: c.bg, padding: '0 16px 10px', borderBottom: `1px solid ${c.line}` }}>
      <div style={{ display: 'flex', gap: 0, marginBottom: 8 }}>
        {[['person', 'PERSON'], ['day', 'DAY'], ['place', 'PLACE']].map(([k, lab]) => (
          <button key={k} onClick={() => setTab(k)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '6px 12px 6px 0', fontFamily: FONTS.mono, fontSize: 10, letterSpacing: 1.2, color: tab === k ? c.ink : c.faint, borderBottom: `2px solid ${tab === k ? c.accent : 'transparent'}` }}>{lab}</button>
        ))}
        <button onClick={toggleBest} style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: FONTS.mono, fontSize: 10, letterSpacing: 1, color: bestOn ? c.ink : c.faint }}><Ic.star s={12} c={bestOn ? c.accent : c.faint} fill={bestOn ? c.accent : 'none'} />BEST</button>
      </div>
      <div className="ft-scroll" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
        {opts.map(o => { const on = axis.includes(o.v); return (
          <button key={o.v} onClick={() => toggle(o.v)} style={{ flexShrink: 0, border: `1px solid ${on ? c.accent : c.line}`, background: on ? c.accent : 'transparent', color: on ? c.accentInk : c.muted, cursor: 'pointer', borderRadius: 2, padding: '5px 10px', fontFamily: FONTS.mono, fontSize: 10, letterSpacing: 0.4, whiteSpace: 'nowrap' }}>{o.label}</button>
        ); })}
      </div>
      {chips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8, alignItems: 'center' }}>
          {chips.map(ch => (
            <span key={ch.ax + ch.v} style={{ display: 'flex', alignItems: 'center', gap: 5, background: c.bg2, borderRadius: 2, padding: '3px 5px 3px 9px', fontFamily: FONTS.mono, fontSize: 9.5, color: c.ink }}>
              {ch.l}
              <button onClick={() => setStack(s => ({ ...s, [ch.ax]: s[ch.ax].filter(x => x !== ch.v) }))} style={{ border: 'none', background: 'none', cursor: 'pointer', display: 'flex' }}><Ic.x s={11} c={c.faint} /></button>
            </span>
          ))}
          <button onClick={clear} style={{ border: 'none', background: 'none', cursor: 'pointer', color: c.accentText, fontFamily: FONTS.mono, fontSize: 9, letterSpacing: 0.6 }}>CLEAR ALL</button>
        </div>
      )}
    </div>
  );
}

function AlbumApp({ lens = 'helen', navVariant = 'hybrid', filterMode = 'inplace', bestSurface = 'shelf', demo = {} }) {
  const t = TRAVELERS[lens]; const c = t.pal; const r = t.radius; const cfg = LENS_CFG[lens];
  const [kind, setKind] = React.useState(demo.kind || 'all');
  const [withP, setWithP] = React.useState(demo.withP || null);
  const [query, setQuery] = React.useState('');
  const [stack, setStack] = React.useState({ person: [], day: [], place: [] });
  const [bestOn, setBestOn] = React.useState(!!demo.bestOn);
  const [mode, setMode] = React.useState(cfg.bestDefault || 'trip');
  const [tier, setTier] = React.useState('onDevice');
  const [removed, setRemoved] = React.useState(new Set());
  const [lb, setLb] = React.useState(null);
  const [indexOpen, setIndexOpen] = React.useState(false);
  const [reelOpen, setReelOpen] = React.useState(bestSurface === 'reel' && !!demo.bestOn);
  const [stuckKey, setStuckKey] = React.useState(null);
  const [activeDay, setActiveDay] = React.useState(1);
  const scrollRef = React.useRef(null); const secRefs = React.useRef({});

  const sections = React.useMemo(() => albumSections(), []);
  // apply calm/stack filters
  const filtered = sections.map(sec => {
    let ph = sec.photos;
    if (kind !== 'all') ph = ph.filter(p => (kind === 'video' ? p.kind === 'video' : p.kind === 'photo'));
    if (withP) ph = ph.filter(p => p.people.includes(withP));
    if (query) ph = ph.filter(p => (p.cap || '').toLowerCase().includes(query.toLowerCase()));
    if (cfg.filterModel === 'stack') {
      if (stack.person.length) ph = ph.filter(p => stack.person.some(id => p.people.includes(id) || p.author === id));
      if (stack.day.length) ph = ph.filter(p => stack.day.includes('d' + (sec.day?.n)));
      if (stack.place.length) ph = ph.filter(p => stack.place.includes(sec.loc));
    }
    return { ...sec, photos: ph };
  });
  const active = kind !== 'all' || withP || query || stack.person.length || stack.day.length || stack.place.length;
  const clear = () => { setKind('all'); setWithP(null); setQuery(''); setStack({ person: [], day: [], place: [] }); };
  const visible = filtered.filter(s => s.photos.length);
  const totalPhotos = visible.reduce((n, s) => n + s.photos.length, 0);
  const flat = [].concat(...visible.map(s => s.photos.map(p => ({ p, sec: s }))));
  const openTile = (p, sec) => { const i = flat.findIndex(f => f.p.id === p.id); setLb(Math.max(0, i)); };
  const openFromShelf = (p) => { const i = flat.findIndex(f => f.p.id === p.id); setLb(i < 0 ? 0 : i); };

  const toggleBest = () => { if (bestSurface === 'reel') { setReelOpen(v => !v); } else { setBestOn(v => !v); } };

  const onScroll = () => {
    const st = scrollRef.current?.scrollTop || 0;
    let cur = null;
    visible.forEach(s => { const el = secRefs.current[s.key]; if (el && el.offsetTop <= st + 54) cur = s; });
    if (cur) { setStuckKey(st > (secRefs.current[cur.key]?.offsetTop || 0) + 6 ? cur.key : null); if (cur.day) setActiveDay(cur.day.n); }
  };
  const jump = (key) => { const el = secRefs.current[key]; if (el) scrollRef.current.scrollTo({ top: el.offsetTop - 6, behavior: 'smooth' }); };
  const jumpDay = (n) => { const s = visible.find(v => v.day?.n === n); if (s) jump(s.key); };

  // ── Rafa: warm, no filters, no ranks ──
  if (cfg.filterModel === 'warm') return <RafaAlbum lens={lens} c={c} r={r} cfg={cfg} sections={sections} onOpen={openTile} flat={flat} lb={lb} setLb={setLb} />;

  const showBestFilter = bestSurface === 'filter' && bestOn;
  const bestGrid = showBestFilter ? bestPicks(mode, cfg.bestSelf).filter(p => !removed.has(p.id)) : null;
  const countLine = active
    ? `${totalPhotos} ${withP ? (cfg.lowercase ? 'with ' : 'with ') + displayName(withP, lens).toLowerCase() : cfg.lowercase ? 'match' : 'matching'} · ${visible.filter(s => s.type !== 'loose').length} ${visible.length === 1 ? 'stop' : 'stops'}`
    : `${ALBUM.length} photos across ${sections.filter(s => s.type !== 'loose').length} stops`;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', color: c.ink }}>
      {/* top bar */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '4px 16px 10px' }}>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}><Ic.left s={22} c={c.ink} /></button>
        <span style={{ fontFamily: FONTS.mono, fontSize: 9.5, letterSpacing: 1.2, color: c.faint, textTransform: 'uppercase' }}>Rafa's 5th · New York</span>
        <button style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}><Ic.plus s={20} c={c.ink} /></button>
      </div>
      {/* nav strip (tier 1) — Find (events & places) leads; day-chips scrub */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7, padding: '0 16px 10px' }}>
        {navVariant !== 'indexOnly' && (
          <div className="ft-scroll" style={{ display: 'flex', gap: 6, overflowX: 'auto', flex: 1 }}>
            {TRIP.days.map(d => { const on = activeDay === d.n; return (
              <button key={d.n} onClick={() => jumpDay(d.n)} style={{ flexShrink: 0, border: 'none', cursor: 'pointer', borderRadius: 999, padding: '6px 13px', background: on ? c.ink : c.bg2, color: on ? c.bg : c.muted, fontFamily: FONTS.mono, fontSize: 10, letterSpacing: 0.8, fontWeight: 600 }}>{A_DOW[d.n]}</button>
            ); })}
          </div>
        )}
        {navVariant !== 'chipsOnly' && (
          <button onClick={() => setIndexOpen(true)} style={{ flexShrink: 0, flex: navVariant === 'indexOnly' ? 1 : 'none', justifyContent: navVariant === 'indexOnly' ? 'flex-start' : 'center', border: `1px solid ${c.lineBold}`, cursor: 'pointer', borderRadius: 999, padding: '7px 12px', background: 'transparent', color: c.accentText, fontFamily: FONTS.mono, fontSize: 9.5, letterSpacing: 0.6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.accentText} strokeWidth="1.9" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-3.2-3.2" /></svg>{navVariant === 'indexOnly' ? (cfg.lowercase ? 'find a moment or place' : 'Find a moment or place') : (cfg.lowercase ? 'find' : 'Find')}
          </button>
        )}
      </div>
      {/* filter row (tier 2) */}
      {cfg.filterModel === 'stack'
        ? <AStackFilters c={c} cfg={cfg} kind={kind} setKind={setKind} stack={stack} setStack={setStack} bestOn={bestOn} toggleBest={toggleBest} active={active} clear={clear} />
        : <ACalmFilters c={c} cfg={cfg} lens={lens} kind={kind} setKind={setKind} withP={withP} setWithP={setWithP} bestOn={bestOn} toggleBest={toggleBest} query={query} setQuery={setQuery} active={active} clear={clear} />}

      {/* body */}
      <div ref={scrollRef} onScroll={onScroll} className="ft-scroll" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '0 16px 30px' }}>
        {/* header block (scrolls away) */}
        <div style={{ padding: '14px 0 6px' }}>
          <div style={{ fontFamily: FONTS.fraunces, fontSize: 34, fontWeight: 600, letterSpacing: -0.5, color: c.ink, fontStyle: cfg.lowercase ? 'italic' : 'normal' }}>{cfg.lowercase ? 'photos' : 'Photos'}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: FONTS.mono, fontSize: 10.5, letterSpacing: 0.5, color: c.muted, whiteSpace: 'nowrap' }}>{countLine}</span>
            {!active && <span style={{ fontFamily: FONTS.mono, fontSize: 9.5, color: c.accentText, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>{EMPTY_COPY.arriving[lens]}</span>}
          </div>
        </div>

        {/* best surfaces */}
        {bestSurface === 'shelf' && bestOn && <ABestShelf lens={lens} c={c} r={r} cfg={cfg} tier={tier} setTier={setTier} mode={mode} setMode={setMode} removed={removed} setRemoved={setRemoved} onOpen={openFromShelf} />}
        {showBestFilter && (
          <div style={{ paddingTop: 8 }}>
            <div style={{ fontFamily: FONTS.mono, fontSize: 9.5, color: c.muted, marginBottom: 10, letterSpacing: 0.4 }}>{(PICK_COPY[lens][mode] || PICK_COPY[lens].trip)[tier]}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {bestGrid.map(p => <ATile key={p.id} p={p} c={c} r={r} cfg={cfg} onOpen={() => openFromShelf(p)} />)}
            </div>
          </div>
        )}

        {/* album body */}
        {!showBestFilter && (
          active && filterMode === 'results'
            ? (flat.length ? <div style={{ paddingTop: 6 }}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>{flat.map(({ p }) => <ATile key={p.id} p={p} c={c} r={r} cfg={cfg} showFaces={!!withP} onOpen={() => openTile(p)} />)}</div></div>
              : <AEmpty which={kind === 'video' ? 'noVideos' : 'zeroMatch'} lens={lens} c={c} />)
            : filtered.map(sec => {
              const empty = sec.photos.length === 0;
              return (
                <div key={sec.key} ref={el => (secRefs.current[sec.key] = el)} style={{ marginTop: 6 }}>
                  <ASecHeader sec={sec} c={c} stuck={stuckKey === sec.key} showFaces={!!withP} count={sec.photos.length} />
                  {empty
                    ? <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: c.faint, padding: '4px 0 14px', fontStyle: 'italic' }}>{cfg.lowercase ? '— nothing here —' : '— nothing here —'}</div>
                    : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, padding: '4px 0 16px' }}>
                      {sec.photos.map(p => <ATile key={p.id} p={p} c={c} r={r} cfg={cfg} showFaces={!!withP} onOpen={() => openTile(p, sec)} />)}
                    </div>}
                </div>
              );
            })
        )}
        {/* zero-video honest tail when filtering video with none */}
        {!showBestFilter && active && filterMode !== 'results' && totalPhotos === 0 && <AEmpty which={kind === 'video' ? 'noVideos' : 'zeroMatch'} lens={lens} c={c} />}
      </div>

      {navVariant !== 'chipsOnly' && indexOpen && <AIndexSheet sections={sections} onJump={jump} onClose={() => setIndexOpen(false)} c={c} r={r} />}
      {lb !== null && flat[lb] && <ALightbox flat={flat} i={lb} setI={setLb} lens={lens} c={c} cfg={cfg} onClose={() => setLb(null)} />}
      {reelOpen && <AReel picks={bestPicks(mode, cfg.bestSelf)} lens={lens} c={c} onClose={() => setReelOpen(false)} />}
    </div>
  );
}

// best-of as a story reel (fork option)
function AReel({ picks, lens, c, onClose }) {
  const [i, setI] = React.useState(0);
  React.useEffect(() => { const id = setTimeout(() => setI(x => (x + 1) % picks.length), 2600); return () => clearTimeout(id); }, [i]);
  const p = picks[i];
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0A0A0C', zIndex: 46, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 4, padding: '12px 12px 8px' }}>
        {picks.map((_, idx) => <div key={idx} style={{ flex: 1, height: 3, borderRadius: 2, background: idx <= i ? '#fff' : 'rgba(255,255,255,0.25)' }} />)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 16px 8px' }}>
        <span style={{ fontFamily: FONTS.mono, fontSize: 9.5, letterSpacing: 1.2, color: 'rgba(255,255,255,0.7)' }}>{(PICK_COPY[lens][LENS_CFG[lens].bestDefault] || PICK_COPY[lens].trip).onDevice}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><Ic.x s={20} c="#fff" /></button>
      </div>
      <div style={{ flex: 1, padding: 16 }}><Photo ratio={3 / 4} tint={p.tint} radius={8} grain /></div>
    </div>
  );
}

// Rafa's warm album — big tiles, no ranks, no chips, no filters
function RafaAlbum({ lens, c, r, cfg, sections, onOpen, flat, lb, setLb }) {
  const fun = ALBUM.filter(p => p.people.includes('rafa') || p.kind === 'video').slice(0, 6);
  const [listening, setListening] = React.useState(false);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0, padding: '6px 18px 4px' }}>
        <div style={{ fontFamily: t_font('rafa'), fontSize: 30, fontWeight: 600, color: c.ink }}>My pictures</div>
      </div>
      <div className="ft-scroll" style={{ flex: 1, overflowY: 'auto', padding: '4px 18px 30px' }}>
        {/* voice search — Rafa finds things by saying them out loud */}
        <button onClick={() => setListening(true)} style={{ width: '100%', border: 'none', cursor: 'pointer', borderRadius: r, background: c.accent, color: c.accentInk, display: 'flex', alignItems: 'center', gap: 12, padding: '15px 16px', margin: '6px 0 16px', boxShadow: `0 8px 20px ${c.bg2}` }}>
          <span style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(0,0,0,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic.mic s={24} c={c.accentInk} /></span>
          <span style={{ textAlign: 'left' }}>
            <span style={{ display: 'block', fontFamily: t_font('rafa'), fontSize: 20, fontWeight: 600, lineHeight: 1.1 }}>Find something!</span>
            <span style={{ display: 'block', fontFamily: t_font('rafa'), fontSize: 13, opacity: 0.82 }}>Just say it out loud</span>
          </span>
        </button>
        {/* warm strip */}
        <div style={{ fontFamily: t_font('rafa'), fontSize: 22, fontWeight: 600, color: c.accent, margin: '8px 0 4px' }}>{PICK_COPY.rafa.stripTitle}</div>
        <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: c.muted, marginBottom: 12, letterSpacing: 0.3 }}>{PICK_COPY.rafa.stripSub}</div>
        <div className="ft-scroll" style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
          {fun.map(p => (
            <button key={p.id} onClick={() => onOpen(p)} style={{ width: 150, flexShrink: 0, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
              <div style={{ borderRadius: r, overflow: 'hidden', boxShadow: `0 8px 20px ${c.bg2}` }}>
                <Photo ratio={1} tint={p.tint} radius={0} grain>
                  {p.kind === 'video' && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: 46, height: 46, borderRadius: '50%', background: 'rgba(255,255,255,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic.play s={20} c={c.bg} /></div></div>}
                </Photo>
              </div>
            </button>
          ))}
        </div>
        {/* his day sections, big chunky tiles */}
        {sections.filter(s => s.type !== 'loose').map(sec => (
          <div key={sec.key} style={{ marginTop: 22 }}>
            <div style={{ fontFamily: t_font('rafa'), fontSize: 19, fontWeight: 600, color: c.ink }}>{sec.type === 'place' ? sec.loc : sec.title}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginTop: 10 }}>
              {sec.photos.map(p => (
                <button key={p.id} onClick={() => onOpen(p)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
                  <div style={{ borderRadius: r, overflow: 'hidden' }}><Photo ratio={1} tint={p.tint} radius={0} grain /></div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {listening && <RafaListen c={c} onClose={() => setListening(false)} />}
      {lb !== null && flat[lb] && <ALightbox flat={flat} i={lb} setI={setLb} lens={lens} c={c} cfg={cfg} onClose={() => setLb(null)} />}
    </div>
  );
}

// Rafa's voice-search listening state — warm, judgment-free, example prompts
function RafaListen({ c, onClose }) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: c.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, border: 'none', background: c.bg2, borderRadius: '50%', width: 42, height: 42, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic.x s={20} c={c.ink} /></button>
      <div style={{ width: 116, height: 116, borderRadius: '50%', background: c.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'rafapulse 1.4s ease-in-out infinite' }}><Ic.mic s={52} c={c.accentInk} /></div>
      <div style={{ fontFamily: t_font('rafa'), fontSize: 26, fontWeight: 600, color: c.ink, marginTop: 26 }}>Listening…</div>
      <div style={{ fontFamily: t_font('rafa'), fontSize: 15, color: c.muted, marginTop: 6 }}>try saying…</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginTop: 16, maxWidth: 290 }}>
        {['monster trucks', 'pizza', 'me', 'the train'].map(x => (
          <button key={x} onClick={onClose} style={{ border: 'none', cursor: 'pointer', borderRadius: 999, background: c.bg2, color: c.ink, fontFamily: t_font('rafa'), fontSize: 15, fontWeight: 500, padding: '10px 16px' }}>“{x}”</button>
        ))}
      </div>
    </div>
  );
}
function t_font(id) { return TRAVELERS[id].font.display; }

Object.assign(window, { AlbumApp, AEmpty, AReel });
