// Guarda el catálogo para que funcione sin internet en la ruta.
const C = 'dsj-catalogo-v69';
const BASE = ['./', 'index.html', 'pedidos.html', 'comun.js', 'config.js', 'productos.js', 'print.css', 'precios.html', 'firmar.html', 'panel.html', 'imprimir.html', 'manifest.json', 'logo.jpg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(BASE))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;   // servidor de Google: siempre directo
  if (u.pathname.endsWith('.csv')) return;
  if (/\.(jpe?g|png|svg)$/i.test(u.pathname)) { e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(n => { const cp = n.clone(); caches.open(C).then(c => c.put(e.request, cp)); return n; }))); return; }
  e.respondWith(fetch(e.request).then(n => { const cp = n.clone(); caches.open(C).then(c => c.put(e.request, cp)); return n; }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
