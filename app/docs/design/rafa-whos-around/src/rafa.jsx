// src/ft2/rafa.jsx — RAFA · 4 · "Mission." Verb: PLAY / TELL.
// Big, bright, rounded. Huge touch targets. Foregrounds: a countdown to the
// monster trucks, a giant "tell a story" voice recorder, and a find-me game.
// No reading required — icons, color, and one giant thing at a time.

function RafaFlow({ go }) {
  const t = TRAVELERS.rafa, c = t.pal;
  const [view, setView] = React.useState('mission'); // mission | tell | find | movies
  const [movie, setMovie] = React.useState(null);
  return (
    <div style={{ height: '100%', position: 'relative', background: c.bg, color: c.ink, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {view === 'mission' && <RMission t={t} c={c} go={go} onTell={() => setView('tell')} onFind={() => setView('find')} onMovies={() => setView('movies')} onPlay={setMovie} />}
      {view === 'tell' && <RTell t={t} c={c} onClose={() => setView('mission')} />}
      {view === 'find' && <RFind t={t} c={c} onClose={() => setView('mission')} />}
      {view === 'movies' && <RMovies t={t} c={c} onClose={() => setView('mission')} onPlay={setMovie} />}
      {movie && <RMoviePlayer t={t} c={c} movie={movie} onClose={() => setMovie(null)} />}
    </div>
  );
}

const ST = TRAVELERS.rafa.pal.sticker;

function RHeavy({ children, s = 30, c, style }) {
  return <div style={{ fontFamily: FONTS.fredoka, fontWeight: 700, fontSize: s, lineHeight: 1.06, letterSpacing: -0.5, color: c, ...style }}>{children}</div>;
}

// Big round candy button
function RBigBtn({ icon, label, color, sub, onClick, full }) {
  return (
    <button onClick={onClick} style={{
      width: full ? '100%' : 'auto', border: 'none', cursor: 'pointer', borderRadius: 30,
      background: color, padding: '20px 22px', display: 'flex', alignItems: 'center', gap: 16,
      boxShadow: `0 8px 0 ${shade(color, -45)}, 0 14px 24px -8px rgba(0,0,0,0.4)`,
      transition: 'transform .12s, box-shadow .12s',
    }}
      onMouseDown={e => { e.currentTarget.style.transform = 'translateY(5px)'; e.currentTarget.style.boxShadow = `0 3px 0 ${shade(color, -45)}, 0 6px 14px -8px rgba(0,0,0,0.4)`; }}
      onMouseUp={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = `0 8px 0 ${shade(color, -45)}, 0 14px 24px -8px rgba(0,0,0,0.4)`; }}
    >
      <div style={{ width: 58, height: 58, borderRadius: 22, background: 'rgba(255,255,255,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
      <div style={{ textAlign: 'left' }}>
        <RHeavy s={24} c="#fff">{label}</RHeavy>
        {sub && <div style={{ fontFamily: FONTS.fredoka, fontWeight: 500, fontSize: 14, color: 'rgba(255,255,255,0.9)', marginTop: 3 }}>{sub}</div>}
      </div>
    </button>
  );
}

function RMission({ t, c, go, onTell, onFind, onMovies, onPlay }) {
  // countdown: pretend target = a fixed future. Compute a friendly "X sleeps"
  const sleeps = 2;
  const tick = useTick(true, 1000);
  // mixed videos + photos, shuffled once per visit
  const reel = React.useMemo(() => [...RAFA_MOVIES].sort(() => Math.random() - 0.5), []);
  const hero = reel[0];
  // truck wheels spin
  return (
    <Scroll style={{ paddingBottom: 22 }}>
      {/* hello */}
      <div style={{ padding: '14px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <RHeavy s={26} c={c.ink}>Hi Rafa! <span style={{ color: ST[0] }}>★</span></RHeavy>
        <button onClick={go.settings} style={{ width: 46, height: 46, borderRadius: '50%', background: t.dot, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 0 ${shade(t.dot, -50)}` }}><RHeavy s={22} c="#fff">R</RHeavy></button>
      </div>

      {/* SHOW ME, ME — Rafa, video-forward (up top, easy to find) */}
      <div style={{ padding: '14px 18px 0' }}>
        <button onClick={() => go.person()} style={{ width: '100%', border: 'none', cursor: 'pointer', borderRadius: 26, background: ST[4], padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: `0 7px 0 ${shade(ST[4], -45)}` }}>
          <div style={{ width: 52, height: 52, borderRadius: 18, background: 'rgba(255,255,255,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0 }}>📸</div>
          <div style={{ textAlign: 'left', flex: 1 }}>
            <RHeavy s={22} c="#fff">Show me, me!</RHeavy>
            <div style={{ fontFamily: FONTS.fredoka, fontWeight: 500, fontSize: 13, color: 'rgba(255,255,255,0.9)', marginTop: 2 }}>Every photo & video with YOU in it</div>
          </div>
          <Ic.right s={22} c="#fff" />
        </button>
      </div>

      {/* MY COOLEST MOMENTS — on top. videos + photos, mixed. */}
      <div style={{ padding: '18px 18px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <RHeavy s={24} c={c.ink}>My coolest moments! 🎬</RHeavy>
          <button onClick={onMovies} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: c.accentText, fontFamily: FONTS.fredoka, fontWeight: 600, fontSize: 14 }}>See all →</button>
        </div>
        {/* big hero */}
        <Reveal dir="scale">
          <button onClick={() => onPlay(hero)} style={{ display: 'block', width: '100%', border: 'none', padding: 0, cursor: 'pointer', borderRadius: 28, overflow: 'hidden', boxShadow: `0 10px 0 ${shade(hero.tint, -48)}` }}>
            <div style={{ position: 'relative', aspectRatio: 16 / 10, background: `radial-gradient(120% 120% at 50% 30%, ${shade(hero.tint, 14)}, ${shade(hero.tint, -30)})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 92 }}>{hero.emoji}</div>
              <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.3)', borderRadius: 999, padding: '5px 11px' }}>{hero.video ? <Ic.play s={12} c="#fff" /> : <Ic.cam s={12} c="#fff" />}<span style={{ fontFamily: FONTS.fredoka, fontWeight: 600, fontSize: 12, color: '#fff' }}>{hero.video ? hero.dur : hero.count + ' pics'}</span></div>
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '30px 16px 14px', background: 'linear-gradient(transparent, rgba(0,0,0,0.5))', textAlign: 'left' }}>
                <RHeavy s={26} c="#fff">{hero.label}</RHeavy>
                <div style={{ fontFamily: FONTS.fredoka, fontWeight: 500, fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>{hero.when}</div>
              </div>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{hero.video ? <Ic.play s={28} c={hero.tint} /> : <Ic.cam s={26} c={hero.tint} />}</div>
            </div>
          </button>
        </Reveal>
        {/* row of more — mixed */}
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingTop: 12, paddingBottom: 4 }} className="ft-scroll">
          {reel.slice(1).map((mv, i) => (
            <Reveal key={mv.id} dir="up" delay={i * 70}>
              <button onClick={() => onPlay(mv)} style={{ flexShrink: 0, width: 130, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' }}>
                <div style={{ position: 'relative', width: 130, height: 130, borderRadius: 24, overflow: 'hidden', background: `radial-gradient(120% 120% at 50% 30%, ${shade(mv.tint, 12)}, ${shade(mv.tint, -28)})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 6px 0 ${shade(mv.tint, -45)}` }}>
                  <span style={{ fontSize: 50 }}>{mv.emoji}</span>
                  <div style={{ position: 'absolute', bottom: 8, right: 8, display: 'flex', alignItems: 'center', gap: 3, background: 'rgba(0,0,0,0.4)', borderRadius: 999, padding: '3px 7px' }}>{mv.video ? <Ic.play s={10} c="#fff" /> : <Ic.cam s={10} c="#fff" />}<span style={{ fontFamily: FONTS.fredoka, fontWeight: 600, fontSize: 9, color: '#fff' }}>{mv.video ? mv.dur : mv.count}</span></div>
                </div>
                <RHeavy s={14} c={c.ink} style={{ textAlign: 'left', marginTop: 8 }}>{mv.label}</RHeavy>
              </button>
            </Reveal>
          ))}
        </div>
      </div>

      {/* TELL A STORY — big button, recorded for later */}
      <div style={{ padding: '24px 18px 0' }}>
        <Reveal dir="up">
          <RBigBtn full color={ST[3]} onClick={onTell} icon={<Ic.mic s={30} c="#fff" w={2.2} />} label="Tell a story" sub="Press the big button & talk!" />
        </Reveal>
      </div>

      {/* THE BIG DAY COUNTDOWN — under Tell a story (won't always be one) */}
      <Reveal dir="scale">
        <div style={{ margin: '18px 18px 0', borderRadius: 34, padding: '24px 22px 26px', position: 'relative', overflow: 'hidden', background: `radial-gradient(120% 100% at 50% 0%, ${shade(c.accent, 10)}, ${shade(c.accent, -40)})`, boxShadow: `0 10px 0 ${shade(c.accent, -55)}` }}>
          {/* spark dots */}
          {[[14, 18], [82, 14], [70, 80], [20, 78]].map(([l, top], i) => (
            <div key={i} style={{ position: 'absolute', left: `${l}%`, top: `${top}%`, fontSize: 18, opacity: 0.9, animation: `ftBob ${1.6 + i * 0.3}s ease-in-out ${i * 0.2}s infinite` }}>{['💥', '⚡', '🔥', '✨'][i]}</div>
          ))}
          <div style={{ fontFamily: FONTS.fredoka, fontWeight: 600, fontSize: 15, color: c.accentInk, opacity: 0.8, textAlign: 'center' }}>YOUR BIG DAY IS IN</div>
          <RHeavy s={92} c={c.accentInk} style={{ textAlign: 'center', marginTop: 4 }}>{sleeps}</RHeavy>
          <RHeavy s={26} c={c.accentInk} style={{ textAlign: 'center', marginTop: -2 }}>sleeps!</RHeavy>
          {/* monster truck */}
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
            <RTruck spin={tick} c={c.accentInk} />
          </div>
          <div style={{ fontFamily: FONTS.fredoka, fontWeight: 700, fontSize: 19, color: c.accentInk, textAlign: 'center', marginTop: 14 }}>MONSTER TRUCKS! 🚛</div>
        </div>
      </Reveal>

      {/* FIND ME */}
      <div style={{ padding: '20px 18px 0' }}>
        <Reveal dir="up" delay={80}>
          <RBigBtn full color={ST[1]} onClick={onFind} icon={<RStarFace />} label="Find me!" sub="Where is Rafa? Tap to find!" />
        </Reveal>
      </div>

      {/* my stickers earned */}
      <div style={{ padding: '24px 18px 0' }}>
        <RHeavy s={20} c={c.ink} style={{ marginBottom: 12 }}>My stickers ⭐</RHeavy>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {['🚛', '🍕', '✈️', '🌃', '🦁', '🎤'].map((s, i) => (
            <div key={i} style={{ width: 56, height: 56, borderRadius: '50%', background: i < 4 ? c.surface : 'transparent', border: i < 4 ? 'none' : `2px dashed ${c.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: i < 4 ? 28 : 20, opacity: i < 4 ? 1 : 0.4, boxShadow: i < 4 ? `0 4px 0 ${c.bg2}` : 'none' }}>{i < 4 ? s : '?'}</div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 22, padding: '26px 0 4px' }}>
        <button onClick={go.map} style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: c.muted }}><Ic.map s={22} c={c.muted} /><span style={{ fontFamily: FONTS.fredoka, fontWeight: 600, fontSize: 12 }}>Map</span></button>
        <button onClick={go.trips} style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: c.muted }}><Ic.grid s={20} c={c.muted} /><span style={{ fontFamily: FONTS.fredoka, fontWeight: 600, fontSize: 12 }}>Trips</span></button>
        <button onClick={go.surprises} style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: c.muted }}><span style={{ fontSize: 20 }}>🎁</span><span style={{ fontFamily: FONTS.fredoka, fontWeight: 600, fontSize: 12 }}>Surprises</span></button>
      </div>
    </Scroll>
  );
}

function RTruck({ spin, c }) {
  return (
    <svg width="150" height="90" viewBox="0 0 150 90">
      <g fill={c}>
        <rect x="28" y="26" width="74" height="26" rx="6" />
        <path d="M44 26 L54 12 L86 12 L96 26 Z" />
        <rect x="58" y="16" width="22" height="11" rx="3" fill="rgba(255,255,255,0.45)" />
      </g>
      {/* big wheels spinning */}
      {[42, 92].map((cx, i) => (
        <g key={cx} style={{ transformOrigin: `${cx}px 60px`, transform: `rotate(${spin * 90}deg)`, transition: 'transform .9s linear' }}>
          <circle cx={cx} cy="60" r="22" fill={c} />
          <circle cx={cx} cy="60" r="11" fill="rgba(255,255,255,0.5)" />
          {[0, 60, 120, 180, 240, 300].map(a => <rect key={a} x={cx - 1.5} y="42" width="3" height="9" fill={c} transform={`rotate(${a} ${cx} 60)`} />)}
        </g>
      ))}
    </svg>
  );
}
function RStarFace() {
  return <svg width="32" height="32" viewBox="0 0 24 24" fill="#fff"><path d="M12 2.5l2.9 5.9 6.6 1-4.7 4.6 1.1 6.5L12 17.4 6.1 20.5l1.1-6.5-4.7-4.6 6.6-1z"/></svg>;
}

// ── TELL A STORY — giant record button ──
function RTell({ t, c, onClose }) {
  const [state, setState] = React.useState('ready'); // ready | recording | done
  const [secs, setSecs] = React.useState(0);
  React.useEffect(() => {
    if (state !== 'recording') return;
    const id = setInterval(() => setSecs(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [state]);
  const tick = useTick(state === 'recording', 140);
  return (
    <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(120% 90% at 50% 10%, ${shade(c.bg, 18)}, ${c.bg})`, zIndex: 30, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0, padding: '12px 18px' }}>
        <button onClick={onClose} style={{ width: 48, height: 48, borderRadius: '50%', background: c.surface, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 0 ${c.bg2}` }}><Ic.left s={24} c={c.ink} /></button>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        {state === 'ready' && <RHeavy s={32} c={c.ink} style={{ textAlign: 'center', marginBottom: 8 }}>Tell me a story!</RHeavy>}
        {state === 'ready' && <div style={{ fontFamily: FONTS.fredoka, fontWeight: 500, fontSize: 17, color: c.muted, textAlign: 'center', marginBottom: 40 }}>Press the big button and talk 🎤</div>}
        {state === 'recording' && <RHeavy s={28} c={c.accentText} style={{ textAlign: 'center', marginBottom: 8 }}>I'm listening… 👂</RHeavy>}
        {state === 'recording' && <div style={{ fontFamily: FONTS.mono, fontSize: 22, color: c.ink, marginBottom: 16, fontWeight: 600 }}>0:{String(secs).padStart(2, '0')}</div>}
        {state === 'recording' && <div style={{ display: 'flex', gap: 4, alignItems: 'center', height: 34, marginBottom: 26 }}>{[20, 44, 30, 56, 26, 48, 22, 38, 28, 50, 24].map((h, i) => <div key={i} style={{ width: 6, height: Math.max(10, h * (0.5 + ((tick + i) % 4) * 0.2)), background: c.accentText, borderRadius: 3, transition: 'height .14s' }} />)}</div>}

        {state !== 'done' && (
          <button onClick={() => setState(state === 'ready' ? 'recording' : 'done')} style={{ position: 'relative', width: 180, height: 180, borderRadius: '50%', border: 'none', cursor: 'pointer', background: state === 'recording' ? c.live : ST[3], boxShadow: `0 10px 0 ${shade(state === 'recording' ? c.live : ST[3], -45)}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {state === 'recording' && [0, 1, 2].map(i => <div key={i} style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `3px solid ${c.live}`, opacity: 0, animation: `ftPing 1.8s ${i * 0.6}s ease-out infinite` }} />)}
            {state === 'recording'
              ? <div style={{ width: 56, height: 56, borderRadius: 16, background: '#fff' }} />
              : <Ic.mic s={68} c="#fff" w={1.8} />}
          </button>
        )}
        {state === 'recording' && <div style={{ fontFamily: FONTS.fredoka, fontWeight: 700, fontSize: 17, color: c.ink, marginTop: 28, textAlign: 'center' }}>Tap the red button to stop 🛑</div>}
        {state === 'recording' && <div style={{ fontFamily: FONTS.fredoka, fontWeight: 500, fontSize: 13, color: c.muted, marginTop: 6 }}>It's being saved for later 💛</div>}

        {state === 'done' && (
          <Reveal dir="scale">
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 70 }}>🎉</div>
              <RHeavy s={30} c={c.ink} style={{ marginTop: 8 }}>Great story!</RHeavy>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 24, padding: '14px 20px', borderRadius: 24, background: c.surface, boxShadow: `0 5px 0 ${c.bg2}` }}>
                <button onClick={() => { setState('ready'); setSecs(0); }} style={{ width: 56, height: 56, borderRadius: '50%', border: 'none', background: ST[2], cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 0 ${shade(ST[2], -45)}` }}><Ic.play s={24} c="#fff" /></button>
                <div style={{ textAlign: 'left' }}>
                  <RHeavy s={17} c={c.ink}>My story</RHeavy>
                  <div style={{ fontFamily: FONTS.mono, fontSize: 13, color: c.muted, marginTop: 2 }}>0:{String(secs).padStart(2, '0')} · saved!</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 22, justifyContent: 'center' }}>
                <RBigBtn color={ST[0]} onClick={() => { setState('ready'); setSecs(0); }} icon={<Ic.mic s={24} c="#fff" w={2} />} label="Again!" />
                <RBigBtn color={ST[2]} onClick={onClose} icon={<Ic.check s={26} c="#fff" w={2.6} />} label="Done" />
              </div>
              <div style={{ fontFamily: FONTS.fredoka, fontWeight: 500, fontSize: 14, color: c.muted, marginTop: 20 }}>Mama & Papa will hear it too 💛</div>
            </div>
          </Reveal>
        )}
      </div>
    </div>
  );
}

// ── FIND ME — tap the photo with Rafa in it ──
const R_ROUNDS = [
  { tiles: ['🚗', '👦', '🍕', '🏢'], answer: 1, prize: '🚗' },
  { tiles: ['🦁', '✈️', '👦', '🌃'], answer: 2, prize: '🦁' },
  { tiles: ['👦', '🍦', '🚛', '⭐'], answer: 0, prize: '🚛' },
];
function RFind({ t, c, onClose }) {
  const [round, setRound] = React.useState(0);
  const [picked, setPicked] = React.useState(null);
  const [won, setWon] = React.useState([]);
  const r = R_ROUNDS[round];
  const correct = picked === r.answer;
  const tileColors = [ST[0], ST[1], ST[2], ST[4]];
  function next() {
    if (round < R_ROUNDS.length - 1) { setRound(round + 1); setPicked(null); }
    else setRound('end');
  }
  if (round === 'end') {
    return (
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(120% 90% at 50% 10%, ${shade(c.bg, 18)}, ${c.bg})`, zIndex: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 30 }}>
        <div style={{ fontSize: 90 }}>🏆</div>
        <RHeavy s={36} c={c.ink} style={{ marginTop: 10, textAlign: 'center' }}>You found you!</RHeavy>
        <div style={{ display: 'flex', gap: 14, marginTop: 24 }}>{R_ROUNDS.map((rr, i) => <div key={i} style={{ width: 60, height: 60, borderRadius: '50%', background: c.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, boxShadow: `0 5px 0 ${c.bg2}`, animation: `ftPop .4s ${i * 0.15}s both` }}>{rr.prize}</div>)}</div>
        <button onClick={onClose} style={{ marginTop: 36 }}><RBigBtn color={ST[2]} icon={<Ic.check s={26} c="#fff" w={2.6} />} label="Yay!" /></button>
      </div>
    );
  }
  return (
    <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(120% 90% at 50% 10%, ${shade(c.bg, 18)}, ${c.bg})`, zIndex: 30, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0, padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={onClose} style={{ width: 48, height: 48, borderRadius: '50%', background: c.surface, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 0 ${c.bg2}` }}><Ic.left s={24} c={c.ink} /></button>
        <div style={{ display: 'flex', gap: 7 }}>{R_ROUNDS.map((_, i) => <div key={i} style={{ width: 12, height: 12, borderRadius: '50%', background: i < round ? ST[2] : i === round ? ST[0] : c.line }} />)}</div>
        <div style={{ width: 48 }} />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <RHeavy s={32} c={c.ink} style={{ textAlign: 'center', marginBottom: 10 }}>Where is Rafa?</RHeavy>
        <div style={{ fontFamily: FONTS.fredoka, fontWeight: 500, fontSize: 16, color: c.muted, marginBottom: 28 }}>Tap the picture with YOU in it! 👦</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, width: '100%', maxWidth: 320 }}>
          {r.tiles.map((emo, i) => {
            const isAns = i === r.answer;
            const show = picked !== null;
            return (
              <button key={i} disabled={show} onClick={() => setPicked(i)} style={{
                aspectRatio: 1, borderRadius: 28, border: 'none', cursor: show ? 'default' : 'pointer',
                background: show && isAns ? ST[2] : show && i === picked ? '#6b5040' : tileColors[i],
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 56, position: 'relative',
                boxShadow: `0 7px 0 ${shade(show && isAns ? ST[2] : tileColors[i], -45)}`,
                transform: show && i === picked && !correct ? 'rotate(-3deg)' : 'none',
                transition: 'transform .15s', opacity: show && !isAns && i !== picked ? 0.4 : 1,
              }}>
                {emo}
                {show && isAns && <div style={{ position: 'absolute', top: 8, right: 8, fontSize: 26 }}>✅</div>}
              </button>
            );
          })}
        </div>
        {picked !== null && (
          <Reveal dir="up">
            <div style={{ marginTop: 28, textAlign: 'center' }}>
              <RHeavy s={26} c={correct ? c.good : c.live}>{correct ? 'You found you! 🎉' : 'That was someone else!'}</RHeavy>
              <button onClick={correct ? next : () => setPicked(null)} style={{ marginTop: 16 }}>
                <RBigBtn color={correct ? ST[2] : ST[0]} icon={correct ? <Ic.right s={26} c="#fff" w={2.6} /> : <Ic.mic s={22} c="#fff" w={2} />} label={correct ? 'Next!' : 'Try again'} />
              </button>
            </div>
          </Reveal>
        )}
      </div>
    </div>
  );
}

