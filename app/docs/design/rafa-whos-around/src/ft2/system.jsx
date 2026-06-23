// src/ft2/system.jsx — Family Trips redesign v2 — shared system
// One trip-data spine. Four worlds. Each traveler gets its own type, palette,
// radius and motion personality. Everything below is consumed by the four flows.

// ════════════════════════════════════════════════════════════════
// TYPE — font stacks (loaded once, see injectFonts)
// ════════════════════════════════════════════════════════════════
const FONTS = {
  fraunces: '"Fraunces", "Iowan Old Style", Georgia, serif',
  inter: '"Inter Tight", -apple-system, system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
  instrument: '"Instrument Serif", "Times New Roman", serif',
  fredoka: '"Fredoka", "Inter Tight", system-ui, sans-serif',
};

function injectFonts() {
  if (typeof document === 'undefined' || document.getElementById('ft2-fonts')) return;
  const l = document.createElement('link');
  l.id = 'ft2-fonts';
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?' +
    'family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;0,9..144,900;1,9..144,400;1,9..144,500;1,9..144,600&' +
    'family=Inter+Tight:wght@400;500;600;700&' +
    'family=JetBrains+Mono:wght@400;500;600;700&' +
    'family=Instrument+Serif:ital@0;1&' +
    'family=Fredoka:wght@400;500;600;700&display=swap';
  document.head.appendChild(l);
}
injectFonts();

// ════════════════════════════════════════════════════════════════
// TRAVELERS — four worlds
// dot = constant person-identity color (so people read across lenses)
// ════════════════════════════════════════════════════════════════
const TRAVELERS = {
  jonathan: {
    id: 'jonathan', name: 'Jonathan', role: 'Ops', verb: 'Command',
    age: 'Dad', initial: 'J', dot: '#2E6BB8',
    font: { display: FONTS.fraunces, body: FONTS.inter, mono: FONTS.mono, ui: FONTS.inter },
    radius: 2,
    pal: {
      bg: '#0E0F11', bg2: '#15171A', surface: '#1C1E22', raise: '#24262B',
      ink: '#EDE6D6', muted: 'rgba(237,230,214,0.60)', faint: 'rgba(237,230,214,0.32)',
      line: 'rgba(237,230,214,0.14)', lineBold: 'rgba(237,230,214,0.30)',
      accent: '#E0654F', accentText: '#EC8770', accentInk: '#16100C',
      live: '#E0654F', good: '#7FB069',
    },
    dark: true,
  },
  helen: {
    id: 'helen', name: 'Helen', role: 'Keeper', verb: 'Remember',
    age: 'Mom', initial: 'H', dot: '#2E7D52',
    font: { display: FONTS.fraunces, body: FONTS.inter, mono: FONTS.mono, ui: FONTS.inter },
    radius: 18,
    pal: {
      bg: '#F4F0E7', bg2: '#ECE6D9', surface: '#FFFFFF', raise: '#FBF8F1',
      ink: '#1C2A21', muted: 'rgba(28,42,33,0.62)', faint: 'rgba(28,42,33,0.34)',
      line: 'rgba(28,42,33,0.12)', lineBold: 'rgba(28,42,33,0.22)',
      accent: '#2E7D52', accentText: '#256B45', accentInk: '#FFFFFF',
      live: '#C2603A', good: '#2E7D52',
    },
    dark: false,
  },
  aurelia: {
    id: 'aurelia', name: 'Aurelia', role: 'Her roll', verb: 'Send',
    age: '13', initial: 'A', dot: '#E8478C',
    font: { display: FONTS.instrument, body: FONTS.inter, mono: FONTS.mono, ui: FONTS.inter },
    radius: 4,
    pal: {
      bg: '#0B0A0C', bg2: '#141215', surface: '#1A171B', raise: '#241F26',
      ink: '#F3EEE9', muted: 'rgba(243,238,233,0.56)', faint: 'rgba(243,238,233,0.30)',
      line: 'rgba(243,238,233,0.12)', lineBold: 'rgba(243,238,233,0.24)',
      accent: '#FF3D78', accentText: '#FF5C8E', accentInk: '#0B0A0C',
      live: '#FF3D78', good: '#C7B5FF',
    },
    dark: true,
  },
  rafa: {
    id: 'rafa', name: 'Rafa', role: 'Mission', verb: 'Play',
    age: '4', initial: 'R', dot: '#E8552E',
    font: { display: FONTS.fredoka, body: FONTS.fredoka, mono: FONTS.mono, ui: FONTS.fredoka },
    radius: 24,
    pal: {
      bg: '#1B1108', bg2: '#28190C', surface: '#33200F', raise: '#41290F',
      ink: '#FFF3DF', muted: 'rgba(255,243,223,0.74)', faint: 'rgba(255,243,223,0.42)',
      line: 'rgba(255,243,223,0.16)', lineBold: 'rgba(255,243,223,0.30)',
      accent: '#FFB12E', accentText: '#FFC247', accentInk: '#1B1108',
      live: '#FF6B4D', good: '#4CC36E',
      sticker: ['#FFB12E', '#3DA5E0', '#4CC36E', '#FF6B4D', '#C77DFF'],
    },
    dark: true,
  },
};
const TRAVELER_LIST = ['jonathan', 'helen', 'aurelia', 'rafa'];

