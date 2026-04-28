// OpenAI Whisper transcription. Spec §7.
//
// Transcribes a recorded audio Blob and returns the text. The browser
// never sees the API key — requests go through a proxy:
//
//   Local dev: vite.config.js proxies /openai-proxy/* → api.openai.com/v1/*
//              and injects the OPENAI_API_KEY from .env (server-side).
//   Prod:      VITE_WHISPER_PROXY points at a Cloudflare Worker that
//              does the same key injection.
//
// If no proxy is configured (no VITE_WHISPER_PROXY set), transcription
// is silently skipped — recording still works, the Memory record gets
// transcriptionStatus='skipped'.

const DEFAULT_MODEL = 'whisper-1'

function proxyBase() {
  const env =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_WHISPER_PROXY
  return (env || '').replace(/\/$/, '')
}

export function isWhisperConfigured() {
  return !!proxyBase()
}

// Transcribe an audio Blob. Returns:
//   { transcript: string, language?: string }
//   or null if not configured / failure (caller treats as 'skipped' /
//   'failed' depending on context — see transcribeWithStatus below).
export async function transcribeAudio(blob, { model = DEFAULT_MODEL, language } = {}) {
  if (!blob) return null
  const base = proxyBase()
  if (!base) return null

  const filename = blob.type.includes('webm') ? 'memo.webm' : 'memo.m4a'
  const form = new FormData()
  form.append('file', blob, filename)
  form.append('model', model)
  if (language) form.append('language', language)
  // Verbose JSON gives us detected language back; cheap upgrade.
  form.append('response_format', 'verbose_json')

  const res = await fetch(`${base}/audio/transcriptions`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Whisper HTTP ${res.status}: ${detail.slice(0, 200)}`)
  }
  const json = await res.json()
  return {
    transcript: (json.text || '').trim(),
    language: json.language || undefined,
  }
}

// Convenience wrapper that maps to the Memory schema's transcriptionStatus.
// Returns:
//   { status: 'done', transcript, language }
//   { status: 'skipped' }     // no proxy configured
//   { status: 'failed', error } // network/auth failure
export async function transcribeWithStatus(blob, opts) {
  if (!isWhisperConfigured()) return { status: 'skipped' }
  try {
    const out = await transcribeAudio(blob, opts)
    if (!out) return { status: 'skipped' }
    return { status: 'done', transcript: out.transcript, language: out.language }
  } catch (err) {
    console.warn('whisper transcription failed', err)
    return { status: 'failed', error: err?.message || String(err) }
  }
}
