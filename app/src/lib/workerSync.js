// Worker sync layer. Replaces the CloudKit sync that lived here before
// (lib/cloudKitSync.js, lib/cloudkit.js). Same export surface so the
// rest of the app didn't have to learn a new contract:
//
//   pullAll, pushMemory, deleteRemote — Memory records
//   pullTrips, pushTrip, deleteTrip   — Trip records
//   isWorkerConfigured                — was isCloudKitConfigured
//
// Architecture:
//   - localStorage stays canonical for fast offline-tolerant writes.
//   - This module mirrors mutations to a Cloudflare Worker that owns
//     a D1 database + R2 bucket.
//   - Auth is a 4-of-4 family-token map (one per traveler) baked into
//     the bundle as VITE_FAMILY_TOKEN_<TRAVELER>. We pick the right
//     token by reading the active traveler the same way App.jsx does
//     (URL → cookie → localStorage → 'jonathan').

import { loadAsset } from './memAssets'
import { getSession, clearSession, redeemLink } from './auth'

const env = (typeof import.meta !== 'undefined' && import.meta.env) || {}
const WORKER_URL = (env.VITE_WORKER_URL || '').replace(/\/+$/, '')
// Close-the-door (013) COMPLETE: the bundled FAMILY_TOKEN_* are GONE. They are no
// longer read from import.meta.env — so they no longer ship in the public client
// bundle (closing audit ROOT 2: tokens in the bundle = anyone-with-the-URL access)
// — and the worker (commit 2f28cff) no longer accepts them. A device authenticates
// ONLY with its per-device SESSION (lib/auth). TOKENS stays an all-empty map so the
// session-aware fallbacks below (authHeader, hasCredential, canSelfEnroll,
// isWorkerConfigured) keep working unchanged: they already treat an empty bundled
// token as "no bundled credential — use the session," which is now the only path.
const TOKENS = { jonathan: '', helen: '', aurelia: '', rafa: '' }
const TRAVELER_ORDER = ['jonathan', 'helen', 'aurelia', 'rafa']

export function isWorkerConfigured() {
  if (!WORKER_URL) return false
  // Configured if ANY traveler has a credential — a per-device session (013) OR,
  // during the cutover, a bundled token. Session-aware so the app stays
  // configured after the "close the door" step removes the bundled tokens.
  return TRAVELER_ORDER.some((t) => !!TOKENS[t] || !!getSession(t))
}

// Does THIS device hold a credential to act AS `traveler` — a per-device session
// (013) OR, during the cutover, that traveler's bundled token? Drives the
// enrolled-only switcher: it shows a persona only when the device can actually BE
// them. Pre-cutover every traveler has a bundled token (no narrowing); once the
// bundled tokens are removed at "close the door" this auto-tightens to the
// sessions actually enrolled on the device — the surprise-leak fix, no code change.
export function hasCredential(traveler) {
  return !!getSession(traveler) || !!TOKENS[traveler]
}

// Can this person do a one-tap SELF-enroll on this device? Only when the device
// already holds THEIR OWN credential to authenticate AS them — their own bundled
// token, and no session yet. Critically NOT true merely because SOME OTHER bundled
// token exists: otherwise authHeader's any-bundled-token fallback would mint a
// session for this traveler using a DIFFERENT person's credential (the session
// would diverge from who actually authenticated). Goes false post-cutover (no
// bundled token) — a fresh device then enrolls via a link instead.
export function canSelfEnroll(traveler) {
  return !getSession(traveler) && !!TOKENS[traveler]
}

// Read the active traveler the same way App.jsx does. Re-implemented
// here (instead of importing from App.jsx) because this module is
// imported lazily from memoryStore.js and we want zero React deps.
// Exported so the trip resync can capture WHO made an edit at mark time.
export function getActiveTraveler() {
  if (typeof window === 'undefined') return 'jonathan'
  try {
    const q = new URLSearchParams(window.location.search).get('person')
    if (TRAVELER_ORDER.includes(q)) return q
  } catch {}
  try {
    const m = document.cookie.match(/(?:^|; )rt_person=([^;]*)/)
    if (m) {
      const v = decodeURIComponent(m[1])
      if (TRAVELER_ORDER.includes(v)) return v
    }
  } catch {}
  try {
    const v = localStorage.getItem('rt_person_v2')
    if (TRAVELER_ORDER.includes(v)) return v
  } catch {}
  return 'jonathan'
}

