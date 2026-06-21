// hangout/live-app.jsx — THE INTERACTIVE PROTOTYPE (v2).
// Generalized across trip types (beach ↔ city — no tide in Chicago), with:
//  • a who-it's-for selector that takes ANY combination (esp. one kid + one
//    adult — a one-on-one), filtering to shared outings
//  • pantry items with walk/drive/transit time + limited-time / special events
//  • a soft vote: anyone can say "I'm in", deciders make the call; competing
//    ideas sit side by side
//  • surprises with real masking (the keeper sees it; who it's hidden from gets
//    only a "something's coming" teaser; everyone else, nothing)
// State persists to localStorage.

const { HG_T: T, HG_ORDER: ORDER, HG_TRIPS: TRIPS, HG_TRIP_ORDER: TRIP_ORDER,
  HG_CAT: CAT, HG_RAFA_NAME: RNAME, HG_shade: shade, HG_FONTS: F,
  HG_travelStr: travelStr, HG_comboFilter: comboFilter, HG_comboLabel: comboLabel, HG_isOneOnOne: isOneOnOne,
  HG_SETTINGS: SETTINGS, HG_WEATHER: WEATHER, HG_BANNER: BANNER } = window;
const { HG_Avatar: Avatar, HG_FaceRow: FaceRow, HG_Photo: Photo, HG_Mono: Mono } = window;
const { useState, useEffect } = React;

const DECIDERS = ['helen', 'jonathan'];
const KIDS = ['aurelia', 'rafa'], ADULTS = ['jonathan', 'helen'];
const nameFor = (id, viewer) => viewer === 'rafa' ? RNAME[id] : T[id].name;
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
const weatherLine = (tripId, w) => (WEATHER[tripId].find((x) => x[0] === w) || WEATHER[tripId][0]);

// condition-aware ranking: promote/demote + flag items by the live weather.
function rankPantry(items, mode, tripId) {
  const S = SETTINGS[tripId];
  return items.map((s, i) => {
    const outdoor = S.outdoor.includes(s.id), summer = S.summerOnly.includes(s.id), water = (S.water || []).includes(s.id);
    let cls = 1, flag = null, dim = false;
    if (mode === 'rain') { if (outdoor) { cls = 2; flag = 'better when it’s dry'; dim = true; } else cls = 0; }
    else if (mode === 'hot') { if (water) { cls = 0; flag = 'good in the heat'; } else if (outdoor) { cls = 2; flag = 'hot midday · go early or late'; } }
    else if (mode === 'winter') { if (summer) { cls = 2; flag = 'closed for the season'; dim = true; } else if ((S.winterWin || []).includes(s.id)) { cls = 0; flag = 'better in the cold'; } else if (outdoor) { cls = 2; flag = 'bundle up'; } else cls = 0; }
    else if (mode === 'traffic') { if (s.travel[0] === 'drive') { cls = 2; flag = '+' + (Math.round(s.travel[1] * 0.8) + 4) + ' min in traffic'; dim = true; } else if (s.travel[0] === 'transit' || s.travel[0] === 'walk') cls = 0; }
    return { s, i, cls, flag, dim };
  }).sort((a, b) => a.cls - b.cls || a.i - b.i);
}

function useLS(key, init) {
  const [v, setV] = useState(() => { try { const s = localStorage.getItem(key); return s != null ? JSON.parse(s) : init; } catch { return init; } });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }, [key, v]);
  return [v, setV];
}
function Press({ children, onClick, style }) {
  const [d, setD] = useState(false);
  return <button onClick={onClick} onPointerDown={() => setD(true)} onPointerUp={() => setD(false)} onPointerLeave={() => setD(false)}
    style={{ ...style, transform: d ? 'scale(0.97)' : 'scale(1)', transition: 'transform .12s', WebkitTapHighlightColor: 'transparent' }}>{children}</button>;
}
function EventBadge({ ev, t, onPhoto }) {
  const p = t.pal; const hot = ev[1];
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20,
    background: hot ? p.live : (onPhoto ? 'rgba(0,0,0,0.5)' : p.surface), color: hot ? '#fff' : (onPhoto ? '#fff' : p.muted),
    border: hot ? 'none' : `1px solid ${p.line}`, backdropFilter: onPhoto ? 'blur(3px)' : 'none' }}>
    {hot && <span style={{ width: 5, height: 5, borderRadius: 5, background: '#fff' }} />}
    <span style={{ fontFamily: F.mono, fontSize: 8, letterSpacing: 0.4, fontWeight: 600 }}>{ev[0]}</span></span>;
}
function FlagPill({ flag, t, onPhoto }) {
  const p = t.pal;
  if (onPhoto) return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20,
    background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)', color: '#fff' }}>
    <span style={{ fontFamily: F.mono, fontSize: 8, letterSpacing: 0.4, fontWeight: 600 }}>{flag.toUpperCase()}</span></span>;
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 20,
    border: `1px solid ${p.live}`, color: p.live }}>
    <span style={{ width: 4, height: 4, borderRadius: 4, background: p.live }} />
    <span style={{ fontFamily: F.mono, fontSize: 8, letterSpacing: 0.4, fontWeight: 600 }}>{flag.toUpperCase()}</span></span>;
}
function Label({ t, children, accent }) {
  const p = t.pal;
  return <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '2px 0 10px' }}>
    <Mono c={accent ? p.accentText : p.faint} s={9.5}>{children}</Mono>
    <span style={{ flex: 1, height: 1, background: p.line }} /></div>;
}

