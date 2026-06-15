import { useEffect, useRef, useState } from 'react'
import { Check, Copy, ClipboardPaste, Smartphone } from 'lucide-react'
import { TRAVELERS } from '../data/travelers'
import { redeemLink, isStandalone, tokenFromInput } from '../lib/auth'

// The setup ("enroll") screen — the heart of magic-link login on this family's
// devices. It is SMART about where it's running, because of one hard iOS fact:
// an installed home-screen app and Safari have SEPARATE storage, and a texted
// link always opens in Safari. So a link tapped from a message can't directly
// log you into the home-screen app.
//
// The bridge is the system clipboard (shared between Safari and the installed
// app). So:
//   - standalone (installed app, or Android/desktop where the link opened in the
//     app) → redeem immediately, zero friction.
//   - a browser TAB with a link → DON'T auto-redeem (that would burn the one-time
//     link in the wrong place). Offer "copy code → open your app → paste", plus a
//     secondary "set me up in this browser" for people who don't use the app.
//   - 'add'/'blocked' (opened from inside the app) → a paste field + Paste button.
//
// Props: token (from ?enroll, or null), mode ('link'|'add'|'blocked'),
// traveler (the active one, for the blocked message), onDone(traveler), onCancel.

const MONO = 'var(--font-mono, ui-monospace, monospace)'

// Drop the one-time ?enroll token from the URL/history so it doesn't linger in
// the browser after we've copied it or finished (the link is single-use).
function stripEnrollParam() {
  try {
    const url = new URL(window.location.href)
    if (url.searchParams.has('enroll')) {
      url.searchParams.delete('enroll')
      window.history.replaceState(null, '', url.toString())
    }
  } catch {
    /* ignore */
  }
}

function kicker(text) {
  return (
    <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600 }}>
      {text}
    </div>
  )
}

