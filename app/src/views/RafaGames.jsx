import { useState, useRef, useEffect } from 'react'
import { Play, Mic, X, ChevronLeft, Check, ArrowRight, Square, Sparkles } from 'lucide-react'
import { RAFA_GAMES, gameSrc, loadMadeGames, saveMadeGames, generateGame, transcribeAudio } from '../lib/rafaGames'

// RafaGames — Rafa's games shelf + sandboxed player + the AI "make a game"
// maker (design_handoff games.jsx + RFind). iPad only (RafaPad overlay). Every
// game runs in a STRICT origin-isolated iframe (sandbox="allow-scripts", no
// allow-same-origin) so it can never touch the app's data — the core safety
// boundary for both Rafa's real games and freshly AI-generated ones.

const FREDOKA = "'Fredoka', 'Inter Tight', system-ui, sans-serif"
const ST = ['#FFB12E', '#3DA5E0', '#4CC36E', '#FF6B4D', '#C77DFF']
const CANDY_INK = '#1B1108'
const PAL = { bg: '#1B1108', bg2: '#28190C', surface: '#33200F', ink: '#FFF3DF', muted: 'rgba(255,243,223,0.74)', accent: '#FFB12E', accentText: '#FFC247', accentInk: '#1B1108', good: '#4CC36E', live: '#FF6B4D', lineBold: 'rgba(255,243,223,0.30)' }

export function RafaGames({ onClose }) {
  const c = PAL
  const [made, setMade] = useState(loadMadeGames)
  const [playing, setPlaying] = useState(null)
  const [gen, setGen] = useState(false) // false | true | <game to remix>
  const [findOpen, setFindOpen] = useState(false)

  const builtins = [{ id: 'findme', title: 'Find Me!', emoji: '👦', tint: ST[1], builtin: 'find' }]
  const games = [...builtins, ...RAFA_GAMES, ...made]

  function addGame(g) {
    const next = [...made, g]
    setMade(next)
    saveMadeGames(next)
    setPlaying(g)
  }

  return (
    <div data-testid="rafa-games" style={{ position: 'fixed', inset: 0, zIndex: 55, background: `radial-gradient(120% 90% at 50% 8%, ${shade(c.bg, 16)}, ${c.bg})`, display: 'flex', flexDirection: 'column', fontFamily: FREDOKA }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'calc(env(safe-area-inset-top) + 18px) 30px 6px' }}>
        <div style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 36, color: c.ink }}>My games! 🎮</div>
        <button onClick={onClose} aria-label="Close" style={circBtn(c)}><X size={28} color={c.ink} /></button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '14px 30px calc(env(safe-area-inset-bottom) + 30px)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {games.map((g, i) => {
            const tint = g.tint || ST[i % ST.length]
            const emo = g.emoji || '🎮'
            return (
              <button key={g.id} onClick={() => (g.builtin === 'find' ? setFindOpen(true) : setPlaying(g))} style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' }}>
                <div style={{ position: 'relative', aspectRatio: 1, borderRadius: 32, overflow: 'hidden', background: `radial-gradient(120% 120% at 50% 25%, ${shade(tint, 14)}, ${shade(tint, -30)})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 9px 0 ${shade(tint, -48)}` }}>
                  <span style={{ fontSize: 92 }}>{emo}</span>
                  <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', width: 54, height: 54, borderRadius: '50%', background: 'rgba(255,255,255,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Play size={26} color={tint} fill={tint} /></div>
                  {g.html && <div style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(0,0,0,0.45)', borderRadius: 999, padding: '4px 10px', fontFamily: FREDOKA, fontWeight: 600, fontSize: 12, color: '#fff', display: 'flex', alignItems: 'center', gap: 4 }}>NEW <Sparkles size={12} color="#fff" /></div>}
                </div>
                <div style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 20, color: c.ink, textAlign: 'center', marginTop: 10 }}>{g.title}</div>
              </button>
            )
          })}
          {/* the maker tile */}
          <button data-testid="rafa-make-game" onClick={() => setGen(true)} style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' }}>
            <div style={{ position: 'relative', aspectRatio: 1, borderRadius: 32, border: `4px dashed ${c.lineBold}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <div style={{ width: 76, height: 76, borderRadius: '50%', background: ST[3], display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 6px 0 ${shade(ST[3], -45)}` }}><Mic size={38} color={CANDY_INK} strokeWidth={2.2} /></div>
              <div style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 18, color: c.muted }}>Make a game!</div>
            </div>
            <div style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 20, color: c.ink, textAlign: 'center', marginTop: 10 }}>Tell Claude</div>
          </button>
        </div>
        <div style={{ fontFamily: FREDOKA, fontWeight: 500, fontSize: 16, color: c.muted, textAlign: 'center', marginTop: 24 }}>Tap a game to play. Tap the microphone to dream up a new one.</div>
      </div>

      {playing && <GamePlayer game={playing} onClose={() => setPlaying(null)} onRemix={() => { setGen(playing); setPlaying(null) }} />}
      {findOpen && <FindMe onClose={() => setFindOpen(false)} />}
      {gen && <GameGenerator base={typeof gen === 'object' ? gen : null} onClose={() => setGen(false)} onMade={(g) => { setGen(false); addGame(g) }} />}
    </div>
  )
}

