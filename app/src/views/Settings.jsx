import { useState } from 'react'
import { ChevronLeft, Calendar, Image as ImageIcon, RotateCcw, Moon, Sun, Cloud, CloudOff, RefreshCw, ExternalLink, Check, Upload } from 'lucide-react'
import { TRAVELERS, TRAVELER_ORDER } from '../data/travelers'
import { downloadIcs } from '../lib/icsExport'
import { useCloudKitAuth } from '../hooks/useCloudKitAuth'
import { CLOUDKIT_META } from '../lib/cloudkit'
import { pullAll } from '../lib/cloudKitSync'
import { mergeFromRemote } from '../lib/memoryStore'

// Per-trip settings panel: calendar export, shared album link, identity reset.
// CloudKit sync, screenshot ingestion, and Gmail wiring will live here too.
//
// helenDark / onToggleHelenDark come from App so the toggle here and the
// surface theming there share a single source of truth — calling
// useHelenDark() locally gave each consumer its own state, so flipping
// it inside Settings didn't update the surface class App computes.
export function Settings({ trip, traveler, dark, helenDark, onToggleHelenDark, tripsApi, onBack, onChangeTraveler }) {
  const ck = useCloudKitAuth()
  const [syncMsg, setSyncMsg] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [seedMsg, setSeedMsg] = useState(null)
  const [seeding, setSeeding] = useState(false)
  const [albumDraft, setAlbumDraft] = useState(trip?.sharedAlbumURL || '')
  const [albumSaving, setAlbumSaving] = useState(false)
  const [albumSavedTick, setAlbumSavedTick] = useState(0)

  async function runPull() {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const remote = await pullAll()
      const merged = mergeFromRemote(remote)
      setSyncMsg(`Pulled ${remote.length} record${remote.length === 1 ? '' : 's'}; ${merged} merged into local cache.`)
    } catch (err) {
      setSyncMsg(`Pull failed: ${err?.message || String(err)}`)
    } finally {
      setSyncing(false)
    }
  }

  async function runSeed() {
    if (!tripsApi?.seed) return
    setSeeding(true)
    setSeedMsg(null)
    try {
      const result = await tripsApi.seed()
      if (result.reason === 'unconfigured') {
        setSeedMsg('CloudKit not configured — nothing to seed.')
      } else {
        setSeedMsg(
          result.pushed === 0
            ? 'iCloud already has every seed trip — nothing to do.'
            : `Pushed ${result.pushed} trip${result.pushed === 1 ? '' : 's'} to iCloud.`
        )
      }
    } catch (err) {
      setSeedMsg(`Seed failed: ${err?.message || String(err)}`)
    } finally {
      setSeeding(false)
    }
  }

  async function saveAlbumUrl() {
    if (!tripsApi?.saveTrip) return
    const trimmed = albumDraft.trim()
    setAlbumSaving(true)
    try {
      await tripsApi.saveTrip({ ...trip, sharedAlbumURL: trimmed })
      setAlbumSavedTick((t) => t + 1)
    } finally {
      setAlbumSaving(false)
    }
  }

  async function clearAlbumUrl() {
    setAlbumDraft('')
    if (!tripsApi?.saveTrip) return
    setAlbumSaving(true)
    try {
      await tripsApi.saveTrip({ ...trip, sharedAlbumURL: '' })
      setAlbumSavedTick((t) => t + 1)
    } finally {
      setAlbumSaving(false)
    }
  }

  return (
    <div className={`min-h-screen pb-32 ${dark ? 'surface-dark' : 'surface-light'}`}>
      <header className="px-6 pt-6 pb-6 border-b surface-rule">
        <button
          onClick={onBack}
          className="link-quiet flex items-center gap-1 f-dm text-xs opacity-70"
          style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 0, marginBottom: 24 }}
          type="button"
        >
          <ChevronLeft size={14} /> Back
        </button>
        <h1 className="f-news tt-tightest text-4xl leading-95">Trip Settings</h1>
        <p className="f-news-i text-base opacity-60 mt-2">{trip.title}</p>
      </header>

      <section className="px-6 py-8 border-b surface-rule">
        <div className="flex items-center gap-2 mb-3">
          <Calendar size={14} />
          <p className="smallcaps f-dm text-[11px] opacity-70">Calendar</p>
        </div>
        <p className="f-news text-base leading-relaxed opacity-80 mb-4 max-w-prose">
          Subscribe to the trip on your calendar app — one event per stop, all-day for travel
          legs. iOS handles updates automatically.
        </p>
        <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-pill" type="button" onClick={() => downloadIcs(trip)}>
            Export full trip .ics
          </button>
          <button className="btn-pill" type="button" onClick={() => downloadIcs(trip, traveler)}>
            Export {TRAVELERS[traveler]?.name}-only .ics
          </button>
        </div>
      </section>

      <section className="px-6 py-8 border-b surface-rule">
        <div className="flex items-center gap-2 mb-3">
          <ImageIcon size={14} />
          <p className="smallcaps f-dm text-[11px] opacity-70">Shared album</p>
        </div>
        {trip.sharedAlbumURL ? (
          <>
            <a
              className="link-quiet f-news text-base inline-flex items-center gap-1"
              href={trip.sharedAlbumURL}
              target="_blank"
              rel="noreferrer"
            >
              Open in iCloud Photos <ExternalLink size={12} />
            </a>
            <p className="f-mono text-[10px] opacity-50 mt-2 break-all">
              {trip.sharedAlbumURL}
            </p>
            <div className="flex mt-3" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-pill"
                onClick={clearAlbumUrl}
                disabled={albumSaving}
              >
                Replace URL
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="f-news text-base leading-relaxed opacity-80 max-w-prose mb-4">
              The Shared Album is the family's photo backbone — Helen creates one
              album in Photos, enables Public Website, and pastes the URL below.
              Anyone with the link can view photos in a browser without an Apple
              ID; family members on iOS see the album natively in Photos.
            </p>
            <ol
              className="f-news text-base leading-relaxed opacity-80 max-w-prose"
              style={{ paddingLeft: 24, display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              <li>
                Open Photos on your Mac or iPhone. Select the photos you want in
                the album, tap <em>Share</em> → <em>Shared Album</em> → <em>New Shared Album</em>.
                Name it something memorable like
                <span className="f-mono text-[12px] mx-1 px-1 rounded" style={{ background: 'var(--bg2)' }}>
                  {trip.title}
                </span>.
              </li>
              <li>
                Once the album exists, open it and tap <em>Subscribers</em> (or the
                people icon). Enable <strong>Public Website</strong> — Photos
                generates a long iCloud share URL that starts with{' '}
                <span className="f-mono text-[12px]">https://www.icloud.com/sharedalbum/</span>.
              </li>
              <li>
                Tap <em>Share Link</em>, copy the URL, and paste it into the field
                below. The trip's photo backbone is live the moment you save.
              </li>
            </ol>
            <div className="flex mt-5" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="url"
                inputMode="url"
                placeholder="https://www.icloud.com/sharedalbum/…"
                value={albumDraft}
                onChange={(e) => setAlbumDraft(e.target.value)}
                className="memory-textarea"
                style={{ flex: 1, minWidth: 240, minHeight: 'auto', padding: 10, fontSize: 13, fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}
                aria-label="iCloud shared album URL"
              />
              <button
                type="button"
                className="btn-pill"
                onClick={saveAlbumUrl}
                disabled={!albumDraft.trim() || albumSaving}
                style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
              >
                {albumSaving ? <RefreshCw size={12} /> : <Check size={12} />}
                {albumSaving ? 'Saving…' : 'Save link'}
              </button>
            </div>
            {albumSavedTick > 0 && (
              <p className="f-dm text-[12px] opacity-60 mt-2 italic">
                Cleared. Paste the new URL above.
              </p>
            )}
            <p className="f-dm text-[11px] opacity-50 mt-3 max-w-prose italic">
              Apple's docs:{' '}
              <a
                className="link-quiet"
                href="https://support.apple.com/guide/photos/share-photos-and-videos-pht7a4c4d4ed/mac"
                target="_blank"
                rel="noreferrer"
              >
                Share photos and videos with Shared Albums →
              </a>
            </p>
          </>
        )}
      </section>

      {traveler === 'helen' && (
        <section className="px-6 py-8 border-b surface-rule">
          <div className="flex items-center gap-2 mb-3">
            {helenDark ? <Moon size={14} /> : <Sun size={14} />}
            <p className="smallcaps f-dm text-[11px] opacity-70">Appearance</p>
          </div>
          <p className="f-dm text-sm opacity-70 mb-3 max-w-prose">
            Light archive by default. Dark mode pulls the photos forward and lets the oxblood
            accents do more work.
          </p>
          <button
            type="button"
            className="btn-pill"
            onClick={onToggleHelenDark}
            style={{
              background: helenDark ? '#14110D' : 'transparent',
              color: helenDark ? '#F2EBDA' : 'inherit',
              borderColor: helenDark ? '#14110D' : 'currentColor',
            }}
          >
            {helenDark ? <Moon size={12} /> : <Sun size={12} />}
            {helenDark ? 'Dark mode on' : 'Switch to dark mode'}
          </button>
        </section>
      )}

      <section className="px-6 py-8 border-b surface-rule">
        <div className="flex items-center gap-2 mb-3">
          <RotateCcw size={14} />
          <p className="smallcaps f-dm text-[11px] opacity-70">Who you are</p>
        </div>
        <p className="f-dm text-sm opacity-70 mb-3">
          The default view is whoever you signed in as. Tap to change.
        </p>
        <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
          {TRAVELER_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              className="btn-pill"
              style={{
                background: traveler === id ? TRAVELERS[id].color : 'transparent',
                color: traveler === id ? '#FBF8F2' : 'inherit',
                borderColor: traveler === id ? TRAVELERS[id].color : 'currentColor',
              }}
              onClick={() => onChangeTraveler(id)}
            >
              {TRAVELERS[id].name}
            </button>
          ))}
        </div>
      </section>

      <section className="px-6 py-8 border-b surface-rule">
        <div className="flex items-center gap-2 mb-3">
          {ck.state === 'signedIn' ? <Cloud size={14} /> : <CloudOff size={14} />}
          <p className="smallcaps f-dm text-[11px] opacity-70">iCloud sync</p>
        </div>
        <p className="f-dm text-sm opacity-70 mb-3 max-w-prose">
          Memories save locally first, then mirror to CloudKit so the four
          family Apple IDs see the same thread. Container{' '}
          <span className="f-mono text-[11px]">{CLOUDKIT_META.container || '—'}</span>,{' '}
          environment{' '}
          <span className="f-mono text-[11px]">{CLOUDKIT_META.environment}</span>.
        </p>
        {/*
          Apple's SDK looks for the element whose id matches the
          `signInButton.id` we passed to CK.configure (see lib/cloudkit.js)
          and mounts its own button into it. The mount happens once, soon
          after setUpAuth() resolves — so the element has to be in the DOM
          before the hook runs, not behind a state-dependent conditional.
          We render it unconditionally and just hide it when the user is
          signed in or CloudKit isn't reachable.
        */}
        <div
          id="apple-sign-in"
          style={{
            display: ck.state === 'signedOut' ? 'block' : 'none',
            marginBottom: 8,
          }}
        />
        {ck.state === 'unconfigured' && (
          <p className="f-dm text-sm" style={{ color: 'var(--accent)' }}>
            CloudKit env vars not present in the bundle.
          </p>
        )}
        {ck.state === 'loading' && (
          <p className="f-dm text-sm opacity-70">Connecting to iCloud…</p>
        )}
        {ck.state === 'error' && (
          <>
            <p className="f-dm text-sm" style={{ color: 'var(--accent)' }}>
              CloudKit error: {ck.error || 'unknown'}.
            </p>
            <p className="f-dm text-[12px] opacity-60 mt-2 max-w-prose">
              Most often this means the dev origin isn't whitelisted in the CloudKit dashboard,
              or Safari is blocking the iCloud auth cookie. Check the console for the raw error.
            </p>
            <button
              type="button"
              className="btn-pill mt-3"
              onClick={ck.refresh}
            >
              <RefreshCw size={12} /> Retry
            </button>
          </>
        )}
        {ck.state === 'signedOut' && (
          <p className="f-dm text-[12px] opacity-60 mt-1 max-w-prose">
            Uses your iCloud account. Sign-in opens an Apple popup and
            never sees your password.
          </p>
        )}
        {ck.state === 'signedIn' && (
          <>
            <p className="f-dm text-sm opacity-70 mb-3">
              Signed in as{' '}
              <span className="f-mono text-[11px]">
                {ck.user?.userRecordName || 'iCloud user'}
              </span>
              .
            </p>
            <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-pill"
                onClick={runPull}
                disabled={syncing}
              >
                <RefreshCw size={12} /> {syncing ? 'Pulling…' : 'Pull memories'}
              </button>
              <button
                type="button"
                className="btn-pill"
                onClick={runSeed}
                disabled={seeding}
                title="Push the bundled Jackson + NYC trips to iCloud. Idempotent — re-running only adds anything that's missing."
              >
                <Upload size={12} /> {seeding ? 'Seeding…' : 'Seed trips to iCloud'}
              </button>
              <button
                type="button"
                className="btn-pill"
                onClick={ck.signOut}
              >
                Sign out
              </button>
            </div>
            {syncMsg && (
              <p className="f-dm text-[12px] opacity-70 mt-3 italic">{syncMsg}</p>
            )}
            {seedMsg && (
              <p className="f-dm text-[12px] opacity-70 mt-3 italic">{seedMsg}</p>
            )}
            <p className="f-dm text-[11px] opacity-50 mt-3 max-w-prose italic">
              Trips currently sourced from{' '}
              <span className="f-mono text-[10px]">{tripsApi?.source || 'unknown'}</span>
              {' · '}
              {tripsApi?.trips?.length || 0} trip
              {(tripsApi?.trips?.length || 0) === 1 ? '' : 's'} loaded.
            </p>
          </>
        )}
      </section>

      <section className="px-6 py-8">
        <p className="smallcaps f-dm text-[11px] opacity-70 mb-3">Coming next</p>
        <ul className="f-news text-base leading-relaxed opacity-80" style={{ paddingLeft: 18 }}>
          <li>Screenshot ingestion via Claude API (needs API key + Worker proxy).</li>
          <li>Gmail ingestion (Pass 2, OAuth client already provisioned).</li>
          <li>FlightAware AeroAPI live data (needs Cloudflare Worker proxy).</li>
        </ul>
      </section>
    </div>
  )
}