// ════════════════════════════════════════════════════════════════
// TRIP DATA — the shared spine (Rafa's 5th Birthday Weekend)
// ════════════════════════════════════════════════════════════════
const TRIP = {
  id: 'rafa-5', title: "Rafa's 5th Birthday", subtitle: 'A long weekend in New York',
  dateRange: 'May 1–3, 2026', start: 'Belmont, MA', end: 'New York, NY',
  days: [
    {
      n: 1, label: 'DAY ONE', date: 'Fri May 1', name: 'Converging on Murray Hill',
      stops: [
        { id: 's1', time: '3:15 PM', kind: 'DRIVE', title: 'School pickup → the road',
          desc: 'Helen collects Aurelia and Rafa. Four hours south to the city.',
          loc: 'Belmont, MA', lat: 14, lng: 18, for: ['helen', 'aurelia', 'rafa'], memCount: 3 },
        { id: 's2', time: '5:17 PM', kind: 'ARRIVAL', title: 'DL 4961 lands at LaGuardia',
          desc: 'Jonathan inbound from Indianapolis. Curbside reunion.',
          loc: 'LaGuardia, Queens', lat: 36, lng: 40, for: ['jonathan'], memCount: 1 },
        { id: 's3', time: '7:00 PM', kind: 'LODGING', title: '40 E 38th St — the Airbnb',
          desc: 'All four under one roof for the first time in two weeks.',
          loc: 'Murray Hill', lat: 58, lng: 56, for: ['jonathan', 'helen', 'aurelia', 'rafa'], memCount: 4 },
      ],
    },
    {
      n: 2, label: 'DAY TWO', date: 'Sat May 2', name: 'Manhattan from dawn',
      stops: [
        { id: 's4', time: '9:00 AM', kind: 'BREAKFAST', title: 'Grand Brasserie',
          desc: 'Inside Vanderbilt Hall. French classics, with Maida & James.',
          loc: 'Grand Central', lat: 54, lng: 50, for: ['jonathan', 'helen', 'aurelia', 'rafa'], memCount: 2 },
        { id: 's5', time: '10:30 AM', kind: 'SIGHTS', title: 'Empire State Building',
          desc: 'Tentative — a cousin may have discounted tickets.',
          loc: '350 5th Ave', lat: 50, lng: 46, for: ['jonathan', 'helen', 'aurelia', 'rafa'], memCount: 0, tentative: true },
        { id: 's6', time: '2:00 PM', kind: 'SHOW', title: 'The Lion King',
          desc: 'Minskoff Theatre matinee. Seats running low — decide today.',
          loc: 'Minskoff Theatre', lat: 44, lng: 38, for: ['jonathan', 'helen', 'aurelia', 'rafa'], memCount: 0, decide: true },
      ],
    },
    {
      n: 3, label: 'DAY THREE', date: 'Sun May 3', name: 'Monster truck day',
      stops: [
        { id: 's7', time: '2:30 PM', kind: 'MAIN EVENT', title: 'Hot Wheels Monster Trucks LIVE',
          desc: "Rafa's whole weekend bends toward this. Glow-N-Fire show.",
          loc: 'Bridgeport, CT', lat: 78, lng: 30, for: ['rafa', 'jonathan', 'helen', 'aurelia'], memCount: 0, anchor: true },
      ],
    },
  ],
};

