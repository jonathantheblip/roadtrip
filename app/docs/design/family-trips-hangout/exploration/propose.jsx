// hangout/propose.jsx — the cross-cutting decision mechanic.
// Location + time surface options (esp. MEALS, the daily kick-the-can), and
// ANYONE — including Aurelia — can find one and propose it to the deciders.

// ── small meal option row, proximity + "suggest" affordance ──────
function MealCard({ s, t, dist, note, primary }) {
  const p = t.pal;
  return <div style={{ background: p.surface, border: `1px solid ${primary ? p.lineBold : p.line}`,
    borderRadius: Math.min(t.radius, 14), overflow: 'hidden' }}>
    <div style={{ display: 'flex', gap: 11, padding: 11 }}>
      <div style={{ width: 52, height: 52, flexShrink: 0, borderRadius: Math.min(t.radius, 10),
        background: `repeating-linear-gradient(135deg, ${window.HG_shade(s.tint, 16)} 0 7px, ${window.HG_shade(s.tint, -12)} 7px 14px)` }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontFamily: t.font.display, fontWeight: 600, fontSize: 14, color: p.ink,
            fontStyle: t.id === 'aurelia' ? 'italic' : 'normal' }}>{s.title}</span>
          <window.HG_Mono s={9} c={p.accentText} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{dist}</window.HG_Mono>
        </div>
        <div style={{ fontSize: 11, color: p.muted, marginTop: 3, lineHeight: 1.3 }}>{note}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <window.HG_FaceRow ids={s.forIds} size={16} />
          <span style={{ fontSize: 10.5, fontWeight: 700, fontFamily: t.font.body, padding: '4px 12px',
            borderRadius: 20, background: primary ? p.accent : 'transparent', color: primary ? p.accentInk : p.accentText,
            border: primary ? 'none' : `1px solid ${p.lineBold}` }}>Suggest →</span>
        </div>
      </div>
    </div>
  </div>;
}

