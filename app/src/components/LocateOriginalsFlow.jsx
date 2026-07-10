import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, MapPin, Camera, Lock, Clock, Check } from 'lucide-react'
import { TRAVELERS, TRAVELER_DOT } from '../data/travelers'
import { isAdult } from '../lib/auth'
import { listAllLocalMemories, listMemoriesForTrip, applyRefGps, applyRefOffset } from '../lib/memoryStore'
import { maskForViewer } from '../lib/surprises'
import { buildRefIndex, countNeedyRefs, runResourceScan, sceneHashFromFile } from '../lib/resourceScan'
import { loadExifTags } from '../lib/exifRead'

// "Find your photos' locations" — the re-source scan surface (Album System Ch 04).
// An adult points the app at the ORIGINALS in their own photo library; each one is
// read right here on the device, matched to the imported photo by capture instant,
// and the recovered GPS + capture-time offset are filled in additively (the upload
// shrink stripped both from every copy the server holds). Settings-hosted state
// machine per the design: intro → grant → scan → result | allset.
//
// Hard rules carried from the design + house invariants:
// - DIRECT-TAP grant: the pick control is a real <label> wrapping a real, PRESENT
//   (sr-only, never display:none) <input type=file> — iOS only opens a picker from
//   a direct tap on a real file input (see PhotoAlbum's ReAddSoundRow, c50f58f).
// - Adults only — the Settings host gates, and this component refuses kids too.
// - MASKING UPSTREAM: every read goes through maskForViewer BEFORE the engine sees
//   it, and the engine re-checks. `masked:true` exists only on worker projections —
//   a surprise authored on THIS device is a raw row carrying hideFrom, and the
//   Settings person-switcher makes viewer≠author a one-tap state on this very
//   screen. So the viewer is the predicate, never the flag.
// - Honest result, quiet settle — real counts, no confetti, no review queue.
//
// Copy is the Ch4 deck (ch4-data.jsx C4), two adult voices. Deviations from the
// deck, each an honesty fix (G6 — promise only what the plumbing delivers):
// - "Nothing leaves your phone" → the photos stay on-device but the recovered
//   fields DO sync to the family, so the aside says exactly that.
// - The grant note's "we only read this weekend's four days" is unenforceable in a
//   web picker (the person chooses what to hand over), and matching runs across the
//   whole archive → reworded around what we actually do with what they pick.
// - The settle note's "the afternoon in town will have come back together" is the
//   later family-visible confirm surface, not today's shadow engine → reworded to
//   what is true now (times/places saved; the app keeps learning from them).
// - The deck's unplaced line asserts a REASON per file ("a screenshot, an edited
//   copy"). We cannot know that — a photo imported in another timezone misses too.
//   So the count is stated plainly and the reason is offered as a hedge, never a
//   claim. A write that FAILED (storage full) gets its own line: it is not a photo
//   that "never carried a location".
// - "That's everything on this phone" is only true when nothing of the runner's own
//   is still waiting; otherwise the footer just says Done.
const COPY = {
  promiseKicker: { helen: 'A one-time thing', jonathan: 'One-time · adults only' },
  promiseTitle: {
    helen: 'Find where your\nphotos were taken',
    jonathan: 'Recover your\nphotos’ locations',
  },
  promiseBody: {
    helen: 'When you added these to Family Trips they were made smaller — and that quietly dropped where and when each one was taken. The originals in your camera roll still remember. This reads them, right here on your phone, and fills your trip map back in.',
    jonathan: 'Import shrinks each photo, and the re-encode strips its location and time. The copies here lost both; your originals still hold them. This reads the originals on this device and fills the fields back in.',
  },
  promiseCta: { helen: 'Find them', jonathan: 'Start' },
  promiseAside: {
    helen: 'Your photos stay on your phone — only the where and when is filled in.',
    jonathan: 'Photos stay on-device. Only the recovered fields are saved.',
  },
  ribbonLabel: { helen: 'From your originals', jonathan: 'Originals → the trip map' },
  grantKicker: { helen: 'One tap', jonathan: 'Grant' },
  grantTitle: {
    helen: 'Let Family Trips look at\nyour photos',
    jonathan: 'Grant your photos',
  },
  grantNote: {
    helen: 'Tap to choose — your library opens. Everything you pick is read right here, and anything that matches a photo in your trips gets its place and time filled in.',
    jonathan: 'Opens the library picker (iOS requires a real tap). Read on-device; whatever matches an imported photo gets GPS + offset filled.',
  },
  grantAllow: { helen: 'Choose your photos', jonathan: 'Choose photos' },
  grantUnder: { helen: 'Opens your library — a real tap, always', jonathan: 'Opens the system picker' },
  grantError: {
    helen: 'That didn’t finish — nothing was lost. Just try again.',
    jonathan: 'That pass didn’t finish. Nothing was lost — run it again.',
  },
  scanReading: { helen: 'Reading your originals…', jonathan: 'Reading originals…' },
  scanMatching: { helen: 'Matching them to your trips…', jonathan: 'Matching by capture time…' },
  scanFilling: { helen: 'Filling in the map…', jonathan: 'Writing GPS + offset…' },
  scanFoot: {
    helen: 'matching each original to the photo it became',
    jonathan: 'Pairing each original to its import by capture instant.',
  },
  scanFound: { helen: 'found {m} so far', jonathan: '{m} matched' },
  scanCancel: { helen: 'Stop', jonathan: 'Cancel' },
  resultKicker: { helen: 'All done', jonathan: 'Complete' },
  resultHead: {
    helen: 'Found where {m} of your\n{c} photos were taken.',
    jonathan: 'Located {m} of {c}.',
  },
  resultHeadTimeOnly: {
    helen: 'Set the right time on {t}\nof your {c} photos.',
    jonathan: 'Corrected the time on {t} of {c}.',
  },
  resultHeadNothing: {
    helen: 'Nothing new to fill in\nthis time.',
    jonathan: 'Nothing new to fill in.',
  },
  // When the ONLY outcome was a failed save, "nothing new to fill in" would
  // contradict the red line right below it. There WAS something; it didn't save.
  resultHeadFailed: {
    helen: 'Found something, but it\ncouldn’t be saved.',
    jonathan: 'Recovered fields, but the save failed.',
  },
  resultTime: {
    // Never "the wrong time": a recovered offset of +00:00 is a photo whose time
    // was already right — we recorded the zone, we didn't correct a mistake.
    helen: 'And recorded the right time zone on {t} of them.',
    jonathan: '{t} got their capture offset back.',
  },
  resultAlready: {
    helen: '{a} already knew where and when they were — left exactly as they were.',
    jonathan: '{a} already complete — untouched.',
  },
  // Never a cause we can't know: a photo here may have carried no location at all,
  // or carried only what its photo already had. Both are "nothing to add".
  resultNothing: {
    helen: '{n} had nothing this scan could add, so they were left exactly as they were.',
    jonathan: '{n} had nothing to add. Untouched.',
  },
  // Covers another adult AND the kids: only the phone a photo was taken on can
  // recover it. (Never promises the kids' will fill in — they never run this.)
  resultNotYours: {
    helen: '{y} were taken on another phone. Only that phone can fill those in.',
    jonathan: '{y} were authored on another device — only its own scan can fill them.',
  },
  resultAmbiguous: {
    helen: '{g} could have been either of two photos, so nothing was changed — better untouched than wrong.',
    jonathan: '{g} matched two possible photos (import zone ≠ this zone). Refused rather than guess.',
  },
  resultUnmatched: {
    helen: '{u} didn’t match a photo here, so they were left exactly as they were.',
    jonathan: '{u} matched no imported photo. Untouched.',
  },
  resultUnmatchedWhy: {
    helen: 'Usually that’s a screenshot, an edited copy, or a photo that was never added — but a photo added while you were in another time zone can miss too.',
    jonathan: 'Typically screenshots / edited copies / never-imported. A cross-zone import can also miss.',
  },
  resultFailed: {
    helen: '{f} had something to add, but it couldn’t be saved — your phone may be out of space. Nothing was changed; try again when there’s room.',
    jonathan: '{f} had recoverable fields but the write failed (storage). Nothing changed — retry.',
  },
  resultDone: { helen: 'That’s everything on this phone.', jonathan: 'This device is done.' },
  resultDoneMore: { helen: 'Done', jonathan: 'Close' },
  coordHead: {
    helen: '{n} more of this trip’s photos still need their place and time.',
    jonathan: '{n} more of this trip’s photos are still missing fields.',
  },
  coordUnknown: {
    helen: 'from a phone we can’t name',
    jonathan: 'FROM AN UNATTRIBUTED DEVICE',
  },
  coordSub: {
    helen: 'They fill in the same way — whoever took them just opens Family Trips on their phone.',
    jonathan: 'Same flow, per device. Each author runs it on their own.',
  },
  coordSelfDone: { helen: 'On your phone', jonathan: 'On this device' },
  coordSelfWaiting: {
    helen: 'Still on your phone — pick them any time',
    jonathan: 'Still on this device — pick them any time',
  },
  coordWaiting: { helen: '’s phone — waiting', jonathan: '’s phone — waiting' },
  // The design's "ride along under a parent" was retired: a picked file carries no
  // proof of whose photo it is, and a wrong write onto a child's photo would be
  // permanent. Their photos stay as they are rather than be guessed at.
  coordKids: {
    helen: 'of the kids’ photos stay exactly as they are',
    jonathan: 'OF THE KIDS’ — NOT RECOVERABLE FROM A PARENT’S PHONE',
  },
  allSetHead: {
    helen: 'Everything here already knows where it was.',
    jonathan: 'All photos already located.',
  },
  allSetSub: { helen: 'You’re all set — nothing to fill in.', jonathan: 'Nothing to do.' },
  allSetDone: { helen: 'Done', jonathan: 'Close' },
  // Gated on s.matched > 0, but "matched" fires whenever EITHER field lands, not
  // both — a photo with Location Services off recovers only its time zone. Worded
  // to stay true either way, rather than assert "times and places" when only one
  // landed.
  settleNote: {
    helen: 'What’s now known is saved with your photos — the app keeps learning from it, and you don’t have to do anything.',
    jonathan: 'What was recovered is saved and feeds the engine’s next pass. No action needed.',
  },
}

