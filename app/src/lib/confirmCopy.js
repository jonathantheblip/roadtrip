// confirmCopy.js — the S1 confirm surface's CANONICAL copy deck (Design bundle
// spec 05, verbatim) + the render helpers. One column per lens: Jonathan +
// Helen are LIVE; Aurelia is PARITY-ONLY (the adults-only /heal-decisions route
// returns her nothing — written to full fidelity, unreached). No Rafa column, by
// construction (he has no confirm surface).
//
// Aurelia's whole rendered string is lowercased by the house lc() transform
// (homeVoice.js:131-135 posture), so {place}/{name}/{day} arrive lowercased
// automatically. Fail-closed vocabulary — the words confidence / tier / evidence
// / score / signal / auto-file / shadow / match / % NEVER appear here, and there
// is no road-trip framing (no leg / stop / route / drive). The evidence line
// speaks ONLY the plain §3 phrasebook translations.
//
// Mirrors the prototype's CS_DECK (confirm/cs-copy.jsx) 1:1 — lift verbatim.

export const CONFIRM_DECK = {
  // §1 · kickers
  kicker: { jonathan: 'FROM YOUR TRIP', helen: 'FROM YOUR TRIP', aurelia: 'from your trip' },
  kickerAlt: { jonathan: 'LOOKING BACK', helen: 'LOOKING BACK', aurelia: 'looking back' },
  kickerSettle: { jonathan: 'ONE MORE FROM THE TRIP', helen: 'ONE MORE FROM THE TRIP', aurelia: 'one more from the trip' },

  // §2 · the four question templates (one per card, never compound)
  question: {
    A: { jonathan: 'These {n} photos look like {moment} — at {place}. Right?',
         helen: 'These {n} photos look like {moment}, over at {place} — does that sound right?',
         aurelia: 'these {n} look like {moment} — at {place}, yeah?' },
    B: { jonathan: 'We’re calling this one ‘{name}.’ Sound right?',
         helen: 'We think this one’s ‘{name}’ — is that what you’d call it?',
         aurelia: 'callin this one ‘{name}’ — that work?' },
    C: { jonathan: 'Looks like this was around {time}, {day}. That match your memory?',
         helen: 'This looks like it was around {time} on {day} — does that sound right?',
         aurelia: 'this was like {time} {day}? sound right?' },
    D: { jonathan: 'These {n} photos look like one stretch of the {part}. Keep them together?',
         helen: 'These {n} feel like one {part} to us — should we keep them as one moment?',
         aurelia: 'these {n} feel like one whole {part} — keep em together?' },
  },

  // §3 · the evidence-line phrasebook (plain translations only; fail-closed — a
  // projected signal with no row here shows NO line at all)
  evidence: {
    timeFit: { jonathan: 'because the timing lines up with when you’d planned to be there',
               helen: 'because your photos were taken right around when you’d planned to be there',
               aurelia: 'cause the timing lines up with when you were gonna be there' },
    gps:     { jonathan: 'because your phone was right there when these were taken',
               helen: 'because you were right there when these were taken',
               aurelia: 'cause you were right there when these were taken' },
    vision:  { jonathan: 'because the photos themselves show it — a sign, a storefront',
               helen: 'because a couple of the photos show exactly where you were',
               aurelia: 'cause a couple of the pics literally show where you were' },
    cohesion:{ jonathan: 'because these all look like one continuous stretch',
               helen: 'because these all feel like they run one right into the next',
               aurelia: 'cause these all flow together like one thing' },
    multi:   { jonathan: 'because a few things line up at once — the time, and where you were',
               helen: 'because everything about these — the time, the place — points the same way',
               aurelia: 'cause a bunch of it lines up — the time, where you were, all of it' },
  },

  // §4 · buttons + the quiet skip
  confirmBtn: {
    A: { jonathan: 'That’s right', helen: 'Yes, that’s it', aurelia: 'yep, that’s it' },
    B: { jonathan: 'That’s it', helen: 'Yes, that’s it', aurelia: 'that’s it' },
    C: { jonathan: 'That’s right', helen: 'Yes, that’s it', aurelia: 'yep, that’s it' },
    D: { jonathan: 'Keep them together', helen: 'Yes, keep them together', aurelia: 'keep em together' },
  },
  notQuite: { jonathan: 'Not quite', helen: 'Not quite', aurelia: 'not quite' },
  skip:    { jonathan: 'Skip for now', helen: 'Skip this one for now', aurelia: 'skip for now' },
  skipAlt: { jonathan: 'Ask me another day', helen: 'Maybe another day', aurelia: 'eh, later' },

  // §5a · place correction — the short-list sheet
  placeStem: { jonathan: 'These were actually at —', helen: 'These were actually at —', aurelia: 'these were actually at —' },
  why: {
    MOMENT: { jonathan: 'one you named', helen: 'one you already named', aurelia: 'one you named' },
    PLAN:   { jonathan: 'also on that day’s plan', helen: 'also somewhere you’d planned that day', aurelia: 'also on the plan that day' },
    BASE:   { jonathan: 'where you were based', helen: 'where you were staying', aurelia: 'home base' },
  },
  somewhereElse: { jonathan: 'Somewhere else — I’ll say', helen: 'Somewhere else — I’ll tell you', aurelia: 'somewhere else — lemme say' },
  leaveGuess: { jonathan: 'Leave it as a guess', helen: 'Leave it as a guess', aurelia: 'leave it as a guess' },
  leaveSub: { jonathan: 'we won’t ask again', helen: 'we won’t ask about this one again', aurelia: 'we won’t ask again' },
  leaveSubGroup: { jonathan: 'we won’t ask about this one again', helen: 'we won’t ask about this one again', aurelia: 'we won’t ask again' },
  album: { jonathan: 'Open in the album', helen: 'Open it in the album', aurelia: 'open in the album' },

  // §5b · name — one inline field, never pre-filled
  nameLead: { jonathan: 'Not quite — what would you call it?', helen: 'Not quite — what would you call it?', aurelia: 'not quite — what’d you call it?' },
  namePh: { jonathan: 'What would you call it?', helen: 'What would you call it?', aurelia: 'what would you call it?' },
  nameSave: { jonathan: 'Save the name', helen: 'Save the name', aurelia: 'save it' },

  // §5c · time/day — free text, no picker
  timeLead: { jonathan: 'When was it, really?', helen: 'When was this, really?', aurelia: 'when was it really?' },
  timePh: { jonathan: 'e.g. we didn’t get there till Friday', helen: 'e.g. we didn’t get there till Friday', aurelia: 'e.g. we didn’t get there till friday' },

  // §5d · grouping — the two escapes only
  groupLead: { jonathan: 'Not one moment?', helen: 'Should these come apart?', aurelia: 'not one thing?' },
  groupAlbum: { jonathan: 'Split them in the album', helen: 'Split them in the album', aurelia: 'split em in the album' },

  // §5e · the free-text field (reference-tier words)
  textPh: { jonathan: 'Tell us what this was', helen: 'Tell us what this was', aurelia: 'tell us what this was' },
  textSave: { jonathan: 'Save', helen: 'Save', aurelia: 'save' },

  // §6 · saved promises — object is always the TRIP, never the person
  savedPlace: {
    A: { jonathan: 'Saved. {moment} is on the record — and the rest of the day settles around it.',
         helen: 'Saved — {moment} is part of the trip now, and it helps the rest of the day fall into place.',
         aurelia: 'saved — {moment}’s part of the trip now, and the rest of the day sorts itself around it.' },
    B: { jonathan: 'That’s the one. {moment} is settled, at {place}.',
         helen: 'That’s it — {moment} is settled now, at {place}.',
         aurelia: 'that’s the one — {moment}’s settled now, at {place}.' },
    C: { jonathan: 'Saved. That’s part of the trip now.',
         helen: 'Saved — that’s part of the trip now.',
         aurelia: 'saved — that’s part of the trip now.' },
  },
  savedPicked: { jonathan: 'Saved — that was {place}. It helps the rest of the day fall into place.',
                 helen: 'Saved — {place} it is. That’s part of the trip now, and it helps the rest of the day find its place.',
                 aurelia: 'saved — {place} it is. that’s part of the trip now.' },
  savedName: { jonathan: 'Saved as ‘{name}.’ That’s its name across the trip now.',
               helen: 'Saved as ‘{name}’ — that’s its name in the trip now.',
               aurelia: 'saved as ‘{name}’ — that’s its name now.' },
  savedTextPlace: { jonathan: 'Got it. The rest of the day’s sorting itself around that now.',
                    helen: 'Saved — the rest of the day is settling around what you told us.',
                    aurelia: 'got it — the rest of the day’s sorting itself around that now.' },
  savedTextTime: { jonathan: 'Got it — the rest of the day’s finding its place around that now.',
                   helen: 'Saved — the rest of the day is settling into place around that.',
                   aurelia: 'got it — the rest of the day’s finding its place around that now.' },
  savedTight: { jonathan: 'Saved. That’s part of the trip now.', helen: 'Saved — that’s part of the trip now.', aurelia: 'saved — that’s part of the trip now.' },

  // §6d · the afternote — GENERIC ONLY (count variant dropped, recorded call #2)
  afternote: { jonathan: 'A few nearby moments fell in line with it.',
               helen: 'A couple of nearby moments settled in with it.',
               aurelia: 'a couple nearby moments settled in with it.' },

  // §7 · the collapsed settled line — the guess restated as FACT
  settledPlace: { jonathan: '{moment}, at {place}.', helen: '{moment}, at {place}.', aurelia: '{moment}, at {place}.' },
  settledName: { jonathan: '‘{name}.’', helen: '‘{name}.’', aurelia: '‘{name}.’' },
  settledTime: { jonathan: 'Around {time}, {day}.', helen: 'Around {time}, {day}.', aurelia: 'around {time}, {day}.' },
  settledGroup: { jonathan: 'Kept together — one stretch of the {part}.', helen: 'Kept together — one {part}.', aurelia: 'kept together — one whole {part}.' },

  // §4A.4 · settle-rider lead-ins (article-stripped {moment})
  riderMoment: { jonathan: 'From earlier in the trip — the {moment}? ›', helen: 'One more, from earlier — the {moment}? ›', aurelia: 'from earlier — the {moment}? ›' },
  riderFallback: { jonathan: 'One more from earlier — {n} photos. ›', helen: 'One more, from earlier in the trip — {n} photos? ›', aurelia: 'one more from earlier — {n} pics? ›' },
}

