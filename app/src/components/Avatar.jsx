import { TRAVELERS, TRAVELER_DOT } from '../data/travelers'

// Circular avatar with traveler initial. Matches the Design system.jsx
// Avatar primitive — solid traveler dot color, white initial, optional
// double-ring for active state.
export function Avatar({ id, size = 28, ring = false, style }) {
  const t = TRAVELERS[id]
  if (!t) return null
  const dot = TRAVELER_DOT[id] || '#777'
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: dot,
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter Tight, system-ui, sans-serif',
        fontWeight: 600,
        fontSize: size * 0.42,
        flexShrink: 0,
        boxShadow: ring ? `0 0 0 2px var(--card), 0 0 0 4px ${dot}` : 'none',
        ...style,
      }}
    >
      {t.name.slice(0, 1)}
    </div>
  )
}

// Stack of avatars — overlapping circles (Design AvatarStack).
export function AvatarStack({ ids, size = 22, max = 4, gap = -6 }) {
  const visible = ids.slice(0, max)
  return (
    <div style={{ display: 'inline-flex' }}>
      {visible.map((id, i) => (
        <div
          key={id}
          style={{
            marginLeft: i === 0 ? 0 : gap,
            position: 'relative',
            zIndex: visible.length - i,
          }}
        >
          <Avatar id={id} size={size} ring />
        </div>
      ))}
    </div>
  )
}
