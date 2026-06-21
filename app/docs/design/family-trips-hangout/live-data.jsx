// hangout/live-data.jsx — trip data that GENERALIZES across trip types.
// Two stays: a beach cottage (Wellfleet) and a city apartment (Chicago).
// Conditions are per-trip, so we never show tide in Chicago. Pantry items carry
// travel time (walk/drive/transit), who they suit (for combinations), and
// optional limited-time / special-event windows. Surprises live here too,
// with who they're masked from.

const TRIPS = {
  wellfleet: {
    id: 'wellfleet', type: 'beach', place: 'The cottage', placeSub: 'Indian Neck · Wellfleet',
    weather: 'Hazy sun · 78° · tide going out',
    cond: [['GOLDEN', '7:12'], ['SUNSET', '7:52'], ['LOW TIDE', '4:40'], ['WATER', '64°']],
    presence: {
      jonathan: { where: 'On the deck', what: 'Shucking oysters', dotMood: 'good' },
      helen: { where: 'Porch chair', what: 'Reading, half-asleep', dotMood: 'good' },
      aurelia: { where: 'Down the lane', what: 'Shooting the screen door', dotMood: 'good' },
      rafa: { where: 'The flats', what: 'Hunting crabs', dotMood: 'live' },
    },
    moments: [
      { who: 'rafa', cap: 'i found a crab. his name is Gary.' },
      { who: 'aurelia', cap: 'the screen door at 4pm' },
      { who: 'helen', cap: 'Nobody knows what day it is. Good.' },
    ],
    pantry: [
      { id: 'w1', cat: 'meal', title: "Mac's Shack", blurb: 'Lobster rolls & fried clams at a counter.', forIds: ['jonathan', 'helen', 'aurelia', 'rafa'], travel: ['drive', 6], when: 'before 12:30', tint: '#8A5A3C' },
      { id: 'w2', cat: 'meal', title: 'PB Boulangerie', blurb: 'A real French bakery hiding in the pines.', forIds: ['helen', 'aurelia'], travel: ['drive', 8], when: 'mornings', tint: '#9A6B3A' },
      { id: 'w3', cat: 'meal', title: 'The Beachcomber', blurb: 'Oysters on a deck over the water.', forIds: ['jonathan', 'helen'], travel: ['drive', 10], when: 'golden hour', event: ['LIVE BAND AT 6'], tint: '#7A6038' },
      { id: 'w4', cat: 'meal', title: 'Wellfleet Pizza', blurb: 'Easy night-in pizza nobody dresses for.', forIds: ['jonathan', 'helen', 'aurelia', 'rafa'], travel: ['drive', 5], when: 'anytime', tint: '#8A5230' },
      { id: 'w5', cat: 'energy', title: 'Bay flats at low tide', blurb: 'Warm water and a hundred hermit crabs.', forIds: ['rafa', 'aurelia'], travel: ['walk', 4], when: '3–5pm', tint: '#3C6E55' },
      { id: 'w6', cat: 'energy', title: 'Newcomb Hollow dunes', blurb: 'Big sand hills made for running down.', forIds: ['jonathan', 'rafa'], travel: ['drive', 12], when: 'cooler hours', tint: '#4A6B40' },
      { id: 'w7', cat: 'energy', title: 'Mayo Beach playground', blurb: 'Climbing structure by the pier.', forIds: ['rafa'], travel: ['walk', 7], when: 'anytime', tint: '#3E6E62' },
      { id: 'wk', cat: 'energy', title: 'Kayaks at the bay', blurb: 'Two-seaters, flat water, calm.', forIds: ['jonathan', 'aurelia'], travel: ['walk', 3], when: 'before wind picks up', tint: '#3A6E66' },
      { id: 'ws', cat: 'energy', title: 'Library story time', blurb: 'A quiet half-hour and a craft.', forIds: ['helen', 'rafa'], travel: ['drive', 9], when: 'Sat 10:30', event: ['SAT 10:30 ONLY'], tint: '#5A6E44' },
      { id: 'w9', cat: 'look', title: 'Wellfleet Flea', blurb: 'Old denim and film cameras. It photographs itself.', forIds: ['aurelia'], travel: ['drive', 14], when: 'weekends', event: ['SAT & SUN ONLY', true], tint: '#8A476A' },
      { id: 'w10', cat: 'look', title: 'Herridge Books', blurb: 'Used bookstore, perfect afternoon light.', forIds: ['aurelia', 'helen'], travel: ['drive', 9], when: 'afternoons', tint: '#7A4A6A' },
      { id: 'w11', cat: 'look', title: 'The pier at golden hour', blurb: 'Boats, pink sky — the post she came for.', forIds: ['aurelia'], travel: ['walk', 7], when: '~7:50', event: ['~7:50 TONIGHT'], tint: '#8A4A60' },
      { id: 'w12', cat: 'look', title: "Mind's eye cones", blurb: 'Pastel ice cream that looks as good as it tastes.', forIds: ['aurelia', 'rafa'], travel: ['walk', 6], when: 'anytime', tint: '#94506A' },
      { id: 'we1', cat: 'together', title: 'Sandcastle contest', blurb: 'Town beach builds, judged at one. Today only.', forIds: ['rafa', 'aurelia', 'jonathan', 'helen'], travel: ['walk', 9], when: 'today', event: ['SAT 11–1 · TODAY', true], tint: '#4A5A78' },
      { id: 'w13', cat: 'together', title: 'Wellfleet Drive-In', blurb: 'A double feature under the stars.', forIds: ['jonathan', 'helen', 'aurelia', 'rafa'], travel: ['drive', 9], when: 'tonight', event: ['TONIGHT · GATES 7:30', true], tint: '#4A5A78' },
      { id: 'w14', cat: 'together', title: 'Sunset at the bay', blurb: 'Walk down with a blanket. The whole point.', forIds: ['jonathan', 'helen', 'aurelia', 'rafa'], travel: ['walk', 2], when: '~7:52', event: ['~7:52'], tint: '#5A5680' },
    ],
    surprises: [
      { id: 'wsu1', by: 'helen', title: 'A sunset catboat sail', blurb: 'Booked a little boat for all four of us.', hideFrom: ['rafa', 'aurelia'], reveal: 'On the dock, 6pm', tint: '#5A5680' },
      { id: 'wsu2', by: 'aurelia', title: 'A flea-market find', blurb: 'Got Helen a vintage camera. Shh.', hideFrom: ['helen'], reveal: 'Last night', tint: '#8A476A' },
    ],
  },

  chicago: {
    id: 'chicago', type: 'city', place: 'The apartment', placeSub: 'Wicker Park · Chicago',
    weather: 'Sun & clouds · 76° · light breeze',
    cond: [['GOLDEN', '7:58'], ['SUNSET', '8:28'], ['FEELS', '74°'], ['BLUE LINE', '4 min']],
    presence: {
      jonathan: { where: 'Coffee run', what: 'In line at the roaster', dotMood: 'good' },
      helen: { where: 'By the window', what: 'Watching the street', dotMood: 'good' },
      aurelia: { where: 'Milwaukee Ave', what: 'Thrifting, sending fits', dotMood: 'live' },
      rafa: { where: 'Living room', what: 'Block tower, very tall', dotMood: 'good' },
    },
    moments: [
      { who: 'rafa', cap: 'my tower is taller than papa' },
      { who: 'aurelia', cap: 'the best vintage store ever' },
      { who: 'jonathan', cap: 'found the good coffee. 2 blocks.' },
    ],
    pantry: [
      { id: 'c1', cat: 'meal', title: "Pequod's Pizza", blurb: 'Caramelized-crust deep dish. A whole event.', forIds: ['jonathan', 'helen', 'aurelia', 'rafa'], travel: ['drive', 12], when: 'early or wait', tint: '#8A5230' },
      { id: 'c2', cat: 'meal', title: "Mindy's Bakehouse", blurb: 'Pastries and a quiet corner table.', forIds: ['helen', 'aurelia'], travel: ['walk', 8], when: 'mornings', tint: '#9A6B3A' },
      { id: 'c3', cat: 'meal', title: 'Au Cheval', blurb: 'The burger. The line is short right now.', forIds: ['jonathan', 'helen'], travel: ['transit', 15], when: 'now-ish', event: ['LINE SHORT NOW'], tint: '#7A6038' },
      { id: 'c4', cat: 'meal', title: 'Big Star tacos', blurb: 'Patio tacos two blocks over. Easy.', forIds: ['jonathan', 'helen', 'aurelia', 'rafa'], travel: ['walk', 6], when: 'anytime', tint: '#8A5A3C' },
      { id: 'c5', cat: 'energy', title: 'The 606 trail', blurb: 'Elevated path + a playground at Churchill.', forIds: ['rafa', 'aurelia'], travel: ['walk', 5], when: 'anytime', tint: '#3C6E55' },
      { id: 'c6', cat: 'energy', title: 'Maggie Daley climbing park', blurb: 'Giant climbing structures downtown.', forIds: ['jonathan', 'rafa'], travel: ['transit', 18], when: 'cooler hours', tint: '#4A6B40' },
      { id: 'c7', cat: 'energy', title: 'Skating ribbon', blurb: 'The Maggie Daley loop at dusk.', forIds: ['aurelia', 'jonathan'], travel: ['transit', 18], when: 'evenings', event: ['EVENINGS'], tint: '#3A6E66' },
      { id: 'c8', cat: 'energy', title: 'Lincoln Park Zoo', blurb: 'Free, easy, open till five. Stroller-friendly.', forIds: ['helen', 'rafa'], travel: ['drive', 14], when: 'till 5', event: ['FREE · TILL 5'], tint: '#4C6E4A' },
      { id: 'c9', cat: 'look', title: 'Buffalo Exchange', blurb: 'Racks for days. Wicker Park vintage.', forIds: ['aurelia'], travel: ['walk', 4], when: 'anytime', tint: '#8A476A' },
      { id: 'c10', cat: 'look', title: 'Myopic Books', blurb: 'Three floors of used books and good light.', forIds: ['aurelia', 'helen'], travel: ['walk', 6], when: 'afternoons', tint: '#7A4A6A' },
      { id: 'c11', cat: 'look', title: '360 Chicago at dusk', blurb: 'The skyline goes gold. The post.', forIds: ['aurelia'], travel: ['transit', 20], when: '~8', event: ['~8 TONIGHT'], tint: '#8A4A60' },
      { id: 'c12', cat: 'look', title: "Margie's Candies", blurb: 'Hot-fudge sundaes in a 1920s booth.', forIds: ['aurelia', 'rafa'], travel: ['walk', 9], when: 'anytime', tint: '#94506A' },
      { id: 'ce1', cat: 'together', title: 'Art Institute · late Monet', blurb: 'Thursday-late hours. Show ends Sunday.', forIds: ['helen', 'aurelia', 'jonathan'], travel: ['transit', 16], when: 'thu late', event: ['THU LATE · ENDS SUN', true], tint: '#4A5A78' },
      { id: 'ce2', cat: 'together', title: 'Millennium Park concert', blurb: 'Free under Pritzker tonight at 6:30.', forIds: ['jonathan', 'helen', 'aurelia', 'rafa'], travel: ['transit', 17], when: 'tonight', event: ['TONIGHT 6:30 · FREE', true], tint: '#4A5A78' },
      { id: 'ce3', cat: 'together', title: 'River architecture cruise', blurb: '90 minutes on the water, runs hourly.', forIds: ['jonathan', 'helen', 'aurelia', 'rafa'], travel: ['transit', 14], when: 'hourly', event: ['HOURLY · 90 MIN'], tint: '#5A5680' },
    ],
    surprises: [
      { id: 'csu1', by: 'jonathan', title: 'Cubs tickets, Sunday', blurb: 'Got four for the 1:20 game. Surprise for the kids.', hideFrom: ['rafa', 'aurelia'], reveal: 'At the gate', tint: '#4A5A78' },
      { id: 'csu2', by: 'rafa', title: 'A drawing for Mama', blurb: 'Made a picture of the tall tower.', hideFrom: ['helen'], reveal: 'Tonight', tint: '#94506A' },
    ],
  },
};
const TRIP_ORDER = ['wellfleet', 'chicago'];

