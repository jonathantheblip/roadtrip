// weaveRenderer.js — per-frame canvas renderer for the Weave keepsake video.
//
// Output: 576×720 (4:5 portrait). Matches the encode worker's 720-px
// long-edge cap exactly so no downscaling occurs.
//
// Called in a tight loop by weaveEncode.js on the main thread.
// Canvas 2D has access to the page's loaded web fonts (after
// document.fonts.ready), so glyphs render identically to the on-screen
// component.

export const RENDER_W = 576
export const RENDER_H = 720
export const TOTAL_FRAMES = 150
export const DURATION = 5.0  // seconds, hard number

// ── Animation timing ─────────────────────────────────────────────────
//
//  0.0–0.6s   opening section (day label + title + opening, staggered)
//  0.6+       beats stagger in, one every 0.5s (Beat 1@0.6, 2@1.1, 3@1.6, 4@2.1)
//  lastBeat+0.6s   closing fades in
//  held until DURATION = 5.0s

const FADE_DUR = 0.45

function beatStart(i) {
  return 0.6 + i * 0.5
}

function closingStart(n) {
  return beatStart(Math.max(n - 1, 0)) + 0.6
}

// ── Cubic-bezier easing: cubic-bezier(0.22, 1, 0.36, 1) ─────────────
// P0=(0,0) P1=(cx1=0.22, cy1=1) P2=(cx2=0.36, cy2=1) P3=(1,1)
// Since cy1=cy2=1: y(t) = 3t−3t²+t³
// x(t) = 0.66t − 0.24t² + 0.58t³
// Given x, solve for t via binary search, then return y(t).
export function easeWeaveUp(x) {
  if (x <= 0) return 0
  if (x >= 1) return 1
  let lo = 0, hi = 1
  for (let i = 0; i < 20; i++) {
    const m = (lo + hi) * 0.5
    const xm = 0.66 * m - 0.24 * m * m + 0.58 * m * m * m
    if (xm < x) lo = m; else hi = m
  }
  const t = (lo + hi) * 0.5
  return 3 * t - 3 * t * t + t * t * t
}

// Eased 0→1 alpha for an element that starts revealing at `startTime`.
export function fadeAlpha(t, startTime, fadeDur = FADE_DUR) {
  return easeWeaveUp(Math.max(0, Math.min(1, (t - startTime) / fadeDur)))
}

// ── Layout constants ──────────────────────────────────────────────────
const PAD_X = 22
const PAD_TOP = 22
const INNER_W = RENDER_W - 2 * PAD_X  // 532px

// Fixed opening-section height (conservative estimate for 2-line title).
const OPEN_H = 178
const BEAT_AREA_START = PAD_TOP + OPEN_H         // 200
const CLOSE_H = 112
const BEAT_AREA_END = RENDER_H - CLOSE_H         // 608

// Vertical translateY delta for the weave-up effect (canvas px).
const TRANSLATE_Y = 14

// ── Per-persona font helpers ──────────────────────────────────────────

function displayFont(traveler, weight, sizePx) {
  const isAu = traveler === 'aurelia'
  const isRafa = traveler === 'rafa'
  if (isRafa) return `normal ${weight} ${sizePx}px Fredoka, sans-serif`
  const family = isAu ? '"Instrument Serif", serif' : 'Fraunces, serif'
  const style = isAu ? 'italic' : 'normal'
  return `${style} ${weight} ${sizePx}px ${family}`
}

function monoFont(sizePx) {
  return `600 ${sizePx}px "JetBrains Mono", monospace`
}

// ── Main render function ──────────────────────────────────────────────