// ════════════════════════════════════════════════════════════════
function LiveApp() {
  const [who, setWho] = useLS('hg-live-who', 'helen');
  const [tripId, setTripId] = useLS('hg-live-trip', 'wellfleet');
  const [tab, setTab] = useLS('hg-live-tab', 'home');
  const [proposals, setProposals] = useLS('hg-live-proposals', []);
  const [sel, setSel] = useState([]);
  const [catFilter, setCatFilter] = useState(null);
  const [weather, setWeather] = useState('clear');
  const [sheet, setSheet] = useState(null);
  const [toast, setToast] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const t = T[who]; const p = t.pal; const trip = TRIPS[tripId];

  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  useEffect(() => { if (!toast) return; const x = setTimeout(() => setToast(null), 2400); return () => clearTimeout(x); }, [toast]);
  useEffect(() => { setSel(who === 'aurelia' ? ['aurelia'] : who === 'rafa' ? ['rafa'] : []); setCatFilter(null); }, [who]);

  const fire = (msg) => setToast({ msg, id: Math.random() });
  const send = (spotId, to, note) => {
    setProposals((ps) => [{ id: 'pr' + Date.now(), tripId, spotId, from: who, to, note: note || '', status: 'pending', votes: [], ts: Date.now() }, ...ps]);
    setSheet(null); fire('Sent to ' + to.map((x) => nameFor(x, who)).join(' & '));
  };
  const decide = (id, status) => { setProposals((ps) => ps.map((x) => x.id === id ? { ...x, status, by: who } : x));
    fire(status === 'accepted' ? 'On for now ✦' : 'Passed'); if (status === 'accepted') setTab('now'); };
  const vote = (id) => { setProposals((ps) => ps.map((x) => x.id === id ? { ...x, votes: x.votes.includes(who) ? x.votes.filter((v) => v !== who) : [...x.votes, who] } : x));
    fire("You're in ✦"); };

  const tp = proposals.filter((x) => x.tripId === tripId);
  const pending = tp.filter((x) => x.status === 'pending');
  const inbox = pending.filter((x) => x.to.includes(who) && x.from !== who);
  const mine = pending.filter((x) => x.from === who);
  const accepted = tp.filter((x) => x.status === 'accepted');

  const sp = { t, who, trip, accepted, now, sel, setSel, catFilter, setCatFilter, openPropose: setSheet, setTab, weather, setWeather };

  return <Stage>
    <div style={{ width: '100%', height: '100%', background: p.bg, color: p.ink, fontFamily: t.font.body,
      display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden',
      transition: 'background-color .45s ease, color .45s ease', ['--ring']: p.bg }}>
      <StatusBar p={p} />
      <TripBar t={t} tripId={tripId} onSwitch={(id) => { setTripId(id); setCatFilter(null); setWeather('clear'); fire(TRIPS[id].placeSub); }} />
      <Header t={t} who={who} setWho={setWho} tab={tab} trip={trip} />

      {inbox.length > 1 && <div style={{ flexShrink: 0, padding: '0 16px 8px' }}><Mono s={9} c={p.accentText}>{inbox.length} IDEAS ON THE TABLE</Mono></div>}
      {inbox.map((pr) => <InboxBanner key={pr.id} pr={pr} t={t} who={who} onDecide={decide} onVote={vote} />)}
      {mine.map((pr) => <MineBanner key={pr.id} pr={pr} t={t} who={who} />)}

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch' }}>
        {tab === 'home' && <Home {...sp} />}
        {tab === 'now' && <Now {...sp} />}
        {tab === 'photos' && <Photos {...sp} />}
        {tab === 'back' && <Back {...sp} />}
      </div>
      <TabBar t={t} tab={tab} setTab={setTab} badge={inbox.length} />
      {sheet && <ProposeSheet spot={sheet} t={t} who={who} onClose={() => setSheet(null)} onSend={send} />}
      {toast && <Toast t={t} msg={toast.msg} />}
    </div>
  </Stage>;
}

