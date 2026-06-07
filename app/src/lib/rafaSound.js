// rafaSound.js — tiny Web Audio sound engine for Rafa's Adventure Map.
// Every sound is SYNTHESIZED at runtime: no audio files, no dependencies, works
// offline, no licensing. A distinct effect per landmark + a looping vehicle
// engine for the "Go!" drive. Ported from the design's rafa-sound.js
// (design_handoff_rafa_adventure_map) — same synthesis, as an ES module.
//
// HONEST CAVEAT: on iOS, Web Audio plays regardless of the hardware silent
// switch (it's treated as playback, not a ringer sound), so the reliable
// control is the in-app MUTE toggle — which we persist so a parent who mutes
// stays muted. Default is unmuted (Jonathan's call). Keep effects short/gentle.

let ctx = null
let muted = readMutedPref()
let engine = null
let master = null
let chosen = null

const MUTE_KEY = 'rt_rafa_sound_muted'
function readMutedPref() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

// ── TRAVEL VEHICLES ── a fleet of transport emoji, each with a matching engine
// timbre + horn. One is chosen per trip (per load), randomized with NO repeat
// inside a rolling 5-trip window (persisted in localStorage).
const VEHICLES = {
  '🚗': { type: 'sawtooth', base: 80, lp: 560, horn: [430, 520] }, // car
  '🚙': { type: 'sawtooth', base: 68, lp: 500, horn: [380, 470] }, // SUV
  '🚛': { type: 'sawtooth', base: 48, lp: 360, horn: [230, 300] }, // big rig
  '🚌': { type: 'sawtooth', base: 56, lp: 420, horn: [300, 360] }, // bus
  '🚐': { type: 'sawtooth', base: 72, lp: 520, horn: [360, 440] }, // van
  '🏎️': { type: 'sawtooth', base: 130, lp: 950, horn: [620, 760] }, // race car
  '🚕': { type: 'sawtooth', base: 82, lp: 580, horn: [460, 560] }, // taxi
  '🛻': { type: 'sawtooth', base: 58, lp: 440, horn: [300, 380] }, // pickup
  '🚓': { type: 'sawtooth', base: 78, lp: 560, horn: [700, 900] }, // police (two-tone)
  '🚂': { type: 'square', base: 60, lp: 340, horn: [330, 440] }, // train
}
const VKEYS = Object.keys(VEHICLES)
const VHIST_KEY = 'ft-rafa-vehicle' // recent picks (last 4) → no repeat within 5

function pickVehicle() {
  if (chosen) return chosen
  let hist = []
  try {
    hist = JSON.parse(localStorage.getItem(VHIST_KEY) || '[]')
  } catch {
    /* ignore */
  }
  const pool = VKEYS.filter((k) => !hist.includes(k))
  const from = pool.length ? pool : VKEYS
  chosen = from[Math.floor(Math.random() * from.length)]
  hist.push(chosen)
  while (hist.length > 4) hist.shift()
  try {
    localStorage.setItem(VHIST_KEY, JSON.stringify(hist))
  } catch {
    /* ignore */
  }
  return chosen
}

function AC() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)()
      master = ctx.createGain()
      master.gain.value = 0.9
      master.connect(ctx.destination)
    } catch {
      /* ignore */
    }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume()
  return ctx
}
function t0() {
  return ctx.currentTime
}
function out() {
  return master || ctx.destination
}

// a quick enveloped oscillator note (optional pitch glide)
function note(type, f, start, dur, vol, glideTo) {
  if (!ctx || muted) return
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.setValueAtTime(f, start)
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, start + dur)
  g.gain.setValueAtTime(0.0001, start)
  g.gain.exponentialRampToValueAtTime(vol, start + 0.015)
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  o.connect(g)
  g.connect(out())
  o.start(start)
  o.stop(start + dur + 0.03)
}
// a filtered noise burst (for whooshes / roars)
function noise(start, dur, filt, f0, f1, vol) {
  if (!ctx || muted) return
  const n = Math.floor(ctx.sampleRate * dur)
  const b = ctx.createBuffer(1, n, ctx.sampleRate)
  const d = b.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
  const src = ctx.createBufferSource()
  src.buffer = b
  const bp = ctx.createBiquadFilter()
  bp.type = filt
  bp.frequency.setValueAtTime(f0, start)
  bp.frequency.exponentialRampToValueAtTime(f1, start + dur)
  bp.Q.value = 6
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, start)
  g.gain.exponentialRampToValueAtTime(vol, start + 0.04)
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  src.connect(bp)
  bp.connect(g)
  g.connect(out())
  src.start(start)
  src.stop(start + dur)
}

