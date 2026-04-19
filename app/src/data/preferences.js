// Family preference model for the Re-Plan scorer.
// Structured as loves / neutral / avoids per person, plus dietary and vibe.
// Source: ROADTRIP_PWA_BUILD_SPEC_V2.md § "Family-preference tagging".
// This is the product. A shallow tag list would produce shallow recs.

export const FAMILY = {
  jonathan: {
    loves: [
      'motorcycles', 'engineering', 'roots-americana', 'music-history',
      'appalachian-blues', 'architectural-preservation', 'roadside-americana',
      'working-rail-machinery', 'adaptive-reuse', 'brewpub-novelty',
    ],
    neutral: ['most-food-styles', 'parks'],
    avoids: ['kitsch', 'tourist-traps'],
    dietary: 'omnivore',
    vibe: 'Rice alum. Appreciates restoration and adaptive reuse. Hates beige.',
  },
  helen: {
    loves: [
      'abstract-expressionism', 'rothko', 'tworkov', 'twombly', 'art-museums',
      'historic-architecture', 'sculpture-gardens', 'brutalism',
      '1920s-40s-design', 'wabi-sabi', 'collected-not-curated',
      'brass-fixtures', 'teal-tile', 'white-beadboard',
    ],
    neutral: ['roadside-americana'],
    avoids: [
      'chain-restaurants', 'gray-airbnb-staging', 'farmhouse-kitsch',
      'live-laugh-love', 'west-elm-bland', 'word-art',
    ],
    dietary: 'vegetarian',
    dietaryRule:
      'Must have a real entrée — pasta, grain bowls, Mediterranean, Indian, ' +
      'veggie pizza with character, Thai, brick-oven vegetables. A single ' +
      'sad veggie burger as the only option is a FAIL.',
    vibe: "Artist's eye. Teal tile, brass, beadboard. Hates beige. " +
      'Novelty of aesthetic matters — no repeat restaurant vibes two nights running.',
  },
  aurelia: {
    loves: [
      'photogenic-architecture', 'murals', 'historic-districts',
      'concert-posters', 'pink-zellige', 'vintage-shops', 'food-halls',
      'neon-signage', 'rooftop-views', 'cliff-edges', 'adaptive-reuse',
      'real-teen-hangs', 'the-hills-aesthetic',
    ],
    neutral: ['museums', 'most-food'],
    avoids: ['cutesy', 'babied', 'chuck-e-cheese-energy', 'for-kids-talk-down'],
    dietary: 'omnivore',
    vibe: '13 and has real taste. Photographer\'s eye. Short vivid moments land ' +
      'big — 15 seconds of "whoa" is real teen currency. Will ignore a 20-min ' +
      'museum but remember a neon star for years.',
  },
  rafa: {
    loves: [
      'monsters', 'godzilla', 'motorcycles', 'dinosaurs', 'big-machines',
      'playgrounds', 'running-space', 'spider-man', 'cars', 'size-comparisons',
      'working-rail-machinery',
    ],
    neutral: ['short-walks', 'plain-food'],
    avoids: ['long-still-sits', 'babied-interfaces', 'cutesy'],
    dietary: 'kid-easy',
    dietaryRule:
      'Plain pasta, pizza, grilled cheese, chicken nuggets. Most places with ' +
      'pizza or pasta are fine.',
    attentionSpan: 45, // minutes per stop
    bedtime: '19:15',
    vibe: 'Almost 5. Watches GrayStillPlays. Bold not cutesy. Will push later for truly great stops.',
  },
}

// Chain blacklist — never surface as a real recommendation.
// Fallback tier ("if all else fails, CFA is the least sad") is OK but
// should be clearly labeled in UI, not shown as a top pick.
export const CHAIN_BLACKLIST = [
  'applebee', 'chili', 'olive garden', 'ihop', 'cracker barrel',
  'tgi friday', 'friday\'s', 'denny', 'panera', 'chipotle', 'subway',
  'mcdonald', 'burger king', 'wendy', 'taco bell', 'pizza hut',
  'domino', "papa john", 'arby', 'jack in the box', 'carl\'s jr',
  'hardee', 'sonic', 'dairy queen', 'ruby tuesday', 'red lobster',
  'outback', 'texas roadhouse', 'longhorn', 'kfc', 'popeye',
  'starbucks', 'dunkin', "wendy's", 'five guys', 'shake shack',
]

export const FALLBACK_TIER = ['chick-fil-a', 'cfa', "chick fil a"]

// Tourist-trap signals — never recommend as real stops.
export const TOURIST_TRAP_SIGNALS = [
  'ripley', 'wax museum', 'world of', 'believe it or not',
]

// Categorize cuisines so novelty tracking can detect "Italian → Italian" hits.
export const CUISINE_CATEGORIES = {
  italian: ['italian', 'pizza', 'pasta', 'trattoria', 'osteria', 'roma', 'savona'],
  mexican: ['mexican', 'taqueria', 'taco', 'tex-mex', 'cantina'],
  bbq: ['bbq', 'barbecue', 'smokehouse', 'brisket'],
  brewpub: ['brewpub', 'brewing', 'brewery', 'beer hall', 'taproom'],
  mediterranean: ['mediterranean', 'greek', 'turkish', 'lebanese', 'falafel', 'hummus'],
  indian: ['indian', 'curry', 'tikka', 'masala'],
  thai: ['thai'],
  vietnamese: ['vietnamese', 'pho', 'banh mi'],
  southern: ['southern', 'soul food', 'comfort food', 'meat-and-three'],
  diner: ['diner', 'breakfast'],
  cafe: ['cafe', 'coffee', 'bakery'],
}

export function cuisineCategory(name = '', description = '') {
  const h = (name + ' ' + description).toLowerCase()
  for (const [cat, keys] of Object.entries(CUISINE_CATEGORIES)) {
    if (keys.some((k) => h.includes(k))) return cat
  }
  return 'other'
}
