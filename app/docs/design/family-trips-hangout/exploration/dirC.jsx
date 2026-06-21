// hangout/dirC.jsx — Direction C · "We Could…" (pantry-led).
// The home is a tray of pre-scoped, family-tagged possibilities you deal when
// someone's restless. Nothing is scheduled; tapping a card just says "let's go."

const C_CHIPS = [
  ['meal', 'A bite'], ['energy', 'Burn energy'], ['look', 'For Aurelia'], ['together', 'All of us'],
];
// which cards each lens leads with, and the lit chip
const C_LEAD = {
  helen: { chip: null, cards: ['p1', 'p14', 'p10'], title: 'We could\u2026', sub: 'Nothing&rsquo;s planned. Here&rsquo;s what&rsquo;s nearby and ready, whenever someone asks.' },
  jonathan: { chip: 'meal', cards: ['p3', 'p1', 'p4'], title: 'Provisions', sub: 'Scoped, timed, close. Pick one and I&rsquo;ll drop a pin.' },
  aurelia: { chip: 'look', cards: ['p9', 'p11', 'p12'], title: 'we could\u2026', sub: 'the pretty stuff, already found. for when you&rsquo;re bored of the porch.' },
  rafa: { chip: 'energy', cards: ['p5', 'p6'], title: 'LET\u2019S GO!', sub: 'big places to run around RIGHT NOW' },
};

// who-it's-for filter: passes if the item is good for anyone in the selection.
// Groups are computed from forIds (kids = Aurelia+Rafa, adults = the parents).
const C_WHO = { helen: 'all', jonathan: 'adults', aurelia: 'aurelia', rafa: 'rafa' };

function C_Who({ t, active }) {
  const p = t.pal;
  const groups = [['all', 'Everyone'], ['kids', 'Kids'], ['adults', 'Adults']];
  return <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
    {groups.map(([k, lbl]) => { const on = k === active;
      return <span key={k} style={{ fontSize: 11, fontWeight: 700, padding: '6px 9px', borderRadius: 20,
        whiteSpace: 'nowrap', fontFamily: t.font.body, flexShrink: 0,
        background: on ? p.accent : p.surface, color: on ? p.accentInk : p.muted,
        border: `1px solid ${on ? p.accent : p.line}` }}>{lbl}</span>; })}
    <span style={{ width: 1, height: 18, background: p.line, margin: '0 1px', flexShrink: 0 }} />
    {window.HG_ORDER.map((pid) => { const on = pid === active;
      return <span key={pid} style={{ flexShrink: 0, borderRadius: 22, padding: 1.5,
        background: on ? p.accent : 'transparent' }}>
        <window.HG_Avatar id={pid} size={on ? 22 : 21} /></span>; })}
  </div>;
}

function C_Chips({ t, active }) {
  const p = t.pal;
  return <div style={{ display: 'flex', gap: 7, overflow: 'hidden' }}>
    {C_CHIPS.map(([k, lbl]) => {
      const on = k === active;
      return <span key={k} style={{ fontSize: 11, fontWeight: 600, padding: '6px 12px', borderRadius: 20,
        whiteSpace: 'nowrap', fontFamily: t.font.body,
        background: on ? p.accent : p.surface, color: on ? p.accentInk : p.muted,
        border: `1px solid ${on ? p.accent : p.line}` }}>{lbl}</span>;
    })}
  </div>;
}

function C_Home({ id }) {
  const t = window.HG_T[id]; const p = t.pal; const c = C_LEAD[id];
  const cards = c.cards.map((cid) => window.HG_PANTRY.find((x) => x.id === cid));
  const big = id === 'rafa';
  return <window.HG_Screen t={t}>
    <div style={{ flex: 1, padding: '6px 16px 0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <window.HG_ScreenHead t={t} kicker="WELLFLEET · SATURDAY" title={c.title}
        sub={<span dangerouslySetInnerHTML={{ __html: c.sub }} />} big={big ? 30 : 23} />
      <div style={{ marginTop: 12, marginBottom: 9 }}>
        <div style={{ marginBottom: 8 }}><window.HG_Mono s={9} c={p.faint}>WHO&rsquo;S IT FOR</window.HG_Mono></div>
        <C_Who t={t} active={C_WHO[id]} />
      </div>
      <div style={{ marginBottom: 12 }}><C_Chips t={t} active={c.chip} /></div>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {big
          ? cards.map((s) => <button key={s.id} style={{ all: 'unset', cursor: 'pointer', flex: 1, position: 'relative',
              borderRadius: 22, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
              minHeight: 0, background: `repeating-linear-gradient(135deg, ${window.HG_shade(s.tint, 18)} 0 11px, ${window.HG_shade(s.tint, -12)} 11px 22px)` }}>
              <div style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.6))', padding: '24px 16px 14px' }}>
                <div style={{ fontFamily: t.font.display, fontWeight: 600, fontSize: 24, color: '#fff' }}>{s.title}</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)', marginTop: 3 }}>{s.blurb.split('.')[0]}.</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9 }}>
                  <window.HG_FaceRow ids={s.forIds} size={22} />
                  <span style={{ fontFamily: window.HG_FONTS.mono, fontSize: 10, color: '#fff', marginLeft: 'auto',
                    background: 'rgba(255,255,255,0.18)', padding: '4px 10px', borderRadius: 20 }}>{s.when}</span>
                </div>
              </div>
            </button>)
          : cards.map((s) => <window.HG_SuggestCard key={s.id} p={s} t={t} ph={id === 'jonathan' ? 64 : 76} />)}
      </div>
      <div style={{ textAlign: 'center', padding: '10px 0 4px' }}>
        <window.HG_Mono s={9} c={p.faint}>14 IDEAS SCOPED NEARBY · NONE ON THE CLOCK</window.HG_Mono>
      </div>
    </div>
    <window.HG_Dock t={t} active={id} />
  </window.HG_Screen>;
}

