// Theme definitions. Colors live in themes.css as CSS custom properties.
// This file holds the metadata each theme needs at the React level: display
// name, emoji policy, nav-app preference, and the header strings.

export const THEME_ORDER = ['jonathan', 'helen', 'aurelia', 'rafa']

export const THEMES = {
  jonathan: {
    key: 'jonathan',
    name: 'Jonathan',
    emoji: '',
    allowsEmoji: false,
    navApp: 'waze',
    title: 'Jackson Family Road Trip',
    subtitle: 'April 17–24, 2026 · Belmont → Texas → Home',
    themeColorMeta: '#1a1714',
  },
  helen: {
    key: 'helen',
    name: 'Helen',
    emoji: '',
    allowsEmoji: false,
    navApp: 'apple',
    title: 'Our Road Trip',
    subtitle: 'April 17–24, 2026',
    themeColorMeta: '#f5f1ec',
  },
  aurelia: {
    key: 'aurelia',
    name: 'Aurelia',
    emoji: '🏐',
    allowsEmoji: true,
    navApp: 'tiktok',
    title: 'Road Trip 🏐✨',
    subtitle: 'apr 17–24 · belmont to texas · lets gooo',
    themeColorMeta: '#fdf0f4',
  },
  rafa: {
    key: 'rafa',
    name: 'Rafa',
    emoji: '🦖',
    allowsEmoji: true,
    navApp: 'apple',
    title: 'ROAD TRIP!! 🦖🕷',
    subtitle: 'WE ARE GOING TO TEXAS!!!',
    themeColorMeta: '#0a0e1a',
  },
}

// Person tag colors are constant across themes — used for person-tag chips
// and left-border color coding on stop cards regardless of active theme.
export const PERSON_COLORS = {
  helen: '#2d8a4e',
  aurelia: '#c2185b',
  rafa: '#e65100',
  jonathan: '#1565c0',
  everyone: '#5e35b1',
}
