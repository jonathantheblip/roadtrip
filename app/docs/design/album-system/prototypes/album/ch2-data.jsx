// album/ch2-data.jsx — Chapter 2 "Finish the story" data + per-voice copy.
// A past trip (the cabin week) whose days are in mixed tenses — kept, still
// loose (evidence pins unnamed), quiet, or no-evidence — plus an archive trip.
// Rafa is excluded from this surface by rule; his contributions surface INSIDE
// the parent's flow (a pending voice note on a day).

// The past trip we're finishing.
const CABIN = {
  id: 'cape-24', title: 'Cape Cod', sub: 'the cabin week', when: 'August 2024', tint: '#5E7A86',
  days: [
    { n: 1, date: 'Sat Aug 10', name: 'Drive down, settle in', kept: true, keeper: 'helen',
      pins: [{ id: 'c1a', place: 'The cottage — Wellfleet', range: '4–8 PM', count: 14, named: true, tint: '#6E7A5E' }] },
    { n: 2, date: 'Sun Aug 11', name: null, loose: true, rafaNote: true,
      pins: [
        { id: 'c2a', place: 'Race Point Beach', range: '11–1', count: 12, tint: '#6E8590' },
        { id: 'c2b', place: 'the harbor — lobster shack', range: '6–7 PM', count: 8, tint: '#7A6448' },
      ] },
    { n: 3, date: 'Mon Aug 12', name: null, quiet: true, count: 5, tint: '#6A6E62' },
    { n: 4, date: 'Tue Aug 13', name: null, quiet: true, count: 3, tint: '#66625A' },
    { n: 5, date: 'Wed Aug 14', name: null, noEvidence: true, tint: '#5C5E5A' },
    { n: 6, date: 'Thu Aug 15', name: null, loose: true,
      pins: [{ id: 'c6a', place: 'Marconi Beach', range: '10–12', count: 9, tint: '#6E8188' }] },
  ],
};
function cabinDay(n) { return CABIN.days.find(d => d.n === n); }
const CABIN_LOOSE = CABIN.days.filter(d => d.loose).length;
const CABIN_QUIET = CABIN.days.filter(d => d.quiet).length;

// A big cold archive — nothing named, backfill just ran.
const ARCHIVE = { id: 'disney-23', title: 'Disney World', sub: 'March 2023', photos: 312, days: 6, backfillFound: 214, tint: '#4F7A8A' };

// ── per-voice copy (helen warm · jonathan drier · aurelia lowercase) ──
const CH2_COPY = {
  // the door on a finished trip's keepsake home
  door: {
    helen: 'Two days from the cabin week are still loose — want to tuck them in?',
    jonathan: 'Two days never got signed off. Worth a look?',
    aurelia: "two days are still floaty. keep 'em?",
  },
  doorSub: {
    helen: 'No rush — they’re safe here.',
    jonathan: 'No deadline. They keep.',
    aurelia: "whenever. they're not going anywhere.",
  },
  finish: { helen: 'Finish the story', jonathan: 'Finish the record', aurelia: 'finish it' },
  // naming a moment (evidence pin as a caption slot)
  pinHint: {
    helen: 'Give it a name — or leave it, it’s lovely as it is.',
    jonathan: 'Name it, or leave it.',
    aurelia: 'name it. or don’t.',
  },
  leaveOut: { helen: 'leave this out', jonathan: 'leave out', aurelia: 'leave it out' },
  // Rafa's contribution surfaced inside the parent flow
  rafaNote: {
    helen: 'Rafa told about this day — have a listen',
    jonathan: 'Rafa left a voice note on this day',
    aurelia: 'rafa said something about this day — listen',
  },
  // the keep moment
  keep: { helen: 'Keep the day', jonathan: 'Sign off on the day', aurelia: 'keep it' },
  kept: {
    helen: 'Kept by Helen. Tonight’s story writes itself from this.',
    jonathan: 'Signed off. The record stands.',
    aurelia: 'kept by aurelia. it’s yours now.',
  },
  keptSub: {
    helen: 'It stays open — late photos still slide right in.',
    jonathan: 'Still open. Late material lands here.',
    aurelia: 'still open. more can land whenever.',
  },
  book: { helen: 'Keep its page in the book?', jonathan: 'Add its page to the book?', aurelia: 'want its page in the book?' },
  // quiet days pooled
  quiet: {
    helen: 'We stayed put, gloriously.',
    jonathan: 'A quiet one. Nothing to log.',
    aurelia: 'a nothing day. kind of perfect.',
  },
  pooled: {
    helen: 'The middle of the week was quiet — keep those two together?',
    jonathan: 'Two quiet days. Keep them as one?',
    aurelia: 'the quiet stretch — keep ’em as one?',
  },
  // no located photos
  noEvidence: {
    helen: 'No photos found their way here. This day can just rest — or tell it in a few words.',
    jonathan: 'No located photos this day. Leave it, or add a line.',
    aurelia: 'no pics landed here. let it rest, or say what happened.',
  },
  rest: { helen: 'Let it rest', jonathan: 'Leave it', aurelia: 'let it rest' },
  tell: { helen: 'Tell it in words', jonathan: 'Add a line', aurelia: 'say what happened' },
  // the archive backfill "letter"
  backfill: {
    helen: '214 photos from the Cape found their places — have a look.',
    jonathan: '214 archived photos located. Have a look.',
    aurelia: '214 old photos found their spots. have a look.',
  },
  // archive-at-scale, whole-trip pass
  archiveDoor: {
    helen: 'Disney is all here, just unnamed. Want to wander back through it?',
    jonathan: 'Disney: 312 photos, nothing signed off. Take a pass?',
    aurelia: 'disney’s all here, nothing named. wanna go back through?',
  },
  archiveLead: {
    helen: 'We’ll go a day at a time, best bits first. Stop whenever.',
    jonathan: 'Day at a time, strongest first. Stop anytime.',
    aurelia: 'one day at a time, best first. stop whenever.',
  },
  // Aurelia's authorship
  pickPrompt: { aurelia: 'pick the day’s picture', helen: 'Pick the day’s picture', jonathan: 'Choose the day’s frame' },
  pickDone: { aurelia: 'aurelia picked the day’s picture', helen: 'Aurelia picked the day’s picture', jonathan: 'Aurelia set the day’s frame' },
};

Object.assign(window, { CABIN, cabinDay, CABIN_LOOSE, CABIN_QUIET, ARCHIVE, CH2_COPY });
