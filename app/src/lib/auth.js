// Client side of magic-link auth (013). Per-device SESSIONS replace the bundled
// family tokens: opening a personal one-time link mints a session stored only on
// THIS device. Multiple sessions can live on one device (the shared iPad), keyed
// rt_session_<traveler>; the active traveler selects which one authHeader() sends.
//
// This module owns: the session store, redeeming a link, revoking sessions, and
// the iOS install-context detection that the enroll screen needs. It computes
// WORKER_URL from env independently (NOT imported from workerSync) so there's no
// import cycle — workerSync imports getSession from HERE.
//
// Cutover: while the bundled tokens still ship, authHeader() falls back to them
// when a traveler has no session yet (workerSync.js). The later "close the door"
// step removes the bundled tokens; from then on a session is the ONLY credential.

const env = (typeof import.meta !== 'undefined' && import.meta.env) || {}
const WORKER_URL = (env.VITE_WORKER_URL || '').replace(/\/+$/, '')

const SESSION_PREFIX = 'rt_session_'
const TRAVELER_ORDER = ['jonathan', 'helen', 'aurelia', 'rafa']
const ADULTS = ['jonathan', 'helen']

// Only adults can mint setup links / self-enroll (the worker enforces this too;
// this gates the UI). A teen/child receives a link an adult made for them.
export function isAdult(traveler) {
  return ADULTS.includes(traveler)
}

// ─── Session store (per traveler, per device) ─────────────────────────────

export function getSession(traveler) {
  if (!traveler) return ''
  try {
    return localStorage.getItem(SESSION_PREFIX + traveler) || ''
  } catch {
    return ''
  }
}

export function setSession(traveler, token) {
  try {
    localStorage.setItem(SESSION_PREFIX + traveler, token)
  } catch {
    /* ignore — private mode / storage full */
  }
  notifyAuthChange()
}

export function clearSession(traveler) {
  try {
    localStorage.removeItem(SESSION_PREFIX + traveler)
  } catch {
    /* ignore */
  }
  notifyAuthChange()
}

// ─── Auth-change subscription (live-refresh) ───────────────────────────────
// Enrolling or signing out a device mutates localStorage, which doesn't re-
// render React on its own. Components that derive from session state (the
// persona switcher's credential-aware list, the Settings device section)
// subscribe here so they refresh the instant a session is added or removed —
// no manual reload. notifyAuthChange fires on every setSession/clearSession.
const authListeners = new Set()
function notifyAuthChange() {
  for (const fn of authListeners) {
    try {
      fn()
    } catch {
      /* a listener bug must not break auth writes */
    }
  }
}
export function subscribeAuth(fn) {
  authListeners.add(fn)
  return () => authListeners.delete(fn)
}

// Which travelers have a session ON THIS DEVICE (drives "who's set up here").
export function enrolledTravelers() {
  return TRAVELER_ORDER.filter((t) => !!getSession(t))
}

export function hasSession(traveler) {
  return !!getSession(traveler)
}

// The enrolled-only persona switcher list (close-the-door). Given the canonical
// traveler `order` and a `hasCred(traveler)` predicate (has a session OR — pre-
// cutover — a bundled token), return:
//   ids   — the personas to offer: the credentialed ones, or ALL when none are
//           credentialed (a fresh device / the e2e+axe matrix → never an empty
//           dock). Pre-cutover every traveler has a bundled token → unchanged.
//   canAdd — whether to show "add a family member": only when the dock is
//           genuinely narrowed (some credentialed, some not), so there's someone
//           left to enroll. Pre-cutover (all credentialed) → false → no new pill.
// Pure (predicate injected) so it's unit-testable without the bundled tokens the
// dev/e2e build always carries.
export function switcherList(order, hasCred) {
  const credentialed = (order || []).filter((t) => hasCred(t))
  const ids = credentialed.length ? credentialed : order || []
  const canAdd = credentialed.length > 0 && credentialed.length < (order || []).length
  return { ids, canAdd }
}

// ─── Install context (the iOS hand-off pivot) ─────────────────────────────
// True when running as an INSTALLED home-screen app (standalone), false in a
// normal browser tab. On iOS the two have SEPARATE storage, so the enroll screen
// behaves differently: standalone → redeem in place; browser tab → offer the
// copy-code → open-the-app → paste hand-off (the system clipboard IS shared).
export function isStandalone() {
  try {
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true
    // iOS Safari's non-standard flag (matchMedia is unreliable on older iOS).
    if (window.navigator && window.navigator.standalone === true) return true
  } catch {
    /* ignore */
  }
  return false
}

// Best-effort device label carried onto the session ("Helen's iPhone"-ish). The
// worker caps it; it's only ever shown back to the family in a future device list.
export function defaultDeviceLabel() {
  try {
    const ua = navigator.userAgent || ''
    if (/iPad/.test(ua)) return 'iPad'
    if (/iPhone/.test(ua)) return 'iPhone'
    if (/Android/.test(ua)) return 'Android phone'
    if (/Macintosh/.test(ua)) return 'Mac'
    if (/Windows/.test(ua)) return 'Windows PC'
  } catch {
    /* ignore */
  }
  return 'this device'
}

// ─── Token parsing (accept a bare token OR a full enroll link) ─────────────
// A copied "setup code" might be the raw token or the whole
// https://…/?enroll=<token> URL (people copy whatever's easiest). Accept both.
export function tokenFromInput(input) {
  if (typeof input !== 'string') return ''
  const s = input.trim()
  if (!s) return ''
  const m = s.match(/[?&]enroll=([A-Za-z0-9_-]+)/)
  if (m) return m[1]
  if (/^[A-Za-z0-9_-]{20,}$/.test(s)) return s // looks like a bare opaque token
  return ''
}

// ─── Redeem / revoke (talk to the worker) ─────────────────────────────────

// Redeem a one-time link → store the per-device session and return the traveler.
// `input` may be a token or a full enroll URL. Throws a friendly Error on any
// failure so the enroll screen can show it.
export async function redeemLink(input, deviceLabel) {
  if (!WORKER_URL) throw new Error('Setup is unavailable right now.')
  const linkToken = tokenFromInput(input)
  if (!linkToken) throw new Error("That doesn't look like a setup code.")
  let r
  try {
    r = await fetch(`${WORKER_URL}/auth/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkToken, deviceLabel: deviceLabel || defaultDeviceLabel() }),
    })
  } catch {
    // The worker was never reached, so the one-time link is NOT consumed —
    // tag it so the enroll screen knows it's safe to retry the SAME link.
    const e = new Error('Could not reach the server. Check your connection and try again.')
    e.preNetwork = true
    throw e
  }
  if (!r.ok) {
    // The worker returns one opaque error for not-found/used/expired.
    if (r.status === 400) throw new Error('This setup link is invalid or already used. Ask for a fresh one.')
    throw new Error(`Setup failed (${r.status}). Try again, or ask for a fresh link.`)
  }
  const data = await r.json().catch(() => null)
  if (!data?.sessionToken || !data?.traveler || !TRAVELER_ORDER.includes(data.traveler)) {
    throw new Error('Setup failed — the server sent back something unexpected.')
  }
  setSession(data.traveler, data.sessionToken)
  return { traveler: data.traveler }
}

// NOTE: "sign out my other devices" (POST /auth/revoke {all, except}) is wired at
// the CLOSE-THE-DOOR stage, alongside the enrolled-only switcher — on a shared
// device with a free persona-switcher it would let one persona revoke another
// family member's phones, so it waits until the switcher narrows to enrolled-only.
