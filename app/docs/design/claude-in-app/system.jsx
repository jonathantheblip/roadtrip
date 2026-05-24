// src/system.jsx — Shared design system: traveler themes, primitives, sample data
// All variants pull from this single source of truth.

// ─────────────────────────────────────────────────────────────
// Traveler themes — each family member has a "mode"
// ─────────────────────────────────────────────────────────────
const TRAVELERS = {
  jonathan: {
    id: 'jonathan',
    name: 'Jonathan',
    role: 'Ops',
    age: 'Dad',
    initial: 'J',
    dot: '#1E3A6F',
    theme: {
      // Editorial console — Kottke-dark. Paper-cream on near-black, oxblood links.
      bg: '#0E0F11',
      surface: '#15171A',
      surfaceAlt: '#1C1E22',
      ink: '#EDE6D6',
      inkMuted: 'rgba(237,230,214,0.58)',
      inkFaint: 'rgba(237,230,214,0.30)',
      accent: '#A33A2E',          // oxblood link
      accentInk: '#FFF6E8',
      hairline: 'rgba(237,230,214,0.16)',
      dark: true,
    },
  },
  helen: {
    id: 'helen',
    name: 'Helen',
    role: 'Archive',
    age: 'Mom',
    initial: 'H',
    dot: '#2E5D3A',
    theme: {
      bg: '#F2EFE7',
      surface: '#FFFFFF',
      surfaceAlt: '#E6E1D2',
      ink: '#15201A',
      inkMuted: 'rgba(21,32,26,0.62)',
      inkFaint: 'rgba(21,32,26,0.32)',
      accent: '#2E5D3A',
      accentInk: '#FFFFFF',
      hairline: 'rgba(21,32,26,0.13)',
      dark: false,
    },
  },
  aurelia: {
    id: 'aurelia',
    name: 'Aurelia',
    role: 'Her Stuff',
    age: '13',
    initial: 'A',
    dot: '#E8478C',
    theme: {
      bg: '#FCE8EE',
      surface: '#FFF2F6',
      surfaceAlt: '#F8D2DF',
      ink: '#3D0E22',
      inkMuted: 'rgba(61,14,34,0.62)',
      inkFaint: 'rgba(61,14,34,0.32)',
      accent: '#E8478C',
      accentInk: '#FFFFFF',
      hairline: 'rgba(61,14,34,0.14)',
      dark: false,
    },
  },
  rafa: {
    id: 'rafa',
    name: 'Rafa',
    role: 'Mission',
    age: '4',
    initial: 'R',
    dot: '#C9342A',
    theme: {
      bg: '#1A0A0B',
      surface: '#2A1012',
      surfaceAlt: '#3C1518',
      ink: '#FFF6E8',
      inkMuted: 'rgba(255,246,232,0.70)',
      inkFaint: 'rgba(255,246,232,0.38)',
      accent: '#FFB833',
      accentInk: '#1A0A0B',
      hairline: 'rgba(255,246,232,0.18)',
      dark: true,
    },
  },
};

const TRAVELER_LIST = ['jonathan', 'helen', 'aurelia', 'rafa'];

// ─────────────────────────────────────────────────────────────
// Type tokens — Fraunces (serif), Inter Tight (grotesk), JetBrains Mono
// ─────────────────────────────────────────────────────────────
const TYPE = {
  serif: '"Fraunces", "Iowan Old Style", Georgia, serif',
  sans: '"Inter Tight", -apple-system, system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
};

