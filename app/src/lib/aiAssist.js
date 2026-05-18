// "Help me write this" for stop pitches. The change order 2026-05-17
// §4.3 specified Claude API "already wired for screenshot ingestion" —
// it is NOT wired anywhere in this codebase. The only LLM proxy that
// exists is the OpenAI one Whisper already uses (vite dev proxy injects
// OPENAI_API_KEY server-side; prod points VITE_WHISPER_PROXY at a Worker
// that does the same). We reuse that exact contract — real plumbing, no
// new secret, same posture as whisper.js. Honors "no UI without
// plumbing": isAiAssistConfigured() gates the button so it never shows
// when the proxy is absent.

function proxyBase() {
  const env =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_WHISPER_PROXY
  return (env || '').replace(/\/$/, '')
}

export function isAiAssistConfigured() {
  return !!proxyBase()
}

// The house voice, taught from the seed trips' stop notes (trips.js):
// concrete, lightly literary, present-tense or plain past, one specific
// sensory or logistical detail, no marketing adjectives, 1–3 sentences.
const SYSTEM = `You write one short "pitch" paragraph for a stop on a family trip itinerary.
Voice: warm, specific, lightly literary — like a well-kept family travel journal, not a brochure.
Rules:
- 1 to 3 sentences. No headings, no lists, no quotation marks around the whole thing.
- Name one concrete, true-sounding detail (a place's character, who it's for, a logistical note) but never invent facts like prices, hours, or confirmation numbers.
- Plain past or present tense. No hype words ("stunning", "must-see", "nestled", "hidden gem").
- If person tags are given, you may note who the stop is for in a natural way.
Return only the paragraph text.`

// Returns { ok: true, text } | { ok: false, error }. Never throws.
export async function suggestPitch({ name, address, forTags, rawNotes, tripTitle }) {
  const base = proxyBase()
  if (!base) return { ok: false, error: 'AI assist is not configured.' }

  const lines = []
  if (tripTitle) lines.push(`Trip: ${tripTitle}`)
  if (name) lines.push(`Stop: ${name}`)
  if (address) lines.push(`Address: ${address}`)
  if (forTags?.length) lines.push(`For: ${forTags.join(', ')}`)
  if (rawNotes?.trim()) lines.push(`Raw notes from the planner: ${rawNotes.trim()}`)
  if (lines.length === 0) {
    return { ok: false, error: 'Add a stop name first so there is something to write about.' }
  }

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        max_tokens: 220,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: lines.join('\n') },
        ],
      }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return { ok: false, error: `AI assist HTTP ${res.status}: ${detail.slice(0, 160)}` }
    }
    const json = await res.json()
    const text = json?.choices?.[0]?.message?.content?.trim()
    if (!text) return { ok: false, error: 'AI assist returned nothing — try again.' }
    return { ok: true, text }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
}