// a · time + location surfaces the meal options (Jonathan / ops-forward)
// a · OPEN-TIME options, surfaced by where you are + when. This is the only
// place the decide-together loop operates. Booked plans are shown but fixed
// (not a vote); surprises never appear here at all (masked), so it can't spoil.
function P_Surface({ id }) {
  const t = window.HG_T[id]; const p = t.pal; const P = window.HG_PANTRY;
  const macs = P.find((x) => x.id === 'p1'), comber = P.find((x) => x.id === 'p3'), pb = P.find((x) => x.id === 'p2');
  const segs = [['eat', 'Eat'], ['do', 'Do'], ['burn', 'Burn energy'], ['treat', 'Treat']];
  return <window.HG_Screen t={t}>
    <div style={{ flex: 1, padding: '8px 16px', display: 'flex', flexDirection: 'column' }}>
      <window.HG_ScreenHead t={t} kicker="11:40 AM · INDIAN NECK · OPEN TIME" title={id === 'aurelia' ? 'what now?' : 'What now?'}
        sub="Any open call — a meal, an hour to kill, somewhere to land. Surfaced by where you are; anyone proposes; you decide." />
      <div style={{ display: 'flex', gap: 6, marginTop: 12, marginBottom: 12 }}>
        {segs.map(([k, lbl]) => { const on = k === 'eat';
          return <span key={k} style={{ flex: 1, textAlign: 'center', fontSize: 10.5, fontWeight: 700, fontFamily: t.font.body,
            padding: '7px 4px', borderRadius: 20, whiteSpace: 'nowrap',
            background: on ? p.accent : p.surface, color: on ? p.accentInk : p.muted, border: `1px solid ${on ? p.accent : p.line}` }}>{lbl}</span>; })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
        <window.HG_Mono s={9} c={p.accentText}>OPEN · PICK OR PROPOSE</window.HG_Mono>
        <span style={{ flex: 1, height: 1, background: p.line }} /></div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9 }}>
        <MealCard s={macs} t={t} dist="6 MIN" note="Counter, no wait yet. Open till 8. Everyone eats." primary />
        <MealCard s={comber} t={t} dist="10 MIN" note="Deck opens at noon — oysters, a view, slower." />
        <MealCard s={pb} t={t} dist="8 MIN" note="Sandwiches till 3. Quiet, quick, Aurelia-approved." />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0 8px' }}>
        <window.HG_Mono s={9} c={p.faint}>ALREADY SET · NOT A VOTE</window.HG_Mono>
        <span style={{ flex: 1, height: 1, background: p.line }} /></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '4px 2px' }}>
        <span style={{ width: 30, height: 30, borderRadius: Math.min(t.radius, 8), flexShrink: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center', background: p.surface, border: `1px solid ${p.line}`, color: p.faint }}>
          <svg width="12" height="13" viewBox="0 0 12 13" fill="none" stroke="currentColor" strokeWidth="1.3">
            <rect x="2.5" y="5.5" width="7" height="5.5" rx="1" fill="currentColor" stroke="none" opacity="0.5" />
            <path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" /></svg></span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: p.ink }}>Drive-in · tonight</div>
          <window.HG_Mono s={8} c={p.faint}>BOOKED · GATES 7:30 · FIXED</window.HG_Mono>
        </div>
        <window.HG_Mono s={8.5} c={p.faint}>SHOWN, NOT VOTED</window.HG_Mono>
      </div>
      <div style={{ fontSize: 10.5, color: p.faint, textAlign: 'center', fontStyle: 'italic', padding: '11px 0 2px', lineHeight: 1.4 }}>
        Only open time lives here. Booked plans are fixed; surprises stay hidden — nothing to vote on, nothing to spoil.</div>
    </div>
  </window.HG_Screen>;
}

// b · Aurelia finds one and proposes it to the deciders
function P_Propose({ id }) {
  const t = window.HG_T.aurelia; const p = t.pal; // always shown in Aurelia's lens
  const s = window.HG_PANTRY.find((x) => x.id === 'p1');
  const recips = [['helen', 'Helen', true], ['jonathan', 'Dad', true], ['rafa', 'Rafa', false]];
  return <window.HG_Screen t={t}>
    <div style={{ flex: 1, padding: '8px 16px', display: 'flex', flexDirection: 'column' }}>
      <window.HG_ScreenHead t={t} kicker="SUGGEST A SPOT" title="send it to them"
        sub="She doesn&rsquo;t decide — but she can put it in front of the people who do." />
      <div style={{ marginTop: 14, borderRadius: Math.min(t.radius, 14), overflow: 'hidden', border: `1px solid ${p.line}` }}>
        <window.HG_Photo tint={s.tint} h={92} cap="Mac's Shack · 6 min · open" label="HER PICK" round={0} />
      </div>
      <div style={{ marginTop: 16 }}><window.HG_Mono s={9} c={p.faint}>SEND TO</window.HG_Mono></div>
      <div style={{ display: 'flex', gap: 8, marginTop: 9 }}>
        {recips.map(([rid, lbl, on]) => <span key={rid} style={{ display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: '7px 12px 7px 7px', borderRadius: 22, background: on ? p.raise : 'transparent',
          border: `1px solid ${on ? p.accent : p.line}` }}>
          <window.HG_Avatar id={rid} size={20} />
          <span style={{ fontSize: 12, fontWeight: 600, color: on ? p.ink : p.muted }}>{lbl}</span>
          {on && <span style={{ color: p.accent, fontSize: 11 }}>✓</span>}</span>)}
      </div>
      <div style={{ marginTop: 16 }}><window.HG_Mono s={9} c={p.faint}>A NOTE (OPTIONAL)</window.HG_Mono></div>
      <div style={{ marginTop: 8, background: p.surface, border: `1px solid ${p.line}`, borderRadius: Math.min(t.radius, 12),
        padding: '12px 13px', fontFamily: t.font.display, fontStyle: 'italic', fontSize: 14, color: p.ink, lineHeight: 1.4 }}>
        can we do Mac&rsquo;s? i&rsquo;m starving and it&rsquo;s right there<span style={{ opacity: 0.5 }}>|</span></div>
      <div style={{ flex: 1 }} />
      <button style={{ width: '100%', padding: '13px', borderRadius: Math.min(t.radius, 14), border: 'none',
        background: p.accent, color: p.accentInk, fontFamily: t.font.body, fontWeight: 700, fontSize: 14 }}>
        Send it →</button>
      <div style={{ fontSize: 11, color: p.faint, textAlign: 'center', fontStyle: 'italic', paddingTop: 10 }}>
        Lands as a suggestion, not a booking. They still call it.</div>
    </div>
  </window.HG_Screen>;
}

// c · Helen / Jonathan receive the proposal and decide
function P_Incoming({ id }) {
  const t = window.HG_T[id]; const p = t.pal;
  const s = window.HG_PANTRY.find((x) => x.id === 'p1');
  return <window.HG_Screen t={t}>
    <div style={{ flex: 1, padding: '8px 16px', display: 'flex', flexDirection: 'column' }}>
      <window.HG_ScreenHead t={t} kicker="A SUGGESTION CAME IN" title={id === 'aurelia' ? 'from Aurelia' : 'From Aurelia'}
        sub="The idea came from her. The call is still yours." />
      <div style={{ marginTop: 14, background: p.surface, border: `1px solid ${p.lineBold}`, borderRadius: Math.min(t.radius, 16), overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 13px', borderBottom: `1px solid ${p.line}` }}>
          <window.HG_Avatar id="aurelia" size={28} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, color: p.ink }}><b>Aurelia</b> suggests a spot</div>
            <window.HG_Mono s={8.5} c={p.faint}>11:42 AM · 6 MIN AWAY · OPEN</window.HG_Mono>
          </div>
        </div>
        <window.HG_Photo tint={s.tint} h={104} cap="Mac's Shack" round={0} />
        <div style={{ padding: '12px 14px' }}>
          <div style={{ fontFamily: t.font.display, fontWeight: 600, fontSize: 17, color: p.ink }}>{s.title}</div>
          <div style={{ fontSize: 12.5, color: p.muted, marginTop: 4, fontStyle: 'italic', lineHeight: 1.4,
            fontFamily: t.font.display }}>&ldquo;can we do Mac&rsquo;s? i&rsquo;m starving and it&rsquo;s right there&rdquo;</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10 }}>
            <window.HG_Mono s={8} c={p.faint}>ALSO IN</window.HG_Mono>
            <window.HG_FaceRow ids={['rafa']} size={18} />
            <span style={{ fontSize: 11, color: p.muted }}>Rafa&rsquo;s already asking</span>
          </div>
        </div>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', gap: 9 }}>
        <button style={{ flex: 1.4, padding: '13px', borderRadius: Math.min(t.radius, 14), border: 'none',
          background: p.accent, color: p.accentInk, fontFamily: t.font.body, fontWeight: 700, fontSize: 14 }}>Let&rsquo;s go</button>
        <button style={{ flex: 1, padding: '13px', borderRadius: Math.min(t.radius, 14),
          background: 'transparent', color: p.muted, fontFamily: t.font.body, fontWeight: 600, fontSize: 13,
          border: `1px solid ${p.lineBold}` }}>Suggest a time</button>
      </div>
    </div>
  </window.HG_Screen>;
}

