import { useState } from 'react'
import { ChevronLeft, Calendar, Image as ImageIcon, RotateCcw, Moon, Sun, Cloud, CloudOff, RefreshCw } from 'lucide-react'
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
export function Settings({ trip, traveler, dark, helenDark, onToggleHelenDark, onBack, onChangeTraveler }) {
  const ck = useCloudKitAuth()
  const [syncMsg, setSyncMsg] = useState(null)
  const [syncing, setSyncing] = useState(false)

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
          <a
            className="link-quiet f-news text-base"
            href={trip.sharedAlbumURL}
            target="_blank"
            rel="noreferrer"
          >
            Open in iCloud Photos →
          </a>
        ) : (
          <p className="f-news text-base leading-relaxed opacity-80 max-w-prose">
            No iCloud Shared Album linked yet. Helen creates the album in Photos, enables Public
            Website, then pastes the URL into the trip record. (Manual entry form will land in the
            next pass.)
          </p>
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
                <RefreshCw size={12} /> {syncing ? 'Pulling…' : 'Pull from iCloud'}
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