// ─────────────────────────────────────────────────────────────
// Sample data — Rafa's 5th Birthday Weekend
// ─────────────────────────────────────────────────────────────
const TRIP = {
  id: 'rafa-5',
  title: "Rafa's 5th Birthday Weekend",
  subtitle: 'A long weekend in New York',
  status: 'In planning',
  dateRange: 'May 1 – 3, 2026',
  start: 'Belmont, MA',
  end: 'New York, NY',
  travelers: TRAVELER_LIST,
  days: [
    {
      n: 1, label: 'DAY 1', date: 'Fri May 1', name: 'Converging in Murray Hill',
      stops: [
        { id: 's1', time: '3:15 PM', kind: 'LOGISTICS', title: 'School pickup',
          desc: 'Helen picks up Aurelia and Rafa. Drive to NYC.',
          loc: 'Belmont, MA', for: ['helen','aurelia','rafa'],
          memCount: 3 },
        { id: 's2', time: '5:17 PM', kind: 'ARRIVAL', title: 'DL 4961 lands at LGA',
          desc: 'Jonathan inbound from Indianapolis. Helen and Aurelia tracking flight in real time.',
          loc: 'LaGuardia Airport', for: ['jonathan'],
          memCount: 1 },
        { id: 's3', time: 'Evening', kind: 'LODGING', title: '40 E 38th St — Airbnb',
          desc: 'Family converges. Check-in 4 PM.',
          loc: 'Murray Hill, Manhattan', for: ['jonathan','helen','aurelia','rafa'],
          memCount: 4 },
      ],
    },
    {
      n: 2, label: 'DAY 2', date: 'Sat May 2', name: 'Manhattan Saturday',
      stops: [
        { id: 's4', time: '9:00 AM', kind: 'BREAKFAST', title: 'Grand Brasserie — breakfast with Maida & James',
          desc: "Inside Vanderbilt Hall at Grand Central — landmark Parisian room, French classics, kid-friendly.",
          loc: 'Grand Central Terminal', for: ['jonathan','helen','aurelia','rafa'],
          memCount: 2 },
        { id: 's5', time: '10:30 AM', kind: 'SIGHTS', title: 'Empire State Building',
          desc: "Tentative. Maida's cousin works there and may be able to score discounted tickets.",
          loc: '350 5th Ave', for: ['jonathan','helen','aurelia','rafa'],
          memCount: 0 },
        { id: 's6', time: '2:00 PM', kind: 'SHOW', title: 'The Lion King',
          desc: 'Minskoff Theatre, Sat May 2 matinee. Availability low — book promptly.',
          loc: 'Minskoff Theatre', for: ['jonathan','helen','aurelia','rafa'],
          memCount: 0 },
      ],
    },
    {
      n: 3, label: 'DAY 3', date: 'Sun May 3', name: 'Monster Truck Day',
      stops: [
        { id: 's7', time: '2:30 PM', kind: 'SHOW', title: 'Hot Wheels Monster Trucks Live: Glow-N-Fire',
          desc: "Rafa's anchor. Total Mortgage Arena, Bridgeport CT.",
          loc: 'Bridgeport, CT', for: ['rafa','jonathan','helen','aurelia'],
          memCount: 0 },
      ],
    },
  ],
};

// Sample memories — keyed by stop id, ordered by author
const MEMORIES = {
  s1: [
    { id: 'm1', author: 'aurelia', time: '3:18 PM', kind: 'photo',
      caption: 'rafa pretending he didn\'t pack his backpack',
      reactions: [{ by: 'helen', emoji: '😅' }, { by: 'jonathan', emoji: '❤️' }] },
    { id: 'm2', author: 'helen', time: '3:22 PM', kind: 'voice',
      duration: 14, transcript: "We are officially on the road. Rafa says he's going to see real monster trucks.",
      reactions: [{ by: 'jonathan', emoji: '🚗' }] },
    { id: 'm3', author: 'rafa', time: '3:24 PM', kind: 'photo',
      caption: 'MY BACKPACK',
      reactions: [{ by: 'aurelia', emoji: '😂' }, { by: 'helen', emoji: '🎒' }] },
  ],
  s2: [
    { id: 'm4', author: 'jonathan', time: '5:31 PM', kind: 'photo',
      caption: 'wheels down LGA. helen waiting curbside.',
      reactions: [{ by: 'helen', emoji: '👋' }] },
  ],
  s3: [
    { id: 'm5', author: 'helen', time: '6:45 PM', kind: 'text',
      body: 'All four of us under one roof for the first time in two weeks. Rafa fell asleep on the couch in his coat.',
      reactions: [{ by: 'jonathan', emoji: '🥹' }, { by: 'aurelia', emoji: '💤' }] },
    { id: 'm6', author: 'jonathan', time: '7:02 PM', kind: 'photo',
      caption: 'view from the airbnb',
      reactions: [] },
    { id: 'm7', author: 'aurelia', time: '7:18 PM', kind: 'photo',
      caption: 'this elevator is older than mom',
      reactions: [{ by: 'helen', emoji: '🙄' }, { by: 'jonathan', emoji: '😂' }] },
    { id: 'm8', author: 'rafa', time: '7:20 PM', kind: 'voice',
      duration: 6, transcript: "I want pizza. I want pizza. I want pizza.",
      reactions: [{ by: 'aurelia', emoji: '🍕' }] },
  ],
  s4: [
    { id: 'm9', author: 'helen', time: '9:34 AM', kind: 'photo',
      caption: 'maida + james · grand central is unreal at this hour',
      reactions: [{ by: 'jonathan', emoji: '✨' }] },
    { id: 'm10', author: 'aurelia', time: '9:51 AM', kind: 'text',
      body: 'the egg thing was good. the room was prettier than the food.',
      reactions: [] },
  ],
};

