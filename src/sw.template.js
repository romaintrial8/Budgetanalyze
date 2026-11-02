// Service worker de BudgetAnalyze : l'application s'ouvre et fonctionne hors ligne (lecteur PDF compris).
const VERSION = '__VERSION__';
const SHELL = 'ba-shell-' + VERSION;
const RUNTIME = 'ba-runtime';
const FILES = __FILES__;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('ba-shell-') && k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // polices Google et SDK Firebase : en cache après le premier chargement
  if (url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com' || url.host === 'www.gstatic.com') {
    e.respondWith(caches.open(RUNTIME).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((r) => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return; // taux de change, Firebase : toujours en direct
  if (req.mode === 'navigate') {
    // page servie tout de suite depuis le cache (démarrage instantané) et mise à jour en arrière-plan
    e.respondWith(caches.match('./').then((hit) => {
      const net = fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(SHELL).then((c) => c.put('./', copy)); } return r; });
      if (hit) { e.waitUntil(net.catch(() => undefined)); return hit; }
      return net;
    }));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