// Build the Authorization header. No arg → the ACTIVE traveler (reads = your own
// view). Pass `asTraveler` to authenticate AS a specific person — used when
// DRAINING an offline write so the upload is attributed to its real AUTHOR, not
// whoever is active at drain time (the shared-iPad credit bug). The explicit form
// is STRICT: session(author) → author's own bundled token → '' — it deliberately
// never falls back to ANOTHER person's bundled token (that would upload as the
// wrong person, the bug this exists to prevent). The any-bundled dev fallback is
// kept ONLY for the active-traveler default path.
function authHeader(asTraveler) {
  const explicit = !!asTraveler
  const traveler = asTraveler || getActiveTraveler()
  // Per-device session (013) wins — this is the post-cutover credential, and
  // when present it's the identity the user actually enrolled as on this device.
  const session = getSession(traveler)
  if (session) return `Bearer ${session}`
  // Transition fallback: this traveler's OWN bundled family token.
  const token = TOKENS[traveler]
  if (token) return `Bearer ${token}`
  // Dev convenience (active-traveler path only, pre-cutover): any populated
  // BUNDLED token, so a dev env missing one member's token still works for the
  // others. NEVER for an explicit author (it would act as the wrong person), and
  // never another traveler's SESSION.
  if (!explicit) {
    for (const t of TRAVELER_ORDER) {
      if (TOKENS[t]) return `Bearer ${TOKENS[t]}`
    }
  }
  return ''
}

export async function workerFetch(path, opts = {}, { asTraveler } = {}) {
  if (!isWorkerConfigured()) throw new Error('worker not configured')
  // The identity this request acts as: an explicit author (offline-write drain)
  // or, by default, the active traveler.
  const traveler = asTraveler || getActiveTraveler()
  const usedSession = !!getSession(traveler)

  const doFetch = () => {
    const headers = new Headers(opts.headers || {})
    headers.set('Authorization', authHeader(asTraveler))
    if (opts.body && !headers.has('Content-Type') && typeof opts.body === 'string') {
      headers.set('Content-Type', 'application/json')
    }
    return fetch(`${WORKER_URL}${path}`, { ...opts, headers })
  }

  let r = await doFetch()
  // Self-heal a DEAD session: a session-authed request that comes back 401 means
  // the session was revoked/invalid. Drop it (for THIS request's traveler — the
  // author when overridden) so authHeader falls back to that SAME traveler's
  // bundled token (still shipping during the cutover) and retry ONCE — never to
  // the active traveler's credential, which would mis-attribute the write.
  // Post-cutover with no bundled token this just 401s again (the caller keeps the
  // item queued / the "not set up" surface handles it).
  if (r.status === 401 && usedSession) {
    clearSession(traveler)
    r = await doFetch()
  }
  if (!r.ok) {
    const text = await r.text().catch(() => '')
    const err = new Error(`worker ${r.status}: ${text || r.statusText}`)
    err.status = r.status
    throw err
  }
  return r
}

// ─── Enrollment: minting links (the "create" side of magic-link, 013) ───────
// authHeader carries THIS device's current credential (an adult's session or, for
// now, the bundled token). The worker enforces adult-only minting + a real target,
// so no raw token is ever handled by a human — the app asks the server on the
// adult's behalf.

// Mint a one-time enrollment link for `traveler` to use on another device.
// Returns { url, token, traveler, expiresAt }; throws (err.status set) on failure
// (403 if the caller isn't an adult, 503 if migration 013 isn't applied yet).
export async function mintEnrollLink(traveler, deviceLabel) {
  const r = await workerFetch('/auth/link', {
    method: 'POST',
    body: JSON.stringify(deviceLabel ? { traveler, deviceLabel } : { traveler }),
  })
  return r.json()
}

// One-tap self-enroll on an already-authed device: mint a link for `traveler`
// (authed AS them) and redeem it locally → a per-device session. Afterwards this
// device uses the session, not the bundled token, for that person. Returns
// { traveler }; throws on failure. The mint is the adult-gated step — only an
// adult's own device can self-enroll this way.
export async function setUpThisDevice(traveler, deviceLabel) {
  const minted = await mintEnrollLink(traveler, deviceLabel)
  if (!minted?.token) throw new Error('Could not create a setup link.')
  return redeemLink(minted.token, deviceLabel) // stores the session (lib/auth)
}

