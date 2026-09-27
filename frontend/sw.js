// Solo da una pantalla de "Sin conexión" al navegar sin internet. No guarda en
// caché la app ni la API: siempre se carga la última versión publicada y
// ningún dato clínico queda almacenado en el dispositivo.
const CACHE = 'saludxpert-offline-v1';
const PRECACHE = ['offline.html', 'assets/brand/saludxpert-mark.png'];
const PRECACHE_URLS = PRECACHE.map(ruta => new URL(ruta, self.location).href);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(claves => Promise.all(claves.filter(c => c !== CACHE).map(c => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(PRECACHE_URLS[0])));
    return;
  }

  if (PRECACHE_URLS.includes(request.url)) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
  }
});