// Memories keyed by stop id
const MEMORIES = {
  s1: [
    { id: 'm1', author: 'aurelia', time: '3:18 PM', kind: 'photo', tint: '#7A6A54',
      caption: "rafa pretending he didn't pack his backpack",
      reactions: [{ by: 'helen', emoji: '😅' }, { by: 'jonathan', emoji: '❤️' }] },
    { id: 'm2', author: 'helen', time: '3:22 PM', kind: 'voice', duration: 14,
      transcript: "We're officially on the road. Rafa says he's going to see REAL monster trucks.",
      reactions: [{ by: 'jonathan', emoji: '🚗' }] },
    { id: 'm3', author: 'rafa', time: '3:24 PM', kind: 'photo', tint: '#8A6A3A',
      caption: 'MY BACKPACK', reactions: [{ by: 'aurelia', emoji: '😂' }, { by: 'helen', emoji: '🎒' }] },
  ],
  s2: [
    { id: 'm4', author: 'jonathan', time: '5:31 PM', kind: 'photo', tint: '#5A6470',
      caption: 'wheels down LGA. helen waiting curbside.', reactions: [{ by: 'helen', emoji: '👋' }] },
  ],
  s3: [
    { id: 'm5', author: 'helen', time: '6:45 PM', kind: 'text',
      body: 'All four of us under one roof for the first time in two weeks. Rafa fell asleep on the couch in his coat.',
      reactions: [{ by: 'jonathan', emoji: '🥹' }, { by: 'aurelia', emoji: '💤' }] },
    { id: 'm6', author: 'jonathan', time: '7:02 PM', kind: 'photo', tint: '#3E4A5C', caption: 'view from the airbnb', reactions: [] },
    { id: 'm7', author: 'aurelia', time: '7:18 PM', kind: 'photo', tint: '#6E5A6A',
      caption: 'this elevator is older than mom', reactions: [{ by: 'helen', emoji: '🙄' }, { by: 'jonathan', emoji: '😂' }] },
    { id: 'm8', author: 'rafa', time: '7:20 PM', kind: 'voice', duration: 6,
      transcript: 'I want pizza. I want pizza. I want pizza.', reactions: [{ by: 'aurelia', emoji: '🍕' }] },
  ],
  s4: [
    { id: 'm9', author: 'helen', time: '9:34 AM', kind: 'photo', tint: '#7A6448',
      caption: 'maida + james · grand central is unreal at this hour', reactions: [{ by: 'jonathan', emoji: '✨' }] },
    { id: 'm10', author: 'aurelia', time: '9:51 AM', kind: 'text',
      body: 'the egg thing was good. the room was prettier than the food.', reactions: [] },
  ],
};

// Past trips (for trips-list + resurfacing)
const PAST_TRIPS = [
  { id: 'cape-24', title: 'Cape Cod', sub: 'August 2024', range: 'Aug 2024', tint: '#5E7A86', mem: 41, days: 5 },
  { id: 'verm-23', title: 'Vermont leaf-peeping', sub: 'October 2023', range: 'Oct 2023', tint: '#7A6A3A', mem: 28, days: 3 },
  { id: 'fla-23', title: 'Disney World', sub: 'March 2023', range: 'Mar 2023', tint: '#4F7A8A', mem: 67, days: 6 },
];

// One-year-ago resurfaced memory (Helen's hero)
const RESURFACED = {
  trip: 'Cape Cod', when: 'One year ago today', date: 'May 3, 2025',
  author: 'helen', tint: '#6E8590',
  caption: 'Rafa learned to skip a stone. Took him forty tries. He counted every one.',
  withWho: ['rafa', 'aurelia', 'jonathan'],
};

// Aurelia's private roll — her own shots, with EXIF-ish meta. private=only she sees
const ROLL = [
  { id: 'r1', tint: '#6E5A6A', fav: true,  meta: 'f/1.8 · 1/120 · ISO 400', loc: 'Murray Hill', time: '7:18 PM', cap: 'this elevator is older than mom', mood: 'gold' },
  { id: 'r2', tint: '#46505E', fav: false, meta: 'f/2.0 · 1/60 · ISO 800',  loc: 'FDR Drive',   time: '5:55 PM', cap: 'window seat the whole way down', mood: 'blue' },
  { id: 'r3', tint: '#7A6448', fav: true,  meta: 'f/1.8 · 1/250 · ISO 200', loc: 'Grand Central', time: '9:34 AM', cap: 'the ceiling. the actual ceiling.', mood: 'gold' },
  { id: 'r4', tint: '#5C4A52', fav: false, meta: 'f/2.4 · 1/90 · ISO 640',  loc: 'Airbnb',     time: '8:10 PM', cap: 'rafa asleep in his coat', mood: 'warm' },
  { id: 'r5', tint: '#4A5A50', fav: true,  meta: 'f/1.8 · 1/160 · ISO 320', loc: '5th Ave',    time: '10:40 AM', cap: 'looked up. kept looking up.', mood: 'green' },
  { id: 'r6', tint: '#6A5440', fav: false, meta: 'f/2.0 · 1/200 · ISO 250', loc: 'GCT',        time: '9:50 AM', cap: 'the egg thing (it was fine)', mood: 'warm' },
];