// "Sign out my other devices" — revoke every session for `traveler` EXCEPT this
// device's own (so the person stays signed in here). Authenticates AS the
// traveler with their own session; the worker route is self-scoped (a caller can
// only revoke their OWN traveler's sessions). Returns the count revoked; throws
// on failure. Pre-cutover this is cosmetic (a revoked device falls back to the
// bundled token); post-cutover it genuinely signs a lost/stale device out.
export async function signOutOtherDevices(traveler) {
  const except = getSession(traveler) // keep THIS device's session alive
  const r = await workerFetch(
    '/auth/revoke',
    {
      method: 'POST',
      body: JSON.stringify({ all: true, ...(except ? { except } : {}) }),
    },
    { asTraveler: traveler }
  )
  const data = await r.json().catch(() => ({}))
  return data?.revoked ?? 0
}

// ─── Share-out ────────────────────────────────────────────────────────────
// Mint a public link for one memory → { token, url }. The worker refuses a
// hidden surprise (409) or a memory the caller can't see (403/404) — those
// surface as a thrown error carrying `.status` so the sheet can explain.
export async function shareMemory(memoryId, layout) {
  const r = await workerFetch('/share', {
    method: 'POST',
    // layout (Phase 2/E2): an author-chosen collage layout for a composed share;
    // omit for a plain single-memory share (the worker defaults to the wall and
    // validates the value, so anything unexpected is harmless).
    body: JSON.stringify(layout ? { memoryId, layout } : { memoryId }),
  })
  return r.json()
}

// ─── Surprises: Claude cover-assist (Slice 3) ───────────────────────────────
// Ask the worker to draft a believable cover story for a surprise. The worker
// owns the prompt + the Anthropic key. Returns the 6 normalized cover fields, or
// null on ANY failure (worker not configured / 503 no key / network / parse) so
// the composer cleanly falls back to "fill it in by hand". `context` =
// { kind, title, detail, trip, stops, when, hideFrom, seed }.
export async function draftCover(context) {
  if (!isWorkerConfigured()) return null
  try {
    const r = await workerFetch('/cover', {
      method: 'POST',
      body: JSON.stringify({ context }),
    })
    const data = await r.json()
    if (!data || typeof data.title !== 'string' || !data.title.trim()) return null
    const s = (v) => (typeof v === 'string' ? v.trim() : '')
    return {
      icon: s(data.icon).slice(0, 4),
      title: s(data.title),
      loc: s(data.loc),
      time: s(data.time),
      weather: s(data.weather),
      packing: s(data.packing),
    }
  } catch {
    return null
  }
}

// ─── Memories ─────────────────────────────────────────────────────────

export async function pullAll({ asTraveler } = {}) {
  if (!isWorkerConfigured()) return []
  try {
    // `asTraveler` (optional) authenticates the pull AS a specific person — used by
    // the conflict-recovery re-pull so a private / surprise memory is fetched under
    // its real AUTHOR (getMemories masks + filters per identity). Defaults to the
    // active traveler (every existing caller), unchanged.
    const r = await workerFetch('/memories', {}, { asTraveler })
    const arr = await r.json()
    // NOTE (2026-07-01): the worker emits createdAt/updatedAt as ISO strings
    // (`new Date(r.created_at).toISOString()`) — deliberately NOT normalized to
    // epoch ms here. A local record's updatedAt is ALSO an ISO string
    // (memoryStore.js's saves all use `new Date().toISOString()`), and
    // shouldTakeRemote's last-write-wins check compares `remote.updatedAt >
    // local.updatedAt` as strings (ISO 8601's lexical order matches chronological
    // order). Converting only the remote side to a number here would silently
    // break that comparison (`number > string` coerces the string via bare
    // Number(), not Date.parse — always NaN, always false) — so a genuinely
    // newer remote edit would stop propagating. The "NaNd ago" display bug this
    // was chasing is fixed at the DISPLAY layer instead (relTime in
    // LivingHeartHome.jsx now accepts either shape), which doesn't touch sync.
    return Array.isArray(arr) ? arr : []
  } catch (err) {
    console.warn('workerSync pullAll failed', err)
    const out = []
    out.errors = [err?.message || String(err)]
    return out
  }
}

// Convert an optimistic-concurrency base to epoch ms for the wire. Accepts an ISO
// string (what rowToMemory emits) or a raw number; returns NaN for anything that
// can't be a real timestamp (undefined / '' / unparseable), so the caller OMITS it
// and the worker stays last-write-wins. Exported for unit tests.
export function baseToEpochMs(v) {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v) return Date.parse(v)
  return NaN
}

