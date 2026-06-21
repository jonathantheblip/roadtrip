// hangout/tokens.jsx — lifted tokens + the beach-rental spine + suggestion pantry.
// Palettes/fonts/radii are copied verbatim from src/ft2/system.jsx so every
// mock surface renders in the real per-person skin.

const FONTS = {
  fraunces: '"Fraunces", "Iowan Old Style", Georgia, serif',
  inter: '"Inter Tight", -apple-system, system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
  instrument: '"Instrument Serif", "Times New Roman", serif',
  fredoka: '"Fredoka", "Inter Tight", system-ui, sans-serif',
};

(function injectFonts() {
  if (typeof document === 'undefined' || document.getElementById('hg-fonts')) return;
  const l = document.createElement('link');
  l.id = 'hg-fonts'; l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?' +
    'family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;0,9..144,900;1,9..144,400;1,9..144,500;1,9..144,600&' +
    'family=Inter+Tight:wght@400;500;600;700&' +
    'family=JetBrains+Mono:wght@400;500;600;700&' +
    'family=Instrument+Serif:ital@0;1&' +
    'family=Fredoka:wght@400;500;600;700&display=swap';
  document.head.appendChild(l);
})();

const T = {
  jonathan: {
    id: 'jonathan', name: 'Jonathan', role: 'Ops', verb: 'Command', age: 'Dad', initial: 'J', dot: '#2E6BB8',
    font: { display: FONTS.fraunces, body: FONTS.inter, mono: FONTS.mono, ui: FONTS.inter }, radius: 2,
    pal: { bg: '#0E0F11', bg2: '#15171A', surface: '#1C1E22', raise: '#24262B', ink: '#EDE6D6',
      muted: 'rgba(237,230,214,0.60)', faint: 'rgba(237,230,214,0.32)', line: 'rgba(237,230,214,0.14)',
      lineBold: 'rgba(237,230,214,0.30)', accent: '#E0654F', accentText: '#EC8770', accentInk: '#16100C',
      live: '#E0654F', good: '#7FB069' }, dark: true,
  },
  helen: {
    id: 'helen', name: 'Helen', role: 'Keeper', verb: 'Remember', age: 'Mom', initial: 'H', dot: '#2E7D52',
    font: { display: FONTS.fraunces, body: FONTS.inter, mono: FONTS.mono, ui: FONTS.inter }, radius: 18,
    pal: { bg: '#F4F0E7', bg2: '#ECE6D9', surface: '#FFFFFF', raise: '#FBF8F1', ink: '#1C2A21',
      muted: 'rgba(28,42,33,0.62)', faint: 'rgba(28,42,33,0.34)', line: 'rgba(28,42,33,0.12)',
      lineBold: 'rgba(28,42,33,0.22)', accent: '#2E7D52', accentText: '#256B45', accentInk: '#FFFFFF',
      live: '#C2603A', good: '#2E7D52' }, dark: false,
  },
  aurelia: {
    id: 'aurelia', name: 'Aurelia', role: 'Her roll', verb: 'Send', age: '13', initial: 'A', dot: '#E8478C',
    font: { display: FONTS.instrument, body: FONTS.inter, mono: FONTS.mono, ui: FONTS.inter }, radius: 4,
    pal: { bg: '#0B0A0C', bg2: '#141215', surface: '#1A171B', raise: '#241F26', ink: '#F3EEE9',
      muted: 'rgba(243,238,233,0.56)', faint: 'rgba(243,238,233,0.30)', line: 'rgba(243,238,233,0.12)',
      lineBold: 'rgba(243,238,233,0.24)', accent: '#FF3D78', accentText: '#FF5C8E', accentInk: '#0B0A0C',
      live: '#FF3D78', good: '#C7B5FF' }, dark: true,
  },
  rafa: {
    id: 'rafa', name: 'Rafa', role: 'Mission', verb: 'Play', age: '5', initial: 'R', dot: '#E8552E',
    font: { display: FONTS.fredoka, body: FONTS.fredoka, mono: FONTS.mono, ui: FONTS.fredoka }, radius: 24,
    pal: { bg: '#1B1108', bg2: '#28190C', surface: '#33200F', raise: '#41290F', ink: '#FFF3DF',
      muted: 'rgba(255,243,223,0.74)', faint: 'rgba(255,243,223,0.42)', line: 'rgba(255,243,223,0.16)',
      lineBold: 'rgba(255,243,223,0.30)', accent: '#FFB12E', accentText: '#FFC247', accentInk: '#1B1108',
      live: '#FF6B4D', good: '#4CC36E', sticker: ['#FFB12E', '#3DA5E0', '#4CC36E', '#FF6B4D', '#C77DFF'] }, dark: true,
  },
};
const ORDER = ['jonathan', 'helen', 'aurelia', 'rafa'];

