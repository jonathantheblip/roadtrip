// WaveCue — the receive side of "Wave hi!". When an unseen wave arrives, a warm
// pop appears (bobbing 👋 + who waved), then marks itself seen after a beat so it
// shows exactly once. Per-lens: a big candy pop for Rafa, a quieter chip for the
// grown-ups. Tap to dismiss early. Mounted once at App level so a wave lands no
// matter which tab the recipient is on.
import { useEffect } from 'react'
import { displayName } from '../lib/surprises'

export function WaveCue({ waves = [], viewer, onSeen }) {
  const wave = waves[0] || null
  useEffect(() => {
    if (!wave) return undefined
    const t = setTimeout(() => onSeen(wave.id), 4500)
    return () => clearTimeout(t)
  }, [wave && wave.id, onSeen]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!wave) return null

  const isKid = viewer === 'rafa'
  const from = displayName(wave.from, viewer) // Mama/Papa/Sissy for Rafa; real names otherwise
  return (
    <button
      type="button"
      data-testid="wave-cue"
      onClick={() => onSeen(wave.id)}
      aria-label={`${from} waved at you`}
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 'calc(86px + env(safe-area-inset-bottom))',
        transform: 'translateX(-50%)',
        zIndex: 55,
        display: 'inline-flex',
        alignItems: 'center',
        gap: isKid ? 12 : 9,
        border: 'none',
        cursor: 'pointer',
        borderRadius: isKid ? 26 : 999,
        padding: isKid ? '15px 22px' : '11px 18px',
        background: 'var(--accent, #2b6cb0)',
        color: 'var(--accent-ink, #fff)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
        fontFamily: isKid ? "'Fredoka', 'Inter Tight', system-ui, sans-serif" : 'inherit',
        fontWeight: 700,
        fontSize: isKid ? 20 : 14.5,
        maxWidth: '90vw',
        animation: 'wavePop 0.35s ease-out',
      }}
    >
      <span aria-hidden="true" style={{ fontSize: isKid ? 28 : 20, animation: 'ftBob 1s ease-in-out infinite' }}>👋</span>
      <span>{isKid ? `${from} waved at you!` : `${from} waved hi`}</span>
    </button>
  )
}