// baseUpdatedAt (optional): the SERVER updated_at this record was last known at
// (an ISO string or epoch ms). When present + finite it rides as the
// optimistic-concurrency base — the worker refuses with 409 if the stored row has
// moved on, so a STALE push can't blind-revert a newer edit. Omitted for a
// never-synced record → the worker keeps last-write-wins (safe create). Returns the
// stored memory row on success (so the caller can capture the new serverUpdatedAt);
// a 409 throws out of workerFetch with err.status === 409 for the caller to recover.
export async function pushMemory(memory, { baseUpdatedAt } = {}) {
  if (!isWorkerConfigured()) return null
  // A masked projection (Surprises, 010) — a teaser stub / cover stand-in the
  // worker emitted for a recipient. It carries stripped content; pushing it back
  // (e.g. Settings "Push all" on a recipient device) would clobber the author's
  // real row. It's never authoritative — never push it. (The worker also refuses
  // it, but skip the round-trip.)
  if (memory?.masked) return null
  // Upload any IDB-resident blobs first; rewrite the refs to point at R2.
  // EXCEPT refs flagged storage:'pending' — those are owned by the offline
  // upload queue (lib/uploadQueue), which holds the blob and drains it on
  // reconnect. The pending ref now also carries an idb `key` (so the album can
  // render the picture back after an offline relaunch), but that key must NOT
  // tempt this mirror into a SECOND upload that races the queue's drain — the
  // queue is the single owner of a pending upload. 'idb' (re-attach) still
  // uploads here as before; only 'pending' is skipped.
  const queueOwned = (ref) => ref?.storage === 'pending'
  const updated = { ...memory }
  // Authenticate every upload + the row POST AS the memory's author, so a memory
  // drained while a DIFFERENT persona is active still lands under its real author
  // (the worker stamps author from the token, never the body). Undefined for an
  // author-less record → defaults to the active traveler (unchanged behavior).
  const asAuthor = memory.authorTraveler || undefined

  if (memory.audioRef?.key && memory.audioRef.storage !== 'r2') {
    const blob = await loadAsset('audio', memory.audioRef.key)
    if (blob) {
      const remote = await uploadBlob('audio', memory.id, blob, { asTraveler: asAuthor })
      updated.audioRef = { ...memory.audioRef, ...remote, storage: 'r2' }
    } else {
      // IDB blob is gone — keep the record local-canonical, refuse to
      // POST a half-record that would land on D1 with an idb-flavored
      // ref the worker will silently drop. scheduleMirror's catch
      // swallows this; the local store retains the idb ref so a
      // future retry can succeed if the blob reappears. See
      // KNOWN_BUGS_HELEN_SURFACE.md P0.2 root cause.
      throw new Error(
        `pushMemory ${memory.id}: audio blob missing (idb key ${memory.audioRef.key})`
      )
    }
  }
  if (memory.photoRef?.key && memory.photoRef.storage !== 'r2' && !queueOwned(memory.photoRef)) {
    const blob = await loadAsset('photo', memory.photoRef.key)
    if (blob) {
      const remote = await uploadBlob('photo', memory.id, blob, { asTraveler: asAuthor })
      updated.photoRef = { ...memory.photoRef, ...remote, storage: 'r2' }
    } else {
      throw new Error(
        `pushMemory ${memory.id}: photo blob missing (idb key ${memory.photoRef.key})`
      )
    }
  }
  if (memory.photoRefs?.length) {
    const newRefs = []
    for (const ref of memory.photoRefs) {
      if (ref?.storage === 'r2' || queueOwned(ref)) {
        // r2 → already uploaded; pending → the upload queue owns it (skip, don't
        // double-push). Either way carry the ref through unchanged.
        newRefs.push(ref)
        continue
      }
      const blob = ref?.key ? await loadAsset('photo', ref.key) : null
      if (!blob) {
        throw new Error(
          `pushMemory ${memory.id}: photoRefs blob missing (idb key ${ref?.key || '<none>'})`
        )
      }
      const remote = await uploadBlob('photo', memory.id, blob, { asTraveler: asAuthor })
      newRefs.push({ ...ref, ...remote, storage: 'r2' })
    }
    updated.photoRefs = newRefs
    if (!updated.photoRef && newRefs[0]) updated.photoRef = newRefs[0]
  }

  // Attach the optimistic-concurrency base, numeric only (the worker compares
  // Number(stored) > base). Non-finite (undefined / NaN / a never-synced record) is
  // OMITTED so the worker stays last-write-wins — never sent as null/0/NaN.
  const baseEpoch = baseToEpochMs(baseUpdatedAt)
  if (Number.isFinite(baseEpoch)) updated.baseUpdatedAt = baseEpoch

  const r = await workerFetch('/memories', {
    method: 'POST',
    body: JSON.stringify(updated),
  }, { asTraveler: asAuthor })
  // Hand back the stored row (carries the server-stamped updatedAt). On a parse
  // miss fall back to `true` so old truthiness-only callers still see success.
  return await r.json().catch(() => true)
}

