// Per-person home-screen app identity (design handoff system.jsx APP_IDENTITY).
// Each family member gets THEIR own installed app: their name, gradient
// color, a default glyph, and a set of stickers they can pick from as the
// home-screen icon emblem. The app opens straight to their world via a
// person-baked start_url. See InstallIdentity (the picker view), AppIcon
// (the icon render), and lib/appInstall (the manifest/icon plumbing).

export const APP_IDENTITY = {
  jonathan: {
    app: 'Family Ops',
    opensTo: 'today’s plan',
    bg1: '#2A1512',
    bg2: '#140B09',
    fg: '#EC8770',
    glyph: 'J',
    font: "'Fraunces', Georgia, serif",
    italic: false,
    stickers: ['🧭', '✈️', '☕', '📋'],
  },
  helen: {
    app: 'Our Trips',
    opensTo: 'the family thread',
    bg1: '#3A9466',
    bg2: '#1F5C3C',
    fg: '#FFFFFF',
    glyph: 'H',
    font: "'Fraunces', Georgia, serif",
    italic: false,
    stickers: ['🌿', '📷', '🗺️', '🕯️'],
  },
  aurelia: {
    app: 'the roll',
    opensTo: 'your roll',
    bg1: '#241F26',
    bg2: '#0B0A0C',
    fg: '#FF3D78',
    glyph: 'a',
    font: "'Instrument Serif', Georgia, serif",
    italic: true,
    stickers: ['🎞️', '📷', '✨', '🌷'],
  },
  rafa: {
    app: 'Adventures!',
    opensTo: 'your movies',
    bg1: '#FFC247',
    bg2: '#E8552E',
    fg: '#1B1108',
    glyph: '★',
    font: "'Fredoka', system-ui, sans-serif",
    italic: false,
    stickers: ['🚛', '⭐', '🦖', '🎈'],
  },
}

const STICKER_KEY = 'rt_app_sticker_v1'

// The emblem each person picked for their home-screen icon. Defaults to
// their first sticker. Stored as a {person: emblem} map in localStorage —
// device-local (no cross-device sync in this increment; the "family
// suitcase" shows known-local picks, else each person's default).
export function getSticker(person) {
  const fallback = APP_IDENTITY[person]?.stickers[0] || '🧳'
  try {
    const map = JSON.parse(localStorage.getItem(STICKER_KEY) || '{}')
    const picked = map[person]
    // Only honor a pick that's still one of that person's options (or any
    // non-empty stored value, to allow future custom art).
    if (picked) return picked
  } catch {
    /* ignore */
  }
  return fallback
}

export function setSticker(person, emblem) {
  try {
    const map = JSON.parse(localStorage.getItem(STICKER_KEY) || '{}')
    map[person] = emblem
    localStorage.setItem(STICKER_KEY, JSON.stringify(map))
  } catch {
    /* quota / private mode — non-fatal */
  }
}