function GamePlayer({ game, onClose, onRemix }) {
  const c = PAL
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 60, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'calc(env(safe-area-inset-top) + 10px) 22px 12px', background: c.bg, fontFamily: FREDOKA }}>
        <div style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 24, color: c.ink }}>{game.title}</div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={onRemix} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 50, padding: '0 18px', borderRadius: 999, background: c.surface, border: 'none', cursor: 'pointer', color: c.ink, fontFamily: FREDOKA, fontWeight: 700, fontSize: 16, boxShadow: `0 4px 0 ${c.bg2}` }}><Mic size={18} color={c.accentText} strokeWidth={2} /> Change it</button>
          <button onClick={onClose} aria-label="Close" style={circBtn(c, 50)}><X size={26} color={c.ink} /></button>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, background: '#1B1108' }}>
        {/* STRICT sandbox: allow-scripts only → opaque origin, no access to app data. */}
        <iframe
          title={game.title}
          sandbox="allow-scripts"
          {...(game.html ? { srcDoc: game.html } : { src: gameSrc(game.id) })}
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        />
      </div>
    </div>
  )
}

// The maker UI: describe by voice (real recording → Whisper) or type → Claude
// builds it → save → play. Falls back to a canned game so it never dead-ends.
function GameGenerator({ base, onClose, onMade }) {
  const c = PAL
  const [stage, setStage] = useState('ask') // ask | recording | building | done
  const [desc, setDesc] = useState('')
  const [secs, setSecs] = useState(0)
  const [micError, setMicError] = useState(false)
  const recRef = useRef(null)
  const chunksRef = useRef([])
  const streamRef = useRef(null)

  useEffect(() => {
    if (stage !== 'recording') return
    const id = setInterval(() => setSecs((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [stage])

  useEffect(() => () => stopStream(), [])
  function stopStream() {
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop())
    } catch {
      /* ignore */
    }
    streamRef.current = null
  }

  async function startRecording() {
    setMicError(false)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []
      const rec = new MediaRecorder(stream)
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data) }
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
        stopStream()
        await build(null, blob)
      }
      recRef.current = rec
      rec.start()
      setSecs(0)
      setStage('recording')
    } catch {
      // no mic / denied → fall back to typing
      setMicError(true)
      stopStream()
    }
  }
  function stopRecording() {
    try {
      recRef.current?.stop()
    } catch {
      build('a fun catching game', null)
    }
    setStage('building')
  }

  async function build(typed, blob) {
    setStage('building')
    let spoken = typed
    if (!spoken && blob) spoken = await transcribeAudio(blob) // real voice → text (null on failure)
    const prompt = spoken || 'a fun catching game with colorful shapes'
    const html = await generateGame(prompt, base && base.html)
    const g = { id: 'made' + String(secs) + (made_seq++), title: titleFrom(spoken), emoji: '🎲', tint: ST[Math.floor((html.length || 0) % ST.length)], html }
    setStage('done')
    setTimeout(() => onMade(g), 900)
  }

  return (
    <div data-testid="rafa-game-maker" style={{ position: 'fixed', inset: 0, zIndex: 65, background: `radial-gradient(120% 90% at 50% 10%, ${shade(c.bg, 18)}, ${c.bg})`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, fontFamily: FREDOKA }}>
      <button onClick={onClose} aria-label="Back" style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 18px)', left: 22, ...circBtn(c, 50) }}><ChevronLeft size={26} color={c.ink} /></button>

      {stage === 'ask' && (
        <>
          <div style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 40, color: c.ink, textAlign: 'center', lineHeight: 1.15, marginBottom: 14 }}>{base ? 'How should we change it?' : 'What game should we make?'}</div>
          <div style={{ fontFamily: FREDOKA, fontWeight: 500, fontSize: 20, color: c.muted, textAlign: 'center', marginBottom: 30, maxWidth: 560 }}>Press the big button and tell Claude — like “a rocket that dodges asteroids” or “make the balls bigger.”</div>
          <button data-testid="rafa-gen-mic" onClick={startRecording} aria-label="Talk to make a game" style={{ width: 200, height: 200, borderRadius: '50%', border: 'none', cursor: 'pointer', background: ST[3], boxShadow: `0 12px 0 ${shade(ST[3], -45)}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Mic size={84} color="#fff" strokeWidth={1.8} /></button>
          {micError && <div style={{ fontFamily: FREDOKA, fontWeight: 600, fontSize: 15, color: c.accentText, marginTop: 14 }}>No microphone — type it instead 👇</div>}
          <div style={{ marginTop: 26, display: 'flex', alignItems: 'center', gap: 12 }}>
            <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="…or type it here" aria-label="Describe a game" style={{ width: 320, padding: '14px 18px', borderRadius: 999, border: `2px solid ${c.lineBold}`, background: 'transparent', color: c.ink, fontFamily: FREDOKA, fontSize: 16, outline: 'none' }} />
            <button onClick={() => build(desc.trim(), null)} disabled={!desc.trim()} style={{ height: 50, padding: '0 20px', borderRadius: 999, border: 'none', cursor: desc.trim() ? 'pointer' : 'default', background: desc.trim() ? c.accent : c.bg2, color: desc.trim() ? c.accentInk : c.muted, fontFamily: FREDOKA, fontWeight: 700, fontSize: 16 }}>Make it!</button>
          </div>
        </>
      )}

      {stage === 'recording' && (
        <>
          <div style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 36, color: c.accentText, textAlign: 'center' }}>I'm listening… 👂</div>
          <div style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 26, color: c.ink, fontWeight: 600, margin: '14px 0 30px' }}>0:{String(secs).padStart(2, '0')}</div>
          <button data-testid="rafa-gen-stop" onClick={stopRecording} aria-label="Done talking" style={{ position: 'relative', width: 200, height: 200, borderRadius: '50%', border: 'none', cursor: 'pointer', background: c.live, boxShadow: `0 12px 0 ${shade(c.live, -45)}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: 18, background: '#fff' }} />
          </button>
          <div style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 20, color: c.ink, marginTop: 28 }}>Tap the red button when you're done!</div>
        </>
      )}

      {stage === 'building' && (
        <>
          <div style={{ width: 120, height: 120, borderRadius: '50%', background: c.surface, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 60 }}>🛠️</span></div>
          <div style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 34, color: c.ink, marginTop: 24, textAlign: 'center' }}>Claude is building your game…</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>{[0, 1, 2].map((i) => <div key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: c.accent, opacity: 0.5 + 0.5 * ((i + 1) / 3) }} />)}</div>
        </>
      )}

      {stage === 'done' && (
        <>
          <div style={{ fontSize: 96 }}>🎉</div>
          <div style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 36, color: c.ink, marginTop: 10 }}>Your game is ready!</div>
        </>
      )}
    </div>
  )
}