function Stage({ children }) {
  const [s, setS] = useState(1);
  useEffect(() => { const fit = () => setS(Math.min(1, (window.innerHeight - 32) / 844, (window.innerWidth - 24) / 390));
    fit(); window.addEventListener('resize', fit); return () => window.removeEventListener('resize', fit); }, []);
  return <div style={{ position: 'fixed', inset: 0, background: '#0a0a0c', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
    <div style={{ width: 390, height: 844, transform: `scale(${s})`, transformOrigin: 'center', borderRadius: 46, overflow: 'hidden',
      boxShadow: '0 0 0 11px #15151a, 0 0 0 13px #2a2a30, 0 40px 90px rgba(0,0,0,0.6)', position: 'relative' }}>{children}</div>
  </div>;
}
function StatusBar({ p }) {
  return <div style={{ flexShrink: 0, height: 44, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 26px 4px' }}>
    <span style={{ fontFamily: F.inter, fontWeight: 700, fontSize: 14, color: p.ink }}>9:41</span>
    <span style={{ display: 'flex', gap: 5, alignItems: 'center', opacity: 0.9 }}>
      <span style={{ width: 17, height: 10, borderRadius: 2.5, border: `1.5px solid ${p.muted}` }} />
      <span style={{ width: 5, height: 10, borderRadius: 1.5, background: p.muted }} /></span>
  </div>;
}
// trip switcher — proves the model generalizes across trip types
function TripBar({ t, tripId, onSwitch }) {
  const p = t.pal;
  return <div style={{ flexShrink: 0, display: 'flex', gap: 6, padding: '2px 16px 8px' }}>
    {TRIP_ORDER.map((id) => { const on = id === tripId; const tr = TRIPS[id];
      return <Press key={id} onClick={() => onSwitch(id)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', flexDirection: 'column',
        padding: '5px 11px', borderRadius: 11, background: on ? (t.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)') : 'transparent',
        border: `1px solid ${on ? p.lineBold : 'transparent'}` }}>
        <span style={{ fontFamily: t.font.display, fontWeight: 600, fontSize: 13, color: on ? p.ink : p.faint }}>{tr.placeSub.split(' · ')[1]}</span>
        <span style={{ fontFamily: F.mono, fontSize: 7.5, letterSpacing: 0.6, textTransform: 'uppercase', color: on ? p.accentText : p.faint }}>{tr.type} stay</span>
      </Press>; })}
  </div>;
}

const GREET = {
  helen: { home: 'We could…', now: 'Right now', photos: 'As it happened', back: 'The day, woven' },
  jonathan: { home: 'What now?', now: 'Conditions', photos: 'The record', back: 'What we did' },
  aurelia: { home: 'we could…', now: "who's around", photos: 'the roll', back: 'the day, braided' },
  rafa: { home: 'WHAT NOW?', now: 'RIGHT NOW', photos: 'MY PICTURES', back: 'OUR DAY' },
};
function Header({ t, who, setWho, tab, trip }) {
  const p = t.pal; const big = who === 'rafa';
  return <div style={{ flexShrink: 0, padding: '0 20px 12px' }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
      <div style={{ minWidth: 0 }}>
        <Mono s={9.5} c={p.accentText}>{trip.placeSub.toUpperCase()} · SAT</Mono>
        <div style={{ fontFamily: t.font.display, fontWeight: 600, fontSize: big ? 30 : 25, lineHeight: 1.02,
          letterSpacing: who === 'aurelia' ? 0 : -0.5, fontStyle: who === 'aurelia' ? 'italic' : 'normal', color: p.ink, marginTop: 5 }}>{GREET[who][tab]}</div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0, paddingTop: 2 }}>
        {ORDER.map((id) => { const on = id === who;
          return <Press key={id} onClick={() => setWho(id)} style={{ all: 'unset', cursor: 'pointer', borderRadius: 22, padding: 1.5, background: on ? p.accent : 'transparent' }}>
            <span style={{ display: 'block', opacity: on ? 1 : 0.5, transition: 'opacity .2s' }}><Avatar id={id} size={on ? 27 : 24} /></span></Press>; })}
      </div>
    </div>
  </div>;
}

// ── decision banners with soft vote ─────────────────────────────
function InboxBanner({ pr, t, who, onDecide, onVote }) {
  const p = t.pal; const trip = TRIPS[pr.tripId]; const s = trip && trip.pantry.find((x) => x.id === pr.spotId);
  if (!s) return null;
  const decider = DECIDERS.includes(who); const inVotes = pr.votes.includes(who);
  return <div style={{ flexShrink: 0, margin: '0 14px 10px', background: p.surface, border: `1px solid ${p.accent}`, borderRadius: Math.min(t.radius, 16), overflow: 'hidden' }}>
    <div style={{ display: 'flex', gap: 11, padding: 12 }}>
      <div style={{ width: 46, height: 46, flexShrink: 0, borderRadius: Math.min(t.radius, 10), background: `repeating-linear-gradient(135deg, ${shade(s.tint, 16)} 0 7px, ${shade(s.tint, -12)} 7px 14px)` }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Mono s={8.5} c={p.accentText}>{nameFor(pr.from, who).toUpperCase()} SUGGESTS · OPEN TIME</Mono>
        <div style={{ fontFamily: t.font.display, fontWeight: 600, fontSize: 15, color: p.ink, marginTop: 2, fontStyle: who === 'aurelia' ? 'italic' : 'normal' }}>{s.title}</div>
        {pr.note && <div style={{ fontSize: 11.5, color: p.muted, marginTop: 2, fontStyle: 'italic', lineHeight: 1.3 }}>“{pr.note}”</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
          <Mono s={8} c={p.faint}>{travelStr(s.travel).toUpperCase()}</Mono>
          {pr.votes.length > 0 && <><FaceRow ids={pr.votes} size={15} /><Mono s={8} c={p.good}>{pr.votes.length} IN</Mono></>}
        </div>
      </div>
    </div>
    <div style={{ display: 'flex', borderTop: `1px solid ${p.line}` }}>
      {decider ? <>
        <Press onClick={() => onDecide(pr.id, 'accepted')} style={{ all: 'unset', cursor: 'pointer', flex: 1.5, textAlign: 'center', padding: '11px', background: p.accent, color: p.accentInk, fontWeight: 700, fontSize: 13, fontFamily: t.font.body }}>Let’s go</Press>
        <Press onClick={() => onDecide(pr.id, 'declined')} style={{ all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', padding: '11px', color: p.muted, fontWeight: 600, fontSize: 13, fontFamily: t.font.body }}>Not now</Press>
      </> : <Press onClick={() => onVote(pr.id)} style={{ all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', padding: '11px',
        background: inVotes ? p.accent : 'transparent', color: inVotes ? p.accentInk : p.accentText, fontWeight: 700, fontSize: 13, fontFamily: t.font.body }}>
        {inVotes ? "You're in ✓" : "I'm in →"}</Press>}
    </div>
  </div>;
}
function MineBanner({ pr, t, who }) {
  const p = t.pal; const trip = TRIPS[pr.tripId]; const s = trip && trip.pantry.find((x) => x.id === pr.spotId);
  if (!s) return null;
  return <div style={{ flexShrink: 0, margin: '0 14px 10px', background: p.surface, border: `1px dashed ${p.lineBold}`, borderRadius: Math.min(t.radius, 14), padding: '10px 13px', display: 'flex', alignItems: 'center', gap: 10 }}>
    <span style={{ width: 8, height: 8, borderRadius: 8, background: p.accent, flexShrink: 0 }} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 12.5, color: p.ink }}>You suggested <b>{s.title}</b></div>
      <Mono s={8.5} c={p.faint}>WAITING ON {pr.to.map((x) => nameFor(x, who)).join(' · ').toUpperCase()}{pr.votes.length ? ' · ' + pr.votes.length + ' IN' : ''}</Mono>
    </div>
    <FaceRow ids={pr.to} size={18} />
  </div>;
}

// ── multi-select who-it's-for ───────────────────────────────────
function FilterWho({ t, sel, setSel }) {
  const p = t.pal;
  const presets = [['Everyone', []], ['Kids', KIDS], ['Adults', ADULTS]];
  const toggle = (id) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  return <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflowX: 'auto', paddingBottom: 2 }}>
    {presets.map(([lbl, arr]) => { const on = sameSet(sel, arr);
      return <Press key={lbl} onClick={() => setSel(arr)} style={{ all: 'unset', cursor: 'pointer', fontSize: 11.5, fontWeight: 700,
        padding: '6px 10px', borderRadius: 20, whiteSpace: 'nowrap', fontFamily: t.font.body, flexShrink: 0,
        background: on ? p.accent : p.surface, color: on ? p.accentInk : p.muted, border: `1px solid ${on ? p.accent : p.line}` }}>{lbl}</Press>; })}
    <span style={{ width: 1, height: 18, background: p.line, flexShrink: 0 }} />
    {ORDER.map((id) => { const on = sel.includes(id);
      return <Press key={id} onClick={() => toggle(id)} style={{ all: 'unset', cursor: 'pointer', flexShrink: 0, borderRadius: 22, padding: 1.5, background: on ? p.accent : 'transparent' }}>
        <span style={{ display: 'block', opacity: on ? 1 : 0.5 }}><Avatar id={id} size={on ? 23 : 22} /></span></Press>; })}
  </div>;
}
function FilterCat({ t, value, onChange }) {
  const p = t.pal;
  const cats = [['meal', 'A bite'], ['energy', 'Burn energy'], ['look', 'Aesthetic'], ['together', 'All of us']];
  return <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
    {cats.map(([k, lbl]) => { const on = k === value;
      return <Press key={k} onClick={() => onChange(on ? null : k)} style={{ all: 'unset', cursor: 'pointer', fontSize: 11, fontWeight: 600,
        padding: '6px 11px', borderRadius: 20, whiteSpace: 'nowrap', fontFamily: t.font.body, flexShrink: 0,
        background: on ? p.accent : 'transparent', color: on ? p.accentInk : p.muted, border: `1px solid ${on ? p.accent : p.line}` }}>{lbl}</Press>; })}
  </div>;
}

// weather toggle — a real condition the tray reacts to (demo control)
function WeatherChips({ t, tripId, weather, setWeather }) {
  const p = t.pal;
  return <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', marginBottom: 14 }}>
    <span style={{ flexShrink: 0 }}><Mono s={8} c={p.faint}>IF IT’S</Mono></span>
    {WEATHER[tripId].map(([k, lbl]) => { const on = k === weather;
      return <Press key={k} onClick={() => setWeather(k)} style={{ all: 'unset', cursor: 'pointer', fontSize: 10.5, fontWeight: 700,
        padding: '5px 10px', borderRadius: 20, whiteSpace: 'nowrap', fontFamily: t.font.body, flexShrink: 0,
        background: on ? p.ink : 'transparent', color: on ? p.bg : p.muted, border: `1px solid ${on ? p.ink : p.line}` }}>{lbl}</Press>; })}
  </div>;
}

// ── tappable pantry card (travel + event) ───────────────────────
function LiveCard({ s, t, onPropose, big, flag, dim }) {
  const p = t.pal; const cat = CAT[s.cat];
  if (big) return <Press onClick={onPropose} style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%', boxSizing: 'border-box',
    position: 'relative', borderRadius: 24, overflow: 'hidden', height: 152, marginBottom: 12, opacity: dim ? 0.5 : 1,
    background: `repeating-linear-gradient(135deg, ${shade(s.tint, 18)} 0 11px, ${shade(s.tint, -12)} 11px 22px)` }}>
    {s.event && <div style={{ position: 'absolute', top: 11, left: 12 }}><EventBadge ev={s.event} t={t} onPhoto /></div>}
    {flag && <div style={{ position: 'absolute', top: 11, right: 12 }}><FlagPill flag={flag} t={t} onPhoto /></div>}
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', background: 'linear-gradient(transparent, rgba(0,0,0,0.62))', padding: '24px 16px 14px' }}>
      <div style={{ fontFamily: t.font.display, fontWeight: 600, fontSize: 24, color: '#fff' }}>{s.title}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <FaceRow ids={s.forIds} size={22} />
        <span style={{ fontFamily: F.mono, fontSize: 9, color: 'rgba(255,255,255,0.85)' }}>{travelStr(s.travel).toUpperCase()}</span>
        <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.22)', padding: '7px 14px', borderRadius: 20 }}>Ask! →</span>
      </div>
    </div>
  </Press>;
  return <div style={{ background: p.surface, borderRadius: Math.min(t.radius, 16), overflow: 'hidden', border: `1px solid ${p.line}`, marginBottom: 11, opacity: dim ? 0.55 : 1 }}>
    <div style={{ position: 'relative' }}>
      <Photo tint={s.tint} h={78} round={0} label="PLACE" />
      {s.event && <div style={{ position: 'absolute', top: 8, left: 9 }}><EventBadge ev={s.event} t={t} onPhoto /></div>}
    </div>
    <div style={{ padding: '10px 12px 11px' }}>
      <Mono s={8} ls={0.9} c={cat.tint}>{cat.label}</Mono>
      <div style={{ fontFamily: t.font.display, fontWeight: 600, fontSize: 15, color: p.ink, marginTop: 3, lineHeight: 1.1, fontStyle: t.id === 'aurelia' ? 'italic' : 'normal' }}>{s.title}</div>
      <div style={{ fontSize: 11.5, lineHeight: 1.4, color: p.muted, marginTop: 5, textWrap: 'pretty' }}>{s.blurb}</div>
      {flag && <div style={{ marginTop: 7 }}><FlagPill flag={flag} t={t} /></div>}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, gap: 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          <FaceRow ids={s.forIds} size={18} />
          <Mono s={8.5} c={p.faint}>{travelStr(s.travel).toUpperCase()}</Mono>
        </span>
        <Press onClick={onPropose} style={{ all: 'unset', cursor: 'pointer', flexShrink: 0, fontSize: 11, fontWeight: 700, fontFamily: t.font.body, padding: '6px 13px', borderRadius: 20, background: p.accent, color: p.accentInk }}>Propose →</Press>
      </div>
    </div>
  </div>;
}

