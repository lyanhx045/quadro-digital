const CACHE = 'quadro-v1.1.9';

const ARQUIVOS_OFFLINE = [
  '/index.html',
  '/index.css',
  '/index.js',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(async cache => {
      for (const arquivo of ARQUIVOS_OFFLINE) {
        const resposta = await fetch(arquivo, {
          cache: 'no-store'
        });

        if (resposta.ok) {
          await cache.put(arquivo, resposta);
        }
      }
    })
  );

  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const cachesExistentes = await caches.keys();

      await Promise.all(
        cachesExistentes
          .filter(nome => nome.startsWith('quadro-') && nome !== CACHE)
          .map(nome => caches.delete(nome))
      );

      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', event => {
  const requisicao = event.request;

  if (requisicao.method !== 'GET') return;

  const url = new URL(requisicao.url);

  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  const arquivoPrincipal =
    requisicao.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    url.pathname === '/index.css' ||
    url.pathname === '/index.js';

  if (arquivoPrincipal) {
    event.respondWith(
      (async () => {
        try {
          const respostaNova = await fetch(requisicao, {
            cache: 'no-store'
          });

          if (respostaNova.ok) {
            const cache = await caches.open(CACHE);
            await cache.put(requisicao, respostaNova.clone());
          }

          return respostaNova;
        } catch {
          const respostaSalva = await caches.match(requisicao, {
            ignoreSearch: true
          });

          if (respostaSalva) return respostaSalva;

          if (requisicao.mode === 'navigate') {
            return caches.match('/index.html');
          }

          return Response.error();
        }
      })()
    );

    return;
  }

  event.respondWith(
    caches.match(requisicao).then(respostaSalva => {
      if (respostaSalva) return respostaSalva;

      return fetch(requisicao).then(async respostaNova => {
        if (respostaNova.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(requisicao, respostaNova.clone());
        }

        return respostaNova;
      });
    })
  );
});