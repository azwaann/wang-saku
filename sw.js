// Service worker ringkas: apps boleh dibuka dengan pantas walaupun internet perlahan.
// Strategi "rangkaian dahulu" supaya kemas kini sentiasa sampai; cache hanya sebagai sandaran.
const CACHE = 'wang-saku-v1';
const FAIL = ['./', './index.html', './admin.html', './style.css', './admin.css', './common.js', './app.js', './admin.js',
  './config.js', './manifest.json', './icons/icon-192.png', './icons/icon-180.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FAIL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // panggilan ke server Google tidak disentuh
  e.respondWith(
    fetch(e.request).then(res => {
      const salin = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, salin)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request))
  );
});