// neutral editorial skin for the concept/strategy panels
const PAPER = {
  bg: '#16140F', bg2: '#1D1A14', ink: '#F0EBDF', muted: 'rgba(240,235,223,0.62)',
  faint: 'rgba(240,235,223,0.34)', line: 'rgba(240,235,223,0.14)', accent: '#E2A04A',
  display: FONTS.fraunces, mono: FONTS.mono, body: FONTS.inter,
};

function shade(hex, amt) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
  r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// What Rafa calls everyone
const RAFA_NAME = { helen: 'Mama', jonathan: 'Papa', aurelia: 'Sissy', rafa: 'Me' };

// ════════════════════════════════════════════════════════════════
// THE STAY — a beach rental, nothing booked.
// ════════════════════════════════════════════════════════════════
const STAY = {
  title: 'The cottage on Indian Neck',
  place: 'Wellfleet · Cape Cod',
  sub: 'Five nights, bay side. Nothing on the calendar.',
  day: 'Saturday · day two',
  // natural conditions, not a schedule
  cond: {
    light: 'Hazy sun', temp: '78°', water: '64°',
    tideState: 'Going out', tideLow: '4:40', tideHigh: '10:55',
    sunset: '7:52', goldenIn: '40 min', wind: 'SW 6mph', moon: 'Waxing',
  },
};

// who's around right now (presence)
const PRESENCE = {
  jonathan: { where: 'On the deck', what: 'Shucking oysters', dotMood: 'good' },
  helen: { where: 'Porch chair', what: 'Reading, half-asleep', dotMood: 'good' },
  aurelia: { where: 'Down the lane', what: 'Shooting the screen door', dotMood: 'good' },
  rafa: { where: 'The flats', what: 'Hunting crabs', dotMood: 'live' },
};

// small moments as they actually land (newest first)
const MOMENTS = [
  { id: 'mo1', who: 'rafa', kind: 'photo', tint: '#7A6A44', cap: 'i found a crab. his name is Gary.', ago: 'now' },
  { id: 'mo2', who: 'aurelia', kind: 'photo', tint: '#6E5B49', cap: 'the screen door at 4pm', ago: '12m' },
  { id: 'mo3', who: 'jonathan', kind: 'log', body: '12 oysters · 1 nap · 0 plans', ago: '40m' },
  { id: 'mo4', who: 'helen', kind: 'text', body: 'Nobody knows what day it is. Good.', ago: '1h' },
  { id: 'mo5', who: 'rafa', kind: 'voice', body: 'The Gary the crab story', dur: '0:22', ago: '1h' },
  { id: 'mo6', who: 'aurelia', kind: 'photo', tint: '#54616A', cap: 'tide going out', ago: '2h' },
];

// ════════════════════════════════════════════════════════════════
// THE PANTRY — pre-scoped possibilities, already here, never scheduled.
// Each: who it's ideal for + a blurb + when it's good. This is the thing
// the family actually needs when someone asks "what should we do?"
// ════════════════════════════════════════════════════════════════
const CAT = {
  meal: { label: 'A BITE', tint: '#8A5A3C' },
  energy: { label: 'BURN ENERGY', tint: '#3C6E55' },
  look: { label: 'AURELIA-BAIT', tint: '#8A476A' },
  together: { label: 'ALL OF US', tint: '#4A5A78' },
};

