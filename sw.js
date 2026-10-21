// Service Worker: guarda o app e o conteúdo para estudar sem internet.
// Ao alterar arquivos do app, incremente CACHE_VERSION.
const CACHE_VERSION = 'rumo-v2';
const APP_SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/styles.css',
  'js/app.js', 'js/config.js',
  'js/lib/idb.js', 'js/lib/util.js',
  'js/data/content.js', 'js/data/store.js', 'js/data/sync.js', 'js/data/remote.js',
  'js/logic/srs.js', 'js/logic/stats.js', 'js/logic/planner.js', 'js/logic/scoring.js',
  'js/views/index.js', 'js/views/common.js', 'js/views/inicio.js', 'js/views/concurso.js', 'js/views/perfis.js',
  'js/views/materias.js', 'js/views/estudar.js', 'js/views/edital.js', 'js/views/flashcards.js', 'js/views/mapas.js',
  'js/views/simulados.js', 'js/views/discursiva.js', 'js/views/progresso.js', 'js/views/plano.js', 'js/views/prioridades.js',
  'assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'assets/icons/apple-touch-icon.png',
  'data/content.json',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_VERSION).then(c => c.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // Neon Auth / Data API: sempre rede

  // Conteúdo: rede primeiro (pega correções publicadas), cache se offline.
  if (url.pathname.endsWith('/data/content.json')) {
    event.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE_VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true })));
    return;
  }

  // App: cache primeiro; guarda o que vier da rede (inclui o SDK do Neon, carregado sob demanda).
  event.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE_VERSION).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => req.mode === 'navigate' ? caches.match('index.html') : Response.error())));
});
