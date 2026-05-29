import { useEffect, useRef, useState } from 'react'
import { findDay, findStop } from './data/trips'
import { TRAVELER_ORDER } from './data/travelers'
import { Switcher } from './views/Switcher'
import { JonathanView } from './views/JonathanView'
import { HelenView } from './views/HelenView'
import { AureliaView } from './views/AureliaView'
import { RafaView } from './views/RafaView'
import { TripIndex } from './views/TripIndex'
import { StopDetail } from './views/StopDetail'
import { Settings } from './views/Settings'
import { NewTrip } from './views/NewTrip'
import { TripEditor } from './views/TripEditor'
import { ActivitiesView } from './views/ActivitiesView'
import { PhotosView } from './views/PhotosView'
import { AllPhotosView } from './views/AllPhotosView'
import { ImportView } from './views/ImportView'
import { CalendarImportView } from './views/CalendarImportView'
import { ClaudeChatPanel, ClaudeEntryButton } from './components/ClaudeChat'
import { applyCardToTrip } from './lib/claudeCardApply'
import { decodeCalendarPayload, eventsToMultiCard } from './lib/calendarImport'
import { cardToTrip } from './lib/createTripCard'
import { useHelenDark } from './hooks/useHelenDark'
import { useTrips } from './hooks/useTrips'
import { pullAll, isWorkerConfigured, workerFetch } from './lib/workerSync'
import { backfillCapturedAt, mergeFromRemote, saveMemory } from './lib/memoryStore'
import { drain as drainQueue, count as queueCount } from './lib/uploadQueue'
import './styles/platform.css'

// Read `?url=` (and optional `&action=import`) at boot — the
// Web Share Target + Apple Shortcut + paste-interstitial all funnel
// through this URL shape, dispatching the user straight into the
// Share-In flow before any other view renders. Defaults to the trip
// view when no import-related query param is present.
function initialViewFromUrl() {
  try {
    if (typeof window === 'undefined') return { name: 'trip' }
    const params = new URLSearchParams(window.location.search)
    const action = params.get('action') || ''
    // Calendar Pull — the Apple Shortcut opens the app here with the
    // worker's filtered events base64'd into ?data=. Decode once and
    // hand the payload to the confirmation view.
    if (action === 'calendar-import') {
      return { name: 'calendar-import', calendarPayload: readCalendarImportPayload() }
    }
    const url = params.get('url') || params.get('text') || ''
    if (url || action === 'import') {
      return { name: 'import', importUrl: url }
    }
  } catch {
    /* ignore */
  }
  return { name: 'trip' }
}

// Per-traveler palette tokens for the fixed top bar. Spec §6 dark/light:
// Jonathan permanent dark; Aurelia permanent light; Rafa permanent dark;
// Helen toggles via her settings. Returns { gradient, text }.
function topBarTokens(traveler, helenDark) {
  if (traveler === 'jonathan' || traveler === 'rafa') {
    return {
      gradient: 'linear-gradient(to bottom, rgba(20,17,13,.92), rgba(20,17,13,0))',
      text: '#F2EBDA',
      opacity: 0.7,
    }
  }
  if (traveler === 'helen' && helenDark) {
    return {
      gradient: 'linear-gradient(to bottom, rgba(20,17,13,.92), rgba(20,17,13,0))',
      text: '#F2EBDA',
      opacity: 0.7,
    }
  }
  return {
    gradient: 'linear-gradient(to bottom, rgba(245,240,231,.85), rgba(245,240,231,0))',
    text: '#1A1614',
    opacity: 0.5,
  }
}

const STORAGE_KEY = 'rt_person_v2'

// Read the active traveler the same way the existing PWA does — query
// param, cookie, then localStorage. Keeps installed home-screen launches
// landing on the right person.
function readTraveler() {
  try {
    const q = new URLSearchParams(window.location.search).get('person')
    if (TRAVELER_ORDER.includes(q)) return q
  } catch {
    /* ignore */
  }
  try {
    const m = document.cookie.match(/(?:^|; )rt_person=([^;]*)/)
    if (m) {
      const v = decodeURIComponent(m[1])
      if (TRAVELER_ORDER.includes(v)) return v
    }
  } catch {
    /* ignore */
  }
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (TRAVELER_ORDER.includes(v)) return v
  } catch {
    /* ignore */
  }
  return 'jonathan'
}

