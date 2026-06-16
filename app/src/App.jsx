import { useEffect, useRef, useState, useMemo, lazy, Suspense } from 'react'
import { findDay, findStop } from './data/trips'
import { TRAVELER_ORDER } from './data/travelers'
import { Switcher } from './views/Switcher'
import { buildLedgeModel } from './lib/liveDock'
import { useLiveEta } from './hooks/useLiveEta'
import { JonathanView } from './views/JonathanView'
import { HelenView } from './views/HelenView'
import { AureliaView } from './views/AureliaView'
import { RafaView } from './views/RafaView'
import { RafaPad } from './views/RafaPad'
import { TripIndex } from './views/TripIndex'
import { StopDetail } from './views/StopDetail'
import { Settings } from './views/Settings'
import { NewTrip } from './views/NewTrip'
import { TripEditor } from './views/TripEditor'
import { ActivitiesView } from './views/ActivitiesView'
import { PhotosView } from './views/PhotosView'
import { AllPhotosView } from './views/AllPhotosView'
import { ReplayView } from './views/ReplayView'
import { MapView } from './views/MapView'
import { ImportView } from './views/ImportView'
import { InstallIdentity } from './views/InstallIdentity'
import { TheWeave } from './views/TheWeave'
import { WeaveBook } from './views/WeaveBook'
import { SurprisesView } from './views/SurprisesView'
import { Enroll } from './views/Enroll'
import { ShareComposer } from './components/ShareComposer'
// "Show me, me" (the on-device face recognizer) is lazy-loaded so its
// model + index code stays out of the main bundle until it's opened.
const PersonView = lazy(() => import('./views/PersonView').then((m) => ({ default: m.PersonView })))
import { ClaudeChatPanel, ClaudeEntryButton } from './components/ClaudeChat'
import { applyCardToTrip } from './lib/claudeCardApply'
import { cardToTrip } from './lib/createTripCard'
import { fetchStoredWeave, getWeaveSeen, markWeaveSeen, fetchWeaveBook } from './lib/weave'
import { useTrips } from './hooks/useTrips'
import { useIsIpad } from './hooks/useMediaQuery'
import { ArrivalRevealWatcher, countUnseenReveals, markRevealsSeen, hasPendingArrival } from './hooks/useSurpriseAutomation'
import { mergeCoverStops, maskTripsForViewer, maskTripForViewer } from './lib/surprises'
import { pullAll, isWorkerConfigured, workerFetch, uploadPoster } from './lib/workerSync'
import { backfillCapturedAt, mergeFromRemote, saveMemory, listMemoriesForTrip } from './lib/memoryStore'
import { drain as drainQueue, count as queueCount } from './lib/uploadQueue'
import { applyInstallIdentity } from './lib/appInstall'
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
    const url = params.get('url') || params.get('text') || ''
    // ?enroll=<linkToken> — a personal magic-link to set up THIS device (013).
    // Highest precedence: it's an explicit setup action. The Enroll screen
    // detects standalone vs browser and handles the iOS hand-off.
    const enroll = params.get('enroll') || ''
    if (enroll) return { name: 'enroll', enrollToken: enroll }
    // ?personview=1 opens "Show me, me" directly (also on Rafa's tile +
    // Aurelia's lens).
    if (params.get('personview') === '1') return { name: 'showme', who: null }
    // ?surprises=1 opens the Surprises & masking surface directly (temp entry,
    // for on-device testing).
    if (params.get('surprises') === '1') return { name: 'surprises' }
    if (url || action === 'import') {
      return { name: 'import', importUrl: url }
    }
  } catch {
    /* ignore */
  }
  return { name: 'trip' }
}

