// hangout/dirA.jsx — Direction A · "By the Light" (place-led).
// The place and its natural rhythm lead. Time is told by sun, tide and light,
// never a clock of events. Suggestions surface from what the shore is offering.

function A_SunArc({ t, frac = 0.62 }) {
  const p = t.pal; const W = 290, x = 8 + frac * 274, y = 54 - Math.sin(frac * Math.PI) * 44;
  return <svg viewBox={`0 0 ${W} 70`} style={{ width: '100%', height: 'auto', display: 'block' }}>
    <path d="M8 54 A137 46 0 0 1 282 54" fill="none" stroke={p.line} strokeWidth="1.5" />
    <path d={`M8 54 A137 46 0 0 1 ${x} ${y}`} fill="none" stroke={p.accent} strokeWidth="2" strokeLinecap="round" />
    <line x1="8" y1="54" x2="282" y2="54" stroke={p.line} strokeWidth="1" />
    <circle cx={x} cy={y} r="5.5" fill={p.accent} />
    <circle cx={x} cy={y} r="11" fill="none" stroke={p.accent} strokeWidth="1" opacity="0.4" />
    <text x="8" y="66" fill={p.faint} fontFamily={window.HG_FONTS.mono} fontSize="8">5:42</text>
    <text x="248" y="66" fill={p.accentText} fontFamily={window.HG_FONTS.mono} fontSize="8">7:52</text>
  </svg>;
}

function A_Cond({ t, items }) {
  const p = t.pal;
  return <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
    {items.map(([k, v]) => <span key={k} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4,
      whiteSpace: 'nowrap', background: p.surface, border: `1px solid ${p.line}`, borderRadius: 7, padding: '4px 8px' }}>
      <window.HG_Mono s={8} ls={0.5} c={p.faint}>{k}</window.HG_Mono>
      <span style={{ fontSize: 11, fontWeight: 600, color: p.ink }}>{v}</span></span>)}
  </div>;
}

const A_COPY = {
  helen: { kick: 'WELLFLEET · BAY SIDE', title: 'The tide is going out.', sub: 'Hazy sun, the porch is warm. We could just stay — or wander down before it turns.', sug: 'p5', lede: 'The shore is offering' },
  jonathan: { kick: 'INDIAN NECK · DAY 2', title: 'Bay side, holding fair.', sub: 'Low tide 4:40, water 64°, wind light out of the southwest. Good window opening.', sug: 'p3', lede: 'Good right now' },
  aurelia: { kick: 'wellfleet', title: 'golden hour in 40.', sub: 'the light is about to get really good. the pier goes pink around 7:50.', sug: 'p11', lede: 'worth the walk' },
  rafa: { kick: 'THE BEACH', title: 'THE WATER IS WARM!', sub: 'and the crabs are out on the flats right now.', sug: 'p5', lede: 'RIGHT NOW' },
};