function fill(str, map) {
  return Object.keys(map).reduce((s, k) => s.split('{' + k + '}').join(String(map[k])), str)
}

// Multi-line deck strings carry '\n' where the design breaks the headline. The
// trailing space keeps the break a real word gap in textContent (screen readers
// and text assertions would otherwise read "your1 photos").
function Lines({ text }) {
  const parts = String(text).split('\n')
  return parts.map((l, i) => (
    <span key={i}>
      {i < parts.length - 1 ? l + ' ' : l}
      {i < parts.length - 1 && <br />}
    </span>
  ))
}

// The location glyph — a pin on an accent disc (design GeoMark).
function GeoMark({ size = 60 }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--accent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <MapPin size={size * 0.5} color="var(--accent-ink)" strokeWidth={1.7} />
    </div>
  )
}

// Four originals feeding one recovered pin — the whole idea in one row. Uses this
// trip's REAL photo thumbs when it has them (read through the masked-for-viewer
// path so a surprise photo can never appear here); tinted placeholders otherwise.
function MatchRibbon({ thumbs }) {
  const tints = ['#6E8590', '#7A6448', '#5E7A6A', '#6A5440']
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ display: 'flex' }}>
        {tints.map((tint, i) => (
          <div
            key={i}
            style={{
              width: 34,
              height: 34,
              borderRadius: 6,
              overflow: 'hidden',
              marginLeft: i ? -10 : 0,
              boxShadow: '0 0 0 2px var(--bg)',
              transform: `rotate(${(i - 1.5) * 4}deg)`,
              background: tint,
              flexShrink: 0,
            }}
          >
            {thumbs[i] && (
              <img
                src={thumbs[i]}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            )}
          </div>
        ))}
      </div>
      <span aria-hidden="true" style={{ color: 'var(--faint)', fontSize: 15 }}>→</span>
      <GeoMark size={34} />
    </div>
  )
}