// Per-traveler palette tokens for the fixed top bar. Fixed per person now
// (dark-mode toggle dropped 2026-06-05): Jonathan + Rafa dark, Helen +
// Aurelia light. Returns { gradient, text, opacity }.
function topBarTokens(traveler) {
  if (traveler === 'jonathan' || traveler === 'rafa' || traveler === 'aurelia') {
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

// Read the requested trip id from the URL — actual existence check
// happens in the render pass once useTrips has resolved.
function readRequestedTripId() {
  try {
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
  const photoRef = { ...item.ref, storage: 'r2', key: remote.key, url: remote.url }
  // A queued video carries its poster blob too — re-upload it so the synced
  // tile renders a still, not a fallback icon (best-effort; mirrors
  // uploadOrQueueVideo + PhotosView.triggerDrain so the three can't drift).
  if (item.kind === 'video' && item.posterBlob) {
    const poster = await uploadPoster(item.id, item.posterBlob)
    if (poster) Object.assign(photoRef, poster)
  }
  saveMemory({
    id: item.id,
    tripId: item.tripId,
    stopId: item.stopId,
    authorTraveler: item.authorTraveler,
    visibility: 'shared',
    kind: 'photo', // memories always 'photo' kind; photoRef.kind disambiguates
    caption: item.caption,
    photoRef,
  })
}

// Shift a YYYY-MM-DD date by N days in LOCAL time (no UTC drift).
function shiftIso(iso, days) {
  const [y, m, d] = String(iso).split('-').map(Number)
  if (!y || !m || !d) return iso
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + days)
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${dt.getFullYear()}-${mm}-${dd}`
}

// How many days BEFORE a trip starts / AFTER it ends the app still opens straight
// into it (Jonathan's ask: launch into an imminent or just-finished trip). The
// older spec required today to fall STRICTLY inside [start, end] — which never
// opened into a trip leaving in 3 days. This widens that landing window by ±4
// days. It does NOT change "is this trip live RIGHT NOW" — that's the separate
// strict check in liveDock (tripIsLive), so a not-yet-started trip opens but is
// shown as "before the trip", never live.
const LAUNCH_GRACE_DAYS = 4

// Is this trip "current" for the LAUNCH LANDING — not archived, real dates, and
// today within ±LAUNCH_GRACE_DAYS of its window? (Equivalent to: the window
// widened by the grace brackets today.)
function isNearNow(trip, today = todayIso()) {
  // Archived = "filed away" (matches effectiveStatus / the trip-list rule where
  // archivedAt wins over date math). Never the launch trip, even if its dates
  // still bracket today — otherwise a stale-dated archived trip hijacks launch.
  if (!trip || trip.archivedAt) return false
  const start = trip.dateRangeStart
  const end = trip.dateRangeEnd
  if (!start || !end) return false
  return start <= shiftIso(today, LAUNCH_GRACE_DAYS) && shiftIso(today, -LAUNCH_GRACE_DAYS) <= end
}

// Is today STRICTLY inside this trip's window (the trip is live right now)?
function tripWindowContains(trip, today) {
  const s = trip?.dateRangeStart
  const e = trip?.dateRangeEnd
  return !!(s && e && s <= today && today <= e)
}

// Pick the trip to open on launch: the near-now trip (±grace, not archived).
// A trip whose window actually CONTAINS today (live right now) ALWAYS beats a
// grace-only match (an imminent or just-finished trip) — otherwise a trip
// starting in a few days would hijack launch and hide the trip the family is
// actually on. Within each tier the latest startDate wins. Null when none →
// the caller shows the all-trips index rather than any default.
function pickActiveTrip(trips, today = todayIso()) {
  if (!trips || trips.length === 0) return null
  const matches = trips.filter((t) => isNearNow(t, today))
  if (matches.length === 0) return null
  const live = matches.filter((t) => tripWindowContains(t, today))
  const pool = live.length ? live : matches
  return pool.reduce((best, t) =>
    (t.dateRangeStart || '') > (best.dateRangeStart || '') ? t : best
  )
}

export default function App() {
  const [traveler, setTraveler] = useState(readTraveler)
  const [tripId, setTripId] = useState(readRequestedTripId)
  const [view, setView] = useState(() => initialViewFromUrl()) // 'index' | 'trip' | 'stop' | 'settings' | 'new' | 'edit' | 'activities' | 'photos' | 'import' | 'replay' | 'map'
  // Claude-in-App M1: panel state lives at App level so the entry
  // points scattered across views all open the same surface, and the
  // panel's per-trip context falls out of the existing `trip` resolve.
  const [claudeOpen, setClaudeOpen] = useState(false)
  function openClaude() { setClaudeOpen(true) }
  function closeClaude() { setClaudeOpen(false) }
  const tripsApi = useTrips()
  const isIpad = useIsIpad()
  const allTrips = tripsApi.trips
  // Drafts (manual-add, not yet published) never appear in the polished
  // surfaces — not the index, not the trip switcher, not the cold-start
  // pick. They live only in the editor and the Settings → Drafts list.
  // This is what stops a sparse trip from ever rendering in a view.
  // Whole-trip masking (3b): substitute a stand-in for any trip hidden from the
  // active traveler, so a secret trip never shows its real self in their list /
  // active-trip pick / themed views. Author + non-targeted + revealed see the
  // real trip. The worker enforces the same on the sync read (the boundary).
  const visibleTrips = maskTripsForViewer(allTrips.filter((t) => !t.draft), traveler)
  // The author's own unpublished drafts. Drafts are local-only (never synced —
  // see the draft gate in useTrips), so every draft on this device belongs to
  // the person at the keyboard; there is nothing to mask. We surface these on
  // the index (in a clearly-labelled "Drafts" section) so a freshly-created
  // draft doesn't vanish with no way back — the author can reopen, finish, or
  // delete it without first reaching Settings (which the cold-start index made
  // unreachable). This is deliberately NOT folded into visibleTrips: drafts stay
  // out of the trip switcher, the cold-start active-trip pick, and the themed
  // views, exactly as before.
  const ownDrafts = allTrips.filter((t) => t.draft)
  const topBar = topBarTokens(traveler)
  // Jonathan + Rafa + Aurelia are dark; Helen light (the per-person
  // dark-mode toggle was dropped 2026-06-05; Aurelia inverted to dark in
  // increment 3, 2026-06-05). Drives StopDetail/Settings surface.
  const darkSurface = traveler === 'jonathan' || traveler === 'rafa' || traveler === 'aurelia'

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

  // The CSS theme cascade — data-theme = the current person. One fixed
  // palette per person now (Helen's dark variant was dropped 2026-06-05).
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', traveler)
    document.body.setAttribute('data-theme', traveler)
    // Point the installed-app identity (manifest + home-screen icon + title)
    // at this person, so an Add-to-Home-Screen captures THEIR app.
    applyInstallIdentity(traveler)
  }, [traveler])

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
    // Reconnect backstop. iOS Safari (standalone PWA) has NO Background Sync
    // (reg.sync is undefined → registerBackgroundSync no-ops) and fires the
    // `online` event unreliably — sometimes not at all, sometimes before
    // connectivity is truly restored (that drain attempt then fails). So this
    // interval is the only dependable "network's back, drain now" signal on
    // iOS. Keep it short enough that a queued upload clears within seconds of
    // reconnect, not minutes. runDrain early-returns when the queue is empty
    // (a cheap IDB count), so a short idle interval costs almost nothing. Was
    // 120_000 — a 2-minute lag read as "stuck" on a real device.
    const DRAIN_INTERVAL_MS = 20_000

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

    // Share-In's deep link (?action=import) routes itself from the URL;
    // the active-trip cold-load override below must NOT fire for it (its
    // "no trip active today → drop to index" branch would yank the
    // import flow to the trip list).
    if (view.name === 'import') return
    // "Show me, me" gathers photos across all trips, so it must not be
    // bounced to the index when no trip happens to be active today.
    if (view.name === 'showme') return
    // Magic-link setup (013) is a boot-routed, trip-independent action — the
    // active-trip cold-load must not yank it to the trip list.
    if (view.name === 'enroll') return

    const today = todayIso()
    const active = pickActiveTrip(visibleTrips, today)
    const urlTrip = tripId ? visibleTrips.find((t) => t.id === tripId) : null
    // Keep a saved ?trip= ONLY if it's still a near-now, non-archived trip — same
    // rule as the launch pick, so a stale/archived saved trip doesn't pin launch.
    const urlTripIsCurrent = isNearNow(urlTrip, today)

    if (urlTripIsCurrent) return
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

  // THE WEAVE "ready" cue: when the active trip has a pre-made nightly weave
  // newer than the one this device last opened, mark the ✦ entry. Per-device,
  // per-trip, best-effort — no cue when the worker isn't configured or nothing
  // is stored yet (fetchStoredWeave returns null → degrades silently).
  const [weaveReady, setWeaveReady] = useState(false)
  const [bookHasPages, setBookHasPages] = useState(false)
  const [topMenuOpen, setTopMenuOpen] = useState(false) // top-bar overflow (⋯)
  const [composeOpen, setComposeOpen] = useState(false) // share-out Composer (E1) overlay
  // ?compose=1 opens the Composer directly (temp deep-link, like ?surprises=1).
  useEffect(() => {
    try {
      if (new URL(window.location.href).searchParams.get('compose') === '1') setComposeOpen(true)
    } catch { /* ignore */ }
  }, [])
  const weaveGenRef = useRef(0)
  // Surprises (Slice 2). `surpriseTick` recomputes the two cheap derived bits
  // below after a surprise is authored / revealed. Recompute also on view change
  // so creating a surprise then returning re-reads the store. (Declared here,
  // after `trip` above, so the memos can read both.)
  const [surpriseTick, setSurpriseTick] = useState(0)
  const surpriseRevealCue = useMemo(
    () => countUnseenReveals(trip, traveler),
    [trip?.id, traveler, view.name, surpriseTick]
  )
  const watchArrival = useMemo(
    () => hasPendingArrival(trip, traveler, visibleTrips),
    [trip?.id, traveler, view.name, surpriseTick, visibleTrips]
  )
  // Surprise masking on the OPEN-trip render path. `trip` is the RAW trip from
  // allTrips (raw so it can include drafts) — so the themed render must mask it for
  // the current traveler HERE, or the in-app persona switcher on a shared device
  // would show a secret (the worker protects each person's own device; this guards
  // the same-device switch). maskTripForViewer covers BOTH a whole hidden trip (3b
  // — substitutes the stand-in) AND a single hidden stop (Slice 2). No-op for the
  // author / non-targeted / a non-surprise trip (same ref → no extra render).
  const selfMaskedTrip = useMemo(
    () => (trip?.id ? maskTripForViewer(trip, traveler) : trip),
    [trip, traveler, surpriseTick]
  )
  // Slice 3a: a cover-story surprise renders as a real stop on the RECIPIENT's
  // plan. Merge cover stand-ins (from the viewer's masked reads) into the trip
  // the themed views see — one place, so all four inherit it. A no-op for the
  // author / non-targeted (their reads carry no cover stand-ins). Built on the
  // per-stop-masked trip so a hidden stop never reaches the themed views.
  const tripForView = useMemo(
    () => (selfMaskedTrip?.id ? mergeCoverStops(selfMaskedTrip, listMemoriesForTrip(selfMaskedTrip.id, traveler)) : selfMaskedTrip),
    [selfMaskedTrip, traveler, surpriseTick]
  )
  // LiveDock ledge model (NowBar × FamilyDock reconciliation): system-driven
  // by the VIEWED trip + person, rendered above the switcher pills. Uses
  // tripForView so the schedule now/next matches the stops the themed view
  // shows. Recomputed each render (reads the wall clock for now/next).
  const dockLedge = buildLedgeModel({
    trip: tripForView,
    traveler,
    weaveReady,
    surpriseRevealCue,
  })
  // Live-GPS ETA upgrade: when this device is actually ON the trip route (and
  // location was granted via the Live Map — read passively, never prompts), the
  // ledge's now/next become "{heading-to} · ETA {time}" (real traffic-aware
  // drive time). Off-route / no GPS → null → the honest schedule readout stays.
  const liveEta = useLiveEta(tripForView, dockLedge.mode === 'live')
  useEffect(() => {
    setWeaveReady(false)
    setBookHasPages(false)
    weaveGenRef.current = 0
    if (!trip?.id) return
    let cancelled = false
    fetchStoredWeave(trip.id).then((stored) => {
      if (cancelled || !stored?.generatedAt) return
      weaveGenRef.current = stored.generatedAt
      if (stored.generatedAt > getWeaveSeen(trip.id)) setWeaveReady(true)
    })
    // Show the 📖 Book entry only when the trip already has kept pages.
    fetchWeaveBook(trip.id).then(({ pages }) => {
      if (!cancelled) setBookHasPages(pages.length > 0)
    })
    return () => { cancelled = true }
  }, [trip?.id])

  // Resolve the open stop from tripForView (= trip + merged cover stops, 3a) so
  // tapping a cover stop opens its believable detail instead of an empty one.
  // Normal stops are unaffected — mergeCoverStops only appends, never alters them.
  const day = view.name === 'stop' && tripForView ? findDay(tripForView, view.dayN) : null
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
    // Pass the ids already in the store so a brand-new trip whose deterministic
    // slug+month collides with a DIFFERENT existing trip gets a unique suffix
    // instead of silently overwriting it. (A Claude "refine" re-save keeps its
    // own id via the worker's create→edit routing, so this only uniquifies a
    // genuinely new trip.)
    const newTrip = cardToTrip(card, { existingIds: allTrips.map((t) => t.id) })
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
  // REPLAY (increment 1): immersive zoomable spine. Temporary entry point
  // for the DAY-level slice — opens the active trip in the replay surface.
  function openReplay(target) {
    // The trip top-bar button calls this with a click event (no tripId) →
    // open the active trip. The "Looking back" card calls it with
    // { tripId, dayN } → open replay AT that resurfaced day.
    const replayTarget = target && typeof target === 'object' && target.tripId ? target : null
    setView({ name: 'replay', replayTarget })
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  }
  // LIVE MAP: generalized straight-line map + live progress. Temporary
  // entry point (like Replay) — the designed affordance is a redesign
  // question, parked.
  function openMap() {
    setView({ name: 'map' })
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  }
  // "Show me, me" — the on-device face recognizer (Increment C). Opens
  // PersonView, optionally focused on a given person.
  function openShowMe(who) {
    setView({ name: 'showme', who: typeof who === 'string' ? who : null })
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  }
  // THE WEAVE: nightly auto-woven day page. Temporary top-bar entry
  // like Replay + Map — designed affordance TBD.
  function openWeave() {
    // Opening it counts as "seen" — clear the cue and remember the version so
    // it won't re-fire until the next night's weave supersedes it.
    if (trip?.id && weaveGenRef.current) markWeaveSeen(trip.id, weaveGenRef.current)
    setWeaveReady(false)
    setView({ name: 'weave' })
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  }
  // THE BOOK: the trip's kept weave pages. TEMP top-bar entry (like ✦ Weave),
  // shown only when the trip has kept pages.
  function openBook() {
    setView({ name: 'book' })
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  }
  // SURPRISES & MASKING (Slice 1). TEMP entry in the overflow menu like Map /
  // Book — the designed affordance is TBD. Trip-scoped.
  function openSurprises() {
    // Opening Surprises acknowledges any freshly-revealed-for-me items → clears
    // the cue dot. Bump the tick so the dot recomputes to 0.
    markRevealsSeen(trip, traveler)
    setSurpriseTick((t) => t + 1)
    setView({ name: 'surprises' })
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  }
  // SHARE-OUT Phase 2 / Composer (E1). TEMP entry in the overflow menu (designed
  // placement TBD). A bottom-sheet overlay over the current surface — not a view.
  function openCompose() {
    setComposeOpen(true)
  }
  // Navigate on LOCAL-WRITE success, not on sync success. upsertTrip writes
  // the local cache synchronously (the trip is saved on this device the moment
  // it returns) and only then best-effort mirrors to the worker; a failed
  // mirror is queued and auto-retried (lib/tripSyncQueue). A new trip is always
  // a draft (NewTrip sets draft:true), so it never even attempts the worker
  // push — but even for a non-draft, a sync blip must NOT strand the author on
  // the form: the trip is saved locally, so we go straight into the editor and
  // let the sync queue catch up. We only stay put (returning a non-ok result so
  // NewTrip shows its inline error) if upsertTrip itself rejected — i.e. the
  // LOCAL write failed, which is the one case where there's nothing to open.
  async function handleCreateTrip(newTrip) {
    let res
    try {
      res = await tripsApi.upsertTrip(newTrip)
    } catch (err) {
      // upsertTrip swallows worker-push failures (returns ok:false), so a throw
      // here means the local write itself failed — nothing was saved. Surface it.
      return { ok: false, error: err?.message || String(err) }
    }
    // The local write succeeded (cache was written before the push was even
    // attempted), so open the editor regardless of sync state.
    setTripId(newTrip.id)
    setView({ name: 'edit' })
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    return res
  }
  function handleTravelerSwitch(id) {
    setTraveler(id)
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
  }

  // Magic-link enrollment finished (013): the session is stored; adopt the
  // redeemed identity, strip ?enroll so a reload doesn't re-fire, and land
  // in-app. `who` is the traveler the link enrolled.
  function stripEnrollFromUrl() {
    try {
      const url = new URL(window.location.href)
      url.searchParams.delete('enroll')
      window.history.replaceState(null, '', url.toString())
    } catch {
      /* ignore */
    }
  }
  function handleEnrollDone(who, mode) {
    // Adopt the redeemed identity only when YOU opened your OWN link ('link').
    // For 'add' (provisioning another person from Settings, e.g. the shared
    // iPad) stay as the current traveler — don't yank the device to the new one.
    if (who && mode !== 'add') setTraveler(who)
    stripEnrollFromUrl()
    // The enroll boot consumed the one-shot cold-load guard before doing the
    // active-trip pick; re-arm it so the post-enroll index resolves normally.
    coldLoadHandledRef.current = false
    setView({ name: 'index' })
  }
  function handleEnrollCancel() {
    stripEnrollFromUrl() // a cancelled setup must not leave the one-time token in the URL
    setView({ name: 'index' })
  }
  function openEnrollAdd() {
    setView({ name: 'enroll', enrollToken: null })
  }

  // Render the per-traveler themed surface for the active trip
  function renderTripView() {
    if (!trip) return null
    // "Look back further" — completed trips (ended before today), newest first,
    // excluding the open trip + drafts. Feeds the per-person home strip that
    // jumps straight into an older trip's reel via openReplay({tripId}).
    const today = todayIso()
    const pastTrips = (visibleTrips || [])
      .filter(
        (t) =>
          t &&
          !t.draft &&
          !t.masked && // never surface a hidden surprise trip in the strip
          t.id !== trip.id &&
          t.dateRangeEnd &&
          t.dateRangeEnd < today
      )
      .slice()
      .sort((a, b) => (b.dateRangeStart || '').localeCompare(a.dateRangeStart || ''))
    // Rafa's iPad command-center home renders only on iPad-sized screens;
    // phones (and CI's phone-width baselines) keep his RafaView.
    const props = {
      trip: tripForView, // cover stories merged in as stops for the recipient (3a)
      traveler,
      pastTrips,
      onPlayPastTrip: (tripId) => openReplay({ tripId }),
      onOpenStop: openStop,
      onOpenSettings: openSettings,
      onOpenActivities: openActivities,
      onOpenPhotos: openPhotos,
      onOpenAllPhotos: openAllPhotos,
      onOpenImport: openImport,
      onOpenClaude: openClaude,
      onShowMe: openShowMe,
      // Feature entry-points (the per-person home band — entry-points redesign).
      // These retire the temporary ✦/⋯ glyphs into designed, in-view entries.
      onOpenMap: openMap,
      onOpenWeave: openWeave,
      onOpenReplay: () => openReplay(),
      onOpenBook: openBook,
      onOpenSurprises: openSurprises,
      onCompose: openCompose, // "Share a moment" — designed home-band entry (was ⋯-only)
      weaveReady,
      bookHasPages,
      surpriseRevealCue,
    }
    switch (traveler) {
      case 'helen':
        return <HelenView {...props} />
      case 'aurelia':
        return <AureliaView {...props} />
      case 'rafa':
        return isIpad
          ? <RafaPad {...props} />
          : <RafaView {...props} />
      case 'jonathan':
      default:
        return <JonathanView {...props} />
    }
  }

  // Magic-link setup (013) takes the whole screen — it's a fresh-device action,
  // reached by opening a personal link (?enroll) or via Settings → "set up this
  // device". (The post-cutover "you're not set up here" auto-wall is deferred to
  // the close-the-door stage, where it's exercisable + device-tested.)
  if (view.name === 'enroll') {
    return (
      <Enroll
        token={view.enrollToken}
        mode={view.enrollToken ? 'link' : 'add'}
        traveler={traveler}
        onDone={handleEnrollDone}
        onCancel={handleEnrollCancel}
      />
    )
  }

  return (
    <>
      {/* Surprises (Slice 2): arrival-reveal geofence. Mounted ONLY when the
          active traveler has a pending arrival surprise, so location isn't
          engaged otherwise. Reveals fire while the app is foreground. */}
      {watchArrival && (
        <ArrivalRevealWatcher trip={trip} traveler={traveler} trips={visibleTrips} tripsApi={tripsApi} onReveal={() => setSurpriseTick((t) => t + 1)} />
      )}
      {/* Share-out Composer (E1) — a bottom-sheet overlay over the current
          surface; trip-scoped (composes from the open trip's shared photos). */}
      {composeOpen && (tripForView || trip) && (
        <ShareComposer trip={tripForView || trip} traveler={traveler} onClose={() => setComposeOpen(false)} />
      )}
      {/* Top-of-screen trip / index switch — small and editorial, never the focus.
          Hidden in replay / map / weave: those surfaces own their own chrome. */}
      {view.name !== 'index' && view.name !== 'new' && view.name !== 'edit' && view.name !== 'replay' && view.name !== 'map' && view.name !== 'weave' && view.name !== 'book' && view.name !== 'showme' && view.name !== 'surprises' && !(traveler === 'rafa' && isIpad) && (
        <div
          className="px-6"
          data-testid="trip-topbar"
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
              view.name === 'import'
            // On the trip home the title-switcher beside this already names the
            // trip, so the back link is a bare "←" (kept the word only in deep
            // views, where there's no switcher). Avoids the "← TRIPS" label
            // colliding with a long trip title on a phone.
            const label = inDeepView && trip?.title ? `← ${trip.title}` : '←'
            const handler = inDeepView ? () => setView({ name: 'trip' }) : openIndex
            // Deep views already name the destination in the link text (a fine
            // a11y name); only the trip-home bare "←" needs an explicit label.
            const backAria = inDeepView ? undefined : 'Back to trips'
            return (
              <button
                type="button"
                onClick={handler}
                aria-label={backAria}
                style={{
                  background: 'transparent',
                  border: 0,
                  padding: '4px 2px',
                  cursor: 'pointer',
                  minWidth: 0,
                  flex: '0 0 auto',
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
            // Wrapper clips the native <select> — iOS selects don't reliably
            // flex-shrink or ellipsize their own text, so an overflow-hidden
            // flex parent is what actually keeps a long title from spilling
            // over the back arrow / actions.
            <div style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', display: 'flex' }}>
              <select
                value={trip?.id || ''}
                onChange={(e) => openTrip(e.target.value)}
                aria-label="Switch trip"
                style={{
                  background: 'transparent',
                  border: 0,
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 10,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  opacity: topBar.opacity,
                  color: topBar.text,
                  width: '100%',
                  maxWidth: '100%',
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  textAlign: 'left',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                }}
              >
                {visibleTrips.map((t) => (
                  <option key={t.id} value={t.id} style={{ color: '#1A1614' }}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>
          )}
          {/* Modify-with-Claude stays visible — it's the primary trip action.
              Replay / Map / Book / Settings live in the ⋯ overflow menu below
              so the bar stays uncrowded + pressable on a phone. */}
          {trip && (
            <ClaudeEntryButton onClick={openClaude} label="Modify this trip with Claude" />
          )}
          {/* The Weave's top-bar entry has retired: every persona now reaches
              it from their designed home band (and Rafa's phone from his
              "Tonight's story" tile), so the temp braid button is gone. The
              weave-ready cue lives on the band's WeaveReady now. */}
          {/* Overflow menu — the secondary entries collapse here so the bar
              stays uncrowded + pressable on a phone. */}
          <div style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setTopMenuOpen((o) => !o)}
              aria-label="More"
              aria-haspopup="menu"
              aria-expanded={topMenuOpen}
              style={{
                background: 'transparent',
                border: 0,
                padding: '4px 6px',
                cursor: 'pointer',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 15,
                lineHeight: 1,
                opacity: topBar.opacity,
                color: topBar.text,
              }}
            >
              ⋯
            </button>
            {surpriseRevealCue > 0 && (
              <span
                aria-label="A surprise was revealed"
                style={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  pointerEvents: 'none',
                }}
              />
            )}
            {topMenuOpen && (
              <>
                {/* tap-anywhere-to-close backdrop */}
                <div
                  aria-hidden="true"
                  data-testid="top-menu-backdrop"
                  onClick={() => setTopMenuOpen(false)}
                  style={{ position: 'fixed', inset: 0, zIndex: 41 }}
                />
                <div
                  role="menu"
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: 8,
                    zIndex: 42,
                    minWidth: 188,
                    padding: 5,
                    background: 'var(--card, var(--bg))',
                    border: '1px solid var(--border)',
                    borderRadius: 14,
                    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.22)',
                  }}
                >
                  {[
                    ...(trip
                      ? [
                          { label: 'Replay', glyph: '▶', onClick: () => openReplay() },
                          { label: 'Live map', glyph: '▣', onClick: openMap },
                          { label: 'Surprises', glyph: '🎁', onClick: openSurprises },
                          { label: 'Share a moment', glyph: '🖼', onClick: openCompose },
                        ]
                      : []),
                    ...(trip && bookHasPages ? [{ label: 'The book', glyph: '❏', onClick: openBook }] : []),
                    // "Show me, me" — the on-device face recognizer. Aurelia +
                    // Rafa reach it from their designed home tiles; this overflow
                    // entry is how Jonathan, Helen, and phone-Rafa reach the
                    // shipped feature (it gathers photos across all trips, so it
                    // doesn't require an active trip).
                    { label: 'Show me, me', glyph: '◎', onClick: () => openShowMe() },
                    { label: 'Settings', glyph: '⚙', onClick: openSettings },
                  ].map((it) => (
                    <button
                      key={it.label}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setTopMenuOpen(false)
                        it.onClick()
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 11,
                        width: '100%',
                        minHeight: 44,
                        padding: '0 12px',
                        background: 'transparent',
                        border: 0,
                        borderRadius: 9,
                        cursor: 'pointer',
                        color: 'var(--text)',
                        fontFamily: 'var(--font-body)',
                        fontSize: 14.5,
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ width: 18, textAlign: 'center', color: 'var(--muted)' }}>
                        {it.glyph}
                      </span>
                      {it.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div key={`${view.name}-${tripId}-${traveler}`}>
        {view.name === 'index' && (
          <TripIndex
            traveler={traveler}
            trips={visibleTrips}
            drafts={ownDrafts}
            onOpenTrip={openTrip}
            onNewTrip={openNewTrip}
            onEditDraft={openEditor}
            onDeleteDraft={(id) => tripsApi.removeTrip(id)}
            onResurfaceReplay={(tripId, dayN) => openReplay({ tripId, dayN })}
            onOpenSettings={openSettings}
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
        {view.name === 'photos' && trip && (
          <PhotosView
            trip={trip}
            traveler={traveler}
            onBack={() => setView({ name: 'trip' })}
            tripsApi={tripsApi}
          />
        )}
        {view.name === 'all-photos' && trip && (
          <AllPhotosView
            trips={visibleTrips}
            traveler={traveler}
            onBack={() => setView({ name: 'trip' })}
            onPlayTrip={(tripId) => openReplay({ tripId })}
          />
        )}
        {view.name === 'replay' && (view.replayTarget || (trip && !trip.draft)) && (
          <ReplayView
            trip={trip}
            trips={visibleTrips}
            traveler={traveler}
            initial={view.replayTarget}
            onExit={() => setView({ name: trip && !trip.draft ? 'trip' : 'index' })}
          />
        )}
        {view.name === 'map' && trip && !trip.draft && (
          <MapView
            trip={trip}
            traveler={traveler}
            onBack={() => setView({ name: 'trip' })}
          />
        )}
        {view.name === 'weave' && (
          <TheWeave
            trip={trip}
            trips={visibleTrips}
            traveler={traveler}
            onBack={() => setView({ name: trip && !trip.draft ? 'trip' : 'index' })}
          />
        )}
        {view.name === 'book' && (
          <WeaveBook
            trip={trip}
            trips={visibleTrips}
            traveler={traveler}
            onBack={() => setView({ name: trip && !trip.draft ? 'trip' : 'index' })}
          />
        )}
        {view.name === 'surprises' && (
          <SurprisesView
            trip={selfMaskedTrip}
            trips={allTrips}
            traveler={traveler}
            tripsApi={tripsApi}
            onClose={() => { setSurpriseTick((t) => t + 1); setView({ name: trip && !trip.draft ? 'trip' : 'index' }) }}
          />
        )}
        {view.name === 'showme' && (
          <Suspense fallback={null}>
            <PersonView
              trip={trip}
              trips={visibleTrips}
              traveler={traveler}
              initialWho={view.who}
              onClose={() => setView({ name: trip && !trip.draft ? 'trip' : 'index' })}
            />
          </Suspense>
        )}
        {/* Settings is reachable from the cold-start index (a member between
            trips needs to change traveler / pull / seed). When no trip is
            active today, fall back to any visible trip so the "Trip Settings"
            panel still renders — and send its back link to the index rather
            than a trip view that isn't there. */}
        {view.name === 'settings' && (trip || visibleTrips.find((t) => !t.masked) || visibleTrips[0]) && (
          <Settings
            trip={trip || visibleTrips.find((t) => !t.masked) || visibleTrips[0]}
            traveler={traveler}
            dark={darkSurface}
            tripsApi={tripsApi}
            onBack={() => setView({ name: trip && !trip.draft ? 'trip' : 'index' })}
            onChangeTraveler={handleTravelerSwitch}
            onOpenEditor={openEditor}
            onOpenIdentity={() => setView({ name: 'identity' })}
            onOpenEnroll={openEnrollAdd}
          />
        )}
        {view.name === 'identity' && (
          <InstallIdentity
            traveler={traveler}
            onClose={() => setView({ name: 'settings' })}
          />
        )}
      </div>

      {/* Bottom switcher visible everywhere except a few full-bleed surfaces.
          It now ALSO shows on the index: a member who lands here between trips
          (default persona, nothing active today) was otherwise stuck with no
          way to switch person — the persona pills are the unstick. On the index
          there's no active trip, so the dock is just the plain pills (ledge
          'none'), never the live ledge. Still hidden on new/edit (the author is
          mid-create) and the immersive replay/map/identity surfaces. */}
      {view.name !== 'new' && view.name !== 'edit' && view.name !== 'replay' && view.name !== 'map' && view.name !== 'identity' && (
        <Switcher
          active={traveler}
          onSwitch={handleTravelerSwitch}
          // The index is a between-trips surface — show only the persona pills,
          // never the live ledge (which belongs to an open trip). Everywhere
          // else the system-driven ledge model decides.
          ledge={view.name === 'index' ? 'none' : dockLedge.mode}
          now={liveEta?.now ?? dockLedge.now}
          next={liveEta?.next ?? dockLedge.next}
          cueKind={view.name === 'index' ? null : dockLedge.cueKind}
          onLedge={openMap}
          onCue={() =>
            dockLedge.cueKind === 'surprise-revealed' ? openSurprises() : openWeave()
          }
        />
      )}

      {/* Claude-in-App M1 — floating entry on the trips index.
          Bottom-right, lifted ABOVE the persona dock now that the dock also
          shows on the index (≈64px tall + safe area), so the FAB clears the
          pills instead of overlapping them. The in-trip entry lives in the
          fixed top bar above. */}
      {view.name === 'index' && (
        <div
          style={{
            position: 'fixed',
            right: 'max(18px, env(safe-area-inset-right))',
            bottom: 'calc(max(24px, env(safe-area-inset-bottom)) + 72px)',
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
