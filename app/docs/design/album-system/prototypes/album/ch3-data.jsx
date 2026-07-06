// album/ch3-data.jsx — Chapter 3 "Photo moves" data + per-voice copy. The
// trust grammar: every "moved because…" names a HUMAN act, never machine-speak.
// A catch-up (nightly sweep) inherits the act it catches up on. Rafa excluded.

// Move-to picker targets: days → places (pin) and named moments (the family's
// own words, italic). One is the current home.
const MOVE_TARGETS = [
  { day: 'FRI · MAY 1', items: [
    { kind: 'place', label: '40 E 38th St — the Airbnb' },
    { kind: 'place', label: 'LaGuardia' },
    { kind: 'moment', label: 'the curbside reunion' },
  ] },
  { day: 'SAT · MAY 2', items: [
    { kind: 'place', label: 'Grand Central', current: true },
    { kind: 'moment', label: 'breakfast at the Brasserie' },
    { kind: 'moment', label: 'looking up on 5th' },
  ] },
  { day: 'SUN · MAY 3', items: [
    { kind: 'place', label: 'Bridgeport' },
    { kind: 'moment', label: 'the monster-truck freestyle' },
  ] },
];

// A moved photo example for the lightbox.
const MOVED_PHOTO = { tint: '#6E8590', author: 'helen', date: 'SAT MAY 2 AT 9:41 AM', place: 'Grand Central', reason: 'named' };

const CH3_COPY = {
  action: { helen: 'Move to…', jonathan: 'Move to…', aurelia: 'move to…' },
  editDate: { helen: 'Edit date', jonathan: 'Edit date', aurelia: 'edit date' },
  unfiled: { helen: 'Leave it unfiled', jonathan: 'Leave unfiled', aurelia: 'leave it unfiled' },
  unfiledSub: { helen: 'not tied to a moment', jonathan: 'no moment', aurelia: 'not tied to a moment' },
  hereNow: { helen: 'here now', jonathan: 'here now', aurelia: 'here now' },
  sheetTitle: { helen: 'Move this photo to…', jonathan: 'Move to…', aurelia: 'move this to…' },
  // the moved-note: reason codes → a HUMAN act, one tap deep in the lightbox
  reasons: {
    named:   { helen: 'Moved here when you named breakfast at the Brasserie.', jonathan: 'Moved: you named the Brasserie stop.', aurelia: 'moved when you named breakfast at the brasserie.' },
    plan:    { helen: 'Moved here when Saturday’s breakfast shifted to 9am.', jonathan: 'Moved: Sat breakfast → 9am.', aurelia: 'moved when saturday’s breakfast shifted to 9am.' },
    gps:     { helen: 'Settled here once its location came through.', jonathan: 'Moved: GPS resolved to Grand Central.', aurelia: 'moved when its location showed up.' },
    catchup: { helen: 'Caught up here when the breakfast stop moved.', jonathan: 'Caught up: breakfast stop moved.', aurelia: 'caught up when the breakfast stop moved.' },
  },
  reasonName: { named: 'a moment was named', plan: 'the plan changed', gps: 'location resolved', catchup: 'a nightly catch-up' },
  // locked after a hand-move ({n} = who; "you" on your own device)
  locked: { helen: 'Placed here by {n} — stays put.', jonathan: 'Placed by {n}. Locked.', aurelia: '{n} put it here — it stays.' },
  moved: { helen: 'Moved here', jonathan: 'Moved', aurelia: 'moved here' },
  // the one-visit marks
  chip: 'moved',
  sectionLine: { helen: '3 photos moved here when the day changed.', jonathan: '3 moved here — the day changed.', aurelia: '3 moved here when the day changed.' },
  sectionLineSub: { helen: 'tap any to see why', jonathan: 'tap for why', aurelia: 'tap any to see why' },
  // the suggestion (machine unsure) — two-step banner, sticky-dismissed family-wide
  suggest: { helen: 'These 3 might belong at Rosa’s.', jonathan: '3 photos may belong at Rosa’s.', aurelia: 'these 3 might be from rosa’s.' },
  suggestMove: { helen: 'Move them', jonathan: 'Move', aurelia: 'move them' },
  suggestNo: { helen: 'Not now', jonathan: 'Not now', aurelia: 'not now' },
  suggestRest: { helen: 'A few photos might belong elsewhere — take a look.', jonathan: 'A few photos may be misfiled — review.', aurelia: 'a few might belong somewhere else — look?' },
  suggestNew: { helen: 'New: these 3 now look like Rosa’s — move them?', jonathan: 'New evidence: 3 → Rosa’s. Move?', aurelia: 'new — these 3 look like rosa’s now. move?' },
  // the backfill letter (one per trip)
  letterTrip: 'Vermont leaf-peeping',
  letter: { helen: '214 photos from the Vermont week found their places — have a look.', jonathan: '214 archived photos located across the Vermont trip. Have a look.', aurelia: '214 old photos from vermont found their spots — have a look.' },
  letterCta: { helen: 'Have a look', jonathan: 'Have a look', aurelia: 'have a look' },
  letterLanding: { helen: '214 found their places', jonathan: '214 located', aurelia: '214 found their places' },
};

Object.assign(window, { MOVE_TARGETS, MOVED_PHOTO, CH3_COPY });
