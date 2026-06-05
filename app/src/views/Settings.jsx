import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Calendar, RotateCcw, Cloud, CloudOff, RefreshCw, Check, Upload, FileText, Pencil, Trash2, Terminal, Archive, Smartphone } from 'lucide-react'
import { TRAVELERS, TRAVELER_ORDER, TRAVELER_DOT } from '../data/travelers'
import { AppIcon } from '../components/AppIcon'
import { APP_IDENTITY, getSticker } from '../data/appIdentity'
import { downloadIcs } from '../lib/icsExport'
import {
  pullAll,
  pushMemory,
  pingWorker,
  isWorkerConfigured,
  WORKER_META,
} from '../lib/workerSync'
import { listAllLocalMemories, mergeFromRemote } from '../lib/memoryStore'
import {
  clearUploadLog,
  isDevModeEnabled,
  readUploadLog,
  uploadLogAsText,
  uploadLogHistogram,
} from '../lib/uploadLog'

// Per-trip settings panel: calendar export, traveler-picker, sync status.
// Sync goes to a Cloudflare Worker (D1 + R2) authenticated by a
// per-traveler family token; the panel surfaces synced / syncing /
// offline + Pull / Push / Seed actions. (Helen's dark-mode toggle was
// removed 2026-06-05 — dark mode dropped as a per-person axis.)

