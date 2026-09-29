// Bump VERSION whenever you publish a new release so users get the update.
const VERSION = 'v2';
const CACHE = 'trench-safety-' + VERSION;

const APP_SHELL = [
  './',
  'index.html',
  'style.css',
  'script.js',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'apple-touch-icon.png'
];

// Same URLs as the <script> tags in index.html — cached so PDF/Word export works offline.
const CDN_LIBS = [
  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.14.0/html2pdf.bundle.min.js',
  'https://cdn.jsdelivr.net/npm/html-docx-js@0.3.1/dist/html-docx.min.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil((async function () {
    const cache = await caches.open(CACHE);
    await cache.addAll(APP_SHELL);
    // A failed CDN download must not block installation; it is retried on later visits.
    await Promise.all(CDN_LIBS.map(function (url) {
      return fetch(url, { mode: 'cors' })
        .then(function (res) { if (res.ok) return cache.put(url, res); })
        .catch(function () {});
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    const keys = await caches.keys();
    await Promise.all(keys.filter(function (k) { return k !== CACHE; })
                          .map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
  })());
});

// Cache-first for instant/offline loading, refreshed in the background when online.
self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isLib = CDN_LIBS.indexOf(req.url) !== -1;
  if (!isSameOrigin && !isLib) return;

  event.respondWith((async function () {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true, ignoreVary: true });

    const network = fetch(req).then(function (res) {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }).catch(function () { return null; });

    if (cached) { event.waitUntil(network); return cached; }

    const res = await network;
    if (res) return res;
    if (req.mode === 'navigate') {
      const fallback = await cache.match('index.html');
      if (fallback) return fallback;
    }
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  })());
});