// Helpers
function travelerOf(id) { return TRAVELERS[id]; }
function memoriesFor(stopId) { return MEMORIES[stopId] || []; }

// ─────────────────────────────────────────────────────────────
// Inject Google Fonts once
// ─────────────────────────────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('rt-fonts')) {
  const l = document.createElement('link');
  l.id = 'rt-fonts';
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700;9..144,900&family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap';
  document.head.appendChild(l);
}

// ─────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────
function Eyebrow({ children, color, style }) {
  return (
    <div style={{
      fontFamily: TYPE.mono, fontSize: 11, letterSpacing: 1.4,
      textTransform: 'uppercase', color: color || 'currentColor',
      ...style,
    }}>{children}</div>
  );
}

// Striped placeholder for imagery
function PhotoPlaceholder({ ratio = 4/3, label, tint = '#cbb89c', radius = 8, style }) {
  return (
    <div style={{
      width: '100%', aspectRatio: ratio, borderRadius: radius,
      background: `repeating-linear-gradient(45deg, ${tint}, ${tint} 6px, ${shade(tint,-6)} 6px, ${shade(tint,-6)} 12px)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: TYPE.mono, fontSize: 10, letterSpacing: 1.2,
      color: 'rgba(0,0,0,0.55)', textTransform: 'uppercase',
      position: 'relative', overflow: 'hidden', ...style,
    }}>
      {label && (
        <div style={{
          background: 'rgba(255,255,255,0.85)', padding: '4px 8px',
          borderRadius: 3,
        }}>{label}</div>
      )}
    </div>
  );
}

function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + pct, g = ((n >> 8) & 0xff) + pct, b = (n & 0xff) + pct;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6,'0');
}

// Avatar — circular with initial + traveler color
function Avatar({ id, size = 28, ring = false }) {
  const t = TRAVELERS[id];
  if (!t) return null;
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: t.dot, color: '#fff',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: TYPE.sans, fontWeight: 600, fontSize: size * 0.42,
      flexShrink: 0,
      boxShadow: ring ? `0 0 0 2px #fff, 0 0 0 4px ${t.dot}` : 'none',
    }}>{t.initial}</div>
  );
}

// Stack of avatars
function AvatarStack({ ids, size = 22, max = 4, gap = -6 }) {
  const visible = ids.slice(0, max);
  return (
    <div style={{ display: 'inline-flex' }}>
      {visible.map((id, i) => (
        <div key={id} style={{ marginLeft: i === 0 ? 0 : gap, position: 'relative', zIndex: visible.length - i }}>
          <Avatar id={id} size={size} ring />
        </div>
      ))}
    </div>
  );
}

