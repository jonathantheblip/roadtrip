// visionLabel.js — WORKER. Ask Claude (vision) what a family-trip photo SHOWS: a short
// album-ready MOMENT NAME + a few content labels + indoor/outdoor + a constrained
// PLACE-TYPE + readable SIGNAGE text. The name/labels/setting are the dimension that can
// NAME a coherent-but-unplaced moment — a no-GPS beach burst becomes "At the beach".
// placeType (§16, BUILD 3) is a DIFFERENT, narrower dimension: a fixed enum so two
// different photos of "a shop on the same walk" reliably emit the IDENTICAL token instead
// of free-text variety (retail/shopping/storefront) — the caption field is deliberately
// optimized for variety, which is the opposite of what place-sameness matching needs.
// signage (BUILD 4c) is narrower still: the VERBATIM readable business/place text in
// frame, when there is any — a real searchable name, unlike the warmth-optimized caption
// ("Spiritus Pizza Visit" carries no queryable venue name; its signage does). Reuses the
// worker's existing Anthropic key + Messages endpoint (the weave/chat/cover path); cheap
// model. Returns a compact {name, labels, setting, placeType, signage} or null on any
// failure (it must never throw into the heal sweep). `parseVisionReply` is pure →
// unit-testable.

const VISION_MODEL = 'claude-haiku-4-5-20251001'

// Strict, SMALL, fixed enum — chosen 2026-07-10 against the real Provincetown archive's
// actual vision labels (beach/parade/garden/shop/street/museum/restaurant/waterfront all
// appear with real volume; see BUILD_PLAN_SIGNAL_FLEET.md BUILD 3). Never open-ended: an
// unrecognized or missing value becomes `null` in parseVisionReply, never a guess.
export const PLACE_TYPES = [
  'beach', 'street', 'shop', 'restaurant', 'museum', 'park', 'waterfront',
  'residential', 'event', 'indoor-other', 'outdoor-other',
]
const PLACE_TYPE_SET = new Set(PLACE_TYPES)

// The one canonical validator for the enum — exported so write sites (visionBackfill.js)
// can independently re-check a placeType at the point they store it, rather than trusting
// that it already passed through parseVisionReply/extractPlaceType (never trust a value
// just because its one current source happens to validate it — same posture as
// photoSidecar.js's server-side re-validation).
export function isValidPlaceType(v) {
  return typeof v === 'string' && PLACE_TYPE_SET.has(v)
}

// signage (BUILD 4c) — bounded length, non-empty when present. Same posture as
// every other bounded field this arc has shipped (offsetMinutes, sound, prov
// tiers, placeType): an out-of-bounds or non-string value is DROPPED to null,
// never truncated-and-kept or guessed. Exported for the same independent
// server-side-style re-validation reason as isValidPlaceType.
const SIGNAGE_MAX = 60
export function isValidSignage(v) {
  return typeof v === 'string' && v.trim().length > 0 && v.trim().length <= SIGNAGE_MAX
}