// Helpers
function memoriesFor(stopId) { return MEMORIES[stopId] || []; }
function allStops() { return TRIP.days.flatMap(d => d.stops); }
function stopById(id) { return allStops().find(s => s.id === id); }

// ── NAVIGATION ── each person's preferred maps app (brief: Jonathan→Waze,
// Helen & Aurelia→Apple Maps, Rafa rides along). Tapping a place hands off.
const NAV_APP = { jonathan: 'Waze', helen: 'Apple Maps', aurelia: 'Apple Maps', rafa: 'Apple Maps' };
function navUrl(loc, traveler) {
  const q = encodeURIComponent(loc);
  return (NAV_APP[traveler] === 'Waze') ? `https://waze.com/ul?q=${q}&navigate=yes` : `https://maps.apple.com/?q=${q}`;
}
function openNav(loc, traveler) {
  try { window.open(navUrl(loc, traveler), '_blank', 'noopener'); } catch (e) {}
}

// ── THINGS TO DO ── shared, everyone sees them. Hero imagery. Add to the trip.
const THINGS_TO_DO = [
  { id: 'td1', title: 'The High Line', cat: 'WALK', tint: '#5E7A6A', mins: '60 min', loc: 'Chelsea', blurb: 'Elevated park over the old rail line — easy with a stroller.', for: ['helen', 'aurelia'] },
  { id: 'td2', title: 'FAO Schwarz', cat: 'KIDS', tint: '#C24B2E', mins: '45 min', loc: 'Rockefeller', blurb: 'The giant floor piano. Rafa will lose his mind.', for: ['rafa'] },
  { id: 'td3', title: 'The Met', cat: 'MUSEUM', tint: '#7A6448', mins: '2 hr', loc: '5th Ave', blurb: 'Arms & armor hall is the kid-winner. Pay-what-you-wish for NY.', for: ['helen', 'jonathan', 'aurelia'] },
  { id: 'td4', title: 'Grimaldi’s', cat: 'EAT', tint: '#5A6470', mins: '1 hr', loc: 'DUMBO', blurb: 'Coal-oven pizza under the bridge. Cash only.', for: ['jonathan', 'helen', 'aurelia', 'rafa'] },
];

// ── WHO IS IN EACH PHOTO ── ("show me, me" — greenfield recognizer.
// Today the app only knows who UPLOADED; this knows who's IN the frame.)
const IN_PHOTO = {
  m1: ['rafa', 'aurelia'], m3: ['rafa'], m4: ['jonathan'],
  m6: [], m7: ['aurelia'], m9: ['helen', 'aurelia', 'rafa', 'jonathan'],
};
// All photo memories across the trip, flattened with their stop.
function allPhotos() {
  const out = [];
  TRIP.days.forEach(d => d.stops.forEach(s => memoriesFor(s.id).forEach(m => {
    if (m.kind === 'photo') out.push({ ...m, stop: s, day: d, people: IN_PHOTO[m.id] || [m.author] });
  })));
  return out;
}
function photosWith(travelerId) { return allPhotos().filter(p => p.people.includes(travelerId)); }

// ── RAFA'S HIGHLIGHT REEL ── "coolest moments": videos AND photos, mixed
const RAFA_MOVIES = [
  { id: 'mv1', title: 'MONSTER\nTRUCKS', emoji: '🚛', tint: '#C24B2E', dur: '2:14', when: 'Sunday', label: 'The Glow-N-Fire show!', video: true },
  { id: 'mv2', title: 'GIANT\nTOWER', emoji: '🧱', tint: '#3DA5E0', dur: '0:48', when: 'Saturday night', label: 'My huge Lego tower!', video: true },
  { id: 'mv3', title: 'BIG\nBALLOONS', emoji: '🎈', tint: '#4CC36E', dur: '1:02', when: 'Saturday', label: 'Balloons on the skyscraper!', video: true },
  { id: 'mv4', title: 'PIZZA', emoji: '🍕', tint: '#FFB12E', count: 8, when: 'Friday', label: 'Pizza night!', video: false },
  { id: 'mv5', title: 'TRAIN', emoji: '🚂', tint: '#C77DFF', dur: '0:33', when: 'Saturday', label: 'The giant train station!', video: true },
  { id: 'mv6', title: 'LION', emoji: '🦁', tint: '#E0894A', count: 5, when: 'Saturday', label: 'The lion show!', video: false },
];