let made_seq = 0
function titleFrom(s) {
  const w = (s || '').trim().split(/\s+/).slice(0, 2).join(' ')
  return w ? w[0].toUpperCase() + w.slice(1) : 'My Game'
}

// FindMe — a tiny "tap the one with YOU in it" game (lightweight builtin).
const FIND_ROUNDS = [
  { tiles: ['🐶', '👦', '🐱', '🦊'], answer: 1, prize: '⭐' },
  { tiles: ['👦', '🦁', '🐸', '🐵'], answer: 0, prize: '🏅' },
  { tiles: ['🐰', '🐼', '👦', '🐯'], answer: 2, prize: '🏆' },
]
function FindMe({ onClose }) {
  const c = PAL
  const [round, setRound] = useState(0)
  const [picked, setPicked] = useState(null)
  const tileColors = [ST[0], ST[1], ST[2], ST[4]]
  if (round === 'end') {
    return (
      <div style={{ position: 'fixed', inset: 0, background: `radial-gradient(120% 90% at 50% 10%, ${shade(c.bg, 18)}, ${c.bg})`, zIndex: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 30, fontFamily: FREDOKA }}>
        <div style={{ fontSize: 90 }}>🏆</div>
        <div style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 36, color: c.ink, marginTop: 10, textAlign: 'center' }}>You found you!</div>
        <div style={{ display: 'flex', gap: 14, marginTop: 24 }}>{FIND_ROUNDS.map((rr, i) => <div key={i} style={{ width: 60, height: 60, borderRadius: '50%', background: c.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, boxShadow: `0 5px 0 ${c.bg2}` }}>{rr.prize}</div>)}</div>
        <button onClick={onClose} style={{ marginTop: 36, ...candyBtn(ST[2]) }}><Check size={24} color={CANDY_INK} strokeWidth={2.6} /> Yay!</button>
      </div>
    )
  }
  const r = FIND_ROUNDS[round]
  const correct = picked === r.answer
  function next() { if (round < FIND_ROUNDS.length - 1) { setRound(round + 1); setPicked(null) } else setRound('end') }
  return (
    <div style={{ position: 'fixed', inset: 0, background: `radial-gradient(120% 90% at 50% 10%, ${shade(c.bg, 18)}, ${c.bg})`, zIndex: 60, display: 'flex', flexDirection: 'column', fontFamily: FREDOKA }}>
      <div style={{ flexShrink: 0, padding: 'calc(env(safe-area-inset-top) + 12px) 18px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={onClose} aria-label="Back" style={circBtn(c, 48)}><ChevronLeft size={24} color={c.ink} /></button>
        <div style={{ display: 'flex', gap: 7 }}>{FIND_ROUNDS.map((_, i) => <div key={i} style={{ width: 12, height: 12, borderRadius: '50%', background: i < round ? ST[2] : i === round ? ST[0] : c.bg2 }} />)}</div>
        <div style={{ width: 48 }} />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 32, color: c.ink, textAlign: 'center', marginBottom: 10 }}>Where is Rafa?</div>
        <div style={{ fontFamily: FREDOKA, fontWeight: 500, fontSize: 16, color: c.muted, marginBottom: 28 }}>Tap the picture with YOU in it! 👦</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, width: '100%', maxWidth: 320 }}>
          {r.tiles.map((emo, i) => {
            const isAns = i === r.answer
            const show = picked !== null
            return (
              <button key={i} disabled={show} onClick={() => setPicked(i)} aria-label={isAns ? 'Rafa' : 'someone else'} style={{ aspectRatio: 1, borderRadius: 28, border: 'none', cursor: show ? 'default' : 'pointer', background: show && isAns ? ST[2] : tileColors[i], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 56, position: 'relative', boxShadow: `0 7px 0 ${shade(show && isAns ? ST[2] : tileColors[i], -45)}`, opacity: show && !isAns && i !== picked ? 0.4 : 1 }}>
                {emo}
                {show && isAns && <div style={{ position: 'absolute', top: 8, right: 8, fontSize: 26 }}>✅</div>}
              </button>
            )
          })}
        </div>
        {picked !== null && (
          <div style={{ marginTop: 28, textAlign: 'center' }}>
            <div style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 26, color: correct ? c.good : c.live }}>{correct ? 'You found you! 🎉' : 'That was someone else!'}</div>
            <button onClick={correct ? next : () => setPicked(null)} style={{ marginTop: 16, ...candyBtn(correct ? ST[2] : ST[0]) }}>
              {correct ? <><ArrowRight size={24} color={CANDY_INK} strokeWidth={2.6} /> Next!</> : <><Mic size={22} color={CANDY_INK} strokeWidth={2} /> Try again</>}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function circBtn(c, sz = 56) {
  return { width: sz, height: sz, borderRadius: '50%', background: c.surface, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 5px 0 ${c.bg2}` }
}
function candyBtn(tint) {
  return { display: 'inline-flex', alignItems: 'center', gap: 8, height: 56, padding: '0 26px', borderRadius: 999, border: 'none', cursor: 'pointer', background: `radial-gradient(120% 120% at 50% 20%, ${shade(tint, 14)}, ${shade(tint, -30)})`, boxShadow: `0 7px 0 ${shade(tint, -48)}`, fontFamily: FREDOKA, fontWeight: 700, fontSize: 20, color: CANDY_INK }
}

function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16)
  let r = (n >> 16) + pct
  let g = ((n >> 8) & 0xff) + pct
  let b = (n & 0xff) + pct
  r = Math.max(0, Math.min(255, r))
  g = Math.max(0, Math.min(255, g))
  b = Math.max(0, Math.min(255, b))
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')
}
