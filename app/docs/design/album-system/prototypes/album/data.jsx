// album/data.jsx — Chapter 1 sample data, per-lens album config, and the
// copy source of truth. The working UI and the copy deck both read PICK_COPY /
// EMPTY_COPY from here, so what's "baked in" and what's "collected" are the
// same strings. Depends on src/ft2/system.jsx globals (TRAVELERS, TRIP…).

// ── deterministic jitter so re-renders are stable ────────────────
function seed(n) { const x = Math.sin(n * 999.13) * 43758.5453; return x - Math.floor(x); }

// Each day's ambient "home base" — the place section that deliberately leads
// the day (the "At the cabin" idea, here the Airbnb / the road).
const DAY_BASE = {
  1: { title: '40 E 38th St — the Airbnb', loc: 'Murray Hill' },
  2: { title: '40 E 38th St — the Airbnb', loc: 'Murray Hill' },
  3: { title: 'On the road — I-95 south', loc: 'toward Bridgeport' },
};

// Hand-authored "feature" frames (captions, faces, video, landscapes), then
// filled out with plain tiles so the grid reads like a real album.
const FEAT = [
  // Day 1 · base (ambient at the Airbnb)
  { day: 1, base: true, tint: '#3E4A5C', author: 'jonathan', people: [], cap: 'view from the airbnb', comp: .93, clar: .88 },
  { day: 1, base: true, tint: '#6E5A6A', author: 'aurelia', people: ['aurelia'], cap: 'this elevator is older than mom', comp: .9, clar: .8 },
  { day: 1, base: true, tint: '#5C4A52', author: 'helen', people: ['rafa'], cap: 'rafa asleep in his coat', comp: .82, clar: .74 },
  // Day 1 · s1 drive
  { day: 1, stopId: 's1', tint: '#7A6A54', author: 'aurelia', people: ['rafa', 'aurelia'], cap: "rafa pretending he didn't pack his backpack", comp: .78, clar: .7 },
  { day: 1, stopId: 's1', tint: '#8A6A3A', author: 'rafa', people: ['rafa'], cap: 'MY BACKPACK', comp: .5, clar: .55 },
  { day: 1, stopId: 's1', kind: 'video', dur: '0:22', tint: '#6A5E44', author: 'helen', people: ['rafa', 'aurelia'], cap: 'singing in the back seat', comp: .6, clar: .6, chip: 'nosound' },
  // Day 1 · s2 LGA arrival
  { day: 1, stopId: 's2', tint: '#5A6470', author: 'jonathan', people: ['jonathan'], cap: 'wheels down LGA', comp: .72, clar: .82 },
  // Day 1 · s3 lodging (a couple tied to the arrival moment)
  { day: 1, stopId: 's3', tint: '#6E5A6A', author: 'aurelia', people: ['aurelia'], cap: 'first night, all four of us', comp: .86, clar: .8 },
  { day: 1, stopId: 's3', kind: 'video', dur: '0:41', tint: '#4A3F4E', author: 'helen', people: ['rafa'], cap: 'i want pizza x1000', comp: .58, clar: .62 },

  // Day 2 · base
  { day: 2, base: true, tint: '#7A6448', author: 'helen', people: [], cap: 'morning light, 5th ave', comp: .95, clar: .9 },
  { day: 2, base: true, tint: '#4A5A50', author: 'aurelia', people: [], cap: 'looked up. kept looking up.', comp: .94, clar: .86 },
  // Day 2 · s4 breakfast Grand Brasserie
  { day: 2, stopId: 's4', tint: '#7A6448', author: 'helen', people: ['helen', 'aurelia', 'rafa', 'jonathan'], cap: 'maida + james · grand central is unreal at this hour', comp: .92, clar: .88 },
  { day: 2, stopId: 's4', tint: '#6A5440', author: 'aurelia', people: ['aurelia'], cap: 'the egg thing (it was fine)', comp: .8, clar: .78 },
  { day: 2, stopId: 's4', kind: 'video', dur: '1:03', tint: '#5A4632', author: 'jonathan', people: ['rafa'], cap: 'rafa vs. a very large pastry', comp: .64, clar: .7 },
  { day: 2, stopId: 's4', tint: '#8A7450', author: 'helen', people: ['helen', 'jonathan'], comp: .84, clar: .82 },
];