// ── AURELIA'S LIVE MAP ── trip progress + viral content from places.
// Where she is right now on the trip (drives past/here/next status):
const CURRENT_STOP = 's4';
function stopStatus(stopId) {
  const ids = allStops().map(s => s.id);
  const cur = ids.indexOf(CURRENT_STOP), i = ids.indexOf(stopId);
  return i < cur ? 'past' : i === cur ? 'here' : 'next';
}
// Trending / viral content surfaced along the route (TikTok-ish discovery)
const VIRAL = [
  { id: 'v1', near: 'Grand Central', dist: 'you are here', tag: 'TRENDING', tint: '#7A6448', plays: '2.4M', cap: 'the ceiling at golden hour', creator: '@nycskies' },
  { id: 'v2', near: '5th Ave', dist: '0.3 mi · next stop', tag: 'ON YOUR ROUTE', tint: '#4A5A50', plays: '880K', cap: 'the looking-up challenge', creator: '@citywalks' },
  { id: 'v3', near: 'Minskoff Theatre', dist: '0.5 mi', tag: 'NEARBY', tint: '#6E4A6A', plays: '1.1M', cap: 'stage door after Lion King', creator: '@bwaymoments' },
  { id: 'v4', near: 'Bridgeport', dist: 'Sunday', tag: 'WHERE YOU\'RE GOING', tint: '#5A4632', plays: '3.7M', cap: 'monster truck freestyle, front row', creator: '@hotwheelslive' },
];

// ── SURPRISES & MASKING ── anyone (incl. kids) can hide a whole trip or a
// single detail, from specific people or everyone, revealed manually or on a
// trigger. Claude simply doesn't see masked content for those it's hidden from,
// so it can never spoil it (never withholds, never lies).
const SURPRISES = [
  { id: 'sp1', author: 'jonathan', what: 'A stop', icon: '🎹', title: 'FAO Schwarz — the giant floor piano',
    detail: 'Secret detour Saturday before the show. Rafa gets to dance on the big keys.', tint: '#C24B2E',
    hideFrom: ['rafa', 'aurelia'], reveal: { type: 'arrival', at: '5th Avenue' } },
  { id: 'sp2', author: 'aurelia', what: 'A photo', icon: '🖼️', title: "Father's Day card",
    detail: 'the frame of him asleep on the couch in his coat — printed for Sunday.', tint: '#5C4A52',
    hideFrom: ['jonathan'], reveal: { type: 'date', at: 'June 15' } },
  { id: 'sp3', author: 'helen', what: 'The whole trip', icon: '🐠', title: 'One more night — the aquarium',
    detail: 'extended the trip a day so we can do Mystic Aquarium on the way home.', tint: '#4A6E68',
    hideFrom: ['everyone'], reveal: { type: 'manual' } },
];
// ── PER-PERSON PWA INSTALL IDENTITY ── each member installs Family Trips as
// THEIR own home-screen app: their name, color, glyph, opening to their world.
const APP_IDENTITY = {
  jonathan: { app: 'Family Ops', opensTo: 'today’s plan', bg1: '#2A1512', bg2: '#140B09', fg: '#EC8770', glyph: 'J', font: FONTS.fraunces, italic: false, stickers: ['🧭', '✈️', '☕', '📋'] },
  helen: { app: 'Our Trips', opensTo: 'the family thread', bg1: '#3A9466', bg2: '#1F5C3C', fg: '#FFFFFF', glyph: 'H', font: FONTS.fraunces, italic: false, stickers: ['🌿', '📷', '🗺️', '🕯️'] },
  aurelia: { app: 'the roll', opensTo: 'your roll', bg1: '#241F26', bg2: '#0B0A0C', fg: '#FF3D78', glyph: 'a', font: FONTS.instrument, italic: true, stickers: ['🎞️', '📷', '✨', '🌷'] },
  rafa: { app: 'Adventures!', opensTo: 'your movies', bg1: '#FFC247', bg2: '#E8552E', fg: '#1B1108', glyph: '★', font: FONTS.fredoka, italic: false, stickers: ['🚛', '⭐', '🦖', '🎈'] },
};

function nameOf(id) { return id === 'everyone' ? 'everyone' : (TRAVELERS[id] ? TRAVELERS[id].name : id); }
// Rafa (4) calls the family Mama / Papa / Sissy — used inside his lens only.
const RAFA_NAMES = { helen: 'Mama', jonathan: 'Papa', aurelia: 'Sissy', rafa: 'me' };
function displayName(id, viewer) {
  if (id === 'everyone') return 'everyone';
  if (viewer === 'rafa' && RAFA_NAMES[id]) return RAFA_NAMES[id];
  return TRAVELERS[id] ? TRAVELERS[id].name : id;
}
function revealLabel(r) {
  return r.type === 'arrival' ? `when you arrive at ${r.at}` : r.type === 'date' ? `on ${r.at}` : 'when they choose to';
}
function surprisesKeptBy(viewer) { return SURPRISES.filter(s => s.author === viewer); }
function surprisesComingFor(viewer) {
  return SURPRISES.filter(s => s.author !== viewer && (s.hideFrom.includes('everyone') || s.hideFrom.includes(viewer)));
}