// legend for the section
function P_Legend() {
  const CP = window.HG_PAPER;
  const Row = ({ k, children }) => <div style={{ padding: '12px 0', borderTop: `1px solid ${CP.line}` }}>
    <div style={{ fontFamily: CP.mono, fontSize: 9.5, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: 600, color: '#7FB069', marginBottom: 4 }}>{k}</div>
    <div style={{ fontSize: 12.5, lineHeight: 1.45, color: CP.ink, textWrap: 'pretty' }}>{children}</div></div>;
  return <div style={{ width: '100%', height: '100%', background: CP.bg, color: CP.ink, fontFamily: CP.body,
    padding: 30, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <div style={{ fontFamily: CP.mono, fontSize: 10.5, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: 600, color: '#7FB069', marginBottom: 16 }}>Open time only · every trip</div>
    <div style={{ fontFamily: CP.display, fontWeight: 600, fontSize: 29, lineHeight: 1.02, letterSpacing: -0.8 }}>
      Anyone proposes.<br/>The table decides.</div>
    <div style={{ fontSize: 12.5, lineHeight: 1.5, color: CP.muted, marginTop: 11, textWrap: 'pretty' }}>
      For <span style={{ color: CP.ink }}>unstructured time only</span> — a meal, an hour to kill, somewhere to
      land. Location and time surface what&rsquo;s near and open, and <span style={{ color: CP.ink }}>any</span> family
      member can put one in front of the deciders. Meals just come up most.</div>
    <div style={{ marginTop: 10 }}>
      <Row k="1 · It surfaces">It&rsquo;s 11:40 and you&rsquo;re at Indian Neck → the open calls, nearest first.</Row>
      <Row k="2 · Aurelia proposes">She picks one and sends it to Helen and Dad with a note — a suggestion, not a booking.</Row>
      <Row k="3 · You decide">It lands warm in your lens: the idea&rsquo;s hers, the call is yours.</Row>
    </div>
    <div style={{ marginTop: 12, background: CP.bg2, borderRadius: 12, padding: '13px 14px', border: `1px solid ${CP.line}` }}>
      <div style={{ fontFamily: CP.mono, fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: 600, color: CP.accent, marginBottom: 6 }}>The boundary</div>
      <div style={{ fontSize: 12, lineHeight: 1.45, color: CP.ink, textWrap: 'pretty' }}>
        Booked plans, destinations and activities are <b>fixed</b> — shown, never voted. Surprises stay
        <b> masked</b>: the loop never sees them, so it can&rsquo;t hint or spoil. Voting is purely for open time.</div>
    </div>
    <div style={{ flex: 1 }} />
    <div style={{ fontSize: 12, color: CP.muted, fontStyle: 'italic', lineHeight: 1.5 }}>
      First-class on the default stay — and it carries into every trip, past and future.</div>
  </div>;
}

Object.assign(window, { HG_P_Surface: P_Surface, HG_P_Propose: P_Propose, HG_P_Incoming: P_Incoming, HG_P_Legend: P_Legend });
