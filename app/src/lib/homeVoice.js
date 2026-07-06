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

// The warm base (Helen's voice — the copy the home shipped with). Exported so a
// unit test can assert homeVoice's return allowlist stays COMPLETE — a field added
// here but forgotten in the return renders `undefined` on screen (that bit R4c).
export const BASE = {
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
  // THE RECORD · settle card (keep the day)
  settleKick: 'The day, ready to keep',
  settleCta: 'Keep the day',
  settleNothingKick: 'A quiet one?',
  settleNothingSub: 'We stayed put, gloriously.',
  settleNothingCta: 'Keep it',
  settleKeptKick: 'Today, kept',
  settleKeptSub: 'Tonight’s story writes itself from this.',
  // The kept card's quiet door back into the sheet (FIX 5 — kept, never closed).
  settleKeptDoor: 'Add a name',
  // Quiet days POOL (FIX 6 — Jonathan's pick): the card that offers them
  // together. {n} is replaced at render; the "last two" line is used only when
  // the pool is literally the last two days (poolIsContiguous — G6).
  settlePoolKick: 'The quiet days',
  settlePoolSubTwo: 'The last two days — quiet ones?',
  settlePoolSub: '{n} quiet days, still loose.',
  settlePoolCtaTwo: 'Keep them both',
  settlePoolCta: 'Keep them all',
  // A rich day's card carries pending quiet days as one tappable line (never
  // its own ask — the rider only exists because the card is showing anyway).
  settleRiderOne: 'One quiet day, still loose — keep it too?',
  settleRiderMany: '{n} quiet days, still loose — keep them too?',
  // THE RECORD · settle SHEET (name the drafted pins). Per-lens nuance is R6.
  sheetLookOver: 'Look it over',
  sheetTitle: 'The record',
  sheetIntro: 'Drafted from the day’s photos. Fix what’s wrong, name what’s nameless, skip what you like.',
  sheetNameHint: 'Name this place',
  sheetKeepGuess: 'Keep the guess',
  sheetAddMissed: 'Something the photos missed',
  sheetFooter: 'The plan isn’t touched.',
  // The sheet's VERBS (FIX 2/3/4/7 — the promise line above, made true).
  sheetLeaveOut: 'Leave this out',
  sheetLeftOut: 'Left out',
  sheetPutBack: 'Put it back',
  sheetSeePhotos: 'See the photos',
  sheetHidePhotos: 'Hide the photos',
  sheetWho: 'Who was there',
  sheetRafaTold: 'Rafa told about today',
  sheetListen: 'Listen',
  sheetTuck: 'Tuck it into the day',
  sheetTranscribing: 'Transcribing…',
  sheetPlayToHear: '(play to hear it)',
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
    settleKick: 'The record — drafted',
    settleCta: 'Sign off on the day',
    settleNothingSub: 'Stayed put. Zero regrets.',
    settleKeptKick: 'Today, on the record',
    settleKeptSub: 'Signed. The day stands.',
    settleKeptDoor: 'Add to the record',
    settlePoolSubTwo: 'Two quiet days. Sign them off together?',
    settlePoolSub: '{n} quiet days. Sign them off together?',
    settlePoolCtaTwo: 'Sign them off',
    settlePoolCta: 'Sign them off',
    settleRiderOne: 'One quiet day back there. Sign it off too?',
    settleRiderMany: '{n} quiet days back there. Sign them off too?',
    sheetLookOver: 'Review the draft',
    sheetIntro: 'Drafted from the day’s photos. Fix what’s wrong, name what’s nameless, skip the rest.',
    sheetNameHint: 'Name it',
    sheetLeaveOut: 'Leave it out',
    sheetSeePhotos: 'Show the photos',
    sheetTuck: 'Put it on the record',
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
    settleKick: 'keep today?',
    settleCta: 'keep it',
    settleNothingSub: 'we did nothing (elite)',
    settleKeptKick: 'today, kept',
    settleKeptSub: 'woven while you slept.',
    settleKeptDoor: 'name one more?',
    settlePoolSubTwo: 'two floaty days. keep ’em?',
    settlePoolSub: '{n} floaty days. keep ’em?',
    settlePoolCtaTwo: 'keep ’em both',
    settlePoolCta: 'keep ’em all',
    settleRiderOne: 'a floaty day, still loose — keep it too?',
    settleRiderMany: '{n} floaty days, still loose — keep ’em too?',
    sheetLeaveOut: 'not this one',
    sheetPutBack: 'undo',
    sheetTuck: 'tuck it in',
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
    settleKick: g('settleKick'),
    settleCta: g('settleCta'),
    settleNothingKick: g('settleNothingKick'),
    settleNothingSub: g('settleNothingSub'),
    settleNothingCta: g('settleNothingCta'),
    settleKeptKick: g('settleKeptKick'),
    settleKeptSub: g('settleKeptSub'),
    settleKeptDoor: g('settleKeptDoor'),
    settlePoolKick: g('settlePoolKick'),
    settlePoolSubTwo: g('settlePoolSubTwo'),
    settlePoolSub: g('settlePoolSub'),
    settlePoolCtaTwo: g('settlePoolCtaTwo'),
    settlePoolCta: g('settlePoolCta'),
    settleRiderOne: g('settleRiderOne'),
    settleRiderMany: g('settleRiderMany'),
    sheetLookOver: g('sheetLookOver'),
    sheetTitle: g('sheetTitle'),
    sheetIntro: g('sheetIntro'),
    sheetNameHint: g('sheetNameHint'),
    sheetKeepGuess: g('sheetKeepGuess'),
    sheetAddMissed: g('sheetAddMissed'),
    sheetFooter: g('sheetFooter'),
    sheetLeaveOut: g('sheetLeaveOut'),
    sheetLeftOut: g('sheetLeftOut'),
    sheetPutBack: g('sheetPutBack'),
    sheetSeePhotos: g('sheetSeePhotos'),
    sheetHidePhotos: g('sheetHidePhotos'),
    sheetWho: g('sheetWho'),
    sheetRafaTold: g('sheetRafaTold'),
    sheetListen: g('sheetListen'),
    sheetTuck: g('sheetTuck'),
    sheetTranscribing: g('sheetTranscribing'),
    sheetPlayToHear: g('sheetPlayToHear'),
  }
}