const PANTRY = [
  // meals
  { id: 'p1', cat: 'meal', title: "Mac's Shack", blurb: 'Lobster rolls & fried clams at a counter. The line moves fast before 12:30.',
    forIds: ['jonathan', 'helen', 'aurelia', 'rafa'], when: '6 min · best before 12:30', tint: '#8A5A3C' },
  { id: 'p2', cat: 'meal', title: 'PB Boulangerie', blurb: 'A real French bakery hiding in the pines. Go before the croissants are gone.',
    forIds: ['helen', 'aurelia'], when: '8 min · mornings', tint: '#9A6B3A' },
  { id: 'p3', cat: 'meal', title: 'The Beachcomber', blurb: 'Oysters on a deck over the water. Cash bar, live band after six.',
    forIds: ['jonathan', 'helen'], when: '10 min · golden hour', tint: '#7A6038' },
  { id: 'p4', cat: 'meal', title: 'Wellfleet Pizza', blurb: 'Easy night-in pizza nobody has to dress for. Rafa-approved.',
    forIds: ['rafa', 'jonathan', 'helen', 'aurelia'], when: '5 min · anytime', tint: '#8A5230' },
  // energy
  { id: 'p5', cat: 'energy', title: 'Bay flats at low tide', blurb: 'Warm ankle-deep water and a hundred hermit crabs. Rafa could stay for hours.',
    forIds: ['rafa', 'aurelia'], when: '4 min · 3–5pm', tint: '#3C6E55' },
  { id: 'p6', cat: 'energy', title: 'Newcomb Hollow dunes', blurb: 'Big sand hills made for running down screaming. Bring water.',
    forIds: ['rafa', 'jonathan'], when: '12 min · cooler hours', tint: '#4A6B40' },
  { id: 'p7', cat: 'energy', title: 'Mayo Beach playground', blurb: 'Climbing structure right by the pier. Walkable, fenced, easy.',
    forIds: ['rafa'], when: '7 min · anytime', tint: '#3E6E62' },
  { id: 'p8', cat: 'energy', title: 'The rail-trail', blurb: 'Flat, paved, training-wheels friendly. A slow family pedal.',
    forIds: ['rafa', 'jonathan', 'helen'], when: '5 min · morning', tint: '#4C6E4A' },
  // aurelia-bait
  { id: 'p9', cat: 'look', title: 'Wellfleet Flea', blurb: 'Racks of old denim and film cameras. Weekends only — it photographs itself.',
    forIds: ['aurelia'], when: '14 min · Sat/Sun', tint: '#8A476A' },
  { id: 'p10', cat: 'look', title: 'Herridge Books', blurb: 'A used bookstore with perfect afternoon light. Quiet, golden, hers.',
    forIds: ['aurelia', 'helen'], when: '9 min · afternoons', tint: '#7A4A6A' },
  { id: 'p11', cat: 'look', title: 'The pier at golden hour', blurb: 'Boats, pink sky, the photo she came for. ~7:50 tonight.',
    forIds: ['aurelia'], when: '7 min · ~7:50', tint: '#8A4A60' },
  { id: 'p12', cat: 'look', title: "Mind's eye cones", blurb: 'Pastel ice cream that looks as good as it tastes. A two-bird stop with Rafa.',
    forIds: ['aurelia', 'rafa'], when: '6 min · anytime', tint: '#94506A' },
  // together
  { id: 'p13', cat: 'together', title: 'Wellfleet Drive-In', blurb: 'A double feature under the stars. Gates at 7:30, first film at dusk.',
    forIds: ['jonathan', 'helen', 'aurelia', 'rafa'], when: 'tonight · gates 7:30', tint: '#4A5A78' },
  { id: 'p14', cat: 'together', title: 'Sunset at the bay', blurb: 'The reason people come to this side. Walk down with a blanket. ~7:52.',
    forIds: ['jonathan', 'helen', 'aurelia', 'rafa'], when: '2 min · ~7:52', tint: '#5A5680' },
];

function pantryFor(id) { return PANTRY.filter((p) => p.forIds.includes(id)); }

Object.assign(window, { HG_T: T, HG_ORDER: ORDER, HG_PAPER: PAPER, HG_FONTS: FONTS,
  HG_shade: shade, HG_STAY: STAY, HG_PRESENCE: PRESENCE, HG_MOMENTS: MOMENTS,
  HG_PANTRY: PANTRY, HG_CAT: CAT, HG_pantryFor: pantryFor, HG_RAFA_NAME: RAFA_NAME });