export async function deleteRemote(memory) {
  if (!isWorkerConfigured()) return null
  if (!memory?.id) return false
  try {
    await workerFetch(`/memories/${encodeURIComponent(memory.id)}`, {
      method: 'DELETE',
    })
    return true
  } catch (err) {
    console.warn('workerSync deleteRemote failed', err)
    return false
  }
}

// `asTraveler` (optional) authenticates the upload AS the asset's author so the
// R2 key namespace (worker stamps it from the token) matches the real author when
// draining an offline write, not whoever is active at drain.
export async function uploadBlob(kind, memoryId, blob, { asTraveler } = {}) {
  const r = await workerFetch(
    `/assets/${kind}/${encodeURIComponent(memoryId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': blob.type || 'application/octet-stream' },
      body: blob,
    },
    { asTraveler }
  )
  return r.json() // { key, url, mime }
}

// Trip cover photo. Reuses the exact Worker /assets route + R2 bucket
// the memory photos use (the :memoryId path segment is opaque — we pass
// the tripId). GET /assets/:key serves it unauthenticated so a plain
// <img src> renders on every device, same as memory photos. Returns
// { key, url, mime } or throws (caller surfaces it).
export async function uploadTripCover(tripId, blob) {
  if (!isWorkerConfigured()) throw new Error('worker not configured')
  return uploadBlob('photo', `trip-${tripId}`, blob)
}

// Video poster. A synced video's own R2 key points at the .mp4 (unrenderable
// as <img>), so we upload the first-frame poster (a small JPEG) to the PHOTO
// asset route and carry its key on the ref as `posterKey` — which the worker
// ref serialization persists (Stage-3 step 1) so the still survives
// cross-device. Shared by the immediate import path AND both queue-drain
// runners (App.jsx / PhotosView) so the three can't drift. Best-effort:
// returns { posterKey, posterUrl } or null on ANY failure (no worker, offline,
// poster encode missing) — a missing poster must NOT fail the video upload; the
// album tile just falls back to its icon, exactly as before this feature.
export async function uploadPoster(memoryId, posterBlob, { asTraveler } = {}) {
  if (!posterBlob) return null
  try {
    const remote = await uploadBlob('photo', memoryId, posterBlob, { asTraveler })
    if (!remote?.key) return null
    return { posterKey: remote.key, posterUrl: remote.url }
  } catch {
    return null
  }
}

// ─── Trips ────────────────────────────────────────────────────────────

export async function pullTrips() {
  if (!isWorkerConfigured()) return []
  try {
    const r = await workerFetch('/trips')
    const arr = await r.json()
    return Array.isArray(arr) ? arr : []
  } catch (err) {
    console.warn('workerSync pullTrips failed', err)
    const out = []
    out.errors = [err?.message || String(err)]
    return out
  }
}

// `asTraveler` (optional) authenticates the push AS the editor who made the queued
// change — set by the trip resync from the author captured at mark time, so an
// offline edit re-syncs under its real author (matters for the worker's per-writer
// masking/clobber guards), not whoever is active at resync. Defaults to active.
export async function pushTrip(trip, { asTraveler } = {}) {
  if (!isWorkerConfigured()) return false
  // A masked trip stand-in (3b) is a per-recipient projection — never push it
  // back (it would clobber the author's real trip). The worker also refuses it.
  if (trip?.masked) return false
  try {
    await workerFetch('/trips', {
      method: 'POST',
      body: JSON.stringify(trip),
    }, { asTraveler })
    return true
  } catch (err) {
    console.warn('workerSync pushTrip failed', err)
    throw err
  }
}

export async function deleteTrip(id) {
  if (!isWorkerConfigured()) return false
  try {
    await workerFetch(`/trips/${encodeURIComponent(id)}`, { method: 'DELETE' })
    return true
  } catch (err) {
    console.warn('workerSync deleteTrip failed', err)
    return false
  }
}

// ─── Status helpers (Settings) ────────────────────────────────────────

export const WORKER_META = {
  url: WORKER_URL,
  configured: isWorkerConfigured(),
}

// Round-trip ping so Settings can show "synced / offline".
export async function pingWorker() {
  if (!isWorkerConfigured()) return { ok: false, reason: 'unconfigured' }
  try {
    const r = await workerFetch('/')
    const data = await r.json()
    return { ok: true, traveler: data.traveler }
  } catch (err) {
    return { ok: false, reason: err?.message || String(err) }
  }
}