export function Enroll({ token = null, mode, traveler, onDone, onCancel }) {
  // Derive the effective mode: a token means we're redeeming a link.
  const effMode = mode || (token ? 'link' : 'add')
  const standalone = isStandalone()

  // phase: what the screen is doing right now.
  //   'choose'  — browser tab with a link: show copy / set-up-here choice
  //   'paste'   — add/blocked: show the paste field
  //   'working' — redeeming
  //   'copied'  — copied the code, waiting for them to switch to the app
  //   'done'    — success
  //   'error'   — failed
  const [phase, setPhase] = useState(() => {
    if (effMode === 'link') return standalone ? 'working' : 'choose'
    return 'paste'
  })
  const [error, setError] = useState('')
  const [doneTraveler, setDoneTraveler] = useState(null)
  const [pasteValue, setPasteValue] = useState('')
  const [canRetryToken, setCanRetryToken] = useState(false) // link token safe to retry (pre-network fail)
  const redeemedRef = useRef(false) // one-time guard (link is single-use)

  async function doRedeem(input) {
    if (redeemedRef.current) return
    redeemedRef.current = true
    setPhase('working')
    setError('')
    try {
      const { traveler: who } = await redeemLink(input)
      setDoneTraveler(who)
      setPhase('done')
    } catch (e) {
      // Re-arm the one-time guard ONLY when the worker was never reached
      // (e.preNetwork) — then the SAME link is safe to retry. A server response
      // (invalid / used / 5xx) may have consumed it, so block a re-redeem of the
      // same token; the user pastes a fresh code instead.
      const preNet = !!e?.preNetwork
      redeemedRef.current = !preNet
      setCanRetryToken(preNet && !!token)
      setError(e?.message || 'Setup failed.')
      setPhase('error')
    }
  }

  // Standalone + a link → redeem once on mount (StrictMode-safe via the ref).
  useEffect(() => {
    if (effMode === 'link' && standalone && token && !redeemedRef.current) {
      doRedeem(token)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function copyCode() {
    const code = tokenFromInput(token) || token || ''
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      /* clipboard blocked — the visible code below is the manual fallback */
    }
    // The code is now on the clipboard for the in-app paste, so the one-time
    // token no longer needs to sit in this Safari tab's URL/history. `token` is
    // already captured in component state, so "set up in this browser" still works.
    stripEnrollParam()
    setPhase('copied')
  }

  async function pasteFromClipboard() {
    try {
      const t = await navigator.clipboard.readText()
      if (t) setPasteValue(t)
    } catch {
      /* read blocked — they can type/paste into the field manually */
    }
  }

  const name = doneTraveler ? TRAVELERS[doneTraveler]?.name || doneTraveler : ''

  return (
    <div
      data-testid="enroll"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--bg)',
        color: 'var(--text)',
        zIndex: 70,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-body)',
        overflowY: 'auto',
      }}
    >
      <div style={{ flexShrink: 0, padding: 'calc(env(safe-area-inset-top) + 16px) 22px 6px' }}>
        {kicker('Set up this device')}
      </div>

      <div style={{ padding: '8px 22px 40px', maxWidth: 520, width: '100%', margin: '0 auto' }}>
        {/* ── DONE ───────────────────────────────────────────── */}
        {phase === 'done' && (
          <div data-testid="enroll-done">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--good, var(--accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Check size={18} color="#fff" />
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 600 }}>
                {effMode === 'add' ? `${name} is all set` : `You're all set${name ? `, ${name}` : ''}!`}
              </div>
            </div>
            <div style={{ color: 'var(--muted)', marginTop: 10, lineHeight: 1.5 }}>
              {effMode === 'add' ? (
                <>This device can now sign in as <b style={{ color: 'var(--text)' }}>{name}</b> — switch to them any time from the family bar at the bottom.</>
              ) : (
                <>This device is now signed in as <b style={{ color: 'var(--text)' }}>{name}</b>. You won't need to do this again on this device.</>
              )}
            </div>
            <button type="button" onClick={() => onDone?.(doneTraveler, effMode)} style={primaryBtn()}>
              Continue
            </button>
          </div>
        )}

        {/* ── WORKING ────────────────────────────────────────── */}
        {phase === 'working' && (
          <div data-testid="enroll-working" style={{ marginTop: 12, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontSize: 18 }}>
            Setting up this device…
          </div>
        )}

        {/* ── CHOOSE (browser tab with a link) ───────────────── */}
        {phase === 'choose' && (
          <div data-testid="enroll-choose">
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 25, fontWeight: 600, letterSpacing: '-0.01em', marginTop: 6 }}>
              Almost there
            </div>
            <div style={{ color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
              If you use Roadtrip from your <b style={{ color: 'var(--text)' }}>home-screen app</b>, copy
              your code, open the app, and paste it — that finishes setup in the right place.
            </div>
            <button type="button" onClick={copyCode} style={primaryBtn()} data-testid="enroll-copy">
              <Copy size={16} /> Copy code & open my app
            </button>
            <button type="button" onClick={() => doRedeem(token)} style={secondaryBtn()} data-testid="enroll-here">
              Just set me up in this browser
            </button>
          </div>
        )}

        {/* ── COPIED (hand-off in progress) ──────────────────── */}
        {phase === 'copied' && (
          <div data-testid="enroll-copied">
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 6 }}>
              <Smartphone size={20} color="var(--accent)" />
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600 }}>Code copied</div>
            </div>
            <div style={{ color: 'var(--muted)', marginTop: 10, lineHeight: 1.55 }}>
              Now open the <b style={{ color: 'var(--text)' }}>Roadtrip</b> app on your home screen, go to{' '}
              <b style={{ color: 'var(--text)' }}>Settings → This device → Set up this device</b>, and paste.
            </div>
            <CodeBox code={tokenFromInput(token) || token || ''} />
            <button type="button" onClick={() => doRedeem(token)} style={secondaryBtn()}>
              Set me up in this browser instead
            </button>
          </div>
        )}

        {/* ── PASTE (add / blocked, inside the app) ──────────── */}
        {(phase === 'paste' || phase === 'error') && (
          <div data-testid="enroll-paste">
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 25, fontWeight: 600, letterSpacing: '-0.01em', marginTop: 6 }}>
              {effMode === 'blocked'
                ? `${TRAVELERS[traveler]?.name || 'You'}, you're not set up here yet`
                : 'Set up this device'}
            </div>
            <div style={{ color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
              {effMode === 'blocked'
                ? 'Ask Jonathan for your personal setup link, open it, copy the code, then paste it here.'
                : 'Paste a personal setup code (or link) to sign this device in.'}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <input
                data-testid="enroll-input"
                value={pasteValue}
                onChange={(e) => setPasteValue(e.target.value)}
                placeholder="Paste your setup code"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: '13px 14px',
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'var(--bg2)',
                  color: 'var(--text)',
                  fontFamily: MONO,
                  fontSize: 14,
                }}
              />
              <button type="button" onClick={pasteFromClipboard} aria-label="Paste from clipboard" style={pasteBtn()}>
                <ClipboardPaste size={18} />
              </button>
            </div>
            {phase === 'error' && (
              <div data-testid="enroll-error" style={{ color: 'var(--bad, #c0392b)', marginTop: 12, fontSize: 14, lineHeight: 1.45 }}>
                {error}
              </div>
            )}
            {/* A transient (pre-network) failure of a tapped link: the one-time
                token wasn't consumed, so offer a direct retry rather than making
                the user hunt for a fresh code. */}
            {phase === 'error' && canRetryToken && token && (
              <button type="button" onClick={() => doRedeem(token)} style={primaryBtn()} data-testid="enroll-retry">
                Try again
              </button>
            )}
            <button
              type="button"
              onClick={() => doRedeem(pasteValue)}
              disabled={!tokenFromInput(pasteValue)}
              style={canRetryToken && phase === 'error' ? secondaryBtn() : primaryBtn(!tokenFromInput(pasteValue))}
              data-testid="enroll-submit"
            >
              Set up this device
            </button>
          </div>
        )}

        {onCancel && phase !== 'working' && (
          <button type="button" onClick={onCancel} style={linkBtn()} data-testid="enroll-cancel">
            Not now
          </button>
        )}
      </div>
    </div>
  )
}

