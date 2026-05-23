// Extract a preview image URL from a fetched HTML document.
//
// Used at build time by scripts/fetchHeroImages.mjs to populate
// `heroImage` for side activities, and intended for reuse at runtime
// by v2's Share-In flow (see CARRYOVER_SIDE_ACTIVITIES.md).
//
// Pure string-in / string-out — no DOM, no third-party HTML parser —
// because the build script runs in Node and Share-In will run in a
// Cloudflare Worker. Both want zero-dep, fast, and forgiving.
//
// Order of preference matches what real-world sites populate most
// reliably: og:image → twitter:image → og:image:url → og:image:secure_url.

const META_PATTERNS = [
  // <meta property="og:image" content="..."> (any attribute order, single or double quotes)
  /<meta\s+[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
  /<meta\s+[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i,
  // <meta name="twitter:image" content="...">
  /<meta\s+[^>]*name=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']/i,
  /<meta\s+[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image(?::src)?["']/i,
  // og:image:url and og:image:secure_url (some sites only set these)
  /<meta\s+[^>]*property=["']og:image:(?:secure_)?url["'][^>]*content=["']([^"']+)["']/i,
  /<meta\s+[^>]*content=["']([^"']+)["'][^>]*property=["']og:image:(?:secure_)?url["']/i,
]

// Strip HTML entities that commonly appear in meta content attributes
// (e.g. `&amp;` in tracking-suffixed URLs).
function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#x2F;/g, '/')
    .replace(/&#47;/g, '/')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

// Return an absolute URL given a maybe-relative `src` and the page URL
// it was found in. Falls back to the raw value if URL parsing fails.
function toAbsolute(src, pageUrl) {
  try {
    return new URL(src, pageUrl).href
  } catch (_) {
    return src
  }
}

// Public: extract a hero/preview image URL from HTML.
// Returns the absolute image URL or null if nothing usable was found.
export function extractOgImage(html, pageUrl) {
  if (typeof html !== 'string' || !html) return null
  for (const re of META_PATTERNS) {
    const m = html.match(re)
    if (m && m[1]) {
      const decoded = decodeEntities(m[1].trim())
      if (!decoded) continue
      return pageUrl ? toAbsolute(decoded, pageUrl) : decoded
    }
  }
  return null
}
