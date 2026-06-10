// worker/src/sharePage.js — the PUBLIC share page, server-rendered HTML.
// ----------------------------------------------------------------------------
// A non-app family member opens this cold from a texted link. It is:
//   • read-only, no login, no app chrome,
//   • auto-themed by the viewer's OS with a CSS @media query — PAPER postcard
//     (light) / FILM gallery (dark) — so there is NO JS flash and it themes
//     even with JS disabled,
//   • a faithful port of the "Share a moment" house design (share-system.jsx /
//     share-texture.jsx / share-glyphs.jsx / share-page.jsx): real grain, a
//     postage stamp + postmark, washi tape, photo prints (light) / 35mm film
//     (dark), the family-member glyph, an inked date stamp.
//
// SECURITY: every piece of user content (caption, note, place, names) goes
// through esc() before it touches the HTML — the page embeds author-authored
// text, so escaping is the XSS boundary. The view-model handed in is already
// the masking allowlist (see share.js shareViewFromMemory); this file renders
// ONLY those fields.

const FONT_LINK =
  'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&family=Inter+Tight:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap'

// HTML-escape — the XSS boundary for all embedded user text.
function esc(s) {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ISO (or epoch) → "June 3, 2026". Falsy / unparseable → ''.
function prettyDate(d) {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return ''
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December']
  return `${months[dt.getUTCMonth()]} ${dt.getUTCDate()}, ${dt.getUTCFullYear()}`
}

// mm:ss for a voice/video duration in seconds.
function clock(sec) {
  if (sec == null || isNaN(sec)) return ''
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Person identity: color + a white monoline glyph (deepened so white reads on
// the chip). Mirror of share-glyphs.jsx glyphPaths().
const PERSON = {
  Aurelia: '#C42A6B',
  Helen: '#2E7D52',
  Jonathan: '#2A5C94',
  Rafa: '#C24A22',
}
function glyphInner(name, c) {
  switch (name) {
    case 'Aurelia':
      return `<path d="M12 3.2c.55 5 1.05 5.5 6 6-4.95.5-5.45 1-6 6-.55-5-1.05-5.5-6-6 4.95-.5 5.45-1 6-6Z" fill="${c}"/>`
    case 'Helen':
      return `<path d="M12 4.5C7.8 7 7.6 13.4 12 18c4.4-4.6 4.2-11 0-13.5Z" fill="${c}"/><path d="M12 7.5V17.5" stroke="rgba(255,255,255,0.55)" stroke-width="1.5" stroke-linecap="round"/>`
    case 'Jonathan':
      return `<path d="M12 4.5 16 13.5 12 19 8 13.5Z" fill="${c}" stroke="${c}" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="11.4" r="1.15" fill="rgba(255,255,255,0.85)"/><path d="M12 12.6V17.6" stroke="rgba(255,255,255,0.6)" stroke-width="1.1" stroke-linecap="round"/>`
    case 'Rafa':
      return `<g fill="${c}" stroke="${c}" stroke-linejoin="round"><path d="M2.4 13.4c.3-1 1.4-1.3 2.6-1.4l3-.2c.9-1.3 2.1-1.9 3.6-1.9h2.3c.5.9 1.3 1.4 2.4 1.7l3 .7c.7.2 1.1.7 1.1 1.5v.6H2.4Z" stroke-width="0.5"/><path d="M19.4 9.6h2.6M20.7 9.6v2.4" fill="none" stroke="${c}" stroke-width="1.3" stroke-linecap="round"/><circle cx="7.4" cy="15.4" r="2.3"/><circle cx="16.2" cy="15.4" r="2.3"/><circle cx="7.4" cy="15.4" r="0.9" fill="rgba(0,0,0,0.4)" stroke="none"/><circle cx="16.2" cy="15.4" r="0.9" fill="rgba(0,0,0,0.4)" stroke="none"/></g>`
    default:
      return `<circle cx="12" cy="12" r="4.2" fill="${c}"/>`
  }
}
function glyphChip(name) {
  const c = PERSON[name] || '#7A7066'
  return `<span class="glyph-chip" style="background:${c}"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">${glyphInner(name, '#fff')}</svg></span>`
}

// The grain SVG data-URI (one image; the wrapper's blend-mode/opacity differ by
// theme via CSS).
function grainBg() {
  const svg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'>" +
    "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/>" +
    "<feColorMatrix type='saturate' values='0'/></filter>" +
    "<rect width='160' height='160' filter='url(#n)' opacity='0.55'/></svg>"
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

const PIN_SVG =
  '<svg width="9" height="12" viewBox="0 0 9 12" fill="none" aria-hidden="true"><path d="M4.5 11.2C4.5 11.2 8 7.4 8 4.4A3.5 3.5 0 1 0 1 4.4c0 3 3.5 6.8 3.5 6.8Z" stroke="var(--accent)" stroke-width="1.2"/><circle cx="4.5" cy="4.3" r="1.25" fill="var(--accent)"/></svg>'

const SHARE_GLYPH =
  '<svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 1.6v9.4"/><path d="M5.6 5 9 1.6 12.4 5"/><path d="M3.6 8.6H2.6v7h12.8v-7h-1"/></svg>'

const PLAY_SVG =
  '<svg width="22" height="22" viewBox="0 0 20 22" fill="#fff" aria-hidden="true"><path d="M0 1.5v19a1 1 0 0 0 1.5.87l16-9.5a1 1 0 0 0 0-1.74l-16-9.5A1 1 0 0 0 0 1.5Z" transform="translate(2 0)"/></svg>'

// A washi-tape strip (paper only).
function tape(w, rotate, color) {
  return `<span class="tape" style="width:${w}px;transform:rotate(${rotate}deg);--tape:${color || 'rgba(224,101,79,0.30)'}"></span>`
}

// ── postage stamp (paper header) — typographic, perforated ──
function stampSvg(from) {
  const w = 84, h = 104, r = 3.1, gx = w / 7, gy = h / 8.5
  let circles = ''
  for (let x = gx / 2; x < w; x += gx) circles += `<circle cx="${x.toFixed(1)}" cy="0" r="${r}" fill="#EFE7D6"/><circle cx="${x.toFixed(1)}" cy="${h}" r="${r}" fill="#EFE7D6"/>`
  for (let y = gy / 2; y < h; y += gy) circles += `<circle cx="0" cy="${y.toFixed(1)}" r="${r}" fill="#EFE7D6"/><circle cx="${w}" cy="${y.toFixed(1)}" r="${r}" fill="#EFE7D6"/>`
  const mark = `<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">${glyphInner(from, PERSON[from] || '#7A7066')}</svg>`
  return `<div class="stamp" aria-hidden="true">
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#FCFAF4"/><rect x="7" y="7" width="${w - 14}" height="${h - 14}" fill="none" stroke="rgba(168,75,49,0.55)" stroke-width="1"/>${circles}</svg>
    <div class="stamp-inner"><span class="stamp-top">FAMILY TRIPS</span>${mark}<span class="stamp-bot">NE &rsquo;26</span></div>
  </div>`
}

// ── postmark cancellation (paper header) — rings + arced text + wavy lines ──
function postmarkSvg() {
  const size = 78, c = size / 2, rOuter = c - 4, rText = c - 13, rInner = c - 22
  const top = `M ${c - rText},${c} A ${rText},${rText} 0 0 1 ${c + rText},${c}`
  const bot = `M ${c - rText},${c} A ${rText},${rText} 0 0 0 ${c + rText},${c}`
  let waves = ''
  for (const y of [c - 16, c, c + 16]) waves += `<path d="M ${c + rOuter - 4} ${y} q 14 -7 28 0 q 14 7 28 0 q 14 -7 28 0"/>`
  return `<svg class="postmark" width="${size + 96}" height="${size}" viewBox="0 0 ${size + 96} ${size}" aria-hidden="true">
    <defs><path id="pmt" d="${top}"/><path id="pmb" d="${bot}"/></defs>
    <g stroke="var(--postmark)" stroke-width="2" fill="none" stroke-linecap="round">${waves}</g>
    <circle cx="${c}" cy="${c}" r="${rOuter}" fill="none" stroke="var(--postmark)" stroke-width="1.6"/>
    <circle cx="${c}" cy="${c}" r="${rInner + 2}" fill="none" stroke="var(--postmark)" stroke-width="1"/>
    <text fill="var(--postmark)" font-family="var(--mono)" font-size="9" letter-spacing="1.5"><textPath href="#pmt" startOffset="50%" text-anchor="middle">FAMILY TRIPS</textPath></text>
    <text fill="var(--postmark)" font-family="var(--mono)" font-size="9" letter-spacing="1.5"><textPath href="#pmb" startOffset="50%" text-anchor="middle">NEW ENGLAND</textPath></text>
    <text x="${c}" y="${c + 3.5}" text-anchor="middle" fill="var(--postmark)" font-family="var(--mono)" font-size="11" letter-spacing="1">JUN 2026</text>
  </svg>`
}

// ── the waveform (voice) ──
const WAVE = [7, 13, 20, 11, 26, 16, 9, 23, 31, 18, 12, 28, 17, 9, 22, 14, 27, 12, 8, 19, 25, 15, 10, 30, 20, 13, 24, 16, 9, 21, 29, 17, 11, 26, 14, 8, 23, 19, 12, 28, 16, 10, 22, 31, 18, 13, 25, 15]
function waveBars(n, scale, litCount) {
  let out = ''
  for (let i = 0; i < n; i++) {
    const h = Math.round(WAVE[i] * scale)
    out += `<span style="height:${h}px;background:${i < litCount ? 'var(--accent)' : 'var(--wave-dim)'}"></span>`
  }
  return out
}

// ── film frame (dark photo hero) ──
function filmFrame(url, h, frame) {
  let rail = ''
  for (let i = 0; i < 7; i++) rail += '<span></span>'
  const inner = url
    ? `<img src="${esc(url)}" alt="" style="height:${h}px"/>`
    : `<div class="ph" style="height:${h}px"></div>`
  return `<div class="film">
    <div class="rail rail-l" aria-hidden="true">${rail}</div><div class="rail rail-r" aria-hidden="true">${rail}</div>
    <div class="film-img">${inner}</div>
    <span class="film-kodak">KODAK 400</span><span class="film-no">${esc(frame)} &rsaquo;</span>
  </div>`
}

// ── photo print (light photo hero) ──
function printPhoto(url, h, rotate, withTape) {
  const inner = url
    ? `<img src="${esc(url)}" alt="" style="height:${h}px"/>`
    : `<div class="ph" style="height:${h}px"></div>`
  return `<div class="print" style="transform:rotate(${rotate}deg)">
    <div class="print-mat">${inner}</div>
    ${withTape ? `<span class="print-tape">${tape(80, rotate < 0 ? 4 : -5)}</span>` : ''}
  </div>`
}

// Build the hero block(s). For photo/album/video we render BOTH a paper print
// and a film frame, toggled by the prefers-color-scheme media query (so it
// themes with no JS). Note/voice are theme-shared (colors via vars).
function heroHtml(view) {
  const photos = view.photos || []
  const first = photos[0]
  const isVideo = view.kind === 'video' || (first && (first.posterUrl || (first.mime || '').startsWith('video')))
  const posterUrl = first ? (first.posterUrl || first.url) : ''

  if (view.kind === 'text' || (!photos.length && !view.audio)) {
    // NOTE (text-only)
    const text = esc(view.note || view.caption || '')
    const big = (view.note || '').length > 150
    return `<div class="hero">
      <div class="paper-only note-paper">
        <span class="print-tape" style="left:30px">${tape(70, -6)}</span>
        <div class="note-quote" aria-hidden="true">&ldquo;</div>
        <p class="note-text" style="font-size:${big ? 22 : 25}px">${text}</p>
      </div>
      <div class="film-only note-film">
        <div class="note-label">&mdash; a note &mdash;</div>
        <div class="note-quote" aria-hidden="true">&ldquo;</div>
        <p class="note-text" style="font-size:${big ? 24 : 28}px">${text}</p>
      </div>
    </div>`
  }

  if (!photos.length && view.audio) {
    // VOICE (audio-only)
    const dur = clock(view.audio.durationSeconds) || '0:34'
    return `<div class="hero"><div class="voice-card">
      <span class="print-tape paper-only" style="left:28px">${tape(72, -5)}</span>
      <div class="voice-label">Voice note</div>
      <div class="voice-row">
        <span class="voice-play"><svg width="16" height="18" viewBox="0 0 16 18" fill="var(--accent-ink)" aria-hidden="true"><path d="M0 1.5v15a1 1 0 0 0 1.5.87l13-7.5a1 1 0 0 0 0-1.74l-13-7.5A1 1 0 0 0 0 1.5Z"/></svg></span>
        <span class="wave wave-tall">${waveBars(48, 1.5, 18)}</span>
      </div>
      <div class="voice-time"><span>0:12</span><span>${esc(dur)}</span></div>
    </div></div>`
  }

  // PHOTO / ALBUM / VIDEO — paper print + film frame, toggled by theme.
  const tall = false
  const videoTag = (cls) =>
    isVideo
      ? `<span class="play-badge ${cls}">${PLAY_SVG}</span><span class="video-tag ${cls}"><span class="dot"></span>VIDEO</span>`
      : ''
  const more = photos.length > 1 ? `<span class="more-chip">+${photos.length - 1} more</span>` : ''
  return `<div class="hero hero-photo">
    <div class="paper-only">${printPhoto(isVideo ? posterUrl : (first && first.url), tall ? 360 : 286, -1.6, true)}${videoTag('paper-only')}${more}</div>
    <div class="film-only">${filmFrame(isVideo ? posterUrl : (first && first.url), tall ? 360 : 300, isVideo ? '24' : '23A')}${videoTag('film-only')}</div>
  </div>`
}

// The voice chip that attaches under a photo/album/video memory that ALSO has a
// voice note. (We only attach when there are photos AND audio.)
function voiceChipHtml(view) {
  if (!view.audio || !(view.photos && view.photos.length)) return ''
  const dur = clock(view.audio.durationSeconds) || '0:20'
  return `<div class="voice-chip-wrap"><div class="voice-chip">
    <span class="voice-play sm"><svg width="9" height="10" viewBox="0 0 10 11" fill="var(--accent-ink)" aria-hidden="true"><path d="M0 1v9a.5.5 0 0 0 .8.4l7.5-4.5a.5.5 0 0 0 0-.8L.8.6A.5.5 0 0 0 0 1Z"/></svg></span>
    <span class="wave wave-sm">${waveBars(30, 0.8, 11)}</span>
    <span class="voice-chip-dur">${esc(dur)}</span>
  </div></div>`
}

// ── the CSS (paper default; @media dark → film) ──
function styles() {
  return `
*{box-sizing:border-box}
html,body{margin:0;padding:0}
:root{
  --bg:#EFE7D6;--bg2:#E7DCC6;--mat:#FCFAF4;--ink:#211E18;--soft:#574F42;
  --faint:rgba(33,30,24,0.42);--line:rgba(33,30,24,0.14);--line-bold:rgba(33,30,24,0.26);
  --accent:#A84B31;--accent-ink:#FCFAF4;--wave-dim:rgba(33,30,24,0.2);--postmark:rgba(33,30,24,0.46);
  --grain-blend:multiply;--grain-op:0.45;
  --serif:"Fraunces","Iowan Old Style",Georgia,serif;
  --sans:"Inter Tight",-apple-system,system-ui,sans-serif;
  --mono:"JetBrains Mono",ui-monospace,"SF Mono",Menlo,monospace;
  color-scheme:light;
}
@media (prefers-color-scheme:dark){:root{
  --bg:#141210;--bg2:#1C1916;--mat:#211D19;--ink:#ECE4D4;--soft:rgba(236,228,212,0.64);
  --faint:rgba(236,228,212,0.34);--line:rgba(236,228,212,0.14);--line-bold:rgba(236,228,212,0.26);
  --accent:#E78064;--accent-ink:#FCFAF4;--wave-dim:rgba(236,228,212,0.22);
  --grain-blend:soft-light;--grain-op:0.5;color-scheme:dark;
}}
.paper-only{display:revert}.film-only{display:none}
@media (prefers-color-scheme:dark){.paper-only{display:none !important}.film-only{display:revert !important}}
body{background:var(--bg);color:var(--ink);font-family:var(--sans);-webkit-font-smoothing:antialiased}
.page{position:relative;max-width:460px;margin:0 auto;min-height:100vh;background:var(--bg);overflow:hidden}
.grain{position:absolute;inset:0;pointer-events:none;z-index:3;background-image:${grainBg()};background-size:160px 160px;mix-blend-mode:var(--grain-blend);opacity:var(--grain-op)}
.mono{font-family:var(--mono)}
.soft{color:var(--soft)}
.hdr{position:relative;z-index:2;display:flex;align-items:flex-start;justify-content:space-between;padding:22px 26px 0;min-height:64px}
.eyebrow{display:flex;align-items:center;gap:9px;padding-top:8px}
.house-mark{display:inline-block;width:9px;height:9px;background:var(--accent);transform:rotate(45deg);border-radius:1px}
.eyebrow-label{font-family:var(--mono);font-size:10.5px;letter-spacing:2px;text-transform:uppercase;color:var(--soft)}
.hdr-right{position:relative}
.stamp-cluster{position:relative;width:120px;height:64px}
.stamp{position:absolute;top:0;right:0;transform:rotate(4deg);filter:drop-shadow(0 4px 7px rgba(70,52,30,0.28))}
.stamp svg{display:block}
.stamp-inner{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:14px 8px 12px}
.stamp-top{font-family:var(--mono);font-size:7.5px;letter-spacing:1.2px;color:rgba(168,75,49,0.8)}
.stamp-bot{font-family:var(--mono);font-size:8px;letter-spacing:1px;color:rgba(33,30,24,0.62)}
.postmark{position:absolute;top:12px;right:34px;transform:rotate(-10deg)}
.roll-label{font-family:var(--mono);font-size:10px;letter-spacing:1.6px;color:var(--soft);text-transform:uppercase;padding-top:8px;display:inline-block}
.hero{position:relative;z-index:2;margin-top:10px}
.hero-photo .paper-only,.hero-photo .film-only{position:relative}
.print{position:relative;margin:8px 30px 0}
.print-mat{background:#FCFAF4;padding:8px 8px 12px;border-radius:2px;box-shadow:0 1px 0 rgba(255,255,255,0.8) inset,0 2px 4px rgba(70,52,30,0.16),0 20px 40px -20px rgba(70,52,30,0.42)}
.print-mat img,.film-img img{display:block;width:100%;object-fit:cover;border-radius:1px}
.ph{width:100%;background:repeating-linear-gradient(45deg,#E8DDC8 0 13px,#e1d4ba 13px 26px)}
.print-tape{position:absolute;top:-11px;left:50%;transform:translateX(-50%);z-index:4}
.tape{display:inline-block;height:26px;background:repeating-linear-gradient(90deg,var(--tape) 0 7px,rgba(255,255,255,0.10) 7px 14px);background-color:var(--tape);clip-path:polygon(3% 0,97% 0,100% 22%,98% 50%,100% 78%,97% 100%,3% 100%,0 78%,2% 50%,0 22%);box-shadow:0 1px 2px rgba(70,52,30,0.18);opacity:0.92}
.film{position:relative;background:#0C0A09;border-radius:3px;padding:0 16px;margin:6px 22px 0;box-shadow:0 26px 60px -26px rgba(0,0,0,0.85)}
.film-img{position:relative;z-index:1}
.rail{position:absolute;top:0;bottom:0;width:16px;display:flex;flex-direction:column;justify-content:space-around;align-items:center;padding:8px 0;z-index:2;background:#0C0A09}
.rail-l{left:0}.rail-r{right:0}
.rail span{width:8px;height:11px;border-radius:2px;background:#2A2521}
.film-kodak{position:absolute;top:6px;left:24px;z-index:3;font-family:var(--mono);font-size:10px;letter-spacing:1.5px;color:rgba(236,228,212,0.5)}
.film-no{position:absolute;bottom:6px;right:24px;z-index:3;font-family:var(--mono);font-size:11px;letter-spacing:1.5px;color:#E78064}
.play-badge{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:66px;height:66px;border-radius:50%;background:rgba(20,18,16,0.42);border:1.5px solid rgba(255,255,255,0.85);display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(0,0,0,0.35);z-index:5;pointer-events:none}
.video-tag{position:absolute;bottom:26px;left:36px;display:inline-flex;align-items:center;gap:6px;background:rgba(20,18,16,0.6);border-radius:5px;padding:4px 8px;font-family:var(--mono);font-size:10px;letter-spacing:1.2px;color:#fff;text-transform:uppercase;z-index:5}
.video-tag .dot{width:6px;height:6px;border-radius:50%;background:#fff}
.more-chip{position:absolute;bottom:2px;right:34px;transform:rotate(-3deg);background:#FCFAF4;border-radius:20px;padding:5px 12px;box-shadow:0 4px 10px -3px rgba(70,52,30,0.4);font-family:var(--mono);font-size:11px;letter-spacing:0.8px;color:#A84B31;z-index:5}
.note-paper{position:relative;margin:4px 26px 0;background:#F7F2E7;padding:30px 24px 26px;border-radius:2px;transform:rotate(-0.6deg);box-shadow:0 2px 4px rgba(70,52,30,0.12),0 22px 46px -22px rgba(70,52,30,0.4);clip-path:polygon(0 0,100% 0,100% 97%,97% 99%,90% 97%,80% 100%,68% 97%,55% 99%,42% 97%,30% 100%,18% 97%,8% 99%,0 97%)}
.note-film{margin:8px 30px 0}
.note-label{font-family:var(--mono);font-size:10px;letter-spacing:2px;color:rgba(236,228,212,0.5);text-transform:uppercase;margin-bottom:14px}
.note-quote{font-family:var(--serif);font-size:60px;line-height:0.4;color:var(--accent);height:26px}
.note-text{margin:8px 0 0;font-family:var(--serif);font-weight:400;line-height:1.34;color:var(--ink);letter-spacing:-0.2px;text-wrap:pretty}
.voice-card{position:relative;margin:6px 28px 0;background:var(--mat);border:1px solid var(--line);border-radius:6px;padding:24px 22px 18px;box-shadow:0 2px 4px rgba(70,52,30,0.14),0 22px 46px -22px rgba(70,52,30,0.42)}
.voice-label{font-family:var(--mono);font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--soft);margin-bottom:16px}
.voice-row{display:flex;align-items:center;gap:14px}
.voice-play{flex:0 0 auto;width:52px;height:52px;border-radius:50%;background:var(--accent);display:inline-flex;align-items:center;justify-content:center;box-shadow:0 4px 12px -4px rgba(0,0,0,0.4)}
.voice-play.sm{width:28px;height:28px}
.wave{flex:1;display:flex;align-items:center;gap:2.5px;overflow:hidden}
.wave-tall{height:50px}.wave-sm{height:24px}
.wave span{flex:1;min-width:0;border-radius:2px}
.voice-time{display:flex;justify-content:space-between;margin-top:12px;font-family:var(--mono);font-size:11px;letter-spacing:0.5px;color:var(--soft)}
.voice-chip-wrap{position:relative;z-index:2;padding:16px 30px 0}
.voice-chip{display:flex;align-items:center;gap:10px;background:var(--mat);border:1px solid var(--line);border-radius:22px;padding:8px 14px 8px 10px}
.voice-chip-dur{flex:0 0 auto;font-family:var(--mono);font-size:11px;color:var(--soft)}
.content{position:relative;z-index:2;padding:0 30px;margin-top:26px}
.caption{margin:0 0 20px;font-family:var(--serif);font-weight:400;line-height:1.45;color:var(--ink);letter-spacing:-0.1px;text-wrap:pretty}
.metarow{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:22px}
.place{display:inline-flex;align-items:center;gap:6px;font-family:var(--mono);font-size:12px;letter-spacing:0.6px;color:var(--ink);white-space:nowrap}
.datestamp{display:inline-block;transform:rotate(-4deg);font-family:var(--mono);font-size:12px;letter-spacing:1.5px;text-transform:uppercase;white-space:nowrap;color:var(--accent);border:1.5px solid var(--accent);border-radius:4px;padding:3px 8px;opacity:0.82}
.date-mono{font-family:var(--mono);font-size:12px;letter-spacing:1px;color:var(--soft);text-transform:uppercase}
.attrib{display:flex;align-items:center;gap:12px;margin-bottom:22px}
.glyph-chip{flex:0 0 auto;width:32px;height:32px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,0.22),0 1px 2px rgba(0,0,0,0.18)}
.attrib-name{font-family:var(--sans);font-size:15px;color:var(--ink);line-height:1.25}
.attrib-name b{font-family:var(--serif);font-weight:600}
.attrib-trip{font-family:var(--mono);font-size:10.5px;letter-spacing:1px;text-transform:uppercase;color:var(--soft);margin-top:2px}
.share-btn{width:100%;height:48px;min-height:48px;margin-bottom:26px;cursor:pointer;-webkit-appearance:none;appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:9px;background:var(--btn-fill);color:var(--ink);border:1.5px solid var(--line-bold);border-radius:10px;font-family:var(--sans);font-size:14.5px;font-weight:600}
:root{--btn-fill:rgba(33,30,24,0.025)}
@media (prefers-color-scheme:dark){:root{--btn-fill:rgba(236,228,212,0.05)}}
.footer{border-top:1px solid var(--line);padding-top:18px;padding-bottom:28px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.footer-l{font-family:var(--sans);font-size:12.5px;color:var(--soft);line-height:1.4}
.footer-r{display:inline-flex;align-items:center;gap:7px;flex:0 0 auto}
.footer-r .mono{font-family:var(--mono);font-size:10.5px;letter-spacing:1px;text-transform:uppercase;color:var(--soft)}
@media (prefers-reduced-motion:reduce){*{animation:none !important;transition:none !important}}
`
}

// The page <head> with Open Graph (the og:image is the real photo for now;
// the composed card A is a later slice).
function head(view, pageUrl) {
  const title = view.caption || view.note || (view.place ? `A moment · ${view.place}` : 'A moment')
  const desc = [view.place, view.tripName, view.authorName && `from ${view.authorName}`]
    .filter(Boolean).join(' · ') || "A moment from the Jackson-Hemleys’ trip"
  const ogImg = (view.photos && view.photos[0] && (view.photos[0].posterUrl || view.photos[0].url)) || ''
  const og = ogImg
    ? `<meta property="og:image" content="${esc(ogImg)}"><meta name="twitter:card" content="summary_large_image">`
    : '<meta name="twitter:card" content="summary">'
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title.slice(0, 70))} · Family Trips</title>
<meta name="theme-color" content="#EFE7D6" media="(prefers-color-scheme:light)">
<meta name="theme-color" content="#141210" media="(prefers-color-scheme:dark)">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title.slice(0, 110))}">
<meta property="og:description" content="${esc(desc.slice(0, 160))}">
${ogImg ? '' : ''}${og}
${pageUrl ? `<meta property="og:url" content="${esc(pageUrl)}">` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${FONT_LINK}" rel="stylesheet">
<style>${styles()}</style>`
}

// PUBLIC: render the full page for one memory's safe view-model.
export function renderSharePage(view, { pageUrl } = {}) {
  const from = view.authorName || 'A friend'
  const tripLine = [view.tripName, view.tripDateRange].filter(Boolean).join(' · ')
  const date = prettyDate(view.date)
  const isNote = view.kind === 'text' || (!(view.photos && view.photos.length) && !view.audio)

  const captionHtml =
    !isNote && view.caption
      ? `<p class="caption" style="font-size:${view.caption.length > 130 ? 18.5 : 20.5}px">${esc(view.caption)}</p>`
      : ''
  const metaHtml =
    view.place || date
      ? `<div class="metarow">${view.place ? `<span class="place">${PIN_SVG}${esc(view.place)}</span>` : ''}${date ? `<span class="datestamp paper-only">${esc(date)}</span><span class="date-mono film-only">${esc(date)}</span>` : ''}</div>`
      : ''

  const body = `<main class="page">
  <div class="grain" aria-hidden="true"></div>
  <header class="hdr">
    <div class="eyebrow"><span class="house-mark"></span><span class="eyebrow-label">A moment</span></div>
    <div class="hdr-right">
      <div class="paper-only stamp-cluster">${stampSvg(from)}${postmarkSvg()}</div>
      <span class="film-only roll-label">roll 02 &middot; ${esc(from)}</span>
    </div>
  </header>
  ${heroHtml(view)}
  ${voiceChipHtml(view)}
  <div class="content">
    ${captionHtml}
    ${metaHtml}
    <div class="attrib">${glyphChip(from)}<div><div class="attrib-name">from <b>${esc(from)}</b></div>${tripLine ? `<div class="attrib-trip">${esc(tripLine)}</div>` : ''}</div></div>
    <button class="share-btn" type="button" id="shareBtn" aria-label="Share this moment">${SHARE_GLYPH}<span id="shareLbl">Share this moment</span></button>
    <div class="footer"><span class="footer-l">A moment from the Jackson-Hemleys&rsquo; trip</span><span class="footer-r"><span class="house-mark"></span><span class="mono">Family Trips</span></span></div>
  </div>
</main>
<script>
(function(){var b=document.getElementById('shareBtn'),l=document.getElementById('shareLbl');if(!b)return;
b.addEventListener('click',function(){var u=location.href;
if(navigator.share){navigator.share({title:"A moment from the Jackson-Hemleys\\u2019 trip",url:u}).catch(function(){});return;}
if(navigator.clipboard){navigator.clipboard.writeText(u).catch(function(){});}
if(l){l.textContent='Link copied';setTimeout(function(){l.textContent='Share this moment';},1900);}});
})();
</script>`

  return `<!doctype html><html lang="en"><head>${head(view, pageUrl)}</head><body>${body}</body></html>`
}

// PUBLIC: a small, on-brand page for a dead / unavailable link.
export function renderShareError(gone) {
  const msg = gone
    ? "This moment isn’t shared anymore."
    : "This link doesn’t lead anywhere."
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Family Trips</title>
<meta name="theme-color" content="#EFE7D6" media="(prefers-color-scheme:light)"><meta name="theme-color" content="#141210" media="(prefers-color-scheme:dark)">
<link href="${FONT_LINK}" rel="stylesheet"><style>${styles()}
.err{max-width:460px;margin:0 auto;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px}
.err h1{font-family:var(--serif);font-weight:500;font-size:26px;color:var(--ink);margin:0 0 10px}
.err p{font-family:var(--sans);font-size:14.5px;color:var(--soft);margin:0}
.err .house-mark{margin-bottom:22px}</style></head>
<body><div class="err"><span class="house-mark"></span><h1>${esc(msg)}</h1><p>Ask whoever sent it for a fresh link.</p></div></body></html>`
}
