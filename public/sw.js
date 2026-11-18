const VERSION = 'veeduria-v5';
const ARCHIVOS = [
  '/',
  '/index.html',
  '/css/estilos.css',
  '/js/app.js',
  '/js/api.js',
  '/js/almacen.js',
  '/manifest.webmanifest',
  '/iconos/icono-192.png',
  '/iconos/icono-512.png',
  '/js/iconos.js',
  '/iconos/arbol.svg',
  '/fuentes/archivo-latin-wdth-normal.woff2',
  '/fuentes/atkinson-hyperlegible-latin-400-normal.woff2',
  '/fuentes/atkinson-hyperlegible-latin-700-normal.woff2',
  '/fuentes/ibm-plex-mono-latin-400-normal.woff2'
];

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches.keys()
      .then(claves => Promise.all(claves.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// La API no pasa por aquí: sus datos los maneja la app con IndexedDB.
// Para la interfaz se usa red primero y, si no hay, la copia en caché.
self.addEventListener('fetch', ev => {
  const url = new URL(ev.request.url);
  if (ev.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname === '/qr.png') return;

  ev.respondWith(
    fetch(ev.request)
      .then(resp => {
        const copia = resp.clone();
        caches.open(VERSION).then(c => c.put(ev.request, copia));
        return resp;
      })
      .catch(() => caches.match(ev.request).then(r => r || caches.match('/index.html')))
  );
});
