// PersonView — "Show me, me". Group photos & videos by WHO IS IN THE
// FRAME (by face), not who uploaded them. Recreated from the design
// (ft2/shared.jsx PersonView): a face-picker for the four family members,
// a headline, a video reel (Rafa) / best-light reel (Aurelia·Helen), and
// the "Every frame" grid — all reading real local photos through the
// on-device face index. Everything stays on the iPad.
//
// First run teaches the app the family's faces (enroll), then a one-time
// background scan fingerprints the trip's photos. After that the view
// renders straight from the index (no model load) until new photos
// arrive. Matching is re-decided live from the stored fingerprints.

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { listMemoriesForTrip } from '../lib/memoryStore'
import { flattenPhotoEntries } from '../lib/photoEntries'
import { initFaceEngine, detectFaces, embedDetection, loadImageBitmap } from '../lib/faceModel'
import {
  getEnrollment,
  addExemplar,
  enrolledCentroids,
  getFacesByKey,
  getRejections,
  addRejection,
  removeRejection,
  selectPhotosWith,
  personCounts,
} from '../lib/faceIndex'
import { pendingScan, runRecognitionPass, scanUrlForEntry } from '../lib/faceRecognize'
import { DEFAULT_MATCH_THRESHOLD } from '../lib/faceMatch'

const TRAVELER_LIST = ['rafa', 'aurelia', 'helen', 'jonathan']
const NAMES = { rafa: 'Rafa', aurelia: 'Aurelia', helen: 'Helen', jonathan: 'Jonathan' }
const DOT = { rafa: '#E8552E', aurelia: '#E8478C', helen: '#2E7D52', jonathan: '#2E6BB8' }
// What each viewer calls the others (Rafa sees Mama/Papa/Sissy).
const REL = {
  rafa: { helen: 'Mama', jonathan: 'Papa', aurelia: 'Sissy' },
  aurelia: { helen: 'Mom', jonathan: 'Dad', rafa: 'Rafa' },
}
function displayName(id, viewer) {
  if (id === viewer) return 'you'
  return REL[viewer]?.[id] || NAMES[id]
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

function Avatar({ id, size = 44, thumb }) {
  if (thumb) {
    return <img src={thumb} alt="" width={size} height={size} style={{ borderRadius: '50%', objectFit: 'cover' }} />
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: DOT[id],
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: size * 0.42,
      }}
    >
      {NAMES[id]?.[0]}
    </div>
  )
}

function faceThumb(bitmap, box, px = 88) {
  const c = document.createElement('canvas')
  c.width = px
  c.height = px
  const ctx = c.getContext('2d')
  const m = Math.max(box.width, box.height) * 0.6
  const cx = box.originX + box.width / 2
  const cy = box.originY + box.height / 2
  ctx.drawImage(bitmap, cx - m, cy - m, m * 2, m * 2, 0, 0, px, px)
  return c.toDataURL('image/jpeg', 0.8)
}

