import { useEffect, useRef, useState } from 'react'
import { Camera, Mic, Trash2, Lock, Unlock, Play, X, ImageOff, Share2 } from 'lucide-react'
import { TRAVELERS, TRAVELER_DOT } from '../data/travelers'
import {
  listMemoriesForStop,
  saveMemory,
  deleteMemory,
} from '../lib/memoryStore'
import { transcribeWithStatus, isWhisperConfigured } from '../lib/whisper'
import { saveAsset, loadAsset, makeAssetKey } from '../lib/memAssets'
import { refIdbAssetKey } from '../lib/photoEntries'
import { hasPendingPoster } from '../lib/posterRetry'
import { Avatar, AvatarStack } from './Avatar'
import { VoiceRecorder } from './VoiceRecorder'
import { PhotoLightbox } from './PhotoAlbum'
import { ShareMomentSheet } from './ShareMomentSheet'
import { isWorkerConfigured } from '../lib/workerSync'

const MAX_PHOTOS_PER_ALBUM = 10

// Direction 02 — Threaded Memories. Per Design system.jsx /
// variant-threaded.jsx, each stop carries a vertical thread of memories
// from the four travelers. Bubbles right-align for the active traveler
// ("me") and left-align for everyone else. A bottom composer takes
// text + photo + voice; voice opens the full-screen VoiceRecorder.
//
// The photo path is real: tapping the camera icon opens a multi-photo
// tray (up to 10) → IDB store via lib/memAssets → photoRefs[] on the
// Memory record → R2 upload via workerSync.pushMemory.
export function ThreadedMemories({ trip, stop, traveler }) {
  const [memories, setMemories] = useState(() =>
    listMemoriesForStop(stop.id, traveler)
  )
  const [text, setText] = useState('')
  const [recording, setRecording] = useState(false)
  const [visibility, setVisibility] = useState('shared')
  const [error, setError] = useState('')
  // Pending photo album: files the user just picked but hasn't saved.
  // Showing a tray above the composer keeps the picker → caption →
  // save flow in one place rather than a full-screen modal.
  const [pendingPhotos, setPendingPhotos] = useState([])
  const [photoCaption, setPhotoCaption] = useState('')
  const [savingPhotos, setSavingPhotos] = useState(false)
  // Lightbox for tapping photos inside the thread. Scope: memory-only
  // (swipe walks the photos of the tapped memory, then stops at the
  // ends). PhotoBubble builds the entries array using its resolved
  // urls map so IDB-only memories work the same as R2-backed ones.
  const [lightbox, setLightbox] = useState(null) // { list, index } | null
  // Share sheet for a text/voice memory (photos share from the lightbox; this
  // closes the reach gap for non-photo moments). Holds the memory id to share.
  const [shareId, setShareId] = useState(null)
  function stepLightbox(delta) {
    setLightbox((lb) => {
      if (!lb) return lb
      const ni = Math.max(0, Math.min(lb.list.length - 1, lb.index + delta))
      return { ...lb, index: ni }
    })
  }

  function refresh() {
    setMemories(listMemoriesForStop(stop.id, traveler))
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stop.id, traveler])

  function sendText() {
    const body = text.trim()
    if (!body) return
    try {
      saveMemory({
        tripId: trip.id,
        stopId: stop.id,
        authorTraveler: traveler,
        visibility,
        kind: 'text',
        text: body,
      })
      setText('')
      refresh()
    } catch (err) {
      setError('Save failed — local storage may be full.')
    }
  }

  async function handleVoiceStop(payload) {
    setRecording(false)
    if (!payload) return
    const { blob, durationSeconds, mime } = payload

    // Save audio to IndexedDB and write a pending Memory immediately so
    // the bubble appears in-thread right away. Transcript fills in once
    // Whisper returns.
    const audioKey = makeAssetKey('audio')
    await saveAsset('audio', audioKey, blob, mime)
    const initial = saveMemory({
      tripId: trip.id,
      stopId: stop.id,
      authorTraveler: traveler,
      visibility,
      kind: 'voice',
      audioRef: { storage: 'idb', key: audioKey },
      durationSeconds,
      transcriptionStatus: isWhisperConfigured() ? 'pending' : 'skipped',
    })
    refresh()

    if (!isWhisperConfigured()) return
    const out = await transcribeWithStatus(blob)
    saveMemory({
      ...initial,
      kind: 'voice',
      transcript: out.transcript || null,
      transcriptLang: out.language || null,
      transcriptionStatus: out.status,
    })
    refresh()
  }

  function addPhotoFiles(fileList) {
    if (!fileList || fileList.length === 0) return
    setError('')
    const incoming = Array.from(fileList).filter((f) =>
      (f.type || '').startsWith('image/')
    )
    if (incoming.length === 0) return
    setPendingPhotos((prev) => {
      const room = MAX_PHOTOS_PER_ALBUM - prev.length
      if (room <= 0) return prev
      const accepted = incoming.slice(0, room).map((file) => ({
        id: `pp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        file,
        url: URL.createObjectURL(file),
      }))
      return [...prev, ...accepted]
    })
  }

  function removePendingPhoto(id) {
    setPendingPhotos((prev) => {
      const target = prev.find((p) => p.id === id)
      if (target?.url) URL.revokeObjectURL(target.url)
      return prev.filter((p) => p.id !== id)
    })
  }

  function clearPendingPhotos() {
    setPendingPhotos((prev) => {
      prev.forEach((p) => p.url && URL.revokeObjectURL(p.url))
      return []
    })
    setPhotoCaption('')
  }

  async function savePhotoAlbum() {
    if (pendingPhotos.length === 0) return
    setSavingPhotos(true)
    setError('')
    try {
      const refs = []
      for (const p of pendingPhotos) {
        const key = makeAssetKey('photo')
        // saveAsset auto-downscales photos via preparePhotoForUpload and
        // returns `prepared` (the pipeline result, incl. exif). We read the
        // mime so the photoRef tracks the actual stored bytes (image/jpeg),
        // plus the capture date AND the GPS lat/lng the pipeline extracted
        // from the original file's EXIF. Both were dropped here — the date
        // made albums sort by upload time, the lat/lng left every photo
        // with no location label and nothing for the auto-filer to match.
        // Mirrors AddDispatchModal's single-photo path. Per-ref, and omitted
        // (not null) when absent so memoryStore's derivation falls back
        // instead of short-circuiting.
        const { mime, prepared } = await saveAsset('photo', key, p.file, p.file.type)
        const capturedAt = prepared?.exif?.capturedAt
        const lat = prepared?.exif?.lat
        const lng = prepared?.exif?.lng
        refs.push({
          storage: 'idb',
          key,
          mime,
          ...(capturedAt ? { capturedAt } : {}),
          ...(Number.isFinite(lat) ? { lat } : {}),
          ...(Number.isFinite(lng) ? { lng } : {}),
        })
      }
      saveMemory({
        tripId: trip.id,
        stopId: stop.id,
        authorTraveler: traveler,
        visibility,
        kind: 'photo',
        photoRefs: refs,
        caption: photoCaption.trim() || undefined,
        text: photoCaption.trim() || undefined,
      })
      clearPendingPhotos()
      refresh()
    } catch (err) {
      console.error('photo save failed', err)
      setError('Photos failed to save — your storage may be full.')
    } finally {
      setSavingPhotos(false)
    }
  }

  // Release any pending preview URLs on unmount.
  useEffect(() => {
    return () => {
      pendingPhotos.forEach((p) => p.url && URL.revokeObjectURL(p.url))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Memories are sorted ascending by createdAt; render newest at the
  // bottom so the thread reads top-down like iMessage.
  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 14,
        }}
      >
        <p className="smallcaps f-mono" style={{ fontSize: 11, opacity: 0.7 }}>
          {memories.length === 0
            ? 'no memories yet'
            : `${memories.length} ${memories.length === 1 ? 'memory' : 'memories'} · live thread`}
        </p>
        <AvatarStack ids={stop.for || trip.travelers || []} size={18} />
      </div>

      <div className="thread">
        {memories.map((m) => (
          <ThreadEntry
            key={m.id}
            mem={m}
            traveler={traveler}
            onDelete={() => {
              deleteMemory(m)
              refresh()
            }}
            onOpenLightbox={setLightbox}
            onShare={() => setShareId(m.id)}
          />
        ))}
      </div>

      {pendingPhotos.length > 0 && (
        <PhotoAlbumTray
          photos={pendingPhotos}
          caption={photoCaption}
          onCaption={setPhotoCaption}
          onRemove={removePendingPhoto}
          onCancel={clearPendingPhotos}
          onSave={savePhotoAlbum}
          saving={savingPhotos}
          maxPhotos={MAX_PHOTOS_PER_ALBUM}
        />
      )}

      <Composer
        traveler={traveler}
        text={text}
        onText={setText}
        onSend={sendText}
        onMic={() => {
          setError('')
          setRecording(true)
        }}
        onPickPhotos={addPhotoFiles}
        canPickMore={pendingPhotos.length < MAX_PHOTOS_PER_ALBUM}
        visibility={visibility}
        onVisibility={() =>
          setVisibility(visibility === 'private' ? 'shared' : 'private')
        }
      />

      {error && (
        <p
          className="f-sans"
          style={{ marginTop: 10, fontSize: 12, color: 'var(--accent-text)' }}
        >
          {error}
        </p>
      )}

      {recording && (
        <VoiceRecorder
          onCancel={() => setRecording(false)}
          onStop={handleVoiceStop}
        />
      )}

      {lightbox && (
        <PhotoLightbox
          entry={lightbox.list[lightbox.index]}
          index={lightbox.index}
          total={lightbox.list.length}
          onPrev={lightbox.index > 0 ? () => stepLightbox(-1) : null}
          onNext={
            lightbox.index < lightbox.list.length - 1
              ? () => stepLightbox(1)
              : null
          }
          onClose={() => setLightbox(null)}
          onCapturedAtChanged={refresh}
          onCaptionChanged={refresh}
        />
      )}

      {shareId && (
        <ShareMomentSheet memoryId={shareId} onClose={() => setShareId(null)} />
      )}
    </div>
  )
}

function ThreadEntry({ mem, traveler, onDelete, onOpenLightbox, onShare }) {
  const author = TRAVELERS[mem.authorTraveler]
  if (!author) return null
  const isMe = mem.authorTraveler === traveler
  const dot = TRAVELER_DOT[mem.authorTraveler] || 'var(--text)'
  const time = formatTime(mem.createdAt)
  const kind = mem.kind || 'text'
  // Text/voice moments can be shared out too (photos share from the lightbox).
  // Only a SHARED moment, and only when the worker's configured — the worker
  // re-checks masking/surprise on mint, the sheet shows a calm message on 409.
  const canShare =
    !!onShare && (kind === 'text' || kind === 'voice') &&
    mem.visibility === 'shared' && isWorkerConfigured()

  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        marginBottom: 14,
        flexDirection: isMe ? 'row-reverse' : 'row',
        alignItems: 'flex-end',
      }}
    >
      <Avatar id={mem.authorTraveler} size={26} />
      <div
        style={{
          maxWidth: '78%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: isMe ? 'flex-end' : 'flex-start',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 6,
            alignItems: 'baseline',
            marginBottom: 4,
            flexDirection: isMe ? 'row-reverse' : 'row',
          }}
        >
          <span
            style={{
              fontFamily: 'Inter Tight, system-ui, sans-serif',
              fontSize: 11,
              fontWeight: 600,
              color: dot,
            }}
          >
            {author.name.toLowerCase()}
          </span>
          <span
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 9,
              color: 'var(--muted, rgba(0,0,0,0.5))',
            }}
          >
            {time}
            {mem.visibility === 'private' ? ' · private' : ''}
          </span>
          {canShare && (
            <button
              type="button"
              onClick={onShare}
              aria-label="Share this memory"
              data-testid="thread-share"
              style={{
                background: 'transparent',
                border: 0,
                cursor: 'pointer',
                padding: 0,
                opacity: 0.55,
                color: 'currentColor',
              }}
            >
              <Share2 size={12} />
            </button>
          )}
          {isMe && (
            <button
              type="button"
              onClick={onDelete}
              aria-label="Delete memory"
              style={{
                background: 'transparent',
                border: 0,
                cursor: 'pointer',
                padding: 0,
                opacity: 0.4,
                color: 'currentColor',
              }}
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>

        <div
          style={{
            background: isMe ? dot : 'var(--card)',
            color: isMe ? '#fff' : 'var(--text)',
            padding: '8px 12px',
            borderRadius: 14,
            borderTopLeftRadius: isMe ? 14 : 4,
            borderTopRightRadius: isMe ? 4 : 14,
            border: isMe ? 'none' : '1px solid var(--border)',
            maxWidth: 260,
          }}
        >
          {kind === 'text' && (
            <div
              style={{
                fontFamily: 'Fraunces, Georgia, serif',
                fontSize: 14,
                lineHeight: 1.4,
              }}
            >
              {mem.text}
            </div>
          )}
          {kind === 'voice' && <VoiceBubble mem={mem} isMe={isMe} dot={dot} />}
          {kind === 'photo' && <PhotoBubble mem={mem} onOpenLightbox={onOpenLightbox} />}
        </div>
      </div>
    </div>
  )
}

// A ref is a video when it carries a poster, a video mime, or kind 'video'
// (mirrors flattenPhotoEntries' detection; kept local so the thread-video fix
// stays independent of the photoEntries module).
function isVideoRef(r) {
  return (
    (typeof r?.posterUrl === 'string' && !!r.posterUrl) ||
    (typeof r?.mime === 'string' && r.mime.startsWith('video/')) ||
    r?.kind === 'video'
  )
}

function PhotoBubble({ mem, onOpenLightbox }) {
  // The schema supports a single photoRef (Aurelia's PostcardComposer)
  // and a photoRefs[] album (Helen's thread composer). Prefer
  // photoRefs[] when it's populated; photoRef is a back-compat mirror
  // that can hold a different R2 key for the same image (see
  // photoEntries dedup fix) so we don't merge the two — would double
  // count when both are present. Falls back to photoRef when there
  // are no array entries (legacy / PostcardComposer).
  const refs = mem.photoRefs?.length
    ? mem.photoRefs
    : mem.photoRef
      ? [mem.photoRef]
      : []
  // A video whose poster upload failed is retrying in the background — show a
  // gentle "thumbnail still uploading" hint instead of a bare icon (part 2).
  const posterPending = hasPendingPoster(mem.id)
  const [urls, setUrls] = useState({})
  useEffect(() => {
    let cancelled = false
    const created = []
    Promise.all(
      refs.map((r) => {
        // An idb/pending-backed ref (a re-attach, or an offline-imported photo
        // awaiting upload) loads from the idb asset store — checked FIRST,
        // because such a ref's own `url` is a session blob: that dies on reload.
        // refIdbAssetKey returns null for r2/external refs, which render their
        // durable url directly (lets non-author devices see the photo).
        const idbKey = refIdbAssetKey(r)
        if (idbKey) {
          return loadAsset('photo', idbKey).then((blob) => {
            if (!blob) return null
            const u = URL.createObjectURL(blob)
            created.push(u)
            return [r.key || idbKey, u]
          })
        }
        if (r?.url) return Promise.resolve([r.key || r.url, r.url])
        return Promise.resolve(null)
      })
    ).then((pairs) => {
      if (cancelled) {
        created.forEach((u) => URL.revokeObjectURL(u))
        return
      }
      const map = {}
      for (const p of pairs) if (p) map[p[0]] = p[1]
      setUrls(map)
    })
    return () => {
      cancelled = true
      created.forEach((u) => URL.revokeObjectURL(u))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mem.id])

  // A photo memory carrying no refs at all (neither photoRef nor
  // photoRefs[]) is unrenderable. Even when there's a caption, leaving
  // the photo slot as a blank tile reads as "loading" — the icon makes
  // the unavailable state legible. See KNOWN_BUGS_HELEN_SURFACE.md P0.2.
  const isPhotoMissing = refs.length === 0

  if (isPhotoMissing && !mem.caption && !mem.text) {
    return (
      <div
        style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10,
          opacity: 0.7,
        }}
      >
        [photo unavailable]
      </div>
    )
  }

  const isAlbum = refs.length > 1
  const caption = mem.caption || mem.text
  // Tile size kept tight so a 6-photo album still fits inside the
  // bubble's 260px max width — albums wrap to a second row when they
  // outrun the available space.
  const tile = 56

  // Resolve a ref to what the tile SHOWS (a still) and what the lightbox
  // PLAYS. For a video, urls[r.key] is the poster blob when idb-backed
  // (refIdbAssetKey returns the posterKey) but the .mp4 itself when synced
  // (r2) — so a synced video takes its still from the durable posterUrl, never
  // urls[r.key] (which would paint the unrenderable .mp4 → the blank box bug).
  function mediaFor(r) {
    const resolved = (r?.key && urls[r.key]) || null
    if (!isVideoRef(r)) {
      return { isVideo: false, posterSrc: resolved, playUrl: resolved || r?.url || null }
    }
    const idb = !!refIdbAssetKey(r)
    const posterSrc = idb ? resolved : typeof r?.posterUrl === 'string' ? r.posterUrl : null
    // The playable .mp4: synced → the durable url; idb (offline, pre-upload) →
    // the session blob url if it's still alive.
    const playUrl = idb ? r?.url || null : resolved || r?.url || null
    return { isVideo: true, posterSrc, playUrl }
  }

  // Build the lightbox entries array for this memory. Each entry
  // carries the bare URL (no ?w=) so the lightbox shows full-res.
  // Only refs with a resolved URL participate (matches what the user
  // can actually see in the bubble — tapping an unresolved tile is a
  // no-op rather than opening a blank lightbox).
  function openLightboxAt(refIndex) {
    if (!onOpenLightbox) return
    const list = []
    let openIndex = -1
    const memoryAt =
      typeof mem.capturedAt === 'string' && mem.capturedAt ? mem.capturedAt : null
    refs.forEach((r, i) => {
      const m = mediaFor(r)
      // For a video this is the .mp4 (so PhotoLightbox plays it); for a photo
      // it's the image. A ref with neither a still nor a playable url is skipped.
      const url = m.playUrl
      if (!url && !m.posterSrc) return
      const exifAt = r?.capturedAt || null
      const realDate = memoryAt || exifAt
      const entry = {
        key: `${mem.id}::${r.key || url || i}`,
        memoryId: mem.id,
        author: mem.authorTraveler,
        caption: caption || '',
        capturedAt: realDate || mem.createdAt,
        capturedAtSource: realDate
          ? memoryAt
            ? 'memory'
            : 'exif'
          : 'createdAt',
        memoryCreatedAt: mem.createdAt || null,
        memoryCapturedAt: memoryAt,
        url,
        isVideo: m.isVideo,
        posterUrl: m.posterSrc || null,
        locationLabel:
          typeof r?.locationLabel === 'string' ? r.locationLabel : null,
        exifLat: Number.isFinite(r?.lat) ? r.lat : null,
        exifLng: Number.isFinite(r?.lng) ? r.lng : null,
      }
      list.push(entry)
      if (i === refIndex) openIndex = list.length - 1
    })
    if (list.length === 0) return
    onOpenLightbox({ list, index: openIndex >= 0 ? openIndex : 0 })
  }

  // One tile (album thumbnail or the single large tile). A video shows its
  // poster (or a Play glyph when no still exists) with a play badge, matching
  // the album grid — no more painting the .mp4 url as a blank background.
  const renderTile = (r, i, big) => {
    const m = mediaFor(r)
    const tappable = !!(m.posterSrc || m.playUrl)
    return (
      <button
        type="button"
        key={r.key || i}
        onClick={() => openLightboxAt(i)}
        aria-label={
          big
            ? m.isVideo
              ? 'Open video'
              : 'Open photo'
            : `Open ${m.isVideo ? 'video' : 'photo'} ${i + 1} of ${refs.length}`
        }
        disabled={!tappable}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: big ? 168 : tile,
          height: big ? undefined : tile,
          aspectRatio: big ? '4 / 3' : undefined,
          borderRadius: big ? 8 : 6,
          padding: 0,
          border: 0,
          overflow: 'hidden',
          background: m.posterSrc
            ? `url(${m.posterSrc}) center/cover no-repeat`
            : 'var(--bg2)',
          flexShrink: 0,
          cursor: tappable ? 'pointer' : 'default',
          marginBottom: big && caption ? 8 : 0,
          color: 'var(--muted)',
        }}
      >
        {/* poster-less video → a Play glyph stands in for the missing still,
            plus a "still uploading" hint on the large tile while the poster
            retry is in flight (part 2) */}
        {m.isVideo && !m.posterSrc && (
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <Play data-testid="thread-video-fallback" size={big ? 26 : 18} strokeWidth={1.5} />
            {big && posterPending && (
              <span
                data-testid="thread-poster-pending"
                className="f-mono"
                style={{ fontSize: 8, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.7 }}
              >
                thumbnail…
              </span>
            )}
          </span>
        )}
        {/* video WITH a still → a small play badge over the poster */}
        {m.isVideo && m.posterSrc && (
          <span
            data-testid="thread-video-badge"
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: big ? 8 : 3,
              bottom: big ? 8 : 3,
              width: big ? 22 : 15,
              height: big ? 22 : 15,
              borderRadius: '50%',
              background: 'rgba(0, 0, 0, 0.55)',
              color: '#fff',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Play size={big ? 12 : 9} fill="currentColor" />
          </span>
        )}
      </button>
    )
  }

  return (
    <div>
      {isAlbum ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 4,
            marginBottom: caption ? 8 : 0,
          }}
        >
          {refs.map((r, i) => renderTile(r, i, false))}
        </div>
      ) : isPhotoMissing ? (
        <div
          aria-label="Photo unavailable"
          style={{
            width: 168,
            aspectRatio: '4 / 3',
            borderRadius: 8,
            background: 'var(--bg2)',
            marginBottom: caption ? 8 : 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--muted)',
          }}
        >
          <ImageOff size={22} strokeWidth={1.5} />
        </div>
      ) : (
        renderTile(refs[0], 0, true)
      )}
      {caption && (
        <div
          style={{
            fontFamily: 'Fraunces, Georgia, serif',
            fontSize: 13,
            fontStyle: 'italic',
            lineHeight: 1.35,
          }}
        >
          “{caption}”
        </div>
      )}
      {isAlbum && (
        <div
          style={{
            marginTop: 4,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 9,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            opacity: 0.7,
          }}
        >
          {refs.length} photos
        </div>
      )}
    </div>
  )
}

function VoiceBubble({ mem, isMe, dot }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let active = true
    let createdObjectUrl = null
    // Prefer remote URL (R2) so non-author devices can play back. Fall
    // back to IDB blob for the author's own newly-created memories that
    // haven't synced yet.
    if (mem.audioRef?.url) {
      setUrl(mem.audioRef.url)
    } else if (mem.audioRef?.key) {
      loadAsset('audio', mem.audioRef.key).then((blob) => {
        if (!active || !blob) return
        createdObjectUrl = URL.createObjectURL(blob)
        setUrl(createdObjectUrl)
      })
    }
    return () => {
      active = false
      if (createdObjectUrl) URL.revokeObjectURL(createdObjectUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mem.audioRef?.key, mem.audioRef?.url])

  function play() {
    if (!url) return
    new Audio(url).play().catch(() => {})
  }

  const dur = mem.durationSeconds || 0
  const status = mem.transcriptionStatus
  return (
    <div style={{ minWidth: 170 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={play}
          aria-label="Play voice memo"
          disabled={!url}
          style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: isMe ? '#fff' : 'var(--accent)',
            color: isMe ? dot : '#fff',
            border: 'none',
            cursor: url ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: url ? 1 : 0.5,
          }}
        >
          <Play size={12} fill="currentColor" />
        </button>
        <div
          style={{
            display: 'flex',
            gap: 2,
            alignItems: 'flex-end',
            height: 16,
            flex: 1,
          }}
        >
          {[3, 7, 5, 9, 4, 8, 6, 10, 5, 7, 4, 8, 6, 3, 5, 8, 4].map(
            (h, i) => (
              <div
                key={i}
                style={{
                  width: 2.5,
                  height: h,
                  background: isMe ? '#fff' : 'var(--accent)',
                  opacity: 0.7,
                  borderRadius: 1,
                }}
              />
            )
          )}
        </div>
        <span
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 9,
            opacity: 0.7,
          }}
        >
          0:{String(dur).padStart(2, '0')}
        </span>
      </div>
      {status === 'pending' && (
        <div
          style={{
            fontSize: 11,
            fontStyle: 'italic',
            opacity: 0.75,
            marginTop: 4,
          }}
        >
          transcribing…
        </div>
      )}
      {status === 'done' && mem.transcript && (
        <div
          style={{
            fontSize: 11,
            fontStyle: 'italic',
            opacity: 0.85,
            marginTop: 4,
          }}
        >
          “{mem.transcript}”
        </div>
      )}
      {status === 'failed' && (
        <div
          style={{
            fontSize: 11,
            fontStyle: 'italic',
            opacity: 0.6,
            marginTop: 4,
          }}
        >
          transcription failed — audio still saved
        </div>
      )}
    </div>
  )
}

function Composer({
  traveler,
  text,
  onText,
  onSend,
  onMic,
  onPickPhotos,
  canPickMore,
  visibility,
  onVisibility,
}) {
  const fileInputRef = useRef(null)
  return (
    <div
      style={{
        marginTop: 24,
        borderTop: '1px solid var(--border)',
        paddingTop: 14,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 22,
          padding: '6px 6px 6px 14px',
        }}
      >
        <input
          type="text"
          value={text}
          onChange={(e) => onText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSend()
            }
          }}
          placeholder="add to the thread…"
          aria-label="Memory text"
          style={{
            flex: 1,
            border: 0,
            background: 'transparent',
            outline: 'none',
            fontFamily: 'Fraunces, Georgia, serif',
            fontStyle: 'italic',
            fontSize: 14,
            color: 'var(--text)',
            minWidth: 0,
          }}
        />
        <button
          type="button"
          data-testid="threaded-photo-picker"
          onClick={() => canPickMore && fileInputRef.current?.click()}
          aria-label="Attach photos"
          disabled={!canPickMore}
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: 0,
            background: 'transparent',
            color: canPickMore ? 'var(--muted)' : 'var(--muted)',
            cursor: canPickMore ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: canPickMore ? 1 : 0.4,
          }}
        >
          <Camera size={16} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            onPickPhotos?.(e.target.files)
            e.target.value = ''
          }}
        />
        <button
          type="button"
          onClick={onMic}
          aria-label="Record voice memo"
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: 'none',
            background: 'var(--accent)',
            color: 'var(--accent-ink, #fff)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Mic size={16} />
        </button>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 8,
          padding: '0 6px',
        }}
      >
        <button
          type="button"
          onClick={onVisibility}
          aria-pressed={visibility === 'private'}
          style={{
            background: 'transparent',
            border: 0,
            padding: 0,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            color: 'var(--muted)',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 9,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
          }}
        >
          {visibility === 'private' ? <Lock size={11} /> : <Unlock size={11} />}
          {visibility === 'private' ? 'private to you' : 'shared with family'}
        </button>
        <Avatar id={traveler} size={18} />
      </div>
    </div>
  )
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function PhotoAlbumTray({
  photos,
  caption,
  onCaption,
  onRemove,
  onCancel,
  onSave,
  saving,
  maxPhotos,
}) {
  const n = photos.length
  return (
    <div
      style={{
        marginTop: 18,
        padding: 12,
        border: '1px solid var(--border)',
        borderRadius: 14,
        background: 'var(--card)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 10,
        }}
      >
        <span
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
          }}
        >
          {n} of {maxPhotos} photo{n === 1 ? '' : 's'}
        </span>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          style={{
            background: 'transparent',
            border: 0,
            padding: 0,
            cursor: saving ? 'default' : 'pointer',
            color: 'var(--muted)',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10,
            letterSpacing: '0.14em',
          }}
        >
          DISCARD
        </button>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 6,
          marginBottom: 10,
        }}
      >
        {photos.map((p, i) => (
          <div
            key={p.id}
            style={{
              position: 'relative',
              aspectRatio: 1,
              borderRadius: 8,
              overflow: 'hidden',
              background: `url(${p.url}) center/cover no-repeat var(--bg2)`,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: 4,
                left: 4,
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: 'var(--accent)',
                color: 'var(--accent-ink, #fff)',
                fontFamily: 'Inter Tight, system-ui, sans-serif',
                fontSize: 10,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {i + 1}
            </span>
            <button
              type="button"
              onClick={() => onRemove(p.id)}
              aria-label={`Remove photo ${i + 1}`}
              disabled={saving}
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                width: 20,
                height: 20,
                borderRadius: '50%',
                border: 0,
                background: 'rgba(0,0,0,0.55)',
                color: '#fff',
                cursor: saving ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={11} />
            </button>
          </div>
        ))}
      </div>
      <textarea
        value={caption}
        onChange={(e) => onCaption(e.target.value)}
        placeholder="caption (optional)…"
        rows={2}
        disabled={saving}
        style={{
          width: '100%',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: 10,
          fontFamily: 'Fraunces, Georgia, serif',
          fontSize: 13,
          fontStyle: 'italic',
          lineHeight: 1.4,
          color: 'var(--text)',
          outline: 'none',
          resize: 'vertical',
          minHeight: 50,
        }}
      />
      <button
        type="button"
        data-testid="threaded-photo-save"
        onClick={onSave}
        disabled={saving || n === 0}
        style={{
          marginTop: 10,
          width: '100%',
          padding: '10px 14px',
          borderRadius: 10,
          border: 'none',
          background: 'var(--accent)',
          color: 'var(--accent-ink, #fff)',
          cursor: saving ? 'default' : 'pointer',
          fontFamily: 'Inter Tight, system-ui, sans-serif',
          fontSize: 13,
          fontWeight: 600,
          opacity: saving ? 0.6 : 1,
        }}
      >
        {saving ? 'Saving…' : `Save ${n} to thread`}
      </button>
    </div>
  )
}