export const RafaSound = {
  unlock() {
    AC()
  },
  setMuted(m) {
    muted = !!m
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
    } catch {
      /* ignore */
    }
    if (muted && engine) RafaSound.engineStop()
  },
  isMuted() {
    return muted
  },

  // per-landmark one-shots, keyed by the stop's emoji
  play(emoji) {
    if (!AC() || muted) return
    const s = t0()
    switch (emoji) {
      case '🚗':
        note('sawtooth', 90, s, 0.34, 0.14, 170)
        break // little vroom
      case '✈️':
        noise(s, 0.6, 'bandpass', 380, 2400, 0.16)
        break // jet whoosh
      case '🏠':
        note('sine', 880, s, 0.5, 0.16)
        note('sine', 1320, s + 0.12, 0.5, 0.13)
        break // doorbell ding-dong
      case '🥐':
        ;[660, 880, 1100].forEach((f, i) => note('triangle', f, s + i * 0.09, 0.3, 0.12))
        break // morning chime
      case '🏙️':
        ;[1200, 1600, 2100].forEach((f, i) => note('sine', f, s + i * 0.07, 0.22, 0.1))
        break // sparkle up
      case '🦁':
        note('sawtooth', 200, s, 0.55, 0.18, 70)
        noise(s, 0.55, 'lowpass', 700, 240, 0.12)
        break // roar
      case '🚛':
        note('sawtooth', 58, s, 0.7, 0.2, 130)
        note('square', 300, s + 0.4, 0.35, 0.1, 360)
        note('square', 360, s + 0.4, 0.35, 0.1)
        break // big rev + horn
      default:
        ;[784, 988].forEach((f, i) => note('triangle', f, s + i * 0.08, 0.3, 0.12))
    }
  },

  // two-tone "we made it!" horn (matches the chosen vehicle)
  honk() {
    if (!AC() || muted) return
    const s = t0()
    const h = VEHICLES[pickVehicle()].horn
    note('square', h[0], s, 0.18, 0.12)
    note('square', h[1], s + 0.16, 0.26, 0.12)
  },

  // looping engine for the chosen vehicle (used while driving the route)
  engineStart() {
    if (!AC() || muted || engine) return
    const s = t0()
    const v = VEHICLES[pickVehicle()]
    const o = ctx.createOscillator()
    const o2 = ctx.createOscillator()
    const lp = ctx.createBiquadFilter()
    const g = ctx.createGain()
    const lfo = ctx.createOscillator()
    const lg = ctx.createGain()
    o.type = v.type
    o.frequency.value = v.base
    o2.type = v.type
    o2.frequency.value = v.base * 1.03 // slight detune = rumble
    lp.type = 'lowpass'
    lp.frequency.value = v.lp
    lp.Q.value = 4
    g.gain.setValueAtTime(0.0001, s)
    g.gain.exponentialRampToValueAtTime(0.085, s + 0.25)
    lfo.frequency.value = 11
    lg.gain.value = v.base * 0.22
    lfo.connect(lg)
    lg.connect(o.frequency)
    lg.connect(o2.frequency) // engine wobble
    o.connect(lp)
    o2.connect(lp)
    lp.connect(g)
    g.connect(out())
    o.start(s)
    o2.start(s)
    lfo.start(s)
    engine = { o, o2, lfo, g, lp }
  },
  engineStop() {
    if (!engine || !ctx) return
    const e = engine
    const s = t0()
    e.g.gain.cancelScheduledValues(s)
    e.g.gain.setValueAtTime(e.g.gain.value, s)
    e.g.gain.exponentialRampToValueAtTime(0.0001, s + 0.25)
    ;[e.o, e.o2, e.lfo].forEach((n) => {
      try {
        n.stop(s + 0.3)
      } catch {
        /* ignore */
      }
    })
    engine = null
  },

  // the vehicle chosen for this trip (emoji) — stable per load, shared by tile + map
  vehicle() {
    return pickVehicle()
  },
}
