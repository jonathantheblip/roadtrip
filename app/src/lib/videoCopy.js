// videoCopy.js — the per-lens voice deck for the "foolproof video import" human
// layer (#2/#4), ported verbatim from the Claude Design handoff (03-voice.md +
// src/copy.jsx). Everything the family reads about a clip lives here, in each
// person's voice. Helen is the base; Jonathan is deadpan (and shows the numbers);
// Aurelia is fully lowercase; Rafa NEVER meets a failure or a length wall — he
// only ever sees his movie saved (a couldn't-add/too-long folds to "still saving"
// and the real failure surfaces to a parent).
//
// Locked tone: warm, plain, sentence case, contractions; amber never red; a
// "couldn't add" invites a retry; no technical reason ever reaches the family.

// bytes → "7.5 MB" / "1.2 GB" (the handoff's fmtMB, adapted to the bytes the
// encoder actually returns). The size chip is the proof value — always a REAL size.
export function fmtSize(bytes) {
  if (bytes == null) return ''
  const mb = bytes / 1e6
  if (mb >= 1000) return (mb / 1000).toFixed(1).replace(/\.0$/, '') + ' GB'
  if (mb >= 100) return Math.round(mb) + ' MB'
  if (mb >= 10) return mb.toFixed(1).replace(/\.0$/, '') + ' MB'
  return (mb < 1 ? mb.toFixed(1) : mb.toFixed(1).replace(/\.0$/, '')) + ' MB'
}

// ms → "6:12"
export function fmtDur(ms) {
  const total = Math.max(0, Math.round((ms || 0) / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

const COPY = {
  helen: {
    prep: (n) => (n > 1 ? 'Getting your videos ready…' : 'Getting your video ready…'),
    prepNote: 'Shrinking them here on your phone, so they’re light to keep.',
    proofRowNote: 'shrunk here — light to keep',
    // couldn't-add
    failSolo: 'That clip couldn’t be added yet.',
    failMulti: (ok, f) =>
      f === 1 ? `The other ${ok} are in. One clip couldn’t be added yet.` : `${ok} are in. ${f} clips couldn’t be added yet.`,
    failBody: 'Nothing’s lost — it’s still on your phone.',
    failRetry: 'Try it again',
    retrying: 'Trying again…',
    failAgain: 'Still no luck — we’ll keep it safe and you can try later.',
    // too-long
    tooLong: (d) => `This one’s ${d} — a little long to keep here.`,
    tooLongBody: 'Clips up to 3 minutes fit. Trim it in your photos and bring it back?',
    tooLongCta: 'How to trim',
    tooLongHelp: 'Open the clip in Photos → Edit → drag the ends in to 3:00 or less → Done. Then add it here again.',
    hide: 'Hide',
    // saved
    savedSize: (bytes) => `· ${fmtSize(bytes)}`,
    // tile + pill
    tileWay: 'on its way',
    tileStuck: 'still trying',
    tileStuckCta: 'Tap to send it now',
    pillWay: (n) => `${n} uploading`,
    pillStuck: (n) => `${n} stuck`,
    pillDone: 'all backed up',
  },
  jonathan: {
    prep: (n) => (n > 1 ? 'Shrinking the videos…' : 'Shrinking the video…'),
    prepNote: 'Happens here on the phone. Big goes in, small comes out.',
    proofRowNote: 'shrunk on the phone',
    failSolo: 'That one didn’t take.',
    failMulti: (ok, f) => (f === 1 ? `${ok} in. One didn’t take.` : `${ok} in. ${f} didn’t take.`),
    failBody: 'Still on the phone. Nothing lost.',
    failRetry: 'Run it again',
    retrying: 'Running it again…',
    failAgain: 'Still no. It’s held safe — try later.',
    tooLong: (d) => `${d}. The keepable max is 3:00.`,
    tooLongBody: 'Trim it and we’ll take it.',
    tooLongCta: 'How to trim',
    tooLongHelp: 'Photos → Edit → pull the ends in to 3:00 → Done. Bring it back.',
    hide: 'Hide',
    savedSize: (bytes) => `· ${fmtSize(bytes)}`,
    tileWay: 'in the outbox',
    tileStuck: 'stuck',
    tileStuckCta: 'Retry now',
    pillWay: (n) => `${n} queued`,
    pillStuck: (n) => `${n} stuck`,
    pillDone: 'all up',
  },
  aurelia: {
    prep: (n) => (n > 1 ? 'shrinking your videos…' : 'shrinking your video…'),
    prepNote: 'on your phone. keeps it light.',
    proofRowNote: 'shrunk on your phone',
    failSolo: 'that clip didn’t make it.',
    failMulti: (ok, f) => (f === 1 ? `${ok} in. one didn’t make it.` : `${ok} in. ${f} didn’t make it.`),
    failBody: 'still on your phone, nothing lost.',
    failRetry: 'try it again',
    retrying: 'trying again…',
    failAgain: 'still no. it’s safe — try later.',
    tooLong: (d) => `this one’s ${d}. max is 3:00.`,
    tooLongBody: 'trim it and bring it back?',
    tooLongCta: 'how to trim',
    tooLongHelp: 'photos → edit → drag the ends in to 3:00 → done. then add it again.',
    hide: 'hide',
    savedSize: (bytes) => `· ${fmtSize(bytes)}`,
    tileWay: 'on its way',
    tileStuck: 'stuck — tap',
    tileStuckCta: 'tap to send it now',
    pillWay: (n) => `${n} uploading`,
    pillStuck: (n) => `${n} stuck`,
    pillDone: 'all up',
  },
  // Rafa NEVER meets a failure or a length wall. A clip that can't be added stays
  // "still saving" for him; the honest couldn't-add goes to a parent. No amber, no
  // retry he must press, no destructive path.
  rafa: {
    prep: () => 'Saving your movie…',
    prepNote: 'Almost there!',
    proofRowNote: 'saved',
    failSolo: 'Still saving your movie…',
    failMulti: () => 'Still saving your movie…',
    failBody: 'We’ll finish it for you.',
    failRetry: null,
    retrying: 'Still saving…',
    failAgain: 'Still saving your movie…',
    tooLong: () => 'That’s a really long movie! 🎬',
    tooLongBody: 'A grown-up will help save it.',
    tooLongCta: null,
    tooLongHelp: null,
    hide: null,
    savedSize: (bytes) => `· ${fmtSize(bytes)}`,
    tileWay: 'saving…',
    tileStuck: 'saving…', // never a scary state for Rafa
    tileStuckCta: null,
    // The header pill counts EVERY queued item (photos AND videos), so Rafa's copy
    // stays kind-neutral — it must not call his photos "movies". Gentle + honest,
    // never amber (SyncPill folds his uploading+stuck into this one calm line).
    pillWay: (n) => (n > 1 ? `saving ${n}…` : 'saving…'),
    pillStuck: (n) => (n > 1 ? `saving ${n}…` : 'saving…'),
    pillDone: 'all saved!',
  },
}

// Resolve the deck for the active traveler (Helen's warm base is the fallback).
export function videoCopy(traveler) {
  return COPY[traveler] || COPY.helen
}

export { COPY }