function A_Home({ id }) {
  const t = window.HG_T[id]; const p = t.pal; const c = A_COPY[id];
  const sug = window.HG_PANTRY.find((x) => x.id === c.sug);
  const heroTint = id === 'aurelia' ? '#6a5168' : id === 'rafa' ? '#3a7a86' : '#5c7a86';
  return <window.HG_Screen t={t}>
    <div style={{ flex: 1, padding: '6px 16px 0', display: 'flex', flexDirection: 'column', gap: 13, overflow: 'hidden' }}>
      <window.HG_ScreenHead t={t} kicker={c.kick} title={c.title} sub={c.sub} big={id === 'rafa' ? 26 : 22} />
      <div style={{ position: 'relative' }}>
        <window.HG_Photo tint={heroTint} h={132} cap="the view from the porch" round={Math.min(t.radius, 14)} label="VIEW" />
        <div style={{ position: 'absolute', top: 9, right: 10, background: 'rgba(0,0,0,0.42)', backdropFilter: 'blur(4px)',
          borderRadius: 20, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 6, height: 6, borderRadius: 6, background: p.accent }} />
          <span style={{ fontFamily: window.HG_FONTS.mono, fontSize: 9, color: '#fff', letterSpacing: 0.4 }}>SUNSET 7:52</span>
        </div>
      </div>
      <A_Cond t={t} items={[['AIR', '78°'], ['WATER', '64°'], ['TIDE', '↓ out'], ['WIND', 'SW 6']]} />
      <div style={{ background: p.surface, border: `1px solid ${p.line}`, borderRadius: Math.min(t.radius, 14), padding: '10px 13px 6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <window.HG_Mono s={9} c={p.faint}>THE DAY, BY LIGHT</window.HG_Mono>
          <window.HG_Mono s={9} c={p.accentText}>GOLDEN · 40 MIN</window.HG_Mono>
        </div>
        <A_SunArc t={t} frac={0.66} />
      </div>
      <div>
        <window.HG_Rule t={t} accent>{c.lede}</window.HG_Rule>
        <div style={{ marginTop: 9 }}><window.HG_SuggestCard p={sug} t={t} ph={72} /></div>
      </div>
    </div>
    <window.HG_Dock t={t} active={id} />
  </window.HG_Screen>;
}

// b — the "now" rail becomes a conditions / light strip
function A_Now({ id }) {
  const t = window.HG_T[id]; const p = t.pal;
  const beats = [
    ['SUNRISE', '5:42', 'done'], ['LOW TIDE', '4:40', 'soon · flats open'],
    ['GOLDEN HOUR', '7:12', 'in 40 min'], ['SUNSET', '7:52', 'walk to the bay'], ['MOONRISE', '9:30', 'waxing'],
  ];
  return <window.HG_Screen t={t}>
    <div style={{ flex: 1, padding: '8px 18px', display: 'flex', flexDirection: 'column' }}>
      <window.HG_ScreenHead t={t} kicker="RIGHT NOW · BY THE LIGHT" title={id === 'aurelia' ? 'the day, by light' : 'The day, by light'}
        sub="No schedule — just the sun and the water keeping time." />
      <div style={{ background: p.surface, border: `1px solid ${p.line}`, borderRadius: Math.min(t.radius, 16), padding: '14px 16px 4px', marginTop: 14 }}>
        <A_SunArc t={t} frac={0.66} />
      </div>
      <div style={{ marginTop: 18, flex: 1 }}>
        {beats.map(([k, v, note], i) => {
          const now = note.startsWith('in');
          return <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 0', borderTop: i ? `1px solid ${p.line}` : 'none' }}>
            <span style={{ width: 7, height: 7, borderRadius: 7, background: now ? p.accent : p.faint, flexShrink: 0,
              boxShadow: now ? `0 0 0 4px ${p.accent}22` : 'none' }} />
            <span style={{ fontFamily: window.HG_FONTS.mono, fontSize: 13, fontWeight: 700, color: p.ink, width: 52 }}>{v}</span>
            <span style={{ flex: 1 }}><window.HG_Mono s={9.5} c={now ? p.accentText : p.muted}>{k}</window.HG_Mono>
              <div style={{ fontSize: 11.5, color: now ? p.ink : p.faint, marginTop: 2 }}>{note}</div></span>
          </div>;
        })}
      </div>
      <div style={{ fontSize: 11.5, color: p.muted, textAlign: 'center', fontStyle: 'italic', paddingBottom: 6 }}>
        The flats open at low tide — good for Rafa. Pier&rsquo;s best at golden.</div>
    </div>
  </window.HG_Screen>;
}

// c — photos file to the place + the arc of the day's light
function A_Photos({ id }) {
  const t = window.HG_T[id]; const p = t.pal;
  const band = [
    { tint: '#caa86a', t: 'MORNING', cap: 'low fog on the bay' },
    { tint: '#9c8a5a', t: 'MIDDAY', cap: 'Gary the crab' },
    { tint: '#7a6f5a', t: 'AFTERNOON', cap: 'screen door light' },
    { tint: '#b06a4a', t: 'GOLDEN', cap: 'the pier going pink' },
    { tint: '#3e3550', t: 'DUSK', cap: 'porch, last light' },
  ];
  return <window.HG_Screen t={t}>
    <div style={{ flex: 1, padding: '8px 16px', display: 'flex', flexDirection: 'column' }}>
      <window.HG_ScreenHead t={t} kicker="THE COTTAGE · SATURDAY" title={id === 'aurelia' ? 'a day of light' : 'A day of light'}
        sub="No events to file under. Photos lay themselves along the day, sunrise to dusk." />
      <div style={{ marginTop: 14, flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {band.map((b, i) => <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
          <div style={{ width: 54, flexShrink: 0, paddingTop: 2, textAlign: 'right' }}>
            <window.HG_Mono s={8.5} c={i === 3 ? p.accentText : p.faint} ls={0.6}>{b.t}</window.HG_Mono>
          </div>
          <div style={{ flex: 1, borderLeft: `1px solid ${p.line}`, paddingLeft: 12, position: 'relative' }}>
            <span style={{ position: 'absolute', left: -3.5, top: 6, width: 6, height: 6, borderRadius: 6,
              background: i === 3 ? p.accent : p.faint }} />
            <window.HG_Photo tint={b.tint} h={74} cap={b.cap} round={Math.min(t.radius, 10)} />
          </div>
        </div>)}
      </div>
    </div>
  </window.HG_Screen>;
}

// d — look-back: "a day at the house" — one place across the hours
function A_Look({ id }) {
  const t = window.HG_T[id]; const p = t.pal;
  const hours = ['#cdb583', '#b9a26a', '#9a8a64', '#7a6a58', '#4a3f55'];
  return <window.HG_Screen t={t}>
    <div style={{ flex: 1, padding: '8px 16px', display: 'flex', flexDirection: 'column' }}>
      <window.HG_ScreenHead t={t} kicker="ONE DAY · ONE PLACE" title={id === 'aurelia' ? 'a day at the house' : 'A day at the house'}
        sub="The look-back isn't a schedule replayed — it's the light moving across one porch, with what happened there." />
      <div style={{ marginTop: 14, position: 'relative' }}>
        <window.HG_Photo tint="#6a5a4a" h={150} round={Math.min(t.radius, 14)} cap="the same view, all day long" label="WOVEN · 38 FRAMES" />
        <div style={{ position: 'absolute', bottom: 10, left: 12, right: 12, display: 'flex', gap: 4 }}>
          {hours.map((h, i) => <span key={i} style={{ flex: 1, height: 4, borderRadius: 4, background: h, opacity: 0.9 }} />)}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
        {['5:42', '10a', '1p', '4:40', '7:52'].map((h, i) => <span key={i} style={{ flex: 1, textAlign: 'center' }}>
          <window.HG_Mono s={7.5} c={p.faint}>{h}</window.HG_Mono></span>)}
      </div>
      <div style={{ marginTop: 14, flex: 1 }}>
        <window.HG_Rule t={t}>what the house held</window.HG_Rule>
        <div style={{ marginTop: 8 }}>
          {[['helen', 'Morning fog, coffee on the steps. Nobody spoke for an hour.'],
            ['rafa', 'Named a crab Gary. Brought him "home" in a bucket.'],
            ['jonathan', '12 oysters shucked on the deck rail. Lost the afternoon.'],
            ['aurelia', 'The screen door at 4 — that light only happens here.']].map(([who, line]) =>
            <div key={who} style={{ display: 'flex', gap: 10, padding: '9px 0', borderBottom: `1px solid ${p.line}` }}>
              <window.HG_Avatar id={who} size={22} />
              <div style={{ flex: 1, fontSize: 12, lineHeight: 1.4, color: p.ink,
                fontStyle: t.id === 'helen' ? 'italic' : 'normal' }}>{line}</div>
            </div>)}
        </div>
      </div>
      <button style={{ marginTop: 10, width: '100%', padding: '11px', borderRadius: Math.min(t.radius, 14), border: 'none',
        background: p.accent, color: p.accentInk, fontFamily: t.font.body, fontWeight: 700, fontSize: 13 }}>
        Keep this day → the book</button>
    </div>
  </window.HG_Screen>;
}

Object.assign(window, { HG_A_Home: A_Home, HG_A_Now: A_Now, HG_A_Photos: A_Photos, HG_A_Look: A_Look });