const VISION_PROMPT =
  'This is one photo from a family trip. Reply with ONLY a compact JSON object, no prose:\n' +
  '{"name": a 2-5 word moment name for a family photo album (e.g. "At the beach", ' +
  '"July 4th parade", "Dinner out", "Playing at the park", "Walking around town"), ' +
  '"labels": up to 4 lowercase content tags, "setting": "indoor" or "outdoor", ' +
  '"placeType": the SINGLE closest match from this exact list — ' +
  `${PLACE_TYPES.map((t) => `"${t}"`).join(', ')} — ` +
  'describing the KIND of place shown (not a caption; use "indoor-other" or ' +
  '"outdoor-other" only when nothing else fits), ' +
  '"signage": the EXACT verbatim text of any readable business/place sign, storefront, ' +
  'or placard visible in the photo (e.g. "Spiritus Pizza"), or null if none is legible — ' +
  'never guess or paraphrase a name that is not actually readable in the image}.'

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
  // Strict enum bounds-check — matches every other bounded field this arc has shipped
  // (offsetMinutes, sound, prov tiers): an out-of-set or non-string value is DROPPED to
  // null, never coerced or guessed. This is the gate BUILD 3's rule #2 requires, and the
  // one the mutation test flips.
  const placeType = typeof obj.placeType === 'string' && PLACE_TYPE_SET.has(obj.placeType)
    ? obj.placeType
    : null
  // BUILD 4c — same bounds-check posture as placeType: an empty/oversized/
  // non-string value is DROPPED to null, never truncated-and-kept. Validate
  // the FULL trimmed string (not a pre-sliced one) — slicing first would
  // silently turn "oversized" into "valid", exactly the truncate-and-keep
  // bug this arc's bounds-checks exist to prevent.
  const signageRaw = typeof obj.signage === 'string' ? obj.signage.trim() : ''
  const signage = isValidSignage(signageRaw) ? signageRaw : null
  return { name, labels, setting, placeType, signage }
}

// Independent placeType extraction — a FALLBACK used only when parseVisionReply's
// all-or-nothing `name` gate above discards an otherwise-usable reply (BUILD 3 hotfix,
// 2026-07-10). placeType is a functionally independent classification from the caption —
// a photo can get a confident place type even when the model fails to produce a
// caption-worthy name — so it must never be lost just because `name` happens to be
// missing/blank. Same JSON-object extraction as parseVisionReply, same strict enum
// bounds-check (via isValidPlaceType — the one canonical validator), deliberately NOT
// gated on `name`. parseVisionReply itself is left untouched: its all-or-nothing contract
// is still exactly what the full-label path (never-labeled refs) relies on.
export function extractPlaceType(text) {
  if (typeof text !== 'string' || !text) return null
  const m = text.match(/\{[\s\S]*?\}/)
  if (!m) return null
  let obj
  try {
    obj = JSON.parse(m[0])
  } catch {
    return null
  }
  return isValidPlaceType(obj.placeType) ? obj.placeType : null
}

// Sibling of extractPlaceType for `signage` (BUILD 4c) — same independent,
// non-name-gated extraction, same reasoning: a photo can carry confidently
// readable signage even when the model fails to produce a caption-worthy
// name, so it must never be lost just because `name` happens to be
// missing/blank. Same JSON-object extraction, same strict bounds-check (via
// isValidSignage).
export function extractSignage(text) {
  if (typeof text !== 'string' || !text) return null
  const m = text.match(/\{[\s\S]*?\}/)
  if (!m) return null
  let obj
  try {
    obj = JSON.parse(m[0])
  } catch {
    return null
  }
  const sig = typeof obj.signage === 'string' ? obj.signage.trim() : ''
  return isValidSignage(sig) ? sig : null
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
      max_tokens: 220, // headroom for the added placeType + signage fields so the JSON never truncates
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
  const text = data?.content?.[0]?.text || ''
  const parsed = parseVisionReply(text)
  if (parsed) return parsed
  // parseVisionReply discarded the whole reply — almost always a genuine, permanent
  // no-label (bad JSON, blank name). But before collapsing to null, recover placeType
  // independently: a reply CAN carry a valid, confident placeType even when name is
  // missing/blank, and that signal must survive (never-discard, FAMILY_TRIPS_VISION
  // §13). name/labels/setting stay empty/null here on purpose — this shape is only ever
  // consumed by the placeType-only / signage-only re-run paths (visionBackfill.js), which
  // read `.placeType`/`.signage` and nothing else; the full-label path's `v.name` check
  // still evaluates falsy for this shape, so its all-or-nothing behavior for never-labeled
  // refs is unchanged (same visionFail outcome as the old `null` return).
  const placeType = extractPlaceType(text)
  const signage = extractSignage(text)
  return placeType || signage ? { name: '', labels: [], setting: null, placeType, signage } : null
}
