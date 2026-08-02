const CACHE = 'quadro-v1.2.1';

const ARQUIVOS_OFFLINE = [
  '/index.html',
  '/index.css',
  '/index.js',
  '/manifest.json',
  '/icons/notificacao-192.png'
];

async function fecharNotificacoesExibidas(atividadeId = null) {
  if (typeof self.registration.getNotifications !== 'function') return;

  const notificacoes = await self.registration.getNotifications();

  notificacoes.forEach(notificacao => {
    const idNotificacao = String(notificacao.data?.atividadeId || '');
    if (atividadeId === null || idNotificacao === String(atividadeId)) {
      notificacao.close();
    }
  });
}

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

      await fecharNotificacoesExibidas();

      await self.clients.claim();
    })()
  );
});

self.addEventListener('push', event => {
  let dados = {};

  try {
    dados = event.data ? event.data.json() : {};
  } catch (_) {
    dados = {
      title: 'Quadro Digital',
      body: event.data ? event.data.text() : '',
    };
  }

  const title = dados.title || 'Quadro Digital';
  const options = {
    body: dados.body || '',
    icon: dados.icon || '/icons/notificacao-192.png',
    tag: dados.tag,
    data: dados.data || {},
  };

  event.waitUntil((async () => {
    const atividadeId = String(options.data.atividadeId || '');

    if (atividadeId) {
      await fecharNotificacoesExibidas(atividadeId);
    }

    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const dados = event.notification.data || {};
  const atividadeId = String(dados.atividadeId || '');
  const salaId = Number(dados.salaId);
  const destinoValido = Boolean(
    atividadeId && Number.isInteger(salaId) && salaId > 0
  );
  let destino = new URL('/', self.location.origin).href;

  if (destinoValido) {
    try {
      destino = new URL(dados.url || '/', self.location.origin).href;
    } catch (_) {}
  }

  event.waitUntil((async () => {
    try {
      if (atividadeId) await fecharNotificacoesExibidas(atividadeId);

      const janelas = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      const janelaDoSite = janelas.find(janela => {
        return new URL(janela.url).origin === self.location.origin;
      });

      if (janelaDoSite) {
        await janelaDoSite.focus();

        if (destinoValido) {
          janelaDoSite.postMessage({
            type: 'abrir-atividade',
            atividadeId,
            salaId,
          });
        } else {
          janelaDoSite.postMessage({ type: 'abrir-calendario' });
        }

        return;
      }

      await self.clients.openWindow(destino);
    } catch (_) {
      await self.clients.openWindow(new URL('/', self.location.origin).href);
    }
  })());
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
          } else if (requisicao.mode === 'navigate') {
            const paginaInicial = await caches.match('/index.html');
            if (paginaInicial) return paginaInicial;
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
