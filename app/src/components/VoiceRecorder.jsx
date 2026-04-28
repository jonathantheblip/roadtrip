import { useEffect, useRef, useState } from 'react'

// Full-screen voice recording overlay matching Design Direction 04.
// Captures audio via MediaRecorder, shows live waveform + a "live"
// transcript pane (the actual transcription happens after stop, so
// the pane shows a recording indicator until then; on Stop & Send the
// caller transcribes via Whisper and saves a Memory record).
//
// Hard-cap: 60 seconds.
//
// Props:
//   onCancel()                — user dismissed, recording discarded
//   onStop({blob, durationSeconds, mime}) — user pressed Stop & Send

const MAX_SECONDS = 60

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const m of [
    'audio/mp4',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/webm;codecs=opus',
    'audio/webm',
  ]) {
    if (MediaRecorder.isTypeSupported(m)) return m
  }
  return ''
}

export function VoiceRecorder({ onCancel, onStop }) {
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const [levels, setLevels] = useState(() => Array(32).fill(4))
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const streamRef = useRef(null)
  const tickerRef = useRef(null)
  const startedAtRef = useRef(0)
  const analyserRef = useRef(null)
  const audioCtxRef = useRef(null)
  const rafRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream

        // Wire an analyser for the live waveform animation.
        const Ctx = window.AudioContext || window.webkitAudioContext
        const ctx = new Ctx()
        audioCtxRef.current = ctx
        const src = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 64
        src.connect(analyser)
        analyserRef.current = analyser

        const data = new Uint8Array(analyser.frequencyBinCount)
        const tick = () => {
          analyser.getByteFrequencyData(data)
          // Map down to ~32 columns of 0–1 amplitude.
          const cols = 32
          const step = Math.floor(data.length / cols) || 1
          const next = []
          for (let i = 0; i < cols; i++) {
            let sum = 0
            for (let j = 0; j < step; j++) sum += data[i * step + j] || 0
            next.push(sum / step / 255)
          }
          setLevels(next)
          rafRef.current = requestAnimationFrame(tick)
        }
        tick()

        const mime = pickMime()
        const recorder = mime
          ? new MediaRecorder(stream, { mimeType: mime })
          : new MediaRecorder(stream)
        recorderRef.current = recorder
        chunksRef.current = []
        recorder.ondataavailable = (e) => {
          if (e.data?.size) chunksRef.current.push(e.data)
        }
        recorder.onstop = () => {
          const usedMime = recorder.mimeType || 'audio/mp4'
          const blob = new Blob(chunksRef.current, { type: usedMime })
          const dur = Math.min(
            MAX_SECONDS,
            Math.round((Date.now() - startedAtRef.current) / 1000)
          )
          cleanup()
          onStop?.({ blob, durationSeconds: dur, mime: usedMime })
        }

        startedAtRef.current = Date.now()
        recorder.start()
        tickerRef.current = setInterval(() => {
          const s = Math.round((Date.now() - startedAtRef.current) / 1000)
          setElapsed(s)
          if (s >= MAX_SECONDS) stopAndSend()
        }, 200)
      } catch (err) {
        setError(err?.message || 'Microphone permission denied.')
      }
    })()
    return () => {
      cancelled = true
      cleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function cleanup() {
    if (tickerRef.current) clearInterval(tickerRef.current)
    tickerRef.current = null
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {})
    }
    audioCtxRef.current = null
    analyserRef.current = null
  }

  function stopAndSend() {
    const r = recorderRef.current
    if (r && r.state !== 'inactive') r.stop()
    else {
      cleanup()
      onStop?.(null)
    }
  }

  function cancel() {
    const r = recorderRef.current
    if (r && r.state !== 'inactive') {
      // Stop without firing onStop — swap the handler first.
      r.onstop = null
      r.stop()
    }
    cleanup()
    onCancel?.()
  }

  return (
    <div
      role="dialog"
      aria-label="Voice memo recorder"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: 14,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) cancel()
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 460,
          background: 'var(--accent)',
          color: 'var(--accent-ink, #fff)',
          padding: 16,
          borderRadius: 18,
          boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#fff',
                animation: 'rt-blink 1s infinite',
              }}
            />
            <span
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10,
                letterSpacing: '0.18em',
                color: '#fff',
              }}
            >
              RECORDING
            </span>
          </div>
          <span
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 14,
              fontWeight: 600,
              color: '#fff',
            }}
          >
            0:{String(elapsed).padStart(2, '0')}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 3,
            alignItems: 'center',
            height: 38,
            marginBottom: 14,
          }}
        >
          {levels.map((lv, i) => {
            const h = 4 + lv * 32
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: h,
                  background: '#fff',
                  opacity: 0.6 + lv * 0.4,
                  borderRadius: 1,
                }}
              />
            )
          })}
        </div>

        <div
          style={{
            fontFamily: 'Fraunces, Georgia, serif',
            fontSize: 13,
            lineHeight: 1.4,
            fontStyle: 'italic',
            marginBottom: 14,
            color: '#fff',
            opacity: 0.9,
          }}
        >
          Listening — release to send. Transcription will arrive a moment
          after you stop.
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={cancel}
            style={{
              flex: 1,
              height: 38,
              borderRadius: 19,
              border: '1px solid rgba(255,255,255,0.5)',
              background: 'transparent',
              color: '#fff',
              fontFamily: 'Inter Tight, system-ui, sans-serif',
              fontWeight: 600,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={stopAndSend}
            style={{
              flex: 2,
              height: 38,
              borderRadius: 19,
              border: 'none',
              background: '#fff',
              color: 'var(--accent)',
              fontFamily: 'Inter Tight, system-ui, sans-serif',
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Stop &amp; Send
          </button>
        </div>

        {error && (
          <p
            style={{
              marginTop: 10,
              fontFamily: 'Inter Tight, system-ui, sans-serif',
              fontSize: 12,
              color: '#fff',
              opacity: 0.9,
            }}
          >
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
