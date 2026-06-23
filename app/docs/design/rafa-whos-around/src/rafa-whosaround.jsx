// src/ft2/rafa-whosaround.jsx — RAFA · "Where's my family?"
// The kid version of the shipped "Who's around" band. No tidy grey list — a
// living storybook diorama. Two coarse zones only (privacy by design): the
// CABIN (home base) and OUT & ABOUT. Each family member is a big bobbing
// character bubble in their zone. Live-right-now = bobs + glows + a heartbeat
// pip. Last-seen-a-while-ago = still, faded, a sleepy 💤. Color + face do the
// reading; tapping a face opens a giant, warm reveal with one playful action.
//
// DATA available per person (all the brief allows): identity color/character,
// a COARSE place (cabin | out), and live vs. last-seen. Nothing precise.

const RW_FAMILY = {
  helen:    { place: 'cabin', live: true  },
  rafa:     { place: 'cabin', live: true, isMe: true },
  jonathan: { place: 'out',   live: true  },
  aurelia:  { place: 'out',   live: false },
};
const RW_ORDER = ['helen', 'rafa', 'jonathan', 'aurelia'];
// each member's constant identity sticker (same across every lens)
const RW_BUDDY = { helen: '🌿', jonathan: '🧭', aurelia: '🎞️', rafa: '🚛' };

const RW_ST = TRAVELERS.rafa.pal.sticker;