// b — the "now" rail becomes a soft "want to…?" nudge strip
function C_Now({ id }) {
  const t = window.HG_T[id]; const p = t.pal;
  const nudges = id === 'rafa'
    ? [{ sug: 'p5', why: 'YOU&rsquo;VE BEEN INSIDE A WHILE', line: 'The crabs are out and the water&rsquo;s warm.' },
       { sug: 'p7', why: 'WIGGLES?', line: 'The playground by the pier is open.' }]
    : [{ sug: 'p5', why: 'RAFA&rsquo;S BEEN INSIDE 2 HRS', line: 'Bay flats are 4 min away and the tide just turned — perfect for him.' },
       { sug: 'p1', why: 'IT&rsquo;S NEARLY NOON', line: 'Mac&rsquo;s line is short right now. Lobster rolls for the table.' }];
  return <window.HG_Screen t={t}>
    <div style={{ flex: 1, padding: '8px 18px', display: 'flex', flexDirection: 'column' }}>
      <window.HG_ScreenHead t={t} kicker="RIGHT NOW · A NUDGE OR TWO" title={id === 'aurelia' ? 'want to\u2026?' : 'Want to\u2026?'}
        sub="Not a plan — just well-timed ideas from the tray, when the moment&rsquo;s right." />
      <div style={{ marginTop: 16, flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {nudges.map((n, i) => {
          const s = window.HG_PANTRY.find((x) => x.id === n.sug);
          return <div key={i} style={{ background: p.surface, border: `1px solid ${i === 0 ? p.lineBold : p.line}`,
            borderRadius: Math.min(t.radius, 18), overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: 12, padding: 12 }}>
              <div style={{ width: 60, height: 60, flexShrink: 0, borderRadius: Math.min(t.radius, 12),
                background: `repeating-linear-gradient(135deg, ${window.HG_shade(s.tint, 16)} 0 8px, ${window.HG_shade(s.tint, -12)} 8px 16px)` }} />
              <div style={{ flex: 1 }}>
                <window.HG_Mono s={8.5} c={p.accentText}><span dangerouslySetInnerHTML={{ __html: n.why }} /></window.HG_Mono>
                <div style={{ fontFamily: t.font.display, fontWeight: 600, fontSize: 15, color: p.ink, marginTop: 4,
                  fontStyle: t.id === 'aurelia' ? 'italic' : 'normal' }}>{s.title}</div>
                <div style={{ fontSize: 11.5, color: p.muted, marginTop: 3, lineHeight: 1.35 }}
                  dangerouslySetInnerHTML={{ __html: n.line }} />
              </div>
            </div>
            <div style={{ display: 'flex', borderTop: `1px solid ${p.line}` }}>
              <button style={{ flex: 1, padding: '11px', border: 'none', background: p.accent, color: p.accentInk,
                fontFamily: t.font.body, fontWeight: 700, fontSize: 13 }}>Let&rsquo;s go →</button>
              <button style={{ flex: 0.5, padding: '11px', border: 'none', background: 'transparent', color: p.muted,
                fontFamily: t.font.body, fontWeight: 500, fontSize: 13 }}>Later</button>
            </div>
          </div>;
        })}
      </div>
      <div style={{ fontSize: 11, color: p.faint, textAlign: 'center', fontStyle: 'italic', paddingBottom: 4 }}>
        Quiet by default. A nudge only when something&rsquo;s genuinely well-timed.</div>
    </div>
  </window.HG_Screen>;
}

// c — photos flow ambiently, each able to link back to the pick it came from
function C_Photos({ id }) {
  const t = window.HG_T[id]; const p = t.pal;
  const stream = [
    { tint: '#9c8a5a', cap: 'Gary', from: null, who: ['rafa'] },
    { tint: '#5a7a6a', cap: 'the flats', from: 'Bay flats at low tide', who: ['rafa', 'aurelia'] },
    { tint: '#7a6038', cap: 'a dozen down', from: 'The Beachcomber', who: ['jonathan'] },
    { tint: '#3e3550', cap: 'double feature', from: 'Wellfleet Drive-In', who: ['helen', 'rafa', 'aurelia', 'jonathan'] },
  ];
  return <window.HG_Screen t={t}>
    <div style={{ flex: 1, padding: '8px 16px', display: 'flex', flexDirection: 'column' }}>
      <window.HG_ScreenHead t={t} kicker="SATURDAY · EVERYONE" title={id === 'aurelia' ? 'the day, loose' : 'The day, loose'}
        sub="Photos just flow. The ones that came from a pick quietly remember where you went." />
      <div style={{ marginTop: 14, flex: 1, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
        {stream.map((s, i) => <div key={i} style={{ position: 'relative' }}>
          <window.HG_Photo tint={s.tint} h={i === 0 ? 96 : 86} cap={s.cap} round={Math.min(t.radius, 12)} />
          <div style={{ position: 'absolute', top: 8, right: 8 }}><window.HG_FaceRow ids={s.who} size={18} /></div>
          {s.from && <div style={{ position: 'absolute', left: 8, bottom: 8, background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(3px)', borderRadius: 20, padding: '3px 9px', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 5, height: 5, borderRadius: 5, background: p.accent }} />
            <span style={{ fontFamily: window.HG_FONTS.mono, fontSize: 8.5, color: '#fff', letterSpacing: 0.3 }}>FROM · {s.from.toUpperCase()}</span>
          </div>}
        </div>)}
      </div>
    </div>
  </window.HG_Screen>;
}

// d — look-back: "what we ended up doing" — the picks that became the trip
function C_Look({ id }) {
  const t = window.HG_T[id]; const p = t.pal;
  const played = [
    { sug: 'p2', who: ['helen', 'aurelia'], note: 'Croissants on the steps before anyone else woke up.' },
    { sug: 'p5', who: ['rafa', 'aurelia'], note: 'Two hours. A bucket of crabs. One named Gary.' },
    { sug: 'p3', who: ['jonathan', 'helen'], note: 'A dozen oysters as the band started up.' },
    { sug: 'p13', who: ['helen', 'jonathan', 'aurelia', 'rafa'], note: 'All four in the back of the car. Rafa made it to the credits.' },
  ];
  return <window.HG_Screen t={t}>
    <div style={{ flex: 1, padding: '8px 16px', display: 'flex', flexDirection: 'column' }}>
      <window.HG_ScreenHead t={t} kicker="SATURDAY · UNPLANNED" title={id === 'aurelia' ? 'what we ended up doing' : 'What we ended up doing'}
        sub="No itinerary to replay — just the handful of ideas you actually reached for, in order." />
      <div style={{ marginTop: 14, flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 19, top: 8, bottom: 8, width: 2, background: p.line }} />
        {played.map((pl, i) => {
          const s = window.HG_PANTRY.find((x) => x.id === pl.sug);
          return <div key={i} style={{ display: 'flex', gap: 13, position: 'relative', paddingBottom: 13 }}>
            <div style={{ width: 40, flexShrink: 0, display: 'flex', justifyContent: 'center', zIndex: 1, paddingTop: 4 }}>
              <span style={{ width: 11, height: 11, borderRadius: 11, background: p.accent, boxShadow: `0 0 0 4px ${p.bg}` }} /></div>
            <div style={{ flex: 1, display: 'flex', gap: 11, background: p.surface, border: `1px solid ${p.line}`,
              borderRadius: Math.min(t.radius, 12), padding: 10 }}>
              <div style={{ width: 46, height: 46, flexShrink: 0, borderRadius: Math.min(t.radius, 9),
                background: `repeating-linear-gradient(135deg, ${window.HG_shade(s.tint, 16)} 0 7px, ${window.HG_shade(s.tint, -12)} 7px 14px)` }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: t.font.display, fontWeight: 600, fontSize: 13.5, color: p.ink,
                    fontStyle: t.id === 'aurelia' ? 'italic' : 'normal' }}>{s.title}</span>
                  <window.HG_FaceRow ids={pl.who} size={16} />
                </div>
                <div style={{ fontSize: 11.5, color: p.muted, marginTop: 3, lineHeight: 1.35 }}>{pl.note}</div>
              </div>
            </div>
          </div>;
        })}
      </div>
      <div style={{ fontSize: 11.5, color: p.muted, textAlign: 'center', fontStyle: 'italic', paddingBottom: 8 }}>
        Four ideas, dealt as you wanted them. That was the whole trip.</div>
    </div>
  </window.HG_Screen>;
}

Object.assign(window, { HG_C_Home: C_Home, HG_C_Now: C_Now, HG_C_Photos: C_Photos, HG_C_Look: C_Look });
