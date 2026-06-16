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
const TOKENS = {
  jonathan: env.VITE_FAMILY_TOKEN_JONATHAN || '',
  helen: env.VITE_FAMILY_TOKEN_HELEN || '',
  aurelia: env.VITE_FAMILY_TOKEN_AURELIA || '',
  rafa: env.VITE_FAMILY_TOKEN_RAFA || '',
}
const TRAVELER_ORDER = ['jonathan', 'helen', 'aurelia', 'rafa']

export function isWorkerConfigured() {
  if (!WORKER_URL) return false
  // Configured if ANY traveler has a credential — a per-device session (013) OR,
  // during the cutover, a bundled token. Session-aware so the app stays
  // configured after the "close the door" step removes the bundled tokens.
  return TRAVELER_ORDER.some((t) => !!TOKENS[t] || !!getSession(t))
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
function getActiveTraveler() {
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

function authHeader() {
  const traveler = getActiveTraveler()
  // Per-device session (013) wins — this is the post-cutover credential, and
  // when present it's the identity the user actually enrolled as on this device.
  const session = getSession(traveler)
  if (session) return `Bearer ${session}`
  // Transition fallback: this traveler's bundled family token.
  const token = TOKENS[traveler]
  if (token) return `Bearer ${token}`
  // Dev convenience (pre-cutover only): any populated BUNDLED token, so a dev env
  // missing one member's token still works for the others. Deliberately never
  // falls back to another traveler's SESSION — that would act as the wrong person.
  for (const t of TRAVELER_ORDER) {
    if (TOKENS[t]) return `Bearer ${TOKENS[t]}`
  }
  return ''
}

export async function workerFetch(path, opts = {}) {
  if (!isWorkerConfigured()) throw new Error('worker not configured')
  const traveler = getActiveTraveler()
  const usedSession = !!getSession(traveler)

  const doFetch = () => {
    const headers = new Headers(opts.headers || {})
    headers.set('Authorization', authHeader())
    if (opts.body && !headers.has('Content-Type') && typeof opts.body === 'string') {
      headers.set('Content-Type', 'application/json')
    }
    return fetch(`${WORKER_URL}${path}`, { ...opts, headers })
  }

  let r = await doFetch()
  // Self-heal a DEAD session: a session-authed request that comes back 401 means
  // the session was revoked/invalid. Drop it so authHeader falls back to the
  // bundled token (still shipping during the cutover) and retry ONCE — otherwise
  // a single bad session in localStorage would shadow a working credential and
  // brick ALL sync with no recovery. (Bodies used here are strings/Blobs, both
  // re-readable. Post-cutover with no bundled token this just 401s again, which
  // the "not set up" surface will handle.)
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

export async function pullAll() {
  if (!isWorkerConfigured()) return []
  try {
    const r = await workerFetch('/memories')
    const arr = await r.json()
    return Array.isArray(arr) ? arr : []
  } catch (err) {
    console.warn('workerSync pullAll failed', err)
    const out = []
    out.errors = [err?.message || String(err)]
    return out
  }
}

export async function pushMemory(memory) {
  if (!isWorkerConfigured()) return null
  // A masked projection (Surprises, 010) — a teaser stub / cover stand-in the
  // worker emitted for a recipient. It carries stripped content; pushing it back
  // (e.g. Settings "Push all" on a recipient device) would clobber the author's
  // real row. It's never authoritative — never push it. (The worker also refuses
  // it, but skip the round-trip.)
  if (memory?.masked) return null
  // Upload any IDB-resident blobs first; rewrite the refs to point at R2.
  const updated = { ...memory }

  if (memory.audioRef?.key && memory.audioRef.storage !== 'r2') {
    const blob = await loadAsset('audio', memory.audioRef.key)
    if (blob) {
      const remote = await uploadBlob('audio', memory.id, blob)
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
  if (memory.photoRef?.key && memory.photoRef.storage !== 'r2') {
    const blob = await loadAsset('photo', memory.photoRef.key)
    if (blob) {
      const remote = await uploadBlob('photo', memory.id, blob)
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
      if (ref?.storage === 'r2') {
        newRefs.push(ref)
        continue
      }
      const blob = ref?.key ? await loadAsset('photo', ref.key) : null
      if (!blob) {
        throw new Error(
          `pushMemory ${memory.id}: photoRefs blob missing (idb key ${ref?.key || '<none>'})`
        )
      }
      const remote = await uploadBlob('photo', memory.id, blob)
      newRefs.push({ ...ref, ...remote, storage: 'r2' })
    }
    updated.photoRefs = newRefs
    if (!updated.photoRef && newRefs[0]) updated.photoRef = newRefs[0]
  }

  await workerFetch('/memories', {
    method: 'POST',
    body: JSON.stringify(updated),
  })
  return true
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

export async function uploadBlob(kind, memoryId, blob) {
  const r = await workerFetch(
    `/assets/${kind}/${encodeURIComponent(memoryId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': blob.type || 'application/octet-stream' },
      body: blob,
    }
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
export async function uploadPoster(memoryId, posterBlob) {
  if (!posterBlob) return null
  try {
    const remote = await uploadBlob('photo', memoryId, posterBlob)
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

export async function pushTrip(trip) {
  if (!isWorkerConfigured()) return false
  // A masked trip stand-in (3b) is a per-recipient projection — never push it
  // back (it would clobber the author's real trip). The worker also refuses it.
  if (trip?.masked) return false
  try {
    await workerFetch('/trips', {
      method: 'POST',
      body: JSON.stringify(trip),
    })
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