export function PersonView({ trip, trips, traveler, initialWho, onClose }) {
  const serifFamily = "var(--font-display, var(--font-body, system-ui))"
  const ital = traveler === 'aurelia' ? 'italic' : 'normal'
  const [phase, setPhase] = useState('init') // init|enroll|scanning|ready|error
  const [who, setWho] = useState(initialWho || traveler)
  const [enrollment, setEnrollment] = useState({})
  const [indexTick, setIndexTick] = useState(0) // bump to recompute matches
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [error, setError] = useState('')
  const [lightbox, setLightbox] = useState(null)
  const [undo, setUndo] = useState(null) // { entryKey, who } after a "not me"
  // enroll sub-state
  const [activePerson, setActivePerson] = useState(initialWho || traveler)
  const [enrollFaces, setEnrollFaces] = useState(null)
  const [busy, setBusy] = useState('')
  const engineReady = useRef(false)
  const matchRef = useRef({ facesByKey: {}, centroids: [], rejections: new Set() })

  // All scannable entries: current trip first, then the rest.
  const entries = useMemo(() => {
    const seen = new Set()
    const acc = []
    const order = [trip, ...(trips || []).filter((t) => t && t.id !== trip?.id)].filter(Boolean)
    for (const t of order) {
      for (const e of flattenPhotoEntries(listMemoriesForTrip(t.id, traveler))) {
        if (!scanUrlForEntry(e) || seen.has(e.key)) continue
        seen.add(e.key)
        acc.push(e)
      }
    }
    return acc
  }, [trip, trips, traveler])

  const stillPhotos = useMemo(() => entries.filter((e) => !e.isVideo && e.url), [entries])

  // Enroll strip: shuffle once per session, then ↻ advances through the
  // shuffle in pages — so a different swath shows each visit AND every
  // photo is reachable (find the rare ones: the photographer, Helen).
  const [enrollPage, setEnrollPage] = useState(0)
  const ENROLL_PAGE = 60
  const shuffledStills = useMemo(() => sampleShuffle(stillPhotos), [stillPhotos])
  const enrollPool = useMemo(() => {
    if (shuffledStills.length <= ENROLL_PAGE) return shuffledStills
    const start = (enrollPage * ENROLL_PAGE) % shuffledStills.length
    return Array.from(
      { length: Math.min(ENROLL_PAGE, shuffledStills.length) },
      (_, i) => shuffledStills[(start + i) % shuffledStills.length],
    )
  }, [shuffledStills, enrollPage])

  const enrolledIds = useMemo(
    () => Object.values(enrollment).filter((p) => p.embeddings?.length).map((p) => p.personId),
    [enrollment],
  )

  const ensureEngine = useCallback(async () => {
    if (engineReady.current) return
    setBusy('Waking up the face finder…')
    await initFaceEngine()
    engineReady.current = true
    setBusy('')
  }, [])

  const refreshMatchData = useCallback(async () => {
    const [facesByKey, centroids, rejections] = await Promise.all([
      getFacesByKey(),
      enrolledCentroids(),
      getRejections(),
    ])
    matchRef.current = { facesByKey, centroids, rejections }
    setIndexTick((t) => t + 1)
  }, [])

  // "Not me" correction: drop a wrongly-matched photo from the current
  // person, with a brief Undo.
  const rejectFromPerson = useCallback(
    async (entry) => {
      await addRejection(entry.key, who)
      setUndo({ entryKey: entry.key, who })
      refreshMatchData()
    },
    [who, refreshMatchData],
  )
  const undoReject = useCallback(async () => {
    if (!undo) return
    await removeRejection(undo.entryKey, undo.who)
    setUndo(null)
    refreshMatchData()
  }, [undo, refreshMatchData])
  useEffect(() => {
    if (!undo) return undefined
    const t = setTimeout(() => setUndo(null), 6000)
    return () => clearTimeout(t)
  }, [undo])

  // Decide the opening phase: ready (nothing new to scan) renders without
  // loading the model; otherwise enroll or scan.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const enr = await getEnrollment()
        if (!alive) return
        setEnrollment(enr)
        const haveAnyone = Object.values(enr).some((p) => p.embeddings?.length)
        if (!haveAnyone) {
          setPhase('enroll')
          return
        }
        await refreshMatchData()
        const pending = await pendingScan(entries)
        if (!alive) return
        if (pending.length > 0) runScan()
        else setPhase('ready')
      } catch (e) {
        setError(e.message)
        setPhase('error')
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries])

  const runScan = useCallback(async () => {
    setPhase('scanning')
    setError('')
    try {
      await ensureEngine()
      await runRecognitionPass(entries, {
        onProgress: (done, total) => setProgress({ done, total }),
      })
      await refreshMatchData()
      setPhase('ready')
    } catch (e) {
      setError(`Scan failed: ${e.message}`)
      setPhase('ready')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, ensureEngine, refreshMatchData])

  // ─── enrollment ──────────────────────────────────────────────────

  const openEnrollPhoto = useCallback(
    async (entry) => {
      setBusy('Finding faces…')
      setError('')
      // Load the recognizer first, in its OWN try, so a model-LOAD failure
      // (no network / model fetch failed) reports an honest "couldn't load
      // the recognizer" instead of being mislabeled as a bad photo below.
      try {
        await ensureEngine()
      } catch (e) {
        setError(`Couldn't load the recognizer: ${e.message}`)
        setBusy('')
        return
      }
      try {
        const bmp = await loadImageBitmap(entry.url)
        const dets = await detectFaces(bmp)
        setEnrollFaces({ faces: dets.map((d) => ({ detection: d, thumb: faceThumb(bmp, d.box) })), bitmap: bmp })
        if (dets.length === 0) setError('No faces found in that photo.')
      } catch (e) {
        setError(`Couldn't read that photo: ${e.message}`)
      } finally {
        setBusy('')
      }
    },
    [ensureEngine],
  )

  const assignFace = useCallback(
    async (face) => {
      setBusy('Remembering this face…')
      try {
        const emb = await embedDetection(enrollFaces.bitmap, face.detection)
        await addExemplar(activePerson, emb, face.thumb)
        setEnrollment(await getEnrollment())
      } catch (e) {
        setError(`Couldn't save: ${e.message}`)
      } finally {
        setBusy('')
      }
    },
    [enrollFaces, activePerson],
  )

  const finishEnroll = useCallback(async () => {
    setEnrollFaces(null)
    await refreshMatchData()
    runScan()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshMatchData])

  // ─── derived display data ────────────────────────────────────────

  const hits = useMemo(() => {
    const { facesByKey, centroids, rejections } = matchRef.current
    return selectPhotosWith(entries, facesByKey, centroids, who, DEFAULT_MATCH_THRESHOLD, rejections)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [who, indexTick, entries])

  const counts = useMemo(() => {
    const { facesByKey, centroids, rejections } = matchRef.current
    return personCounts(entries, facesByKey, centroids, DEFAULT_MATCH_THRESHOLD, rejections)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indexTick, entries])

  const photoHits = useMemo(() => hits.filter((h) => !h.entry.isVideo), [hits])
  const videoHits = useMemo(() => hits.filter((h) => h.entry.isVideo), [hits])
  // Ordered by face AREA (biggest face first) — i.e. the closest/clearest
  // shots of this person. This is a "closest shot" heuristic, NOT an
  // aesthetic "flattering" judgement; the UI label matches what it measures.
  const closestShots = useMemo(
    () => [...photoHits].sort((a, b) => area(b.box) - area(a.box)).slice(0, 8),
    [photoHits],
  )
  const isMe = who === traveler
  const isRafa = who === 'rafa'
  const isBest = who === 'aurelia' || who === 'helen'
  const heroName = isMe ? (traveler === 'rafa' ? 'me' : 'you') : displayName(who, traveler)

  // ─── styles ──────────────────────────────────────────────────────
  const S = {
    root: {
      position: 'fixed',
      inset: 0,
      zIndex: 70,
      background: 'var(--bg)',
      color: 'var(--text)',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'var(--font-body, system-ui)',
    },
    bar: {
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: 'calc(env(safe-area-inset-top) + 10px) 16px 6px',
    },
    eyebrow: { fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--muted)' },
    btn: (on) => ({
      background: on ? 'var(--accent)' : 'transparent',
      color: on ? 'var(--accent-ink, #fff)' : 'var(--text)',
      border: '1px solid var(--border)',
      borderRadius: 999,
      padding: '8px 14px',
      fontSize: 13,
      cursor: 'pointer',
    }),
    h: { fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase', color: 'var(--accent-text, var(--muted))', fontWeight: 600, marginBottom: 11 },
  }

  // ─── render ──────────────────────────────────────────────────────
  function TopBar() {
    return (
      <div style={S.bar} data-testid="person-view">
        <button onClick={onClose} style={S.btn(false)} aria-label="Close">← Back</button>
        <span style={S.eyebrow}>Show me, me</span>
      </div>
    )
  }

  if (phase === 'init') {
    return (
      <div style={S.root}>
        <TopBar />
        <Centered>Looking…</Centered>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div style={S.root}>
        <TopBar />
        <Centered>Something went wrong: {error}</Centered>
      </div>
    )
  }

  if (phase === 'enroll') {
    return (
      <div style={S.root} data-testid="person-view-enroll">
        <TopBar />
        <div style={{ padding: '4px 18px 30px' }}>
          <div style={{ fontFamily: serifFamily, fontStyle: ital, fontSize: 26, fontWeight: 700, marginTop: 6 }}>
            Teach the app your family
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 14, marginTop: 6, marginBottom: 16 }}>
            Pick a person, tap a clear photo of them, then tap their face. A couple each is plenty. Nothing leaves this iPad.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {TRAVELER_LIST.map((id) => (
              <button
                key={id}
                onClick={() => { setActivePerson(id); setEnrollFaces(null) }}
                style={{ ...S.btn(activePerson === id), display: 'flex', alignItems: 'center', gap: 7 }}
                data-testid={`person-enroll-${id}`}
              >
                <Avatar id={id} size={20} />
                {id === traveler ? 'you' : displayName(id, traveler)} ({enrollment[id]?.embeddings?.length || 0})
              </button>
            ))}
          </div>
          {enrollFaces && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
                Tap {cap(displayName(activePerson, traveler))}'s face:
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {enrollFaces.faces.map((f, i) => (
                  <img
                    key={i}
                    src={f.thumb}
                    alt=""
                    width={72}
                    height={72}
                    onClick={() => assignFace(f)}
                    style={{ borderRadius: 12, cursor: 'pointer', border: '2px solid var(--border)' }}
                    data-testid="person-enroll-face"
                  />
                ))}
                {enrollFaces.faces.length === 0 && <span style={{ color: 'var(--muted)', fontSize: 13 }}>No faces here — try another.</span>}
              </div>
            </div>
          )}
          {stillPhotos.length > ENROLL_PAGE && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                Showing {enrollPool.length} of {stillPhotos.length} — not pictured? tap for a different batch.
              </span>
              <button onClick={() => setEnrollPage((p) => p + 1)} style={{ ...S.btn(false), flexShrink: 0 }} data-testid="person-enroll-shuffle">
                ↻ Different photos
              </button>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px,1fr))', gap: 6 }}>
            {enrollPool.map((e) => (
              <img
                key={e.key}
                src={e.url}
                alt=""
                loading="lazy"
                onClick={() => openEnrollPhoto(e)}
                style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 10, cursor: 'pointer' }}
              />
            ))}
          </div>
          <button
            onClick={finishEnroll}
            disabled={enrolledIds.length === 0 || !!busy}
            style={{ ...S.btn(true), marginTop: 18, opacity: enrolledIds.length === 0 ? 0.5 : 1 }}
            data-testid="person-enroll-done"
          >
            Find everyone →
          </button>
        </div>
        {error && <Toast tone="bad">{error}</Toast>}
        {busy && <Toast>{busy}</Toast>}
      </div>
    )
  }

  if (phase === 'scanning') {
    const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0
    return (
      <div style={S.root} data-testid="person-view-scanning">
        <TopBar />
        <Centered>
          <div style={{ fontFamily: serifFamily, fontStyle: ital, fontSize: 24, fontWeight: 700 }}>Finding everyone…</div>
          <div style={{ color: 'var(--muted)', marginTop: 8 }}>{busy || `${progress.done} of ${progress.total} photos`}</div>
          <div style={{ width: 220, height: 6, borderRadius: 999, background: 'var(--card)', marginTop: 14, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', transition: 'width .2s' }} />
          </div>
        </Centered>
      </div>
    )
  }

  // ── ready ──
  return (
    <div style={S.root} data-testid="person-view-ready">
      <TopBar />
      <div style={{ padding: '4px 18px 30px' }}>
        {/* face picker */}
        <div style={{ ...S.h, marginBottom: 12 }}>Frames with…</div>
        <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
          {TRAVELER_LIST.map((id) => {
            const on = who === id
            const thumb = enrollment[id]?.thumbs?.slice(-1)[0]
            return (
              <button
                key={id}
                onClick={() => setWho(id)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: 0 }}
                data-testid={`person-pick-${id}`}
              >
                <div style={{ borderRadius: '50%', padding: 2, border: `2px solid ${on ? 'var(--accent)' : 'transparent'}` }}>
                  <Avatar id={id} size={46} thumb={thumb} />
                </div>
                <span style={{ fontSize: 11, color: on ? 'var(--text)' : 'var(--muted)', fontWeight: on ? 700 : 500 }}>
                  {id === traveler ? 'you' : displayName(id, traveler)}
                </span>
              </button>
            )
          })}
        </div>

        {/* headline */}
        <div style={{ fontFamily: serifFamily, fontStyle: ital, fontSize: 30, fontWeight: 700, letterSpacing: -0.4, lineHeight: 1.05 }}>
          {isMe ? (traveler === 'rafa' ? 'This is me! 🌟' : 'Here you are') : `${cap(heroName)}, in frame`}
        </div>
        <div style={{ fontFamily: serifFamily, fontStyle: traveler === 'rafa' ? 'normal' : 'italic', fontSize: 14, color: 'var(--muted)', marginTop: 5 }}>
          The app found {isMe ? 'you' : heroName} in {photoHits.length} photo{photoHits.length === 1 ? '' : 's'}
          {videoHits.length > 0 && ` and ${videoHits.length} video${videoHits.length === 1 ? '' : 's'}`} — by face, not by who posted them.
        </div>

        {/* Rafa → video reel */}
        {isRafa && videoHits.length > 0 && (
          <div style={{ marginTop: 22 }}>
            <div style={S.h}>▶ {isMe ? 'You' : heroName}, on video</div>
            <Reel>
              {videoHits.map((h) => (
                <Tile key={h.entry.key} hit={h} onOpen={() => setLightbox(h.entry)} onReject={() => rejectFromPerson(h.entry)} w={140} />
              ))}
            </Reel>
          </div>
        )}

        {/* Aurelia/Helen → closest shots (biggest detected face) */}
        {isBest && closestShots.length > 0 && (
          <div style={{ marginTop: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
              {/* closestShots is sorted by FACE AREA (biggest face first) —
                  the closest/clearest shots of this person, NOT an aesthetic
                  judgement. Label it honestly for what the code measures. */}
              <div style={{ ...S.h, marginBottom: 0 }}>★ {isMe ? 'You' : heroName}, up close</div>
              <span style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 0.5 }}>auto-picked · clearest, closest shots</span>
            </div>
            <Reel>
              {closestShots.map((h) => (
                <Tile key={h.entry.key} hit={h} onOpen={() => setLightbox(h.entry)} onSend={() => sharePhoto(h.entry)} onReject={() => rejectFromPerson(h.entry)} w={150} />
              ))}
            </Reel>
          </div>
        )}

        {/* every frame grid */}
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={S.h}>Every frame</div>
            {hits.length > 0 && <span style={{ fontSize: 10, color: 'var(--muted)' }}>wrong person? tap ✕</span>}
          </div>
          {hits.length === 0 ? (
            <div style={{ fontFamily: serifFamily, fontStyle: 'italic', color: 'var(--muted)', fontSize: 14, padding: '8px 0' }} data-testid="person-empty">
              {enrolledIds.includes(who)
                ? `No frames found with ${heroName} yet.`
                : `Haven't taught the app ${heroName}'s face yet.`}
              {' '}
              <button onClick={() => { setActivePerson(who); setPhase('enroll') }} style={{ ...S.btn(false), padding: '4px 10px', marginLeft: 6 }}>
                ＋ teach faces
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }} data-testid="person-grid">
              {hits.map((h) => (
                <Tile key={h.entry.key} hit={h} onOpen={() => setLightbox(h.entry)} onReject={() => rejectFromPerson(h.entry)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {undo && (
        <div
          style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, background: 'var(--card)', borderTop: '1px solid var(--border)', color: 'var(--text)', zIndex: 81 }}
          data-testid="person-undo"
        >
          <span style={{ fontSize: 13 }}>Removed from {undo.who === traveler ? 'you' : cap(displayName(undo.who, traveler))}</span>
          <button onClick={undoReject} style={S.btn(true)} data-testid="person-undo-btn">Undo</button>
        </div>
      )}
      {lightbox && <Lightbox entry={lightbox} onClose={() => setLightbox(null)} />}
      {error && <Toast tone="bad">{error}</Toast>}
    </div>
  )
}

function area(box) {
  return Array.isArray(box) && box.length >= 4 ? box[2] * box[3] : 0
}

// Shuffle a copy (Fisher–Yates) so the enroll strip shows a different
// swath each session — the photographer and the under-photographed are
// rarely in the first photos, so a fixed slice never surfaces them.
function sampleShuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = a[i]
    a[i] = a[j]
    a[j] = t
  }
  return a
}

