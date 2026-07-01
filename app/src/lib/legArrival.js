// legArrival.js — the once-per-new-place "arrival moment" gate (Design 05
// ArrivalMoment). A trip announces a new place ONCE — the first time the home
// opens there — then the quieter dual clock + context card carry it. "A new
// place" = a new orientation SIGNATURE (zone + currency + language), so two legs
// in the SAME zone/money/language don't re-announce (nothing actually changed);
// Rome → Tokyo does. Pure signature + a tiny localStorage-backed "seen" set
// (guarded — no-ops without localStorage, e.g. under node --test).

const SEEN_KEY = 'rt_arrival_seen_v1'

// What makes a place worth announcing: its zone + money + language. '' when
// there's nothing new to say (a domestic leg with no delta from home/viewer) —
// the caller treats '' as "never fires".
export function arrivalSignature({ legTz, currencyCode, languageName } = {}) {
  const parts = [legTz || '', currencyCode || '', languageName || ''].filter(Boolean)
  return parts.length ? parts.join('|') : ''
}

function readSeenSet(tripId) {
  try {
    const all = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}')
    return new Set(Array.isArray(all[tripId]) ? all[tripId] : [])
  } catch {
    return new Set()
  }
}

// Has this trip already announced this place? An empty signature (nothing to
// announce) reads as "seen" so the moment never fires. Guarded — a no-localStorage
// environment returns true (never fires) rather than throwing.
export function hasSeenArrival(tripId, sig) {
  if (!sig) return true
  return readSeenSet(tripId).has(sig)
}

// Remember that this trip announced this place (so it won't fire again). No-op
// on an empty signature or without localStorage.
export function markArrivalSeen(tripId, sig) {
  if (!sig) return
  try {
    const all = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}')
    const cur = new Set(Array.isArray(all[tripId]) ? all[tripId] : [])
    cur.add(sig)
    all[tripId] = [...cur]
    localStorage.setItem(SEEN_KEY, JSON.stringify(all))
  } catch {
    /* no-op without localStorage */
  }
}
