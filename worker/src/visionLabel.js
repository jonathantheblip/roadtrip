// visionLabel.js — WORKER. Ask Claude (vision) what a family-trip photo SHOWS: a short
// album-ready MOMENT NAME + a few content labels + indoor/outdoor. This is the dimension
// that can NAME a coherent-but-unplaced moment — a no-GPS beach burst becomes "At the
// beach" — the lever that turns the archive's "leave" photos into named moments. Reuses
// the worker's existing Anthropic key + Messages endpoint (the weave/chat/cover path);
// cheap model. Returns a compact {name, labels, setting} or null on any failure (it must
// never throw into the heal sweep). `parseVisionReply` is pure → unit-testable.

const VISION_MODEL = 'claude-haiku-4-5-20251001'
const VISION_PROMPT =
  'This is one photo from a family trip. Reply with ONLY a compact JSON object, no prose:\n' +
  '{"name": a 2-5 word moment name for a family photo album (e.g. "At the beach", ' +
  '"July 4th parade", "Dinner out", "Playing at the park", "Walking around town"), ' +
  '"labels": up to 4 lowercase content tags, "setting": "indoor" or "outdoor"}.'

// Mirror of index.js anthropicMessagesUrl (kept local to avoid importing the big entry
// module — same env seam, same default).
function messagesUrl(env) {
  const base =
    (typeof env?.ANTHROPIC_BASE_URL === 'string' && env.ANTHROPIC_BASE_URL.trim()) ||
    'https://api.anthropic.com'
  return base.replace(/\/+$/, '') + '/v1/messages'
}

function base64FromBytes(u8) {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < u8.length; i += chunk) {
    binary += String.fromCharCode.apply(null, u8.subarray(i, i + chunk))
  }
  return btoa(binary)
}

// Pull the {name, labels, setting} out of the model's reply (which may wrap it in prose
// or code fences) and normalize. Returns null when there's no usable name.
export function parseVisionReply(text) {
  if (typeof text !== 'string' || !text) return null
  // Non-greedy: take the FIRST JSON object (the descriptor is flat — no nested braces),
  // so trailing prose containing braces can't make it over-match and fail to parse.
  const m = text.match(/\{[\s\S]*?\}/)
  if (!m) return null
  let obj
  try {
    obj = JSON.parse(m[0])
  } catch {
    return null
  }
  const name = typeof obj.name === 'string' ? obj.name.trim().slice(0, 60) : ''
  if (!name) return null
  const labels = Array.isArray(obj.labels)
    ? obj.labels
        .filter((l) => typeof l === 'string')
        .map((l) => l.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 6)
    : []
  const setting = obj.setting === 'indoor' || obj.setting === 'outdoor' ? obj.setting : null
  return { name, labels, setting }
}

export async function visionLabel(env, bytes, { mediaType = 'image/jpeg', model } = {}) {
  if (!env?.ANTHROPIC_API_KEY) return null
  const u8 = bytes instanceof Uint8Array ? bytes : bytes ? new Uint8Array(bytes) : null
  if (!u8 || !u8.length) return null
  // A network error THROWS and a non-2xx (429/529 overload, 5xx) THROWS — both are
  // RETRYABLE, so the caller skips the ref WITHOUT stamping a permanent visionFail. A
  // successful reply with no usable name returns null (a genuine, permanent no-label).
  const res = await fetch(messagesUrl(env), {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: model || VISION_MODEL,
      max_tokens: 150,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64FromBytes(u8) } },
            { type: 'text', text: VISION_PROMPT },
          ],
        },
      ],
    }),
  })
  if (!res.ok) throw new Error(`vision-api ${res.status}`)
  const data = await res.json()
  return parseVisionReply(data?.content?.[0]?.text || '')
}