function Centered({ children }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24, gap: 4 }}>
      {children}
    </div>
  )
}

function Reel({ children }) {
  return <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>{children}</div>
}

function Tile({ hit, onOpen, onSend, onReject, w }) {
  const e = hit.entry
  const img = e.isVideo ? e.posterUrl : e.url
  const style = w
    ? { flexShrink: 0, width: w, aspectRatio: '9/13', position: 'relative', borderRadius: 14, overflow: 'hidden', cursor: 'pointer' }
    : { position: 'relative', aspectRatio: '1', borderRadius: 10, overflow: 'hidden', cursor: 'pointer' }
  return (
    <div style={style} onClick={onOpen} data-testid="person-tile">
      {img ? (
        <img src={img} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', background: 'var(--card)' }} />
      )}
      {onReject && (
        <button
          onClick={(ev) => {
            ev.stopPropagation()
            onReject()
          }}
          aria-label="Not this person"
          title="Not this person"
          style={{ position: 'absolute', top: 6, left: 6, width: 24, height: 24, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, lineHeight: '24px', padding: 0 }}
          data-testid="person-not-me"
        >
          ✕
        </button>
      )}
      {e.isVideo && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }} data-testid="person-tile-video">▶</div>
      )}
      {onSend && (
        <button
          onClick={(ev) => {
            ev.stopPropagation()
            onSend()
          }}
          style={{ position: 'absolute', right: 8, bottom: 8, display: 'flex', alignItems: 'center', gap: 5, background: 'var(--accent)', color: 'var(--accent-ink, #fff)', border: 'none', borderRadius: 999, padding: '6px 11px', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
          data-testid="person-send"
        >
          ⤴ Send
        </button>
      )}
    </div>
  )
}

