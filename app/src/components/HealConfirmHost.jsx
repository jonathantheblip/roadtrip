// HealConfirmHost.jsx — the S1 confirm card's HOME-INDEX door. Fetches the trip's
// /heal-decisions, picks the one confirm-of-day (the shared deterministic seam),
// gates on the daily budget, renders ConfirmMomentCard above the resurface card,
// and on a terminal action spends the budget + POSTs /heal-confirm (the worker
// records it + fires the re-heal). Renders NOTHING (zero reserved space) when
// there's no askable moment or today's budget is spent — the silent-empty rule.
//
// The card is family-visible ONLY once PHOTO_CONFIRM_MODE is on (Stage 4): the
// real-data path renders nothing unless /heal-decisions returns `confirm:true`
// (server-gated on the knob). This is load-bearing — the confirm FILING
// (updateMemoryStop → postMemory → resolveStopProvenance) writes + LOCKS real
// photos through the always-live sync seam, so the card must NOT be interactive
// in the pre-flip shadow window (where the ledger still serves for review). A
// guarded `demo` prop (?confirmDemo=1) bypasses the fetch to render a fixture for
// the dev browser-walk, never in normal use.
import React from 'react'
import { workerFetch, isWorkerConfigured } from '../lib/workerSync'
import { listMemoriesForTrip, updateMemoryStop } from '../lib/memoryStore'
import { flattenPhotoEntries } from '../lib/photoEntries'
import { implicitBaseIdForDay } from '../lib/photoMatch'
import { thumbUrl } from '../lib/thumbUrl'
import {
  pickConfirmOfDay, confirmBudgetSpentToday, spendConfirmBudget, momentFromDecision, confirmFilings, dayAlternates,
} from '../lib/confirmSurface'
import { ConfirmMomentCard, ConfirmPlaceSheet, useConfirmMoment } from './ConfirmMomentCard'

const localTodayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const weekday = (iso) => {
  try { return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' }) } catch { return '' }
}
// Which trip to ask about: an ongoing one (today inside its range), else the most
// recent. One query — multi-trip aggregation can come later.
function primaryTrip(trips, today) {
  const arr = (trips || []).filter((t) => t && !t.draft && t.id)
  const ongoing = arr.find((t) => t.dateRangeStart && t.dateRangeEnd && t.dateRangeStart <= today && today <= t.dateRangeEnd)
  if (ongoing) return ongoing
  return arr.slice().sort((a, b) =>
    String(b.dateRangeEnd || b.dateRangeStart || '').localeCompare(String(a.dateRangeEnd || a.dateRangeStart || ''))
  )[0] || null
}
// Real thumbs for the moment's photos (already per-viewer masked upstream).
function thumbsForMoment(trip, traveler, memoryIds) {
  try {
    const byId = new Map(listMemoriesForTrip(trip.id, traveler).map((m) => [m.id, m]))
    const mems = (memoryIds || []).map((id) => byId.get(id)).filter(Boolean)
    return flattenPhotoEntries(mems).slice(0, 5).map((p) => thumbUrl(p.url, 256)).filter(Boolean)
  } catch { return [] }
}
// dayAlternates moved to lib/confirmSurface.js (pure + node-testable).

const DEMO_MOMENT = {
  kind: 'A', n: 9, moment: 'the walk into town', place: 'Angel Foods', signal: 'timeFit',
  thumbs: ['#6E8590', '#7A6448', '#5E7A6A'], memoryIds: ['demo1'], isoDate: '2026-07-04', placeId: 's-demo',
  alts: [
    { id: 'a1', label: "Aurelia's birthday lunch", why: 'MOMENT' },
    { id: 'a2', label: 'Herring Cove', why: 'PLAN' },
    { id: implicitBaseIdForDay('2026-07-04'), label: 'the beach house', why: 'BASE' },
  ],
}

async function postHealConfirm(tripId, moment, outcome, payload) {
  const body = {
    trip: tripId, isoDate: moment.isoDate, memoryIds: moment.memoryIds, kind: moment.kind,
    guessedPlaceId: moment.placeId, guessedPlaceName: moment.place,
  }
  if (outcome === 'confirmed') body.action = 'confirmed'
  else if (outcome === 'picked') { body.action = 'corrected'; body.correctedPlaceId = payload?.id || null; body.correctedPlaceName = payload?.label || null }
  else if (outcome === 'named' || outcome === 'freetextPlace' || outcome === 'freetextTime') { body.action = 'corrected'; body.words = payload }
  else if (outcome === 'aside') body.action = 'aside'
  else return // skipped / album write nothing here
  try {
    if (isWorkerConfigured()) await workerFetch('/heal-confirm', { method: 'POST', body: JSON.stringify(body) })
  } catch { /* offline → the sync-honesty path; the local settle already happened */ }
}

export function HealConfirmHost({ trips, traveler = 'helen', onOpenAlbum, demo = false }) {
  const today = localTodayIso()
  const [pending, setPending] = React.useState(null) // { tripId, moment }
  const budgetSpent = confirmBudgetSpentToday(today)

  React.useEffect(() => {
    if (budgetSpent) return
    if (demo) { setPending({ tripId: null, moment: DEMO_MOMENT }); return }
    if (!isWorkerConfigured()) return
    const trip = primaryTrip(trips, today)
    if (!trip) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await workerFetch(`/heal-decisions?trip=${encodeURIComponent(trip.id)}`)
        const data = await res.json()
        // The card writes + LOCKS real filings, so it renders ONLY when the server
        // says the confirm surface is live (PHOTO_CONFIRM_MODE on). The ledger
        // serves in shadow for review, but the interactive card must not — else a
        // tap would move real photos before the flip. (Demo path bypasses this.)
        if (!data?.confirm) return
        const pick = pickConfirmOfDay(data?.decisions, today)
        if (!pick || cancelled) return
        const moment = momentFromDecision(pick, {
          thumbs: thumbsForMoment(trip, traveler, pick.memoryIds),
          alts: dayAlternates(trip, pick.isoDate, pick.placeId),
          day: weekday(pick.isoDate),
        })
        if (!cancelled) setPending({ tripId: trip.id, moment })
      } catch { /* advisory surface — never throws into the home */ }
    })()
    return () => { cancelled = true }
  }, [demo, budgetSpent, trips, traveler, today])

  const moment = pending?.moment
  const cm = useConfirmMoment({
    kind: moment?.kind || 'A',
    onResolve: ({ outcome, payload }) => {
      spendConfirmBudget(today) // every terminal action spends today's shared budget
      if (outcome === 'album') { onOpenAlbum?.(moment); return }
      if (outcome === 'skipped') return // deferral — nothing written
      if (demo) return // dev fixture (?confirmDemo=1) — never write real memories / POST
      // File the moment optimistically (the local settle): a place-confirm / pick
      // moves the member photos to the stop with source:'confirmed' — updateMemoryStop
      // mirrors it and the worker LOCKS it against any later sweep. "On the record."
      for (const f of confirmFilings(moment, outcome, payload, traveler)) {
        try { updateMemoryStop(f.memoryId, f.stopId, f.prov) } catch { /* sync-honesty path owns retries */ }
      }
      postHealConfirm(pending?.tripId, moment, outcome, payload)
    },
  })

  // budgetSpent gates the initial PICK (in the effect above), NOT the render: a
  // card already shown must stay through its settled gold line this visit even
  // though answering it just spent today's budget. Next visit, budgetSpent is
  // true at mount → the effect never picks → silent empty.
  if (!moment) return null // silent empty — conditional render, no reserved space
  return (
    <>
      {/* aligned with the resurface card below it (same 18px gutters); the margin
          only exists when the card does, so an empty state reserves no space */}
      <ConfirmMomentCard lens={traveler} moment={moment} cm={cm} host="index" style={{ margin: '4px 18px 12px', width: 'calc(100% - 36px)' }} />
      {cm.sheetOpen && <ConfirmPlaceSheet lens={traveler} moment={moment} cm={cm} />}
    </>
  )
}
