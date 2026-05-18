const CACHE = 'quadro-v2';
const STATIC = [
  '/',
  '/index.html',
  '/index.css',
  '/index.js',
  '/manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Requisições de API sempre vão pra rede
  if (e.request.url.includes('/api/')) {
    e.respondWith(fetch(e.request));
    return;
  }
  // Resto: cache first, fallback pra rede
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