// which items are outdoors, summer-only, or beat-the-heat (water/shade) — so
// the tray can react to conditions instead of just describing them.
const SETTINGS = {
  wellfleet: { outdoor: ['w3', 'w5', 'w6', 'w7', 'wk', 'w9', 'w11', 'we1', 'w13', 'w14'], summerOnly: ['w5', 'wk', 'we1'], water: ['w5', 'wk', 'w14'] },
  chicago: { outdoor: ['c4', 'c5', 'c6', 'c7', 'c8', 'ce2', 'ce3'], summerOnly: ['c4'], water: ['c8'], winterWin: ['c7'] },
};
// available conditions per trip: [key, label, weather line, mode]
const WEATHER = {
  wellfleet: [
    ['clear', 'Clear', 'Hazy sun · 78° · tide going out', null],
    ['rain', 'Rain', 'Rain till 3 · 64° · breezy', 'rain'],
    ['hot', 'Hot', '88° & humid · UV very high', 'hot'],
    ['winter', 'Winter', 'Snow flurries · 31° · most of this is shut', 'winter'],
  ],
  chicago: [
    ['clear', 'Clear', 'Sun & clouds · 76° · light breeze', null],
    ['rain', 'Rain', 'Steady rain · 58°', 'rain'],
    ['traffic', 'Traffic', 'Moving slow · 74° · gridlock downtown', 'traffic'],
    ['winter', 'Winter', 'Snow · 28° · lake-effect', 'winter'],
  ],
};
const BANNER = {
  rain: 'Rain in the window — indoor picks first.',
  hot: 'Hot midday — shade, water, and early or late.',
  winter: 'Cold season — indoors and close first; the summer spots are shut.',
  traffic: 'Gridlock right now — close by and on transit first.',
};

