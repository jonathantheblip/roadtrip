// Per-traveler integration mapping. The themed views read this to decide
// which Maps app to deep-link to, which music service to surface, etc.
// Mirrors the table in V3 spec §5 (legacy comments referenced
// `TripPlatform_BuildSpec_v2.md` — see V3 naming note at the top of
// ROADTRIP_PWA_BUILD_SPEC_V3.md).
//
// TRAVELER_DOT below mirrors the Family Trips Redesign bundle's
// per-traveler dot colors (system.jsx → TRAVELERS[*].dot). These are
// the canonical author-attribution colors and are independent of each
// view's surface palette in themes.css.

export const TRAVELER_ORDER = ['jonathan', 'helen', 'aurelia', 'rafa']

export const TRAVELERS = {
  jonathan: {
    id: 'jonathan',
    name: 'Jonathan',
    sub: 'ops',
    color: '#1A1614',
    appleId: 'jonathan.d.jackson@gmail.com',
    music: 'spotify',
    maps: 'waze',
    photos: 'apple-photos',
    podcasts: 'overcast',
  },
  helen: {
    id: 'helen',
    name: 'Helen',
    sub: 'archive',
    color: '#8B2B1F',
    appleId: 'hhemley@gmail.com',
    music: 'apple-music',
    maps: 'apple-maps',
    photos: 'apple-photos',
    podcasts: 'apple-podcasts',
  },
  aurelia: {
    id: 'aurelia',
    name: 'Aurelia',
    sub: 'her stuff',
    color: '#C77A45',
    appleId: 'aureliaelise2012@icloud.com',
    music: 'spotify',
    maps: 'apple-maps',
    photos: 'apple-photos',
    podcasts: 'apple-podcasts',
  },
  rafa: {
    id: 'rafa',
    name: 'Rafa',
    sub: 'mission',
    color: '#E63333',
    appleId: null, // uses parent device
    music: null,
    maps: 'apple-maps',
    photos: 'apple-photos',
    podcasts: null,
  },
}

// Person-tag swatches used inside themed surfaces (small dots / chips).
// Aligned with the Design bundle's traveler dots — Jonathan navy,
// Helen forest, Aurelia hot pink, Rafa oxblood. Drives memory
// attribution chips in StopDetail and the threaded-memory direction.
export const TRAVELER_DOT = {
  jonathan: '#1E3A6F',
  helen: '#2E5D3A',
  aurelia: '#E8478C',
  rafa: '#C9342A',
}
