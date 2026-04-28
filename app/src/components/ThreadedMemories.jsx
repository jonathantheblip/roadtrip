import { useEffect, useState } from 'react'
import { Camera, Mic, Trash2, Lock, Unlock, Play } from 'lucide-react'
import { TRAVELERS, TRAVELER_DOT } from '../data/travelers'
import {
  listMemoriesForStop,
  saveMemory,
  deleteMemory,
} from '../lib/memoryStore'
import { transcribeWithStatus, isWhisperConfigured } from '../lib/whisper'
import { Avatar, AvatarStack } from './Avatar'
import { VoiceRecorder } from './VoiceRecorder'

// Direction 02 — Threaded Memories. Per Design system.jsx /
// variant-threaded.jsx, each stop carries a vertical thread of memories
// from the four travelers. Bubbles right-align for the active traveler
// ("me") and left-align for everyone else. A bottom composer takes
// text + photo + voice; voice opens the full-screen VoiceRecorder.
//
// Photo composer is a Pass-2 stub — saves a placeholder Memory record
// today, gets wired to CloudKit assets when the JS adapter lands.
export function ThreadedMemories({ trip, stop, traveler }) {
  const [memories, setMemories] = useState(() =>
    listMemoriesForStop(stop.id, traveler)
  )
  const [text, setText] = useState('')
  const [recording, setRecording] = useState(false)
  const [visibility, setVisibility] = useState('shared')
  const [error, setError] = useState('')

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
    const audioKey = `mem_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 7)}`
    await saveAudioBlob(audioKey, blob, mime)
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

      <Composer
        traveler={traveler}
        text={text}
        onText={setText}
        onSend={sendText}
        onMic={() => {
          setError('')
          setRecording(true)
        }}
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
          {kind === 'photo' && (
            <div
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10,
                opacity: 0.7,
              }}
            >
              [photo placeholder — wired in Pass 2]
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function VoiceBubble({ mem, isMe, dot }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let active = true
    if (mem.audioRef?.key) {
      loadAudioBlob(mem.audioRef.key).then((blob) => {
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
  visibility,
  onVisibility,
}) {
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
          onClick={() => alert('Photo capture lands in Pass 2 (CloudKit assets).')}
          aria-label="Attach photo"
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: 0,
            background: 'transparent',
            color: 'var(--muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Camera size={16} />
        </button>
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

// ---- IndexedDB helpers for voice blobs (separate store from the
// daily AudioMemo flow). Keyed by an opaque random key referenced from
// the Memory record's audioRef. -----------------------------------

const DB_NAME = 'roadtrip-mem-audio'
const STORE = 'audio'
let dbP = null
function openDb() {
  if (dbP) return dbP
  dbP = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  dbP.catch(() => {
    if (dbP) dbP = null
  })
  return dbP
}

async function saveAudioBlob(key, blob, mime) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite')
    t.objectStore(STORE).put({ key, blob, mime, savedAt: Date.now() })
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
  })
}

async function loadAudioBlob(key) {
  const db = await openDb()
  return new Promise((resolve) => {
    const t = db.transaction(STORE)
    const req = t.objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result?.blob || null)
    req.onerror = () => resolve(null)
  })
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