// ── one family character bubble — the heart of the whole thing ──
function RWBubble({ id, live, size = 64, badge = true, onClick, delay = 0 }) {
  const t = TRAVELERS[id], col = t.dot;
  return (
    <button onClick={onClick} aria-label={t.name} style={{
      position: 'relative', border: 'none', background: 'transparent', padding: 0,
      cursor: onClick ? 'pointer' : 'default', width: size, flexShrink: 0,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
    }}>
      <div style={{ position: 'relative', width: size, height: size, animation: live ? `ftBob ${1.8 + delay}s ease-in-out ${delay}s infinite` : 'none' }}>
        {/* live glow ring + heartbeat */}
        {live && <div style={{ position: 'absolute', inset: -6, borderRadius: '50%', boxShadow: `0 0 0 4px ${col}, 0 0 22px ${col}`, opacity: 0.55, animation: 'ftPing 2.2s ease-out infinite' }} />}
        <div style={{
          width: size, height: size, borderRadius: '50%',
          background: `radial-gradient(120% 120% at 50% 28%, ${shade(col, 30)}, ${shade(col, -22)})`,
          boxShadow: `0 ${Math.round(size * 0.1)}px 0 ${shade(col, -48)}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: FONTS.fredoka, fontWeight: 700, fontSize: size * 0.42, color: '#fff',
          border: live ? '3px solid rgba(255,255,255,0.9)' : '3px solid rgba(255,255,255,0.35)',
          opacity: live ? 1 : 0.7, filter: live ? 'none' : 'saturate(0.6)',
        }}>{t.initial}</div>
        {/* buddy sticker badge */}
        {badge && <div style={{ position: 'absolute', bottom: -3, right: -5, width: size * 0.42, height: size * 0.42, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 5px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.26 }}>{RW_BUDDY[id]}</div>}
        {/* state corner: live heartbeat OR sleepy z */}
        {live
          ? <div style={{ position: 'absolute', top: -2, right: -2, width: 16, height: 16, borderRadius: '50%', background: TRAVELERS.rafa.pal.good, border: '2.5px solid #fff', boxShadow: `0 0 8px ${TRAVELERS.rafa.pal.good}` }} />
          : <div style={{ position: 'absolute', top: -8, left: -6, fontSize: 18 }}>💤</div>}
      </div>
    </button>
  );
}

// ── the diorama scene — the phone-home hero ──
function RWScene({ onPick, compact }) {
  const c = TRAVELERS.rafa.pal;
  const cabinPpl = RW_ORDER.filter(id => RW_FAMILY[id].place === 'cabin');
  const outPpl = RW_ORDER.filter(id => RW_FAMILY[id].place === 'out');
  const H = compact ? 252 : 286;
  const bub = compact ? 56 : 62;

  const Zone = ({ side, emojiBack, label, labelEmoji, people, tint }) => (
    <div style={{ position: 'relative', flex: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* zone label chip */}
      <div style={{ position: 'absolute', top: 12, left: side === 'left' ? 12 : 'auto', right: side === 'right' ? 12 : 'auto', zIndex: 3,
        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px 7px', borderRadius: 999, background: 'rgba(255,255,255,0.9)', boxShadow: '0 3px 8px rgba(0,0,0,0.18)' }}>
        <span style={{ fontSize: 16 }}>{labelEmoji}</span>
        <span style={{ fontFamily: FONTS.fredoka, fontWeight: 700, fontSize: 14, color: '#3a2a16' }}>{label}</span>
      </div>
      {/* big back landmark */}
      <div style={{ position: 'absolute', bottom: '32%', left: '50%', transform: 'translateX(-50%)', fontSize: compact ? 78 : 92, opacity: 0.95, filter: 'drop-shadow(0 8px 10px rgba(0,0,0,0.25))', pointerEvents: 'none' }}>{emojiBack}</div>
      {/* people standing on the ground */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 14, display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: side === 'left' ? -2 : 6, zIndex: 4, flexWrap: 'wrap', padding: '0 6px' }}>
        {people.map((id, i) => (
          <RWBubble key={id} id={id} live={RW_FAMILY[id].live} size={bub} delay={i * 0.25} onClick={() => onPick(id)} />
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ position: 'relative', height: H, borderRadius: 30, overflow: 'hidden',
      background: 'linear-gradient(#bfe3f2 0%, #d8eecf 58%, #cfe6c0 58%, #b9dca6 100%)',
      boxShadow: `0 9px 0 ${shade(c.accent, -55)}, inset 0 0 0 4px rgba(255,255,255,0.5)` }}>
      {/* sky decor */}
      <div style={{ position: 'absolute', top: 14, right: 16, fontSize: 40, filter: 'drop-shadow(0 0 14px rgba(255,200,60,0.7))', animation: 'ftBob 4s ease-in-out infinite' }}>☀️</div>
      <div style={{ position: 'absolute', top: 30, left: 22, fontSize: 30, opacity: 0.92, animation: 'ftBob 5s ease-in-out 0.4s infinite' }}>☁️</div>
      <div style={{ position: 'absolute', top: 64, left: '46%', fontSize: 22, opacity: 0.8, animation: 'ftBob 5.5s ease-in-out 1s infinite' }}>☁️</div>
      {/* ground grass tufts */}
      <div style={{ position: 'absolute', bottom: 4, left: 10, fontSize: 18, opacity: 0.8 }}>🌼</div>
      <div style={{ position: 'absolute', bottom: 2, right: 14, fontSize: 18, opacity: 0.8 }}>🌷</div>
      {/* soft middle path/fence divider */}
      <div style={{ position: 'absolute', top: '40%', bottom: 0, left: '50%', width: 3, transform: 'translateX(-50%)', background: 'repeating-linear-gradient(rgba(255,255,255,0.7) 0 8px, transparent 8px 16px)', opacity: 0.7, zIndex: 2 }} />
      <div style={{ display: 'flex', height: '100%' }}>
        <Zone side="left" emojiBack="🏡" label="Special house" labelEmoji="🏠" people={cabinPpl} />
        <Zone side="right" emojiBack="⛰️" label="Out & about" labelEmoji="🧭" people={outPpl} />
      </div>
    </div>
  );
}

// ── the giant warm reveal when Rafa taps a face ──
function RWReveal({ id, onClose }) {
  const c = TRAVELERS.rafa.pal, t = TRAVELERS[id];
  const f = RW_FAMILY[id];
  const [waved, setWaved] = React.useState(false);
  const me = f.isMe;
  const placeWord = f.place === 'cabin' ? 'at the special house' : 'out & about';
  const placeEmoji = f.place === 'cabin' ? '🏠' : '🧭';
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(20,12,5,0.74)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Mounted preset="pop" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 320, background: c.surface, borderRadius: 36, padding: '30px 26px 28px', textAlign: 'center', position: 'relative', boxShadow: `0 16px 0 ${c.bg2}` }}>
        <button onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 16, right: 16, width: 46, height: 46, borderRadius: '50%', background: c.bg2, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic.x s={22} c={c.ink} /></button>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
          <RWBubble id={id} live={f.live} size={120} />
        </div>
        <RHeavy s={34} c={c.ink} style={{ marginTop: 12 }}>{displayName(id, 'rafa')}</RHeavy>
        {/* place line — a word or two, big icon */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '10px 18px', borderRadius: 999, background: c.bg2 }}>
          <span style={{ fontSize: 24 }}>{placeEmoji}</span>
          <RHeavy s={20} c={c.ink}>{me ? "that's you!" : placeWord}</RHeavy>
        </div>
        {/* state line */}
        <div style={{ marginTop: 14 }}>
          {f.live
            ? <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span style={{ width: 14, height: 14, borderRadius: '50%', background: c.good, boxShadow: `0 0 10px ${c.good}`, animation: 'ftBlink 1.4s infinite' }} /><RHeavy s={18} c={c.good}>here right now!</RHeavy></div>
            : <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 20 }}>💤</span><RHeavy s={18} c={c.muted}>back in a little bit</RHeavy></div>}
        </div>
        {/* one playful action — wave (pure delight, no new data) */}
        {!me && (
          <button onClick={() => setWaved(true)} disabled={waved} style={{ marginTop: 22, width: '100%', border: 'none', cursor: waved ? 'default' : 'pointer', borderRadius: 26,
            background: waved ? c.good : RW_ST[1], padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
            boxShadow: `0 7px 0 ${shade(waved ? c.good : RW_ST[1], -45)}`, transition: 'background .2s' }}>
            <span style={{ fontSize: 26, animation: waved ? 'none' : 'ftBob 1s ease-in-out infinite' }}>{waved ? '💛' : '👋'}</span>
            <RHeavy s={22} c="#fff">{waved ? `Wave sent to ${displayName(id, 'rafa')}!` : 'Wave hi!'}</RHeavy>
          </button>
        )}
        {me && <div style={{ marginTop: 20, fontFamily: FONTS.fredoka, fontWeight: 600, fontSize: 16, color: c.muted }}>Wave at your family! 👋</div>}
      </Mounted>
    </div>
  );
}

// ── full phone-home mock built around the feature ──
function RWHome() {
  const c = TRAVELERS.rafa.pal;
  const [pick, setPick] = React.useState(null);
  const liveCount = RW_ORDER.filter(id => RW_FAMILY[id].live && !RW_FAMILY[id].isMe).length;
  return (
    <div style={{ height: '100%', position: 'relative', background: c.bg, color: c.ink, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Scroll style={{ paddingBottom: 20 }}>
        {/* greeting */}
        <div style={{ padding: '16px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <RHeavy s={26} c={c.ink}>Hi Rafa! <span style={{ color: RW_ST[0] }}>★</span></RHeavy>
          <button aria-label="You" style={{ width: 46, height: 46, borderRadius: '50%', background: TRAVELERS.rafa.dot, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 0 ${shade(TRAVELERS.rafa.dot, -50)}` }}><RHeavy s={22} c="#fff">R</RHeavy></button>
        </div>

        {/* feature heading */}
        <div style={{ padding: '18px 20px 10px' }}>
          <Reveal dir="up">
            <RHeavy s={27} c={c.ink}>Where's everybody? 👀</RHeavy>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 6 }}>
              <span style={{ width: 11, height: 11, borderRadius: '50%', background: c.good, boxShadow: `0 0 8px ${c.good}`, animation: 'ftBlink 1.4s infinite' }} />
              <span style={{ fontFamily: FONTS.fredoka, fontWeight: 600, fontSize: 15, color: c.muted }}>{liveCount} here right now · tap a face!</span>
            </div>
          </Reveal>
        </div>

        {/* the scene */}
        <div style={{ padding: '0 16px' }}>
          <Reveal dir="scale"><RWScene onPick={setPick} /></Reveal>
        </div>

        {/* light home context — keeps it feeling like his real home, not a feature page */}
        <div style={{ padding: '20px 16px 0' }}>
          <Reveal dir="up" delay={120}>
            <div style={{ borderRadius: 26, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14,
              background: `radial-gradient(120% 120% at 50% 0%, ${shade(c.accent, 12)}, ${shade(c.accent, -34)})`, boxShadow: `0 7px 0 ${shade(c.accent, -52)}` }}>
              <div style={{ width: 52, height: 52, borderRadius: 18, background: 'rgba(255,255,255,0.26)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🚛</div>
              <div style={{ textAlign: 'left', flex: 1 }}>
                <RHeavy s={21} c={c.accentInk}>Monster trucks!</RHeavy>
                <div style={{ fontFamily: FONTS.fredoka, fontWeight: 600, fontSize: 14, color: c.accentInk, opacity: 0.85, marginTop: 2 }}>in 2 sleeps 💥</div>
              </div>
            </div>
          </Reveal>
        </div>
      </Scroll>

      {/* bottom nav (context) */}
      <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'center', gap: 26, padding: '12px 0 16px', borderTop: `2px solid ${c.line}` }}>
        {[['👀', 'Family', true], ['🗺️', 'Map', false], ['🎬', 'Movies', false], ['🎁', 'Surprises', false]].map(([e, l, on]) => (
          <div key={l} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, opacity: on ? 1 : 0.5 }}>
            <span style={{ fontSize: 22 }}>{e}</span>
            <span style={{ fontFamily: FONTS.fredoka, fontWeight: 600, fontSize: 11, color: on ? c.accentText : c.muted }}>{l}</span>
          </div>
        ))}
      </div>

      {pick && <RWReveal id={pick} onClose={() => setPick(null)} />}
    </div>
  );
}