export function Settings({ trip, traveler, dark, tripsApi, onBack, onChangeTraveler, onOpenEditor, onOpenIdentity }) {
  const [workerStatus, setWorkerStatus] = useState({
    status: isWorkerConfigured() ? 'syncing' : 'unconfigured',
    traveler: null,
    message: null,
  })
  const [syncMsg, setSyncMsg] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [seedMsg, setSeedMsg] = useState(null)
  const [forcePushing, setForcePushing] = useState(false)
  const [forcePushMsg, setForcePushMsg] = useState(null)
  const [seeding, setSeeding] = useState(false)
  const [pushAllState, setPushAllState] = useState({ status: 'idle', message: null })
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [archiving, setArchiving] = useState(false)

  const drafts = (tripsApi?.trips || []).filter((t) => t.draft)

  // Ping the Worker on mount and whenever the active traveler changes
  // (the bearer token swaps with traveler).
  useEffect(() => {
    if (!isWorkerConfigured()) {
      setWorkerStatus({ status: 'unconfigured', traveler: null, message: null })
      return
    }
    let cancelled = false
    setWorkerStatus((s) => ({ ...s, status: 'syncing' }))
    pingWorker().then((r) => {
      if (cancelled) return
      if (r.ok) {
        setWorkerStatus({ status: 'synced', traveler: r.traveler, message: null })
      } else {
        setWorkerStatus({ status: 'offline', traveler: null, message: r.reason })
      }
    })
    return () => {
      cancelled = true
    }
  }, [traveler])

  async function runPull() {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const remote = await pullAll()
      const merged = mergeFromRemote(remote)
      let msg = `Pulled ${remote.length} record${remote.length === 1 ? '' : 's'}; ${merged} merged into local cache.`
      if (remote.errors?.length) {
        msg += ` · errors: ${remote.errors.join(' · ')}`
      }
      setSyncMsg(msg)
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
        setSeedMsg('Worker not configured — nothing to seed.')
      } else if (result.pushed === 0) {
        setSeedMsg('Worker already has every seed trip — nothing to do.')
      } else {
        setSeedMsg(`Pushed ${result.pushed} trip${result.pushed === 1 ? '' : 's'} to the Worker.`)
      }
    } catch (err) {
      setSeedMsg(`Seed failed: ${err?.message || String(err)}`)
    } finally {
      setSeeding(false)
    }
  }

  async function runForcePushSeed() {
    if (!tripsApi?.forcePushSeed) return
    const confirmed = window.confirm(
      'This overwrites every trip on the Worker with the bundled seed. Use when the seed file picked up an update (a keypad code, a corrected stop time) and you want it on everyone\'s phones. Any in-app edits to those trips are lost. Continue?'
    )
    if (!confirmed) return
    setForcePushing(true)
    setForcePushMsg(null)
    try {
      const result = await tripsApi.forcePushSeed()
      if (result.reason === 'unconfigured') {
        setForcePushMsg('Worker not configured — nothing pushed.')
      } else if (result.errors?.length) {
        setForcePushMsg(`Pushed ${result.pushed}, but had errors: ${result.errors.join(' · ')}`)
      } else {
        setForcePushMsg(`Overwrote ${result.pushed} trip${result.pushed === 1 ? '' : 's'} on the Worker with the bundled seed.`)
      }
    } catch (err) {
      setForcePushMsg(`Push failed: ${err?.message || String(err)}`)
    } finally {
      setForcePushing(false)
    }
  }

  async function runPushAll() {
    setPushAllState({ status: 'running', message: null })
    try {
      const records = listAllLocalMemories(traveler)
      let ok = 0
      let failed = 0
      let firstError = null
      for (const m of records) {
        try {
          const r = await pushMemory(m)
          if (r === false) {
            failed += 1
          } else {
            ok += 1
          }
        } catch (err) {
          failed += 1
          if (!firstError) firstError = err?.message || String(err)
        }
      }
      setPushAllState({
        status: 'done',
        message: `Pushed ${ok}/${records.length} memories${failed ? ` · ${failed} failed` : ''}${firstError ? ` · first error: ${firstError}` : ''}.`,
      })
    } catch (err) {
      setPushAllState({ status: 'error', message: err?.message || String(err) })
    }
  }

  // Mark as archived / unarchive — a soft, reversible label, NOT a lock.
  // Archiving stamps `archivedAt` (which effectiveStatus + the trip-list
  // grouping honor regardless of date) and pins `status: 'archived'` for
  // the dateless case. Unarchiving clears `archivedAt` and resets status
  // so a dateless trip doesn't stay stuck archived; dated trips just fall
  // back to their date-derived status. The trip stays fully editable
  // either way.
  async function toggleArchive() {
    if (!tripsApi?.upsertTrip) return
    setArchiving(true)
    try {
      if (trip.archivedAt) {
        await tripsApi.upsertTrip({ ...trip, archivedAt: null, status: 'planning' })
      } else {
        await tripsApi.upsertTrip({
          ...trip,
          status: 'archived',
          archivedAt: new Date().toISOString(),
        })
      }
    } finally {
      setArchiving(false)
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

      {drafts.length > 0 && (
        <section className="px-6 py-8 border-b surface-rule">
          <div className="flex items-center gap-2 mb-3">
            <FileText size={14} />
            <p className="smallcaps f-dm text-[11px] opacity-70">
              Drafts ({drafts.length})
            </p>
          </div>
          <p className="f-dm text-sm opacity-70 mb-4 max-w-prose">
            Trips you started but haven't published. They don't appear in
            the trip list or anyone's view until you publish them from the
            editor. Duplicates can be deleted here.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {drafts.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between"
                style={{
                  gap: 10,
                  padding: '10px 12px',
                  border: '1px solid var(--border, #DDD3C2)',
                  borderRadius: 10,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <p className="f-news text-base leading-tight" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.title || 'Untitled trip'}
                  </p>
                  <p className="f-mono text-[10px] opacity-50 mt-1" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.dateRange || 'dates TBD'} · {d.id}
                  </p>
                </div>
                <div className="flex" style={{ gap: 6, flexShrink: 0 }}>
                  <button
                    type="button"
                    className="btn-pill"
                    onClick={() => onOpenEditor?.(d.id)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}
                  >
                    <Pencil size={12} /> Edit
                  </button>
                  {confirmDeleteId === d.id ? (
                    <>
                      <button
                        type="button"
                        className="btn-pill"
                        onClick={async () => {
                          setConfirmDeleteId(null)
                          await tripsApi.removeTrip(d.id)
                        }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#fff', background: '#8B2B1F', borderColor: '#8B2B1F' }}
                      >
                        <Trash2 size={12} /> Confirm
                      </button>
                      <button
                        type="button"
                        className="btn-pill"
                        onClick={() => setConfirmDeleteId(null)}
                        style={{ fontSize: 12 }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn-pill"
                      onClick={() => setConfirmDeleteId(d.id)}
                      aria-label={`Delete draft ${d.title || d.id}`}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#8B2B1F' }}
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

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
          <Archive size={14} />
          <p className="smallcaps f-dm text-[11px] opacity-70">Archive</p>
        </div>
        <p className="f-news text-base leading-relaxed opacity-80 mb-4 max-w-prose">
          {trip.archivedAt
            ? 'This trip is archived — filed under its month in the trip list, out of the way of what comes next. Nothing is locked; it stays fully editable.'
            : 'Archiving files this trip under its month in the trip list, below your upcoming plans. It stays fully editable — unarchive any time.'}
        </p>
        <button
          type="button"
          className="btn-pill"
          onClick={toggleArchive}
          disabled={archiving}
          data-testid="archive-toggle"
          style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Archive size={14} />
          {archiving ? 'Saving…' : trip.archivedAt ? 'Unarchive this trip' : 'Mark as archived'}
        </button>
        {trip.archivedAt && (
          <p className="f-mono text-[10px] opacity-50 mt-3">
            archived {new Date(trip.archivedAt).toLocaleDateString()}
          </p>
        )}
      </section>

      {/* The "Shared album" section that lived here predated the
          Cloudflare Worker sync stack — it walked the family through
          creating an Apple Photos Shared Album, enabling Public
          Website, and pasting the iCloud share URL. Post-CloudKit
          retirement, photos sync through the Worker + R2 (see the
          "sync" section below); the Apple flow is dead. Removed per
          KNOWN_BUGS_HELEN_SURFACE.md P1.7. The `sharedAlbumURL` field
          stays in the schema for backward compatibility (TripEditor
          still surfaces it for explicit edits). */}

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
                background: traveler === id ? TRAVELER_DOT[id] : 'transparent',
                color: traveler === id ? '#FBF8F2' : 'inherit',
                borderColor: traveler === id ? TRAVELER_DOT[id] : 'currentColor',
              }}
              onClick={() => onChangeTraveler(id)}
            >
              {TRAVELERS[id].name}
            </button>
          ))}
        </div>
      </section>

      {onOpenIdentity && (
        <section className="px-6 py-8 border-b surface-rule">
          <div className="flex items-center gap-2 mb-3">
            <Smartphone size={14} />
            <p className="smallcaps f-dm text-[11px] opacity-70">Your home-screen app</p>
          </div>
          <button
            type="button"
            onClick={onOpenIdentity}
            data-testid="open-identity"
            className="flex items-center"
            style={{ gap: 14, width: '100%', background: 'transparent', border: 0, cursor: 'pointer', textAlign: 'left', padding: 0, color: 'inherit' }}
          >
            <AppIcon id={traveler} size={44} emblem={getSticker(traveler)} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="f-dm text-sm" style={{ fontWeight: 600 }}>{APP_IDENTITY[traveler]?.app}</div>
              <div className="f-dm text-xs opacity-70">Make it yours — pick your sticker</div>
            </div>
            <ChevronRight size={16} style={{ opacity: 0.5 }} />
          </button>
        </section>
      )}

      <section className="px-6 py-8 border-b surface-rule">
        <div className="flex items-center gap-2 mb-3">
          {workerStatus.status === 'synced' ? <Cloud size={14} /> : <CloudOff size={14} />}
          <p className="smallcaps f-dm text-[11px] opacity-70">Sync</p>
        </div>
        <p className="f-dm text-sm opacity-70 mb-3 max-w-prose">
          Memories save locally first, then mirror to a Cloudflare Worker so all
          four family devices see the same thread. Worker{' '}
          <span className="f-mono text-[11px]">{WORKER_META.url || '—'}</span>.
        </p>
        <p className="f-dm text-sm mb-3" style={{ opacity: 0.85 }}>
          Status:{' '}
          <span
            className="f-mono text-[11px]"
            style={{
              color:
                workerStatus.status === 'synced'
                  ? 'inherit'
                  : workerStatus.status === 'syncing'
                    ? 'inherit'
                    : 'var(--accent)',
            }}
          >
            {workerStatus.status === 'synced'
              ? `synced as ${workerStatus.traveler || traveler}`
              : workerStatus.status === 'syncing'
                ? 'syncing…'
                : workerStatus.status === 'unconfigured'
                  ? 'unconfigured'
                  : `offline${workerStatus.message ? ' · ' + workerStatus.message : ''}`}
          </span>
        </p>
        {workerStatus.status === 'synced' && (
          <>
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
                onClick={runPushAll}
                disabled={pushAllState.status === 'running'}
                title="Re-push every local memory to the Worker. Idempotent by record id."
              >
                <Upload size={12} />
                {pushAllState.status === 'running' ? 'Pushing…' : 'Push memories'}
              </button>
              <button
                type="button"
                className="btn-pill"
                onClick={runSeed}
                disabled={seeding}
                title="Push the bundled Jackson + NYC trips to the Worker. Idempotent."
              >
                <Upload size={12} /> {seeding ? 'Seeding…' : 'Seed trips'}
              </button>
              <button
                type="button"
                className="btn-pill"
                onClick={runForcePushSeed}
                disabled={forcePushing}
                title="Overwrite every trip on the Worker with the bundled seed. Use after the seed picks up an update (keypad code, schedule change). Confirms first."
                style={{ borderColor: 'var(--accent)', color: 'var(--accent-text)' }}
              >
                <Upload size={12} /> {forcePushing ? 'Pushing…' : 'Push seed updates'}
              </button>
            </div>
            {syncMsg && (
              <p className="f-dm text-[12px] opacity-70 mt-3 italic">{syncMsg}</p>
            )}
            {seedMsg && (
              <p className="f-dm text-[12px] opacity-70 mt-3 italic">{seedMsg}</p>
            )}
            {forcePushMsg && (
              <p className="f-dm text-[12px] opacity-70 mt-3 italic">{forcePushMsg}</p>
            )}
            {pushAllState.message && (
              <p
                className="f-dm text-[12px] mt-3 italic"
                style={{
                  opacity: 0.8,
                  color:
                    pushAllState.status === 'error'
                      ? 'var(--accent)'
                      : 'inherit',
                }}
              >
                {pushAllState.message}
              </p>
            )}
            <p className="f-dm text-[11px] opacity-50 mt-3 max-w-prose italic">
              Trips currently sourced from{' '}
              <span className="f-mono text-[10px]">{tripsApi?.source || 'unknown'}</span>
              {' · '}
              {tripsApi?.trips?.length || 0} trip
              {(tripsApi?.trips?.length || 0) === 1 ? '' : 's'} loaded.
            </p>
            {tripsApi?.error && (
              <p className="f-dm text-[11px] mt-1 max-w-prose" style={{ color: 'var(--accent-text)' }}>
                Trip pull error: {tripsApi.error}
              </p>
            )}
          </>
        )}
        {workerStatus.status === 'unconfigured' && (
          <p className="f-dm text-sm" style={{ color: 'var(--accent-text)' }}>
            Worker URL or family token missing from the bundle.
          </p>
        )}
      </section>

      <DevModeUploadLog />
    </div>
  )
}

// Maintainer-only dev panel. Hidden unless localStorage.rt_dev_mode is
// 'true' (flipped from DevTools — no UI to set the flag). Renders the
// dispatch upload log ring buffer with a code histogram and a
// "Copy all" button for paste-into-Slack debugging.
function DevModeUploadLog() {
  const [entries, setEntries] = useState(() =>
    isDevModeEnabled() ? readUploadLog() : []
  )
  const [enabled] = useState(isDevModeEnabled)
  const [copied, setCopied] = useState(false)

  function refresh() {
    setEntries(readUploadLog())
  }
  function copyAll() {
    const text = uploadLogAsText()
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
    }
  }
  function clearAll() {
    clearUploadLog()
    setEntries([])
  }

  if (!enabled) return null
  const histogram = uploadLogHistogram()
  const histLine =
    Object.entries(histogram)
      .map(([k, v]) => `${k}=${v}`)
      .join(' · ') || '(empty)'

  return (
    <section
      className="px-6 py-8 border-b surface-rule"
      data-testid="dev-upload-log"
    >
      <div className="flex items-center gap-2 mb-3">
        <Terminal size={14} />
        <p className="smallcaps f-dm text-[11px] opacity-70">Upload log · dev mode</p>
      </div>
      <p className="f-dm text-sm opacity-70 mb-3 max-w-prose">
        Every silent and surfaced dispatch failure. Helen never sees these
        codes; this panel is the trace surface for debugging without
        re-running the bug.
      </p>
      <p className="f-mono text-[11px] opacity-80 mb-3" data-testid="dev-upload-log-histogram">
        {entries.length} entr{entries.length === 1 ? 'y' : 'ies'} · {histLine}
      </p>
      <div className="flex" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <button type="button" className="btn-pill" onClick={refresh}>
          <RefreshCw size={12} /> Refresh
        </button>
        <button type="button" className="btn-pill" onClick={copyAll}>
          {copied ? <Check size={12} /> : <Upload size={12} />}
          {copied ? 'Copied' : 'Copy all'}
        </button>
        <button
          type="button"
          className="btn-pill"
          onClick={clearAll}
          style={{ color: 'var(--accent-text)' }}
        >
          <Trash2 size={12} /> Clear
        </button>
      </div>
      {entries.length === 0 ? (
        <p className="f-dm text-sm opacity-50 italic">
          No failures recorded yet.
        </p>
      ) : (
        <ul
          data-testid="dev-upload-log-list"
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            maxHeight: 360,
            overflowY: 'auto',
          }}
        >
          {entries
            .slice()
            .reverse()
            .map((e, i) => (
              <li
                key={`${e.ts}-${i}`}
                style={{
                  padding: '8px 10px',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  background: 'var(--card, transparent)',
                }}
              >
                <div
                  className="f-mono"
                  style={{
                    fontSize: 11,
                    letterSpacing: '0.04em',
                    color: e.bucket === 'C' ? 'var(--accent-text)' : 'inherit',
                    opacity: 0.85,
                  }}
                >
                  [{e.bucket}] {e.code}
                  {e.outcome ? ` → ${e.outcome}` : ''}
                  {e.attempt > 1 ? ` · attempt ${e.attempt}` : ''}
                </div>
                <div
                  className="f-mono"
                  style={{ fontSize: 10, opacity: 0.55, marginTop: 2 }}
                >
                  {e.ts}
                </div>
                {e.message && (
                  <div
                    className="f-dm"
                    style={{ fontSize: 12, marginTop: 4, wordBreak: 'break-word' }}
                  >
                    {e.message}
                  </div>
                )}
                {e.fileMeta && (
                  <div
                    className="f-mono"
                    style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}
                  >
                    {[
                      e.fileMeta.name && `name=${e.fileMeta.name}`,
                      e.fileMeta.type && `type=${e.fileMeta.type}`,
                      e.fileMeta.size != null && `size=${e.fileMeta.size}`,
                    ]
                      .filter(Boolean)
                      .join('  ')}
                  </div>
                )}
              </li>
            ))}
        </ul>
      )}
    </section>
  )
}
