import { useState } from 'react'
import { ChevronLeft, Plus, Check } from 'lucide-react'
import { TRAVELERS, TRAVELER_ORDER } from '../data/travelers'
import { APP_IDENTITY, getSticker, setSticker } from '../data/appIdentity'
import { applyInstallIdentity } from '../lib/appInstall'
import { AppIcon } from '../components/AppIcon'

// "Make it yours" — each person's home-screen app identity (design handoff
// shared.jsx InstallIdentity). Pick a sticker → it becomes the icon emblem,
// the per-person manifest + icon are applied (lib/appInstall), and the
// install is finished by the browser's Add-to-Home-Screen. Custom-art upload
// ("…or drop your own picture") is a noted follow-on (image emblems need
// async rasterization). Reads/writes the picked sticker via appIdentity.
//
// Rafa (4) calls the family Mama / Papa / Sissy inside his lens.
const RAFA_NAMES = { helen: 'Mama', jonathan: 'Papa', aurelia: 'Sissy', rafa: 'me' }
function familyLabel(id, viewer) {
  if (viewer === 'rafa' && RAFA_NAMES[id]) return RAFA_NAMES[id]
  return TRAVELERS[id]?.name || id
}

export function InstallIdentity({ traveler, onClose }) {
  const a = APP_IDENTITY[traveler]
  const name = TRAVELERS[traveler]?.name || traveler
  const isRafa = traveler === 'rafa'
  const you = isRafa ? 'you' : name
  const [sticker, setStickerState] = useState(() => getSticker(traveler))
  const [added, setAdded] = useState(false)
  const others = TRAVELER_ORDER.filter((id) => id !== traveler)

  // The "finish in your Share menu → Add to Home Screen" step only exists on a
  // touch browser that isn't already installed (iOS Safari / Android Chrome). On
  // desktop, or when the app is already running installed (standalone), that
  // instruction leads nowhere — so guard it and just confirm the icon is set.
  const canAddToHomeScreen =
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(pointer: coarse)').matches &&
    !(window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true)

  function pick(s) {
    setStickerState(s)
    setSticker(traveler, s)
    applyInstallIdentity(traveler, s) // ready the icon/manifest on every pick
    setAdded(false)
  }

  function addToHomeScreen() {
    setSticker(traveler, sticker)
    applyInstallIdentity(traveler, sticker)
    setAdded(true)
  }

  return (
    <div
      data-testid="install-identity"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--bg)',
        color: 'var(--text)',
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-body)',
        overflowY: 'auto',
      }}
    >
      {/* header */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: 'calc(env(safe-area-inset-top) + 10px) 16px 10px',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Back"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text)', padding: 4, lineHeight: 0 }}
        >
          <ChevronLeft size={22} />
        </button>
        <div style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--muted)' }}>
          Your app
        </div>
      </div>

      <div style={{ padding: '4px 22px 40px' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 29, fontWeight: 600, fontStyle: a.italic ? 'italic' : 'normal', letterSpacing: '-0.01em' }}>
          {isRafa ? `Make it yours, ${name}! 📲` : `Make it yours, ${name}`}
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontStyle: isRafa ? 'normal' : 'italic', color: 'var(--muted)', marginTop: 5, lineHeight: 1.45 }}>
          You all share the trip suitcase. This is the front door that's just{' '}
          <span style={{ color: 'var(--accent-text)' }}>yours</span> — opens straight to {a.opensTo}.
        </div>

        {/* live preview of YOUR icon */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '26px 0 4px' }}>
          <AppIcon id={traveler} size={108} emblem={sticker} />
          <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 10, fontWeight: 500 }}>{a.app}</div>
          <div style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: 8.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginTop: 3 }}>
            {you}'s home screen
          </div>
        </div>

        {/* pick your sticker */}
        <div style={{ marginTop: 22 }}>
          <div style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, marginBottom: 11 }}>
            {isRafa ? 'Pick your sticker! ⭐' : 'Pick your sticker'}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {a.stickers.map((s) => {
              const on = sticker === s
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => pick(s)}
                  aria-pressed={on}
                  aria-label={`Sticker ${s}`}
                  style={{
                    flex: 1,
                    aspectRatio: 1,
                    borderRadius: 16,
                    cursor: 'pointer',
                    border: `2px solid ${on ? 'var(--accent)' : 'var(--line-bold, var(--border))'}`,
                    background: on ? 'var(--bg2)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 28,
                    transition: 'all .15s',
                    transform: on ? 'scale(1.04)' : 'none',
                  }}
                >
                  {s}
                </button>
              )
            })}
          </div>
        </div>

        {!added ? (
          <button
            type="button"
            onClick={addToHomeScreen}
            style={{
              width: '100%',
              marginTop: 22,
              padding: 15,
              borderRadius: 999,
              border: 'none',
              cursor: 'pointer',
              background: 'var(--accent)',
              color: 'var(--accent-ink)',
              fontWeight: 600,
              fontSize: 15,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <Plus size={16} /> Add to Home Screen
          </button>
        ) : (
          <div
            style={{
              marginTop: 22,
              padding: 15,
              borderRadius: 16,
              background: 'var(--bg2)',
              display: 'flex',
              alignItems: 'center',
              gap: 9,
            }}
          >
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--good, var(--accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Check size={15} color="#fff" />
            </div>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontStyle: isRafa ? 'normal' : 'italic', color: 'var(--text)', lineHeight: 1.4 }}>
              Your {sticker} is set.{canAddToHomeScreen ? <> Finish in your browser's Share menu → <b>Add to Home Screen</b>.</> : ''}
            </span>
          </div>
        )}

        {/* the rest of the family — read-only */}
        <div style={{ marginTop: 30 }}>
          <div style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, marginBottom: 14 }}>
            The rest of the family
          </div>
          <div style={{ display: 'flex', gap: 18 }}>
            {others.map((id) => (
              <div key={id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <AppIcon id={id} size={52} emblem={getSticker(id)} />
                <div style={{ fontSize: 10.5, color: 'var(--muted)', textAlign: 'center' }}>{familyLabel(id, traveler)}</div>
              </div>
            ))}
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontStyle: isRafa ? 'normal' : 'italic', color: 'var(--muted)', marginTop: 16, lineHeight: 1.45 }}>
            Each of them made their own, the same way. Same trips underneath — four front doors.
          </div>
        </div>
      </div>
    </div>
  )
}