function FlowHeader({ kicker, onBack, right }) {
  return (
    <div
      style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 'calc(14px + env(safe-area-inset-top, 0px)) 16px 10px',
      }}
    >
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--text)' }}
        >
          <ChevronLeft size={22} />
        </button>
      ) : (
        <span style={{ width: 4 }} />
      )}
      <span className="f-mono" style={{ fontSize: 9.5, letterSpacing: 1.4, color: 'var(--muted)', textTransform: 'uppercase' }}>
        {kicker}
      </span>
      <span style={{ marginLeft: 'auto' }}>{right}</span>
    </div>
  )
}

function FooterPill({ children, onClick, sub, testId }) {
  return (
    <div
      style={{
        flexShrink: 0,
        padding: '10px 20px calc(22px + env(safe-area-inset-bottom, 0px))',
        borderTop: '1px solid var(--border)',
        background: 'var(--bg)',
      }}
    >
      <button
        type="button"
        onClick={onClick}
        data-testid={testId}
        style={{
          width: '100%',
          border: 'none',
          cursor: 'pointer',
          borderRadius: 999,
          background: 'var(--accent)',
          color: 'var(--accent-ink)',
          fontSize: 15,
          fontWeight: 600,
          padding: '13px 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          minHeight: 48,
        }}
        className="f-dm"
      >
        {children}
      </button>
      {sub}
    </div>
  )
}

