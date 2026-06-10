// EntryCues — the two living signals, per skin (entry-points redesign).
// Each cue carries a NON-COLOR signal (a shape AND a word) so it reads without
// relying on hue (WCAG 1.4.1). Color drives off the theme tokens: shapes/FILLS
// use --accent; accent-as-TEXT uses --accent-text (Jonathan/Aurelia --accent is
// fill-only on their dark skins). Ported from the design's cues.jsx.
const wrap = { whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center' }
const MONO = 'JetBrains Mono, monospace'

// Weave "ready" — last night's page is newer than what you've seen.
export function WeaveReady({ traveler }) {
  if (traveler === 'jonathan') {
    return (
      <span style={{ ...wrap, gap: 6, fontFamily: MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '1.4px', textTransform: 'uppercase', color: 'var(--accent-text)' }}>
        <span style={{ width: 8, height: 8, background: 'var(--accent)', borderRadius: 1 }} />NEW PAGE
      </span>
    )
  }
  if (traveler === 'helen') {
    return (
      <span style={{ ...wrap, gap: 6, padding: '3px 9px 3px 7px', borderRadius: 999, background: 'color-mix(in srgb, var(--accent) 13%, transparent)', color: 'var(--accent-text)', fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent)' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)' }} />New page
      </span>
    )
  }
  if (traveler === 'aurelia') {
    return (
      <span style={{ ...wrap, gap: 7, fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 15, color: 'var(--accent-text)' }}>
        <span style={{ width: 7, height: 7, background: 'var(--accent)', transform: 'rotate(45deg)', boxShadow: '0 0 9px var(--accent)' }} />new
      </span>
    )
  }
  return (
    <span style={{ ...wrap, gap: 5, fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--accent-ink)', background: 'var(--accent)', padding: '3px 11px 3px 8px', borderRadius: 999, boxShadow: '0 3px 0 color-mix(in srgb, var(--accent) 55%, #000)' }}>
      <span style={{ fontSize: 13 }} aria-hidden="true">⭐</span>NEW!
    </span>
  )
}

// Surprise "revealed for you" — something hidden from you just unlocked.
export function SurpriseReveal({ traveler }) {
  if (traveler === 'jonathan') {
    return (
      <span style={{ ...wrap, gap: 6, fontFamily: MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '1.4px', textTransform: 'uppercase', color: 'var(--accent-text)' }}>
        <span style={{ width: 9, height: 9, border: '1.6px solid var(--accent)', borderRadius: 1 }} />UNSEALED
      </span>
    )
  }
  if (traveler === 'helen') {
    return (
      <span style={{ ...wrap, gap: 7, padding: '5px 12px 5px 9px', borderRadius: 999, background: 'var(--accent)', color: 'var(--accent-ink)', fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600 }}>
        <span aria-hidden="true">🎁</span>Revealed for you
      </span>
    )
  }
  if (traveler === 'aurelia') {
    return (
      <span style={{ ...wrap, gap: 8, fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 16, color: 'var(--accent-text)' }}>
        <span style={{ width: 8, height: 8, background: 'var(--accent)', transform: 'rotate(45deg)', boxShadow: '0 0 10px var(--accent)' }} />something arrived for you
      </span>
    )
  }
  return (
    <span style={{ ...wrap, gap: 6, fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--accent-ink)', background: 'var(--sticker-5, var(--accent))', padding: '5px 14px 5px 10px', borderRadius: 999, boxShadow: '0 4px 0 color-mix(in srgb, var(--sticker-5, var(--accent)) 55%, #000)' }}>
      <span style={{ fontSize: 16 }} aria-hidden="true">🎁</span>For you!
    </span>
  )
}