// Family dock — the persistent footer identifier from the original
function FamilyDock({ active, onChange, theme, compact = false }) {
  return (
    <div style={{
      position: 'absolute', left: 12, right: 12, bottom: 12,
      display: 'flex', gap: 4, padding: 6,
      background: theme.dark ? 'rgba(20,20,24,0.88)' : 'rgba(0,0,0,0.86)',
      backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      borderRadius: 999, zIndex: 30,
      boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
    }}>
      {TRAVELER_LIST.map(id => {
        const t = TRAVELERS[id];
        const isActive = active === id;
        return (
          <button key={id}
            onClick={() => onChange?.(id)}
            style={{
              flex: 1, height: compact ? 36 : 44, borderRadius: 999,
              border: 'none', cursor: 'pointer',
              background: isActive ? t.dot : 'transparent',
              color: isActive ? (id === 'rafa' ? '#0B1E3F' : '#fff') : 'rgba(255,255,255,0.85)',
              fontFamily: TYPE.sans,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              padding: 0, lineHeight: 1.1,
            }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{t.name}</span>
            <span style={{
              fontFamily: TYPE.mono, fontSize: 8, letterSpacing: 1.2,
              textTransform: 'uppercase',
              opacity: isActive ? 0.85 : 0.55, marginTop: 1,
            }}>{t.role}</span>
          </button>
        );
      })}
    </div>
  );
}

// Status bar (replaces the iOS frame's built-in for non-frame usage)
function FauxStatus({ dark, time = '10:30' }) {
  const c = dark ? '#fff' : '#000';
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '14px 24px 8px', fontFamily: '-apple-system, system-ui',
      fontSize: 15, fontWeight: 600, color: c,
    }}>
      <span>{time}</span>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <svg width="17" height="11" viewBox="0 0 17 11">
          <rect x="0" y="7" width="3" height="4" rx="0.6" fill={c}/>
          <rect x="4.5" y="5" width="3" height="6" rx="0.6" fill={c}/>
          <rect x="9" y="2.5" width="3" height="8.5" rx="0.6" fill={c}/>
          <rect x="13.5" y="0" width="3" height="11" rx="0.6" fill={c}/>
        </svg>
        <svg width="15" height="11" viewBox="0 0 15 11">
          <path d="M7.5 3C9.5 3 11.4 3.8 12.7 5.1L13.7 4.1C12.1 2.5 9.9 1.5 7.5 1.5C5.1 1.5 2.9 2.5 1.3 4.1L2.3 5.1C3.6 3.8 5.5 3 7.5 3Z" fill={c}/>
          <circle cx="7.5" cy="9.5" r="1.3" fill={c}/>
        </svg>
        <div style={{
          width: 24, height: 11, borderRadius: 3, border: `1px solid ${c}`,
          padding: 1, opacity: 0.9,
        }}>
          <div style={{ width: '60%', height: '100%', background: c, borderRadius: 1 }} />
        </div>
      </div>
    </div>
  );
}

// Phone shell — wraps content in iOS device-style frame, themed per traveler
function Phone({ children, traveler, width = 320, height = 660, time = '10:30' }) {
  const t = traveler ? TRAVELERS[traveler] : TRAVELERS.helen;
  return (
    <div style={{
      width, height, borderRadius: 38, overflow: 'hidden',
      position: 'relative', background: t.theme.bg,
      boxShadow: '0 24px 60px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.10)',
      fontFamily: TYPE.sans, color: t.theme.ink,
    }}>
      <FauxStatus dark={t.theme.dark} time={time} />
      <div style={{ position: 'absolute', inset: '46px 0 0 0', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

// Tag pill (kind labels)
function KindTag({ children, color }) {
  return (
    <span style={{
      fontFamily: TYPE.mono, fontSize: 10, letterSpacing: 1.4,
      textTransform: 'uppercase', color: color || 'currentColor',
      opacity: 0.7,
    }}>{children}</span>
  );
}

// Hairline divider
function Hairline({ color, style }) {
  return <div style={{ height: 1, background: color || 'currentColor', opacity: 0.12, ...style }} />;
}

// Export to global so other JSX files can reach them
Object.assign(window, {
  TRAVELERS, TRAVELER_LIST, TYPE, TRIP, MEMORIES,
  travelerOf, memoriesFor, shade,
  Eyebrow, PhotoPlaceholder, Avatar, AvatarStack, FamilyDock,
  FauxStatus, Phone, KindTag, Hairline,
});
