// FaceSpike — the prove-it screen for Increment C's on-device face
// recognizer. NOT the real "Show me, me" surface (that's PersonView,
// recreated later from the design); this is a diagnostic that answers
// the one question the whole increment rests on: does detect → embed →
// match run fast + accurate enough on the actual iPad?
//
// Reached only via the ?facespike=1 URL flag, so it never disturbs the
// family app. Everything runs on-device (faceModel.js) — no photo or
// fingerprint leaves the iPad.
//
// Flow: (1) load the models, timed; (2) teach it faces — tap a clear
// photo, then tap the face to assign it to a person; (3) scan the
// trip's photos and read back who-was-found, the per-photo
// milliseconds, and the same-vs-different similarity spread (so we tune
// the accept threshold from real numbers, not a guess).

import { useState, useMemo, useCallback } from 'react'
import { listMemoriesForTrip } from '../lib/memoryStore'
import { flattenPhotoEntries } from '../lib/photoEntries'
import {
  initFaceEngine,
  detectFaces,
  embedDetection,
  detectAndEmbed,
  loadImageBitmap,
  FACE_CONFIG,
} from '../lib/faceModel'
import {
  enrollPerson,
  matchToEnrolled,
  rankMatches,
  DEFAULT_MATCH_THRESHOLD,
} from '../lib/faceMatch'

const PEOPLE = [
  { id: 'rafa', name: 'Rafa', dot: '#E8552E' },
  { id: 'aurelia', name: 'Aurelia', dot: '#E8478C' },
  { id: 'helen', name: 'Mama', dot: '#2E7D52' },
  { id: 'jonathan', name: 'Papa', dot: '#2E6BB8' },
]
const nameOf = (id) => PEOPLE.find((p) => p.id === id)?.name || id
const dotOf = (id) => PEOPLE.find((p) => p.id === id)?.dot || '#888'

