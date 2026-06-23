// buildChatUserContent — the screenshot-intake (vision) content builder.
//
// NON-VACUOUS: with no images the result must be the PLAIN TEXT STRING (the
// unchanged chat contract — a regression here would alter every text-only chat
// turn); with a valid image it must become a content ARRAY of image block(s) +
// text. Garbage attachments must DROP (degrade to text), never throw.
import { describe, it, expect } from 'vitest'
import { buildChatUserContent } from '../src/index.js'

const b64 = 'aGVsbG8=' // tiny valid base64 ("hello")
const img = (media_type = 'image/jpeg', data = b64) => ({ media_type, data })

describe('buildChatUserContent (screenshot intake)', () => {
  it('no images → the plain text string (unchanged contract)', () => {
    expect(buildChatUserContent('plan a cabin weekend', null)).toBe('plan a cabin weekend')
    expect(buildChatUserContent('hi', [])).toBe('hi')
  })

  it('a valid image → content array of [image block, text block]', () => {
    const c = buildChatUserContent('here is my flight', [img()])
    expect(Array.isArray(c)).toBe(true)
    expect(c).toHaveLength(2)
    expect(c[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } })
    expect(c[1]).toEqual({ type: 'text', text: 'here is my flight' })
  })

  it('image with empty text → a default build instruction', () => {
    const c = buildChatUserContent('', [img('image/png')])
    expect(c[1].text).toMatch(/build a trip/i)
  })

  it('an unsupported media type is dropped (degrades to text)', () => {
    expect(buildChatUserContent('x', [img('application/pdf')])).toBe('x')
    expect(buildChatUserContent('x', [img('image/svg+xml')])).toBe('x')
  })

  it('an oversized image is dropped', () => {
    const huge = 'A'.repeat(8 * 1024 * 1024)
    expect(buildChatUserContent('x', [img('image/jpeg', huge)])).toBe('x')
  })

  it('caps at 4 images', () => {
    const many = Array.from({ length: 7 }, () => img())
    const c = buildChatUserContent('lots', many)
    const imageBlocks = c.filter((b) => b.type === 'image')
    expect(imageBlocks).toHaveLength(4)
  })

  it('never throws on garbage', () => {
    expect(buildChatUserContent(null, null)).toBe('')
    expect(buildChatUserContent('x', [null, {}, { media_type: 'image/jpeg' }])).toBe('x')
  })
})
