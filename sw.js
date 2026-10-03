// Service worker : fonctionnement hors-ligne.
// Incrémente VERSION à chaque mise à jour de l'application pour forcer le rafraîchissement du cache.
const VERSION = 'v9';
const CACHE = `prepa-marathon-${VERSION}`;
const SHELL = ['./', 'index.html', 'styles.css', 'manifest.webmanifest', 'app.js', 'icons/logo.png', 'icons/icon-192.png', 'icons/icon-512.png'];

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
  // Réseau d'abord pour les pages et scripts (mises à jour rapides), cache en secours ; cache d'abord pour les polices.
  if (isFont) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })));
    return;
  }
  e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })
    .catch(() => caches.match(req).then(hit => hit || caches.match('index.html'))));
});
