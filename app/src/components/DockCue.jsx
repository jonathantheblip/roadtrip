// DockCue — the live-ledge cue chips, tuned for the dock's DARK GLASS.
//
// The ledge sits on rgba(10,10,12,0.82) on EVERY skin (the dock is global
// chrome — dark even over Helen's warm paper). The home-band EntryCues are
// themed for each persona's HOME surface (Helen's light paper especially), so
// they don't read on the dark glass. These are the design's dark-glass cue
// variants (handoff src/cues.jsx). Like EntryCues, each carries a NON-COLOR
// signal — a shape AND a word — so it reads without relying on hue (WCAG
// 1.4.1). Jonathan/Aurelia accents are text-safe on dark (their homes are
// dark too); Helen's sage is fill-only on dark, so her chip is a solid pill
// with ink text (white on sage ≈ 4.8:1) rather than tinted text.

const wrap = { whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center' }
const MONO = 'JetBrains Mono, monospace'

// The two living signals, per skin. `kind` is 'weave-ready' | 'surprise-revealed'.
export function DockCue({ kind, traveler }) {
  const surprise = kind === 'surprise-revealed'

  if (traveler === 'jonathan') {
    return (
      <span style={{ ...wrap, gap: 6, fontFamily: MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '1.4px', textTransform: 'uppercase', color: 'var(--accent-text)' }}>
        <span style={{ width: surprise ? 9 : 8, height: surprise ? 9 : 8, background: surprise ? 'transparent' : 'var(--accent)', border: surprise ? '1.6px solid var(--accent)' : 'none', borderRadius: 1 }} />
        {surprise ? 'UNSEALED' : 'NEW PAGE'}
      </span>
    )
  }

  if (traveler === 'helen') {
    // Solid sage pill, white ink — reads on the dark glass where her home
    // light-paper chip would not.
    return (
      <span style={{ ...wrap, gap: 7, padding: '4px 11px 4px 9px', borderRadius: 999, background: 'var(--accent)', color: 'var(--accent-ink)', fontFamily: 'var(--font-body)', fontSize: 11.5, fontWeight: 600 }}>
        <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center' }}>
          {surprise ? '🎁' : <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: 'var(--accent-ink)' }} />}
        </span>
        {surprise ? 'Revealed for you' : 'New page'}
      </span>
    )
  }

  if (traveler === 'aurelia') {
    // A dock-tuned pink, brighter than her home --accent-text (#FF5C8E). axe
    // computes the translucent glass over white (the dark page bg is on a
    // sibling of the fixed dock, not an ancestor), so her home pink lands at
    // 4.23:1 — just under AA. #FF7DA4 clears it on that worst-case bg (and is
    // even higher on the real dark glass). The accent SHAPE stays --accent.
    return (
      <span style={{ ...wrap, gap: 8, fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: surprise ? 16 : 15, color: '#FF7DA4' }}>
        <span style={{ width: 8, height: 8, background: 'var(--accent)', transform: 'rotate(45deg)', boxShadow: '0 0 10px var(--accent)' }} />
        {surprise ? 'something arrived for you' : 'new'}
      </span>
    )
  }

  // rafa — never renders a ledge, but keep a safe candy fallback.
  return (
    <span style={{ ...wrap, gap: 5, fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--accent-ink)', background: surprise ? 'var(--sticker-5, var(--accent))' : 'var(--accent)', padding: '3px 11px 3px 8px', borderRadius: 999 }}>
      <span aria-hidden="true">{surprise ? '🎁' : '⭐'}</span>
      {surprise ? 'For you!' : 'NEW!'}
    </span>
  )
}
