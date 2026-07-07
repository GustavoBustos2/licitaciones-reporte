/* Radar MP — service worker (red-primero, para que los deploys se vean siempre).
   Estrategia: intenta la red; si falla (offline) usa la caché. Así nunca se queda
   pegado en una versión vieja tras una actualización. */
const CACHE = 'radar-mp-v14';
const SHELL = ['./index.html', './app.js', './manifest.webmanifest', './icon.svg',
               './icon-192.png', './icon-512.png', './terminos.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== location.origin) return;   // no interceptar terceros (CDN, etc.)
  // RED PRIMERO: siempre lo último cuando hay conexión; caché solo como respaldo offline.
  e.respondWith(
    fetch(req).then(res => {
      const copia = res.clone();
      caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {});
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
