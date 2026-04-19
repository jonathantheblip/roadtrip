// Curated stop library for Feature 3 (Re-Plan with Alternatives).
// Each stop is tagged against the family preference model in preferences.js.
// Seed grows from trip research + actual-log entries over time.
//
// Scoring uses:
//   serves[]     — family members this stop genuinely serves
//   servesReason — one sentence per served member naming the specific hook
//   tags[]       — preference tags matching loves/avoids lookups
//   vetoes[]     — dietary/chain/tourist-trap flags that disqualify
//   cuisine      — category for novelty check ('italian', 'brewpub', etc.)
//   dwellMin     — realistic minimum minutes; <30 → photo-stop only
//   offHwyMin    — minutes off highway (5 or less is the sweet spot)
//   openDays     — bitmask-style array; 0=Sun..6=Sat; null=always open
//   openTime/closeTime — HH:MM local (24h); null = always open

export const CURATED = [
  // ---------- Virginia I-81 corridor (Saturday / Sunday relevant) ----------
  {
    id: 'c-box-office',
    name: 'Box Office Brewery',
    address: '151 E King St, Strasburg, VA 22657',
    lat: 38.989, lng: -78.359,
    state: 'VA',
    cuisine: 'brewpub',
    types: ['food', 'photo'],
    serves: ['helen', 'aurelia', 'jonathan', 'rafa'],
    servesReason: {
      helen: 'Beyond Burger + build-your-own veggie pizza — real vegetarian entrée',
      aurelia: '1918 Strand Theater with original film posters and the old main stage',
      jonathan: 'Adaptive reuse done right — theater to brewpub',
      rafa: 'Build-your-own pizza. Easy win.',
    },
    tags: ['adaptive-reuse', 'historic-architecture', 'photogenic-architecture', 'brewpub-novelty'],
    vetoes: [],
    dwellMin: 60, offHwyMin: 3,
    openDays: [0,1,2,3,4,5,6], openTime: '11:30', closeTime: '22:00',
    phone: '540-465-2831',
    note: 'Off I-81 exit 298. Saturday live music — ask for off-stage seating.',
  },
  {
    id: 'c-mill-mountain',
    name: 'Mill Mountain Star',
    address: '2000 Mill Mountain Spur, Roanoke, VA 24014',
    lat: 37.258, lng: -79.932,
    state: 'VA',
    cuisine: null,
    types: ['photo', 'poi'],
    serves: ['aurelia', 'jonathan'],
    servesReason: {
      aurelia: '88-ft neon star at night, panoramic Roanoke valley view — real teen currency',
      jonathan: 'Roadside Americana at its best. Short, vivid, worth the detour.',
    },
    tags: ['neon-signage', 'rooftop-views', 'roadside-americana', 'photogenic-architecture'],
    vetoes: [],
    dwellMin: 15, offHwyMin: 10,
    openDays: null, openTime: null, closeTime: null,
    note: 'Short photo stop — not a dinner replacement.',
  },
  {
    id: 'c-texas-tavern',
    name: 'Texas Tavern',
    address: '114 W Church Ave SW, Roanoke, VA 24011',
    lat: 37.272, lng: -79.942,
    state: 'VA',
    cuisine: 'diner',
    types: ['food'],
    serves: ['jonathan', 'aurelia'],
    servesReason: {
      jonathan: '1930 10-stool diner still run by the founding family. Roots Americana.',
      aurelia: 'Neon sign + 10 stools — photogenic in a way chain diners never are.',
    },
    tags: ['roots-americana', 'roadside-americana', 'historic-architecture', 'neon-signage'],
    vetoes: ['helen-no-real-veg-entree'], // chili cheese dogs; veggie options thin
    dwellMin: 30, offHwyMin: 5,
    openDays: [0,1,2,3,4,5,6], openTime: '00:00', closeTime: '23:59',
    note: 'Vetoed for Helen — no real veg entrée. Never top pick on family nights.',
  },

  // ---------- East TN / Knoxville / Chattanooga ----------
  {
    id: 'c-yassin-marble',
    name: "Yassin's Falafel House — Marble City Market",
    address: '333 W Depot Ave Suite 110, Knoxville, TN 37902',
    lat: 35.968, lng: -83.925,
    state: 'TN',
    cuisine: 'mediterranean',
    types: ['food'],
    serves: ['helen', 'aurelia', 'jonathan', 'rafa'],
    servesReason: {
      helen: 'Falafel, hummus, foul mudammas — real Mediterranean vegetarian entrées',
      aurelia: 'Food hall vibe — real-teen energy',
      jonathan: 'Owner Yassin Terou, Knoxvillian of the Year. Non-chain.',
      rafa: 'Hummus + pita + french fries. Kid-safe.',
    },
    tags: ['food-halls', 'collected-not-curated', 'real-teen-hangs'],
    vetoes: [],
    dwellMin: 45, offHwyMin: 5,
    openDays: [0,1,2,3,4,5,6], openTime: '11:00', closeTime: '21:00',
    phone: '865-219-1462',
    note: 'Only the Marble City Market stall is Sunday-open — Walnut St flagship is closed Sundays AND under construction.',
  },
  {
    id: 'c-fort-kid',
    name: 'Fort Kid Playground',
    address: '610 W Hill Ave, Knoxville, TN 37902',
    lat: 35.963, lng: -83.925,
    state: 'TN',
    cuisine: null,
    types: ['energy'],
    serves: ['rafa'],
    servesReason: {
      rafa: 'Rebuilt 2023 — bold, not cutesy. Run-around before lunch.',
    },
    tags: ['running-space', 'playgrounds'],
    vetoes: [],
    dwellMin: 30, offHwyMin: 3,
    openDays: null, openTime: null, closeTime: null,
    note: 'Walks to Marble City Market in under 5 min.',
  },
  {
    id: 'c-threefoot-hotel',
    name: 'The Threefoot Hotel',
    address: '601 22nd Ave, Meridian, MS 39301',
    lat: 32.364, lng: -88.704,
    state: 'MS',
    cuisine: null,
    types: ['poi', 'photo'],
    serves: ['helen', 'aurelia', 'jonathan'],
    servesReason: {
      helen: '1929 Art Deco skyscraper — the brass + terracotta you love',
      aurelia: 'Rooftop bar on the 16th floor of an Art Deco icon',
      jonathan: '2021 adaptive reuse of the tallest building in East MS',
    },
    tags: ['1920s-40s-design', 'adaptive-reuse', 'photogenic-architecture', 'rooftop-views'],
    vetoes: [],
    dwellMin: 60, offHwyMin: 2,
    openDays: null, openTime: null, closeTime: null,
    phone: '601-207-8700',
    note: 'Tribute Portfolio · Bonvoy. Two rooms booked Sun Apr 19.',
  },
  {
    id: 'c-amore-italian',
    name: 'Amore Italian Ristorante',
    address: '1600 24th Ave, Meridian, MS 39301',
    lat: 32.362, lng: -88.709,
    state: 'MS',
    cuisine: 'italian',
    types: ['food'],
    serves: ['helen', 'rafa', 'aurelia', 'jonathan'],
    servesReason: {
      helen: 'Margherita, pasta pomodoro, caprese — real vegetarian entrées',
      rafa: 'Plain pasta or pizza. Safe.',
      aurelia: 'Old Southern house — photo-worthy interior',
      jonathan: 'Almost every other Meridian dinner spot is closed Sunday. Amore is the Sunday answer.',
    },
    tags: ['historic-architecture'],
    vetoes: [],
    dwellMin: 60, offHwyMin: 2,
    openDays: [0,2,3,4,5,6], openTime: '11:00', closeTime: '21:00',
    phone: '601-207-5128',
    note: 'Sunday-open exception in downtown Meridian. 4-block walk from Threefoot.',
  },
  {
    id: 'c-broadway-deli',
    name: 'Broadway Deli (McComb)',
    address: '117 S Front St, McComb, MS 39648',
    lat: 31.245, lng: -90.454,
    state: 'MS',
    cuisine: 'southern',
    types: ['food'],
    serves: ['helen', 'jonathan'],
    servesReason: {
      helen: 'Veggie sandwich/salad — pre-order Sunday night to confirm',
      jonathan: 'The Mon-Tue pickup answer since The Dinner Bell is closed those days.',
    },
    tags: ['collected-not-curated'],
    vetoes: [],
    dwellMin: 15, offHwyMin: 3,
    openDays: [1,2,3,4,5], openTime: '10:30', closeTime: '14:00',
    phone: '601-249-2430',
    note: 'Pre-order call Sunday evening. Bring pickup TO Grandma.',
  },
  {
    id: 'c-vicksburg-nmp',
    name: 'Vicksburg National Military Park',
    address: '3201 Clay St, Vicksburg, MS 39183',
    lat: 32.348, lng: -90.850,
    state: 'MS',
    cuisine: null,
    types: ['poi', 'photo'],
    serves: ['jonathan', 'rafa', 'helen', 'aurelia'],
    servesReason: {
      jonathan: 'Civil War siege site — the one that split the Confederacy',
      rafa: 'USS Cairo ironclad + cannons to walk between',
      helen: 'Monument sculpture along Pemberton Loop',
      aurelia: 'Illinois Memorial in late-afternoon light',
    },
    tags: ['historic-architecture', 'sculpture-gardens'],
    vetoes: [],
    dwellMin: 40, offHwyMin: 1,
    openDays: [0,1,2,3,4,5,6], openTime: '06:00', closeTime: '20:00',
    phone: '601-636-0583',
    note: 'Visitor Center CLOSED Mondays — pre-pay $20 on recreation.gov. Tour road + USS Cairo open daily.',
  },
  {
    id: 'c-hunter-museum',
    name: 'Hunter Museum of American Art',
    address: '10 Bluff View Ave, Chattanooga, TN 37403',
    lat: 35.055, lng: -85.304,
    state: 'TN',
    cuisine: null,
    types: ['poi', 'photo'],
    serves: ['helen', 'aurelia'],
    servesReason: {
      helen: 'Abstract Expressionism collection including Tworkov and Motherwell',
      aurelia: 'Cliff-edge setting over the Tennessee River — rooftop views moment',
    },
    tags: ['abstract-expressionism', 'art-museums', 'historic-architecture', 'rooftop-views', 'cliff-edges'],
    vetoes: [],
    dwellMin: 75, offHwyMin: 8,
    openDays: [1,2,3,4,5,6], openTime: '10:00', closeTime: '17:00',
    note: 'Closed Sunday & Monday. Tight timing on a travel day — commit or skip.',
  },
  {
    id: 'c-coolidge-carousel',
    name: 'Coolidge Park Carousel & Bridge',
    address: '150 River St, Chattanooga, TN 37405',
    lat: 35.061, lng: -85.308,
    state: 'TN',
    cuisine: null,
    types: ['energy', 'photo'],
    serves: ['rafa', 'aurelia'],
    servesReason: {
      rafa: 'Antique 1894 carousel, 52 hand-carved animals, $1 per ride',
      aurelia: 'Walnut Street Bridge — one of Chattanooga\'s most-photographed spots',
    },
    tags: ['running-space', 'photogenic-architecture'],
    vetoes: [],
    dwellMin: 30, offHwyMin: 3,
    openDays: [0,1,2,3,4,5,6], openTime: '11:00', closeTime: '19:00',
  },

  // ---------- Birmingham AL ----------
  {
    id: 'c-barber',
    name: 'Barber Vintage Motorsports Museum',
    address: '6030 Barber Motorsports Pkwy, Leeds, AL 35094',
    lat: 33.533, lng: -86.622,
    state: 'AL',
    cuisine: null,
    types: ['poi'],
    serves: ['jonathan', 'rafa', 'aurelia'],
    servesReason: {
      jonathan: 'Largest motorcycle museum in the world. 1,600+ bikes. You have been waiting for this.',
      rafa: 'Hundreds of motorcycles and racing cars — big machines he can walk between',
      aurelia: 'The sculpture and the sheer scale is genuinely photogenic',
    },
    tags: ['motorcycles', 'engineering', 'big-machines', 'size-comparisons'],
    vetoes: [],
    dwellMin: 120, offHwyMin: 5,
    openDays: [0,1,2,3,4,5,6], openTime: '10:00', closeTime: '18:00',
    note: 'Doors close at 6 PM CT. Critical hard constraint on Sunday timing.',
  },
  {
    id: 'c-saws-bbq',
    name: "Saw's BBQ",
    address: '1008 Oxmoor Rd, Homewood, AL 35209',
    lat: 33.472, lng: -86.791,
    state: 'AL',
    cuisine: 'bbq',
    types: ['food'],
    serves: ['jonathan', 'rafa'],
    servesReason: {
      jonathan: 'Alabama white-sauce BBQ — a regional specialty worth the trip.',
      rafa: 'Plain chicken + mac and cheese.',
    },
    tags: ['roots-americana'],
    vetoes: ['helen-thin-veg'],
    dwellMin: 45, offHwyMin: 5,
    openDays: [0,1,2,3,4,5,6], openTime: '11:00', closeTime: '21:00',
    note: 'Veg options thin — not a Helen-first pick.',
  },

  // ---------- Mississippi ----------
  {
    id: 'c-threefoot',
    name: 'Threefoot Building',
    address: '601 22nd Ave, Meridian, MS 39301',
    lat: 32.364, lng: -88.704,
    state: 'MS',
    cuisine: null,
    types: ['photo', 'poi'],
    serves: ['helen', 'aurelia', 'jonathan'],
    servesReason: {
      helen: '1929 Art Deco icon — brass, terracotta, the era you love.',
      aurelia: 'Geometric Art Deco facade — photogenic architecture.',
      jonathan: 'Restored 2021 to a Marriott — adaptive reuse done right.',
    },
    tags: ['1920s-40s-design', 'historic-architecture', 'adaptive-reuse', 'photogenic-architecture'],
    vetoes: [],
    dwellMin: 20, offHwyMin: 5,
    openDays: null, openTime: null, closeTime: null,
    note: 'Photo stop. 16-story exterior.',
  },
  {
    id: 'c-weidmann',
    name: "Weidmann's Restaurant",
    address: '210 22nd Ave, Meridian, MS 39301',
    lat: 32.361, lng: -88.704,
    state: 'MS',
    cuisine: 'southern',
    types: ['food'],
    serves: ['helen', 'jonathan', 'aurelia'],
    servesReason: {
      helen: 'Pasta primavera + grain bowls + shrimp & grits (shrimp optional) — vegetarian depth.',
      jonathan: 'Oldest restaurant in MS, 1870. Bookmatched walnut, original soda fountain.',
      aurelia: 'Historic interior — the restored 1870 room is aesthetic.',
    },
    tags: ['historic-architecture', 'collected-not-curated', '1920s-40s-design'],
    vetoes: [],
    dwellMin: 75, offHwyMin: 3,
    openDays: [1,2,3,4,5,6], openTime: '11:00', closeTime: '21:00',
    note: 'Closed Sunday. Confirm on call if Sunday-timed.',
  },

  // ---------- Catskills / PA corridor (for retro/log consistency) ----------
  {
    id: 'c-breaker',
    name: 'Breaker Brewing',
    address: '72 W Dorrance St, Kingston, PA 18704',
    lat: 41.263, lng: -75.884,
    state: 'PA',
    cuisine: 'brewpub',
    types: ['food'],
    serves: ['helen', 'jonathan'],
    servesReason: {
      helen: 'Veggie options confirmed — a real entrée beyond a sad veggie burger.',
      jonathan: 'Non-chain brewpub off the Wilkes-Barre exit.',
    },
    tags: ['brewpub-novelty'],
    vetoes: [],
    dwellMin: 60, offHwyMin: 3,
    openDays: [1,2,3,4,5,6], openTime: '11:30', closeTime: '22:00',
  },

  // ---------- Fallback tier examples (flagged) ----------
  {
    id: 'c-cfa-fallback',
    name: 'Chick-fil-A (fallback)',
    address: 'Various — off any interstate',
    cuisine: 'fallback',
    types: ['food'],
    serves: ['rafa'],
    servesReason: { rafa: 'Guaranteed kid win when nothing else works.' },
    tags: ['fallback'],
    vetoes: ['fallback-only'],
    dwellMin: 20, offHwyMin: 2,
    openDays: [1,2,3,4,5,6], openTime: '06:00', closeTime: '22:00',
    note: 'Never a top pick. Only surfaces when all else fails.',
  },
]

export function curatedByRegion(originLat, originLng, maxMiles = 150) {
  // Haversine-ish filter for stops within a reasonable radius of origin.
  if (originLat == null || originLng == null) return CURATED
  return CURATED.filter((s) => {
    if (s.lat == null || s.lng == null) return true
    const dLat = (s.lat - originLat) * 69
    const dLng = (s.lng - originLng) * 69 * Math.cos((originLat * Math.PI) / 180)
    const miles = Math.sqrt(dLat * dLat + dLng * dLng)
    return miles <= maxMiles
  })
}
