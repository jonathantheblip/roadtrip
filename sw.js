const CACHE_NAME = 'jackson-trip-v2';
const URLS_TO_CACHE = ['./', './index.html', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(URLS_TO_CACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});

function isHtmlRequest(req) {
  if (req.mode === 'navigate') return true;
  const accept = req.headers.get('accept') || '';
  if (accept.includes('text/html')) return true;
  const url = new URL(req.url);
  if (url.pathname.endsWith('/') || url.pathname.endsWith('.html')) return true;
  return false;
}

self.addEventListener('fetch', e => {
  const req = e.request;

  // Fonts: cache-first
  if (req.url.includes('fonts.googleapis') || req.url.includes('fonts.gstatic')) {
    e.respondWith(
      caches.open(CACHE_NAME).then(c =>
        c.match(req).then(r => r || fetch(req).then(res => { c.put(req, res.clone()); return res; }))
      )
    );
    return;
  }

  // HTML: network-first so fixes actually propagate
  if (isHtmlRequest(req)) {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // Everything else: cache-first with network fallback
  e.respondWith(caches.match(req).then(r => r || fetch(req).catch(() => caches.match('./index.html'))));
});