// Share a photo out via the OS share sheet (Aurelia's signature verb),
// reusing the Weave's pattern; honest download fallback when file-share
// isn't supported. Nothing is uploaded — the file is shared device-side.
async function sharePhoto(entry) {
  try {
    const resp = await fetch(entry.url)
    const blob = await resp.blob()
    const file = new File([blob], 'photo.jpg', { type: blob.type || 'image/jpeg' })
    const shareData = { files: [file], title: 'A photo' }
    if (navigator.canShare?.(shareData)) {
      await navigator.share(shareData)
      return
    }
    if (navigator.share) {
      await navigator.share({ url: entry.url, title: 'A photo' })
      return
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'photo.jpg'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch {
    /* user cancelled, or share/file-share unsupported */
  }
}

function Lightbox({ entry, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      data-testid="person-lightbox"
    >
      {entry.isVideo ? (
        <video src={entry.url} poster={entry.posterUrl} controls autoPlay playsInline style={{ maxWidth: '100%', maxHeight: '100%' }} />
      ) : (
        <img src={entry.url} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
      )}
    </div>
  )
}

function Toast({ children, tone }) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 12,
        textAlign: 'center',
        background: tone === 'bad' ? '#7a1f1f' : 'var(--accent)',
        color: tone === 'bad' ? '#fff' : 'var(--accent-ink, #fff)',
      }}
    >
      {children}
    </div>
  )
}
