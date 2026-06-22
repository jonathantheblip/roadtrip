// Propose → decide (slice 6) — the client data layer + a small polling hook.
//
// The family's "what should we do?" loop, backed by the worker (migration 014).
// Anyone proposes a "We could…" spot for OPEN time; non-deciders add a soft
// "I'm in"; the DECIDERS (the adults) accept/decline. This is multiplayer over
// the EXISTING polling cadence (Jonathan's settled pick — no WebSocket): the
// hook refetches on mount, on focus/visibility, and on a gentle interval, plus
// right after a local action, so a vote or decision shows up within seconds.
//
// Identity is enforced server-side (the proposer/voter/decider is the device's
// session, never anything we send), so this layer just calls the routes.

import { useCallback, useEffect, useRef, useState } from 'react'
import { workerFetch, isWorkerConfigured } from './workerSync'

// The deciders — the adults. Mirrors the worker's ADULTS (auth.js); the server
// is the real gate, this only shapes the UI (Let's go/Not now vs I'm in).
export const DECIDERS = ['jonathan', 'helen']
export function canDecide(traveler) {
  return DECIDERS.includes(traveler)
}

function newId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return `prop_${crypto.randomUUID()}`
  } catch {
    /* fall through */
  }
  return `prop_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`
}

// ─── Worker calls ───────────────────────────────────────────────────────────

export async function fetchProposals(tripId) {
  if (!isWorkerConfigured() || !tripId) return []
  try {
    const r = await workerFetch(`/proposals?tripId=${encodeURIComponent(tripId)}`)
    const arr = await r.json()
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

// Create a proposal. The proposer is the session (server-set); we send the spot
// snapshot so every device renders the same card. Returns the new id (optimistic
// callers can drop it into local state immediately).
export async function postProposal({ tripId, spotId, spot, recipients, note }) {
  const id = newId()
  await workerFetch('/proposals', {
    method: 'POST',
    body: JSON.stringify({ id, tripId, spotId, spot, recipients, note }),
  })
  return id
}

export async function postVote(id) {
  const r = await workerFetch(`/proposals/${encodeURIComponent(id)}/vote`, { method: 'POST' })
  return r.json()
}

export async function postDecide(id, decision) {
  const r = await workerFetch(`/proposals/${encodeURIComponent(id)}/decide`, {
    method: 'POST',
    body: JSON.stringify({ decision }),
  })
  return r.json()
}

// ─── The hook ───────────────────────────────────────────────────────────────

const POLL_MS = 20000

// useProposals(tripId) → { proposals, pending, accepted, refresh, propose, vote, decide }.
// Polls gently; refetches on focus/visibility; refetches after each local action.
export function useProposals(tripId) {
  const [proposals, setProposals] = useState([])
  const tripRef = useRef(tripId)
  tripRef.current = tripId

  const refresh = useCallback(async () => {
    const t = tripRef.current
    if (!t) {
      setProposals([])
      return
    }
    const list = await fetchProposals(t)
    // Guard against a late response after the trip changed.
    if (tripRef.current === t) setProposals(list)
  }, [])

  useEffect(() => {
    if (!tripId || !isWorkerConfigured()) {
      setProposals([])
      return undefined
    }
    let alive = true
    const tick = () => { if (alive) refresh() }
    tick()
    const interval = setInterval(tick, POLL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', tick)
    return () => {
      alive = false
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', tick)
    }
  }, [tripId, refresh])

  const propose = useCallback(async (args) => {
    await postProposal({ tripId: tripRef.current, ...args })
    await refresh()
  }, [refresh])

  const vote = useCallback(async (id) => {
    await postVote(id)
    await refresh()
  }, [refresh])

  const decide = useCallback(async (id, decision) => {
    await postDecide(id, decision)
    await refresh()
  }, [refresh])

  const pending = proposals.filter((p) => p.status === 'pending')
  const accepted = proposals.filter((p) => p.status === 'accepted')
  return { proposals, pending, accepted, refresh, propose, vote, decide }
}
