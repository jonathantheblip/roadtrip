// Per-person app icon — returns an SVG data URI for the given person.
// Used for apple-touch-icon and manifest icon. Also used as a fallback
// favicon. Colors stay in sync with themes.css.

const CONFIG = {
  jonathan: {
    bg: '#16102a',          // deep indigo-purple
    bgHighlight: '#241a3f', // slight upper wash
    initial: 'J',
    color: '#fdd835',       // yellow
    shadow: '#e53935',      // red halo
    font: 'Georgia, serif',
    weight: '400',
  },
  helen: {
    bg: '#f5f1ec',          // warm linen
    bgHighlight: '#fbf8f3',
    initial: 'H',
    color: '#6b8f8f',       // sage
    shadow: '#b8956a',      // brass hairline
    font: "'Playfair Display', Georgia, serif",
    weight: '400',
    italic: true,
  },
  aurelia: {
    bg: '#fdf0f4',          // blush
    bgHighlight: '#ffffff',
    initial: 'A',
    color: '#c2185b',       // deep rose
    shadow: '#e91e80',
    font: 'system-ui, -apple-system, sans-serif',
    weight: '700',
  },
  rafa: {
    bg: '#0a0e1a',          // deep space
    bgHighlight: '#141e30',
    initial: 'R',
    color: '#d32f2f',       // Spidey red
    shadow: '#1565c0',      // electric blue
    font: 'system-ui, -apple-system, sans-serif',
    weight: '900',
  },
}

/**
 * Generates a 512x512 SVG app icon for the given person and returns
 * it as a data URI suitable for <link rel="apple-touch-icon">.
 */
export function appIconDataUri(personKey) {
  const c = CONFIG[personKey] || CONFIG.jonathan

  // Radial wash from upper-left so the icon feels lit, not flat.
  // Hairline border in the shadow color for theme character.
  const italic = c.italic ? 'italic' : 'normal'
  const rawSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="wash" cx="30%" cy="25%" r="85%">
      <stop offset="0%" stop-color="${c.bgHighlight}"/>
      <stop offset="100%" stop-color="${c.bg}"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="96" ry="96" fill="url(#wash)"/>
  <rect x="4" y="4" width="504" height="504" rx="92" ry="92" fill="none" stroke="${c.shadow}" stroke-opacity="0.35" stroke-width="3"/>
  <text x="256" y="360" text-anchor="middle" font-size="320" font-family="${c.font}" font-style="${italic}" font-weight="${c.weight}" fill="${c.color}">${c.initial}</text>
</svg>`.trim()

  // URI-encode. Spaces and quotes and <> need escaping but percent-encoding
  // the whole thing is the safe path.
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(rawSvg)
}

/** Same icon but with the person's name for apple-mobile-web-app-title. */
export const PERSON_APP_TITLE = {
  jonathan: 'Road Trip',
  helen: 'Road Trip',
  aurelia: 'Road Trip',
  rafa: 'ROAD TRIP',
}