// Draw a face's bounding box (with margin) to a small dataURL for the UI.
function faceThumb(bitmap, box, px = 96) {
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

export function FaceSpike({ trip, trips, traveler, onClose }) {
  const [engine, setEngine] = useState({ status: 'idle' }) // idle|loading|ready|error
  const [activePerson, setActivePerson] = useState('rafa')
  // enrolled: { [id]: { embeddings: Float32Array[], thumbs: string[] } }
  const [enrolled, setEnrolled] = useState({})
  const [enrollFaces, setEnrollFaces] = useState(null) // faces of the tapped photo
  const [busy, setBusy] = useState('')
  const [threshold, setThreshold] = useState(DEFAULT_MATCH_THRESHOLD)
  const [scan, setScan] = useState(null) // { results, timing }
  const [error, setError] = useState('')

  // Gather still photos to work with: current trip first, topped up from
  // other trips so there's always enough to test. Videos skipped.
  const photos = useMemo(() => {
    const seen = new Set()
    const acc = []
    const order = [trip, ...(trips || []).filter((t) => t && t.id !== trip?.id)].filter(Boolean)
    for (const t of order) {
      const entries = flattenPhotoEntries(listMemoriesForTrip(t.id, traveler))
      for (const e of entries) {
        if (e.isVideo || !e.url || seen.has(e.url)) continue
        seen.add(e.url)
        acc.push({ key: e.key, url: e.url, tripId: t.id, caption: e.caption })
      }
    }
    return acc
  }, [trip, trips, traveler])

  const enrolledList = useMemo(
    () =>
      Object.entries(enrolled)
        .filter(([, v]) => v.embeddings.length > 0)
        .map(([personId, v]) => enrollPerson(personId, v.embeddings)),
    [enrolled],
  )

  const loadEngine = useCallback(async () => {
    setEngine({ status: 'loading' })
    setError('')
    try {
      const info = await initFaceEngine()
      setEngine({ status: 'ready', info })
    } catch (e) {
      setEngine({ status: 'error' })
      setError(`Model load failed: ${e.message}`)
    }
  }, [])

  // Tap an enroll photo → detect its faces, show them for assignment.
  const openEnrollPhoto = useCallback(async (photo) => {
    setBusy('Finding faces…')
    setError('')
    try {
      const bmp = await loadImageBitmap(photo.url)
      const dets = await detectFaces(bmp)
      const faces = dets.map((d) => ({ detection: d, thumb: faceThumb(bmp, d.box) }))
      setEnrollFaces({ photo, faces, bitmap: bmp })
      if (faces.length === 0) setError('No faces found in that photo.')
    } catch (e) {
      setError(`Detect failed: ${e.message}`)
    } finally {
      setBusy('')
    }
  }, [])

  // Tap a detected face → embed it, add to the active person.
  const enrollFace = useCallback(
    async (face) => {
      setBusy('Fingerprinting…')
      try {
        const emb = await embedDetection(enrollFaces.bitmap, face.detection)
        setEnrolled((prev) => {
          const cur = prev[activePerson] || { embeddings: [], thumbs: [] }
          return {
            ...prev,
            [activePerson]: {
              embeddings: [...cur.embeddings, emb],
              thumbs: [...cur.thumbs, face.thumb],
            },
          }
        })
      } catch (e) {
        setError(`Embed failed: ${e.message}`)
      } finally {
        setBusy('')
      }
    },
    [enrollFaces, activePerson],
  )

  // Scan every photo: detect + embed all faces, keep the embeddings so
  // the threshold slider can re-decide matches without re-running.
  const runScan = useCallback(async () => {
    if (enrolledList.length === 0) {
      setError('Teach it at least one person first.')
      return
    }
    setBusy('Scanning…')
    setError('')
    const results = []
    let totalDetect = 0
    let faceCount = 0
    const t0 = performance.now()
    try {
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i]
        setBusy(`Scanning ${i + 1} / ${photos.length}…`)
        try {
          const bmp = await loadImageBitmap(photo.url)
          const tp = performance.now()
          const faces = await detectAndEmbed(bmp)
          const ms = performance.now() - tp
          totalDetect += ms
          faceCount += faces.length
          results.push({
            key: photo.key,
            url: photo.url,
            ms: Math.round(ms),
            faces: faces.map((f) => ({ box: f.box, embedding: f.embedding, embedMs: f.embedMs })),
          })
          bmp.close?.()
        } catch (e) {
          results.push({ key: photo.key, url: photo.url, error: e.message, faces: [] })
        }
      }
      const wall = performance.now() - t0
      setScan({
        results,
        timing: {
          photos: photos.length,
          faceCount,
          avgMs: photos.length ? Math.round(totalDetect / photos.length) : 0,
          wallSec: (wall / 1000).toFixed(1),
        },
      })
    } finally {
      setBusy('')
    }
  }, [photos, enrolledList])

  // Re-decide matches live as the threshold moves (no re-inference).
  const decided = useMemo(() => {
    if (!scan) return null
    const counts = {}
    const perPhoto = scan.results.map((r) => {
      const matches = (r.faces || []).map((f) => {
        const m = matchToEnrolled(f.embedding, enrolledList, { threshold })
        if (m) counts[m.personId] = (counts[m.personId] || 0) + 1
        const ranked = rankMatches(f.embedding, enrolledList)
        return { match: m, top: ranked[0] || null }
      })
      return { ...r, matches }
    })
    return { perPhoto, counts }
  }, [scan, enrolledList, threshold])

  // ─── styling via the active persona's theme tokens ───────────────
  const S = {
    root: {
      position: 'fixed',
      inset: 0,
      zIndex: 70,
      background: 'var(--bg)',
      color: 'var(--text)',
      overflowY: 'auto',
      padding: 'calc(env(safe-area-inset-top) + 14px) 16px 40px',
      fontFamily: 'var(--font-body, system-ui)',
    },
    card: {
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: 14,
      marginBottom: 14,
    },
    h: { fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 },
    btn: (on) => ({
      background: on ? 'var(--accent)' : 'transparent',
      color: on ? 'var(--accent-ink, #fff)' : 'var(--text)',
      border: '1px solid var(--border)',
      borderRadius: 999,
      padding: '7px 13px',
      fontSize: 13,
      cursor: 'pointer',
    }),
  }

  return (
    <div style={S.root} data-testid="face-spike">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <button onClick={onClose} style={S.btn(false)} aria-label="Close">← Back</button>
        <strong style={{ fontSize: 17 }}>Face recognizer — prove-it</strong>
      </div>

      {error && (
        <div style={{ ...S.card, borderColor: '#c0392b', color: '#e74c3c' }} data-testid="face-spike-error">
          {error}
        </div>
      )}

      {/* 1. Models */}
      <div style={S.card}>
        <div style={S.h}>1 · Load the models (on-device)</div>
        {engine.status !== 'ready' ? (
          <button
            onClick={loadEngine}
            disabled={engine.status === 'loading'}
            style={S.btn(true)}
            data-testid="face-spike-load"
          >
            {engine.status === 'loading' ? 'Loading…' : 'Load the face models'}
          </button>
        ) : (
          <div data-testid="face-spike-loaded" style={{ fontSize: 14, lineHeight: 1.7 }}>
            ✓ Ready · detector {engine.info.detectorMs}ms · fingerprint {engine.info.embedderMs}ms
            <br />
            engine: <strong>{engine.info.backend.embedder}</strong>
            {' · '}detector: <strong>{engine.info.backend.delegate}</strong>
            {' · '}WebGPU available: <strong>{String(engine.info.backend.webgpu)}</strong>
          </div>
        )}
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
          {photos.length} photos available to test · fingerprint model:{' '}
          <code>{FACE_CONFIG.embedderModel.split('/').slice(-3, -1).join('/')}</code> (provisional)
        </div>
      </div>

      {/* 2. Enroll */}
      {engine.status === 'ready' && (
        <div style={S.card}>
          <div style={S.h}>2 · Teach it faces</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {PEOPLE.map((p) => (
              <button
                key={p.id}
                onClick={() => setActivePerson(p.id)}
                style={{ ...S.btn(activePerson === p.id), display: 'flex', alignItems: 'center', gap: 6 }}
                data-testid={`face-spike-person-${p.id}`}
              >
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.dot }} />
                {p.name} ({enrolled[p.id]?.embeddings.length || 0})
              </button>
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
            Tap a clear photo of <strong>{nameOf(activePerson)}</strong>, then tap their face.
          </div>
          {/* enroll thumbnails of the active person */}
          {enrolled[activePerson]?.thumbs?.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              {enrolled[activePerson].thumbs.map((t, i) => (
                <img key={i} src={t} alt="" width={48} height={48} style={{ borderRadius: 8, border: `2px solid ${dotOf(activePerson)}` }} />
              ))}
            </div>
          )}
          {/* faces detected in the currently-tapped photo */}
          {enrollFaces && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
                {enrollFaces.faces.length} face(s) — tap to assign to {nameOf(activePerson)}:
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {enrollFaces.faces.map((f, i) => (
                  <img
                    key={i}
                    src={f.thumb}
                    alt=""
                    width={72}
                    height={72}
                    onClick={() => enrollFace(f)}
                    style={{ borderRadius: 10, cursor: 'pointer', border: '2px solid var(--border)' }}
                    data-testid="face-spike-enroll-face"
                  />
                ))}
              </div>
            </div>
          )}
          {/* photo strip to pick enroll shots from */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px,1fr))', gap: 6 }}>
            {photos.slice(0, 40).map((p) => (
              <img
                key={p.key}
                src={p.url}
                alt=""
                loading="lazy"
                onClick={() => openEnrollPhoto(p)}
                style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, cursor: 'pointer' }}
              />
            ))}
          </div>
        </div>
      )}

      {/* 3. Scan */}
      {engine.status === 'ready' && (
        <div style={S.card}>
          <div style={S.h}>3 · Find everyone</div>
          <button onClick={runScan} disabled={!!busy} style={S.btn(true)} data-testid="face-spike-scan">
            Scan {photos.length} photos
          </button>
          <div style={{ marginTop: 12, fontSize: 13 }}>
            Accept threshold: <strong>{threshold.toFixed(2)}</strong>
            <input
              type="range"
              min="0"
              max="0.8"
              step="0.01"
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>

          {decided && (
            <div style={{ marginTop: 12 }} data-testid="face-spike-results">
              <div style={{ fontSize: 14, marginBottom: 10 }}>
                <strong>{scan.timing.photos}</strong> photos · <strong>{scan.timing.faceCount}</strong> faces ·{' '}
                <strong>{scan.timing.avgMs}ms</strong>/photo · {scan.timing.wallSec}s total
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                {PEOPLE.map((p) => (
                  <span key={p.id} style={{ fontSize: 13 }}>
                    <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: p.dot, marginRight: 5 }} />
                    {p.name}: <strong>{decided.counts[p.id] || 0}</strong>
                  </span>
                ))}
              </div>
              {/* per-photo detail */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px,1fr))', gap: 8 }}>
                {decided.perPhoto.map((r) => (
                  <div key={r.key} style={{ fontSize: 11 }}>
                    <img src={r.url} alt="" loading="lazy" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 6 }} />
                    <div style={{ color: 'var(--muted)', marginTop: 2 }}>{r.ms}ms · {r.faces?.length || 0} face(s)</div>
                    {(r.matches || []).map((m, i) => (
                      <div key={i} style={{ color: m.match ? dotOf(m.match.personId) : 'var(--muted)' }}>
                        {m.match
                          ? `${nameOf(m.match.personId)} ${m.match.similarity.toFixed(2)}`
                          : m.top
                            ? `? (${nameOf(m.top.personId)} ${m.top.similarity.toFixed(2)})`
                            : '—'}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {busy && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: 12, textAlign: 'center', background: 'var(--accent)', color: 'var(--accent-ink, #fff)' }} data-testid="face-spike-busy">
          {busy}
        </div>
      )}
    </div>
  )
}