const CONFIRM_LENSES = new Set(['jonathan', 'helen', 'aurelia'])

// fill {k} slots — the house fill() shape (str.split('{k}').join(value)).
export function confirmFill(str, fills) {
  let out = String(str)
  for (const [k, v] of Object.entries(fills || {})) out = out.split('{' + k + '}').join(String(v))
  return out
}

// Render one deck entry for a lens: pick the lens column (or the raw string),
// fill, then apply Aurelia's whole-string lowercase (the lc() transform). A lens
// that falls outside the three adults renders '' (fail-closed — never a bare key).
export function renderConfirm(lens, entry, fills) {
  if (entry == null) return ''
  const s = typeof entry === 'string' ? entry : entry[lens]
  if (s == null) return ''
  const filled = confirmFill(s, fills)
  return lens === 'aurelia' ? filled.toLowerCase() : filled
}

// Which phrasebook row a projected decision's signals fire. Mirrors the §3 order:
// two-or-more agreeing dimensions → 'multi'; then GPS presence; then vision; then
// a time fit; then cohesion. Returns null when nothing translatable fired (→ no
// evidence line at all, fail-closed).
export function evidenceKeyOf(signals) {
  if (!signals || typeof signals !== 'object') return null
  const dims = Array.isArray(signals.dims) ? signals.dims.filter(Boolean) : []
  if (dims.length >= 2) return 'multi'
  if (signals.inheritedGps || signals.pin || signals.evidence === 'gps') return 'gps'
  if (signals.visionName || signals.evidence === 'vision') return 'vision'
  if (Number.isFinite(signals.timeFitMin) || signals.evidence === 'time-only') return 'timeFit'
  if (Number.isFinite(signals.cohesion)) return 'cohesion'
  return null
}

export { CONFIRM_LENSES }
