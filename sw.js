const CACHE_ATUAL = 'quadro-resgate-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const nomes = await caches.keys();

      await Promise.all(
        nomes.map(nome => caches.delete(nome))
      );

      await self.clients.claim();

      const abas = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      });

      for (const aba of abas) {
        aba.navigate(aba.url);
      }
    })()
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request, {
      cache: 'no-store'
    }).catch(() => Response.error())
  );
});