import { useEffect, useRef, useState } from 'react'
import {
  saveMemo,
  getMemo,
  deleteMemo,
  memoFilename,
  updateMemoTranscript,
} from '../utils/actualLog'
import { transcribeWithStatus, isWhisperConfigured } from '../lib/whisper'

// Feature 6 — Daily Audio Memo.
// One memo per day, hard capped at 60 seconds.
// Uses MediaRecorder API (iOS Safari 14+).
// Stores Blob directly in IndexedDB.

const MAX_SECONDS = 60

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return null
  const candidates = [
    'audio/mp4',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/webm;codecs=opus',
    'audio/webm',
  ]
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m
  }
  return ''
}

export function AudioMemo({ date }) {
  const [memo, setMemo] = useState(null)
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const [audioUrl, setAudioUrl] = useState(null)

  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const streamRef = useRef(null)
  const tickerRef = useRef(null)
  const startedAtRef = useRef(0)
  // Track the currently-held objectURL so cleanup revokes the actual
  // URL that was created, not a stale closure-captured one. setState is
  // async and closures over audioUrl would see yesterday's value.
  const audioUrlRef = useRef(null)

  const setAudioUrlTracked = (url) => {
    if (audioUrlRef.current && audioUrlRef.current !== url) {
      URL.revokeObjectURL(audioUrlRef.current)
    }
    audioUrlRef.current = url
    setAudioUrl(url)
  }

  // Load any existing memo for this date.
  useEffect(() => {
    let active = true
    getMemo(date).then((m) => {
      if (!active) return
      setMemo(m || null)
      if (m?.blob) setAudioUrlTracked(URL.createObjectURL(m.blob))
      else setAudioUrlTracked(null)
    }).catch(() => {})
    return () => {
      active = false
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current)
        audioUrlRef.current = null
      }
    }
  }, [date])

  const stopAllTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (tickerRef.current) {
      clearInterval(tickerRef.current)
      tickerRef.current = null
    }
  }

  const startRecording = async () => {
    setError('')
    if (typeof MediaRecorder === 'undefined') {
      setError('MediaRecorder not supported on this browser.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mime = pickMime()
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      recorderRef.current = recorder
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data?.size) chunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        const usedMime = recorder.mimeType || 'audio/mp4'
        const blob = new Blob(chunksRef.current, { type: usedMime })
        const dur = Math.min(MAX_SECONDS, Math.round((Date.now() - startedAtRef.current) / 1000))
        const initialStatus = isWhisperConfigured() ? 'pending' : 'skipped'
        const saved = await saveMemo({
          date,
          blob,
          durationSeconds: dur,
          mime: usedMime,
          transcriptionStatus: initialStatus,
        })
        setMemo(saved)
        setAudioUrlTracked(URL.createObjectURL(blob))
        stopAllTracks()
        setRecording(false)
        setElapsed(0)
        // Fire-and-forget transcription. The memo is already saved and
        // playable; the transcript is a bonus that arrives async.
        if (isWhisperConfigured()) {
          transcribeWithStatus(blob).then(async (out) => {
            const patched = await updateMemoTranscript(date, {
              transcript: out.transcript || null,
              transcriptLang: out.language || null,
              transcriptionStatus: out.status,
            })
            if (patched) setMemo(patched)
          })
        }
      }
      startedAtRef.current = Date.now()
      recorder.start()
      setRecording(true)
      setElapsed(0)
      tickerRef.current = setInterval(() => {
        const s = Math.round((Date.now() - startedAtRef.current) / 1000)
        setElapsed(s)
        if (s >= MAX_SECONDS) stopRecording()
      }, 250)
    } catch (err) {
      setError(err?.message || 'Microphone permission denied.')
      stopAllTracks()
      setRecording(false)
    }
  }

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this memo?')) return
    await deleteMemo(date)
    setAudioUrlTracked(null)
    setMemo(null)
  }

  const handleDownload = () => {
    if (!memo?.blob) return
    const ext = (memo.mime || '').includes('webm') ? 'webm' : 'm4a'
    const filename = memoFilename(date, ext)
    const url = URL.createObjectURL(memo.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const remaining = Math.max(0, MAX_SECONDS - elapsed)

  return (
    <div className="memo-card">
      <div className="memo-header">
        <span className="memo-title">Voice memo</span>
        {memo && <span className="memo-meta">{fmtDur(memo.durationSeconds)} · {shortMime(memo.mime)}</span>}
      </div>

      {recording ? (
        <div className="memo-recording">
          <div className="memo-waveform" aria-hidden="true">
            <span className="memo-dot" />
          </div>
          <div className="memo-countdown">{remaining}s left</div>
          <button type="button" className="btn-primary memo-stop" onClick={stopRecording}>
            Stop &amp; save
          </button>
        </div>
      ) : memo ? (
        <>
          {audioUrl && (
            <audio className="memo-player" controls src={audioUrl} preload="metadata" />
          )}
          {memo.transcriptionStatus === 'pending' && (
            <p className="sub" style={{ marginTop: 8, fontStyle: 'italic', opacity: 0.7 }}>
              Transcribing…
            </p>
          )}
          {memo.transcriptionStatus === 'done' && memo.transcript && (
            <blockquote
              style={{
                margin: '10px 0 4px',
                padding: '8px 12px',
                borderLeft: '3px solid currentColor',
                opacity: 0.85,
                fontSize: 14,
                lineHeight: 1.45,
              }}
            >
              {memo.transcript}
            </blockquote>
          )}
          {memo.transcriptionStatus === 'failed' && (
            <p className="sub" style={{ marginTop: 8, opacity: 0.6 }}>
              Transcription failed — audio still saved.
            </p>
          )}
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={startRecording}>
              Re-record
            </button>
            <button type="button" className="btn-secondary" onClick={handleDownload}>
              Download
            </button>
            <button type="button" className="btn-danger" onClick={handleDelete}>
              Delete
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="sub" style={{ marginBottom: 8 }}>
            60-second voice memo for the day. Mic permission requested on first tap.
          </p>
          <button type="button" className="btn-primary memo-record" onClick={startRecording}>
            ⏺ Record
          </button>
        </>
      )}
      {error && <p className="err" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  )
}

function fmtDur(sec) {
  if (!sec) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.round(sec - m * 60).toString().padStart(2, '0')
  return `${m}:${s}`
}
function shortMime(m) {
  if (!m) return ''
  if (m.includes('webm')) return 'webm'
  if (m.includes('mp4')) return 'm4a'
  return m
}
