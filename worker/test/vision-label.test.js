// visionLabel.js — the reply parser (pure). The live API call mirrors the worker's
// existing Anthropic path and is exercised when the backfill runs enabled.
import { describe, it, expect } from 'vitest'
import { parseVisionReply } from '../src/visionLabel.js'

describe('parseVisionReply', () => {
  it('parses a clean JSON object', () => {
    const v = parseVisionReply('{"name":"At the beach","labels":["beach","ocean","sand"],"setting":"outdoor"}')
    expect(v).toEqual({ name: 'At the beach', labels: ['beach', 'ocean', 'sand'], setting: 'outdoor' })
  })

  it('extracts JSON wrapped in prose / code fences', () => {
    const v = parseVisionReply('Here you go:\n```json\n{"name":"Dinner out","labels":["food","restaurant"]}\n```')
    expect(v.name).toBe('Dinner out')
    expect(v.setting).toBe(null) // absent → null
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
})
