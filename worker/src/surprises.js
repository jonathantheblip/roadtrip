// worker/src/surprises.js — the SERVER-SIDE masking boundary.
// ----------------------------------------------------------------------------
// The mirror of app/src/lib/surprises.js, and the real security boundary: this
// runs before any memory leaves the worker (the device-sync read) so a masked
// surprise never reaches a device — or Claude — it's hidden from. The client
// filter is UX; THIS is what the contract relies on.
//
// One deliberate difference from the client transform: a teaser masked from the
// viewer is NOT dropped but STRIPPED to a "something's coming" STUB — the
// recipient's device needs that stub to render the teaser card, but with the
// real title / detail / media removed here, server-side. A cover is swapped for
// its stand-in. Both projections carry `masked: true` so a recipient device can
// never push them back and clobber the real row (postMemory refuses a
// masked-flagged write; pushMemory skips it).

export function isSurprise(m) {
  return !!(m && Array.isArray(m.hideFrom) && m.hideFrom.length > 0)
}

// Is this surprise currently hidden FROM `viewer`? Author + revealed never are.
export function isMaskedFrom(m, viewer) {
  if (!isSurprise(m)) return false
  if (m.authorTraveler === viewer) return false
  if (m.revealed) return false
  return m.hideFrom.includes('everyone') || m.hideFrom.includes(viewer)
}

// A teaser masked from the viewer → the stub the "Something's coming" card
// needs: enough to say "a wrapped <what>, reveals <when>", nothing more.
function teaserStub(m) {
  return {
    id: m.id,
    tripId: m.tripId,
    stopId: m.stopId,
    authorTraveler: m.authorTraveler,
    visibility: m.visibility,
    hideFrom: m.hideFrom,
    reveal: m.reveal,
    conceal: 'teaser',
    // ONLY the kind of thing — never the title / detail / media.
    surprise: { what: m.surprise?.what || 'A surprise' },
    reactions: [],
    masked: true,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  }
}

// A cover masked from the viewer → the believable stand-in (cover only, no real
// fields, no hideFrom — to the recipient it's an ordinary memory/stop).
function coverStandIn(m) {
  const cov = m.cover || {}
  return {
    id: m.id,
    tripId: m.tripId,
    stopId: m.stopId,
    authorTraveler: m.authorTraveler,
    visibility: m.visibility,
    kind: 'text',
    text: cov.title || 'A stop',
    caption: cov.title || undefined,
    isCover: true,
    cover: {
      icon: cov.icon || '📍',
      title: cov.title || 'A stop',
      loc: cov.loc || '',
      time: cov.time || '',
      weather: cov.weather || '',
      packing: cov.packing || '',
    },
    reactions: [],
    masked: true,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  }
}

// The per-recipient transform. Author / revealed / non-targeted / non-surprise
// pass through untouched; a masked teaser is stubbed; a masked cover substituted.
export function maskMemoryForViewer(m, viewer) {
  if (!isMaskedFrom(m, viewer)) return m
  return m.conceal === 'cover' ? coverStandIn(m) : teaserStub(m)
}