export function renderWeaveFrame(canvas, { beats, narrative, stat, day, traveler, tokens, images, t }) {
  const ctx = canvas.getContext('2d')
  const n = beats.length

  // Background fill
  ctx.fillStyle = tokens.bg
  ctx.fillRect(0, 0, RENDER_W, RENDER_H)
  ctx.textBaseline = 'alphabetic'

  let y = PAD_TOP

  // ── Day label ───────────────────────────────────────────────────────
  {
    const a = fadeAlpha(t, 0)
    const off = (1 - a) * TRANSLATE_Y
    ctx.save()
    ctx.globalAlpha = a
    ctx.fillStyle = tokens.accentText
    ctx.font = monoFont(11)
    ctx.textAlign = 'left'
    const label = ((day?.date || `Day ${day?.n || 1}`) + ' · WOVEN').toUpperCase()
    ctx.fillText(label, PAD_X, y + 11 + off)
    ctx.restore()
  }
  y += 20

  // ── Title ───────────────────────────────────────────────────────────
  {
    const a = fadeAlpha(t, 0.15)
    const off = (1 - a) * TRANSLATE_Y
    ctx.save()
    ctx.globalAlpha = a
    ctx.fillStyle = tokens.text
    const sz = traveler === 'rafa' ? 36 : 42
    const wt = traveler === 'rafa' ? 700 : 600
    ctx.font = displayFont(traveler, wt, sz)
    ctx.textAlign = 'left'
    const titleText = narrative?.title || day?.title || 'Tonight, woven'
    const titleLines = wrapText(ctx, titleText, INNER_W)
    const lineH = sz * 1.1
    for (let li = 0; li < Math.min(titleLines.length, 2); li++) {
      ctx.fillText(titleLines[li], PAD_X, y + sz + li * lineH + off)
    }
    ctx.restore()
    y += sz + Math.min(titleLines.length - 1, 1) * lineH + 10
  }

  // ── Opening line ────────────────────────────────────────────────────
  {
    const a = fadeAlpha(t, 0.3)
    const off = (1 - a) * TRANSLATE_Y
    ctx.save()
    ctx.globalAlpha = a
    ctx.fillStyle = tokens.muted
    const sz = 13
    ctx.font = displayFont(traveler, 400, sz)
    ctx.textAlign = 'left'
    const openText = narrative?.opening || 'Four people. One day. One page.'
    const openLines = wrapText(ctx, openText, INNER_W)
    const lineH = sz * 1.55
    for (let li = 0; li < Math.min(openLines.length, 3); li++) {
      ctx.fillText(openLines[li], PAD_X, y + sz + li * lineH + off)
    }
    ctx.restore()
    // y advances to BEAT_AREA_START regardless of actual opening height
  }

  // ── Beats ───────────────────────────────────────────────────────────
  const beatH = n > 0 ? (BEAT_AREA_END - BEAT_AREA_START) / n : 0

  for (let i = 0; i < n; i++) {
    const a = fadeAlpha(t, beatStart(i))
    const off = (1 - a) * TRANSLATE_Y
    const beatTop = BEAT_AREA_START + i * beatH
    ctx.save()
    ctx.globalAlpha = a
    drawBeat(ctx, beats[i], traveler, tokens, images, beatTop + off, beatH)
    ctx.restore()
  }

  // ── Closing ─────────────────────────────────────────────────────────
  {
    const a = fadeAlpha(t, closingStart(n))
    const off = (1 - a) * TRANSLATE_Y
    const cy = BEAT_AREA_END
    ctx.save()
    ctx.globalAlpha = a

    // Divider
    ctx.strokeStyle = tokens.border
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD_X, cy + off)
    ctx.lineTo(RENDER_W - PAD_X, cy + off)
    ctx.stroke()

    // Closing text
    if (narrative?.closing) {
      const sz = traveler === 'rafa' ? 17 : 19
      const wt = traveler === 'rafa' ? 700 : 600
      ctx.fillStyle = tokens.text
      ctx.font = displayFont(traveler, wt, sz)
      ctx.textAlign = 'center'
      const closeLines = wrapText(ctx, narrative.closing, INNER_W - 20)
      const lineH = sz * 1.2
      for (let li = 0; li < Math.min(closeLines.length, 2); li++) {
        ctx.fillText(closeLines[li], RENDER_W / 2, cy + 17 + sz + li * lineH + off)
      }
    }

    // Stat
    if (stat) {
      ctx.fillStyle = tokens.muted
      ctx.font = monoFont(9)
      ctx.textAlign = 'center'
      ctx.fillText(stat.toUpperCase(), RENDER_W / 2, cy + 56 + off)
    }

    // Four persona identity dots
    const DOTS = { jonathan: '#2E6BB8', helen: '#2E7D52', aurelia: '#E8478C', rafa: '#E8552E' }
    const dotR = 5
    const dotGap = 8
    const people = ['jonathan', 'helen', 'aurelia', 'rafa']
    const totalW = people.length * (dotR * 2) + (people.length - 1) * dotGap
    let dx = (RENDER_W - totalW) / 2
    const dotY = cy + 74 + off
    for (const id of people) {
      ctx.fillStyle = DOTS[id]
      ctx.beginPath()
      ctx.arc(dx + dotR, dotY, dotR, 0, Math.PI * 2)
      ctx.fill()
      dx += dotR * 2 + dotGap
    }

    // Footer
    ctx.fillStyle = tokens.muted
    ctx.font = monoFont(8)
    ctx.textAlign = 'center'
    ctx.globalAlpha = a * 0.45
    ctx.fillText('AUTO-WOVEN', RENDER_W / 2, cy + 94 + off)

    ctx.restore()
  }
}