// ── MY COOLEST MOMENTS — full reel ──
function RMovies({ t, c, onClose, onPlay }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: c.bg, zIndex: 30, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onClose} style={{ width: 48, height: 48, borderRadius: '50%', background: c.surface, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 0 ${c.bg2}` }}><Ic.left s={24} c={c.ink} /></button>
        <RHeavy s={24} c={c.ink}>My movies 🎬</RHeavy>
      </div>
      <Scroll style={{ padding: '4px 18px 22px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {RAFA_MOVIES.map((mv, i) => (
            <Reveal key={mv.id} dir="up" delay={i * 70}>
              <button onClick={() => onPlay(mv)} style={{ display: 'block', width: '100%', border: 'none', padding: 0, cursor: 'pointer', borderRadius: 26, overflow: 'hidden', boxShadow: `0 8px 0 ${shade(mv.tint, -48)}` }}>
                <div style={{ position: 'relative', aspectRatio: 16 / 10, background: `radial-gradient(120% 120% at 50% 30%, ${shade(mv.tint, 14)}, ${shade(mv.tint, -30)})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 80 }}>{mv.emoji}</span>
                  <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.3)', borderRadius: 999, padding: '5px 11px' }}>{mv.video ? <Ic.play s={12} c="#fff" /> : <Ic.cam s={12} c="#fff" />}<span style={{ fontFamily: FONTS.fredoka, fontWeight: 600, fontSize: 12, color: '#fff' }}>{mv.video ? mv.dur : 'photos'}</span></div>
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '30px 16px 14px', background: 'linear-gradient(transparent, rgba(0,0,0,0.5))', textAlign: 'left' }}>
                    <RHeavy s={24} c="#fff">{mv.label}</RHeavy>
                    <div style={{ fontFamily: FONTS.fredoka, fontWeight: 500, fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>{mv.when}</div>
                  </div>
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic.play s={26} c={mv.tint} /></div>
                </div>
              </button>
            </Reveal>
          ))}
        </div>
      </Scroll>
    </div>
  );
}

