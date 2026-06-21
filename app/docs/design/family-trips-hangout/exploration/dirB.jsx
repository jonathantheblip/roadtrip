// hangout/dirB.jsx — Direction B · "As It Happens" (feed-led).
// A living stream of small moments leads. Who's around and what just happened
// carries the screen. Suggestions weave into the feed when there's a lull.

function B_Presence({ t, viewer, compact }) {
  const p = t.pal;
  return <div style={{ display: 'flex', gap: compact ? 14 : 18, justifyContent: 'space-between' }}>
    {window.HG_ORDER.map((id) => {
      const pr = window.HG_PRESENCE[id]; const live = pr.dotMood === 'live';
      const nm = viewer === 'rafa' ? window.HG_RAFA_NAME[id] : window.HG_T[id].name;
      return <div key={id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
        <div style={{ position: 'relative' }}>
          <window.HG_Avatar id={id} size={compact ? 38 : 34} />
          <span style={{ position: 'absolute', right: -1, bottom: -1, width: 10, height: 10, borderRadius: 10,
            background: live ? p.live : p.good, boxShadow: `0 0 0 2.5px ${p.bg}` }} />
        </div>
        <span style={{ fontFamily: window.HG_FONTS.mono, fontSize: 8, letterSpacing: 0.4, color: p.muted, textTransform: 'uppercase' }}>{nm}</span>
        <span style={{ fontSize: 9, color: p.faint, textAlign: 'center', lineHeight: 1.15 }}>{pr.where}</span>
      </div>;
    })}
  </div>;
}

const B_COPY = {
  helen: { title: 'Right now', sub: 'Everyone&rsquo;s scattered around the cottage. Here&rsquo;s what&rsquo;s landing.' },
  jonathan: { title: 'The roster', sub: 'Four people, four corners of the property. Latest in.' },
  aurelia: { title: 'as it happens', sub: 'little things, as everyone drops them.' },
  rafa: { title: "WHO'S HERE", sub: 'tap to see what everybody is doing!' },
};

function B_Home({ id }) {
  const t = window.HG_T[id]; const p = t.pal; const c = B_COPY[id];
  const feed = window.HG_MOMENTS.slice(0, id === 'rafa' ? 3 : 4);
  const sug = window.HG_PANTRY.find((x) => x.id === 'p13'); // drive-in, woven in
  return <window.HG_Screen t={t}>
    <div style={{ flex: 1, padding: '6px 16px 0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <window.HG_ScreenHead t={t} kicker="THE COTTAGE · LIVE" title={c.title}
        sub={<span dangerouslySetInnerHTML={{ __html: c.sub }} />} big={id === 'rafa' ? 25 : 22} />
      <div style={{ background: p.surface, border: `1px solid ${p.line}`, borderRadius: Math.min(t.radius, 16),
        padding: '13px 14px', marginTop: 12 }}>
        <B_Presence t={t} viewer={id} compact={id === 'rafa'} />
      </div>
      <div style={{ marginTop: 8, flex: 1, overflow: 'hidden' }}>
        <window.HG_Rule t={t}>just now</window.HG_Rule>
        {feed.slice(0, 2).map((m) => <window.HG_MomentRow key={m.id} m={m} t={t} viewer={id} />)}
        {/* a suggestion, woven in where the feed lulls */}
        <div style={{ display: 'flex', gap: 10, padding: '11px 0', borderBottom: `1px solid ${p.line}` }}>
          <span style={{ width: 26, height: 26, borderRadius: 26, flexShrink: 0, background: p.accent,
            color: p.accentInk, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>✦</span>
          <div style={{ flex: 1 }}>
            <window.HG_Mono s={8.5} c={p.accentText}>A QUIET STRETCH · MAYBE</window.HG_Mono>
            <div style={{ fontSize: 12.5, color: p.ink, marginTop: 4, lineHeight: 1.35, fontWeight: 500 }}>
              {sug.title} is on tonight. Gates at 7:30 — good for all of you.</div>
            <div style={{ marginTop: 6, display: 'flex', gap: 7 }}>
              <span style={{ fontSize: 11, padding: '4px 11px', borderRadius: 20, background: p.accent, color: p.accentInk, fontWeight: 600 }}>Let&rsquo;s go</span>
              <span style={{ fontSize: 11, padding: '4px 11px', borderRadius: 20, border: `1px solid ${p.lineBold}`, color: p.muted }}>Not now</span>
            </div>
          </div>
        </div>
        {feed.slice(2, 3).map((m) => <window.HG_MomentRow key={m.id} m={m} t={t} viewer={id} />)}
      </div>
    </div>
    <window.HG_Dock t={t} active={id} />
  </window.HG_Screen>;
}

// b — the "now" rail becomes a presence rail
function B_Now({ id }) {
  const t = window.HG_T[id]; const p = t.pal;
  return <window.HG_Screen t={t}>
    <div style={{ flex: 1, padding: '8px 18px', display: 'flex', flexDirection: 'column' }}>
      <window.HG_ScreenHead t={t} kicker="RIGHT NOW · WHO'S AROUND" title={id === 'aurelia' ? 'who\u2019s around' : 'Who\u2019s around'}
        sub="No next event to count down to. Just where everyone is this minute." />
      <div style={{ marginTop: 12, flex: 1 }}>
        {window.HG_ORDER.map((pid, i) => <div key={pid} style={{ borderTop: i ? `1px solid ${p.line}` : `1px solid ${p.line}` }}>
          <window.HG_PresenceRow id={pid} t={t} viewer={id} /></div>)}
      </div>
      <div style={{ background: p.surface, border: `1px solid ${p.line}`, borderRadius: Math.min(t.radius, 14), padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div><window.HG_Mono s={9} c={p.accentText}>EVERYONE&rsquo;S CLOSE</window.HG_Mono>
            <div style={{ fontSize: 12.5, color: p.ink, marginTop: 3 }}>Want to pull them together?</div></div>
          <span style={{ fontSize: 12, padding: '7px 13px', borderRadius: 20, background: p.accent, color: p.accentInk, fontWeight: 700 }}>Ping all</span>
        </div>
      </div>
    </div>
  </window.HG_Screen>;
}

// c — the feed IS the photos: one ambient stream, grouped loosely, tagged by who's in
function B_Photos({ id }) {
  const t = window.HG_T[id]; const p = t.pal;
  const groups = [
    { h: 'THIS MORNING', items: [
      { tint: '#caa86a', cap: 'low fog', who: ['helen'] },
      { tint: '#9c8a5a', cap: 'Gary', who: ['rafa'] },
      { tint: '#7e8a6a', cap: 'pancakes', who: ['rafa', 'jonathan'] } ] },
    { h: 'THIS AFTERNOON', items: [
      { tint: '#6e5b49', cap: 'screen door', who: ['aurelia'] },
      { tint: '#54616a', cap: 'tide out', who: ['rafa', 'aurelia'] },
      { tint: '#7a6038', cap: 'oysters', who: ['jonathan'] },
      { tint: '#8a6a4a', cap: 'the long nap', who: ['helen'] } ] },
  ];
  return <window.HG_Screen t={t}>
    <div style={{ flex: 1, padding: '8px 16px', display: 'flex', flexDirection: 'column' }}>
      <window.HG_ScreenHead t={t} kicker="EVERYONE'S FRAMES" title={id === 'aurelia' ? 'as it happened' : 'As it happened'}
        sub="No stops to sort into. Just the day, in order, tagged by who&rsquo;s in the frame." />
      <div style={{ marginTop: 12, flex: 1, overflow: 'hidden' }}>
        {groups.map((g) => <div key={g.h} style={{ marginBottom: 14 }}>
          <window.HG_Rule t={t}>{g.h}</window.HG_Rule>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginTop: 9 }}>
            {g.items.map((it, i) => <div key={i} style={{ position: 'relative' }}>
              <window.HG_Photo tint={it.tint} h={84} cap={it.cap} round={Math.min(t.radius, 10)} />
              <div style={{ position: 'absolute', top: 6, right: 6 }}><window.HG_FaceRow ids={it.who} size={17} /></div>
            </div>)}
          </div>
        </div>)}
      </div>
    </div>
  </window.HG_Screen>;
}

// d — look-back: the day's feed distilled into the Weave (moments, not stops)
function B_Look({ id }) {
  const t = window.HG_T[id]; const p = t.pal;
  const beats = [
    { who: 'jonathan', kind: 'LOG', body: '12 oysters · 1 nap · 0 plans', verb: 'Dad tracked' },
    { who: 'helen', kind: 'WORDS', body: 'Nobody knew what day it was. Good.', verb: 'Mom kept' },
    { who: 'aurelia', kind: 'FRAME', body: 'the screen door at 4pm', tint: '#6e5b49', verb: 'Aurelia shot' },
    { who: 'rafa', kind: 'VOICE', body: '"His name is Gary and he is my best friend."', verb: 'Rafa said' },
  ];
  return <window.HG_Screen t={t}>
    <div style={{ flex: 1, padding: '8px 16px', display: 'flex', flexDirection: 'column' }}>
      <window.HG_ScreenHead t={t} kicker="SATURDAY · WOVEN" title={id === 'aurelia' ? 'the day, braided' : 'The day, braided'}
        sub="No events to replay. The four of you, braided into one page of a do-nothing day." />
      <div style={{ marginTop: 14, flex: 1, position: 'relative' }}>
        <div style={{ position: 'absolute', left: 14, top: 6, bottom: 6, width: 2, background: p.line }} />
        {beats.map((b, i) => {
          const who = window.HG_T[b.who];
          return <div key={i} style={{ display: 'flex', gap: 14, position: 'relative', paddingBottom: 14 }}>
            <div style={{ width: 30, flexShrink: 0, display: 'flex', justifyContent: 'center', zIndex: 1 }}>
              <window.HG_Avatar id={b.who} size={30} /></div>
            <div style={{ flex: 1, background: p.surface, border: `1px solid ${p.line}`, borderRadius: Math.min(t.radius, 12),
              padding: '10px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <window.HG_Mono s={8} c={who.dot}>{b.verb}</window.HG_Mono>
                <window.HG_Mono s={8} c={p.faint}>{b.kind}</window.HG_Mono>
              </div>
              {b.kind === 'FRAME'
                ? <div style={{ marginTop: 7 }}><window.HG_Photo tint={b.tint} h={68} cap={b.body} round={8} /></div>
                : <div style={{ fontSize: b.kind === 'LOG' ? 12 : 13, marginTop: 6, lineHeight: 1.35, color: p.ink,
                    fontFamily: b.kind === 'LOG' ? window.HG_FONTS.mono : (b.kind === 'WORDS' ? t.font.display : t.font.body),
                    fontStyle: (b.kind === 'WORDS' || b.kind === 'VOICE') ? 'italic' : 'normal',
                    letterSpacing: b.kind === 'LOG' ? 0.4 : 0 }}>{b.body}</div>}
            </div>
          </div>;
        })}
      </div>
      <button style={{ width: '100%', padding: '11px', borderRadius: Math.min(t.radius, 14), border: 'none',
        background: p.accent, color: p.accentInk, fontFamily: t.font.body, fontWeight: 700, fontSize: 13 }}>
        Save to Team RAHJ</button>
    </div>
  </window.HG_Screen>;
}

Object.assign(window, { HG_B_Home: B_Home, HG_B_Now: B_Now, HG_B_Photos: B_Photos, HG_B_Look: B_Look });
