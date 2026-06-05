// Per-traveler integration mapping. The themed views read this to decide
// which Maps app to deep-link to, which music service to surface, etc.
// Mirrors the table in V3 spec §5 (legacy comments referenced
// `TripPlatform_BuildSpec_v2.md` — see V3 naming note at the top of
// ROADTRIP_PWA_BUILD_SPEC_V3.md).
//
// TRAVELER_DOT (below) is the SINGLE canonical per-person identity color —
// the dot on avatars, attribution chips, person pickers. It mirrors the
// design handoff (system.jsx → TRAVELERS[*].dot) and is independent of each
// view's surface palette in themes.css (--accent is the lens accent, a
// separate thing). Consolidated 2026-06-05: a legacy per-traveler `color`
// field (used only by the Settings persona picker) was retired in favor of
// this, and JonathanView's hardcoded masthead-dot literal now reads it too.

export const TRAVELER_ORDER = ['jonathan', 'helen', 'aurelia', 'rafa']

export const TRAVELERS = {
  jonathan: {
    id: 'jonathan',
    name: 'Jonathan',
    sub: 'ops',
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
    appleId: null, // uses parent device
    music: null,
    maps: 'apple-maps',
    photos: 'apple-photos',
    podcasts: null,
  },
}

// The canonical per-person identity dot — Jonathan cobalt, Helen forest,
// Aurelia hot pink, Rafa orange-red. Values are the design handoff dots
// (system.jsx TRAVELERS[*].dot). Drives the Avatar, attribution chips in
// StopDetail / ThreadedMemories / PostcardComposer, the Switcher, and the
// activity/import person pickers. One source of truth — change a person's
// identity color here and it moves everywhere.
export const TRAVELER_DOT = {
  jonathan: '#2E6BB8',
  helen: '#2E7D52',
  aurelia: '#E8478C',
  rafa: '#E8552E',
}
