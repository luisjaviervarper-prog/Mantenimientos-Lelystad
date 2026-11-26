// Service worker: la app funciona sin conexión una vez instalada.
// Al cambiar cualquier archivo, sube VERSION para que los móviles descarguen la nueva versión.
const VERSION = 'osmos-mant-v1.0.4';
const ARCHIVOS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/db.js', 'js/auth.js', 'js/guion.js', 'js/i18n.js', 'js/fotos.js', 'js/pdf.js', 'js/zip.js', 'js/share.js',
  'vendor/pdf-lib.min.js',
  'assets/logo-osmos.png', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'assets/icons/maskable-512.png',
  'assets/icons/apple-touch-icon.png', 'assets/icons/favicon-32.png',
  'data/instalaciones.json', 'data/defectos.json', 'data/criterios.json',
  'data/guiones/sabon-laracha-mt.json', 'data/guiones/sabon-laracha-bt.json',
  'data/guiones/lelystad-mt.json', 'data/guiones/lelystad-bt.json',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(resp => {
      if (resp.ok) { const copy = resp.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return resp;
    }).catch(() => caches.match('index.html')))
  );
});
