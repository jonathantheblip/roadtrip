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
  return TRAVELER_ORDER.some((t) => !!TOKENS[t])
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
  const token = TOKENS[traveler]
  if (!token) {
    // Fall back to any populated token so dev environments missing one
    // family member's token still work for the others.
    for (const t of TRAVELER_ORDER) {
      if (TOKENS[t]) return `Bearer ${TOKENS[t]}`
    }
    return ''
  }
  return `Bearer ${token}`
}

async function workerFetch(path, opts = {}) {
  if (!isWorkerConfigured()) throw new Error('worker not configured')
  const headers = new Headers(opts.headers || {})
  headers.set('Authorization', authHeader())
  if (opts.body && !headers.has('Content-Type') && typeof opts.body === 'string') {
    headers.set('Content-Type', 'application/json')
  }
  const r = await fetch(`${WORKER_URL}${path}`, { ...opts, headers })
  if (!r.ok) {
    const text = await r.text().catch(() => '')
    throw new Error(`worker ${r.status}: ${text || r.statusText}`)
  }
  return r
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
  // Upload any IDB-resident blobs first; rewrite the refs to point at R2.
  const updated = { ...memory }

  if (memory.audioRef?.key && memory.audioRef.storage !== 'r2') {
    const blob = await loadAsset('audio', memory.audioRef.key)
    if (blob) {
      const remote = await uploadBlob('audio', memory.id, blob)
      updated.audioRef = { ...memory.audioRef, ...remote, storage: 'r2' }
    }
  }
  if (memory.photoRef?.key && memory.photoRef.storage !== 'r2') {
    const blob = await loadAsset('photo', memory.photoRef.key)
    if (blob) {
      const remote = await uploadBlob('photo', memory.id, blob)
      updated.photoRef = { ...memory.photoRef, ...remote, storage: 'r2' }
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
        newRefs.push(ref)
        continue
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

async function uploadBlob(kind, memoryId, blob) {
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
