import { useEffect, useRef, useState } from 'react'
import { Camera, Mic, Trash2, Lock, Unlock, Play, X } from 'lucide-react'
import { TRAVELERS, TRAVELER_DOT } from '../data/travelers'
import {
  listMemoriesForStop,
  saveMemory,
  deleteMemory,
} from '../lib/memoryStore'
import { transcribeWithStatus, isWhisperConfigured } from '../lib/whisper'
import { saveAsset, loadAsset, makeAssetKey } from '../lib/memAssets'
import { Avatar, AvatarStack } from './Avatar'
import { VoiceRecorder } from './VoiceRecorder'

const MAX_PHOTOS_PER_ALBUM = 6

// Direction 02 — Threaded Memories. Per Design system.jsx /
// variant-threaded.jsx, each stop carries a vertical thread of memories
// from the four travelers. Bubbles right-align for the active traveler
// ("me") and left-align for everyone else. A bottom composer takes
// text + photo + voice; voice opens the full-screen VoiceRecorder.
//
// The photo path is real: tapping the camera icon opens a multi-photo
// tray (up to 6) → IDB store via lib/memAssets → photoRefs[] on the
// Memory record → CKAsset upload via cloudKitSync.pushMemory.
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
        await saveAsset('photo', key, p.file, p.file.type)
        refs.push({ storage: 'idb', key })
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
          <ThreadEntry key={m.id} mem={m} traveler={traveler} onDelete={() => {
            deleteMemory(m)
            refresh()
          }} />
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
          style={{ marginTop: 10, fontSize: 12, color: 'var(--accent)' }}
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
    </div>
  )
}

function ThreadEntry({ mem, traveler, onDelete }) {
  const author = TRAVELERS[mem.authorTraveler]
  if (!author) return null
  const isMe = mem.authorTraveler === traveler
  const dot = TRAVELER_DOT[mem.authorTraveler] || 'var(--text)'
  const time = formatTime(mem.createdAt)
  const kind = mem.kind || 'text'

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
          {kind === 'photo' && <PhotoBubble mem={mem} />}
        </div>
      </div>
    </div>
  )
}

function PhotoBubble({ mem }) {
  // The schema supports a single photoRef (Aurelia's PostcardComposer)
  // and a photoRefs[] album (Helen's thread composer). Coalesce both
  // into one list so this component doesn't care which path saved it.
  const refs = mem.photoRefs?.length
    ? mem.photoRefs
    : mem.photoRef
      ? [mem.photoRef]
      : []
  const [urls, setUrls] = useState({})
  useEffect(() => {
    let cancelled = false
    const created = []
    Promise.all(
      refs.map((r) =>
        r?.key && r.storage === 'idb'
          ? loadAsset('photo', r.key).then((blob) => {
              if (!blob) return null
              const u = URL.createObjectURL(blob)
              created.push(u)
              return [r.key, u]
            })
          : Promise.resolve(null)
      )
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

  if (refs.length === 0 && !mem.caption && !mem.text) {
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
          {refs.map((r, i) => (
            <div
              key={r.key || i}
              style={{
                width: tile,
                height: tile,
                borderRadius: 6,
                background: urls[r.key]
                  ? `url(${urls[r.key]}) center/cover no-repeat`
                  : 'var(--bg2)',
                flexShrink: 0,
              }}
            />
          ))}
        </div>
      ) : (
        <div
          style={{
            width: 168,
            aspectRatio: '4 / 3',
            borderRadius: 8,
            background: urls[refs[0]?.key]
              ? `url(${urls[refs[0].key]}) center/cover no-repeat`
              : 'var(--bg2)',
            marginBottom: caption ? 8 : 0,
          }}
        />
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
    if (mem.audioRef?.key) {
      loadAsset('audio', mem.audioRef.key).then((blob) => {
        if (!active || !blob) return
        const u = URL.createObjectURL(blob)
        setUrl(u)
      })
    }
    return () => {
      active = false
      if (url) URL.revokeObjectURL(url)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mem.audioRef?.key])

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
          onClick={() => canPickMore && fileInputRef.current?.click()}
          aria-label="Attach photos"
          disabled={!canPickMore}
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: 0,
            background: 'transparent',
            color: canPickMore ? 'var(--muted)' : 'var(--faint)',
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
            color: 'var(--faint)',
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