function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + pct, g = ((n >> 8) & 0xff) + pct, b = (n & 0xff) + pct;
  r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

// ════════════════════════════════════════════════════════════════
// MOTION HELPERS
// ════════════════════════════════════════════════════════════════
function useTick(active, ms = 1000) {
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setN(x => x + 1), ms);
    return () => clearInterval(id);
  }, [active, ms]);
  return n;
}

// Staggered entrance. dir: 'up' | 'down' | 'fade' | 'scale'
function Reveal({ children, delay = 0, dir = 'up', dur = 520, style }) {
  const trans = {
    up: 'translateY(14px)', down: 'translateY(-12px)',
    fade: 'none', scale: 'scale(0.94)',
  }[dir];
  const [on, setOn] = React.useState(false);
  React.useEffect(() => { const id = setTimeout(() => setOn(true), delay + 20); return () => clearTimeout(id); }, [delay]);
  return (
    <div style={{
      opacity: on ? 1 : 0,
      transform: on ? 'none' : trans,
      transition: `opacity ${dur}ms cubic-bezier(.2,.7,.2,1), transform ${dur}ms cubic-bezier(.2,.7,.2,1)`,
      ...style,
    }}>{children}</div>
  );
}

// ════════════════════════════════════════════════════════════════
// ICONS — simple stroke geometry
// ════════════════════════════════════════════════════════════════
const Ic = {
  mic: (p) => <svg width={p.s||18} height={p.s||18} viewBox="0 0 24 24" fill="none" stroke={p.c||'currentColor'} strokeWidth={p.w||1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>,
  cam: (p) => <svg width={p.s||18} height={p.s||18} viewBox="0 0 24 24" fill="none" stroke={p.c||'currentColor'} strokeWidth={p.w||1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2L8 5h8l1.5 2h2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z"/><circle cx="12" cy="13" r="3.2"/></svg>,
  pin: (p) => <svg width={p.s||18} height={p.s||18} viewBox="0 0 24 24" fill="none" stroke={p.c||'currentColor'} strokeWidth={p.w||1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-5.5 7-11a7 7 0 0 0-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>,
  plus: (p) => <svg width={p.s||18} height={p.s||18} viewBox="0 0 24 24" fill="none" stroke={p.c||'currentColor'} strokeWidth={p.w||1.8} strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>,
  play: (p) => <svg width={p.s||18} height={p.s||18} viewBox="0 0 24 24" fill={p.c||'currentColor'}><path d="M7 4.5v15l13-7.5z"/></svg>,
  heart: (p) => <svg width={p.s||18} height={p.s||18} viewBox="0 0 24 24" fill={p.fill||'none'} stroke={p.c||'currentColor'} strokeWidth={p.w||1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M12 20s-7-4.4-7-9.3A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7 3.7C19 15.6 12 20 12 20z"/></svg>,
  share: (p) => <svg width={p.s||18} height={p.s||18} viewBox="0 0 24 24" fill="none" stroke={p.c||'currentColor'} strokeWidth={p.w||1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V4M8.5 7.5 12 4l3.5 3.5M5 12v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6"/></svg>,
  left: (p) => <svg width={p.s||18} height={p.s||18} viewBox="0 0 24 24" fill="none" stroke={p.c||'currentColor'} strokeWidth={p.w||2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7"/></svg>,
  right: (p) => <svg width={p.s||18} height={p.s||18} viewBox="0 0 24 24" fill="none" stroke={p.c||'currentColor'} strokeWidth={p.w||2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7"/></svg>,
  lock: (p) => <svg width={p.s||18} height={p.s||18} viewBox="0 0 24 24" fill="none" stroke={p.c||'currentColor'} strokeWidth={p.w||1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>,
  star: (p) => <svg width={p.s||18} height={p.s||18} viewBox="0 0 24 24" fill={p.fill||'none'} stroke={p.c||'currentColor'} strokeWidth={p.w||1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/></svg>,
  map: (p) => <svg width={p.s||18} height={p.s||18} viewBox="0 0 24 24" fill="none" stroke={p.c||'currentColor'} strokeWidth={p.w||1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M9 4 4 6v14l5-2 6 2 5-2V4l-5 2-6-2zM9 4v14M15 6v14"/></svg>,
  clock: (p) => <svg width={p.s||18} height={p.s||18} viewBox="0 0 24 24" fill="none" stroke={p.c||'currentColor'} strokeWidth={p.w||1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>,
  check: (p) => <svg width={p.s||18} height={p.s||18} viewBox="0 0 24 24" fill="none" stroke={p.c||'currentColor'} strokeWidth={p.w||2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 6.5"/></svg>,
  x: (p) => <svg width={p.s||18} height={p.s||18} viewBox="0 0 24 24" fill="none" stroke={p.c||'currentColor'} strokeWidth={p.w||2} strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>,
  grid: (p) => <svg width={p.s||18} height={p.s||18} viewBox="0 0 24 24" fill="none" stroke={p.c||'currentColor'} strokeWidth={p.w||1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/></svg>,
  bolt: (p) => <svg width={p.s||18} height={p.s||18} viewBox="0 0 24 24" fill={p.c||'currentColor'}><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>,
  plane: (p) => <svg width={p.s||18} height={p.s||18} viewBox="0 0 24 24" fill={p.c||'currentColor'}><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V18l-2 1.5V21l3.5-1 3.5 1v-1.5L13 18v-4.5z"/></svg>,
};

// ════════════════════════════════════════════════════════════════
// SHARED PRIMITIVES
// ════════════════════════════════════════════════════════════════
function Mono({ children, c, s = 10, ls = 1.4, w = 500, style }) {
  return <span style={{ fontFamily: FONTS.mono, fontSize: s, letterSpacing: ls, textTransform: 'uppercase', fontWeight: w, color: c || 'currentColor', ...style }}>{children}</span>;
}

function Photo({ ratio = 4 / 3, tint = '#6A5E4C', radius = 8, label, grain = false, style, children }) {
  return (
    <div style={{
      width: '100%', aspectRatio: ratio, borderRadius: radius, position: 'relative', overflow: 'hidden',
      background: `linear-gradient(150deg, ${shade(tint, 22)}, ${tint} 48%, ${shade(tint, -20)})`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', ...style,
    }}>
      <div style={{ position: 'absolute', inset: 0, background: `repeating-linear-gradient(135deg, rgba(255,255,255,0.05) 0 2px, transparent 2px 9px)` }} />
      {grain && <div style={{ position: 'absolute', inset: 0, opacity: 0.5, backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'120\' height=\'120\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'3\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.5\'/%3E%3C/svg%3E")', mixBlendMode: 'overlay' }} />}
      {label && <div style={{ position: 'relative', background: 'rgba(0,0,0,0.4)', color: 'rgba(255,255,255,0.92)', padding: '4px 9px', borderRadius: 3, fontFamily: FONTS.mono, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase' }}>{label}</div>}
      {children}
    </div>
  );
}

function Avatar({ id, size = 28, ring = false, ringColor }) {
  const t = TRAVELERS[id];
  if (!t) return null;
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: t.dot, color: '#fff',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: FONTS.inter, fontWeight: 600, fontSize: size * 0.42, flexShrink: 0,
      boxShadow: ring ? `0 0 0 2px ${ringColor || '#fff'}` : 'none',
    }}>{t.initial}</div>
  );
}

function AvatarStack({ ids, size = 20, gap = -7, ringColor = '#fff', max = 4 }) {
  const vis = ids.slice(0, max);
  return (
    <div style={{ display: 'inline-flex' }}>
      {vis.map((id, i) => (
        <div key={id} style={{ marginLeft: i ? gap : 0, zIndex: vis.length - i }}>
          <Avatar id={id} size={size} ring ringColor={ringColor} />
        </div>
      ))}
    </div>
  );
}

// Phone shell — roomy, themed, internal scroll. 375×812.
function Phone({ children, traveler, w = 375, h = 812, time = '10:30' }) {
  const t = TRAVELERS[traveler] || TRAVELERS.helen;
  const c = t.dark ? '#fff' : '#16140f';
  return (
    <div style={{
      width: w, height: h, borderRadius: 46, overflow: 'hidden', position: 'relative',
      background: t.pal.bg, color: t.pal.ink, fontFamily: t.font.body,
      boxShadow: '0 30px 80px rgba(0,0,0,0.30), 0 0 0 1px rgba(0,0,0,0.10)',
    }}>
      {/* status bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 50, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 28px', zIndex: 60, pointerEvents: 'none' }}>
        <span style={{ fontFamily: '-apple-system, system-ui', fontSize: 15, fontWeight: 600, color: c }}>{time}</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <svg width="17" height="11" viewBox="0 0 17 11"><rect x="0" y="7" width="3" height="4" rx="0.6" fill={c}/><rect x="4.5" y="5" width="3" height="6" rx="0.6" fill={c}/><rect x="9" y="2.5" width="3" height="8.5" rx="0.6" fill={c}/><rect x="13.5" y="0" width="3" height="11" rx="0.6" fill={c}/></svg>
          <div style={{ width: 24, height: 11, borderRadius: 3, border: `1px solid ${c}`, padding: 1.4, opacity: 0.9 }}><div style={{ width: '62%', height: '100%', background: c, borderRadius: 1 }} /></div>
        </div>
      </div>
      {/* notch */}
      <div style={{ position: 'absolute', top: 9, left: '50%', transform: 'translateX(-50%)', width: 116, height: 30, background: '#000', borderRadius: 16, zIndex: 61 }} />
      {/* content */}
      <div style={{ position: 'absolute', inset: '50px 0 0 0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
      {/* home indicator */}
      <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', width: 130, height: 5, borderRadius: 3, background: c, opacity: 0.32, zIndex: 60 }} />
    </div>
  );
}

// The persistent family dock — switches WHO (re-skins the whole trip)
function FamilyDock({ active, onChange }) {
  return (
    <div style={{
      flexShrink: 0, display: 'flex', gap: 3, padding: 5, margin: '0 12px 22px',
      background: 'rgba(10,10,12,0.82)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
      borderRadius: 999, boxShadow: '0 10px 30px rgba(0,0,0,0.40), inset 0 0 0 1px rgba(255,255,255,0.08)', zIndex: 40,
    }}>
      {TRAVELER_LIST.map(id => {
        const t = TRAVELERS[id];
        const on = active === id;
        return (
          <button key={id} onClick={() => onChange?.(id)} style={{
            flex: 1, height: 46, borderRadius: 999, border: 'none', cursor: 'pointer',
            backgroundColor: on ? t.dot : 'transparent', color: on ? '#fff' : 'rgba(255,255,255,0.78)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.1,
          }}>
            <span style={{ fontFamily: FONTS.inter, fontSize: 12.5, fontWeight: 600 }}>{t.name}</span>
            <span style={{ fontFamily: FONTS.mono, fontSize: 7.5, letterSpacing: 1.3, textTransform: 'uppercase', opacity: on ? 0.9 : 0.5, marginTop: 1 }}>{t.role}</span>
          </button>
        );
      })}
    </div>
  );
}

// Mount-transition wrapper — animates in via inline style + state (NOT CSS
// @keyframes), so html-to-image captures the settled visible state. presets:
// 'fade' | 'sheet' (slide up) | 'pop'.
function Mounted({ children, preset = 'fade', dur = 320, style, ...rest }) {
  const from = {
    fade: { opacity: 0 },
    sheet: { transform: 'translateY(100%)' },
    pop: { opacity: 0, transform: 'scale(0.92)' },
  }[preset] || {};
  const [on, setOn] = React.useState(false);
  React.useEffect(() => {
    const id = setTimeout(() => setOn(true), 24);
    return () => clearTimeout(id);
  }, []);
  return (
    <div style={{
      opacity: on ? 1 : (from.opacity ?? 1),
      transform: on ? 'none' : (from.transform ?? 'none'),
      transition: `opacity ${dur}ms ease, transform ${dur}ms cubic-bezier(.2,.8,.2,1)`,
      ...style,
    }} {...rest}>{children}</div>
  );
}

// Generic screen scroller (internal scroll, hidden bar)
function Scroll({ children, style }) {
  return <div className="ft-scroll" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', ...style }}>{children}</div>;
}

// Soft round icon button
function RoundBtn({ icon, onClick, bg, color, size = 40, style }) {
  return (
    <button onClick={onClick} style={{
      width: size, height: size, borderRadius: '50%', border: 'none', cursor: 'pointer',
      background: bg || 'transparent', color: color || 'currentColor',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, ...style,
    }}>{icon}</button>
  );
}

Object.assign(window, {
  FONTS, TRAVELERS, TRAVELER_LIST, TRIP, MEMORIES, PAST_TRIPS, RESURFACED, ROLL,
  IN_PHOTO, allPhotos, photosWith, RAFA_MOVIES, CURRENT_STOP, stopStatus, VIRAL,
  SURPRISES, nameOf, displayName, revealLabel, surprisesKeptBy, surprisesComingFor, APP_IDENTITY,
  NAV_APP, navUrl, openNav, THINGS_TO_DO,
  memoriesFor, allStops, stopById, shade, useTick, Reveal, Ic,
  Mono, Photo, Avatar, AvatarStack, Phone, FamilyDock, Scroll, RoundBtn, Mounted,
});
