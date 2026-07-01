// homeVoice.js — per-lens VOICE for the living heart (Design 06 facelift; the
// reference is app/docs/design/hangout-first-handoff/skin-home.jsx). SAME
// structure for everyone, tuned WORDS. Helen is the warm base; AURELIA is
// lowercase + dreamier; JONATHAN is drier / more "ops." Rafa keeps his own iPad
// pad (RafaView), so only the three adult lenses matter here.
//
// The heart of Aurelia's voice is the design's `lc` transform — she lowercases
// the home's prose ("at the cabin", "on the agenda"). `homeVoice(t).lc(str)` does
// that for her and is the identity for everyone else, so it's safe to wrap any
// display string. A lens without an override falls back to the warm base, so a
// line is never missing.

// The warm base (Helen's voice — the copy the home shipped with).
const BASE = {
  weaveKicker: 'The Weave',
  weaveStoryKicker: 'The story so far',
  weaveDuring: 'The day’s story appears here once the day has a little in it.',
  weaveUpcoming: 'Your trip’s story will write itself here.',
  weaveAfter: 'Your trip’s story lives here.',
  nearbyKicker: 'While you’re there',
  nearbyLine: 'See what you could do nearby',
  photosGather: 'Photos will gather here as you go',
  agendaEmptyKicker: 'Nothing planned — and that’s allowed',
  addSomething: 'Add something',
}

// Per-lens overrides (only the lines that differ from the warm base). Jonathan's
// real voice (this whole work window + his texts): warm, direct, a touch wry,
// em-dashes, honest — NOT clipped "ops." So he keeps most of the warm base with a
// few plainer, drier-witty touches. Aurelia's (her actual texts: "woahhh", "its
// so aesthetic", "lol ya imma be locked in"): lowercase + casual/gen-z — the lc()
// transform lowercases her whole home; these lean into the casual register.
const OVERRIDES = {
  jonathan: {
    weaveDuring: 'The day’s story shows up here once there’s a bit worth telling.',
    nearbyLine: 'A few things worth heading out for',
    agendaEmptyKicker: 'Nothing planned today — take it easy',
  },
  aurelia: {
    weaveKicker: 'the weave',
    weaveStoryKicker: 'the story so far',
    weaveDuring: 'the day’s story shows up here once there’s a bit to it.',
    weaveUpcoming: 'this is where the trip’s story ends up.',
    weaveAfter: 'the whole trip lives here.',
    nearbyKicker: 'while you’re here',
    nearbyLine: 'stuff we could go do',
    agendaEmptyKicker: 'nothing planned — and that’s kinda the vibe',
    addSomething: 'add something',
  },
}

// The voice for a lens: a `lc` transform (lowercase for Aurelia, identity else)
// + the resolved copy strings (override → warm base, then lc'd). Pure.
export function homeVoice(traveler) {
  const low = traveler === 'aurelia'
  const lc = (s) => (low && typeof s === 'string' ? s.toLowerCase() : s)
  const o = OVERRIDES[traveler] || {}
  const g = (k) => lc(o[k] != null ? o[k] : BASE[k])
  return {
    low,
    lc,
    weaveKicker: g('weaveKicker'),
    weaveStoryKicker: g('weaveStoryKicker'),
    weaveDuring: g('weaveDuring'),
    weaveUpcoming: g('weaveUpcoming'),
    weaveAfter: g('weaveAfter'),
    nearbyKicker: g('nearbyKicker'),
    nearbyLine: g('nearbyLine'),
    photosGather: g('photosGather'),
    agendaEmptyKicker: g('agendaEmptyKicker'),
    addSomething: g('addSomething'),
  }
}