// ════════ HOME ═════════════════════════════════════════════════
function Home({ t, who, trip, openPropose, sel, setSel, catFilter, setCatFilter, setTab, now, weather, setWeather }) {
  const p = t.pal; const big = who === 'rafa';
  const ss = String(Math.floor(now / 1000) % 60).padStart(2, '0');
  const wl = weatherLine(trip.id, weather); const wmode = wl[3];
  const list = trip.pantry.filter((s) => comboFilter(s, sel) && (!catFilter || s.cat === catFilter));
  const ranked = rankPantry(list, wmode, trip.id);
  const latest = trip.moments[0];
  const oneOnOne = isOneOnOne(sel);
  return <div style={{ padding: '2px 16px 24px' }}>
    <div style={{ display: 'flex', gap: 11, background: p.surface, border: `1px solid ${p.line}`, borderRadius: Math.min(t.radius, 16), padding: 10, marginBottom: 12 }}>
      <div style={{ width: 64, flexShrink: 0 }}><Photo tint={trip.type === 'city' ? '#5a5a6a' : '#5c7a86'} h={64} round={Math.min(t.radius, 10)} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontFamily: t.font.display, fontWeight: 600, fontSize: 14, color: p.ink }}>{trip.place}</span>
          <span style={{ fontFamily: F.mono, fontSize: 11, color: p.accentText, fontVariantNumeric: 'tabular-nums' }}>9:41:{ss}</span>
        </div>
        <div style={{ fontSize: 11, color: p.muted, marginTop: 3, lineHeight: 1.35 }}>{wl[2]}</div>
        <div style={{ marginTop: 5 }}><Mono s={8.5} c={p.faint}>{trip.cond.map(([k, v]) => k + ' ' + v).join(' · ')}</Mono></div>
      </div>
    </div>
    <WeatherChips t={t} tripId={trip.id} weather={weather} setWeather={setWeather} />
    <Press onClick={() => setTab('now')} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: Math.min(t.radius, 13), border: `1px solid ${p.line}`, marginBottom: 16, width: '100%', boxSizing: 'border-box' }}>
      <Avatar id={latest.who} size={24} />
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
        <span style={{ fontSize: 12, color: p.ink }}><b>{nameFor(latest.who, who)}</b> · <span style={{ color: p.muted }}>{latest.cap}</span></span></div>
      <Mono s={8.5} c={p.faint}>NOW →</Mono>
    </Press>
    <Label t={t} accent>{big ? 'PICK A PLACE!' : 'WE COULD…'}</Label>
    {!big && <>
      <div style={{ marginBottom: 8, display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <Mono s={8.5} c={p.faint}>WHO’S IT FOR</Mono>
        <span style={{ fontSize: 10.5, color: p.muted }}>for <b style={{ color: p.ink }}>{comboLabel(sel)}</b>{oneOnOne ? ' · some one-on-one' : ''}</span>
      </div>
      <div style={{ marginBottom: 9 }}><FilterWho t={t} sel={sel} setSel={setSel} /></div>
    </>}
    <div style={{ marginBottom: 14 }}><FilterCat t={t} value={catFilter} onChange={setCatFilter} /></div>
    {wmode && <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: p.surface, border: `1px solid ${p.line}`, borderRadius: Math.min(t.radius, 12), padding: '10px 12px', marginBottom: 14 }}>
      <span style={{ width: 7, height: 7, borderRadius: 7, background: p.live, flexShrink: 0 }} />
      <span style={{ fontSize: 11.5, color: p.ink, lineHeight: 1.35 }}>{BANNER[wmode]}</span></div>}
    {list.length === 0
      ? <div style={{ textAlign: 'center', color: p.faint, fontSize: 12.5, padding: '18px 14px', fontStyle: 'italic', lineHeight: 1.5 }}>
          Nothing scoped for just <b style={{ color: p.muted }}>{comboLabel(sel)}</b> here. Try a different pair, or Everyone.</div>
      : ranked.map((o) => <LiveCard key={o.s.id} s={o.s} t={t} big={big} flag={o.flag} dim={o.dim} onPropose={() => openPropose(o.s)} />)}
    {list.length > 0 && <div style={{ textAlign: 'center', padding: '6px 0 2px' }}><Mono s={8.5} c={p.faint}>{list.length} NEARBY · NONE ON THE CLOCK</Mono></div>}
  </div>;
}