// Fill the rest so the album has weight. Deterministic, caption-less (real
// albums mostly are). Some landscapes (people:[]) for "best of the trip".
function fill(day, key, n, tints, authors) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = seed(day * 100 + key.length * 7 + i * 13);
    const isVid = r > 0.9;
    const land = seed(i * 3 + day) > 0.72;
    out.push({
      day, ...(key === 'base' ? { base: true } : { stopId: key }),
      kind: isVid ? 'video' : 'photo', dur: isVid ? '0:' + (10 + Math.floor(r * 40)) : null,
      tint: tints[i % tints.length], author: authors[i % authors.length],
      people: land ? [] : [authors[(i + 1) % authors.length]],
      comp: 0.4 + seed(i * 5 + day * 2) * 0.5, clar: 0.45 + seed(i * 7 + day) * 0.5,
    });
  }
  return out;
}

const FILLERS = [
  ...fill(1, 'base', 6, ['#46414A', '#54463E', '#3E4A5C', '#5C5048'], ['helen', 'jonathan', 'aurelia']),
  ...fill(1, 's1', 4, ['#7A6A54', '#6A5E44', '#807046'], ['aurelia', 'helen', 'rafa']),
  ...fill(1, 's3', 7, ['#4A3F4E', '#6E5A6A', '#544852', '#3E3642'], ['helen', 'aurelia', 'jonathan']),
  ...fill(2, 'base', 4, ['#7A6448', '#4A5A50', '#6A5A40'], ['helen', 'aurelia']),
  ...fill(2, 's4', 6, ['#8A7450', '#6A5440', '#7A6448', '#5A4632'], ['helen', 'aurelia', 'jonathan']),
];

// Loose / in-transit (bottom of the album)
const LOOSE = [
  { day: null, loose: true, tint: '#565049', author: 'helen', people: [], cap: 'somewhere on the merritt', comp: .7, clar: .66 },
  { day: null, loose: true, tint: '#4E4A44', author: 'aurelia', people: [], comp: .6, clar: .6 },
  { day: null, loose: true, kind: 'video', dur: '0:14', tint: '#5A5048', author: 'rafa', people: ['rafa'], chip: 'onitsway', comp: .5, clar: .5 },
];

const ALBUM = [...FEAT, ...FILLERS, ...LOOSE].map((p, i) => ({
  id: 'p' + i, kind: 'photo', people: [], comp: .6, clar: .6, ...p,
}));

// ── selectors ────────────────────────────────────────────────────
function albVideos() { return ALBUM.filter(p => p.kind === 'video'); }
function albWith(id) { return ALBUM.filter(p => p.people.includes(id)); }

// Ordered, day-grouped sections: place (base) leads each day, then timed events.
function albumSections() {
  const secs = [];
  TRIP.days.forEach(d => {
    const base = ALBUM.filter(p => p.day === d.n && p.base);
    if (base.length) secs.push({ key: 'b' + d.n, type: 'place', day: d, title: DAY_BASE[d.n].title, loc: DAY_BASE[d.n].loc, photos: base });
    d.stops.forEach(s => {
      const ph = ALBUM.filter(p => p.stopId === s.id);
      if (ph.length) secs.push({ key: s.id, type: 'event', day: d, stop: s, title: s.title, time: s.time, loc: s.loc, photos: ph });
    });
  });
  const loose = ALBUM.filter(p => p.loose);
  if (loose.length) secs.push({ key: 'loose', type: 'loose', title: 'In transit', photos: loose });
  return secs;
}

// Best-of. mode: 'featuring'(person) | 'trip'(incl. landscapes) | 'hers'(author-ranked)
function bestPicks(mode, person, n = 8) {
  let pool = ALBUM.filter(p => p.kind === 'photo');
  if (mode === 'featuring') pool = pool.filter(p => p.people.includes(person));
  if (mode === 'hers') pool = pool.filter(p => p.author === person);
  return pool.map(p => ({ ...p, score: p.comp * 0.6 + p.clar * 0.4 }))
    .sort((a, b) => b.score - a.score).slice(0, n);
}

// ── per-lens album configuration ─────────────────────────────────
// filterModel: 'calm' (single quiet row, thin-in-place) | 'stack' (Jonathan's
// Record: PERSON∧DAY∧PLACE tabs) | 'warm' (Rafa: none). bestDefault drives the
// per-lens default cut of "Best".
const LENS_CFG = {
  helen:    { filterModel: 'calm',  bestDefault: 'featuring', bestSelf: 'helen',   chips: true,  lowercase: false, ranks: true,  moods: false },
  jonathan: { filterModel: 'stack', bestDefault: 'trip',      bestSelf: 'jonathan',chips: true,  lowercase: false, ranks: true,  moods: false },
  aurelia:  { filterModel: 'calm',  bestDefault: 'hers',      bestSelf: 'aurelia', chips: true,  lowercase: true,  ranks: true,  moods: true  },
  rafa:     { filterModel: 'warm',  bestDefault: null,        bestSelf: 'rafa',    chips: false, lowercase: false, ranks: false, moods: false },
};