// What is still waiting, per author, for THIS trip — read off the same index the
// engine uses, so it inherits every exclusion (masked-from-viewer, videos the
// picker can never supply, the photoRef back-compat mirror). Anything counted here
// is something a scan could really fill.
function pendingByAuthor(refIndex, tripId) {
  const by = {}
  for (const cands of refIndex.values()) {
    for (const c of cands) {
      if (c.complete) continue
      if (tripId && c.tripId !== tripId) continue
      const a = c.author || 'unknown'
      by[a] = (by[a] || 0) + 1
    }
  }
  return by
}

function CoordinateCard({ traveler, voice, pending }) {
  const selfPending = pending[traveler] || 0
  const otherAdults = ['helen', 'jonathan']
    .filter((a) => a !== traveler)
    .map((a) => ({ id: a, count: pending[a] || 0 }))
    .filter((r) => r.count > 0)
  const kidCount = Object.keys(pending)
    .filter((a) => a !== 'unknown' && !isAdult(a))
    .reduce((n, a) => n + pending[a], 0)
  const unknownCount = pending.unknown || 0
  // The headline must equal what the rows account for — a legacy ref with no
  // recorded author is still a photo that is waiting.
  const others = otherAdults.reduce((n, r) => n + r.count, 0) + kidCount + selfPending + unknownCount
  return (
    <div
      data-testid="locate-coordinate"
      style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 15px' }}
    >
      {others > 0 && (
        <>
          <div className="f-dm" style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.35 }}>
            {fill(COPY.coordHead[voice], { n: others })}
          </div>
          {/* "whoever took them just opens this on their phone" is only true of the
              other ADULTS — the kids never run it, and say so on their own line. */}
          {(otherAdults.length > 0 || selfPending > 0) && (
            <div className="f-dm" style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, lineHeight: 1.45 }}>
              {COPY.coordSub[voice]}
            </div>
          )}
        </>
      )}
      <div style={{ marginTop: others > 0 ? 13 : 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: '50%', background: TRAVELER_DOT[traveler], flexShrink: 0 }} />
          <span className="f-dm" style={{ flex: 1, fontSize: 12.5 }}>
            {selfPending > 0 ? COPY.coordSelfWaiting[voice] : COPY.coordSelfDone[voice]}
          </span>
          {selfPending > 0 ? (
            <span className="f-mono" data-testid="locate-self-waiting" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: 'var(--muted)' }}>
              <Clock size={12} /> {selfPending}
            </span>
          ) : (
            // No number here: a scan-wide file count would be a different scope
            // from this trip-scoped card, and the two would disagree on screen.
            <span className="f-mono" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: 'var(--good)' }}>
              <Check size={12} /> DONE
            </span>
          )}
        </div>
        {otherAdults.map((r) => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: '50%', background: TRAVELER_DOT[r.id], flexShrink: 0 }} />
            <span className="f-dm" style={{ flex: 1, fontSize: 12.5 }}>
              {(TRAVELERS[r.id]?.name || r.id) + COPY.coordWaiting[voice]}
            </span>
            <span className="f-mono" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: 'var(--muted)' }}>
              <Clock size={12} /> {r.count}
            </span>
          </div>
        ))}
      </div>
      {(kidCount > 0 || unknownCount > 0) && (
        <div
          className="f-mono"
          style={{ fontSize: 8.5, letterSpacing: 0.3, color: 'var(--muted)', marginTop: 11, paddingTop: 10, borderTop: '1px solid var(--border)', lineHeight: 1.5 }}
        >
          {kidCount > 0 && <div>+ {kidCount} {COPY.coordKids[voice]}</div>}
          {unknownCount > 0 && <div>+ {unknownCount} {COPY.coordUnknown[voice]}</div>}
        </div>
      )}
    </div>
  )
}

