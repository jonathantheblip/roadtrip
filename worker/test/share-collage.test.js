// Share-out Phase 2 / Slice 1 — the auto-balancing scrapbook WALL layout.
// Pure layout math (no D1), ported from the design's buildWall/WallHero. These
// assert the recipe to the spec: column count by piece-count, cycling heights,
// 3-col compact scaling, tape-every-5th, rotation, and the mix summary.
import { describe, it, expect } from 'vitest'
import { buildWallTiles, spreadSlots } from '../src/share.js'
import { renderSharePage } from '../src/sharePage.js'

const album = (n, extra = {}) => ({
  photos: Array.from({ length: n }, (_, i) => ({ url: `https://x/p${i}.jpg` })),
  ...extra,
})

describe('spreadSlots', () => {
  it('spreads n specials across count slots', () => {
    expect([...spreadSlots(0, 10, 2)]).toEqual([])
    expect([...spreadSlots(1, 10, 5)]).toEqual([5])
    expect([...spreadSlots(2, 10, 2)].sort((a, b) => a - b)).toEqual([2, 7])
    expect([...spreadSlots(1, 3, 5)]).toEqual([2]) // clamps into range
  })
})

describe('buildWallTiles — columns + compact', () => {
  it('14 photos → 2 columns, not compact, full heights', () => {
    const w = buildWallTiles(album(14))
    expect(w.cols).toBe(2)
    expect(w.compact).toBe(false)
    expect(w.tiles).toHaveLength(14)
    expect(w.tiles[0].h).toBe(150) // first cycling height, no compaction
    expect(w.summary).toBe('14 photos')
  })

  it('17 photos → 3 columns, compact (heights ×0.74), no tape', () => {
    const w = buildWallTiles(album(17))
    expect(w.cols).toBe(3)
    expect(w.compact).toBe(true)
    expect(w.tiles[0].h).toBe(Math.round(150 * 0.74)) // 111
    expect(w.tiles.every((t) => t.tape === false)).toBe(true)
  })

  it('16 photos → still 2 columns (boundary: >16 → 3)', () => {
    expect(buildWallTiles(album(16)).cols).toBe(2)
  })

  it('30 photos → 3 columns', () => {
    const w = buildWallTiles(album(30))
    expect(w.cols).toBe(3)
    expect(w.tiles).toHaveLength(30)
  })
})

describe('buildWallTiles — decoration recipe', () => {
  it('tape on every 5th tile (2-col), rotation (i%3-1)*1.2', () => {
    const w = buildWallTiles(album(12))
    expect(w.tiles.map((t, i) => (t.tape ? i : null)).filter((x) => x !== null)).toEqual([0, 5, 10])
    expect(w.tiles[0].rot).toBeCloseTo(-1.2)
    expect(w.tiles[1].rot).toBeCloseTo(0)
    expect(w.tiles[2].rot).toBeCloseTo(1.2)
  })

  it('heights cycle the 8-value set', () => {
    const w = buildWallTiles(album(10))
    expect(w.tiles.map((t) => t.h)).toEqual([150, 124, 168, 134, 156, 120, 162, 140, 150, 124])
  })
})

describe('buildWallTiles — mixed media (real pieces, not synthesized)', () => {
  it('a video ref (posterUrl/mime) renders a video tile pointing at the poster', () => {
    const v = { photos: [{ url: 'https://x/a.jpg' }, { url: 'https://x/clip.mp4', mime: 'video/mp4', posterUrl: 'https://x/poster.jpg' }] }
    const w = buildWallTiles(v)
    const vid = w.tiles.find((t) => t.kind === 'video')
    expect(vid).toBeTruthy()
    expect(vid.url).toBe('https://x/poster.jpg')
    expect(w.summary).toBe('1 photo · 1 clip')
  })

  it('an attached voice note becomes one spread-in voice tile', () => {
    const w = buildWallTiles(album(8, { audio: { url: 'https://x/v.m4a', durationSeconds: 14 } }))
    const voices = w.tiles.filter((t) => t.kind === 'voice')
    expect(voices).toHaveLength(1)
    expect(voices[0].dur).toBe(14)
    expect(w.tiles).toHaveLength(9) // 8 photos + 1 voice
    expect(w.summary).toContain('1 voice')
    expect(w.summary).toContain('8 photos')
  })

  it('never throws on empty / malformed input', () => {
    expect(buildWallTiles({}).tiles).toEqual([])
    expect(buildWallTiles(null).tiles).toEqual([])
    expect(buildWallTiles({ photos: [{}] }).tiles).toEqual([]) // a photo with no url is dropped
  })
})

describe('renderSharePage — album renders the wall; single photo unchanged', () => {
  const base = { kind: 'photo', author: 'helen', authorName: 'Helen', caption: 'Beach day', place: 'Mystic', date: '2026-06-03' }

  it('an album (>1 photo) renders the masonry wall, not the +N-more hero', () => {
    const html = renderSharePage(
      { ...base, photos: [{ url: 'https://x/1.jpg' }, { url: 'https://x/2.jpg' }, { url: 'https://x/3.jpg' }] },
      { pageUrl: 'https://w/m/tok' }
    )
    expect(html).toContain('class="wall ') // the wall container
    expect(html).toContain('3 pieces')
    expect(html).toContain('https://x/2.jpg') // every photo rendered, not just the first
    expect(html).toContain('https://x/3.jpg')
    expect(html).not.toContain('class="more-chip"') // the old "first + N more" hero element is gone for albums (the CSS class def remains)
  })

  it('a single photo still renders the print hero (no wall)', () => {
    const html = renderSharePage({ ...base, photos: [{ url: 'https://x/1.jpg' }] }, { pageUrl: 'https://w/m/tok' })
    expect(html).not.toContain('class="wall ')
    expect(html).toContain('class="print"') // the existing single-photo hero
  })

  it('a text note is unaffected (no wall)', () => {
    const html = renderSharePage({ kind: 'text', note: 'hello', author: 'helen', authorName: 'Helen', photos: [] }, { pageUrl: 'https://w/m/tok' })
    expect(html).not.toContain('class="wall ')
    expect(html).toContain('note-text')
  })
})