// ── COPY — machine-pick labels (honest: name what the machine judged) ──────
// tiers: onDevice (clarity/exposure) | vision (light & composition, opt-in).
const PICK_COPY = {
  helen: {
    featuring:  { onDevice: 'Auto-picked · clearest, closest shots of you', vision: 'Auto-picked · best light & composition, featuring you' },
    trip:       { onDevice: 'Auto-picked · sharpest frames across the trip', vision: 'Auto-picked · best light & composition, whole trip' },
    sub: { featuring: 'featuring you', trip: 'the whole trip' },
    override: { remove: 'not this one', add: 'add one you love', undo: 'Removed — undo' },
  },
  jonathan: {
    trip:       { onDevice: 'Auto-picked · sharpest frames, people or not', vision: 'Auto-picked · strongest light & composition, whole trip' },
    featuring:  { onDevice: 'Auto-picked · sharpest frames featuring you', vision: 'Auto-picked · strongest light & composition, featuring you' },
    sub: { featuring: 'featuring me', trip: 'the whole trip' },
    override: { remove: 'drop', add: 'add a frame', undo: 'Dropped — undo' },
  },
  aurelia: {
    hers:       { onDevice: 'auto-picked from your roll · sharpest first', vision: 'auto-picked from your roll · best light + framing' },
    featuring:  { onDevice: 'auto-picked · your sharpest with you in them', vision: 'auto-picked · best light + framing, with you' },
    sub: { hers: 'your shots, ranked', featuring: 'with you in them' },
    override: { remove: 'not this one', add: 'add one', undo: 'gone — undo' },
  },
  // Rafa gets no ranking, ever. His strip is warmth, never "best".
  rafa: { stripTitle: 'Look what you did!', stripSub: 'your day, the fun parts' },
};

// ── COPY — empty & partial states (alive, inviting, never a task list) ─────
const EMPTY_COPY = {
  noFaces: {
    helen:    "This phone hasn't met everyone yet. Teach it your family — a couple photos each is plenty. Nothing leaves this phone.",
    jonathan: 'No faces taught on this device yet. A couple photos each and it starts finding people. Stays on your phone.',
    aurelia:  "this phone doesn't know faces yet. teach it — a couple each. nothing leaves here.",
    rafa:     "Let's find you! Ask a grown-up to help the app learn your face.",
  },
  noScores: {
    helen:    "Still looking through today's photos for the clearest ones — they'll appear as the day settles.",
    jonathan: 'Still scanning today\'s frames. Picks fill in as photos land.',
    aurelia:  'still going through today\'s. the good ones show up as it looks.',
    rafa:     'Still looking for the fun ones…!',
  },
  noVideos: {
    helen: 'No videos this trip — all stills.',
    jonathan: 'No video this trip. Stills only.',
    aurelia: 'no videos. all photos this time.',
    rafa: 'No movies yet — make one!',
  },
  zeroMatch: {
    helen: 'Nothing matches that here — try fewer filters.',
    jonathan: 'No frames match. Loosen a filter.',
    aurelia: 'nothing here for that. drop a filter?',
    rafa: '—',
  },
  arriving: {
    helen: 'A few new since this morning.',
    jonathan: '3 added since 09:00.',
    aurelia: 'couple new ones.',
    rafa: 'New pictures! ✨',
  },
};

// Consent seam (Claude-vision tier — Jonathan's explicit go; adults only) and
// the per-device face seam (embrace it, never nag).
const SEAM_COPY = {
  vision: {
    helen:    'Want sharper picks? The app can weigh light and composition, not just focus. Photos would go to Claude to score, then come back — off unless you turn it on.',
    jonathan: 'Sharper picks available: send frames to Claude to judge light & composition, then discard the copies. Off by default. Your call.',
    aurelia:  'want smarter picks? a grown-up can turn on light + framing scoring for the whole family.',
  },
  teachDevice: {
    helen:    'This phone knows your family. Teach your other devices too and they’ll find everyone there as well.',
    jonathan: 'Faces are taught per device. Set each of your devices up the same way to see "featuring" everywhere.',
    aurelia:  'this phone knows faces. teach your other devices and they’ll know them too.',
  },
};

Object.assign(window, {
  DAY_BASE, ALBUM, albVideos, albWith, albumSections, bestPicks,
  LENS_CFG, PICK_COPY, EMPTY_COPY, SEAM_COPY,
});
