// Per-traveler integration mapping. The themed views read this to decide
// which Maps app to deep-link to, which music service to surface, etc.
// Mirrors the table in TripPlatform_BuildSpec_v2.md §5.

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
export const TRAVELER_DOT = {
  jonathan: '#1A1614',
  helen: '#8B2B1F',
  aurelia: '#C77A45',
  rafa: '#E63333',
}
