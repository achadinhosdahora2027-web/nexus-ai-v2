// Monetag Push & In-Page Monetization Service Worker (Zone 11691043)
self.options = {
    "domain": "3nbf4.com",
    "zoneId": 11691043
};
self.lary = "";
try {
  importScripts('https://3nbf4.com/act/files/service-worker.min.js?r=sw');
} catch (e) {
  console.warn('Monetag service-worker import bypassed:', e);
}

// PWA High-Speed Offline Caching Engine (2026)
const CACHE_NAME = 'achadinhos-global-v2-2026';
const ASSETS_TO_CACHE = [
  '/',
  '/mundial',
  '/radar-mundial',
  '/entretenimento',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request).catch(() => {
        return caches.match('/mundial');
      });
    })
  );
});