// ════════ NOW (conditions + on-for-now + surprises + presence) ══
function Now({ t, who, trip, accepted, now, weather }) {
  const p = t.pal; const ss = String(Math.floor(now / 1000) % 60).padStart(2, '0');
  const wl = weatherLine(trip.id, weather);
  const kept = trip.surprises.filter((s) => s.by === who);
  const teased = trip.surprises.filter((s) => s.hideFrom.includes(who) && s.by !== who);
  return <div style={{ padding: '2px 18px 24px' }}>
    <div style={{ background: p.surface, border: `1px solid ${p.line}`, borderRadius: Math.min(t.radius, 16), padding: '14px 16px', marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Mono s={9} c={p.accentText}>{trip.type === 'beach' ? 'THE DAY, BY LIGHT & TIDE' : 'THE DAY, BY LIGHT'}</Mono>
        <span style={{ fontFamily: F.mono, fontSize: 12, color: p.ink, fontVariantNumeric: 'tabular-nums' }}>9:41:{ss}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        {trip.cond.map(([k, v]) => <div key={k} style={{ flex: 1 }}>
          <div style={{ fontFamily: F.mono, fontSize: 13, fontWeight: 700, color: p.ink }}>{v}</div><Mono s={7.5} c={p.faint}>{k}</Mono></div>)}
      </div>
      <div style={{ marginTop: 11, paddingTop: 10, borderTop: `1px solid ${p.line}` }}><Mono s={8.5} c={wl[3] ? p.live : p.faint}>{wl[2].toUpperCase()}</Mono></div>
    </div>
    <Label t={t} accent>On for now</Label>
    {accepted.length === 0
      ? <div style={{ color: p.faint, fontSize: 12.5, fontStyle: 'italic', padding: '4px 0 18px' }}>Nothing locked in. That’s allowed — propose something and it lands here.</div>
      : <div style={{ marginBottom: 18 }}>{accepted.map((pr) => { const s = trip.pantry.find((x) => x.id === pr.spotId); if (!s) return null;
          return <div key={pr.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 0', borderBottom: `1px solid ${p.line}` }}>
            <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: Math.min(t.radius, 9), background: `repeating-linear-gradient(135deg, ${shade(s.tint, 16)} 0 6px, ${shade(s.tint, -12)} 6px 12px)` }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: t.font.display, fontWeight: 600, fontSize: 14, color: p.ink, fontStyle: who === 'aurelia' ? 'italic' : 'normal' }}>{s.title}</div>
              <Mono s={8} c={p.good}>{nameFor(pr.from, who).toUpperCase()}’S IDEA · {travelStr(s.travel).toUpperCase()}</Mono>
            </div>
            <span style={{ width: 7, height: 7, borderRadius: 7, background: p.good }} />
          </div>; })}</div>}
    {(kept.length > 0 || teased.length > 0) && <>
      <Label t={t}>Kept quiet</Label>
      {kept.map((s) => <div key={s.id} style={{ background: p.surface, border: `1px solid ${p.line}`, borderRadius: Math.min(t.radius, 13), padding: '11px 13px', marginBottom: 9 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Mono s={8.5} c={p.accentText}>YOU’RE KEEPING</Mono>
          <Mono s={8} c={p.faint}>FROM {s.hideFrom.map((x) => nameFor(x, who)).join(' · ').toUpperCase()}</Mono></div>
        <div style={{ fontFamily: t.font.display, fontWeight: 600, fontSize: 15, color: p.ink, marginTop: 4, fontStyle: who === 'aurelia' ? 'italic' : 'normal' }}>{s.title}</div>
        <div style={{ fontSize: 11.5, color: p.muted, marginTop: 2 }}>{s.blurb}</div>
        <div style={{ marginTop: 7 }}><Mono s={8} c={p.faint}>REVEALS · {s.reveal.toUpperCase()}</Mono></div>
      </div>)}
      {teased.map((s) => <div key={s.id} style={{ background: p.surface, border: `1px dashed ${p.lineBold}`, borderRadius: Math.min(t.radius, 13), padding: '11px 13px', marginBottom: 9, display: 'flex', alignItems: 'center', gap: 11 }}>
        <span style={{ width: 34, height: 34, borderRadius: Math.min(t.radius, 9), flexShrink: 0, background: p.raise, display: 'flex', alignItems: 'center', justifyContent: 'center', color: p.faint, fontSize: 15 }}>✦</span>
        <div style={{ flex: 1 }}>
          <Mono s={8.5} c={p.accentText}>SOMETHING’S COMING</Mono>
          <div style={{ marginTop: 4, height: 9, width: '62%', borderRadius: 5, background: `repeating-linear-gradient(90deg, ${p.lineBold} 0 6px, transparent 6px 11px)`, filter: 'blur(0.4px)' }} />
          <div style={{ marginTop: 6 }}><Mono s={8} c={p.faint}>REVEALS · {s.reveal.toUpperCase()}</Mono></div>
        </div>
      </div>)}
    </>}
    <Label t={t}>Who’s around</Label>
    {ORDER.map((id) => { const pr = trip.presence[id]; const live = pr.dotMood === 'live';
      return <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0' }}>
        <div style={{ position: 'relative' }}><Avatar id={id} size={30} />
          <span style={{ position: 'absolute', right: -1, bottom: -1, width: 9, height: 9, borderRadius: 9, background: live ? p.live : p.good, boxShadow: `0 0 0 2px ${p.bg}` }} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 12.5, color: p.ink }}>{nameFor(id, who)} <span style={{ color: p.faint, fontWeight: 400 }}>· {pr.where}</span></div>
          <div style={{ fontSize: 11.5, color: p.muted }}>{pr.what}</div></div></div>; })}
  </div>;
}

