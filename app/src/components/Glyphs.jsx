// Glyphs — the two single-ink family-trips marks (design handoff
// design-handoffs/claude-glyph/.../handoff/icons.jsx, ported verbatim).
//
//   • ClaudeGlyph — a sparkles mark (one large four-point twinkle + two small
//     ones), stroked in one ink. The friendlier "magic" glyph Jonathan picked
//     over the earlier crescent-and-spark.
//   • WeaveMark   — a real over-under three-strand braid. Replaces the old ✦
//     four-point star wherever "the Weave" surfaces.
//
// Both are drawn on a 24×24 grid in ONE ink via `currentColor`: the crescent
// fills, the spark + braid stroke. Theme the PARENT (color: var(--accent)) and
// the mark follows — no per-glyph recolor. `color` prop is a convenience that
// sets that ink locally; omit it to inherit from the surrounding text/button.
//
// Icon-in-a-labelled-button is the norm here, so the SVG is aria-hidden by
// default; pass a `title` to make it an announced standalone image instead.

const PATHS = {
  // sparkles — a large four-point twinkle (left-of-centre) + two small ones
  // (stroked, one ink). Ported from the Tabler "sparkles" mark.
  claude: (
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6z" />
      <path d="M16 6a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2z" />
      <path d="M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2z" />
    </g>
  ),
  // three-strand over-under braid (stroked); the back strand breaks at each crossing
  weave: (
    <>
      <path d="M15.30 3.20L15.26 3.49L15.14 3.79L14.94 4.08L14.67 4.37L14.33 4.67L13.94 4.96M10.06 7.31L9.67 7.60L9.33 7.89L9.06 8.19L8.86 8.48L8.74 8.77L8.70 9.07L8.74 9.36L8.86 9.65L9.06 9.95L9.33 10.24L9.67 10.53L10.06 10.83L10.50 11.12L10.98 11.41L11.48 11.71L12.00 12.00L12.52 12.29L13.02 12.59L13.50 12.88L13.94 13.17L14.33 13.47L14.67 13.76L14.94 14.05L15.14 14.35L15.26 14.64L15.30 14.93L15.26 15.23L15.14 15.52L14.94 15.81L14.67 16.11L14.33 16.40L13.94 16.69M10.06 19.04L9.67 19.33L9.33 19.63L9.06 19.92L8.86 20.21L8.74 20.51L8.70 20.80" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.35 3.20L9.92 3.49L9.55 3.79L9.23 4.08L8.99 4.37L8.81 4.67L8.72 4.96L8.70 5.25L8.77 5.55L8.92 5.84L9.14 6.13L9.44 6.43L9.79 6.72L10.20 7.01L10.66 7.31L11.15 7.60L11.66 7.89L12.17 8.19L12.69 8.48L13.18 8.77L13.65 9.07L14.08 9.36L14.45 9.65L14.77 9.95L15.01 10.24L15.19 10.53L15.28 10.83L15.30 11.12L15.23 11.41L15.08 11.71L14.86 12.00L14.56 12.29L14.21 12.59L13.80 12.88M10.35 14.93L9.92 15.23L9.55 15.52L9.23 15.81L8.99 16.11L8.81 16.40L8.72 16.69L8.70 16.99L8.77 17.28L8.92 17.57L9.14 17.87L9.44 18.16L9.79 18.45L10.20 18.75L10.66 19.04L11.15 19.33L11.66 19.63L12.17 19.92L12.69 20.21L13.18 20.51L13.65 20.80" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.35 3.20L10.82 3.49L11.31 3.79L11.83 4.08L12.34 4.37L12.85 4.67L13.34 4.96L13.80 5.25L14.21 5.55L14.56 5.84L14.86 6.13L15.08 6.43L15.23 6.72L15.30 7.01L15.28 7.31L15.19 7.60L15.01 7.89L14.77 8.19L14.45 8.48L14.08 8.77L13.65 9.07M10.20 11.12L9.79 11.41L9.44 11.71L9.14 12.00L8.92 12.29L8.77 12.59L8.70 12.88L8.72 13.17L8.81 13.47L8.99 13.76L9.23 14.05L9.55 14.35L9.92 14.64L10.35 14.93L10.82 15.23L11.31 15.52L11.83 15.81L12.34 16.11L12.85 16.40L13.34 16.69L13.80 16.99L14.21 17.28L14.56 17.57L14.86 17.87L15.08 18.16L15.23 18.45L15.30 18.75L15.28 19.04L15.19 19.33L15.01 19.63L14.77 19.92L14.45 20.21L14.08 20.51L13.65 20.80" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
}

const LABELS = { claude: 'Claude', weave: 'The Weave' }

// name: 'claude' | 'weave'. `color` sets the local ink (else inherits). `title`
// makes it a standalone announced image; default is decorative (aria-hidden).
export function Glyph({ name = 'claude', size = 24, color, title, ...rest }) {
  const a11y = title != null
    ? { role: 'img', 'aria-label': title }
    : { 'aria-hidden': 'true', focusable: 'false' }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={color ? { color } : undefined}
      {...a11y}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  )
}

export const ClaudeGlyph = (props) => <Glyph name="claude" {...props} />
export const WeaveMark = (props) => <Glyph name="weave" {...props} />

export { LABELS as GLYPH_LABELS }
export default Glyph
