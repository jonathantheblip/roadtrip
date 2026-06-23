// What a trip needs before it can be PUBLISHED — the single source of truth, so
// the editor's publish gate and the Drafts list's one-tap "Restore" can never
// disagree about whether a draft is ready to rejoin the trip list.
//
// Deliberately NOT road-trip-shaped: most trips aren't road trips. A trip does
// NOT need stops on every day (or any stops at all) or an "end city" — a cabin
// weekend with no itemized plan is a valid, publishable trip. The bar is
// "renders at parity, not sparse/broken," not "looks like an itemized drive." We
// gate only on what the renderer genuinely needs, plus the anti-sparse trio for
// stops that DO exist (no empty pitch, no missing person tags, must be named).
// Optional logistics (time, address) never block publish — the renderer already
// guards their absence.
export function tripCompleteness(trip) {
  const missing = []
  if (!trip?.title?.trim()) missing.push('Title')
  if (!trip?.dateRangeStart || !trip?.dateRangeEnd) missing.push('Start & end dates')
  if (!trip?.overview?.trim()) missing.push('Summary')
  const days = trip?.days || []
  if (days.length === 0) missing.push('At least one day')
  days.forEach((d, i) => {
    const n = i + 1
    if (!d.isoDate) missing.push(`Day ${n}: date`)
    if (!d.title?.trim()) missing.push(`Day ${n}: label`)
    // No "at least one stop" — a day with nothing itemized is fine.
    // Only stops that exist must not be sparse.
    ;(d.stops || []).forEach((s, j) => {
      const sn = `Day ${n} · stop ${j + 1}`
      if (!s.name?.trim()) missing.push(`${sn}: name`)
      if (!s.note?.trim()) missing.push(`${sn}: the pitch`)
      if (!s.for || s.for.length === 0) missing.push(`${sn}: who it's for`)
    })
  })
  return { ok: missing.length === 0, missing }
}

// True when a draft is complete enough to rejoin the trip list as-is — used to
// decide whether the Drafts surface offers a one-tap "Restore". An incomplete
// draft routes through "Edit" (the editor) instead, so a half-built trip never
// publishes itself sparse.
export function isTripPublishable(trip) {
  return tripCompleteness(trip).ok
}