// ════════ PHOTOS ═══════════════════════════════════════════════
function Photos({ t, who, trip, accepted }) {
  const p = t.pal;
  const base = trip.type === 'beach'
    ? [{ tint: '#9c8a5a', cap: 'Gary', who: ['rafa'] }, { tint: '#6e5b49', cap: 'screen door, 4pm', who: ['aurelia'] }, { tint: '#7a6038', cap: 'a dozen down', who: ['jonathan'] }, { tint: '#54616a', cap: 'tide going out', who: ['rafa', 'aurelia'] }, { tint: '#8a6a4a', cap: 'the long nap', who: ['helen'] }]
    : [{ tint: '#6a6a7a', cap: 'the tower', who: ['rafa'] }, { tint: '#7a5b6a', cap: 'milwaukee ave', who: ['aurelia'] }, { tint: '#5a6a7a', cap: 'the L platform', who: ['jonathan', 'rafa'] }, { tint: '#6e5b49', cap: 'good coffee', who: ['jonathan'] }, { tint: '#7a6a8a', cap: 'skyline, dusk', who: ['aurelia', 'helen'] }];
  const fromPicks = accepted.map((pr) => { const s = trip.pantry.find((x) => x.id === pr.spotId); return s ? { tint: s.tint, cap: s.title, who: s.forIds.slice(0, 3), from: s.title } : null; }).filter(Boolean);
  const all = [...fromPicks, ...base];
  return <div style={{ padding: '2px 16px 24px' }}>
    <Label t={t} accent>As it happened</Label>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {all.map((it, i) => <div key={i} style={{ position: 'relative', gridColumn: i === 0 && fromPicks.length ? 'span 2' : 'auto' }}>
        <Photo tint={it.tint} h={i === 0 && fromPicks.length ? 116 : 100} cap={it.cap} round={Math.min(t.radius, 12)} />
        <div style={{ position: 'absolute', top: 7, right: 7 }}><FaceRow ids={it.who} size={17} /></div>
        {it.from && <div style={{ position: 'absolute', left: 7, bottom: 7, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)', borderRadius: 20, padding: '3px 8px' }}>
          <span style={{ fontFamily: F.mono, fontSize: 8, color: '#fff', letterSpacing: 0.3 }}>FROM · {it.from.toUpperCase()}</span></div>}
      </div>)}
    </div>
  </div>;
}

// ════════ BACK ═════════════════════════════════════════════════
function Back({ t, who, trip, accepted }) {
  const p = t.pal;
  const beats = trip.type === 'beach'
    ? [{ who: 'jonathan', kind: 'LOG', body: '12 oysters · 1 nap · 0 plans', verb: 'tracked' }, { who: 'helen', kind: 'WORDS', body: 'Nobody knew what day it was. Good.', verb: 'kept' }, { who: 'aurelia', kind: 'FRAME', body: 'the screen door at 4pm', tint: '#6e5b49', verb: 'shot' }, { who: 'rafa', kind: 'VOICE', body: '“His name is Gary and he is my best friend.”', verb: 'said' }]
    : [{ who: 'jonathan', kind: 'LOG', body: '3 trains · 1 deep dish · 0 plans', verb: 'tracked' }, { who: 'helen', kind: 'WORDS', body: 'We just walked until something looked good.', verb: 'kept' }, { who: 'aurelia', kind: 'FRAME', body: 'the skyline going gold', tint: '#7a6a8a', verb: 'shot' }, { who: 'rafa', kind: 'VOICE', body: '“My tower was taller than the buildings.”', verb: 'said' }];
  return <div style={{ padding: '2px 16px 24px' }}>
    <Label t={t} accent>The day, braided</Label>
    <div style={{ position: 'relative', marginBottom: 6 }}>
      <div style={{ position: 'absolute', left: 14, top: 6, bottom: 6, width: 2, background: p.line }} />
      {beats.map((b, i) => <div key={i} style={{ display: 'flex', gap: 13, position: 'relative', paddingBottom: 12 }}>
        <div style={{ width: 30, flexShrink: 0, display: 'flex', justifyContent: 'center', zIndex: 1 }}><Avatar id={b.who} size={30} /></div>
        <div style={{ flex: 1, background: p.surface, border: `1px solid ${p.line}`, borderRadius: Math.min(t.radius, 12), padding: '10px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Mono s={8} c={T[b.who].dot}>{nameFor(b.who, who).toUpperCase()} {b.verb.toUpperCase()}</Mono><Mono s={8} c={p.faint}>{b.kind}</Mono></div>
          {b.kind === 'FRAME' ? <div style={{ marginTop: 7 }}><Photo tint={b.tint} h={64} cap={b.body} round={8} /></div>
            : <div style={{ fontSize: b.kind === 'LOG' ? 12 : 13, marginTop: 6, lineHeight: 1.35, color: p.ink, fontFamily: b.kind === 'LOG' ? F.mono : t.font.display, fontStyle: (b.kind === 'WORDS' || b.kind === 'VOICE') ? 'italic' : 'normal' }}>{b.body}</div>}
        </div></div>)}
    </div>
    <Label t={t}>What we ended up doing</Label>
    {accepted.length === 0
      ? <div style={{ color: p.faint, fontSize: 12.5, fontStyle: 'italic', padding: '2px 0 12px' }}>Nothing yet. Whatever you say “let’s go” to lands here — the trip, written as you lived it.</div>
      : accepted.map((pr) => { const s = trip.pantry.find((x) => x.id === pr.spotId); if (!s) return null;
        return <div key={pr.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderBottom: `1px solid ${p.line}` }}>
          <span style={{ width: 9, height: 9, borderRadius: 9, background: p.accent, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontFamily: t.font.display, fontWeight: 600, fontSize: 13.5, color: p.ink, fontStyle: who === 'aurelia' ? 'italic' : 'normal' }}>{s.title}</span>
            <Mono s={8} c={p.faint} style={{ marginLeft: 8 }}>{nameFor(pr.from, who).toUpperCase()}’S IDEA</Mono></div>
          <FaceRow ids={pr.to.concat(pr.from)} size={16} />
        </div>; })}
    <Press onClick={() => {}} style={{ all: 'unset', cursor: 'pointer', display: 'block', textAlign: 'center', marginTop: 16, padding: '12px', borderRadius: Math.min(t.radius, 14), background: p.accent, color: p.accentInk, fontWeight: 700, fontSize: 13, fontFamily: t.font.body, width: '100%', boxSizing: 'border-box' }}>Keep this day → the book</Press>
  </div>;
}

// ── propose sheet ───────────────────────────────────────────────
const NOTE_PH = { rafa: 'i want to go!!', aurelia: 'can we pls', helen: 'easy one?', jonathan: 'good window now' };
function ProposeSheet({ spot, t, who, onClose, onSend }) {
  const p = t.pal; const [show, setShow] = useState(false);
  const [sel, setSel] = useState(() => { const base = spot.forIds.filter((x) => x !== who); return base.length ? base : ORDER.filter((x) => x !== who); });
  const [note, setNote] = useState('');
  useEffect(() => { const r = requestAnimationFrame(() => setShow(true)); return () => cancelAnimationFrame(r); }, []);
  const close = () => { setShow(false); setTimeout(onClose, 240); };
  const toggle = (id) => setSel((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const others = ORDER.filter((id) => id !== who);
  return <div style={{ position: 'absolute', inset: 0, zIndex: 30, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
    <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', opacity: show ? 1 : 0, transition: 'opacity .24s' }} />
    <div style={{ position: 'relative', background: p.bg2, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderTop: `1px solid ${p.line}`,
      padding: '8px 18px 22px', transform: show ? 'translateY(0)' : 'translateY(100%)', transition: 'transform .28s cubic-bezier(.2,.8,.2,1)', maxHeight: '88%', overflowY: 'auto' }}>
      <div style={{ width: 38, height: 4, borderRadius: 4, background: p.lineBold, margin: '6px auto 16px' }} />
      <Mono s={9} c={p.accentText}>SUGGEST · OPEN TIME</Mono>
      <div style={{ display: 'flex', gap: 12, marginTop: 10, alignItems: 'center' }}>
        <div style={{ width: 56, height: 56, flexShrink: 0, borderRadius: Math.min(t.radius, 12), background: `repeating-linear-gradient(135deg, ${shade(spot.tint, 16)} 0 8px, ${shade(spot.tint, -12)} 8px 16px)` }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: t.font.display, fontWeight: 600, fontSize: 18, color: p.ink, fontStyle: who === 'aurelia' ? 'italic' : 'normal' }}>{spot.title}</div>
          <div style={{ fontSize: 11.5, color: p.muted, marginTop: 2 }}>{travelStr(spot.travel)} · {spot.when}</div>
        </div>
        {spot.event && <EventBadge ev={spot.event} t={t} />}
      </div>
      <div style={{ marginTop: 18 }}><Mono s={9} c={p.faint}>SEND TO</Mono></div>
      <div style={{ display: 'flex', gap: 8, marginTop: 9, flexWrap: 'wrap' }}>
        {others.map((id) => { const on = sel.includes(id);
          return <Press key={id} onClick={() => toggle(id)} style={{ all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '6px 12px 6px 6px', borderRadius: 22, background: on ? p.raise : 'transparent', border: `1px solid ${on ? p.accent : p.line}` }}>
            <Avatar id={id} size={20} /><span style={{ fontSize: 12.5, fontWeight: 600, color: on ? p.ink : p.muted }}>{nameFor(id, who)}</span>
            {on && <span style={{ color: p.accent, fontSize: 12 }}>✓</span>}</Press>; })}
      </div>
      <div style={{ marginTop: 18 }}><Mono s={9} c={p.faint}>A NOTE (OPTIONAL)</Mono></div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={NOTE_PH[who] || 'add a note'}
        style={{ width: '100%', marginTop: 9, boxSizing: 'border-box', background: p.surface, border: `1px solid ${p.line}`, borderRadius: Math.min(t.radius, 12),
          padding: '13px 14px', color: p.ink, fontSize: 14, fontFamily: t.font.display, fontStyle: 'italic', outline: 'none' }} />
      <Press onClick={() => sel.length && onSend(spot.id, sel, note)} style={{ all: 'unset', cursor: sel.length ? 'pointer' : 'default', display: 'block', textAlign: 'center',
        marginTop: 18, padding: '14px', borderRadius: Math.min(t.radius, 14), background: sel.length ? p.accent : p.surface, color: sel.length ? p.accentInk : p.faint, fontWeight: 700, fontSize: 14, fontFamily: t.font.body, width: '100%', boxSizing: 'border-box' }}>Send it →</Press>
      <div style={{ fontSize: 11, color: p.faint, textAlign: 'center', fontStyle: 'italic', marginTop: 11 }}>A suggestion, not a booking. {DECIDERS.includes(who) ? 'You can just go, too.' : 'They still call it.'}</div>
    </div>
  </div>;
}

const TABS = [['home', 'We could'], ['now', 'Now'], ['photos', 'Photos'], ['back', 'Look back']];
function TabBar({ t, tab, setTab, badge }) {
  const p = t.pal;
  return <div style={{ flexShrink: 0, display: 'flex', padding: '8px 8px 18px', borderTop: `1px solid ${p.line}`, background: p.bg, gap: 2 }}>
    {TABS.map(([k, lbl]) => { const on = k === tab;
      return <Press key={k} onClick={() => setTab(k)} style={{ all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', padding: '7px 2px', borderRadius: 12, position: 'relative',
        background: on ? (t.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)') : 'transparent' }}>
        <div style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: 600, color: on ? p.ink : p.faint }}>{lbl}</div>
        {k === 'home' && badge > 0 && <span style={{ position: 'absolute', top: 4, right: '24%', width: 7, height: 7, borderRadius: 7, background: p.accent }} />}
      </Press>; })}
  </div>;
}
function Toast({ t, msg }) {
  const p = t.pal;
  return <div style={{ position: 'absolute', left: '50%', bottom: 74, transform: 'translateX(-50%)', zIndex: 40, background: p.ink, color: p.bg,
    padding: '10px 18px', borderRadius: 22, fontSize: 12.5, fontWeight: 600, fontFamily: t.font.body, whiteSpace: 'nowrap', boxShadow: '0 8px 24px rgba(0,0,0,0.35)', animation: 'hgToast .26s ease' }}>{msg}</div>;
}

Object.assign(window, { HG_LiveApp: LiveApp });
ReactDOM.createRoot(document.getElementById('root')).render(<LiveApp />);
