// Service worker : fonctionnement hors-ligne.
// Incrémente VERSION à chaque mise à jour de l'application pour forcer le rafraîchissement du cache.
const VERSION = 'v15';
const CACHE = `prepa-marathon-${VERSION}`;
const SHELL = ['./', 'index.html', 'styles.css', 'manifest.webmanifest', 'app.js', 'icons/logo.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'fonts/Barlow-Regular.woff2', 'fonts/Barlow-Medium.woff2', 'fonts/Barlow-SemiBold.woff2', 'fonts/BarlowCondensed-Bold.woff2', 'fonts/BarlowCondensed-ExtraBold.woff2', 'fonts/BarlowCondensed-Black.woff2'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !isFont) return;
  // Réseau d'abord (revalidation forcée : GitHub Pages met les fichiers en cache 10 minutes), cache en secours hors ligne ;
  // cache d'abord pour les polices. Seules les réponses valides sont mises en cache.
  if (isFont) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })));
    return;
  }
  const net = req.mode === 'navigate' ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req, { cache: 'no-cache' });
  e.respondWith(net.then(res => { if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })
    .catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