// ── Beat drawing ──────────────────────────────────────────────────────

const VERB_MAP = {
  jonathan: { text: 'logged', photo: 'captured', voice: 'recorded', log: 'tracked' },
  helen:    { text: 'wrote',  photo: 'captured', voice: 'recorded' },
  aurelia:  { text: 'wrote',  photo: 'shot',     voice: 'recorded' },
  rafa:     { text: 'wrote',  photo: 'captured', voice: 'said'     },
}
function verbFor(who, kind) {
  return (VERB_MAP[who] || {})[kind] || 'contributed'
}

const DOT_COLOR = { jonathan: '#2E6BB8', helen: '#2E7D52', aurelia: '#E8478C', rafa: '#E8552E' }

const WAVE_HEIGHTS = [8, 15, 11, 19, 14, 9, 17, 12, 20, 13, 7, 16, 10]

function drawBeat(ctx, beat, traveler, tokens, images, topY, availH) {
  const { who, kind, snippet } = beat
  const dot = DOT_COLOR[who] || '#777'
  const railX = PAD_X + 9

  // Rail line
  ctx.strokeStyle = tokens.border
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(railX, topY)
  ctx.lineTo(railX, topY + availH * 0.5)
  ctx.stroke()

  // Rail dot (ring + inner fill)
  const dotY = topY + 14
  ctx.fillStyle = tokens.bg
  ctx.beginPath()
  ctx.arc(railX, dotY, 9, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = dot
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(railX, dotY, 9, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = dot
  ctx.beginPath()
  ctx.arc(railX, dotY, 3.5, 0, Math.PI * 2)
  ctx.fill()

  // Avatar circle with initial
  const contentX = PAD_X + 26
  const avR = 9
  const avY = dotY
  ctx.fillStyle = dot
  ctx.beginPath()
  ctx.arc(contentX + avR, avY, avR, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = `700 9px "Inter Tight", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText((who || '?')[0].toUpperCase(), contentX + avR, avY + 0.5)
  ctx.textBaseline = 'alphabetic'

  // Verb label
  ctx.fillStyle = tokens.muted
  ctx.font = monoFont(8.5)
  ctx.textAlign = 'left'
  ctx.fillText(verbFor(who, kind).toUpperCase(), contentX + avR * 2 + 6, dotY + 3)

  // Content below avatar row
  const innerX = contentX
  const innerW = RENDER_W - PAD_X - innerX
  const contentY = topY + 30
  const contentH = availH - 32

  if (kind === 'text' || kind === 'log') {
    drawTextBeat(ctx, snippet, traveler, tokens, innerX, contentY, innerW, contentH)
  } else if (kind === 'photo') {
    drawPhotoBeat(ctx, beat, snippet, dot, tokens, images, innerX, contentY, innerW, contentH)
  } else if (kind === 'voice') {
    drawVoiceBeat(ctx, beat, snippet, dot, traveler, tokens, innerX, contentY, innerW, contentH)
  }
}

function drawTextBeat(ctx, snippet, traveler, tokens, x, y, w, h) {
  if (!snippet) return
  ctx.fillStyle = tokens.text
  const sz = 14
  ctx.font = displayFont(traveler, 400, sz)
  ctx.textAlign = 'left'
  const lines = wrapText(ctx, `"${snippet}"`, w)
  const lineH = sz * 1.55
  const maxL = Math.max(1, Math.floor(h / lineH))
  for (let li = 0; li < Math.min(lines.length, maxL); li++) {
    ctx.fillText(lines[li], x, y + sz + li * lineH)
  }
}

function drawPhotoBeat(ctx, beat, snippet, dot, tokens, images, x, y, w, h) {
  const photoRef = beat.memory?.photoRefs?.[0] || beat.memory?.photoRef
  const bitmap = (photoRef?.url && images) ? images.get(photoRef.url) : null

  // 4:5 photo, constrained to available height
  const imgH = Math.min(h - 2, Math.floor(w * (5 / 4)))
  const imgW = Math.floor(imgH * (4 / 5))

  ctx.save()
  ctx.beginPath()
  rrect(ctx, x, y, imgW, imgH, 5)
  ctx.clip()

  if (bitmap) {
    ctx.drawImage(bitmap, x, y, imgW, imgH)
  } else {
    ctx.fillStyle = hexAlpha(dot, 0.2)
    ctx.fillRect(x, y, imgW, imgH)
  }

  // Caption gradient + text
  if (snippet) {
    const gradH = Math.min(36, imgH * 0.4)
    const grad = ctx.createLinearGradient(x, y + imgH - gradH, x, y + imgH)
    grad.addColorStop(0, 'rgba(0,0,0,0)')
    grad.addColorStop(1, 'rgba(0,0,0,0.72)')
    ctx.fillStyle = grad
    ctx.fillRect(x, y + imgH - gradH, imgW, gradH)
    ctx.fillStyle = '#fff'
    ctx.font = `italic 400 10px "Instrument Serif", serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(snippet.slice(0, 28), x + 7, y + imgH - 7)
  }

  ctx.restore()
}

function drawVoiceBeat(ctx, beat, snippet, dot, traveler, tokens, x, y, w, h) {
  const pillH = Math.min(36, h)
  const barW = 2
  const barGap = 2
  const playD = 26
  const barsW = WAVE_HEIGHTS.length * (barW + barGap) - barGap
  const pillW = Math.min(w, playD + 10 + barsW + 28)

  // Pill background
  ctx.fillStyle = tokens.bg2 || tokens.card || '#1C1E22'
  ctx.beginPath()
  rrect(ctx, x, y, pillW, pillH, pillH / 2)
  ctx.fill()

  // Play button
  const cx = x + 6 + playD / 2
  const cy = y + pillH / 2
  ctx.fillStyle = dot
  ctx.beginPath()
  ctx.arc(cx, cy, playD / 2, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.moveTo(cx - 4, cy - 4.5)
  ctx.lineTo(cx + 5.5, cy)
  ctx.lineTo(cx - 4, cy + 4.5)
  ctx.closePath()
  ctx.fill()

  // Waveform bars
  let bx = x + 6 + playD + 6
  for (const barH of WAVE_HEIGHTS) {
    const scaledH = Math.max(2, barH * 1.4)
    ctx.fillStyle = dot
    ctx.globalAlpha *= 0.5
    ctx.beginPath()
    rrect(ctx, bx, cy - scaledH / 2, barW, scaledH, 1)
    ctx.fill()
    ctx.globalAlpha /= 0.5
    bx += barW + barGap
  }

  // Duration
  const dur = beat.memory?.durationSeconds
  if (dur != null) {
    ctx.fillStyle = tokens.muted
    ctx.font = monoFont(8)
    ctx.textAlign = 'right'
    const m = Math.floor(dur / 60)
    const s = String(dur % 60).padStart(2, '0')
    ctx.fillText(`${m}:${s}`, x + pillW - 6, cy + 3)
  }

  // Transcript snippet (if room below pill)
  if (snippet && h > pillH + 18) {
    const sz = 12
    ctx.fillStyle = tokens.muted
    ctx.font = displayFont(traveler, 400, sz)
    ctx.textAlign = 'left'
    ctx.fillText(`"${snippet.slice(0, 36)}"`, x, y + pillH + sz + 5)
  }
}

// ── Canvas utilities ──────────────────────────────────────────────────

function wrapText(ctx, text, maxW) {
  if (!text) return ['']
  const words = text.split(' ')
  const lines = []
  let cur = ''
  for (const word of words) {
    const test = cur ? `${cur} ${word}` : word
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur)
      cur = word
    } else {
      cur = test
    }
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : ['']
}

function rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2)
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function hexAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}
