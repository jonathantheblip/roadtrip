// visionLabel.js — the reply parser (pure). The live API call mirrors the worker's
// existing Anthropic path and is exercised when the backfill runs enabled.
import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  parseVisionReply,
  extractPlaceType,
  isValidPlaceType,
  visionLabel,
  PLACE_TYPES,
} from '../src/visionLabel.js'

describe('parseVisionReply', () => {
  it('parses a clean JSON object', () => {
    const v = parseVisionReply(
      '{"name":"At the beach","labels":["beach","ocean","sand"],"setting":"outdoor","placeType":"beach"}'
    )
    expect(v).toEqual({ name: 'At the beach', labels: ['beach', 'ocean', 'sand'], setting: 'outdoor', placeType: 'beach' })
  })

  it('extracts JSON wrapped in prose / code fences', () => {
    const v = parseVisionReply('Here you go:\n```json\n{"name":"Dinner out","labels":["food","restaurant"]}\n```')
    expect(v.name).toBe('Dinner out')
    expect(v.setting).toBe(null) // absent → null
    expect(v.placeType).toBe(null) // absent → null, never a guess
  })

  it('normalizes labels (lowercase, trim, ≤6) and drops non-strings', () => {
    const v = parseVisionReply('{"name":"Park","labels":["  TREES ","Grass",5,"dog","x","y","z","w"]}')
    expect(v.labels).toEqual(['trees', 'grass', 'dog', 'x', 'y', 'z'])
  })

  it('rejects an invalid setting value', () => {
    expect(parseVisionReply('{"name":"x","setting":"underwater"}').setting).toBe(null)
  })

  it('returns null when there is no usable name (never a false label)', () => {
    expect(parseVisionReply('{"labels":["a"]}')).toBe(null)
    expect(parseVisionReply('no json here')).toBe(null)
    expect(parseVisionReply('')).toBe(null)
    expect(parseVisionReply(null)).toBe(null)
  })

  describe('placeType — strict enum bounds-check (BUILD 3, rule #2: invalid/missing → null, never a guess)', () => {
    it('accepts every value in the real enum', () => {
      for (const t of PLACE_TYPES) {
        expect(parseVisionReply(`{"name":"x","placeType":"${t}"}`).placeType).toBe(t)
      }
    })

    it('rejects a value outside the enum (a free-text guess) → null', () => {
      expect(parseVisionReply('{"name":"x","placeType":"parking-lot"}').placeType).toBe(null)
      expect(parseVisionReply('{"name":"x","placeType":"Beach"}').placeType).toBe(null) // case-sensitive, no fuzzy coercion
      expect(parseVisionReply('{"name":"x","placeType":"beach "}').placeType).toBe(null) // no trim-and-retry — exact match only
    })

    it('rejects a non-string placeType (number/bool/null) → null', () => {
      expect(parseVisionReply('{"name":"x","placeType":5}').placeType).toBe(null)
      expect(parseVisionReply('{"name":"x","placeType":true}').placeType).toBe(null)
      expect(parseVisionReply('{"name":"x","placeType":null}').placeType).toBe(null)
      expect(parseVisionReply('{"name":"x","placeType":["beach"]}').placeType).toBe(null)
    })

    it('missing placeType entirely → null (never defaults to a guess like "outdoor-other")', () => {
      expect(parseVisionReply('{"name":"x"}').placeType).toBe(null)
    })
  })
})

describe('isValidPlaceType — the one canonical enum validator (write-site re-check)', () => {
  it('accepts every real enum value, rejects everything else', () => {
    for (const t of PLACE_TYPES) expect(isValidPlaceType(t)).toBe(true)
    expect(isValidPlaceType('parking-lot')).toBe(false)
    expect(isValidPlaceType('Beach')).toBe(false)
    expect(isValidPlaceType(5)).toBe(false)
    expect(isValidPlaceType(null)).toBe(false)
    expect(isValidPlaceType(undefined)).toBe(false)
    expect(isValidPlaceType(['beach'])).toBe(false)
  })
})

describe('extractPlaceType — independent of `name` (THE BLOCKER FIX)', () => {
  it('extracts a valid placeType even when name is blank', () => {
    expect(extractPlaceType('{"name":"","labels":["sand"],"placeType":"beach"}')).toBe('beach')
  })

  it('extracts a valid placeType even when name is absent entirely', () => {
    expect(extractPlaceType('{"labels":["water"],"placeType":"waterfront"}')).toBe('waterfront')
  })

  it('still enforces the strict enum — an out-of-set or non-string value → null', () => {
    expect(extractPlaceType('{"placeType":"parking-lot"}')).toBe(null)
    expect(extractPlaceType('{"placeType":5}')).toBe(null)
    expect(extractPlaceType('{"placeType":null}')).toBe(null)
  })

  it('null/empty/unparseable text → null, never throws', () => {
    expect(extractPlaceType(null)).toBe(null)
    expect(extractPlaceType('')).toBe(null)
    expect(extractPlaceType('no json here')).toBe(null)
    expect(extractPlaceType('not json {')).toBe(null)
  })
})

describe('visionLabel (async) — the fallback that recovers placeType from an otherwise-discarded reply', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })
  function stubReply(text) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ content: [{ type: 'text', text }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
    )
  }
  const testEnv = { ANTHROPIC_API_KEY: 'test-key', ANTHROPIC_BASE_URL: 'https://anthropic.stub' }

  it('a normal reply (usable name) still returns the full parseVisionReply shape, untouched', async () => {
    stubReply('{"name":"At the beach","labels":["beach"],"setting":"outdoor","placeType":"beach"}')
    const v = await visionLabel(testEnv, new Uint8Array([1, 2, 3]))
    expect(v).toEqual({ name: 'At the beach', labels: ['beach'], setting: 'outdoor', placeType: 'beach' })
  })

  it('THE BLOCKER FIX: blank name + valid placeType → placeType survives (not collapsed to null)', async () => {
    stubReply('{"name":"","labels":["sand"],"setting":"outdoor","placeType":"beach"}')
    const v = await visionLabel(testEnv, new Uint8Array([1, 2, 3]))
    expect(v).not.toBe(null)
    expect(v.placeType).toBe('beach')
    expect(v.name).toBe('') // deliberately not fabricated — only placeType is recovered
  })

  it('a genuinely useless reply (no name, no valid placeType) still returns null — no invented signal', async () => {
    stubReply('{"labels":["blur"]}')
    const v = await visionLabel(testEnv, new Uint8Array([1, 2, 3]))
    expect(v).toBe(null)
  })

  it('malformed JSON with no usable name or placeType still returns null, never throws', async () => {
    stubReply('not json at all')
    const v = await visionLabel(testEnv, new Uint8Array([1, 2, 3]))
    expect(v).toBe(null)
  })
})