function writeTravelerCookie(value) {
  try {
    const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString()
    document.cookie = `rt_person=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`
  } catch {
    /* ignore */
  }
}

// Decode the Calendar Pull payload from ?data= when the Shortcut deep-
// links in (action=calendar-import). Returns the worker response object
// or null. Cheap enough to call at a couple of init sites.
function readCalendarImportPayload() {
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('action') !== 'calendar-import') return null
    return decodeCalendarPayload(params.get('data'))
  } catch {
    return null
  }
}

// Read the requested trip id from the URL — actual existence check
// happens in the render pass once useTrips has resolved. For a calendar
// deep-link the trip comes from the decoded payload (no ?trip=), so the
// matched trip resolves on the very first render.
function readRequestedTripId() {
  try {
    const payload = readCalendarImportPayload()
    if (payload?.tripId) return payload.tripId
    return new URLSearchParams(window.location.search).get('trip') || null
  } catch {
    return null
  }
}

// "Today" in local time as YYYY-MM-DD. Trip dates are stored as
// YYYY-MM-DD, so string comparison is safe and timezone-stable.
function todayIso() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// M4: shared queue runner. Used by both the background drain in App
// and PhotosView's manual sync-pill tap. Lives at module scope so both
// callers stay in sync — drift here is the kind of bug that makes the
// sync pill behave differently depending on which surface drained it.
async function uploadQueueRunner(item) {
  if (!isWorkerConfigured()) throw new Error('worker not configured')
  const endpoint = item.kind === 'video' ? 'video' : 'photo'
  const r = await workerFetch(
    `/assets/${endpoint}/${encodeURIComponent(item.id)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type':
          item.blob?.type || (item.kind === 'video' ? 'video/mp4' : 'application/octet-stream'),
      },
      body: item.blob,
    }
  )
  const remote = await r.json()
  saveMemory({
    id: item.id,
    tripId: item.tripId,
    stopId: item.stopId,
    authorTraveler: item.authorTraveler,
    visibility: 'shared',
    kind: 'photo', // memories always 'photo' kind; photoRef.kind disambiguates
    caption: item.caption,
    photoRef: { ...item.ref, storage: 'r2', key: remote.key, url: remote.url },
  })
}

// Active-trip spec: pick the trip whose [startDate, endDate] window
// contains today. If multiple match, the latest startDate wins. Return
// null when nothing matches — the caller shows the trip picker rather
// than falling back to any default. Replaces the older "latest
// dateRangeStart wins regardless of dates" behavior, which made the
// PWA open on a future trip the moment that trip was scheduled.
function pickActiveTrip(trips, today = todayIso()) {
  if (!trips || trips.length === 0) return null
  const matches = trips.filter((t) => {
    const start = t.dateRangeStart
    const end = t.dateRangeEnd
    return start && end && start <= today && today <= end
  })
  if (matches.length === 0) return null
  return matches.reduce((best, t) =>
    (t.dateRangeStart || '') > (best.dateRangeStart || '') ? t : best
  )
}

export default function App() {
  const [traveler, setTraveler] = useState(readTraveler)
  const [tripId, setTripId] = useState(readRequestedTripId)
  const [view, setView] = useState(() => initialViewFromUrl()) // 'index' | 'trip' | 'stop' | 'settings' | 'new' | 'edit' | 'activities' | 'photos' | 'import'
  const [helenDark, toggleHelenDark] = useHelenDark()
  // Claude-in-App M1: panel state lives at App level so the entry
  // points scattered across views all open the same surface, and the
  // panel's per-trip context falls out of the existing `trip` resolve.
  const [claudeOpen, setClaudeOpen] = useState(false)
  function openClaude() { setClaudeOpen(true) }
  function closeClaude() { setClaudeOpen(false) }
  const tripsApi = useTrips()
  const allTrips = tripsApi.trips
  // Drafts (manual-add, not yet published) never appear in the polished
  // surfaces — not the index, not the trip switcher, not the cold-start
  // pick. They live only in the editor and the Settings → Drafts list.
  // This is what stops a sparse trip from ever rendering in a view.
  const visibleTrips = allTrips.filter((t) => !t.draft)
  const topBar = topBarTokens(traveler, helenDark)
  // Spec §6: Jonathan + Rafa permanent dark; Helen dark when toggled on.
  // Aurelia stays light. This drives the StopDetail / Settings surface.
  const darkSurface =
    traveler === 'jonathan' ||
    traveler === 'rafa' ||
    (traveler === 'helen' && helenDark)

  // Persist traveler across reloads + standalone PWA boundary.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, traveler)
    } catch {
      /* ignore */
    }
    writeTravelerCookie(traveler)
    try {
      const url = new URL(window.location.href)
      if (url.searchParams.get('person') !== traveler) {
        url.searchParams.set('person', traveler)
        window.history.replaceState(null, '', url.toString())
      }
    } catch {
      /* ignore */
    }
  }, [traveler])

  // The CSS theme cascade. Helen has two palettes — `helen` (linen
  // archive) and `helen-dark` (oxblood evening). Re-runs on toggle.
  useEffect(() => {
    const themeName = traveler === 'helen' && helenDark ? 'helen-dark' : traveler
    document.documentElement.setAttribute('data-theme', themeName)
    document.body.setAttribute('data-theme', themeName)
  }, [traveler, helenDark])

  // Mirror tripId in the URL too, so a home-screen save remembers it.
  // When tripId clears (cold-load override decided no trip matches
  // today), strip ?trip= so the next launch starts clean.
  useEffect(() => {
    try {
      const url = new URL(window.location.href)
      if (tripId) {
        if (url.searchParams.get('trip') !== tripId) {
          url.searchParams.set('trip', tripId)
          window.history.replaceState(null, '', url.toString())
        }
      } else if (url.searchParams.has('trip')) {
        url.searchParams.delete('trip')
        window.history.replaceState(null, '', url.toString())
      }
    } catch {
      /* ignore */
    }
  }, [tripId])

  // Auto-sync from the Worker on cold load and whenever the tab returns
  // to the foreground, so the family thread updates without anyone
  // having to remember to hit Pull. Throttled so quickly toggling
  // back-and-forth doesn't spam the API. Silent — failures don't
  // surface (the explicit Pull button in Settings still gives users a
  // way to see real status when they want it).
  //
  // M4: piggy-backs the upload-queue drain on the same triggers (cold
  // load, foreground, SW sync message, ~120s interval backstop). Helen
  // comes back to the app after losing signal → sync pill drops to
  // zero on its own. No "drained 3 uploads" toast — silent success per
  // the carryover.
  // One-shot backfill: synthesize memory.capturedAt from any per-photo
  // ref.capturedAt that pre-dates this field. Idempotent — skips
  // memories that already carry capturedAt at the top level. Runs once
  // on mount, before the first auto-sync, so the album's first paint
  // shows the right chronology even on cold load.
  useEffect(() => {
    try {
      backfillCapturedAt()
    } catch {
      /* ignore — never block boot on a backfill failure */
    }
  }, [])

  useEffect(() => {
    let lastSyncRun = 0
    let drainInFlight = false
    let cancelled = false
    const SYNC_THROTTLE_MS = 5000
    const DRAIN_INTERVAL_MS = 120_000

    async function runSync() {
      const now = Date.now()
      if (now - lastSyncRun < SYNC_THROTTLE_MS) return
      lastSyncRun = now
      try {
        const remote = await pullAll()
        if (cancelled) return
        if (remote.length > 0) mergeFromRemote(remote)
        await tripsApi.refresh?.()
      } catch (err) {
        // Worker unconfigured / offline — fine, stay on local cache.
        console.warn('autoSync failed', err)
      }
    }

    async function runDrain() {
      // Re-entrancy guard rather than a time throttle — a long-running
      // drain shouldn't be re-triggered while in flight, but the moment
      // it finishes a new signal (visibility change, online event)
      // should be free to start another pass without waiting on a
      // wall-clock window.
      if (drainInFlight) return
      drainInFlight = true
      try {
        const pending = await queueCount()
        if (cancelled || pending === 0) return
        await drainQueue(uploadQueueRunner)
      } catch (err) {
        // Drain failures stay silent — the items remain in the queue
        // for the next attempt. The sync pill (in PhotosView header)
        // still counts what's left, so the user has a visual signal.
        console.warn('autoDrain failed', err)
      } finally {
        drainInFlight = false
      }
    }

    runSync() // initial pull on cold load
    runDrain() // also pick up any items left from a prior session

    function onVisibility() {
      if (document.visibilityState === 'visible') {
        runSync()
        runDrain()
      }
    }
    function onOnline() {
      runDrain()
    }
    function onSwMessage(e) {
      if (e?.data?.type === 'drain-upload-queue') runDrain()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onOnline)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener?.('message', onSwMessage)
    }
    const drainInterval = setInterval(runDrain, DRAIN_INTERVAL_MS)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener?.('message', onSwMessage)
      }
      clearInterval(drainInterval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  // Editor/Drafts can target a draft by id, so resolve against the full
  // list; cold-start default only ever picks from the visible (non-draft)
  // set so a draft can never become the landing trip.
  const activeTrip = pickActiveTrip(visibleTrips)
  const trip =
    (tripId && allTrips.find((t) => t.id === tripId)) || activeTrip

  // Cold-load override: when the URL ?trip= param points at a trip whose
  // window doesn't contain today (typical case: PWA was installed when
  // some other trip was the latest, the saved home-screen URL pinned
  // it), bounce to today's active trip per spec. When nothing matches
  // today's date, drop to the picker — no silent default fallback.
  const coldLoadHandledRef = useRef(false)
  useEffect(() => {
    if (coldLoadHandledRef.current) return
    if (!visibleTrips.length) return
    coldLoadHandledRef.current = true

    const today = todayIso()
    const active = pickActiveTrip(visibleTrips, today)
    const urlTrip = tripId ? visibleTrips.find((t) => t.id === tripId) : null
    const urlTripIsActiveToday = !!(
      urlTrip &&
      urlTrip.dateRangeStart &&
      urlTrip.dateRangeEnd &&
      urlTrip.dateRangeStart <= today &&
      today <= urlTrip.dateRangeEnd
    )

    if (urlTripIsActiveToday) return
    if (active) {
      if (tripId !== active.id) setTripId(active.id)
      return
    }
    if (tripId) setTripId(null)
    if (view.name !== 'index') setView({ name: 'index' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleTrips])

  // A draft has no polished view — if something points the trip surface
  // at one (e.g. a stale ?trip=<draft> URL), send it to the editor.
  useEffect(() => {
    if (view.name === 'trip' && trip?.draft) {
      setView({ name: 'edit' })
    }
  }, [view.name, trip?.draft])

  const day = view.name === 'stop' && trip ? findDay(trip, view.dayN) : null
  const stop = view.name === 'stop' && day ? findStop(day, view.stopId) : null

  function openTrip(id) {
    setTripId(id)
    setView({ name: 'trip' })
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
  }
  function openStop(dayN, stopId) {
    setView({ name: 'stop', dayN, stopId })
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  }
  // Day-chip strip on StopDetail uses this to jump between days. The
  // chip gives Day N → first stop of that day; the Stop view itself is
  // the only deep-link target we have today.
  function openDayFirstStop(dayN) {
    if (!trip) return
    const target = trip.days.find((d) => d.n === dayN)
    const firstStop = target?.stops?.[0]
    if (!firstStop) return
    setView({ name: 'stop', dayN, stopId: firstStop.id })
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  }
  function openSettings() {
    setView({ name: 'settings' })
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  }
  function openIndex() {
    setView({ name: 'index' })
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  }
  function openNewTrip() {
    setView({ name: 'new' })
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  }
  function openEditor(id) {
    if (id) setTripId(id)
    setView({ name: 'edit' })
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  }
  function openActivities() {
    setView({ name: 'activities' })
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  }
  function openImport(rawUrl) {
    setView({ name: 'import', importUrl: rawUrl || '' })
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  }
  // Append a Share-In v2 record to the active trip's sharedActivities,
  // then upsert through the existing tripsApi so the change rides the
  // same sync path as any other trip edit.
  async function handleSaveImport(record) {
    if (!trip || !record) return
    const next = {
      ...trip,
      sharedActivities: [...(trip.sharedActivities || []), record],
    }
    await tripsApi.upsertTrip(next)
    // Clear the URL query param so a reload of the standalone PWA
    // doesn't keep re-firing the import flow.
    try {
      const url = new URL(window.location.href)
      url.searchParams.delete('url')
      url.searchParams.delete('action')
      url.searchParams.delete('text')
      url.searchParams.delete('title')
      window.history.replaceState(null, '', url.toString())
    } catch {
      /* ignore */
    }
  }
  // Strip the calendar deep-link params so a reload of the standalone PWA
  // doesn't re-fire the import flow against a stale payload.
  function clearCalendarParams() {
    try {
      const url = new URL(window.location.href)
      url.searchParams.delete('action')
      url.searchParams.delete('data')
      window.history.replaceState(null, '', url.toString())
    } catch {
      /* ignore */
    }
  }
  // Calendar Pull — turn the confirmed events into stops via the existing
  // stop-add path (eventsToMultiCard → applyCardToTrip), then upsert
  // through the same write path as every other trip edit. Re-throws on
  // failure so the confirmation view can stay put and let the user retry.
  async function handleCalendarImport(events) {
    if (!trip || !Array.isArray(events) || events.length === 0) return
    const card = eventsToMultiCard(trip, events)
    const next = applyCardToTrip(trip, card)
    await tripsApi.upsertTrip(next)
    clearCalendarParams()
  }
  // M2 — apply a Claude confirmation card to the active trip. The card
  // arrives with user-edited field values (the draft); applyCardToTrip
  // maps it to a next-trip snapshot; tripsApi.upsertTrip commits via the
  // same write path as the manual composer. Re-throws on failure so the
  // ConfirmCard surface flips to its error state with a retry affordance.
  async function handleClaudeCardSave(card) {
    // create_trip is the only card that doesn't require an active trip —
    // it builds a brand-new one from the trips-index surface. Route it
    // to its own handler before the active-trip guard.
    if (card?.type === 'create_trip') {
      return handleClaudeCreateTrip(card)
    }
    if (!trip || !card) throw new Error('No active trip to apply this change to.')
    // applyCardToTrip throws on a structural mismatch (unknown day,
    // unsupported action). Worker push failures are NOT escalated — the
    // change lives in local state + cache, and the global sync indicator
    // owns "your change hasn't reached the family yet."
    const next = applyCardToTrip(trip, card)
    return tripsApi.upsertTrip(next)
  }
  // Trip creation via Claude (create_trip card). Maps the card to a
  // canonical trip record (skipped stops dropped), commits through the
  // same upsert path every other write uses, then navigates into the
  // new trip so Helen lands on it immediately and can refine via the M2
  // surface. Re-throws on a failed upsert so the card flips to its error
  // state. The trip id is a deterministic slug, so a refine-then-save
  // re-uses the same row rather than forking a duplicate.
  async function handleClaudeCreateTrip(card) {
    const newTrip = cardToTrip(card)
    // upsertTrip writes the local cache synchronously, then best-effort
    // mirrors to the Worker. A failed Worker push returns { ok: false }
    // but the trip is already in local state — same non-escalation
    // policy as the M2 edit cards (the global sync indicator owns
    // "hasn't reached the family yet"). So we navigate regardless; the
    // deterministic slug id makes a later retry idempotent.
    const res = await tripsApi.upsertTrip(newTrip)
    openTrip(newTrip.id)
    // Close the chat so Helen lands on the trip she just made (spec:
    // "navigate to the new trip's view"). The in-trip M2 surface is one
    // tap away when she wants to refine. M2 edit cards leave the panel
    // open by contrast — they're editing the trip she's already looking
    // at, so there's nothing new to reveal.
    closeClaude()
    return res
  }
  function openPhotos() {
    setView({ name: 'photos' })
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  }
  function openAllPhotos() {
    setView({ name: 'all-photos' })
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  }
  function openDispatch() {
    // M2 wires the actual dispatch composer; for now route into Photos
    // so the entry point is reachable. The composer modal mounts inside
    // PhotosView in M2 and opens via this callback.
    setView({ name: 'photos', openDispatch: true })
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  }
  // Returns the upsert result so NewTrip can show an inline error and
  // stay put on failure (no navigation), per change order §3.4. On
  // success we go straight into the editor — Helen continues adding
  // detail without leaving the flow and never re-enters the trip.
  async function handleCreateTrip(newTrip) {
    const res = await tripsApi.upsertTrip(newTrip)
    if (res?.ok) {
      setTripId(newTrip.id)
      setView({ name: 'edit' })
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    }
    return res
  }
  function handleTravelerSwitch(id) {
    setTraveler(id)
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
  }

  // Render the per-traveler themed surface for the active trip
  function renderTripView() {
    if (!trip) return null
    const props = {
      trip,
      traveler,
      onOpenStop: openStop,
      onOpenSettings: openSettings,
      onOpenActivities: openActivities,
      onOpenPhotos: openPhotos,
      onOpenAllPhotos: openAllPhotos,
      onOpenImport: openImport,
    }
    switch (traveler) {
      case 'helen':
        return <HelenView {...props} />
      case 'aurelia':
        return <AureliaView {...props} />
      case 'rafa':
        return <RafaView {...props} />
      case 'jonathan':
      default:
        return <JonathanView {...props} />
    }
  }

  return (
    <>
      {/* Top-of-screen trip / index switch — small and editorial, never the focus */}
      {view.name !== 'index' && view.name !== 'new' && view.name !== 'edit' && (
        <div
          className="px-6"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 40,
            paddingTop: 'max(8px, env(safe-area-inset-top))',
            paddingBottom: 8,
            background: topBar.gradient,
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {/* Context-aware back: from a stop or settings, "back" should
              return to the per-traveler trip home, not jump out to the
              trip index. The trip-switcher dropdown to the right still
              lets users hop trips without going through the index. */}
          {(() => {
            const inDeepView =
              view.name === 'stop' ||
              view.name === 'settings' ||
              view.name === 'activities' ||
              view.name === 'photos' ||
              view.name === 'all-photos' ||
              view.name === 'import' ||
              view.name === 'calendar-import'
            const label = inDeepView && trip?.title ? `← ${trip.title}` : '← Trips'
            const handler = inDeepView ? () => setView({ name: 'trip' }) : openIndex
            return (
              <button
                type="button"
                onClick={handler}
                style={{
                  background: 'transparent',
                  border: 0,
                  padding: 0,
                  cursor: 'pointer',
                  minWidth: 0,
                  flex: '0 1 auto',
                }}
              >
                <span
                  className="f-mono"
                  style={{
                    display: 'inline-block',
                    maxWidth: inDeepView ? '80vw' : '52vw',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontSize: 10,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    opacity: topBar.opacity,
                    color: topBar.text,
                  }}
                >
                  {label}
                </span>
              </button>
            )
          })()}
          {/* Trip switcher only on the trip home — on stop/settings the
              back button already carries the trip title, and rendering
              the title twice in a fixed-width bar overflows on phones. */}
          {view.name === 'trip' && (
            <select
              value={trip?.id || ''}
              onChange={(e) => openTrip(e.target.value)}
              style={{
                background: 'transparent',
                border: 0,
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                opacity: topBar.opacity,
                color: topBar.text,
                maxWidth: '60vw',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                flex: '1 1 auto',
                minWidth: 0,
                textAlign: 'right',
              }}
            >
              {visibleTrips.map((t) => (
                <option key={t.id} value={t.id} style={{ color: '#1A1614' }}>
                  {t.title}
                </option>
              ))}
            </select>
          )}
          {/* Claude entry — only when there's a trip in context (matches
              spec: in-trip surface "Modify this trip with Claude"). On
              non-trip deep views (settings, photos, etc.) the button
              still surfaces so the conversation can continue with that
              trip's context loaded. M1 has no badge. */}
          {trip && (
            <ClaudeEntryButton onClick={openClaude} label="Modify this trip with Claude" />
          )}
          <button
            type="button"
            onClick={openSettings}
            aria-label="Trip settings"
            style={{
              background: 'transparent',
              border: 0,
              padding: '0 4px',
              cursor: 'pointer',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              opacity: topBar.opacity,
              color: topBar.text,
            }}
          >
            ⋯
          </button>
        </div>
      )}

      <div key={`${view.name}-${tripId}-${traveler}`}>
        {view.name === 'index' && (
          <TripIndex
            traveler={traveler}
            trips={visibleTrips}
            onOpenTrip={openTrip}
            onNewTrip={openNewTrip}
          />
        )}
        {view.name === 'new' && <NewTrip onBack={openIndex} onCreate={handleCreateTrip} dark={darkSurface} />}
        {view.name === 'edit' && trip && (
          <TripEditor
            trip={trip}
            traveler={traveler}
            dark={darkSurface}
            tripsApi={tripsApi}
            onBack={openIndex}
            onOpenTrip={openTrip}
          />
        )}
        {view.name === 'trip' && trip && !trip.draft && renderTripView()}
        {view.name === 'stop' && trip && day && stop && (
          <StopDetail
            trip={trip}
            day={day}
            stop={stop}
            traveler={traveler}
            dark={darkSurface}
            onBack={() => setView({ name: 'trip' })}
            onOpenDay={openDayFirstStop}
          />
        )}
        {view.name === 'activities' && trip && (
          <ActivitiesView
            trip={trip}
            traveler={traveler}
            onBack={() => setView({ name: 'trip' })}
            onOpenImport={openImport}
          />
        )}
        {view.name === 'import' && trip && (
          <ImportView
            trip={trip}
            traveler={traveler}
            initialUrl={view.importUrl || ''}
            onBack={() => setView({ name: 'activities' })}
            onSave={handleSaveImport}
          />
        )}
        {view.name === 'calendar-import' && (
          <CalendarImportView
            trip={trip}
            payload={view.calendarPayload}
            onConfirm={handleCalendarImport}
            onBack={() => {
              clearCalendarParams()
              setView({ name: trip ? 'trip' : 'index' })
            }}
          />
        )}
        {view.name === 'photos' && trip && (
          <PhotosView
            trip={trip}
            traveler={traveler}
            onBack={() => setView({ name: 'trip' })}
            openDispatchOnMount={!!view.openDispatch}
          />
        )}
        {view.name === 'all-photos' && (
          <AllPhotosView
            trips={visibleTrips}
            traveler={traveler}
            onBack={() => setView({ name: 'trip' })}
          />
        )}
        {view.name === 'settings' && trip && (
          <Settings
            trip={trip}
            traveler={traveler}
            dark={darkSurface}
            helenDark={helenDark}
            onToggleHelenDark={toggleHelenDark}
            tripsApi={tripsApi}
            onBack={() => setView({ name: 'trip' })}
            onChangeTraveler={handleTravelerSwitch}
            onOpenEditor={openEditor}
          />
        )}
      </div>

      {/* Bottom switcher visible everywhere except the index */}
      {view.name !== 'index' && view.name !== 'new' && view.name !== 'edit' && (
        <Switcher active={traveler} onSwitch={handleTravelerSwitch} />
      )}

      {/* Claude-in-App M1 — floating entry on the trips index.
          Bottom-right, lifted above any future bottom chrome. The
          in-trip entry lives in the fixed top bar above. */}
      {view.name === 'index' && (
        <div
          style={{
            position: 'fixed',
            right: 'max(18px, env(safe-area-inset-right))',
            bottom: 'max(24px, env(safe-area-inset-bottom))',
            zIndex: 50,
          }}
        >
          <ClaudeEntryButton onClick={openClaude} floating label="Plan with Claude" />
        </div>
      )}

      {/* Spec: floating FAB on the trips index = "Plan a trip with
          Claude" (no specific trip in context). In-trip entry =
          "Modify this trip with Claude" (trip pre-loaded). The panel
          drops its trip context whenever the user is on the index. */}
      <ClaudeChatPanel
        open={claudeOpen}
        onClose={closeClaude}
        userId={traveler}
        tripId={view.name === 'index' ? null : (trip?.id || null)}
        tripTitle={view.name === 'index' ? null : (trip?.title || null)}
        trip={view.name === 'index' ? null : (trip || null)}
        // Always wired now: on the index the only savable card is
        // create_trip (handleClaudeCardSave routes it to the create
        // handler); add/move/cancel/multi still require an active trip
        // and the worker only emits those in-trip.
        onCardSave={handleClaudeCardSave}
      />
    </>
  )
}
