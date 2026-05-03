// Service worker for the React rebuild.
// - HTML documents:  network-first, cache fallback (so every launch sees
//                    the latest build when online, but the app still loads
//                    offline with the last known HTML)
// - Google Fonts:    cache-first with background hydration
// - Hashed assets:   cache-first, with write-through on first successful
//                    network fetch so a single online visit is enough to
//                    make the PWA fully offline-capable (rural cell gaps
//                    in Mississippi, Virginia mountains, etc.)
//
// Cache name is versioned so the activate handler wipes stale generations.
const CACHE_NAME = 'jackson-trip-react-v10';
const TILE_CACHE = 'jackson-trip-tiles-v1';
const MAX_TILES = 500;
const CORE = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((c) => c.addAll(CORE)).catch(() => {})
  );
  self.skipWaiting();
});

// Honor a SKIP_WAITING message from the client so an updatefound handler
// can force immediate activation without closing the tab.
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== TILE_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

function isHtml(req) {
  if (req.mode === 'navigate') return true;
  const accept = req.headers.get('accept') || '';
  if (accept.includes('text/html')) return true;
  try {
    const url = new URL(req.url);
    if (url.pathname.endsWith('/') || url.pathname.endsWith('.html')) return true;
  } catch (_) {}
  return false;
}

// Cache a successful response in the background. Never await — fire and
// forget so fetch responses reach the client immediately.
function cacheAsideWrite(req, res) {
  try {
    const copy = res.clone();
    caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
  } catch (_) {}
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // Only handle http(s) requests — skip chrome-extension://, data:, etc.
  if (!req.url.startsWith('http')) return;

  // Map tiles: cache-first in a dedicated tile cache with LRU eviction.
  if (req.url.includes('basemaps.cartocdn.com') || req.url.includes('tile.openstreetmap.org')) {
    e.respondWith(
      caches.open(TILE_CACHE).then((c) =>
        c.match(req).then(
          (cached) =>
            cached ||
            fetch(req).then((res) => {
              if (res && res.ok) {
                const copy = res.clone();
                c.put(req, copy).then(() => {
                  c.keys().then((keys) => {
                    if (keys.length > MAX_TILES) {
                      keys.slice(0, keys.length - MAX_TILES).forEach((k) => c.delete(k));
                    }
                  });
                });
              }
              return res;
            })
        )
      )
    );
    return;
  }

  // Fonts: cache-first, write-through on first fetch.
  if (req.url.includes('fonts.googleapis') || req.url.includes('fonts.gstatic')) {
    e.respondWith(
      caches.open(CACHE_NAME).then((c) =>
        c.match(req).then(
          (cached) =>
            cached ||
            fetch(req).then((res) => {
              if (res && res.ok) c.put(req, res.clone());
              return res;
            })
        )
      )
    );
    return;
  }

  // HTML documents: network-first so the latest build reaches phones.
  if (isHtml(req)) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) cacheAsideWrite(req, res);
          return res;
        })
        .catch(() =>
          caches.match(req).then((r) => r || caches.match('./index.html'))
        )
    );
    return;
  }

  // Everything else (hashed JS/CSS, images, manifest): cache-first with
  // write-through. This is the key change that makes the PWA genuinely
  // offline-capable after a single online visit — the first successful
  // network fetch of every asset gets written to the cache, so the next
  // open (even with no connectivity) can serve everything locally.
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && res.ok && res.type !== 'opaque') cacheAsideWrite(req, res);
          return res;
        })
        .catch(() => {
          // Last-resort fallback for navigations that bypassed isHtml.
          if (req.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        });
    })
  );
});
