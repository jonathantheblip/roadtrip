import { APP_IDENTITY } from '../data/appIdentity'

// The home-screen app icon visual (design handoff shared.jsx AppIcon): a
// rounded-square gradient tile showing either a picked emblem (emoji) or
// the person's default glyph. Used in the InstallIdentity picker, the
// family-suitcase row, and the Settings entry. The REAL installed icon is
// a canvas rasterization of this same look — see lib/appInstall.
export function AppIcon({ id, size = 60, radius, emblem, style }) {
  const a = APP_IDENTITY[id]
  if (!a) return null
  const r = radius != null ? radius : size * 0.225
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: r,
        position: 'relative',
        overflow: 'hidden',
        background: `linear-gradient(160deg, ${a.bg1}, ${a.bg2})`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.18), 0 ${size * 0.08}px ${size * 0.18}px -${size * 0.06}px rgba(0,0,0,0.5)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        ...style,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(120% 80% at 50% 0%, rgba(255,255,255,0.16), transparent 60%)',
        }}
      />
      {emblem ? (
        <span style={{ fontSize: size * 0.46, position: 'relative', lineHeight: 1 }}>{emblem}</span>
      ) : (
        <span
          style={{
            fontFamily: a.font,
            fontSize: size * (id === 'rafa' ? 0.5 : 0.52),
            fontWeight: id === 'rafa' ? 700 : 600,
            fontStyle: a.italic ? 'italic' : 'normal',
            color: a.fg,
            position: 'relative',
            lineHeight: 1,
          }}
        >
          {a.glyph}
        </span>
      )}
    </div>
  )
}