// ── Movie player (kid-simple) ──
function RMoviePlayer({ t, c, movie, onClose }) {
  const [playing, setPlaying] = React.useState(true);
  const [pct, setPct] = React.useState(0);
  React.useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setPct(p => (p >= 100 ? 0 : p + 2)), 120);
    return () => clearInterval(id);
  }, [playing]);
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000', zIndex: 45, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0, padding: '12px 18px', display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={{ width: 46, height: 46, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic.x s={24} c="#fff" /></button>
      </div>
      <div onClick={() => setPlaying(p => !p)} style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(110% 90% at 50% 40%, ${shade(movie.tint, 16)}, ${shade(movie.tint, -36)})` }} />
        <div style={{ position: 'relative', fontSize: 130, animation: playing ? 'ftBob 2s ease-in-out infinite' : 'none' }}>{movie.emoji}</div>
        {!playing && <div style={{ position: 'absolute', width: 84, height: 84, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic.play s={40} c="#fff" /></div>}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '40px 22px 20px', background: 'linear-gradient(transparent, rgba(0,0,0,0.6))' }}>
          <RHeavy s={30} c="#fff">{movie.label}</RHeavy>
          <div style={{ fontFamily: FONTS.fredoka, fontWeight: 500, fontSize: 15, color: 'rgba(255,255,255,0.85)', marginTop: 3 }}>{movie.when}</div>
        </div>
      </div>
      {/* big kid-friendly progress + controls */}
      <div style={{ flexShrink: 0, padding: '14px 20px 22px' }}>
        <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.2)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: '#fff', borderRadius: 4, transition: 'width .12s linear' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
          <button onClick={() => setPlaying(p => !p)} style={{ width: 78, height: 78, borderRadius: '50%', border: 'none', cursor: 'pointer', background: ST[3], boxShadow: `0 6px 0 ${shade(ST[3], -45)}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {playing ? <div style={{ display: 'flex', gap: 6 }}><div style={{ width: 8, height: 28, background: '#fff', borderRadius: 2 }} /><div style={{ width: 8, height: 28, background: '#fff', borderRadius: 2 }} /></div> : <Ic.play s={36} c="#fff" />}
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { RafaFlow, RHeavy, RBigBtn, RTruck, RStarFace, RTell, RFind, RMovies, RMoviePlayer });