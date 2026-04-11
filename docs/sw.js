// Service worker for the React rebuild. Network-first for HTML so builds
// propagate, cache-first for hashed assets and the manifest. Cache name is
// versioned so activating a new worker clears the previous generation.
const CACHE_NAME = 'jackson-trip-react-v3';
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
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
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

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // Fonts: cache-first with background update
  if (req.url.includes('fonts.googleapis') || req.url.includes('fonts.gstatic')) {
    e.respondWith(
      caches.open(CACHE_NAME).then((c) =>
        c.match(req).then((r) =>
          r ||
          fetch(req).then((res) => {
            c.put(req, res.clone());
            return res;
          })
        )
      )
    );
    return;
  }

  // HTML documents: network-first so the latest build reaches phones
  if (isHtml(req)) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // Everything else (hashed JS/CSS, images, manifest): cache-first
  e.respondWith(
    caches.match(req).then((r) => r || fetch(req).catch(() => caches.match('./index.html')))
  );
});