// A readonly, selectable box showing the raw code — the manual fallback if the
// clipboard API is blocked (the person can long-press to select and copy).
function CodeBox({ code }) {
  return (
    <div
      style={{
        marginTop: 16,
        padding: '12px 14px',
        borderRadius: 12,
        border: '1px dashed var(--border)',
        background: 'var(--bg2)',
        fontFamily: MONO,
        fontSize: 12.5,
        wordBreak: 'break-all',
        color: 'var(--muted)',
        userSelect: 'all',
      }}
    >
      {code}
    </div>
  )
}

function primaryBtn(disabled = false) {
  return {
    width: '100%',
    marginTop: 22,
    padding: 15,
    borderRadius: 999,
    border: 'none',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    background: 'var(--accent)',
    color: 'var(--accent-ink)',
    fontWeight: 600,
    fontSize: 15,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  }
}
function secondaryBtn() {
  return {
    width: '100%',
    marginTop: 12,
    padding: 14,
    borderRadius: 999,
    border: '1px solid var(--border)',
    cursor: 'pointer',
    background: 'transparent',
    color: 'var(--text)',
    fontWeight: 500,
    fontSize: 14,
  }
}
function pasteBtn() {
  return {
    flexShrink: 0,
    width: 48,
    borderRadius: 12,
    border: '1px solid var(--border)',
    background: 'var(--bg2)',
    color: 'var(--text)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }
}
function linkBtn() {
  return {
    width: '100%',
    marginTop: 18,
    padding: 10,
    border: 'none',
    background: 'transparent',
    color: 'var(--muted)',
    cursor: 'pointer',
    fontSize: 13,
  }
}