// ── iPad Adventure-Map illustration: family riding along as map characters ──
function RWMapFamily() {
  const c = TRAVELERS.rafa.pal, ST = c.sticker;
  // simple winding road with 4 landmark nodes
  const nodes = [{ x: 150, y: 330, e: '🏡', name: 'Home', here: true }, { x: 360, y: 200, e: '🏙️', name: 'City' }, { x: 560, y: 340, e: '🦁', name: 'Show' }, { x: 730, y: 180, e: '🚛', name: 'Trucks!', dest: true }];
  const path = `M ${nodes[0].x} ${nodes[0].y} C 230 380 290 150 ${nodes[1].x} ${nodes[1].y} C 430 250 500 410 ${nodes[2].x} ${nodes[2].y} C 630 280 670 200 ${nodes[3].x} ${nodes[3].y}`;
  const road = shade(c.bg, 30), roadTop = shade(c.bg, 64);
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', fontFamily: FONTS.fredoka,
      background: `radial-gradient(120% 90% at 30% 0%, ${shade(c.bg, 16)}, ${c.bg} 70%)` }}>
      {/* treasure dots */}
      <div style={{ position: 'absolute', inset: 0, opacity: 0.5, backgroundImage: `radial-gradient(${shade(c.bg, 40)} 1.5px, transparent 1.5px)`, backgroundSize: '34px 34px' }} />
      {/* doodads */}
      <div style={{ position: 'absolute', left: '8%', top: '14%', fontSize: 46, opacity: 0.5 }}>🌲</div>
      <div style={{ position: 'absolute', left: '46%', top: '8%', fontSize: 40, opacity: 0.5 }}>☁️</div>
      <div style={{ position: 'absolute', left: '80%', top: '62%', fontSize: 44, opacity: 0.5 }}>🌵</div>
      <svg width="100%" height="100%" viewBox="0 0 820 460" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0 }}>
        <path d={path} fill="none" stroke={road} strokeWidth={46} strokeLinecap="round" />
        <path d={path} fill="none" stroke={roadTop} strokeWidth={34} strokeLinecap="round" />
        <path d={path} fill="none" stroke={c.accent} strokeWidth={7} strokeLinecap="round" strokeDasharray="2 20" opacity={0.5} />
      </svg>
      {/* landmark nodes */}
      {nodes.map((n, i) => (
        <div key={i} style={{ position: 'absolute', left: n.x, top: n.y, transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
          <div style={{ width: n.dest ? 104 : 84, height: n.dest ? 104 : 84, borderRadius: '50%',
            background: `radial-gradient(120% 120% at 50% 25%, ${shade(n.dest ? c.accent : ST[1], 14)}, ${shade(n.dest ? c.accent : ST[1], -30)})`,
            boxShadow: `0 8px 0 ${shade(n.dest ? c.accent : ST[1], -46)}${n.dest ? `, 0 0 40px ${c.accent}` : ''}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: n.dest ? 56 : 44 }}>{n.e}</div>
        </div>
      ))}
      {/* FAMILY CHARACTERS parked along the map */}
      {/* Mama + Rafa at Home (current) */}
      <div style={{ position: 'absolute', left: nodes[0].x - 58, top: nodes[0].y + 30 }}><RWBubble id="helen" live size={58} /></div>
      <div style={{ position: 'absolute', left: nodes[0].x + 6, top: nodes[0].y + 40 }}><RWBubble id="rafa" live size={50} /></div>
      {/* Papa out near the city, Sissy out (sleepy) further along */}
      <div style={{ position: 'absolute', left: nodes[1].x + 20, top: nodes[1].y + 28 }}><RWBubble id="jonathan" live size={56} /></div>
      <div style={{ position: 'absolute', left: nodes[2].x - 6, top: nodes[2].y + 34 }}><RWBubble id="aurelia" live={false} size={54} /></div>
      {/* title chip */}
      <div style={{ position: 'absolute', top: 18, left: 22, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderRadius: 999, background: 'rgba(0,0,0,0.32)' }}>
        <RHeavy s={20} c={c.ink}>Our adventure 🗺️</RHeavy>
      </div>
    </div>
  );
}

Object.assign(window, { RW_FAMILY, RW_BUDDY, RWBubble, RWScene, RWReveal, RWHome, RWMapFamily });