// travel label, generalized by mode
function travelStr(tr) {
  if (!tr) return '';
  const [mode, min] = tr;
  return min + ' min ' + (mode === 'walk' ? 'walk' : mode === 'transit' ? 'by L' : 'drive');
}

// combination filter: empty selection = everyone; otherwise the item must suit
// EVERY selected person (a shared outing for exactly that group).
function comboFilter(item, sel) {
  if (!sel || sel.length === 0) return true;
  return sel.every((id) => item.forIds.includes(id));
}
function comboLabel(sel) {
  if (!sel || sel.length === 0) return 'anyone';
  const KIDS = ['aurelia', 'rafa'], AD = ['jonathan', 'helen'];
  const same = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
  if (same(sel, KIDS)) return 'the kids';
  if (same(sel, AD)) return 'the grown-ups';
  return sel.map((id) => window.HG_T[id].name).join(' + ');
}
// is this selection exactly one kid + one adult?
function isOneOnOne(sel) {
  if (!sel || sel.length !== 2) return false;
  const kids = sel.filter((id) => ['aurelia', 'rafa'].includes(id));
  const ad = sel.filter((id) => ['jonathan', 'helen'].includes(id));
  return kids.length === 1 && ad.length === 1;
}

Object.assign(window, { HG_TRIPS: TRIPS, HG_TRIP_ORDER: TRIP_ORDER, HG_travelStr: travelStr,
  HG_comboFilter: comboFilter, HG_comboLabel: comboLabel, HG_isOneOnOne: isOneOnOne,
  HG_SETTINGS: SETTINGS, HG_WEATHER: WEATHER, HG_BANNER: BANNER });