export function LocateOriginalsFlow({ trip, traveler, onClose }) {
  const voice = traveler === 'jonathan' ? 'jonathan' : 'helen'
  const [step, setStep] = useState(null) // set on mount, once the index is read
  const [progress, setProgress] = useState({ done: 0, total: 0, matched: 0 })
  const [stats, setStats] = useState(null)
  const [scanError, setScanError] = useState(false)
  const abortRef = useRef(null)
  const dialogRef = useRef(null)

  // Masked BEFORE the engine sees it, and the engine re-checks with the viewer.
  // A cover-mode surprise becomes a stand-in (masked:true, no real refs); a teaser
  // is simply absent. Read once per open; re-read after a scan so the "still
  // waiting" counts tell the truth about what just landed.
  const readMemories = useCallback(
    () => maskForViewer(listAllLocalMemories(traveler), traveler),
    [traveler]
  )
  const refIndex = useMemo(
    () => buildRefIndex(readMemories(), traveler),
    // `stats` is a dependency on purpose: after a scan, rebuild from fresh storage.
    [readMemories, stats]
  )
  const needy = useMemo(() => countNeedyRefs(refIndex), [refIndex])

  // Open on 'allset' only when there is genuinely nothing on this device to fill.
  useEffect(() => {
    if (step === null) setStep(needy === 0 ? 'allset' : 'intro')
  }, [step, needy])

  useEffect(() => () => abortRef.current?.abort(), [])
  // Move focus into the dialog on every step so a keyboard/VoiceOver user lands
  // inside the surface they just opened, not on the Settings row behind it.
  useEffect(() => {
    if (step) dialogRef.current?.focus()
  }, [step])

  // Real thumbs for the intro ribbon — masked-for-viewer read, photos only.
  const thumbs = useMemo(() => {
    try {
      const out = []
      for (const m of listMemoriesForTrip(trip?.id, traveler)) {
        const refs = Array.isArray(m.photoRefs) && m.photoRefs.length ? m.photoRefs : m.photoRef ? [m.photoRef] : []
        for (const r of refs) {
          if (!r || r.kind === 'video') continue
          if (typeof r.url === 'string' && r.url) out.push(r.url)
          if (out.length >= 4) return out
        }
      }
      return out
    } catch {
      return []
    }
  }, [trip?.id, traveler])

  const cancelScan = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setStep('grant')
  }, [])

  if (!isAdult(traveler)) return null
  if (!step) return null

  async function onPick(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = '' // picking the same batch twice must still fire (house rule)
    if (!files.length) return
    setScanError(false)
    setStep('scan')
    setProgress({ done: 0, total: files.length, matched: 0 })
    const controller = new AbortController()
    abortRef.current = controller
    let res
    try {
      res = await runResourceScan({
        files,
        memories: readMemories(),
        scanner: traveler,
        loadTags: loadExifTags,
        loadSceneHash: sceneHashFromFile,
        applyGps: applyRefGps,
        applyOffset: applyRefOffset,
        onProgress: (p) => setProgress(p),
        signal: controller.signal,
      })
    } catch {
      // Never a stranded spinner: land back on the grant with an honest,
      // retry-friendly note. Whatever already landed is additive + idempotent,
      // so trying again is always safe (a re-run skips what's now complete).
      if (!controller.signal.aborted) {
        setScanError(true)
        setStep('grant')
      }
      return
    }
    if (controller.signal.aborted) return
    setStats(res)
    setStep('result')
  }

  function onKeyDown(e) {
    if (e.key !== 'Escape') return
    e.stopPropagation()
    if (step === 'scan') cancelScan()
    else if (step === 'grant') setStep('intro')
    else onClose?.()
  }

  const overlay = {
    position: 'fixed',
    inset: 0,
    zIndex: 90,
    background: 'var(--bg)',
    color: 'var(--text)',
    display: 'flex',
    flexDirection: 'column',
    outline: 'none',
  }
  const dialogProps = (label) => ({
    ref: dialogRef,
    tabIndex: -1,
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': label,
    onKeyDown,
    style: overlay,
  })

  if (step === 'allset') {
    return (
      <div {...dialogProps(COPY.allSetHead[voice])} data-testid="locate-allset">
        <FlowHeader kicker={COPY.resultKicker[voice]} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 30px', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--good)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Check size={32} color="#fff" strokeWidth={2.4} />
          </div>
          <h1 className="f-news" style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.5, lineHeight: 1.15, margin: '20px 0 0' }}>
            {COPY.allSetHead[voice]}
          </h1>
          <p className="f-dm" style={{ fontSize: 14, color: 'var(--muted)', margin: '10px 0 0' }}>{COPY.allSetSub[voice]}</p>
        </div>
        <div style={{ flexShrink: 0, padding: '12px 20px calc(22px + env(safe-area-inset-bottom, 0px))' }}>
          <button
            type="button"
            onClick={onClose}
            data-testid="locate-allset-done"
            className="f-dm"
            style={{ width: '100%', border: '1px solid var(--line-bold)', cursor: 'pointer', borderRadius: 999, background: 'transparent', color: 'var(--text)', fontSize: 14, fontWeight: 600, padding: '12px 0', minHeight: 48 }}
          >
            {COPY.allSetDone[voice]}
          </button>
        </div>
      </div>
    )
  }

  if (step === 'intro') {
    return (
      <div {...dialogProps(COPY.promiseTitle[voice].replace('\n', ' '))} data-testid="locate-intro">
        <FlowHeader kicker={COPY.promiseKicker[voice]} onBack={onClose} />
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 22px 20px' }}>
          <GeoMark size={62} />
          <h1 className="f-news" style={{ fontSize: 32, fontWeight: 600, letterSpacing: -0.8, lineHeight: 1.06, margin: '18px 0 0' }}>
            <Lines text={COPY.promiseTitle[voice]} />
          </h1>
          <p className="f-dm" style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--muted)', margin: '16px 0 0' }}>
            {COPY.promiseBody[voice]}
          </p>
          <div style={{ marginTop: 20, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '15px 15px' }}>
            <div className="f-mono" style={{ fontSize: 8.5, letterSpacing: 1.2, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 11 }}>
              {COPY.ribbonLabel[voice]}
            </div>
            <MatchRibbon thumbs={thumbs} />
          </div>
        </div>
        <FooterPill
          onClick={() => setStep('grant')}
          testId="locate-intro-cta"
          sub={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 11, color: 'var(--muted)' }}>
              <Lock size={11} />
              <span className="f-mono" style={{ fontSize: 9, letterSpacing: 0.4 }}>{COPY.promiseAside[voice]}</span>
            </div>
          }
        >
          <MapPin size={17} /> {COPY.promiseCta[voice]}
        </FooterPill>
      </div>
    )
  }

  if (step === 'grant') {
    return (
      <div {...dialogProps(COPY.grantTitle[voice].replace('\n', ' '))} data-testid="locate-grant">
        <FlowHeader kicker={COPY.grantKicker[voice]} onBack={() => setStep('intro')} />
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 22px 20px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 999, padding: '5px 11px 5px 8px', marginBottom: 16 }}>
            <Clock size={12} color="var(--accent-text)" />
            <span className="f-mono" style={{ fontSize: 9, letterSpacing: 0.5 }}>
              {trip?.title || 'This trip'}
              {trip?.dateRange ? ` · ${trip.dateRange}` : ''}
            </span>
          </div>
          <h1 className="f-news" style={{ fontSize: 25, fontWeight: 600, letterSpacing: -0.5, lineHeight: 1.12, margin: 0 }}>
            <Lines text={COPY.grantTitle[voice]} />
          </h1>
          <p className="f-dm" style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--muted)', margin: '12px 0 0' }}>
            {COPY.grantNote[voice]}
          </p>
          {scanError && (
            <p className="f-dm" data-testid="locate-grant-error" role="alert" style={{ fontSize: 12.5, margin: '14px 0 0', lineHeight: 1.5, color: 'var(--accent-text)' }}>
              {COPY.grantError[voice]}
            </p>
          )}
        </div>
        <div
          style={{
            flexShrink: 0,
            padding: '12px 20px calc(22px + env(safe-area-inset-bottom, 0px))',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg)',
          }}
        >
          {/* THE direct-tap control: a real label over a real, PRESENT input. */}
          <label
            className="f-dm"
            data-testid="locate-grant-label"
            style={{
              position: 'relative',
              width: '100%',
              boxSizing: 'border-box',
              borderRadius: 999,
              background: 'var(--accent)',
              color: 'var(--accent-ink)',
              fontSize: 15,
              fontWeight: 600,
              padding: '13px 0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              cursor: 'pointer',
              minHeight: 48,
            }}
          >
            <Camera size={16} /> {COPY.grantAllow[voice]}
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={onPick}
              data-testid="locate-grant-input"
              // sr-only, NOT display:none — the input must be real + present for
              // the direct-tap rule (and stay reachable by assistive tech).
              style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', border: 0, clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}
            />
          </label>
          <div className="f-mono" style={{ fontSize: 8, letterSpacing: 0.6, color: 'var(--muted)', textAlign: 'center', marginTop: 9, textTransform: 'uppercase' }}>
            {COPY.grantUnder[voice]}
          </div>
        </div>
      </div>
    )
  }

  if (step === 'scan') {
    const total = progress.total || 1
    const p = Math.min(1, (progress.done || 0) / total)
    const phase = p < 0.42 ? 'read' : p < 0.78 ? 'match' : 'fill'
    const label = phase === 'read' ? COPY.scanReading[voice] : phase === 'match' ? COPY.scanMatching[voice] : COPY.scanFilling[voice]
    const R = 46
    const CIRC = 2 * Math.PI * R
    const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    return (
      <div {...dialogProps(label)} data-testid="locate-scan" style={{ ...overlay, alignItems: 'center', justifyContent: 'center', padding: '0 30px' }}>
        <div
          style={{ position: 'relative', width: 128, height: 128 }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={progress.total || 0}
          aria-valuenow={progress.done || 0}
        >
          <svg width="128" height="128" viewBox="0 0 128 128" style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
            <circle cx="64" cy="64" r={R} fill="none" stroke="var(--border)" strokeWidth="6" />
            <circle
              cx="64"
              cy="64"
              r={R}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={CIRC * (1 - p)}
              style={reduceMotion ? undefined : { transition: 'stroke-dashoffset 120ms linear' }}
            />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            {/* The counter is FILES READ, not matches: on a big pick where little
                matches, a matched-count that sits at 0 reads as a hang. */}
            <span className="f-news" style={{ fontSize: 34, fontWeight: 600, lineHeight: 1 }} data-testid="locate-scan-count">
              {progress.done || 0}
            </span>
            <span className="f-mono" style={{ fontSize: 8.5, letterSpacing: 0.8, color: 'var(--muted)', marginTop: 3 }}>
              OF {progress.total || 0}
            </span>
          </div>
        </div>
        <div className="f-news" aria-live="polite" style={{ fontSize: 19, fontWeight: 600, letterSpacing: -0.3, marginTop: 26, textAlign: 'center', minHeight: 26 }}>
          {label}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 14 }} aria-hidden="true">
          {['read', 'match', 'fill'].map((ph) => {
            const done = (ph === 'read' && p >= 0.42) || (ph === 'match' && p >= 0.78) || (ph === 'fill' && p >= 1)
            const active = ph === phase
            return (
              <span
                key={ph}
                style={{ width: active ? 22 : 7, height: 7, borderRadius: 4, background: done || active ? 'var(--accent)' : 'var(--border)', transition: reduceMotion ? 'none' : 'all .25s' }}
              />
            )
          })}
        </div>
        <div className="f-mono" style={{ fontSize: 9, letterSpacing: 0.4, color: 'var(--muted)', marginTop: 18, textAlign: 'center', maxWidth: 220, lineHeight: 1.5 }}>
          {progress.matched > 0 ? fill(COPY.scanFound[voice], { m: progress.matched }) : COPY.scanFoot[voice]}
        </div>
        {/* A long pick must never be a lock-in: everything written so far is kept. */}
        <button
          type="button"
          onClick={cancelScan}
          data-testid="locate-scan-cancel"
          className="f-dm"
          style={{ marginTop: 26, background: 'transparent', border: '1px solid var(--line-bold)', borderRadius: 999, color: 'var(--text)', fontSize: 13, fontWeight: 600, padding: '10px 26px', cursor: 'pointer', minHeight: 44 }}
        >
          {COPY.scanCancel[voice]}
        </button>
      </div>
    )
  }

  // step === 'result' — the honest counts, in the family's own words.
  const s = stats || { total: 0, matched: 0, alreadyKnown: 0, nothingToRecover: 0, notYours: 0, ambiguous: 0, unmatched: 0, failed: 0, filesLocated: 0, filesTimeFixed: 0 }
  const headline =
    s.filesLocated > 0
      ? fill(COPY.resultHead[voice], { m: s.filesLocated, c: s.total })
      : s.filesTimeFixed > 0
        ? fill(COPY.resultHeadTimeOnly[voice], { t: s.filesTimeFixed, c: s.total })
        : s.failed > 0
          ? COPY.resultHeadFailed[voice] // never "nothing to fill in" over a failed save
          : COPY.resultHeadNothing[voice]
  const pending = pendingByAuthor(refIndex, trip?.id)
  const showCard = Object.values(pending).some((n) => n > 0) || s.matched > 0
  // "That's everything on this phone" is a claim about the DEVICE, so it may only
  // be made when nothing anywhere on it — any trip, any author — is still waiting.
  const deviceRemaining = countNeedyRefs(refIndex)
  return (
    <div {...dialogProps(COPY.resultKicker[voice])} data-testid="locate-result">
      <FlowHeader
        kicker={COPY.resultKicker[voice]}
        right={
          <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--good)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Check size={15} color="#fff" strokeWidth={2.4} />
          </span>
        }
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px 18px' }}>
        <h1 className="f-news" data-testid="locate-result-head" style={{ fontSize: 27, fontWeight: 600, letterSpacing: -0.6, lineHeight: 1.1, margin: '4px 0 0' }}>
          <Lines text={headline} />
        </h1>
        {s.filesLocated > 0 && s.filesTimeFixed > 0 && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 14 }}>
            <Clock size={15} color="var(--accent-text)" style={{ marginTop: 2, flexShrink: 0 }} />
            <span className="f-dm" data-testid="locate-result-time" style={{ fontSize: 13.5, lineHeight: 1.45 }}>
              {fill(COPY.resultTime[voice], { t: s.filesTimeFixed })}
            </span>
          </div>
        )}
        {s.alreadyKnown > 0 && (
          <p className="f-dm" data-testid="locate-result-already" style={{ fontSize: 12.5, color: 'var(--muted)', margin: '12px 0 0', lineHeight: 1.5 }}>
            {fill(COPY.resultAlready[voice], { a: s.alreadyKnown })}
          </p>
        )}
        {s.nothingToRecover > 0 && (
          <p className="f-dm" data-testid="locate-result-nothing" style={{ fontSize: 12.5, color: 'var(--muted)', margin: '12px 0 0', lineHeight: 1.5 }}>
            {fill(COPY.resultNothing[voice], { n: s.nothingToRecover })}
          </p>
        )}
        {s.notYours > 0 && (
          <p className="f-dm" data-testid="locate-result-notyours" style={{ fontSize: 12.5, color: 'var(--muted)', margin: '12px 0 0', lineHeight: 1.5 }}>
            {fill(COPY.resultNotYours[voice], { y: s.notYours })}
          </p>
        )}
        {s.ambiguous > 0 && (
          <p className="f-dm" data-testid="locate-result-ambiguous" style={{ fontSize: 12.5, color: 'var(--muted)', margin: '12px 0 0', lineHeight: 1.5 }}>
            {fill(COPY.resultAmbiguous[voice], { g: s.ambiguous })}
          </p>
        )}
        {s.failed > 0 && (
          <div data-testid="locate-result-failed" style={{ marginTop: 15, background: 'var(--bg2)', borderRadius: 'var(--radius)', padding: '12px 13px' }}>
            <div className="f-dm" style={{ fontSize: 12.5, color: 'var(--accent-text)', lineHeight: 1.5 }}>
              {fill(COPY.resultFailed[voice], { f: s.failed })}
            </div>
          </div>
        )}
        {s.unmatched > 0 && (
          <div data-testid="locate-result-unmatched" style={{ marginTop: 15, background: 'var(--bg2)', borderRadius: 'var(--radius)', padding: '12px 13px' }}>
            <div className="f-dm" style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>
              {fill(COPY.resultUnmatched[voice], { u: s.unmatched })}
            </div>
            <div className="f-dm" style={{ fontSize: 11.5, color: 'var(--faint)', lineHeight: 1.45, marginTop: 6 }}>
              {COPY.resultUnmatchedWhy[voice]}
            </div>
          </div>
        )}
        {/* The divider belongs to the card; without it, an empty card strands a
            floating rule under the counts. */}
        {showCard && (
          <>
            <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />
            <CoordinateCard traveler={traveler} voice={voice} pending={pending} />
          </>
        )}
        {/* The settle note says fields were saved — so it appears only when some
            actually were. A pass that changed nothing gets no promise. */}
        {s.matched > 0 && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 16 }}>
            <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', marginTop: 6, flexShrink: 0 }} />
            <span className="f-news-i" data-testid="locate-result-settle" style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5 }}>
              {COPY.settleNote[voice]}
            </span>
          </div>
        )}
      </div>
      <FooterPill onClick={onClose} testId="locate-result-done">
        {deviceRemaining > 0 ? COPY.resultDoneMore[voice] : COPY.resultDone[voice]}
      </FooterPill>
    </div>
  )
}
